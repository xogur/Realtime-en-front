'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { StoryAudioClip } from './storyAudio';

export type ReadingSpeed = 'slow' | 'normal';
const RATE: Record<ReadingSpeed, number> = { normal: 1, slow: 0.8 };
const LOAD_TIMEOUT_MS = 10_000;
type PlayerState = {
  index: number; playing: boolean; finished: boolean; waiting: boolean;
  loading: boolean; blocked: boolean; error: string | null; progress: number; duration: number;
};
type Lease = { audio: HTMLAudioElement; index: number; wanted: boolean; intent: number; timer?: number; detach: () => void };
const INITIAL: PlayerState = { index: 0, playing: false, finished: false, waiting: false, loading: false, blocked: false, error: null, progress: 0, duration: 0 };

/** A sentence advances only when its own audio drains naturally. */
export function useSentencePlayer(sentences: readonly string[], speed: ReadingSpeed, isBlocked?: (index: number) => boolean, clips?: readonly StoryAudioClip[], singleSentence = false) {
  const [state, setState] = useState<PlayerState>(INITIAL);
  const stateRef = useRef(INITIAL);
  const inputs = useRef({ sentences, speed, isBlocked, clips, singleSentence });
  const leaseRef = useRef<Lease | null>(null);
  const mounted = useRef(true);
  useEffect(() => { inputs.current = { sentences, speed, isBlocked, clips, singleSentence }; }, [sentences, speed, isBlocked, clips, singleSentence]);
  const update = useCallback((patch: Partial<PlayerState>) => {
    stateRef.current = { ...stateRef.current, ...patch };
    if (mounted.current) setState(stateRef.current);
  }, []);
  const clearTimer = useCallback((lease: Lease) => { window.clearTimeout(lease.timer); lease.timer = undefined; }, []);
  const dispose = useCallback(() => {
    const lease = leaseRef.current;
    leaseRef.current = null;
    if (!lease) return;
    lease.wanted = false; lease.intent += 1;
    clearTimer(lease); lease.detach(); lease.audio.pause();
    lease.audio.removeAttribute('src'); lease.audio.load();
  }, [clearTimer]);

  const begin = useCallback(function beginPlayback(index: number, reset: boolean, released = false) {
    if (!mounted.current) return;
    const input = inputs.current;
    if (!released && input.isBlocked?.(index)) {
      dispose(); update({ index, playing: false, loading: false, finished: false, waiting: true, blocked: false, error: null, progress: 0 });
      return;
    }
    const clip = input.clips?.[index];
    if (!clip || clip.text !== input.sentences[index] || !clip.src.startsWith('/story-audio/') || clip.src.includes('..') || !Number.isFinite(clip.durationMs) || clip.durationMs <= 0) {
      dispose(); update({ index, playing: false, loading: false, finished: false, waiting: false, error: '이 문장의 음성을 준비하지 못했어요.' });
      return;
    }
    if (reset || leaseRef.current?.index !== index) dispose();
    let lease = leaseRef.current;
    if (!lease) {
      const audio = new Audio(clip.src);
      audio.preload = 'auto'; audio.preservesPitch = true;
      lease = { audio, index, wanted: false, intent: 0, detach: () => {} };
      leaseRef.current = lease;
      const owned = lease;
      const fail = (message: string) => {
        if (leaseRef.current !== owned || !owned.wanted) return;
        owned.wanted = false; owned.intent += 1; clearTimer(owned); audio.pause();
        update({ playing: false, loading: false, error: message });
      };
      const watchdog = () => {
        clearTimer(owned);
        if (owned.wanted) owned.timer = window.setTimeout(() => fail('음성을 불러오지 못했어요. 다시 재생해 주세요.'), LOAD_TIMEOUT_MS);
      };
      const progress = () => {
        if (leaseRef.current !== owned) return;
        const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : clip.durationMs / 1000;
        update({ progress: Math.min(1, Math.max(0, audio.currentTime / duration)), duration: duration * 1000 / RATE[inputs.current.speed] });
      };
      const ended = () => {
        if (leaseRef.current !== owned || !owned.wanted || !audio.ended) return;
        clearTimer(owned); owned.wanted = false;
        if (inputs.current.singleSentence || index + 1 >= inputs.current.sentences.length) { update({ playing: false, loading: false, finished: true, progress: 1 }); return; }
        beginPlayback(index + 1, true);
      };
      const error = () => fail('음성을 재생하지 못했어요. 다시 재생해 주세요.');
      const waiting = () => { if (leaseRef.current === owned && owned.wanted) { update({ loading: true, playing: false }); watchdog(); } };
      const playing = () => { if (leaseRef.current === owned && owned.wanted) { clearTimer(owned); update({ loading: false, playing: true }); } };
      const listeners: [string, () => void][] = [['ended', ended], ['error', error], ['timeupdate', progress], ['loadedmetadata', progress], ['waiting', waiting], ['playing', playing]];
      listeners.forEach(([event, handler]) => audio.addEventListener(event, handler));
      owned.detach = () => listeners.forEach(([event, handler]) => audio.removeEventListener(event, handler));
    }
    const owned = lease;
    owned.wanted = true;
    const intent = ++owned.intent;
    owned.audio.playbackRate = RATE[input.speed];
    update({ index, playing: false, loading: true, finished: false, waiting: false, blocked: false, error: null, ...(reset ? { progress: 0 } : {}), duration: clip.durationMs / RATE[input.speed] });
    clearTimer(owned);
    owned.timer = window.setTimeout(() => {
      if (leaseRef.current !== owned || owned.intent !== intent || !owned.wanted) return;
      owned.wanted = false; owned.intent += 1; owned.audio.pause();
      update({ playing: false, loading: false, error: '음성을 불러오지 못했어요. 다시 재생해 주세요.' });
    }, LOAD_TIMEOUT_MS);
    void (async () => {
      try {
        await owned.audio.play();
        if (leaseRef.current !== owned || owned.intent !== intent) { if (leaseRef.current === owned && !owned.wanted) owned.audio.pause(); return; }
        clearTimer(owned);
        update({ playing: true, loading: false });
      } catch (error) {
        if (leaseRef.current !== owned || owned.intent !== intent) return;
        clearTimer(owned); owned.wanted = false; owned.audio.pause();
        const blocked = typeof error === 'object' && error !== null && 'name' in error && error.name === 'NotAllowedError';
        update({ playing: false, loading: false, blocked, error: blocked ? null : '음성을 재생하지 못했어요. 다시 재생해 주세요.' });
      }
    })();
  }, [clearTimer, dispose, update]);

  const play = useCallback(() => {
    const current = stateRef.current;
    if (current.waiting || current.playing || current.loading) return;
    begin(current.finished ? 0 : current.index, current.finished || Boolean(current.error));
  }, [begin]);
  const pause = useCallback(() => {
    const lease = leaseRef.current;
    if (lease) { lease.wanted = false; lease.intent += 1; clearTimer(lease); lease.audio.pause(); }
    update({ playing: false, loading: false });
  }, [clearTimer, update]);
  const jump = useCallback((next: number, autoplay = true) => {
    if (!Number.isFinite(next)) return;
    const index = Math.max(0, Math.min(inputs.current.sentences.length - 1, Math.trunc(next)));
    if (autoplay) begin(index, true);
    else { dispose(); update({ ...INITIAL, index, waiting: Boolean(inputs.current.isBlocked?.(index)) }); }
  }, [begin, dispose, update]);
  const release = useCallback(() => {
    if (stateRef.current.waiting) begin(stateRef.current.index, true, true);
  }, [begin]);
  useEffect(() => {
    const lease = leaseRef.current;
    if (lease) {
      lease.audio.playbackRate = RATE[speed];
      update({ duration: (Number.isFinite(lease.audio.duration) && lease.audio.duration > 0 ? lease.audio.duration * 1000 : clips?.[lease.index]?.durationMs ?? 0) / RATE[speed] });
    }
  }, [speed, clips, update]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; dispose(); }; }, [dispose]);
  return { ...state, play, pause, jump, release };
}
