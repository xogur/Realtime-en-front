'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  ArrowLeft, CheckCircle2, Circle, Clock, Lightbulb, Loader2, MessageCircle, RotateCcw,
  Mic, Sparkles, Star, Target, Volume2, X,
} from 'lucide-react';

import { useStore } from '@/stores/useStore';

import { assessPronunciation } from './api';
import { startReadAloudRecording, type ReadAloudRecording } from './readAloudRecorder';
import { useMissionLearningStore } from './store';
import { useMissionLearning } from './useMissionLearning';
import { useMissionGuideAudio, type SetMissionGuideAudio } from './useMissionGuideAudio';
import type {
  AgeBand, FeedbackItem, LearningLevel, MissionExpression, MissionLearningHomeDetail, MissionSnapshot,
} from './types';

type LearningModeEntryProps = {
  isOpen: boolean;
  onBack: () => void;
  onClose: () => void;
  setGuideAudio?: SetMissionGuideAudio;
};

const AGE_LABELS: Record<AgeBand, { label: string; description: string }> = {
  child: { label: '초등학생', description: '친구·학교·간식 가게 상황' },
  teen: { label: '중고등학생', description: '동아리·약속·학교 행사 상황' },
  adult: { label: '성인', description: '카페·여행·모임 상황' },
  senior: { label: '시니어', description: '여행·식당·취미 모임 상황' },
};
const LEVEL_LABELS: Record<LearningLevel, { label: string; description: string }> = {
  intro: { label: '입문', description: '짧은 표현을 보고 들으며 말해요.' },
  basic: { label: '기초', description: '문장을 직접 만들어 대답해요.' },
  applied: { label: '응용', description: '질문하고 내용을 바꿔 말해요.' },
};
const BAND_LABELS: Record<FeedbackItem['band'], string> = {
  GREAT: '잘했어요', DONE: '해냈어요', PRACTICE: '연습해요', HELD: '평가 보류',
};

const primaryButton = 'inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#4f6b57] px-5 py-3 text-base font-black text-white shadow-sm transition hover:bg-[#435d4b] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f6b57] focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-55';
const secondaryButton = 'inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#483c2d]/15 bg-white px-5 py-3 text-base font-extrabold text-[#3d3530] transition hover:bg-[#f6f2ee] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f6b57] disabled:cursor-wait disabled:opacity-55';
const textButton = 'inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-bold text-[#5f5851] transition-colors hover:bg-[#eee8e2] hover:text-[#27221e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f6b57] disabled:opacity-45';
const cardClass = 'rounded-2xl border border-[#483c2d]/12 bg-white p-5 shadow-[0_6px_18px_rgba(72,60,45,0.06)]';

export function LearningModeEntry({ isOpen, onBack, onClose, setGuideAudio }: LearningModeEntryProps) {
  const reduceMotion = useReducedMotion();
  const learning = useMissionLearning(isOpen);
  const tts = useMissionGuideAudio({ enabled: isOpen, snapshot: learning.snapshot, setGuideAudio });
  const [editingProfile, setEditingProfile] = useState(false);

  if (!isOpen) return null;

  const { status, home, snapshot, busy, error } = learning;
  const speak = (text: string, slow = false) => void tts.speak(text, slow);
  const title = snapshot ? stageTitle(snapshot) : editingProfile || !home?.profile ? '나에게 맞게 시작해요' : '오늘의 Mission 고르기';

  let body: ReactNode;
  if (status === 'loading') {
    body = <p className="flex items-center gap-2 py-10 text-base font-bold text-[#4f6b57]"><Loader2 className="h-5 w-5 animate-spin" /> 학습모드를 불러오고 있어요.</p>;
  } else if (status === 'error' || !home) {
    body = (
      <div className="py-6">
        <p role="alert" className="text-base font-bold text-[#784638]">{error ?? '학습모드를 불러오지 못했어요.'}</p>
        <button type="button" className={`${secondaryButton} mt-5`} onClick={() => void learning.reload()}>
          <RotateCcw className="h-4 w-4" /> 다시 시도
        </button>
      </div>
    );
  } else if (snapshot) {
    body = <StageView snapshot={snapshot} busy={busy} onCommand={learning.command} onSpeak={speak} onRefresh={learning.refreshSession} />;
  } else if (editingProfile || !home.profile) {
    body = (
      <ProfilePicker
        home={home}
        busy={busy}
        onSave={async (ageBand, level) => {
          await learning.saveProfile(ageBand, level);
          setEditingProfile(false);
        }}
        onCancel={home.profile ? () => setEditingProfile(false) : undefined}
      />
    );
  } else {
    body = <MissionList home={home} busy={busy} onStart={learning.start} onEditProfile={() => setEditingProfile(true)} />;
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: reduceMotion ? 0 : 0.3 }}
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-[#211d1a]/60 p-3 backdrop-blur-[9px] sm:p-5"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="learning-mode-title"
        className="relative max-h-[92dvh] w-full max-w-[860px] overflow-y-auto rounded-2xl border border-white/65 bg-[#fbf8f5]/95 px-5 pb-6 pt-6 shadow-[0_28px_80px_rgba(39,32,27,0.28)] sm:px-8 sm:pb-8 sm:pt-8"
      >
        <button
          type="button"
          onClick={() => { tts.cancel(); onClose(); }}
          className="absolute right-4 top-4 z-10 flex h-11 w-11 items-center justify-center rounded-xl text-[#6b625a] transition-colors hover:bg-[#eee8e2] hover:text-[#27221e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f6b57] sm:right-6 sm:top-6"
          aria-label="학습모드 닫기"
        >
          <X className="h-5 w-5" strokeWidth={1.8} />
        </button>

        <header className="max-w-[620px] pr-12">
          <p className="text-sm font-bold text-[#4f6b57]">학습모드</p>
          <h2 id="learning-mode-title" className="mt-2 text-[1.75rem] font-black leading-tight tracking-[-0.035em] text-[#27221e] sm:text-[2.15rem]">
            {title}
          </h2>
        </header>

        <div className="mt-6">{body}</div>

        {tts.error ? <p role="alert" className="mt-4 text-sm font-bold text-[#784638]">{tts.error}</p> : null}

        {error && status === 'ready' ? (
          <p role="alert" className="mt-4 rounded-xl border border-[#b56b59]/25 bg-[#f8ebe7] px-4 py-3 text-sm font-bold text-[#784638]">{error}</p>
        ) : null}

        {!snapshot ? (
          <button type="button" onClick={() => { tts.cancel(); onBack(); }} className={`${textButton} mt-6`}>
            <ArrowLeft className="h-4 w-4" strokeWidth={1.8} /> 모드 다시 선택
          </button>
        ) : null}
      </section>
    </motion.div>
  );
}

function stageTitle(snapshot: MissionSnapshot): string {
  switch (snapshot.stage) {
    case 'BRIEF': return '오늘의 Mission';
    case 'PREP': return '말할 표현 준비하기';
    case 'ROLEPLAY': return snapshot.mission.titleKo;
    case 'FEEDBACK': return '오늘의 미션 피드백';
    case 'SUMMARY': return '오늘 배운 표현';
    default: return '학습모드';
  }
}

function ProfilePicker({ home, busy, onSave, onCancel }: {
  home: MissionLearningHomeDetail;
  busy: boolean;
  onSave: (ageBand: AgeBand, level: LearningLevel) => Promise<void>;
  onCancel?: () => void;
}) {
  const [ageBand, setAgeBand] = useState<AgeBand | null>(home.profile?.ageBand ?? null);
  const [level, setLevel] = useState<LearningLevel | null>(home.profile?.level ?? null);
  return (
    <div>
      <fieldset>
        <legend className="text-sm font-extrabold text-[#27221e]">누가 연습하나요?</legend>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {home.profileOptions.ageBands.map((band) => (
            <ChoiceButton key={band} selected={ageBand === band} onClick={() => setAgeBand(band)}
              label={AGE_LABELS[band].label} description={AGE_LABELS[band].description} />
          ))}
        </div>
      </fieldset>
      <fieldset className="mt-6">
        <legend className="text-sm font-extrabold text-[#27221e]">영어는 어느 정도인가요?</legend>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {home.profileOptions.levels.map((option) => (
            <ChoiceButton key={option} selected={level === option} onClick={() => setLevel(option)}
              label={LEVEL_LABELS[option].label} description={LEVEL_LABELS[option].description} />
          ))}
        </div>
      </fieldset>
      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" className={primaryButton} disabled={!ageBand || !level || busy}
          onClick={() => ageBand && level && void onSave(ageBand, level)}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} 미션 보러 가기
        </button>
        {onCancel ? <button type="button" className={secondaryButton} onClick={onCancel}>취소</button> : null}
      </div>
    </div>
  );
}

function ChoiceButton({ selected, onClick, label, description }: {
  selected: boolean; onClick: () => void; label: string; description: string;
}) {
  return (
    <button type="button" aria-pressed={selected} onClick={onClick}
      className={`flex min-h-[76px] items-center gap-3 rounded-2xl border px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f6b57] ${selected
        ? 'border-[#4f6b57] bg-[#edf3ee] shadow-[0_0_0_2px_rgba(79,107,87,0.25)]'
        : 'border-[#483c2d]/12 bg-white hover:bg-[#f8fbf8]'}`}>
      {selected ? <CheckCircle2 className="h-6 w-6 shrink-0 text-[#4f6b57]" /> : <Circle className="h-6 w-6 shrink-0 text-[#b9b0a7]" />}
      <span>
        <span className="block text-lg font-black text-[#27221e]">{label}</span>
        <span className="block text-sm font-medium text-[#6b625a]">{description}</span>
      </span>
    </button>
  );
}

function MissionList({ home, busy, onStart, onEditProfile }: {
  home: MissionLearningHomeDetail; busy: boolean; onStart: (missionId: string) => void; onEditProfile: () => void;
}) {
  const profile = home.profile;
  return (
    <div>
      {profile ? (
        <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-[#4f6b57]">
          <span className="rounded-full bg-[#edf3ee] px-3 py-1">{AGE_LABELS[profile.ageBand].label} · {LEVEL_LABELS[profile.level].label}</span>
          <button type="button" className={textButton} onClick={onEditProfile}>바꾸기</button>
        </div>
      ) : null}
      {home.revisitKo ? (
        <p className="mt-4 rounded-2xl bg-[#fbf3e4] px-4 py-3 text-base font-bold leading-7 text-[#6b4f2a]">{home.revisitKo}</p>
      ) : null}
      {home.missions.length === 0 ? (
        <p className="mt-4 text-base font-bold text-[#784638]">이 연령대·수준에 맞는 미션이 아직 없어요.</p>
      ) : (
        <ul className="mt-4 grid grid-cols-1 gap-3">
          {home.missions.map((mission) => {
            const recommended = mission.id === home.recommendedMissionId;
            const reason = recommended && home.recommendation?.missionId === mission.id ? home.recommendation.reasonKo : null;
            return (
              <li key={mission.id}>
                <button type="button" disabled={busy} onClick={() => onStart(mission.id)}
                  aria-label={`${mission.titleKo}${recommended ? ', 추천 미션' : ''}${mission.completed ? ', 완료함' : ''}`}
                  className={`flex w-full items-start gap-4 rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f6b57] disabled:cursor-wait disabled:opacity-60 ${recommended
                    ? 'border-[#738978]/40 bg-[#f0f5f1]' : 'border-[#483c2d]/12 bg-white'}`}>
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#dce8df] text-[#3f5d48]">
                    {mission.completed ? <CheckCircle2 className="h-6 w-6" /> : <Target className="h-6 w-6" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-lg font-black text-[#27221e]">{mission.titleKo}</span>
                      {recommended ? <span className="rounded-full bg-[#4f6b57] px-2 py-0.5 text-xs font-black text-white">추천</span> : null}
                      {mission.completed ? <span className="rounded-full bg-[#eee8e2] px-2 py-0.5 text-xs font-bold text-[#6b625a]">완료</span> : null}
                    </span>
                    {reason ? <span className="mt-1 block text-sm font-bold text-[#4f6b57]">{reason}</span> : null}
                    <span className="mt-1 block text-sm font-medium leading-6 text-[#6b625a]">{mission.actionKo}</span>
                    <span className="mt-1 flex items-center gap-1 text-xs font-bold text-[#7a7169]"><Clock className="h-3.5 w-3.5" /> 약 {Math.round(mission.targetSeconds / 60)}분</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

type StageProps = {
  snapshot: MissionSnapshot;
  busy: boolean;
  onCommand: (action: MissionSnapshot['allowedActions'][number], payload?: { expressionId?: string }) => void;
  onSpeak: (text: string, slow?: boolean) => void;
  onRefresh: () => void;
};

function StageView(props: StageProps) {
  switch (props.snapshot.stage) {
    case 'BRIEF': return <BriefView {...props} />;
    case 'PREP': return <PrepView {...props} />;
    case 'ROLEPLAY': return <RoleplayView {...props} />;
    case 'FEEDBACK': return <FeedbackView {...props} />;
    case 'SUMMARY': return <SummaryView {...props} />;
    default: return null;
  }
}

function can(snapshot: MissionSnapshot, action: MissionSnapshot['allowedActions'][number]) {
  return snapshot.allowedActions.includes(action);
}

function BriefView({ snapshot, busy, onCommand }: StageProps) {
  const { mission } = snapshot;
  return (
    <div>
      <div className={`${cardClass} border-[#738978]/28 bg-[#f0f5f1]`}>
        <p className="text-xl font-black text-[#27221e]">{mission.titleKo}</p>
        <p className="mt-2 text-base font-medium leading-7 text-[#3d3530]">{mission.actionKo}</p>
        <dl className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-4">
          <dt className="font-extrabold text-[#4f6b57]">오늘의 목표</dt><dd className="font-medium text-[#3d3530]">{mission.goalKo}</dd>
          <dt className="font-extrabold text-[#4f6b57]">상황</dt><dd className="font-medium text-[#3d3530]">{mission.situationKo}</dd>
          <dt className="font-extrabold text-[#4f6b57]">대화 분량</dt><dd className="font-medium text-[#3d3530]">약 {Math.round(mission.targetSeconds / 60)}분</dd>
          <dt className="font-extrabold text-[#4f6b57]">도움</dt><dd className="font-medium text-[#3d3530]">뜻 보기 · 표현 듣기 · 말할 문장 보기</dd>
        </dl>
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" className={primaryButton} disabled={busy || !can(snapshot, 'START_PREP')} onClick={() => onCommand('START_PREP')}>
          <Lightbulb className="h-5 w-5" /> 표현 먼저 연습하기
        </button>
        <button type="button" className={secondaryButton} disabled={busy || !can(snapshot, 'SKIP_PREP')} onClick={() => onCommand('SKIP_PREP')}>
          바로 미션 시작
        </button>
        <button type="button" className={textButton} disabled={busy} onClick={() => onCommand('ABANDON')}>다른 미션 고르기</button>
      </div>
    </div>
  );
}

function PrepView({ snapshot, busy, onCommand, onSpeak }: StageProps) {
  return (
    <div>
      <p className="text-base font-medium text-[#6b625a]">대화에서 쓸 표현을 먼저 들어보세요. 익숙하다면 바로 시작해도 돼요.</p>
      <ul className="mt-4 grid grid-cols-1 gap-3">
        {snapshot.expressions.map((expression) => (
          <li key={expression.id} className={cardClass}>
            <p className="text-xl font-black text-[#27221e]">{expression.text}</p>
            <p className="mt-1 text-base font-bold text-[#4f6b57]">{expression.meaningKo}</p>
            <p className="mt-1 text-sm font-medium text-[#6b625a]">{expression.usageKo}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className={secondaryButton} disabled={busy} aria-label={`${expression.text} 듣기`}
                onClick={() => { if (expression.text) onSpeak(expression.text); onCommand('PLAY_EXPRESSION', { expressionId: expression.id }); }}>
                <Volume2 className="h-4 w-4" /> 듣기
              </button>
              <button type="button" className={secondaryButton} disabled={busy} aria-label={`${expression.text} 천천히 듣기`}
                onClick={() => { if (expression.text) onSpeak(expression.text, true); onCommand('PLAY_EXPRESSION', { expressionId: expression.id }); }}>
                천천히
              </button>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" className={primaryButton} disabled={busy || !can(snapshot, 'DONE_PREP')} onClick={() => onCommand('DONE_PREP')}>
          미션 시작하기
        </button>
        <button type="button" className={textButton} disabled={busy} onClick={() => onCommand('ABANDON')}>그만하기</button>
      </div>
    </div>
  );
}

function useCountdown(snapshot: MissionSnapshot, onHardCap: () => void) {
  const [receivedAt, setReceivedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const roleplay = snapshot.roleplay;
  useEffect(() => {
    const timer = window.setTimeout(() => setReceivedAt(Date.now()), 0);
    return () => window.clearTimeout(timer);
  }, [snapshot.revision]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const passed = Math.max(0, Math.floor((now - receivedAt) / 1000));
  const remaining = roleplay ? Math.max(0, roleplay.remainingSeconds - passed) : 0;
  const capReached = roleplay ? roleplay.hardCapRemainingSeconds - passed <= 0 : false;
  const refreshedRevisionRef = useRef<number | null>(null);
  useEffect(() => {
    // The server ends the roleplay at the hard cap; fetch its state once per revision.
    if (!capReached || refreshedRevisionRef.current === snapshot.revision) return;
    refreshedRevisionRef.current = snapshot.revision;
    onHardCap();
  }, [capReached, onHardCap, snapshot.revision]);
  return remaining;
}

function RoleplayView({ snapshot, busy, onCommand, onSpeak, onRefresh }: StageProps) {
  const remaining = useCountdown(snapshot, onRefresh);
  const minutes = Math.floor(remaining / 60);
  const seconds = String(remaining % 60).padStart(2, '0');
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium text-[#6b625a]">{snapshot.mission.situationKo}</p>
        <span role="timer" aria-label="남은 대화 시간" className="inline-flex items-center gap-1 rounded-full bg-[#27221e] px-3 py-1 text-sm font-black text-white">
          <Clock className="h-4 w-4" /> {remaining > 0 ? `${minutes}:${seconds}` : '마무리해도 좋아요'}
        </span>
      </div>
      <RoleplayTranscript snapshot={snapshot} />

      <section aria-labelledby="goal-slots-title" className="mt-5">
        <h3 id="goal-slots-title" className="text-sm font-extrabold text-[#27221e]">미션 목표</h3>
        <ul className="mt-2 flex flex-wrap gap-2">
          {snapshot.mission.goalSlots.map((slot) => (
            <li key={slot.id} className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-bold ${slot.done ? 'bg-[#4f6b57] text-white' : 'bg-[#eee8e2] text-[#5f5851]'}`}>
              {slot.done ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />} {slot.labelKo}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="help-cards-title" className="mt-5">
        <h3 id="help-cards-title" className="text-sm font-extrabold text-[#27221e]">막히면 도움 카드</h3>
        {snapshot.roleplay?.clarificationHelp ? (
          <div className={`${cardClass} mt-2`}>
            <p className="text-sm font-extrabold text-[#4f6b57]">이렇게 답해 보세요</p>
            <p className="mt-2 text-base font-bold text-[#27221e]">{snapshot.roleplay.clarificationHelp.askLine}</p>
            <ul className="mt-3 flex flex-wrap gap-2" aria-label="지금 질문의 답변 예시">
              {snapshot.roleplay.clarificationHelp.answers.map((answer) => (
                <li key={answer} className="rounded-xl bg-[#f0f5f1] px-4 py-2 text-base font-bold text-[#3d3530]">{answer}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <ul className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {snapshot.expressions.map((expression, index) => (
            <HelpCard key={expression.id} index={index} expression={expression} busy={busy}
              onReveal={() => onCommand('SHOW_HELP_CARD', { expressionId: expression.id })}
              onSpeak={onSpeak} />
          ))}
        </ul>
      </section>

      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" className={primaryButton} disabled={busy || !can(snapshot, 'END_ROLEPLAY')} onClick={() => onCommand('END_ROLEPLAY')}>
          대화 마치기
        </button>
        <button type="button" className={textButton} disabled={busy} onClick={() => onCommand('ABANDON')}>그만하기</button>
      </div>
    </div>
  );
}

function RoleplayTranscript({ snapshot }: { snapshot: MissionSnapshot }) {
  const lines = snapshot.transcript ?? [];
  // What the learner is saying right now (synced from the avatar screen, as in free talk).
  const liveTranscript = useStore((state) => state.liveTranscript).trim();
  const endRef = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [lines.length, liveTranscript]);
  const voiceStarted = Boolean(snapshot.roleplay?.voiceStarted);
  const turns = snapshot.roleplay?.turns ?? 0;
  const maxTurns = snapshot.roleplay?.maxTurns;
  return (
    <section aria-label="아바타와의 대화" className="mt-4">
      <ul className="max-h-[260px] space-y-2 overflow-y-auto rounded-2xl border border-[#483c2d]/10 bg-white/70 p-3">
        {lines.length === 0 && !liveTranscript ? (
          <li className="flex items-center gap-2 text-sm font-bold text-[#4f6b57]">
            <Loader2 className="h-4 w-4 animate-spin" /> {voiceStarted ? '아바타가 말을 걸고 있어요.' : '아바타 화면에서 대화를 준비하고 있어요.'}
          </li>
        ) : lines.map((line, index) => (
          <li key={`${index}-${line.role}`} className={`flex ${line.role === 'learner' ? 'justify-end' : 'justify-start'}`}>
            <span className={`flex max-w-[85%] items-start gap-2 rounded-2xl px-4 py-2 text-base font-bold shadow-sm ${line.role === 'learner'
              ? 'rounded-tr-sm bg-[#4f6b57] text-white'
              : 'rounded-tl-sm bg-white text-[#27221e]'}`}>
              {line.role === 'avatar' ? <MessageCircle aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-[#4f6b57]" /> : null}
              <span><span className="sr-only">{line.role === 'learner' ? '나: ' : '아바타: '}</span>{line.text}</span>
            </span>
          </li>
        ))}
        {liveTranscript ? (
          <li className="flex justify-end" aria-live="polite">
            <span className="max-w-[85%] rounded-2xl rounded-tr-sm border border-dashed border-[#4f6b57]/50 bg-[#edf3ee] px-4 py-2 text-base font-bold text-[#3f5d48]">
              <span className="sr-only">지금 말하는 중: </span>{liveTranscript}
            </span>
          </li>
        ) : null}
        <li ref={endRef} aria-hidden="true" />
      </ul>
      <p className="mt-2 text-sm font-bold text-[#6b625a]">
        아바타 화면 앞에서 영어로 말해 보세요. 못 알아들었으면 &quot;Can you say that again?&quot;, 빠르면 &quot;Slowly, please.&quot;라고 말해요.
        {maxTurns ? ` (${turns}/${maxTurns}번 말함)` : ''}
      </p>
    </section>
  );
}

function HelpCard({ index, expression, busy, onReveal, onSpeak }: {
  index: number; expression: MissionExpression; busy: boolean; onReveal: () => void; onSpeak: (text: string, slow?: boolean) => void;
}) {
  const revealed = expression.revealed ?? [];
  const exhausted = revealed.includes('AUDIO');
  return (
    <li className={cardClass}>
      <p className="text-xs font-black text-[#7a7169]">표현 {index + 1}</p>
      {revealed.length === 0 ? <p className="mt-2 text-sm font-medium text-[#6b625a]">필요할 때 한 단계씩 열어보세요.</p> : null}
      {expression.meaningKo ? <p className="mt-2 text-base font-bold text-[#4f6b57]">{expression.meaningKo}</p> : null}
      {expression.firstWord && !expression.text ? <p className="mt-1 text-base font-black text-[#27221e]">{expression.firstWord} …</p> : null}
      {expression.text ? <p className="mt-1 text-base font-black text-[#27221e]">{expression.text}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {!exhausted ? (
          <button type="button" className={secondaryButton} disabled={busy} onClick={onReveal}>
            <Sparkles className="h-4 w-4" /> {revealed.length === 0 ? '뜻 보기' : revealed.length === 1 ? '첫 단어 보기' : revealed.length === 2 ? '문장 보기' : '듣기 열기'}
          </button>
        ) : null}
        {exhausted && expression.text ? (
          <button type="button" className={secondaryButton} onClick={() => onSpeak(expression.text ?? '')}>
            <Volume2 className="h-4 w-4" /> 듣기
          </button>
        ) : null}
      </div>
    </li>
  );
}

function FeedbackView({ snapshot, busy, onCommand }: StageProps) {
  const feedback = snapshot.feedback;
  if (!feedback) return null;
  const pending = feedback.status === 'PENDING';
  return (
    <div>
      <div className={`${cardClass} border-[#738978]/28 bg-[#f0f5f1]`}>
        <p className="flex items-center gap-2 text-xl font-black text-[#27221e]">
          <Star className="h-6 w-6 text-[#4f6b57]" /> {feedback.missionCompleted ? '오늘의 미션 완료!' : '오늘의 미션을 마쳤어요'}
        </p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {feedback.slots.map((slot) => (
            <li key={slot.id} className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-bold ${slot.done ? 'bg-[#4f6b57] text-white' : 'bg-white text-[#5f5851]'}`}>
              {slot.done ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />} {slot.labelKo}
            </li>
          ))}
        </ul>
        {snapshot.endReason === 'TIME_CAP' ? <p className="mt-3 text-sm font-bold text-[#6b625a]">대화 시간이 끝나서 마무리했어요.</p> : null}
      </div>

      {feedback.highlights.length > 0 ? (
        <section aria-labelledby="highlights-title" className="mt-5">
          <h3 id="highlights-title" className="text-sm font-extrabold text-[#27221e]">잘한 점</h3>
          <ul className="mt-2 space-y-1">
            {feedback.highlights.map((line) => (
              <li key={line} className="flex items-start gap-2 text-base font-bold text-[#3f5d48]">
                <Sparkles aria-hidden="true" className="mt-1 h-4 w-4 shrink-0" /> {line}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {feedback.nextPracticeKo ? (
        <section aria-labelledby="next-practice-title" className="mt-4">
          <h3 id="next-practice-title" className="text-sm font-extrabold text-[#27221e]">다음에 연습할 점</h3>
          <p className="mt-2 flex items-start gap-2 text-base font-bold text-[#27221e]">
            <Lightbulb aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-[#b07a2a]" /> {feedback.nextPracticeKo}
          </p>
        </section>
      ) : null}

      {pending ? (
        <p role="status" className="mt-5 flex items-center gap-2 text-sm font-bold text-[#4f6b57]">
          <Loader2 className="h-4 w-4 animate-spin" /> 상세 피드백을 만들고 있어요. 잠시만 기다려 주세요.
        </p>
      ) : (
        <details className="mt-5 rounded-2xl border border-[#483c2d]/12 bg-white/70 px-4 py-3">
          <summary className="cursor-pointer text-sm font-extrabold text-[#27221e]">상세 피드백 보기</summary>
          <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {feedback.items.map((item) => (
              <li key={item.key} className="flex items-start justify-between gap-3 rounded-xl border border-[#483c2d]/12 bg-white px-4 py-3">
                <span>
                  <span className="block text-base font-black text-[#27221e]">{item.labelKo}</span>
                  {item.reasonKo ? <span className="block text-sm font-medium text-[#6b625a]">{item.reasonKo}</span> : null}
                  {item.evidence ? <span className="mt-1 block text-xs font-bold text-[#7a7169]">내가 한 말: “{item.evidence}”</span> : null}
                </span>
                <span className="shrink-0 rounded-full bg-[#eee8e2] px-2 py-0.5 text-xs font-black text-[#5f5851]">{BAND_LABELS[item.band]}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="mt-6">
        <button type="button" className={primaryButton} disabled={busy || pending || !can(snapshot, 'CONTINUE')} onClick={() => onCommand('CONTINUE')}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} 오늘 배운 표현 보기
        </button>
      </div>
    </div>
  );
}

type ReadAloudState =
  | { phase: 'idle' }
  | { phase: 'recording' }
  | { phase: 'checking' }
  | { phase: 'done'; labelKo: string; messageKo: string; retry: boolean }
  | { phase: 'error'; messageKo: string };

/** Follow-along reading: listen, record, get an encouraging band, replay yourself. */
function ReadAloud({ sessionId, expressionId, text, best }: {
  sessionId: string; expressionId: string; text: string; best: { band: string; labelKo: string } | null;
}) {
  const [state, setState] = useState<ReadAloudState>({ phase: 'idle' });
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const recordingRef = useRef<ReadAloudRecording | null>(null);
  const pushSnapshot = useMissionLearningStore((store) => store.pushSnapshot);

  useEffect(() => () => {
    recordingRef.current?.cancel();
  }, []);
  useEffect(() => () => {
    if (playbackUrl) URL.revokeObjectURL(playbackUrl);
  }, [playbackUrl]);

  const start = async () => {
    let recording: ReadAloudRecording;
    try {
      recording = await startReadAloudRecording();
    } catch {
      setState({ phase: 'error', messageKo: '마이크를 사용할 수 없어요. 마이크 연결을 확인해 주세요.' });
      return;
    }
    recordingRef.current = recording;
    setState({ phase: 'recording' });
    try {
      const { wav, playback } = await recording.finished;
      setPlaybackUrl(URL.createObjectURL(playback));
      setState({ phase: 'checking' });
      const { result, snapshot } = await assessPronunciation(sessionId, expressionId, wav);
      pushSnapshot(snapshot);
      setState({ phase: 'done', labelKo: result.labelKo, messageKo: result.messageKo, retry: result.status !== 'OK' });
    } catch (caught) {
      if (caught instanceof Error && caught.message === 'cancelled') return;
      setState({ phase: 'error', messageKo: caught instanceof Error && 'code' in caught ? caught.message : '녹음을 확인하지 못했어요. 다시 해 볼까요?' });
    } finally {
      recordingRef.current = null;
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2" aria-label={`${text} 따라 읽기`}>
      {state.phase === 'recording' ? (
        <button type="button" className={primaryButton} onClick={() => recordingRef.current?.stop()}>
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#e0634f]" aria-hidden="true" /> 다 말했어요
        </button>
      ) : (
        <button type="button" className={secondaryButton} disabled={state.phase === 'checking'} onClick={() => void start()}>
          <Mic className="h-4 w-4" /> {state.phase === 'idle' ? '따라 읽기' : '다시 읽기'}
        </button>
      )}
      {playbackUrl && state.phase !== 'recording' ? (
        <button type="button" className={textButton} onClick={() => void new Audio(playbackUrl).play().catch(() => undefined)}>
          내 녹음 듣기
        </button>
      ) : null}
      {best && (state.phase === 'idle' || state.phase === 'error') ? (
        <span className="rounded-full bg-[#edf3ee] px-3 py-1 text-sm font-black text-[#3f5d48]">{best.labelKo}</span>
      ) : null}
      <p role="status" className="w-full text-sm font-bold text-[#4f6b57]">
        {state.phase === 'recording' ? '듣고 있어요. 문장을 따라 말해 보세요.' : null}
        {state.phase === 'checking' ? '확인하고 있어요…' : null}
        {state.phase === 'done' ? <><span className="font-black">{state.labelKo}</span> {state.messageKo}</> : null}
        {state.phase === 'error' ? state.messageKo : null}
      </p>
    </div>
  );
}

function SummaryView({ snapshot, busy, onCommand, onSpeak }: StageProps) {
  const summary = snapshot.summary;
  if (!summary) return null;
  return (
    <div>
      {summary.expressions.length === 0 ? (
        <p className="text-base font-medium text-[#6b625a]">이번에는 연습한 표현이 없어요. 다음에는 표현을 먼저 들어보고 시작해 보세요.</p>
      ) : (
        <>
          <p className="text-base font-bold text-[#4f6b57]">오늘 당신이 배운 표현 {summary.expressions.length}개</p>
          <ol className="mt-3 grid grid-cols-1 gap-3">
            {summary.expressions.map((expression, index) => (
              <li key={expression.id} className={cardClass}>
                <p className="text-xl font-black text-[#27221e]">{index + 1}. {expression.text}</p>
                <p className="mt-1 text-base font-bold text-[#4f6b57]">{expression.meaningKo}</p>
                <p className="mt-1 text-sm font-bold text-[#6b625a]">이번에는: {expression.usageKo}</p>
                {expression.said ? <p className="mt-1 text-sm font-medium text-[#7a7169]">내가 한 말: “{expression.said}”</p> : null}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button type="button" className={secondaryButton} onClick={() => onSpeak(expression.text)}>
                    <Volume2 className="h-4 w-4" /> 다시 듣기
                  </button>
                  {summary.pronunciationPractice && can(snapshot, 'FINISH') ? (
                    <ReadAloud sessionId={snapshot.sessionId} expressionId={expression.id} text={expression.text}
                      best={expression.pronunciation ?? null} />
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
      {summary.nextMission?.reasonKo && can(snapshot, 'START_NEXT_MISSION') ? (
        <p className="mt-6 text-sm font-bold text-[#4f6b57]">{summary.nextMission.reasonKo}</p>
      ) : null}
      <div className="mt-6 flex flex-wrap gap-3">
        {summary.nextMission && can(snapshot, 'START_NEXT_MISSION') ? (
          <button type="button" className={primaryButton} disabled={busy} onClick={() => onCommand('START_NEXT_MISSION')}>
            다음 미션: {summary.nextMission.titleKo}
          </button>
        ) : null}
        <button type="button" className={secondaryButton} disabled={busy || !can(snapshot, 'FINISH')} onClick={() => onCommand('FINISH')}>
          마치기
        </button>
      </div>
    </div>
  );
}
