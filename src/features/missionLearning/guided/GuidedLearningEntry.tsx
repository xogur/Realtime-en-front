'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getGuidedHome, getGuidedSession, GuidedApiError, saveGuidedProfile, sendGuidedCommand, startGuidedLesson } from './api';
import { isGuidedTerminal, useGuidedLearningStore } from './store';
import { LEVELS, PHASES, type GuidedAction, type GuidedHome, type GuidedLevel, type GuidedSnapshot } from './types';
import { GuidedPracticeView } from './GuidedPracticeView';
import { GuidedRecapView } from './GuidedRecapView';
import { Equalizer, guidedButton, guidedGhost, guidedPrimary, GuidedStepper, PHASE_META, stagger } from './ui';
import { useMissionGuideAudio, type SetMissionGuideAudio } from '../useMissionGuideAudio';
import { MotionConfig } from 'framer-motion';
import { ArrowLeft, ArrowRight, ChevronRight, Clock, GraduationCap, Leaf, Loader2, Lock, MessageCircle, Mountain, PlayCircle, RefreshCw, SlidersHorizontal, Sparkles, Sprout, Square, TriangleAlert, X, Zap, type LucideIcon } from 'lucide-react';
import './guided.css';
import { CONVERSATION_TOPICS } from '@/lib/conversationTopics';

const levelLabels: Record<GuidedLevel, [string, string, LucideIcon, string]> = {
  beginner: ['초급', '문장을 함께 만들어요', Sprout, 'bg-[#e7efe8] text-[#34513c]'],
  intermediate: ['중급', '이유와 질문을 이어가요', Leaf, 'bg-[#fbf1d9] text-[#9a6b1f]'],
  advanced: ['고급', '예상 밖 상황도 풀어가요', Mountain, 'bg-[#ece7f3] text-[#5b4a7a]'],
};
const phaseIndex = { DEMO: 0, REHEARSE: 1, GUIDED: 2, TRANSFER: 3, RECAP: 4 };

export function GuidedLearningEntry({ onBack, onClose, setGuideAudio }: {
  onBack: () => void; onClose: () => void; setGuideAudio?: SetMissionGuideAudio;
}) {
  const stored = useGuidedLearningStore(s => s.snapshot);
  const storeError = useGuidedLearningStore(s => s.error);
  const snapshot = isGuidedTerminal(stored) ? null : stored;
  const [home, setHome] = useState<GuidedHome | null>(null);
  const [editing, setEditing] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState('daily');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  const tts = useMissionGuideAudio({ enabled: true, snapshot, setGuideAudio });
  const cancelAudio = tts.cancel;
  const reconcileAudioIdle = tts.reconcileIdle;
  useEffect(() => { if (storeError) cancelAudio(); }, [storeError, cancelAudio]);
  useEffect(() => useGuidedLearningStore.subscribe(state => {
    if (state.snapshot?.handoff?.status === 'COMPLETE' && isGuidedTerminal(state.snapshot)) onClose();
  }), [onClose]);

  const reload = useCallback(async () => {
    const initial = useGuidedLearningStore.getState().snapshot;
    const next = await getGuidedHome();
    if (!mountedRef.current) return;
    setHome(next);
    const active = next.activeSessionId ? await getGuidedSession(next.activeSessionId) : null;
    // A push or user command that completed while home was in flight wins.
    if (useGuidedLearningStore.getState().snapshot === initial) {
      useGuidedLearningStore.getState().reconcileHome(active);
      reconcileAudioIdle(active);
    }
  }, [reconcileAudioIdle]);
  const run = useCallback(async (fn: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(null);
    try { await fn(); }
    catch (caught) {
      if (caught instanceof GuidedApiError && caught.snapshot) useGuidedLearningStore.getState().pushSnapshot(caught.snapshot);
      if (caught instanceof GuidedApiError && caught.code === 'INVALID_CONTRACT') useGuidedLearningStore.getState().setError(caught.message);
      if (mountedRef.current) setError(caught instanceof GuidedApiError ? caught.message : '연결을 확인한 뒤 다시 시도해 주세요.');
    } finally { busyRef.current = false; if (mountedRef.current) setBusy(false); }
  }, []);
  useEffect(() => {
    mountedRef.current = true;
    void reload().catch(() => {
      if (mountedRef.current) {
        setError('수업을 불러오지 못했어요. 다시 연결해 주세요.');
        useGuidedLearningStore.getState().setError('수업을 불러오지 못했어요. 다시 연결해 주세요.');
      }
    });
    return () => { mountedRef.current = false; };
  }, [reload]);
  useEffect(() => {
    if (!isGuidedTerminal(stored)) return;
    void reload().catch(() => undefined);
  }, [stored, reload]);

  const command = (action: GuidedAction, payload?: Record<string, string>) => run(async () => {
    if (useGuidedLearningStore.getState().error && action !== 'ABANDON') return;
    const requested = useGuidedLearningStore.getState().snapshot;
    if (!await tts.cancelAndWait()) return;
    let current = useGuidedLearningStore.getState().snapshot;
    const sameRequest = (value: GuidedSnapshot | null) => !!requested && value?.sessionId === requested.sessionId
      && value?.guided?.nodeId === requested.guided?.nodeId && value?.guided?.attemptId === requested.guided?.attemptId;
    if (!sameRequest(current)) { setError('수업 상황이 바뀌었어요. 현재 화면에서 다시 눌러 주세요.'); return; }
    if (current && (action === 'RETRY_NODE' || action === 'ABANDON')) {
      const refreshed = await getGuidedSession(current.sessionId);
      useGuidedLearningStore.getState().pushSnapshot(refreshed);
      current = useGuidedLearningStore.getState().snapshot;
    }
    if (!sameRequest(current) || current?.guided?.audioOwner === 'ROLE') {
      setError('수업 상황이 바뀌었어요. 현재 화면에서 다시 눌러 주세요.'); return;
    }
    if (!current || !current.allowedActions.includes(action)) return;
    const next = await sendGuidedCommand(current, action, payload);
    const accepted = useGuidedLearningStore.getState().pushSnapshot(next);
    if (!accepted && next.sessionId !== current.sessionId && ['REPLAY_LESSON', 'START_NEXT_LESSON'].includes(action)) {
      // HTTP can beat the old terminal WebSocket event. Confirm closure rather
      // than weakening the store's protection against unrelated session pushes.
      const previous = await getGuidedSession(current.sessionId);
      if (previous.sessionId === current.sessionId && isGuidedTerminal(previous)) {
        useGuidedLearningStore.getState().pushSnapshot(previous);
        useGuidedLearningStore.getState().pushSnapshot(next);
      }
    }
    if (action === 'FINISH' || action === 'ABANDON') onClose();
  });
  const play = async () => {
    let text: string | Array<{ text: string; language: string; voice?: number }> | undefined;
    await run(async () => {
    if (!await tts.cancelAndWait()) return;
    if (useGuidedLearningStore.getState().error) return;
    const current = useGuidedLearningStore.getState().snapshot;
    if (!current?.guided?.audioId || !current.allowedActions.includes('PLAY_MODEL')) return;
    const next = await sendGuidedCommand(current, 'PLAY_MODEL', { nodeId: current.guided.nodeId, audioId: current.guided.audioId });
    useGuidedLearningStore.getState().pushSnapshot(next);
    const latest = useGuidedLearningStore.getState().snapshot;
    if (!latest || latest.sessionId !== next.sessionId || latest.revision !== next.revision
      || latest.guided?.attemptId !== next.guided?.attemptId) return;
    // Read only the now-authorized projection; never keep an unrevealed model in the DOM.
    const display = next.guided?.display;
    // One voice per speaker, matching the left/right bubbles (first speaker = voice 0).
    const firstSpeaker = display?.demo?.[0]?.speaker;
    text = display?.demo?.map(line => ({ text: line.text, language: 'en-US', voice: line.speaker === firstSpeaker ? 0 : 1 })) || display?.modelEn;
    });
    if (text) void tts.speak(text);
  };
  const saveLevel = (level: GuidedLevel) => run(async () => {
    if (useGuidedLearningStore.getState().error) return;
    await saveGuidedProfile(level, home?.profile?.revision ?? 0); await reload(); setEditing(false);
  });

  const phase = snapshot?.guided ? phaseIndex[snapshot.guided.phase] : null;
  const showLevels = !!home && (!home.profile || editing);
  // Remount per screen so each step enters with motion; no exit animation keeps old content out of the DOM.
  const screenKey = storeError ? 'error' : snapshot ? `${snapshot.sessionId}:${snapshot.stage}:${snapshot.guided?.nodeId ?? ''}` : showLevels ? 'levels' : home ? 'lessons' : 'loading';
  const levelLessons = home ? home.lessons.filter(l => l.level === home.profile?.level) : [];
  const topics = CONVERSATION_TOPICS.filter(t => levelLessons.some(l => (l.topicId ?? 'daily') === t.id));
  const topic = topics.some(t => t.id === selectedTopic) ? selectedTopic : topics[0]?.id;
  const visibleLessons = levelLessons.filter(l => (l.topicId ?? 'daily') === topic);

  // Keep each topic's three situations together within the kiosk viewport.
  return <MotionConfig reducedMotion="user"><section role="dialog" aria-modal="true" aria-labelledby="guided-title" className="guided-fade-in fixed inset-0 z-[100] flex flex-col overflow-clip bg-[#f7f2ec] text-[#27221e]">
    <span aria-hidden className="guided-float-a pointer-events-none absolute -left-40 -top-40 h-[34rem] w-[34rem] rounded-full bg-[#cfe2d3]/55 blur-3xl" />
    <span aria-hidden className="guided-float-b pointer-events-none absolute -bottom-48 -right-32 h-[38rem] w-[38rem] rounded-full bg-[#f6dca8]/40 blur-3xl" />
    {busy && <span aria-hidden className="absolute inset-x-0 top-0 z-30 h-1 overflow-hidden bg-[#34513c]/10"><span className="guided-busy-bar block h-full w-1/3 rounded-full bg-gradient-to-r from-transparent via-[#4f7a5a] to-transparent" /></span>}
    <header className="relative z-10 flex shrink-0 items-center gap-6 border-b border-[#483c2d]/8 bg-white/55 px-8 py-4 backdrop-blur-md [@media(max-height:820px)]:py-3">
      <div className="flex shrink-0 items-center gap-3">
        <span aria-hidden className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#4f7a5a] to-[#2c4634] text-white shadow-[0_10px_22px_-10px_rgba(44,70,52,0.9)]"><GraduationCap className="h-6 w-6" /></span>
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#7fa287]">Learning</p>
          <h1 id="guided-title" className="text-xl font-extrabold tracking-tight">가이드형 영어 학습</h1>
        </div>
      </div>
      <div className="mx-auto min-w-0 max-w-3xl flex-1">{snapshot?.guided && !storeError && <div className="guided-rise"><GuidedStepper current={phase} /></div>}</div>
      <div className="flex shrink-0 items-center gap-2">
        {tts.isPlaying && <button className={`${guidedButton} guided-pop !rounded-full !border-[#e4b25a]/50 !bg-[#fdf6e6] !text-[#6b4a10]`} onClick={() => void tts.cancelAndWait()}><span className="text-[#d99a2b]"><Equalizer bars={4} /></span>듣기 멈추기<Square aria-hidden className="h-4 w-4 fill-current" /></button>}
        <button className={guidedGhost} disabled={busy} onClick={() => snapshot ? void command('ABANDON') : onBack()}>{snapshot ? <X aria-hidden className="h-5 w-5" /> : <ArrowLeft aria-hidden className="h-5 w-5" />}{snapshot ? '나가기' : '뒤로'}</button>
      </div>
    </header>
    <main className="relative min-h-0 flex-1 px-8 py-6 [@media(max-height:820px)]:py-4">
      {(error || storeError || tts.error) && <div role="alert" className="guided-shake absolute left-1/2 top-4 z-20 flex w-[min(44rem,calc(100%-4rem))] -translate-x-1/2 items-center gap-3 rounded-2xl bg-[#fdf1ee] p-4 shadow-[0_18px_40px_-20px_rgba(143,52,34,0.5)] ring-1 ring-[#c8553d]/20">
        <TriangleAlert aria-hidden className="h-6 w-6 shrink-0 text-[#c8553d]" />
        <p className="min-w-0 flex-1 font-semibold text-[#8f3422]">{error || storeError || tts.error}</p>
        <button className={guidedButton} disabled={busy} onClick={() => void run(async () => { await reload(); useGuidedLearningStore.getState().retryVoice(); })}><RefreshCw aria-hidden className="h-5 w-5" />다시 연결</button>
      </div>}
      <div key={screenKey} className="guided-rise mx-auto h-full max-w-[90rem]">
        {!home && !error ? <div className="flex h-full flex-col items-center justify-center gap-6">
          <p role="status" className="flex items-center gap-2 text-lg font-bold text-[#4f6b57]"><Loader2 aria-hidden className="h-6 w-6 animate-spin" />수업을 불러오고 있어요.</p>
          <div aria-hidden className="grid w-full max-w-5xl grid-cols-3 gap-5">{[0, 1, 2].map(i => <div key={i} className="guided-shimmer h-56 rounded-[1.75rem]" />)}</div>
        </div> : storeError ? <div className="flex h-full items-center justify-center"><p className="rounded-2xl bg-white/80 p-6 text-lg text-[#5f5851]">수업 연결을 확인한 뒤 다시 진행할 수 있어요.</p></div> : snapshot ? <>
          {snapshot.stage === 'BRIEF' ? <Brief snapshot={snapshot} busy={busy} onCommand={command} /> : snapshot.guided?.phase === 'RECAP' || snapshot.recap ? <GuidedRecapView snapshot={snapshot} busy={busy} onCommand={command} /> : <GuidedPracticeView snapshot={snapshot} busy={busy} onCommand={command} onPlay={play} onCoach={text => { if (!busy && !storeError) void tts.speak([{ text, language: 'ko-KR' }]); }} />}
        </> : home && showLevels ? <div className="flex h-full flex-col justify-center gap-8">
          <div className="text-center"><h2 className="text-4xl font-extrabold tracking-tight">나에게 맞는 수준</h2><p className="mt-3 text-lg text-[#6b625a]">지금 편하게 말할 수 있는 정도를 골라 주세요. 언제든 바꿀 수 있어요.</p></div>
          <div className="mx-auto grid w-full max-w-6xl grid-cols-3 gap-6">{LEVELS.map((level, i) => {
            const [name, desc, Icon, iconTone] = levelLabels[level];
            const available = home.levels.some(l => l.id === level);
            return <button key={level} aria-label={`${name} ${desc}`} style={stagger(i, 90, 80)} disabled={busy || !available} onClick={() => void saveLevel(level)}
              className={`guided-rise guided-lift group relative flex min-h-64 flex-col items-start justify-end gap-4 overflow-hidden rounded-[2rem] border-2 bg-white p-8 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#34513c] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [@media(max-height:820px)]:min-h-52 ${home.profile?.level === level ? 'border-[#34513c]' : 'border-[#483c2d]/10 hover:border-[#4f6b57]/40'}`}>
              <span aria-hidden className={`mb-auto flex h-16 w-16 items-center justify-center rounded-3xl transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110 ${iconTone}`}><Icon className="h-8 w-8" /></span>
              <span aria-hidden className="flex gap-1.5">{[0, 1, 2].map(b => <span key={b} className={`h-2 w-7 rounded-full ${b <= i ? 'bg-[#34513c]' : 'bg-[#e8e0d7]'}`} />)}</span>
              <strong className="text-3xl font-extrabold">{name}</strong>
              <span className="text-lg text-[#5f5851]">{desc}</span>
              {!available && <span className="absolute right-6 top-6 inline-flex items-center gap-1 rounded-full bg-[#f1ebe4] px-3 py-1.5 text-sm font-bold text-[#8a8077]"><Lock aria-hidden className="h-3.5 w-3.5" />준비 중</span>}
            </button>;
          })}</div>
        </div> : home ? <div className="flex h-full flex-col justify-center gap-8">
          <div className="mx-auto flex w-full max-w-6xl items-end justify-between gap-4">
            <div><p className="text-base font-bold text-[#7fa287]">오늘의 수업</p><h2 className="text-4xl font-extrabold tracking-tight">오늘 해볼 말 · {home.profile && levelLabels[home.profile.level][0]}</h2></div>
            <button className={guidedButton} disabled={busy} onClick={() => setEditing(true)}><SlidersHorizontal aria-hidden className="h-5 w-5" />수준 바꾸기</button>
          </div>
          <div role="group" aria-label="학습 주제" className="mx-auto flex w-full max-w-6xl flex-wrap gap-2">
            {topics.map(t => <button key={t.id} type="button" aria-pressed={topic === t.id} disabled={busy}
              className={topic === t.id ? `${guidedPrimary} !text-white` : guidedButton} onClick={() => setSelectedTopic(t.id)}>{t.id === 'daily' ? '기본 연습' : t.label}</button>)}
          </div>
          <div className="guided-scroll mx-auto grid min-h-0 w-full max-w-6xl grid-cols-3 gap-6 overflow-y-auto p-1">{visibleLessons.map((lesson, i) => <button key={lesson.id} style={stagger(i, 70, 80)} disabled={busy || lesson.available === false}
            className="guided-rise guided-lift group relative flex min-h-56 flex-col items-start gap-3 rounded-[2rem] border border-[#483c2d]/10 bg-white p-7 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#34513c] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [@media(max-height:820px)]:min-h-44"
            onClick={() => void run(async () => { useGuidedLearningStore.getState().pushSnapshot(await startGuidedLesson(lesson.id)); })}>
            <span aria-hidden className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#e7efe8] text-[#34513c] transition-colors duration-300 group-hover:bg-[#34513c] group-hover:text-white"><MessageCircle className="h-7 w-7" /></span>
            <span className="min-w-0 flex-1">
              <strong className="block text-2xl font-extrabold leading-snug text-[#231f1b]">{lesson.titleKo}</strong>
              {lesson.canDoKo && <p className="mt-2 text-base font-normal text-[#5f5851]">{lesson.canDoKo}</p>}
              {lesson.available === false && <p className="mt-2 text-base font-bold text-[#a0968c]">준비 중</p>}
            </span>
            <span className="flex w-full items-center justify-between">
              {lesson.targetSeconds ? <span className="inline-flex items-center gap-1 rounded-full bg-[#f4efe9] px-3 py-1 text-sm font-bold text-[#6b625a]"><Clock aria-hidden className="h-3.5 w-3.5" />약 {Math.max(1, Math.round(lesson.targetSeconds / 60))}분</span> : <span />}
              {lesson.available === false ? <Lock aria-hidden className="h-6 w-6 text-[#a0968c]" /> : <span aria-hidden className="flex h-11 w-11 items-center justify-center rounded-full bg-[#f4f8f4] text-[#34513c] transition-transform duration-200 group-hover:translate-x-1"><ChevronRight className="h-6 w-6" /></span>}
            </span>
          </button>)}</div>
          {!levelLessons.some(l => l.available !== false) && <p className="mx-auto rounded-2xl bg-[#fbf1d9] p-5 text-lg text-[#4a3510]">이 수준의 수업은 준비 중이에요. 초급에서 먼저 연습해 보세요.</p>}
        </div> : null}
      </div>
    </main>
  </section></MotionConfig>;
}

function Brief({ snapshot, busy, onCommand }: { snapshot: GuidedSnapshot; busy: boolean; onCommand: (action: GuidedAction) => void }) {
  return <div className="mx-auto flex h-full max-w-6xl flex-col justify-center gap-8 [@media(max-height:820px)]:gap-5">
    <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#2f4a37] via-[#3d5e46] to-[#5a8063] p-10 text-white shadow-[0_24px_48px_-28px_rgba(44,70,52,0.95)] [@media(max-height:820px)]:p-8">
      <span aria-hidden className="guided-float-a absolute -right-10 -top-16 h-64 w-64 rounded-full bg-white/10" />
      <span aria-hidden className="guided-float-b absolute -bottom-24 right-40 h-52 w-52 rounded-full bg-[#f3d08a]/20" />
      <span className="relative inline-flex items-center gap-1.5 rounded-full bg-white/15 px-4 py-1.5 text-base font-bold"><Sparkles aria-hidden className="h-4 w-4 text-[#f3d08a]" />{levelLabels[snapshot.level][0]}</span>
      <h2 className="relative mt-4 text-5xl font-extrabold leading-tight tracking-tight [@media(max-height:820px)]:text-4xl">{snapshot.titleKo ?? '원하는 것 부탁하기'}</h2>
      <p className="relative mt-3 max-w-2xl text-xl text-white/85">{snapshot.canDoKo ?? '내가 원하는 것을 내 말로 부탁해 봐요.'}</p>
    </div>
    <div>
      <p className="mb-3 text-base font-bold text-[#6b625a]">이렇게 진행돼요</p>
      <ol className="grid grid-cols-5 gap-4">{PHASES.map((phase, i) => {
        const meta = PHASE_META[phase]; const Icon = meta.icon;
        return <li key={phase} className="guided-rise flex flex-col items-start gap-3 rounded-3xl bg-white/90 p-5 ring-1 ring-[#483c2d]/8" style={stagger(i, 80, 120)}>
          <span aria-hidden className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#e7efe8] text-[#34513c]"><Icon className="h-5 w-5" /></span>
          <span><span className="block text-sm font-bold text-[#a0968c]">{i + 1}단계</span><span className="block text-lg font-bold leading-tight text-[#231f1b]">{meta.label}</span><span className="mt-1 block text-sm text-[#6b625a]">{meta.hint}</span></span>
        </li>;
      })}</ol>
    </div>
    <div className="flex justify-center gap-4">
      {snapshot.allowedActions.includes('START_PREP') && <button className={`${guidedPrimary} guided-rise group !min-h-16 !px-10 !text-xl`} style={stagger(0, 0, 520)} disabled={busy} onClick={() => onCommand('START_PREP')}><PlayCircle aria-hidden className="h-6 w-6" />보고 연습하기<ArrowRight aria-hidden className="h-6 w-6 transition-transform duration-200 group-hover:translate-x-1" /></button>}
      {snapshot.allowedActions.includes('SKIP_PREP') && <button className={`${guidedButton} guided-rise !min-h-16 !px-8 !text-xl`} style={stagger(0, 0, 580)} disabled={busy} onClick={() => onCommand('SKIP_PREP')}><Zap aria-hidden className="h-6 w-6" />바로 대화해보기</button>}
    </div>
  </div>;
}
