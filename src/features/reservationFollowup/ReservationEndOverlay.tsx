'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'framer-motion';
import { CalendarDays, Check, Loader2, RotateCcw, QrCode } from 'lucide-react';
import QRCode from 'qrcode';
import Image from 'next/image';
import type { ReservationIntroRole } from '@/features/reservationIntro/types';
import { getReservationSessionApiUrl } from './model';
import { FollowupBookingFlow } from './FollowupBookingFlow';
import { createFollowupReservation } from './reservationFollowupApi';
import { BookingSuccessScene } from './BookingTransitionElements';
import { bookingMotion, type BookingVisualSnapshot } from './bookingMotion';
import type { DurationMinutes, UsageSession } from './types';

type Props = {
  role: ReservationIntroRole;
  session: UsageSession | null;
  endPending?: boolean;
  resumePending?: boolean;
  resumeError?: string | null;
  onResume?: () => Promise<UsageSession>;
  onDismiss?: () => Promise<void>;
  onBook?: (request: { reservationId: number; date: string; startTime: string; durationMinutes: DurationMinutes; roomId: number }) => Promise<UsageSession>;
};

export function ReservationEndOverlay({
  role,
  session,
  endPending = false,
  resumePending = false,
  resumeError = null,
  onResume,
  onDismiss,
  onBook,
}: Props) {
  const [mode, setMode] = useState<'choices' | 'booking'>('choices');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [returnCountdown, setReturnCountdown] = useState<number | null>(null);
  const [bookingSnapshot, setBookingSnapshot] = useState<BookingVisualSnapshot | null>(null);
  const reduceMotion = useReducedMotion();
  const followupReservationId = session?.followup?.reservationId;

  useEffect(() => {
    setMode('choices');
    setError(null);
    setBookingSnapshot(null);
  }, [session?.reservationId]);

  useEffect(() => {
    setQrDataUrl(null);
    if (!session?.signupUrl) return;
    let active = true;
    void QRCode.toDataURL(session.signupUrl, {
      width: 320,
      margin: 4,
      errorCorrectionLevel: 'Q',
      color: { dark: '#15243A', light: '#FFFFFF' },
    })
      .then((value) => { if (active) setQrDataUrl(value); })
      .catch(() => { if (active) setError('QR 코드를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.'); });
    return () => { active = false; };
  }, [session?.signupUrl]);

  useEffect(() => {
    if (session?.status !== 'booked' || !followupReservationId) {
      setReturnCountdown(null);
      return;
    }

    let active = true;
    setReturnCountdown(10);
    const interval = window.setInterval(() => {
      setReturnCountdown((current) => (current !== null && current > 1 ? current - 1 : current));
    }, 1000);
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(`${getReservationSessionApiUrl(session.kioskId)}/dismiss`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reservationId: session.reservationId }),
        });
        if (!response.ok) throw new Error('메인 화면으로 돌아가지 못했습니다.');
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : '메인 화면으로 돌아가지 못했습니다.');
      }
    }, 10_000);

    return () => {
      active = false;
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [followupReservationId, session?.kioskId, session?.reservationId, session?.status]);

  if (!session || session.status === 'active') return null;
  const isController = role === 'avatar';

  const dismiss = async () => {
    setLoading(true);
    setError(null);
    try {
      if (onDismiss) {
        await onDismiss();
      } else {
        const response = await fetch(`${getReservationSessionApiUrl(session.kioskId)}/dismiss`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reservationId: session.reservationId }),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => null) as { detail?: string } | null;
          throw new Error(body?.detail || '이용 종료를 저장하지 못했습니다.');
        }
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '이용 종료를 저장하지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const resume = async () => {
    if (!onResume) return;
    setError(null);
    try {
      await onResume();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '이용을 다시 시작하지 못했습니다.');
    }
  };

  return (
    <div className="fixed inset-0 z-[2147483646] flex min-h-[100dvh] items-center justify-center bg-zinc-950/35 p-0 backdrop-blur-[18px] sm:p-6" role="dialog" aria-modal="true" aria-label="예약 이용 종료">
      <LayoutGroup id="reservation-followup">
      <motion.section layout transition={reduceMotion ? { duration: 0.01 } : bookingMotion.springSoft} className={`max-h-[100dvh] min-h-[100dvh] w-full overflow-y-auto border border-white/70 bg-[#fbf8f4] px-5 py-6 text-center shadow-[0_30px_110px_rgba(24,24,27,0.3)] sm:min-h-0 sm:max-h-[92dvh] sm:rounded-[2rem] sm:px-12 sm:py-8 ${mode === 'booking' ? 'max-w-6xl' : 'max-w-3xl'}`}>
        <AnimatePresence mode="wait" initial={false}>
        {session.status === 'booked' && session.followup ? (
          <motion.div key="booked" exit={{ opacity: 0 }}><BookingSuccessScene snapshot={bookingSnapshot} countdown={returnCountdown} /></motion.div>
        ) : session.status === 'dismissed' ? (
          <>
            <Check className="mx-auto h-16 w-16 rounded-full bg-zinc-700 p-3 text-white" />
            <h2 className="mt-5 text-3xl font-black text-zinc-900">이용이 종료되었습니다</h2>
            <p className="mt-3 text-lg font-semibold text-zinc-500">다음 예약 이용자를 기다리고 있습니다.</p>
          </>
        ) : !isController ? (
          <>
            <CalendarDays className="mx-auto h-16 w-16 rounded-2xl bg-blue-600 p-3 text-white" />
            <h2 className="mt-5 text-3xl font-black text-zinc-900">
              {session.canResume ? '대화가 잠시 멈췄습니다' : '예약하신 사용 시간이 끝났습니다'}
            </h2>
            <p className="mt-3 text-lg font-semibold text-zinc-500">
              {session.canResume
                ? '왼쪽 화면에서 계속 이용하거나 다음 일정을 선택해 주세요.'
                : session.canSignup
                ? '왼쪽 화면에서 다음 예약 또는 회원가입 QR을 이용해 주세요.'
                : '왼쪽 화면에서 다음 예약을 선택해 주세요.'}
            </p>
          </>
        ) : (
          <>
            <h2 className={`${mode === 'booking' ? 'text-2xl sm:text-3xl' : 'text-3xl'} font-black text-zinc-900`}>
              {session.canResume ? '대화가 잠시 멈췄습니다' : '예약하신 사용 시간이 끝났습니다'}
            </h2>
            <p className={`${mode === 'booking' ? 'mt-1 text-base sm:mt-2 sm:text-lg' : 'mt-2 text-lg'} font-semibold text-zinc-500`}>
              {session.canResume
                ? '예약 시간이 남아 있어 이전 대화를 그대로 이어서 이용할 수 있습니다.'
                : '다음 이용을 간편하게 예약할 수 있어요.'}
            </p>

            {mode === 'choices' && session.canResume ? (
              <button
                type="button"
                disabled={endPending || resumePending || loading}
                onClick={() => void resume()}
                className="mt-7 flex w-full items-center justify-center gap-3 rounded-2xl bg-emerald-600 px-6 py-5 text-xl font-black text-white shadow-lg shadow-emerald-700/20 transition hover:bg-emerald-700 disabled:cursor-wait disabled:opacity-60"
              >
                {resumePending ? <Loader2 className="h-6 w-6 animate-spin" /> : <RotateCcw className="h-6 w-6" />}
                {resumePending ? '이전 대화를 불러오는 중…' : '잘못 눌렀어요 · 계속 이용하기'}
              </button>
            ) : null}

            <AnimatePresence mode="wait" initial={false}>
            {mode === 'choices' ? (
              <motion.div key="choices" exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }} transition={{ duration: reduceMotion ? 0.01 : 0.18 }} className={`mt-8 grid gap-4 ${session.canSignup ? 'sm:grid-cols-2' : ''}`}>
                <motion.button layoutId="booking-surface" whileTap={reduceMotion ? undefined : { scale: 0.985 }} type="button" disabled={endPending || loading} onClick={() => setMode('booking')} className="rounded-2xl bg-blue-600 p-6 text-left text-white shadow-[0_18px_42px_rgba(33,85,217,0.18)] transition-colors hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60">
                  <CalendarDays className="h-8 w-8" />
                  <strong className="mt-4 block text-xl">다음 예약 일정 잡기</strong>
                  <span className="mt-1 block text-sm font-semibold text-blue-100">한 달 이내 날짜와 가능한 코쿤을 선택합니다.</span>
                </motion.button>
                {session.canSignup && session.signupUrl ? (
                  <section aria-label="울주 AI 회원가입 QR" className="rounded-2xl border-2 border-[#C8734D]/60 bg-[#F5F0E8] p-6 text-center text-[#15243A]">
                    <QrCode className="mx-auto h-8 w-8 text-[#C8734D]" />
                    <strong className="mt-3 block text-xl">울주 AI 회원으로 이어서 이용하기</strong>
                    <p className="mt-2 text-sm font-semibold leading-6 text-[#6E6A63]">QR을 스캔하면 코쿤 예약 페이지로 이동합니다.<br />원하는 날짜와 시간을 선택한 뒤 소셜 로그인으로 예약해 주세요.</p>
                    {qrDataUrl ? <Image unoptimized width={320} height={320} src={qrDataUrl} alt="울주 AI 홈페이지 소셜 로그인 및 회원가입 QR 코드" className="mx-auto mt-4 h-64 w-64 bg-white p-4" /> : <Loader2 className="mx-auto mt-8 h-9 w-9 animate-spin text-[#C8734D]" />}
                    <p className="mt-3 text-xs font-bold text-[#6E6A63]">휴대폰 카메라 앱으로 QR을 비춰 주세요</p>
                    <p className="mt-1 break-all text-[11px] font-semibold text-[#6E6A63]">ulju.ulsan.kr/ujai/reservation/cocoon</p>
                  </section>
                ) : null}
              </motion.div>
            ) : null}

            {mode === 'booking' ? <motion.div key="booking" layoutId="booking-surface" className="mt-7 rounded-[1.5rem] bg-[#fbf8f4]" initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduceMotion ? 0.01 : bookingMotion.shared }}><FollowupBookingFlow session={session} onBack={() => setMode('choices')} onBookingSnapshot={setBookingSnapshot} onBook={onBook ?? ((request) => createFollowupReservation(session.kioskId, request))} /></motion.div> : null}
            </AnimatePresence>

            {error || resumeError ? <p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 font-semibold text-red-700">{error || resumeError}</p> : null}
            {mode === 'choices' ? (
              <>
                {endPending ? <p className="mt-5 text-sm font-semibold text-zinc-500" aria-live="polite">이용 종료를 저장하고 있습니다…</p> : null}
                <button type="button" disabled={loading || endPending} onClick={() => void dismiss()} className="mt-7 rounded-full px-5 py-3 font-bold text-zinc-500 hover:bg-zinc-100 disabled:cursor-wait disabled:opacity-50">예약하지 않고 이용 마치기</button>
              </>
            ) : null}
          </>
        )}
        </AnimatePresence>
      </motion.section>
      </LayoutGroup>
    </div>
  );
}
