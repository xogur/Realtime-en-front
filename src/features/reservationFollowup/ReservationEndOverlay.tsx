'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Check, Loader2, QrCode } from 'lucide-react';
import QRCode from 'qrcode';
import Image from 'next/image';
import type { ReservationIntroRole } from '@/features/reservationIntro/types';
import { addOneCalendarMonth, dateInputValue, getReservationSessionApiUrl } from './model';
import type { Availability, AvailableRoom, AvailabilitySlot, UsageSession } from './types';

type Props = {
  role: ReservationIntroRole;
  session: UsageSession | null;
  endPending?: boolean;
  onDismiss?: () => Promise<void>;
};

export function ReservationEndOverlay({ role, session, endPending = false, onDismiss }: Props) {
  const today = useMemo(() => new Date(), []);
  const [mode, setMode] = useState<'choices' | 'booking'>('choices');
  const [date, setDate] = useState(dateInputValue(today));
  const [duration, setDuration] = useState(30);
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<AvailableRoom | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [returnCountdown, setReturnCountdown] = useState<number | null>(null);
  const availabilityRequest = useRef<AbortController | null>(null);
  const sessionKioskId = session?.kioskId;
  const sessionReservationId = session?.reservationId;

  useEffect(() => {
    setMode('choices');
    setAvailability(null);
    setSelectedSlot(null);
    setSelectedRoom(null);
    setError(null);
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
    if (session?.status !== 'booked' || !session.followup) {
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
  }, [session?.followup?.reservationId, session?.kioskId, session?.reservationId, session?.status]);

  useEffect(() => {
    if (mode !== 'booking' || !sessionKioskId || !sessionReservationId) return;
    availabilityRequest.current?.abort();
    const controller = new AbortController();
    availabilityRequest.current = controller;
    setLoading(true);
    setError(null);
    setSelectedSlot(null);
    setSelectedRoom(null);
    const url = new URL(`${getReservationSessionApiUrl(sessionKioskId)}/availability`);
    url.searchParams.set('date', date);
    url.searchParams.set('durationMinutes', String(duration));
    void fetch(url, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => null) as { detail?: string } | null;
          throw new Error(body?.detail || '예약 가능 시간을 불러오지 못했습니다.');
        }
        return response.json() as Promise<Availability>;
      })
      .then(setAvailability)
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === 'AbortError')) {
          setError(reason instanceof Error ? reason.message : '예약 가능 시간을 불러오지 못했습니다.');
        }
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [date, duration, mode, sessionKioskId, sessionReservationId]);

  if (!session || session.status === 'active') return null;
  const isController = role === 'avatar';

  const submit = async () => {
    if (!selectedSlot || !selectedRoom) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${getReservationSessionApiUrl(session.kioskId)}/followup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reservationId: session.reservationId,
          date,
          startTime: selectedSlot.startTime,
          durationMinutes: duration,
          roomId: selectedRoom.roomId,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { detail?: string } | null;
        throw new Error(body?.detail || '예약을 완료하지 못했습니다.');
      }
      // The polling hook will replace the session with the authoritative booked response.
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '예약을 완료하지 못했습니다.');
      setAvailability(null);
    } finally {
      setLoading(false);
    }
  };

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

  return (
    <div className="fixed inset-0 z-[2147483646] flex min-h-[100dvh] items-center justify-center bg-zinc-950/35 p-6 backdrop-blur-[18px]" role="dialog" aria-modal="true" aria-label="예약 이용 종료">
      <section className="max-h-[92dvh] w-full max-w-3xl overflow-y-auto rounded-[2rem] border border-white/70 bg-[#fbf8f4] px-7 py-8 text-center shadow-[0_30px_110px_rgba(24,24,27,0.3)] sm:px-12">
        {session.status === 'booked' && session.followup ? (
          <>
            <Check className="mx-auto h-16 w-16 rounded-full bg-emerald-600 p-3 text-white" />
            <h2 className="mt-5 text-3xl font-black text-zinc-900">다음 예약이 완료되었습니다</h2>
            <p className="mt-4 text-xl font-bold text-zinc-700">
              {new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'long', timeStyle: 'short' }).format(new Date(session.followup.startAt))}
              {' · '}코쿤 {session.followup.roomNumber}번
            </p>
            <p className="mt-3 font-semibold text-zinc-500">예약 시간에 해당 코쿤으로 오시면 자동으로 이용을 시작합니다.</p>
            {returnCountdown !== null ? (
              <p className="mt-5 text-sm font-extrabold text-blue-700" aria-live="polite">
                {returnCountdown}초 후 메인 영어 프로젝트 화면으로 돌아갑니다.
              </p>
            ) : null}
          </>
        ) : session.status === 'dismissed' ? (
          <>
            <Check className="mx-auto h-16 w-16 rounded-full bg-zinc-700 p-3 text-white" />
            <h2 className="mt-5 text-3xl font-black text-zinc-900">이용이 종료되었습니다</h2>
            <p className="mt-3 text-lg font-semibold text-zinc-500">다음 예약 이용자를 기다리고 있습니다.</p>
          </>
        ) : !isController ? (
          <>
            <CalendarDays className="mx-auto h-16 w-16 rounded-2xl bg-blue-600 p-3 text-white" />
            <h2 className="mt-5 text-3xl font-black text-zinc-900">예약하신 사용 시간이 끝났습니다</h2>
            <p className="mt-3 text-lg font-semibold text-zinc-500">
              {session.canSignup
                ? '왼쪽 화면에서 다음 예약 또는 회원가입 QR을 이용해 주세요.'
                : '왼쪽 화면에서 다음 예약을 선택해 주세요.'}
            </p>
          </>
        ) : (
          <>
            <h2 className="text-3xl font-black text-zinc-900">예약하신 사용 시간이 끝났습니다</h2>
            <p className="mt-2 text-lg font-semibold text-zinc-500">다음 이용을 간편하게 예약할 수 있어요.</p>

            {mode === 'choices' ? (
              <div className={`mt-8 grid gap-4 ${session.canSignup ? 'sm:grid-cols-2' : ''}`}>
                <button type="button" disabled={endPending || loading} onClick={() => setMode('booking')} className="rounded-2xl bg-blue-600 p-6 text-left text-white transition hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60">
                  <CalendarDays className="h-8 w-8" />
                  <strong className="mt-4 block text-xl">다음 예약 일정 잡기</strong>
                  <span className="mt-1 block text-sm font-semibold text-blue-100">한 달 이내 날짜와 가능한 코쿤을 선택합니다.</span>
                </button>
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
              </div>
            ) : null}

            {mode === 'booking' ? (
              <div className="mt-7 text-left">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="font-bold text-zinc-700">날짜
                    <input type="date" value={date} min={dateInputValue(today)} max={dateInputValue(addOneCalendarMonth(today))} onChange={(event) => setDate(event.target.value)} className="mt-2 w-full rounded-xl border border-zinc-300 bg-white px-4 py-3" />
                  </label>
                  <label className="font-bold text-zinc-700">이용 시간
                    <select value={duration} onChange={(event) => setDuration(Number(event.target.value))} className="mt-2 w-full rounded-xl border border-zinc-300 bg-white px-4 py-3">
                      <option value={30}>30분</option><option value={60}>60분</option>
                    </select>
                  </label>
                </div>
                {loading && !availability ? <Loader2 className="mx-auto mt-8 h-8 w-8 animate-spin text-blue-600" /> : null}
                {availability?.message ? <p className="mt-6 rounded-xl bg-amber-50 p-4 font-semibold text-amber-800">{availability.message}</p> : null}
                {availability?.slots.length ? (
                  <div className="mt-6">
                    <p className="font-black text-zinc-800">시간 선택</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {availability.slots.map((slot) => (
                        <button key={slot.startTime} type="button" onClick={() => { setSelectedSlot(slot); setSelectedRoom(null); }} className={`rounded-full px-4 py-2 font-bold ${selectedSlot?.startTime === slot.startTime ? 'bg-blue-600 text-white' : 'bg-white text-zinc-700 ring-1 ring-zinc-200'}`}>
                          {slot.startTime}–{slot.nominalEndTime}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {selectedSlot ? (
                  <div className="mt-6">
                    <p className="font-black text-zinc-800">예약 가능한 코쿤</p>
                    <div className="mt-3 flex gap-2">
                      {selectedSlot.availableRooms.map((room) => (
                        <button key={room.roomId} type="button" onClick={() => setSelectedRoom(room)} className={`rounded-xl px-5 py-3 font-black ${selectedRoom?.roomId === room.roomId ? 'bg-blue-600 text-white' : 'bg-white text-zinc-700 ring-1 ring-zinc-200'}`}>코쿤 {room.roomNumber}번</button>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div className="mt-7 flex justify-end gap-3">
                  <button type="button" onClick={() => setMode('choices')} className="rounded-full px-5 py-3 font-bold text-zinc-600">이전</button>
                  <button type="button" disabled={!selectedRoom || loading} onClick={() => void submit()} className="rounded-full bg-blue-600 px-7 py-3 font-black text-white disabled:bg-zinc-300">{loading ? '예약 확인 중…' : '이 일정으로 예약'}</button>
                </div>
              </div>
            ) : null}

            {error ? <p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 font-semibold text-red-700">{error}</p> : null}
            {mode === 'choices' ? (
              <>
                {endPending ? <p className="mt-5 text-sm font-semibold text-zinc-500" aria-live="polite">이용 종료를 저장하고 있습니다…</p> : null}
                <button type="button" disabled={loading || endPending} onClick={() => void dismiss()} className="mt-7 rounded-full px-5 py-3 font-bold text-zinc-500 hover:bg-zinc-100 disabled:cursor-wait disabled:opacity-50">예약하지 않고 이용 마치기</button>
              </>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
