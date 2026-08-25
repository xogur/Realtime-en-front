'use client';

import type { PresenceStatus } from './usePresenceDetector';

const PRESENTATION: Record<PresenceStatus, { label: string; className: string }> = {
  disabled: { label: '준비됨', className: 'bg-zinc-400/70' },
  starting: { label: '준비 중', className: 'bg-zinc-300 animate-pulse' },
  ready: { label: '준비됨', className: 'bg-emerald-400' },
  present: { label: '감지됨', className: 'bg-sky-400 animate-pulse' },
  unavailable: { label: '잠시 후 다시 시도', className: 'bg-amber-400' },
};

export function PresenceStatusBadge({ status }: { status: PresenceStatus }) {
  const presentation = PRESENTATION[status];
  return (
    <div
      className="pointer-events-none absolute right-4 top-4 z-40 flex items-center gap-2 rounded-full border border-white/30 bg-black/20 px-2.5 py-1 text-[10px] font-bold tracking-wide text-white/75 backdrop-blur-sm"
      aria-label="시스템 준비 상태"
      data-presence-status={status}
    >
      <span className={`h-2 w-2 rounded-full shadow-[0_0_10px_currentColor] ${presentation.className}`} />
      <span>{presentation.label}</span>
    </div>
  );
}
