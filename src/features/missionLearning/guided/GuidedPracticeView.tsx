'use client';

import type { GuidedAction, GuidedSnapshot } from './types';
import { useEffect, useState, type ReactNode } from 'react';
import { ArrowRight, CheckCircle2, Eye, EyeOff, Flag, HeartHandshake, Info, Lightbulb, MessageCircleMore, RotateCcw, SkipForward, Sparkles, Volume2, type LucideIcon } from 'lucide-react';
import { matchesGuidedVoiceScope, useGuidedLearningStore } from './store';
import { Equalizer, guidedButton, guidedCard, guidedGhost, guidedPrimary, PHASE_META, SparkleBurst, stagger, ThinkingDots, VoiceOrb, type VoiceTone } from './ui';

export { guidedButton } from './ui';
const inputLabels = { LOCKED: '잠시 기다려 주세요.', READY: '마이크를 준비하고 있어요.', PROCESSING: '말씀을 확인하고 있어요.' };

export function GuidedPracticeView({ snapshot, busy, onCommand, onPlay, onCoach }: {
  snapshot: GuidedSnapshot; busy: boolean;
  onCommand: (action: GuidedAction, payload?: Record<string, string>) => void;
  onPlay: () => void;
  onCoach?: (text: string) => void;
}) {
  const g = snapshot.guided;
  const captureStatus = useGuidedLearningStore(s => s.captureStatus);
  const transcript = useGuidedLearningStore(s => s.partialTranscript);
  const status = captureStatus && matchesGuidedVoiceScope(snapshot, captureStatus) ? captureStatus.status : null;
  const [idle, setIdle] = useState<{ key: string; seconds: number } | null>(null);
  const idleKey = `${snapshot.sessionId}:${g?.attemptId}:${status}:${g?.inputState}:${g?.audioOwner}:${transcript}`;
  const waiting = status === 'LISTENING' && !transcript && g?.inputState === 'READY' && g.audioOwner === 'NONE';
  useEffect(() => {
    if (!waiting) return;
    const help = window.setTimeout(() => setIdle({ key: idleKey, seconds: 8 }), 8000);
    const reassurance = window.setTimeout(() => setIdle({ key: idleKey, seconds: 15 }), 15000);
    return () => { window.clearTimeout(help); window.clearTimeout(reassurance); };
  }, [idleKey, waiting]);
  if (!g) return null;
  const can = (action: GuidedAction) => snapshot.allowedActions.includes(action);
  const command = (action: GuidedAction, extra?: Record<string, string>) => onCommand(action, { nodeId: g.nodeId, ...extra });
  const retryLabel = can('RETRY_NODE') ? '다시 말해보기를 눌러 주세요.' : '도움받고 계속하거나 마무리할 수 있어요.';
  const listening = status === 'LISTENING' && (g.inputState === 'READY' || g.turnStatus === 'CAPTURING');
  // LOCKED is also the normal resting state (DEMO, finished attempt), not only a wait.
  const lockedLabel = g.phase === 'DEMO'
    ? (can('NEXT_NODE') ? '대화를 들어 보고, 준비되면 ‘내 말로 바꾸기’를 눌러 주세요.' : '대화를 들어 보세요.')
    : g.outcome ? (can('NEXT_NODE') ? '이번 시도를 확인했어요. ‘다음으로’를 눌러 계속해요.' : retryLabel)
    : g.voiceStarted === false ? '마이크를 연결하고 있어요.' : inputLabels.LOCKED;
  const statusLabel = g.recoveryReason === 'VOICE_NOT_READY' ? `마이크 또는 음성 연결을 준비하지 못했어요. 아바타 화면의 마이크 권한과 연결을 확인하고 ${retryLabel}`
    : g.recoveryReason === 'NO_SPEECH' ? `말소리가 들리지 않았어요. ${retryLabel}`
    : g.recoveryReason ? `말씀을 끝까지 인식하지 못했어요. ${retryLabel}`
    : g.audioOwner !== 'NONE' ? '먼저 듣고, 끝난 뒤 말해 보세요.'
    : status === 'ERROR' ? `마이크를 켜지 못했어요. 마이크 권한을 확인하고 ${retryLabel}`
    : status === 'STOPPED' ? `마이크가 꺼져 있어요. ${retryLabel}`
    : status === 'PREPARING' ? '마이크를 연결하고 있어요. 잠시 기다려 주세요.'
    : g.turnStatus === 'ASSESSING' ? '말씀을 확인하고 있어요.'
    : listening ? '듣고 있어요. 내 말로 말해 보세요.'
    : g.inputState === 'LOCKED' ? lockedLabel : inputLabels[g.inputState];
  const tone: VoiceTone = g.recoveryReason ? 'recovery'
    : g.audioOwner !== 'NONE' ? 'speaking'
    : status === 'ERROR' ? 'error'
    : status === 'STOPPED' ? 'stopped'
    : g.turnStatus === 'ASSESSING' || g.inputState === 'PROCESSING' ? 'thinking'
    : listening ? (transcript ? 'hearing' : 'listening')
    : g.inputState === 'LOCKED' && g.phase === 'DEMO' ? 'idle'
    : g.inputState === 'LOCKED' && g.outcome ? 'done' : 'waiting';
  const meta = PHASE_META[g.phase];
  const PhaseIcon = meta.icon;
  const d = g.display;
  const firstSpeaker = d.demo?.[0]?.speaker;
  const sentence = d.modelEn ? { label: '예문', text: d.modelEn } : d.frameEn ? { label: '문장 틀', text: d.frameEn } : null;
  const hasSupport = !!(d.demo?.length || sentence || d.cueEn || d.meaningKo || d.contentCues.length || g.choices.length);
  const showTranscript = g.phase !== 'DEMO' && g.phase !== 'RECAP';
  const live = tone === 'listening' || tone === 'hearing';

  type Action = { key: string; label: string; icon: LucideIcon; kind: 'primary' | 'secondary' | 'ghost'; onClick: () => void };
  const actions: Action[] = [];
  const hasNext = can('NEXT_NODE');
  if (can('RETRY_NODE')) actions.push({ key: 'retry', label: '다시 말해보기', icon: RotateCcw, kind: hasNext ? 'secondary' : 'primary', onClick: () => command('RETRY_NODE') });
  if (can('PLAY_MODEL')) actions.push({ key: 'play', label: g.phase === 'DEMO' ? '다시 듣기' : '예시 듣기', icon: Volume2, kind: 'secondary', onClick: onPlay });
  if (can('SHOW_SUPPORT')) actions.push({ key: 'support', label: g.phase === 'TRANSFER' ? '도움 보기' : g.supportVisible === 'NONE' || g.supportVisible === 'CUE' ? '문장 시작 보기' : '도움 더 보기', icon: Eye, kind: 'secondary',
    onClick: () => command('SHOW_SUPPORT', { support: g.supportVisible === 'NONE' || g.supportVisible === 'CUE' ? 'FRAME' : 'MODEL' }) });
  if (can('REDUCE_SUPPORT')) actions.push({ key: 'reduce', label: '도움 줄여보기', icon: EyeOff, kind: 'secondary', onClick: () => command('REDUCE_SUPPORT') });
  if (can('SKIP_NODE')) actions.push({ key: 'skip', label: '도움받고 계속', icon: SkipForward, kind: 'secondary', onClick: () => command('SKIP_NODE') });
  if (can('END_LESSON')) actions.push({ key: 'end', label: g.phase === 'TRANSFER' ? '여기까지' : '마무리', icon: Flag, kind: 'ghost', onClick: () => onCommand('END_LESSON') });
  if (hasNext) actions.push({ key: 'next', label: g.phase === 'DEMO' ? '내 말로 바꾸기' : g.phase === 'REHEARSE' ? '준비됐어요' : '다음으로', icon: ArrowRight, kind: 'primary', onClick: () => command('NEXT_NODE') });

  return <div className="flex h-full flex-col gap-5 [@media(max-height:820px)]:gap-3">
   <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,7fr)_minmax(0,5fr)] items-center gap-6">
    <div className="guided-scroll flex max-h-full min-h-0 flex-col gap-4 overflow-y-auto [@media(max-height:820px)]:gap-3">
    <div className="guided-rise space-y-2">
      <p className="inline-flex items-center gap-2 rounded-full bg-[#e7efe8] px-3 py-1 text-sm font-bold text-[#34513c]">
        <PhaseIcon aria-hidden className="h-4 w-4" />{meta.hint}
      </p>
      <h2 className="text-3xl font-extrabold leading-snug tracking-tight text-[#231f1b] [@media(max-height:820px)]:text-2xl">{g.intentKo}</h2>
    </div>

    {g.promptEn && <div className="guided-slide-left flex items-end gap-3" style={stagger(1)}>
      <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#f3d9a4] to-[#e4b25a] text-[#5a3d0c] shadow-sm"><MessageCircleMore className="h-5 w-5" /></span>
      <p className="max-w-[85%] rounded-3xl rounded-bl-md bg-white px-5 py-3 text-2xl font-medium text-[#231f1b] shadow-[0_10px_24px_-18px_rgba(72,60,45,0.6)] ring-1 ring-[#483c2d]/8">{g.promptEn}</p>
    </div>}

    {hasSupport && <section aria-label="지금 필요한 도움" className={`${guidedCard} guided-rise space-y-4 p-5 sm:p-6`} style={stagger(2)}>
      {d.demo && d.demo.length > 0 && <div className="space-y-2.5">{d.demo.map((line, i) => {
        const left = line.speaker === firstSpeaker;
        return <div key={i} className={`flex ${left ? 'guided-slide-left justify-start' : 'guided-slide-right justify-end'}`} style={stagger(i, 260, 120)}>
          <div className={`max-w-[80%] rounded-3xl px-5 py-2.5 ${left ? 'rounded-bl-md bg-[#f6f1ea]' : 'rounded-br-md bg-[#e4eee6]'}`}>
            <p className={`text-xs font-extrabold uppercase tracking-wide ${left ? 'text-[#9a6b1f]' : 'text-[#34513c]'}`}>{line.speaker}</p>
            <p className="mt-0.5 text-xl font-semibold text-[#231f1b]">{line.text}</p>
            <p className="mt-1 text-[15px] text-[#6b625a]">{line.meaningKo}</p>
          </div>
        </div>;
      })}</div>}
      {sentence && <div className="guided-pop relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#2f4a37] to-[#3f6149] px-5 py-4 text-white shadow-[0_14px_30px_-18px_rgba(44,70,52,0.9)]">
        <span aria-hidden className="absolute -right-6 -top-8 h-24 w-24 rounded-full bg-white/10" />
        <span className="text-xs font-bold uppercase tracking-wider text-white/70">{sentence.label}</span>
        <p className="relative mt-1 text-3xl font-extrabold tracking-tight">{sentence.text}</p>
      </div>}
      {d.cueEn && <div className="flex items-center gap-3 rounded-2xl bg-[#fbf1d9] px-4 py-3">
        <Lightbulb aria-hidden className="h-5 w-5 shrink-0 text-[#b9821f]" />
        <p className="text-xl font-bold text-[#4a3510]">{d.cueEn}</p>
      </div>}
      {d.meaningKo && <p className="text-base text-[#5f5851]">{d.meaningKo}</p>}
      {d.contentCues.length > 0 && <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold text-[#6b625a]">말할 재료</span>
        {d.contentCues.map((cue, i) => <span key={cue} className="guided-pop rounded-full border border-dashed border-[#4f6b57]/40 bg-[#f4f8f4] px-3 py-1 text-[15px] font-semibold text-[#34513c]" style={stagger(i, 60, 200)}>{cue}</span>)}
      </div>}
      {g.choices.length > 0 && <div className="flex flex-wrap gap-2.5" aria-label="내 문장 재료">
        {g.choices.map((choice, i) => {
          const selected = g.selectedChoiceId === choice.id;
          return <button key={choice.id} type="button" style={stagger(i, 70, 160)}
            className={`guided-rise guided-lift inline-flex min-h-12 items-center gap-2 rounded-2xl border-2 px-5 py-2.5 text-lg font-extrabold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#34513c] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 ${selected ? 'border-[#34513c] bg-[#34513c] text-white shadow-[0_10px_22px_-12px_rgba(44,70,52,0.9)]' : 'border-[#4f6b57]/20 bg-white text-[#34513c] hover:border-[#4f6b57]/50'}`}
            aria-pressed={selected} disabled={busy || !can('SELECT_CHOICE')}
            onClick={() => command('SELECT_CHOICE', { choiceId: choice.id })}>
            {selected && <CheckCircle2 aria-hidden className="guided-pop h-5 w-5" />}{choice.labelEn}
          </button>;
        })}
      </div>}
    </section>}
    </div>

    <div className="guided-scroll flex max-h-full min-h-0 flex-col gap-4 overflow-y-auto [@media(max-height:820px)]:gap-3">
    <div className={`guided-rise relative shrink-0 overflow-hidden rounded-3xl border p-5 transition-colors duration-500 ${live ? 'border-[#4f6b57]/30 bg-gradient-to-br from-[#f1f7f2] to-white' : tone === 'speaking' ? 'border-[#e4b25a]/40 bg-gradient-to-br from-[#fdf6e6] to-white' : tone === 'error' ? 'border-[#c8553d]/30 bg-[#fdf1ee]' : tone === 'recovery' ? 'border-[#e0a43a]/40 bg-[#fdf6e6]' : 'border-[#483c2d]/10 bg-white/80'}`} style={stagger(3)}>
      <div className="flex items-center gap-4">
        <VoiceOrb tone={tone} />
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
          <p role="status" className={`text-lg font-bold leading-snug ${tone === 'error' ? 'text-[#8f3422]' : 'text-[#2a2520]'}`}>{statusLabel}</p>
          {live && <Equalizer className="bg-[#4f7a5a]" active={tone === 'hearing'} />}
          {tone === 'speaking' && <Equalizer className="bg-[#d99a2b]" />}
          {tone === 'thinking' && <span className="text-[#4f6b57]"><ThinkingDots /></span>}
        </div>
      </div>
      {showTranscript && <section aria-label="실시간 음성 인식" className="mt-4 rounded-2xl bg-white/90 p-4 ring-1 ring-[#483c2d]/8">
        <p className="text-xs font-extrabold uppercase tracking-wider text-[#4f6b57]">지금 인식한 말</p>
        <p className={`mt-1 min-h-8 break-words text-xl transition-colors duration-300 ${transcript ? 'font-semibold text-[#231f1b]' : 'text-[#a0968c]'}`}>{transcript || '말하면 인식한 내용이 여기에 보여요.'}{transcript && live && <span aria-hidden className="guided-caret ml-0.5 inline-block h-6 w-[2px] translate-y-1 bg-[#34513c]" />}</p>
        {!g.outcome && <p className="mt-1 text-sm text-[#8a8077]">말하는 동안 인식한 내용은 바뀔 수 있어요.</p>}
      </section>}
    </div>

    {waiting && idle?.key === idleKey && <div key={idle.seconds} className="guided-rise flex items-center gap-3 rounded-2xl bg-[#fbf1d9] p-4 ring-1 ring-[#e4b25a]/30">
      {idle.seconds >= 15 ? <HeartHandshake aria-hidden className="h-6 w-6 shrink-0 text-[#b9821f]" /> : <Lightbulb aria-hidden className="guided-breathe h-6 w-6 shrink-0 text-[#b9821f]" />}
      <p role="status" className="font-semibold text-[#4a3510]">{idle.seconds >= 15 ? '천천히 해도 괜찮아요. 도움을 보거나 여기까지 해도 돼요.' : '막히면 도움 보기를 눌러 보세요.'}</p>
    </div>}

    {g.outcome && <Outcome key={g.attemptId} outcome={g.outcome}>
      {g.outcome.coachKo && onCoach && <button className={`${guidedButton} shrink-0 !min-h-11 !px-3 !py-2 text-[15px]`} disabled={busy || g.audioOwner !== 'NONE'} onClick={() => onCoach(g.outcome!.coachKo!)}><Volume2 aria-hidden className="h-4 w-4" />코치 설명 듣기</button>}
    </Outcome>}

    </div>
   </div>

    <div className="guided-rise flex shrink-0 items-center gap-4 rounded-[1.75rem] bg-white/75 px-5 py-4 shadow-[0_18px_40px_-30px_rgba(72,60,45,0.6)] ring-1 ring-[#483c2d]/8 backdrop-blur-md [@media(max-height:820px)]:py-3" style={stagger(4)}>
      <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
        {actions.filter(a => a.kind === 'ghost').map(a => {
          const Icon = a.icon;
          return <button key={a.key} type="button" className={`${guidedGhost} !min-h-11 !px-3 !py-2`} disabled={busy} onClick={a.onClick}><Icon aria-hidden className="h-5 w-5" />{a.label}</button>;
        })}
        <p className="flex items-center gap-1.5 px-1 text-sm text-[#8a8077]"><Info aria-hidden className="h-4 w-4 shrink-0" />버튼으로 고르거나 넘어가는 것만으로 말하기 성공이 되지는 않아요.</p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-3">
        {actions.filter(a => a.kind !== 'ghost').map((a, i) => {
          const Icon = a.icon;
          return <button key={a.key} type="button" style={stagger(i, 50, 260)}
            className={`guided-rise ${a.kind === 'primary' ? `${guidedPrimary} !min-h-14 !px-7 !text-lg` : `${guidedButton} !min-h-14`} ${a.key === 'next' ? 'group' : ''}`}
            disabled={busy} onClick={a.onClick}>
            {a.key !== 'next' && <Icon aria-hidden className="h-5 w-5" />}{a.label}{a.key === 'next' && <Icon aria-hidden className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-1" />}
          </button>;
        })}
      </div>
    </div>
  </div>;
}

type OutcomeData = NonNullable<NonNullable<GuidedSnapshot['guided']>['outcome']>;

function Outcome({ outcome: o, children }: { outcome: OutcomeData; children?: ReactNode }) {
  const attemptLabel = o.inputKind === 'TYPED' ? '글로 연습했어요.' : o.recognitionStatus === 'UNCERTAIN' ? '인식이 불확실해 수행을 확인하지 못했어요.' : o.meaningStatus === 'UNKNOWN' ? '말씀은 받았지만 뜻을 아직 확인하지 못했어요.' : o.meaningStatus === 'OFF_TOPIC' ? '지금 할 일에 맞춰 다시 말해 볼까요?' : o.recognitionStatus === 'CORRECTED' ? '인식을 보정한 시도예요.' : o.supportExposure === 'CUE' ? '힌트를 보고 말한 시도예요.' : o.supportExposure === 'NONE' ? '예문 없이 말한 시도예요.' : '도움받아 말한 시도예요.';
  // Tone only mirrors server-observed status; it never adds a new success claim.
  const doubtful = o.inputKind === 'TYPED' || o.recognitionStatus === 'UNCERTAIN' || ['UNKNOWN', 'OFF_TOPIC', 'SKIPPED'].includes(o.meaningStatus);
  const success = !doubtful && o.meaningStatus === 'MET';
  const partial = !doubtful && o.meaningStatus === 'PARTIAL';
  return <section aria-label="이번 시도" className={`guided-pop relative shrink-0 space-y-2.5 overflow-hidden rounded-3xl p-4 ring-1 ${success ? 'bg-gradient-to-br from-[#e6f1e8] to-[#f6faf6] ring-[#4f6b57]/20' : partial ? 'bg-gradient-to-br from-[#fbf1d9] to-[#fffaf0] ring-[#e4b25a]/30' : 'bg-[#f4efe9] ring-[#483c2d]/10'}`}>
    {success && <SparkleBurst />}
    <div className="flex items-center gap-3">
      <span aria-hidden className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${success ? 'bg-[#34513c] text-white' : partial ? 'bg-[#e4b25a] text-[#3f2c0a]' : 'bg-white text-[#6b625a]'}`}>
        {success ? <Sparkles className="h-5 w-5" /> : <MessageCircleMore className="h-5 w-5" />}
      </span>
      <p className={`text-sm font-bold ${success ? 'text-[#2c4634]' : 'text-[#5f5851]'}`}>{attemptLabel}</p>
    </div>
    {o.sceneResultKo && <p className="text-base font-extrabold text-[#231f1b]">{o.sceneResultKo}</p>}
    {o.said && <div className="flex justify-end"><div className="guided-slide-right max-w-[85%] rounded-3xl rounded-br-md bg-[#34513c] px-4 py-2 text-white" style={stagger(1, 0, 120)}>
      <p className="text-xs font-bold text-white/70">내가 한 말</p><p className="text-base font-semibold">“{o.said}”</p>
    </div></div>}
    {o.replyEn && <div className="flex justify-start"><p className="guided-slide-left max-w-[85%] rounded-3xl rounded-bl-md bg-white px-4 py-2 text-base text-[#231f1b] shadow-sm" style={stagger(1, 0, 320)}>{o.replyEn}</p></div>}
    {o.coachKo && <div className="guided-rise flex items-center gap-3 rounded-2xl bg-white/80 px-4 py-3" style={stagger(1, 0, 480)}>
      <Lightbulb aria-hidden className="h-5 w-5 shrink-0 text-[#b9821f]" /><p className="min-w-0 flex-1 text-[15px] leading-snug text-[#3d3530]">{o.coachKo}</p>{children}
    </div>}
  </section>;
}
