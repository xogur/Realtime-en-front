'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { CalendarDays, Check } from 'lucide-react';
import { bookingMotion, type BookingVisualSnapshot } from './bookingMotion';

export function SelectionRibbon({ dateLabel, startTime, endTime, onDate, onTime }: {
  dateLabel: string | null;
  startTime: string | null;
  endTime: string | null;
  onDate: () => void;
  onTime: () => void;
}) {
  if (!dateLabel) return null;
  return (
    <motion.div layout className="mt-4 flex flex-wrap items-center gap-2 text-sm font-black" aria-label="선택한 예약 일정">
      <motion.button
        layoutId="booking-date"
        type="button"
        onClick={onDate}
        className="flex min-h-11 items-center gap-2 rounded-full bg-[#e8eeff] px-4 py-2 text-[#1746be] shadow-[0_8px_24px_rgba(33,85,217,0.10)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300"
        transition={bookingMotion.springSoft}
      >
        <Check className="h-4 w-4" />{dateLabel}
      </motion.button>
      {startTime && endTime ? (
        <motion.button
          layoutId="booking-time"
          type="button"
          onClick={onTime}
          className="flex min-h-11 items-center gap-2 rounded-full bg-[#e8eeff] px-4 py-2 text-[#1746be] shadow-[0_8px_24px_rgba(33,85,217,0.10)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300"
          transition={bookingMotion.springSoft}
        >
          <Check className="h-4 w-4" />{startTime}–{endTime}
        </motion.button>
      ) : null}
    </motion.div>
  );
}

export function SpatialHandoffOverlay() {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) return null;
  return (
    <motion.div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-20 overflow-hidden rounded-[1.5rem] bg-[linear-gradient(180deg,rgba(251,248,244,0.94),rgba(232,238,255,0.70)_55%,rgba(251,248,244,0.10))]"
      initial={{ opacity: 1 }}
      animate={{ opacity: [1, 1, 0] }}
      transition={{ duration: bookingMotion.spatialIntro, times: [0, 0.68, 1], ease: bookingMotion.easeInOut }}
    >
      <svg viewBox="0 0 1000 420" preserveAspectRatio="none" className="h-full w-full">
        <motion.path
          d="M96 328 H310 V246 H520 V154 H744 V92 H920"
          fill="none"
          stroke="#2155d9"
          strokeWidth="8"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0, opacity: 0.25 }}
          animate={{ pathLength: 1, opacity: [0.25, 0.9, 0.22] }}
          transition={{ duration: 0.42, ease: bookingMotion.easeOut }}
        />
        {[310, 520, 744, 920].map((x, index) => (
          <motion.rect
            key={x}
            x={x - 55}
            y={index % 2 === 0 ? 190 : 105}
            width="110"
            height="118"
            rx="20"
            fill="rgba(255,255,255,0.82)"
            stroke="#2155d9"
            strokeWidth="4"
            initial={{ opacity: 0, scaleY: 0.08, transformOrigin: 'bottom' }}
            animate={{ opacity: [0, 0.9, 0], scaleY: [0.08, 1, 1] }}
            transition={{ delay: 0.22 + index * bookingMotion.stagger, duration: 0.35, ease: bookingMotion.easeOut }}
          />
        ))}
      </svg>
      <motion.p
        className="absolute inset-x-0 bottom-5 text-center text-sm font-black text-[#1746be]"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: [0, 1, 0], y: [6, 0, -3] }}
        transition={{ duration: bookingMotion.spatialIntro }}
      >
        선택한 시간의 공간을 여는 중…
      </motion.p>
    </motion.div>
  );
}

export function BookingSuccessScene({ snapshot, countdown }: { snapshot: BookingVisualSnapshot | null; countdown: number | null }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      className="mx-auto flex max-w-2xl flex-col items-center"
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: reduceMotion ? 0.01 : bookingMotion.success }}
    >
      <motion.div
        layoutId={snapshot ? 'selected-cocoon' : undefined}
        className="relative grid h-24 w-24 place-items-center rounded-[1.75rem] bg-[linear-gradient(145deg,#2c65e8,#1746be)] text-white shadow-[0_22px_55px_rgba(33,85,217,0.28)]"
        initial={reduceMotion ? false : { y: 14, scale: 0.9, rotateX: -12 }}
        animate={{ y: 0, scale: 1, rotateX: 0 }}
        transition={bookingMotion.springSoft}
      >
        <CalendarDays className="h-10 w-10" />
        <motion.span
          className="absolute -bottom-2 -right-2 grid h-9 w-9 place-items-center rounded-full bg-emerald-600 shadow-lg ring-4 ring-[#fbf8f4]"
          initial={reduceMotion ? false : { scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ ...bookingMotion.springSoft, delay: 0.26 }}
        >
          <Check className="h-5 w-5" strokeWidth={3} />
        </motion.span>
      </motion.div>
      <motion.h2
        className="mt-7 text-balance text-3xl font-black text-zinc-900"
        initial={reduceMotion ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: reduceMotion ? 0 : 0.38, duration: 0.24, ease: bookingMotion.easeOut }}
      >
        다음 예약이 완료되었습니다
      </motion.h2>
      {snapshot ? (
        <motion.p
          className="mt-4 text-xl font-bold text-zinc-700"
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: reduceMotion ? 0 : 0.46, duration: 0.22 }}
        >
          {snapshot.dateLabel} · {snapshot.startTime}–{snapshot.endTime} · 코쿤 {snapshot.roomNumber}번
        </motion.p>
      ) : null}
      <p className="mt-3 font-semibold text-zinc-500">예약 시간에 해당 코쿤으로 오시면 자동으로 이용을 시작합니다.</p>
      {countdown !== null ? <p className="mt-5 text-sm font-extrabold text-blue-700" aria-live="polite">{countdown}초 후 메인 영어 프로젝트 화면으로 돌아갑니다.</p> : null}
    </motion.div>
  );
}
