'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import type { ActiveReservationIntro, ReservationIntroCompletionReason, ReservationIntroRole } from './types';

const LAST_FRAME_OFFSET_SECONDS = 1 / 30;
const EXIT_TRANSITION_MS = 800;

function holdBrandLastFrame(video: HTMLVideoElement, brandDurationMs: number) {
  const authoredDurationSeconds = brandDurationMs / 1000;
  const mediaDurationSeconds = Number.isFinite(video.duration) && video.duration > 0
    ? video.duration
    : authoredDurationSeconds;
  const lastFrameSeconds = Math.max(0, mediaDurationSeconds - LAST_FRAME_OFFSET_SECONDS);
  if (Math.abs(video.currentTime - lastFrameSeconds) > 0.01) {
    video.currentTime = lastFrameSeconds;
  }
  video.pause();
}

type Props = {
  role: ReservationIntroRole;
  active: ActiveReservationIntro | null;
  onComplete: (reason: ReservationIntroCompletionReason) => void;
  onExitComplete?: () => void;
};

export function ReservationIntroOverlay({ role, active, onComplete, onExitComplete }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [brandMediaFailedFor, setBrandMediaFailedFor] = useState<string | null>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !active) return;
    if (role === 'avatar' && active.phase === 'guide') {
      holdBrandLastFrame(video, active.event.brandDurationMs);
      return;
    }
    // The logo animation starts from its own first frame as soon as the left
    // screen receives the event. Re-seeking it to the shared clock on every
    // 100 ms state update makes the opening frames visibly restart.
    const desiredSeconds = role === 'guide'
      ? Math.max(0, active.elapsedMs - active.event.brandDurationMs) / 1000
      : null;
    const syncPlayback = () => {
      if (desiredSeconds !== null && Number.isFinite(video.duration) && Math.abs(video.currentTime - desiredSeconds) > 0.45) {
        video.currentTime = Math.min(desiredSeconds, Math.max(0, video.duration - 0.05));
      }
      void video.play().then(() => {
      }).catch((error: unknown) => {
        if (role !== 'guide') return;
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        if (error instanceof DOMException && error.name === 'NotAllowedError') {
          // A normal browser tab may block unmuted autoplay. The kiosk launcher
          // permits sound; outside the launcher, keep the guide moving without
          // requiring a touch and fall back to muted playback.
          video.muted = true;
          void video.play().catch(() => onComplete('media_error'));
          return;
        }
        onComplete('media_error');
      });
    };
    if (video.readyState >= 1) syncPlayback();
    else video.addEventListener('loadedmetadata', syncPlayback, { once: true });
    return () => video.removeEventListener('loadedmetadata', syncPlayback);
  }, [active, role, onComplete]);

  if (!active) {
    return <AnimatePresence initial={false} onExitComplete={onExitComplete}>{null}</AnimatePresence>;
  }
  const assetBase = `/experience/${encodeURIComponent(active.event.assetVersion)}`;
  const brandMediaFailed = brandMediaFailedFor === active.event.eventId;

  return (
    <AnimatePresence initial={false} onExitComplete={onExitComplete}>
    <motion.div
      key={active.event.eventId}
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduceMotion ? 0 : EXIT_TRANSITION_MS / 1000, ease: 'easeIn' }}
      data-exit-duration-ms={EXIT_TRANSITION_MS}
      className="fixed inset-0 z-[2147483647] flex h-[100dvh] w-[100dvw] items-center justify-center overflow-hidden bg-[#080b12] text-white"
      role="dialog"
      aria-label="English program welcome guide"
    >
      {role === 'avatar' ? (
        !brandMediaFailed ? (
          <video
            ref={videoRef}
            className="absolute inset-0 h-full w-full object-cover"
            src={`${assetBase}/brand-bumper.webm`}
            autoPlay
            muted
            playsInline
            preload="auto"
            data-playback-state={active.phase === 'guide' ? 'held' : 'playing'}
            onEnded={(event) => holdBrandLastFrame(event.currentTarget, active.event.brandDurationMs)}
            onError={() => setBrandMediaFailedFor(active.event.eventId)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_center,#182238_0%,#080b12_70%)]">
            <div className="text-center">
              <p className="text-5xl font-black tracking-tight">ULJU AI English</p>
              <p className="mt-4 text-xl font-semibold text-white/60">Welcome</p>
            </div>
          </div>
        )
      ) : active.phase === 'brand' ? (
        <div className="h-full w-full bg-[radial-gradient(circle_at_center,#101827_0%,#080b12_72%)]" />
      ) : (
        <>
          <video
            ref={videoRef}
            className="absolute inset-0 h-full w-full object-cover"
            src={`${assetBase}/guide-intro.webm`}
            autoPlay
            playsInline
            preload="auto"
            onEnded={() => onComplete('ended')}
            onError={() => onComplete('media_error')}
          />
          <button
            type="button"
            onClick={() => onComplete('skipped')}
            className="absolute bottom-10 right-10 rounded-full border border-white/30 bg-black/45 px-7 py-3 text-lg font-bold text-white backdrop-blur-md transition hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            건너뛰기
          </button>
        </>
      )}
    </motion.div>
    </AnimatePresence>
  );
}
