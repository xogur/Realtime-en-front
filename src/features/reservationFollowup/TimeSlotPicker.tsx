'use client';

import { Check, Clock3 } from 'lucide-react';
import type { AvailabilitySlot } from './types';

export function TimeSlotPicker({ slots, selected, loading, onSelect }: { slots: AvailabilitySlot[]; selected: AvailabilitySlot | null; loading: boolean; onSelect: (slot: AvailabilitySlot) => void }) {
  const groups = [{ label: '오전', slots: slots.filter((slot) => slot.startTime < '12:00') }, { label: '오후', slots: slots.filter((slot) => slot.startTime >= '12:00') }];
  return <section aria-labelledby="booking-time-heading"><p className="text-sm font-black text-[#2155d9]">STEP 2</p><h3 id="booking-time-heading" className="mt-1 text-2xl font-black text-[#15243a]">이용할 시간을 선택하세요</h3>
    <div className={`mt-6 space-y-6 transition-opacity ${loading ? 'opacity-55' : ''}`}>{groups.map((group) => group.slots.length ? <div key={group.label}><h4 className="mb-3 flex items-center gap-2 font-black text-zinc-600"><Clock3 className="h-4 w-4" />{group.label}</h4><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{group.slots.map((slot) => { const status = slot.status ?? (slot.availableRooms.length ? 'available' : 'full'); const disabled = status !== 'available'; const active = selected?.startTime === slot.startTime; return <button key={slot.startTime} type="button" disabled={disabled} onClick={() => onSelect(slot)} className={`min-h-24 rounded-2xl border p-4 text-left transition ${active ? 'border-[#2155d9] bg-[#2155d9] text-white shadow-lg shadow-blue-900/15' : disabled ? 'border-zinc-200 bg-zinc-100 text-zinc-400' : 'border-[#ded8cf] bg-white text-[#15243a] hover:-translate-y-0.5 hover:border-[#2155d9]'}`}><span className="flex items-center justify-between text-xl font-black tabular-nums"><span>{slot.startTime} <span className="text-sm opacity-60">→</span> {slot.nominalEndTime}</span>{active && <Check className="h-5 w-5" />}</span><span className={`mt-2 block text-sm font-bold ${active ? 'text-blue-100' : ''}`}>{status === 'blocked' ? slot.unavailableReason || '강의 시간' : status === 'full' ? '예약 마감' : slot.availableRooms.length === 1 ? '코쿤 1개 남음' : `코쿤 ${slot.availableRooms.length}개`}</span></button>; })}</div></div> : null)}</div>
    {!loading && !slots.length ? <p className="mt-8 rounded-2xl bg-amber-50 p-6 text-center font-bold text-amber-800">이 날짜는 예약 가능한 시간이 없어요. 다른 날짜를 선택해 주세요.</p> : null}
  </section>;
}
