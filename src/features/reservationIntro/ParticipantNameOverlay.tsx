'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, Loader2, Mic, RotateCcw, UserRound } from 'lucide-react';
import { useState } from 'react';
import { OnboardingJourney } from '@/components/onboarding/OnboardingJourney';
import type { ParticipantSkipReason, ReservationIntroRole } from './types';
import { useParticipantNameCapture } from './useParticipantNameCapture';

type Props = {
  role: ReservationIntroRole;
  active: boolean;
  eventId?: string;
  onConfirm: (name: string) => Promise<unknown>;
  onSkip: (reason: ParticipantSkipReason) => Promise<unknown>;
  onWelcomeComplete: () => void;
};

export function ParticipantNameOverlay({
  role,
  active,
  eventId,
  onConfirm,
  onSkip,
  onWelcomeComplete,
}: Props) {
  const reduceMotion = useReducedMotion();
  const [typedName, setTypedName] = useState('');
  const [typedBusy, setTypedBusy] = useState(false);
  const [typedError, setTypedError] = useState<string | null>(null);
  const capture = useParticipantNameCapture({
    enabled: active && role === 'avatar',
    eventId,
    onConfirm,
    onSkip,
    onWelcomeComplete,
  });
  if (!active) return null;

  if (role === 'guide') {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="fixed inset-0 z-[2147483647] flex min-h-[100dvh] w-full items-center justify-center bg-zinc-950/25 p-8 backdrop-blur-[16px]"
      >
        <section className="w-full max-w-lg rounded-[2rem] border border-white/70 bg-[#fbf8f4] px-10 py-12 text-center shadow-[0_28px_90px_rgba(57,42,31,0.22)]">
          <OnboardingJourney stage="name" className="mb-9" />
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600 text-white">
            <UserRound className="h-8 w-8" aria-hidden="true" />
          </span>
          <h2 className="mt-6 text-3xl font-black tracking-tight text-zinc-900">이름을 확인하고 있어요</h2>
          <p className="mt-3 text-lg font-semibold text-zinc-600">왼쪽 화면에서 이름을 말씀해 주세요.</p>
        </section>
      </motion.div>
    );
  }

  const isWelcome = capture.phase === 'welcoming' || capture.phase === 'completed';
  const isLeaving = capture.phase === 'completed';
  const busy = ['preparing', 'prompting', 'submitting', 'welcoming', 'completed'].includes(capture.phase);
  const title = (() => {
    if (capture.phase === 'preparing') return '마이크를 연결하고 있어요';
    if (capture.phase === 'prompting') return '곧 말할 차례예요';
    if (capture.phase === 'listening') return '지금 말씀하세요';
    if (capture.phase === 'submitting') return '이름을 저장하고 있어요';
    if (isWelcome) return `${capture.candidate}님, 환영합니다`;
    if (capture.phase === 'error') return '음성 입력을 시작하지 못했어요';
    if (capture.candidate) return `${capture.candidate}님, 맞으신가요?`;
    return '어떻게 불러드릴까요?';
  })();
  const description = (() => {
    if (capture.error) return capture.error;
    if (capture.interim) return `“${capture.interim}”`;
    if (capture.phase === 'preparing') return '잠시만 기다려 주세요. 마이크가 준비되면 안내를 시작합니다.';
    if (capture.phase === 'prompting') return '안내가 끝나면 바로 이름이나 닉네임을 말씀해 주세요.';
    if (capture.phase === 'listening') return '이름이나 편하게 사용할 닉네임을 말해 주세요.';
    if (capture.phase === 'submitting') return '말씀하신 이름을 확인하고 있습니다.';
    if (capture.phase === 'welcoming') return '영어 대화를 시작할 준비가 끝났어요.';
    if (capture.phase === 'completed') return '영어 대화를 시작합니다.';
    if (capture.candidate) return '맞으면 “맞아요”, 다르면 “다시 말할게요”처럼 편하게 말씀해 주세요.';
    return '안내에 따라 이름이나 닉네임을 말씀해 주세요.';
  })();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{
        opacity: 1,
        backgroundColor: isLeaving ? 'rgba(24, 24, 27, 0)' : 'rgba(24, 24, 27, 0.28)',
        backdropFilter: isLeaving ? 'blur(0px)' : 'blur(18px)',
      }}
      transition={{
        duration: reduceMotion ? 0 : isLeaving ? 0.9 : 0.45,
        ease: [0.16, 1, 0.3, 1],
      }}
      className="fixed inset-0 z-[2147483647] flex min-h-[100dvh] w-full items-center justify-center p-6 sm:p-10"
      role="dialog"
      aria-modal="true"
      aria-labelledby="participant-name-title"
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <motion.div
          className="absolute left-[8%] top-[14%] h-56 w-56 rounded-full bg-[#dbe7dd]/55 blur-3xl"
          animate={reduceMotion ? undefined : { x: [0, 32, 0], y: [0, -18, 0], scale: [1, 1.08, 1] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute bottom-[10%] right-[7%] h-64 w-64 rounded-full bg-[#d9e2f3]/50 blur-3xl"
          animate={reduceMotion ? undefined : { x: [0, -26, 0], y: [0, 20, 0], scale: [1.04, 0.96, 1.04] }}
          transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>
      <motion.section
        initial={{ opacity: 0, y: 22, scale: 0.97 }}
        animate={{
          opacity: isLeaving ? 0 : 1,
          y: isLeaving ? -10 : 0,
          scale: isLeaving ? 0.985 : 1,
        }}
        transition={{
          duration: reduceMotion ? 0 : isLeaving ? 0.55 : 0.5,
          ease: [0.16, 1, 0.3, 1],
        }}
        className="relative w-full max-w-xl overflow-hidden rounded-[2rem] border border-white/75 bg-[#fbf8f4]/95 px-7 py-8 text-center shadow-[0_30px_100px_rgba(57,42,31,0.24)] sm:px-12 sm:py-10"
      >
        <OnboardingJourney stage={isWelcome ? 'difficulty' : 'name'} className="mb-8" />

        <div className="relative mx-auto h-24 w-24">
          <motion.span
            aria-hidden="true"
            className="absolute inset-0 rounded-[1.75rem] border border-[#4f6b57]/20"
            animate={reduceMotion || isWelcome ? undefined : { rotate: 360 }}
            transition={{ duration: 12, repeat: Infinity, ease: 'linear' }}
          />
          <motion.span
            aria-hidden="true"
            className="absolute -right-1 top-3 h-3 w-3 rounded-full bg-[#4f6b57]"
            animate={reduceMotion || isWelcome ? undefined : { scale: [0.75, 1.15, 0.75] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
          />
        <motion.div
          data-listening-state={capture.phase === 'listening' || capture.phase === 'confirming' ? 'active' : 'prompting'}
          animate={{
            scale: capture.isRecording && !reduceMotion ? [1, 1.06, 1] : 1,
            boxShadow: capture.phase === 'listening' && !reduceMotion
              ? ['0 0 0 0 rgba(37, 99, 235, 0.35)', '0 0 0 18px rgba(37, 99, 235, 0)', '0 0 0 0 rgba(37, 99, 235, 0.35)']
              : '0 0 0 0 rgba(37, 99, 235, 0)',
          }}
          transition={{
            duration: reduceMotion ? 0 : capture.phase === 'listening' ? 1.35 : 1.5,
            repeat: capture.isRecording && !reduceMotion ? Infinity : 0,
            ease: 'easeInOut',
          }}
          className={`absolute left-2 top-2 flex h-20 w-20 items-center justify-center rounded-2xl text-white transition-colors duration-300 ${capture.phase === 'listening' || capture.phase === 'confirming' ? 'bg-[#315f8f]' : isWelcome ? 'bg-[#4f6b57]' : 'bg-zinc-800'}`}
        >
          {capture.phase === 'preparing' || capture.phase === 'submitting' ? (
            <Loader2 className="h-9 w-9 motion-safe:animate-spin" aria-hidden="true" />
          ) : isWelcome ? (
            <Check className="h-10 w-10" aria-hidden="true" />
          ) : (
            <Mic className="h-10 w-10" aria-hidden="true" />
          )}
        </motion.div>
        </div>

        <div
          aria-hidden="true"
          className={`mx-auto mt-5 flex h-7 items-end justify-center gap-1.5 ${capture.phase === 'listening' || capture.phase === 'confirming' ? 'text-blue-600' : 'text-zinc-300'}`}
        >
          {[0, 1, 2, 3, 4].map((bar) => (
            <motion.span
              key={bar}
              className="w-1.5 rounded-full bg-current"
              animate={!reduceMotion && (capture.phase === 'listening' || capture.phase === 'confirming')
                ? { height: ['8px', `${12 + ((bar * 7) % 14)}px`, '8px'] }
                : { height: '8px' }}
              transition={{
                duration: 0.75,
                repeat: !reduceMotion && (capture.phase === 'listening' || capture.phase === 'confirming') ? Infinity : 0,
                delay: bar * 0.08,
                ease: 'easeInOut',
              }}
            />
          ))}
        </div>

        <div className="mt-5 flex min-h-7 items-center justify-center">
          {capture.isRecording ? (
            <span className="inline-flex items-center gap-2 text-sm font-extrabold text-blue-700">
              <span className="h-2.5 w-2.5 rounded-full bg-blue-600 motion-safe:animate-pulse" aria-hidden="true" />
              마이크가 열렸습니다
            </span>
          ) : (
            <span className="text-sm font-bold text-zinc-500">
              {capture.phase === 'prompting' ? '안내 중 · 곧 말할 차례' : isWelcome ? '준비 완료' : '음성으로 이름 입력'}
            </span>
          )}
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.h2
            key={title}
            id="participant-name-title"
            initial={reduceMotion ? false : { opacity: 0, y: 12, filter: 'blur(5px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -10, filter: 'blur(4px)' }}
            transition={{ duration: reduceMotion ? 0 : 0.34, ease: [0.16, 1, 0.3, 1] }}
            className="mt-2 text-3xl font-black tracking-tight text-zinc-900 sm:text-4xl"
          >
            {title}
          </motion.h2>
        </AnimatePresence>
        <p aria-live="polite" className={`mx-auto mt-4 min-h-14 max-w-md text-lg font-semibold leading-relaxed ${capture.error ? 'text-red-700' : capture.interim ? 'text-blue-700' : 'text-zinc-600'}`}>
          {description}
        </p>

        {!isWelcome && capture.phase !== 'submitting' ? (
        <div className="mt-7 rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
          <label className="block text-left text-sm font-extrabold text-zinc-600" htmlFor="participant-name-input">
            키보드로 이름 입력
          </label>
          <div className="mt-2 flex gap-2">
            <input
              id="participant-name-input"
              value={typedName}
              maxLength={30}
              onChange={(event) => { setTypedName(event.target.value); setTypedError(null); }}
              placeholder="이름 또는 닉네임"
              className="min-w-0 flex-1 rounded-xl border border-zinc-300 px-4 py-3 text-lg font-bold text-zinc-900 outline-none focus:border-blue-500"
            />
            <motion.button
              type="button"
              disabled={typedBusy || !typedName.trim()}
              onClick={() => {
                setTypedBusy(true);
                setTypedError(null);
                void capture.submitName(typedName.trim())
                  .then((saved) => {
                    if (!saved) setTypedError('이름을 저장하지 못했습니다. 한글 또는 영문 이름을 확인해 주세요.');
                  })
                  .finally(() => setTypedBusy(false));
              }}
              className="rounded-xl bg-zinc-900 px-5 py-3 font-black text-white disabled:bg-zinc-300"
              whileTap={reduceMotion ? undefined : { scale: 0.97 }}
            >
              {typedBusy ? '저장 중…' : '입력 완료'}
            </motion.button>
          </div>
          {typedError ? <p role="alert" className="mt-2 text-left text-sm font-bold text-red-700">{typedError}</p> : null}
        </div>
        ) : null}

        {!isWelcome && capture.phase !== 'submitting' ? (
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {capture.candidate ? (
            <motion.button
              type="button"
              disabled={busy}
              onClick={() => void capture.confirm()}
              className="rounded-full bg-[#315f8f] px-7 py-3.5 text-lg font-black text-white transition hover:bg-[#284f78] active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-zinc-300"
              whileTap={reduceMotion ? undefined : { scale: 0.97 }}
            >
              이 이름으로 확정
            </motion.button>
          ) : null}
          <button
            type="button"
            disabled={busy}
            onClick={() => void capture.retry()}
            className="inline-flex items-center gap-2 rounded-full border border-zinc-300 bg-white px-6 py-3.5 text-lg font-extrabold text-zinc-800 transition hover:bg-zinc-100 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
          >
            <RotateCcw className="h-5 w-5" aria-hidden="true" /> 다시 시도
          </button>
        </div>
        ) : null}
        {!isWelcome ? (
          <p className="mt-7 text-sm font-semibold text-zinc-400">이름은 현재 이용과 게스트의 다음 예약에 사용됩니다.</p>
        ) : null}
      </motion.section>
    </motion.div>
  );
}
