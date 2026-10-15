'use client';

import { Hand, Loader2 } from 'lucide-react';
import { useState } from 'react';

type Props = {
  visible: boolean;
  onStart: () => Promise<boolean>;
};

// Shown when a checked-in reservation is waiting but the camera has not
// confirmed anyone. A touch proves someone is in the booth, so it starts the
// reservation the same way a camera detection does.
export function PresenceTouchFallback({ visible, onStart }: Props) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!visible) return null;

  const start = async () => {
    if (pending) return;
    setPending(true);
    setFailed(false);
    try {
      await onStart();
    } catch (error) {
      console.warn('[presence] touch start failed', error);
      setFailed(true);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 top-24 z-[60] flex justify-center px-4">
      <button
        type="button"
        onClick={() => void start()}
        disabled={pending}
        aria-busy={pending}
        className="pointer-events-auto flex min-h-16 items-center gap-3 rounded-full border border-white/60 bg-blue-600 px-8 py-4 text-xl font-black text-white shadow-[0_18px_42px_rgba(33,85,217,0.35)] transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300 disabled:cursor-wait disabled:opacity-80"
      >
        {pending ? <Loader2 className="h-7 w-7 animate-spin" /> : <Hand className="h-7 w-7" />}
        <span>
          {failed ? '다시 눌러 시작하기' : '예약이 확인됐어요 · 눌러서 시작하기'}
        </span>
      </button>
    </div>
  );
}
