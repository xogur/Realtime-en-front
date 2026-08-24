'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { Check, Loader2, Mic, RotateCcw, UserRound } from 'lucide-react';
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
    if (capture.phase === 'prompting') return '안내가 끝나면 바로 말씀해 주세요';
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
    if (capture.phase === 'prompting') return '안내 음성이 끝나는 즉시 마이크가 열립니다.';
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
        className="w-full max-w-xl rounded-[2rem] border border-white/75 bg-[#fbf8f4] px-7 py-9 text-center shadow-[0_30px_100px_rgba(57,42,31,0.24)] sm:px-12 sm:py-11"
      >
        <motion.div
          animate={{ scale: capture.isRecording && !reduceMotion ? [1, 1.06, 1] : 1 }}
          transition={{
            duration: reduceMotion ? 0 : 1.5,
            repeat: capture.isRecording && !reduceMotion ? Infinity : 0,
            ease: 'easeInOut',
          }}
          className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-blue-600 text-white"
        >
          {capture.phase === 'preparing' || capture.phase === 'submitting' ? (
            <Loader2 className="h-9 w-9 motion-safe:animate-spin" aria-hidden="true" />
          ) : isWelcome ? (
            <Check className="h-10 w-10" aria-hidden="true" />
          ) : (
            <Mic className="h-10 w-10" aria-hidden="true" />
          )}
        </motion.div>

        <div className="mt-5 flex min-h-7 items-center justify-center">
          {capture.isRecording ? (
            <span className="inline-flex items-center gap-2 text-sm font-extrabold text-blue-700">
              <span className="h-2.5 w-2.5 rounded-full bg-blue-600 motion-safe:animate-pulse" aria-hidden="true" />
              마이크가 열렸습니다
            </span>
          ) : (
            <span className="text-sm font-bold text-zinc-500">
              {capture.phase === 'prompting' ? '안내 중' : isWelcome ? '준비 완료' : '음성으로 이름 입력'}
            </span>
          )}
        </div>

        <h2 id="participant-name-title" className="mt-2 text-3xl font-black tracking-tight text-zinc-900 sm:text-4xl">
          {title}
        </h2>
        <p aria-live="polite" className={`mx-auto mt-4 min-h-14 max-w-md text-lg font-semibold leading-relaxed ${capture.error ? 'text-red-700' : capture.interim ? 'text-blue-700' : 'text-zinc-600'}`}>
          {description}
        </p>

        {!isWelcome && capture.phase !== 'submitting' ? (
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {capture.candidate ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void capture.confirm()}
              className="rounded-full bg-blue-600 px-7 py-3.5 text-lg font-black text-white transition hover:bg-blue-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-zinc-300"
            >
              이 이름으로 확정
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy}
            onClick={() => void capture.retry()}
            className="inline-flex items-center gap-2 rounded-full border border-zinc-300 bg-white px-6 py-3.5 text-lg font-extrabold text-zinc-800 transition hover:bg-zinc-100 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
          >
            <RotateCcw className="h-5 w-5" aria-hidden="true" /> 다시 시도
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void capture.skip(capture.suggestedSkipReason ?? 'user_skipped')}
            className="rounded-full px-5 py-3.5 text-base font-bold text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
          >
            이름 없이 시작
          </button>
        </div>
        ) : null}
        {!isWelcome ? (
          <p className="mt-7 text-sm font-semibold text-zinc-400">음성은 브라우저에서만 인식되며 이름 확인에 사용됩니다.</p>
        ) : null}
      </motion.section>
    </motion.div>
  );
}
