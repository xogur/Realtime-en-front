import { Check } from 'lucide-react';
import type { BookingStep } from './bookingModel';

const steps: { id: BookingStep; label: string }[] = [{ id: 'date', label: '날짜' }, { id: 'time', label: '시간' }, { id: 'cocoon', label: '코쿤' }];

export function BookingStepper({ step, onReopen }: { step: BookingStep; onReopen: (step: BookingStep) => void }) {
  const current = steps.findIndex((item) => item.id === step);
  return <nav aria-label="예약 단계" className="grid grid-cols-3 gap-2 rounded-2xl bg-[#eeeae4] p-2">
    {steps.map((item, index) => {
      const complete = index < current; const active = index === current;
      const content = <><span className={`grid h-7 w-7 place-items-center rounded-full text-sm ${active ? 'bg-[#2155d9] text-white' : complete ? 'bg-[#16815d] text-white' : 'bg-white text-zinc-500'}`}>{complete ? <Check className="h-4 w-4" /> : index + 1}</span><span>{item.label}</span></>;
      return complete ? <button key={item.id} type="button" onClick={() => onReopen(item.id)} className="flex min-h-12 items-center justify-center gap-2 rounded-xl font-black text-zinc-700 hover:bg-white/70">{content}</button>
        : <div key={item.id} aria-current={active ? 'step' : undefined} className={`flex min-h-12 items-center justify-center gap-2 rounded-xl font-black ${active ? 'bg-white text-[#15243a] shadow-sm' : 'text-zinc-400'}`}>{content}</div>;
    })}
  </nav>;
}
