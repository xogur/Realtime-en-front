'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { BookOpen, Headphones, Lightbulb, Mic, Pause, RotateCcw, X } from 'lucide-react';
import { useLearningStore } from './useLearningStore';
import type { AttemptPurpose, LearningTopic } from './types';
import { getLearningHomeApiUrl } from './api';
import { getKioskIdFromLocation } from '@/lib/kioskIdentity';

const FALLBACK_TOPICS: LearningTopic[] = [
  { id: 'restaurant', labelKo: '음식점', goalKo: '원하는 메뉴를 정중하게 주문해요', expressionCount: 2 },
  { id: 'airport', labelKo: '공항', goalKo: '체크인 카운터에서 필요한 요청을 해요', expressionCount: 2 },
];

type Props = {
  role: 'controller' | 'viewer';
  open?: boolean;
  onClose?: () => void;
  onStart?: (topicId: 'restaurant' | 'airport') => void;
  onCommand?: (action: string, payload?: Record<string, unknown>) => void;
  onBeginAttempt?: (purpose: AttemptPurpose) => void;
};

export function LearningExperience({ role, open = false, onClose, onStart, onCommand, onBeginAttempt }: Props) {
  const snapshot = useLearningStore((state) => state.snapshot);
  const error = useLearningStore((state) => state.error);
  const partial = useLearningStore((state) => state.partialTranscript);
  const pending = useLearningStore((state) => state.isCommandPending);
  const reset = useLearningStore((state) => state.reset);
  const [topics, setTopics] = useState(FALLBACK_TOPICS);
  const [available, setAvailable] = useState(true);
  const visible = role === 'viewer' ? Boolean(snapshot && snapshot.status !== 'PAUSED') : open;

  useEffect(() => {
    if (role !== 'controller' || !open) return;
    fetch(getLearningHomeApiUrl(getKioskIdFromLocation()))
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('catalog unavailable')))
      .then((payload) => {
        setAvailable(payload.enabled !== false);
        if (Array.isArray(payload.topics)) setTopics(payload.topics);
        if (payload.activeSession) useLearningStore.getState().setSnapshot(payload.activeSession);
      })
      .catch(() => setAvailable(false));
  }, [open, role]);

  const current = useMemo(
    () => snapshot?.expressions.find((item) => item.id === snapshot.currentExpressionId) ?? null,
    [snapshot],
  );

  if (!visible) return null;

  const playModel = (speed: 'normal' | 'slow') => {
    if (!current || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(current.text);
    utterance.lang = 'en-US';
    utterance.rate = speed === 'slow' ? 0.72 : 0.92;
    window.speechSynthesis.speak(utterance);
    onCommand?.('PLAY_MODEL', { speed, audioSource: 'dynamic_fallback' });
  };

  const close = () => {
    if (snapshot?.status === 'ACTIVE') onCommand?.('PAUSE');
    onClose?.();
  };

  return (
    <div className="fixed inset-0 z-[120] grid place-items-center bg-[#211d1a]/70 p-4 backdrop-blur-md">
      <section
        role={role === 'controller' ? 'dialog' : 'region'}
        aria-modal={role === 'controller' ? true : undefined}
        aria-labelledby="learning-title"
        className="relative max-h-[94dvh] w-full max-w-4xl overflow-y-auto rounded-[2rem] border border-white/70 bg-[#fbf8f3] p-6 shadow-[0_32px_100px_rgba(30,25,21,.38)] sm:p-10"
      >
        {role === 'controller' && (
          <button type="button" onClick={close} className="absolute right-5 top-5 grid h-11 w-11 place-items-center rounded-full bg-stone-100 text-stone-700 hover:bg-stone-200" aria-label="학습 모드 닫기">
            <X className="h-5 w-5" />
          </button>
        )}

        {!snapshot ? (
          <div>
            <p className="text-sm font-black text-emerald-700">GUIDED SPEAKING</p>
            <h2 id="learning-title" className="mt-2 pr-12 text-3xl font-black tracking-tight text-stone-900 sm:text-5xl">오늘 쓸 표현을 익혀요</h2>
            <p className="mt-3 max-w-2xl text-base font-semibold leading-7 text-stone-600">듣고 따라 한 뒤, 다른 상황에서 힌트 없이 직접 말해 봅니다.</p>
            {!available && <p role="alert" className="mt-5 rounded-2xl bg-amber-50 p-4 font-bold text-amber-900">현재 학습 기록 저장소를 사용할 수 없어 말하기 학습을 잠시 쉬고 있어요. 프리토킹은 계속 이용할 수 있습니다.</p>}
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {topics.map((topic) => (
                <button key={topic.id} type="button" disabled={role !== 'controller' || pending || !available} onClick={() => onStart?.(topic.id)} className="rounded-3xl border border-stone-200 bg-white p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-400 disabled:opacity-60">
                  <BookOpen className="h-8 w-8 text-emerald-700" />
                  <span className="mt-5 block text-2xl font-black text-stone-900">{topic.labelKo}</span>
                  <span className="mt-2 block font-semibold leading-6 text-stone-600">{topic.goalKo}</span>
                  <span className="mt-5 block text-sm font-black text-emerald-700">핵심 표현 {topic.expressionCount}개</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-start justify-between gap-4 pr-10">
              <div>
                <p className="text-sm font-black text-emerald-700">{snapshot.topic.labelKo} · {snapshot.unit.goalKo}</p>
                <h2 id="learning-title" className="mt-2 text-3xl font-black tracking-tight text-stone-900 sm:text-5xl">{stageTitle(snapshot.stage)}</h2>
              </div>
              <span className="rounded-full bg-emerald-100 px-4 py-2 text-sm font-black text-emerald-800">{Math.max(1, current?.position ?? snapshot.expressions.length)} / {snapshot.expressions.length}</span>
            </div>

            {current && (
              <div className="mt-8 rounded-[2rem] bg-[#264f3d] p-7 text-white sm:p-10">
                {snapshot.scenario ? (
                  <>
                    <p className="text-sm font-bold text-emerald-200">상황</p>
                    <p className="mt-2 text-2xl font-black sm:text-3xl">{snapshot.scenario.prompt}</p>
                    <p className="mt-2 font-semibold text-emerald-100">{snapshot.scenario.promptKo}</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-bold text-emerald-200">오늘의 표현</p>
                    <p className="mt-2 text-3xl font-black sm:text-5xl">{current.text}</p>
                    <p className="mt-3 text-lg font-semibold text-emerald-100">{current.meaningKo}</p>
                    <p className="mt-1 text-sm text-emerald-200">{current.usageKo}</p>
                  </>
                )}
                {current.hintLevel !== 'NONE' && (
                  <div className="mt-5 rounded-2xl bg-white/10 p-4 font-bold">
                    {current.hintLevel === 'MEANING' && current.meaningKo}
                    {current.hintLevel === 'FIRST_WORD' && `첫 단어: ${current.firstWord}`}
                    {current.hintLevel === 'FULL_EXPRESSION' && current.text}
                  </div>
                )}
              </div>
            )}

            {(partial || snapshot.feedback) && (
              <div role="status" aria-live="polite" className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 font-bold text-amber-950">
                {partial ? `듣고 있어요: “${partial}”` : snapshot.feedback?.messageKo}
              </div>
            )}
            {error && <p role="alert" className="mt-4 rounded-2xl bg-red-50 p-4 font-bold text-red-800">{error}</p>}

            {snapshot.result && (
              <div className="mt-7 grid gap-3 sm:grid-cols-2">
                {snapshot.result.expressions.map((item) => {
                  const expression = snapshot.expressions.find((entry) => entry.id === item.id);
                  return <div key={item.id} className="rounded-2xl border border-stone-200 bg-white p-5"><p className="font-black text-stone-900">{expression?.text}</p><p className="mt-2 text-sm font-bold text-emerald-700">{outcomeLabel(item.outcome)}</p></div>;
                })}
              </div>
            )}

            {role === 'controller' ? (
              <div className="mt-7 flex flex-wrap gap-3">
                {snapshot.allowedActions.includes('PLAY_MODEL') && <Action icon={<Headphones />} label="보통 속도로 듣기" onClick={() => playModel('normal')} disabled={pending} />}
                {snapshot.allowedActions.includes('PLAY_MODEL') && <Action icon={<Headphones />} label="느리게 듣기" onClick={() => playModel('slow')} disabled={pending} />}
                {snapshot.allowedActions.includes('REQUEST_HINT') && <Action icon={<Lightbulb />} label="힌트 보기" onClick={() => onCommand?.('REQUEST_HINT')} disabled={pending} />}
                {snapshot.allowedActions.includes('BEGIN_REPEAT') && <Action primary icon={<Mic />} label="따라 말하기" onClick={() => onBeginAttempt?.('REPEAT')} disabled={pending} />}
                {snapshot.allowedActions.includes('BEGIN_APPLY') && <Action primary icon={<Mic />} label="상황에 답하기" onClick={() => onBeginAttempt?.('APPLY')} disabled={pending} />}
                {snapshot.allowedActions.includes('BEGIN_RETEST') && <Action primary icon={<Mic />} label="다시 도전하기" onClick={() => onBeginAttempt?.('RETEST')} disabled={pending} />}
                {snapshot.allowedActions.includes('RETRY_REPEAT') && <Action icon={<RotateCcw />} label="한 번 더" onClick={() => onCommand?.('RETRY_REPEAT')} disabled={pending} />}
                {snapshot.allowedActions.includes('CONTINUE') && <Action primary label="계속" onClick={() => onCommand?.('CONTINUE')} disabled={pending} />}
                {snapshot.allowedActions.includes('PROMPT_PRESENTED') && <Action primary label="말해 볼게요" onClick={() => onCommand?.('PROMPT_PRESENTED')} disabled={pending} />}
                {snapshot.allowedActions.includes('FINISH') && <Action primary label="학습 마치기" onClick={() => onCommand?.('FINISH')} disabled={pending} />}
                {snapshot.allowedActions.includes('RESUME') && <Action primary label="이어하기" onClick={() => onCommand?.('RESUME')} disabled={pending} />}
                {snapshot.allowedActions.includes('PAUSE') && <Action icon={<Pause />} label="저장하고 나가기" onClick={close} disabled={pending} />}
                {snapshot.status === 'COMPLETED' && <Action primary icon={<BookOpen />} label="다른 주제 학습" onClick={reset} disabled={pending} />}
              </div>
            ) : (
              <p className="mt-7 text-center text-sm font-bold text-stone-500">왼쪽 화면에서 학습을 진행해 주세요.</p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function Action({ label, icon, primary = false, disabled, onClick }: { label: string; icon?: ReactNode; primary?: boolean; disabled?: boolean; onClick: () => void }) {
  return <button type="button" disabled={disabled} onClick={onClick} className={`inline-flex min-h-12 items-center gap-2 rounded-full px-6 py-3 font-black transition active:scale-95 disabled:opacity-50 ${primary ? 'bg-emerald-700 text-white hover:bg-emerald-800' : 'border border-stone-300 bg-white text-stone-800 hover:bg-stone-50'}`}>{icon && <span className="[&>svg]:h-5 [&>svg]:w-5">{icon}</span>}{label}</button>;
}

function stageTitle(stage: string): string {
  if (stage.includes('ASSESSING')) return '말을 듣고 있어요';
  if (stage === 'EXPRESSION_INTRO') return '표현을 먼저 살펴봐요';
  if (stage === 'REPEAT_READY') return '듣고 그대로 따라 해요';
  if (stage === 'REPEAT_FEEDBACK') return '좋아요, 이제 상황에 써 봐요';
  if (stage.startsWith('APPLY')) return '실제 상황에 답해 보세요';
  if (stage === 'RELEARN') return '핵심 표현을 다시 익혀요';
  if (stage.startsWith('RETEST')) return '새로운 상황에서 다시 도전해요';
  if (stage === 'RESULT' || stage === 'COMPLETED') return '오늘 학습 결과예요';
  return '말하기 학습';
}

function outcomeLabel(outcome: string): string {
  return ({ INDEPENDENT: '혼자 말했어요', ASSISTED: '힌트와 함께 성공했어요', NEEDS_REVIEW: '다음에 다시 복습해요', UNMEASURED: '평가하지 못했어요' } as Record<string, string>)[outcome] ?? '연습 중';
}
