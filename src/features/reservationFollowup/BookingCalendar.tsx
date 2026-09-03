'use client';

import { ChevronLeft, ChevronRight, LockKeyhole } from 'lucide-react';
import type { AvailabilityDay } from './types';
import { localDateValue, parseLocalDate } from './bookingModel';

const dayNames = ['일', '월', '화', '수', '목', '금', '토'];

export function BookingCalendar({ month, min, max, days, selected, loading, onMonthChange, onSelect }: {
  month: Date; min: string; max: string; days: AvailabilityDay[]; selected: string | null; loading: boolean;
  onMonthChange: (value: Date) => void; onSelect: (value: string) => void;
}) {
  const byDate = new Map(days.map((day) => [day.date, day]));
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first); start.setDate(1 - first.getDay());
  const cells = Array.from({ length: 42 }, (_, index) => { const value = new Date(start); value.setDate(start.getDate() + index); return value; });
  const canPrev = month.getFullYear() > parseLocalDate(min).getFullYear() || month.getMonth() > parseLocalDate(min).getMonth();
  const canNext = month.getFullYear() < parseLocalDate(max).getFullYear() || month.getMonth() < parseLocalDate(max).getMonth();
  const move = (delta: number) => onMonthChange(new Date(month.getFullYear(), month.getMonth() + delta, 1));
  const waitingForFirstCalendar = loading && days.length === 0;
  return <section aria-labelledby="booking-date-heading">
    <div className="mb-5 flex items-end justify-between gap-4"><div><p className="text-sm font-black text-[#2155d9]">STEP 1</p><h3 id="booking-date-heading" className="mt-1 text-2xl font-black text-[#15243a]">언제 다시 이용할까요?</h3></div>
      <div className="flex items-center gap-1"><button type="button" aria-label="이전 달" disabled={!canPrev} onClick={() => move(-1)} className="grid h-11 w-11 place-items-center rounded-full hover:bg-[#eeeae4] disabled:opacity-25"><ChevronLeft /></button><strong className="min-w-32 text-center text-lg text-[#15243a]">{month.getFullYear()}년 {month.getMonth() + 1}월</strong><button type="button" aria-label="다음 달" disabled={!canNext} onClick={() => move(1)} className="grid h-11 w-11 place-items-center rounded-full hover:bg-[#eeeae4] disabled:opacity-25"><ChevronRight /></button></div></div>
    {waitingForFirstCalendar ? <div aria-label="예약 가능 날짜를 불러오는 중" className="grid grid-cols-7 gap-1.5" aria-busy="true">
      {Array.from({ length: 42 }, (_, index) => <div key={index} className="min-h-16 animate-pulse rounded-2xl bg-zinc-200/65 motion-reduce:animate-none" />)}
    </div> : <div role="grid" aria-busy={loading} className="grid grid-cols-7 gap-1.5 tabular-nums">
      {dayNames.map((name, i) => <div key={name} role="columnheader" className={`pb-2 text-center text-sm font-black ${i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-600' : 'text-zinc-500'}`}>{name}</div>)}
      {cells.map((value) => { const date = localDateValue(value); const info = byDate.get(date); const inMonth = value.getMonth() === month.getMonth(); const disabled = !inMonth || date < min || date > max || !info || info.status === 'full' || info.status === 'closed'; const active = selected === date;
        const label = info?.status === 'closed' ? '휴관' : info?.status === 'full' ? '마감' : info ? `${info.availableSlotCount}개 시간` : loading ? '확인 중' : '';
        return <button role="gridcell" key={date} type="button" disabled={disabled} aria-selected={active} aria-label={`${value.getMonth()+1}월 ${value.getDate()}일 ${label}`} onClick={() => onSelect(date)} className={`relative min-h-16 rounded-2xl border p-1.5 text-left transition ${active ? 'border-[#2155d9] bg-[#2155d9] text-white shadow-lg shadow-blue-900/15' : disabled ? 'border-transparent bg-zinc-100/65 text-zinc-300' : info?.status === 'limited' ? 'border-amber-200 bg-amber-50 text-[#15243a] hover:-translate-y-0.5 hover:border-amber-400' : 'border-[#ded8cf] bg-white text-[#15243a] hover:-translate-y-0.5 hover:border-[#2155d9]'}`}>
          <span className="block text-base font-black">{value.getDate()}</span><span className={`mt-1 flex items-center gap-1 text-[11px] font-bold sm:text-xs ${active ? 'text-blue-100' : 'text-zinc-500'}`}>{(info?.status === 'full' || info?.status === 'closed') && <LockKeyhole className="h-3 w-3" />}{label}</span></button>; })}
    </div>}
  </section>;
}
