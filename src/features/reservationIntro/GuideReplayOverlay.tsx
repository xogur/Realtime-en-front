'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useRef } from 'react';

const EXIT_TRANSITION_MS = 800;

type Props = {
  active: boolean;
  assetVersion: string;
  onClose: () => void;
};

export function GuideReplayOverlay({ active, assetVersion, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const video = videoRef.current;
    if (!active || !video) return;

    video.currentTime = 0;
    video.muted = false;
    void video.play().catch((error: unknown) => {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        video.muted = true;
        void video.play().catch(onClose);
        return;
      }
      onClose();
    });
  }, [active, assetVersion, onClose]);

  return (
    <AnimatePresence initial={false}>
      {active ? (
        <motion.div
          key={`guide-replay-${assetVersion}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : EXIT_TRANSITION_MS / 1000, ease: 'easeInOut' }}
          data-exit-duration-ms={EXIT_TRANSITION_MS}
          className="fixed inset-0 z-[2147483647] flex h-[100dvh] w-[100dvw] items-center justify-center overflow-hidden bg-[#080b12] text-white"
          role="dialog"
          aria-label="가이드 영상"
        >
          <video
            ref={videoRef}
            className="absolute inset-0 h-full w-full object-cover"
            src={`/experience/${encodeURIComponent(assetVersion)}/guide-intro.webm`}
            autoPlay
            playsInline
            preload="auto"
            onEnded={onClose}
            onError={onClose}
          />
          <button
            type="button"
            onClick={onClose}
            className="absolute bottom-10 right-10 z-10 min-h-12 rounded-full border border-white/30 bg-black/45 px-7 py-3 text-lg font-bold text-white backdrop-blur-md transition hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            건너뛰기
          </button>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
