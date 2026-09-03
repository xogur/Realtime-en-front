'use client';

import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, CalendarDays, Loader2 } from 'lucide-react';
import { BookingCalendar } from './BookingCalendar';
import { BookingStepper } from './BookingStepper';
import { CocoonSelector } from './CocoonSelector';
import { TimeSlotPicker } from './TimeSlotPicker';
import { addCalendarMonth, DURATION_OPTIONS, localDateValue, parseLocalDate, type BookingStep } from './bookingModel';
import { getAvailabilityCalendar, getDayAvailability, ReservationApiError } from './reservationFollowupApi';
import type { Availability, AvailabilityCalendar, AvailabilitySlot, AvailableRoom, DurationMinutes, UsageSession } from './types';
import { getKioskDisplayCocoon } from './cocoonSceneModel';
import { SelectionRibbon, SpatialHandoffOverlay } from './BookingTransitionElements';
import { bookingMotion, type BookingVisualSnapshot } from './bookingMotion';

type State = { step: BookingStep; month: Date; date: string | null; duration: DurationMinutes; slot: AvailabilitySlot | null; room: AvailableRoom | null; calendar: AvailabilityCalendar | null; day: Availability | null; calendarLoading: boolean; dayLoading: boolean; submitting: boolean; error: string | null };
type Action = { type: 'calendar-loading' } | { type: 'calendar'; value: AvailabilityCalendar } | { type: 'day-loading' } | { type: 'day'; value: Availability } | { type: 'date'; value: string } | { type: 'duration'; value: DurationMinutes } | { type: 'slot'; value: AvailabilitySlot } | { type: 'room'; value: AvailableRoom } | { type: 'step'; value: BookingStep } | { type: 'month'; value: Date } | { type: 'submitting'; value: boolean } | { type: 'error'; value: string | null };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'calendar-loading': return { ...state, calendarLoading: true, error: null };
    case 'calendar': return { ...state, calendar: action.value, calendarLoading: false };
    case 'day-loading': return { ...state, dayLoading: true, error: null };
    case 'day': return { ...state, day: action.value, dayLoading: false };
    case 'date': return { ...state, date: action.value, slot: null, room: null, step: 'time', day: null };
    case 'duration': return { ...state, duration: action.value, slot: null, room: null, day: null, step: state.date ? 'time' : 'date' };
    case 'slot': return { ...state, slot: action.value, room: null, step: 'cocoon' };
    case 'room': return { ...state, room: action.value };
    case 'step': return { ...state, step: action.value, ...(action.value === 'date' ? { slot: null, room: null } : action.value === 'time' ? { room: null } : {}) };
    case 'month': return { ...state, month: action.value };
    case 'submitting': return { ...state, submitting: action.value };
    case 'error': return { ...state, error: action.value, calendarLoading: false, dayLoading: false };
  }
}

export function FollowupBookingFlow({ session, onBack, onBook, onBookingSnapshot }: { session: UsageSession; onBack: () => void; onBook: (request: { reservationId: number; date: string; startTime: string; durationMinutes: DurationMinutes; roomId: number }) => Promise<UsageSession>; onBookingSnapshot?: (snapshot: BookingVisualSnapshot) => void }) {
  const today = useMemo(() => new Date(), []); const min = localDateValue(today); const max = localDateValue(addCalendarMonth(today));
  const [state, dispatch] = useReducer(reducer, { step: 'date', month: new Date(today.getFullYear(), today.getMonth(), 1), date: null, duration: 30, slot: null, room: null, calendar: null, day: null, calendarLoading: true, dayLoading: false, submitting: false, error: null });
  const calendarRequest = useRef<AbortController | null>(null); const dayRequest = useRef<AbortController | null>(null); const reduceMotion = useReducedMotion();
  const flowRoot = useRef<HTMLDivElement | null>(null);
  const [spatialIntro, setSpatialIntro] = useState(false);
  const spatialTimer = useRef<number | null>(null);
  const currentRoomNumber = getKioskDisplayCocoon(session.kioskId, session.currentRoomNumber);

  useEffect(() => { const controller = new AbortController(); calendarRequest.current?.abort(); calendarRequest.current = controller; dispatch({ type: 'calendar-loading' }); getAvailabilityCalendar(session.kioskId, min, max, state.duration, controller.signal).then((value) => dispatch({ type: 'calendar', value })).catch((reason) => { if (reason?.name !== 'AbortError') dispatch({ type: 'error', value: reason instanceof Error ? reason.message : '날짜를 불러오지 못했습니다.' }); }); return () => controller.abort(); }, [max, min, session.kioskId, state.duration]);
  useEffect(() => { if (!state.date) return; const controller = new AbortController(); dayRequest.current?.abort(); dayRequest.current = controller; dispatch({ type: 'day-loading' }); getDayAvailability(session.kioskId, state.date, state.duration, controller.signal).then((value) => dispatch({ type: 'day', value })).catch((reason) => { if (reason?.name !== 'AbortError') dispatch({ type: 'error', value: reason instanceof Error ? reason.message : '시간을 불러오지 못했습니다.' }); }); return () => controller.abort(); }, [session.kioskId, state.date, state.duration]);
  useEffect(() => { const container = flowRoot.current?.closest('section'); if (container) container.scrollTop = 0; }, [state.step]);
  useEffect(() => { if (state.step === 'time') void import('./CocoonSceneCanvas'); }, [state.step]);
  useEffect(() => () => { if (spatialTimer.current !== null) window.clearTimeout(spatialTimer.current); }, []);

  const submit = async () => { if (!state.date || !state.slot || !state.room || state.submitting) return; dispatch({ type: 'submitting', value: true }); dispatch({ type: 'error', value: null }); onBookingSnapshot?.({ dateLabel: selectedDateLabel ?? state.date, startTime: state.slot.startTime, endTime: state.slot.nominalEndTime, roomNumber: state.room.roomNumber }); try { await onBook({ reservationId: session.reservationId, date: state.date, startTime: state.slot.startTime, durationMinutes: state.duration, roomId: state.room.roomId }); } catch (reason) { if (reason instanceof ReservationApiError && reason.status === 409) { try { const fresh = await getDayAvailability(session.kioskId, state.date, state.duration); dispatch({ type: 'day', value: fresh }); const matching = fresh.slots.find((slot) => slot.startTime === state.slot?.startTime && (slot.status ?? 'available') === 'available'); if (matching) { dispatch({ type: 'slot', value: matching }); dispatch({ type: 'error', value: '선택한 코쿤이 방금 예약되었습니다. 다른 코쿤을 선택해 주세요.' }); } else { dispatch({ type: 'step', value: 'time' }); dispatch({ type: 'error', value: '선택한 시간이 마감되었습니다. 다른 시간을 선택해 주세요.' }); } } catch { dispatch({ type: 'error', value: '최신 예약 현황을 불러오지 못했습니다.' }); } } else dispatch({ type: 'error', value: reason instanceof Error ? reason.message : '예약을 완료하지 못했습니다.' }); } finally { dispatch({ type: 'submitting', value: false }); } };
  const selectedDateLabel = state.date ? new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' }).format(parseLocalDate(state.date)) : null;
  const selectSlot = (value: AvailabilitySlot) => {
    dispatch({ type: 'slot', value });
    if (reduceMotion) return;
    setSpatialIntro(true);
    if (spatialTimer.current !== null) window.clearTimeout(spatialTimer.current);
    spatialTimer.current = window.setTimeout(() => setSpatialIntro(false), bookingMotion.spatialIntro * 1000);
  };
  return <div ref={flowRoot} className="text-left [--booking-primary:#2155d9]">
    <div className="mb-5 flex items-center justify-between"><button type="button" onClick={onBack} className="flex min-h-11 items-center gap-2 rounded-full px-3 font-bold text-zinc-600 hover:bg-[#eeeae4]"><ArrowLeft className="h-5 w-5" />종료 화면</button><span className="flex items-center gap-2 text-sm font-bold text-zinc-500"><CalendarDays className="h-4 w-4" />한 달 이내 예약</span></div>
    <BookingStepper step={state.step} onReopen={(value) => dispatch({ type: 'step', value })} />
    <SelectionRibbon dateLabel={selectedDateLabel} startTime={state.slot?.startTime ?? null} endTime={state.slot?.nominalEndTime ?? null} onDate={() => dispatch({ type: 'step', value: 'date' })} onTime={() => dispatch({ type: 'step', value: 'time' })} />
    <div className="my-5 flex items-center justify-between gap-2 rounded-2xl border border-[#ded8cf] bg-white px-3 py-3 sm:gap-4 sm:px-4"><span className="whitespace-nowrap text-sm font-black text-[#15243a] sm:text-base">이용 시간</span><div className="flex rounded-xl bg-[#eeeae4] p-1">{DURATION_OPTIONS.map((value) => <button type="button" key={value} aria-pressed={state.duration === value} onClick={() => dispatch({ type: 'duration', value })} className={`min-h-10 rounded-lg px-4 font-black transition sm:px-5 ${state.duration === value ? 'bg-white text-[#2155d9] shadow-sm' : 'text-zinc-500'}`}>{value}분</button>)}</div></div>
    {(state.calendarLoading || state.dayLoading) && <div className="h-1 overflow-hidden rounded-full bg-blue-100"><motion.div className="h-full bg-[#2155d9]" initial={{ width: reduceMotion ? '62%' : '33%' }} animate={reduceMotion ? undefined : { x: ['-100%', '300%'] }} transition={reduceMotion ? undefined : { duration: 1.2, repeat: Infinity }} /></div>}
    <AnimatePresence mode="sync"><motion.div key={state.step} initial={reduceMotion ? false : { opacity: 0, y: state.step === 'cocoon' ? 8 : 16 }} animate={{ opacity: 1, y: 0 }} exit={reduceMotion ? undefined : { opacity: 0, y: -8 }} transition={{ duration: reduceMotion ? 0.01 : bookingMotion.panel, ease: bookingMotion.easeOut }} className="mt-6">
      {state.step === 'date' && <BookingCalendar month={state.month} min={min} max={max} days={state.calendar?.days ?? []} selected={state.date} loading={state.calendarLoading} onMonthChange={(month) => dispatch({ type: 'month', value: month })} onSelect={(value) => dispatch({ type: 'date', value })} />}
      {state.step === 'time' && <TimeSlotPicker slots={state.day?.slots ?? []} selected={state.slot} loading={state.dayLoading} onSelect={selectSlot} />}
      {state.step === 'cocoon' && state.slot && <section><p className="text-sm font-black text-[#2155d9]">STEP 3</p><h3 className="mt-1 mb-5 text-2xl font-black text-[#15243a]">어느 코쿤을 이용할까요?</h3><div className="relative"><CocoonSelector currentRoomNumber={currentRoomNumber} rooms={state.slot.availableRooms} selectedRoom={state.room} disabled={state.submitting || spatialIntro} onSelect={(value) => dispatch({ type: 'room', value })} />{spatialIntro ? <SpatialHandoffOverlay /> : null}</div></section>}
    </motion.div></AnimatePresence>
    {state.error && <p role="alert" className="mt-5 rounded-2xl bg-red-50 p-4 font-bold text-red-700">{state.error}</p>}
    {state.step === 'cocoon' && <div className="sticky bottom-0 -mx-2 mt-5 flex items-center justify-between gap-4 border-t border-[#ded8cf] bg-[#fbf8f4]/95 px-2 pt-4 backdrop-blur"><p className="hidden text-sm font-bold text-zinc-500 sm:block">{state.room ? `코쿤 ${state.room.roomNumber} · ${selectedDateLabel} ${state.slot?.startTime}` : '코쿤을 선택하면 예약할 수 있어요.'}</p><button type="button" disabled={!state.room || state.submitting} onClick={() => void submit()} className="ml-auto flex min-h-14 min-w-48 items-center justify-center gap-2 rounded-2xl bg-[#2155d9] px-7 font-black text-white shadow-lg shadow-blue-900/20 hover:bg-[#1746be] disabled:bg-zinc-300 disabled:shadow-none">{state.submitting && <Loader2 className="h-5 w-5 animate-spin" />}{state.submitting ? '예약 확인 중…' : '이 일정으로 예약'}</button></div>}
  </div>;
}
