'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useBrowserTts } from '@/hooks/useBrowserTts';
import type { MissionSnapshot } from './types';

export type SetMissionGuideAudio = (active: boolean, sessionId: string, playbackId: string) => Promise<boolean>;
const MAX_GUIDE_PLAYBACK_MS = 27_000;
const SPEAKER_TAIL_MS = 300;
export const MISSION_GUIDE_AUDIO_RELEASE_EVENT = 'realtime-en:mission-guide-audio-release';
type GuideLease = { sessionId: string; playbackId: string; releasePromise?: Promise<void> };

export function useMissionGuideAudio({ enabled, snapshot, setGuideAudio }: {
  enabled: boolean;
  snapshot: MissionSnapshot | null;
  setGuideAudio?: SetMissionGuideAudio;
}) {
  const { speak: speakTts, cancel: cancelTts } = useBrowserTts('mission-learning');
  const [error, setError] = useState<string | null>(null);
  const generationRef = useRef(0);
  const leaseRef = useRef<GuideLease | null>(null);
  const pendingReleaseRef = useRef<Promise<void> | null>(null);
  const timerRef = useRef<number | null>(null);
  const release = useCallback((lease: GuideLease) => {
    if (lease.releasePromise) return lease.releasePromise;
    if (leaseRef.current?.playbackId === lease.playbackId) leaseRef.current = null;
    lease.releasePromise = (async () => {
      // Cancellation has an acoustic tail too. Hold the gate until the speaker settles.
      await new Promise((resolve) => window.setTimeout(resolve, SPEAKER_TAIL_MS));
      try { await setGuideAudio?.(false, lease.sessionId, lease.playbackId); }
      catch { /* The server's bounded lease also releases after disconnect/timeout. */ }
    })();
    pendingReleaseRef.current = lease.releasePromise;
    return lease.releasePromise;
  }, [setGuideAudio]);

  const cancel = useCallback(() => {
    generationRef.current += 1;
    cancelTts();
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    if (leaseRef.current) void release(leaseRef.current);
  }, [release, cancelTts]);

  const speak = useCallback(async (text: string, slow = false) => {
    if (!enabled || !text.trim()) return;
    cancel();
    setError(null);
    const generation = generationRef.current;
    await pendingReleaseRef.current;
    if (generation !== generationRef.current) return;
    // Include acquisition/ack latency in the limit so local speech stops before server expiry.
    timerRef.current = window.setTimeout(() => {
      cancel();
      setError('음성 재생 시간이 길어 중단했어요. 다시 눌러 주세요.');
    }, MAX_GUIDE_PLAYBACK_MS);
    let lease: GuideLease | null = null;
    if (snapshot?.stage === 'ROLEPLAY') {
      lease = { sessionId: snapshot.sessionId, playbackId: crypto.randomUUID() };
      leaseRef.current = lease;
      let accepted = false;
      try { accepted = await setGuideAudio?.(true, lease.sessionId, lease.playbackId) ?? false; }
      catch { /* Failure to pause capture must not start playback. */ }
      if (generation !== generationRef.current) { await release(lease); return; }
      if (!accepted) {
        if (timerRef.current) window.clearTimeout(timerRef.current);
        timerRef.current = null;
        void release(lease);
        setError('도움 카드 음성을 준비하지 못했어요. 화면의 문장을 보고 연습해 주세요.');
        return;
      }
    }
    try {
      await speakTts(text, 'en-US', slow ? 0.7 : undefined);
    } catch {
      if (generation === generationRef.current) setError('음성을 재생하지 못했어요. 다시 눌러 주세요.');
    } finally {
      if (generation === generationRef.current) {
        if (timerRef.current) window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (lease) await release(lease);
    }
  }, [cancel, enabled, release, setGuideAudio, snapshot, speakTts]);

  useEffect(() => () => cancel(), [cancel, enabled, snapshot?.sessionId, snapshot?.stage]);
  useEffect(() => {
    const handleRelease = (event: Event) => {
      const detail = (event as CustomEvent<{ playbackId?: string }>).detail;
      if (!detail?.playbackId || detail.playbackId !== leaseRef.current?.playbackId) return;
      cancel();
      setError('음성 재생이 중단됐어요. 다시 눌러 주세요.');
    };
    window.addEventListener(MISSION_GUIDE_AUDIO_RELEASE_EVENT, handleRelease);
    return () => window.removeEventListener(MISSION_GUIDE_AUDIO_RELEASE_EVENT, handleRelease);
  }, [cancel]);
  return { speak, cancel, error };
}
