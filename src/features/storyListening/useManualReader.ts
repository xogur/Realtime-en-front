'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type ReaderState = { index: number; waiting: boolean; finished: boolean };
const INITIAL: ReaderState = { index: 0, waiting: false, finished: false };

/**
 * Sentence pager for stories whose narration is not recorded yet. Nothing
 * advances by itself: the learner turns each sentence, so no timer pretends
 * that narration finished. It mirrors the useSentencePlayer surface.
 */
export function useManualReader(count: number, isBlocked?: (index: number) => boolean) {
  const [state, setState] = useState<ReaderState>(INITIAL);
  const stateRef = useRef(INITIAL);
  const blockedRef = useRef(isBlocked);
  useEffect(() => { blockedRef.current = isBlocked; }, [isBlocked]);

  const set = useCallback((next: ReaderState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const show = useCallback((target: number) => {
    const index = Math.max(0, Math.min(count - 1, Math.trunc(target)));
    const waiting = Boolean(blockedRef.current?.(index));
    // Reaching the last sentence once counts as reading the chapter to the end.
    set({ index, waiting, finished: stateRef.current.finished || (!waiting && index === count - 1) });
  }, [count, set]);

  const jump = useCallback((target: number) => {
    if (Number.isFinite(target)) show(target);
  }, [show]);
  const next = useCallback(() => {
    const current = stateRef.current;
    if (!current.waiting && current.index + 1 < count) show(current.index + 1);
  }, [count, show]);
  const release = useCallback(() => {
    const current = stateRef.current;
    if (current.waiting) set({ ...current, waiting: false, finished: current.finished || current.index === count - 1 });
  }, [count, set]);
  const noop = useCallback(() => {}, []);

  return {
    ...state,
    playing: false, loading: false, blocked: false, error: null as string | null,
    progress: 1, duration: 0,
    play: noop, pause: noop, jump, next, release,
  };
}
