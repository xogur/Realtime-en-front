'use client';

import { useEffect } from 'react';

// One delegated listener also covers dialogs, dynamically added buttons and
// keyboard activation. A short synthesized tap needs no network request.
export function ButtonClickSound() {
  useEffect(() => {
    let context: AudioContext | null = null;
    let disposed = false;
    let lastPlayed = -Infinity;

    const handleClick = async (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest('button, [role="button"], input[type="button"], input[type="submit"], input[type="reset"]');
      if (!button || button.matches(':disabled') || button.closest('[aria-disabled="true"], [inert]')) return;
      try {
        const AudioContextClass = window.AudioContext
          ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioContextClass) return;
        context ??= new AudioContextClass();
        if (context.state === 'suspended') await context.resume();
        if (disposed || context.state !== 'running') return;
        const now = context.currentTime;
        if (now - lastPlayed < 0.04) return;
        lastPlayed = now;
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const limiter = context.createDynamicsCompressor();
        limiter.threshold.value = -3;
        limiter.knee.value = 0;
        limiter.ratio.value = 20;
        limiter.attack.value = 0;
        limiter.release.value = 0.05;
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(900, now);
        oscillator.frequency.exponentialRampToValueAtTime(480, now + 0.045);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(2.88, now + 0.003);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.055);
        oscillator.connect(gain);
        gain.connect(limiter);
        limiter.connect(context.destination);
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); limiter.disconnect(); };
        oscillator.start(now);
        oscillator.stop(now + 0.06);
      } catch {
        // Audio availability must never interfere with the button action.
      }
    };

    document.addEventListener('click', handleClick, true);
    return () => {
      disposed = true;
      document.removeEventListener('click', handleClick, true);
      if (context && context.state !== 'closed') void context.close().catch(() => undefined);
    };
  }, []);

  return null;
}
