'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useBrowserTts } from '@/hooks/useBrowserTts';
import type { MissionSnapshot } from './types';
import type { GuidedSnapshot } from './guided/types';
import { useGuidedLearningStore } from './guided/store';

export type SetMissionGuideAudio = (active: boolean, sessionId: string, playbackId: string, playbackSucceeded?: boolean, cancelRole?: { nodeId: string; attemptId: string }) => Promise<boolean>;
const MAX_GUIDE_PLAYBACK_MS = 27_000;
const SPEAKER_TAIL_MS = 300;
export const MISSION_GUIDE_AUDIO_RELEASE_EVENT = 'realtime-en:mission-guide-audio-release';
type GuideLease = { sessionId: string; playbackId: string; guided?: boolean; nodeId?: string; attemptId?: string; succeeded?: boolean; releasePromise?: Promise<boolean> };

export function useMissionGuideAudio({ enabled, snapshot, setGuideAudio }: {
  enabled: boolean;
  snapshot: MissionSnapshot | GuidedSnapshot | null;
  setGuideAudio?: SetMissionGuideAudio;
}) {
  const { speak: speakTts, cancel: cancelTts } = useBrowserTts('mission-learning');
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const roleAudio = useGuidedLearningStore(s => s.roleAudio);
  const generationRef = useRef(0);
  const leaseRef = useRef<GuideLease | null>(null);
  const pendingReleaseRef = useRef<Promise<boolean> | null>(null);
  const timerRef = useRef<number | null>(null);
  const release = useCallback((lease: GuideLease) => {
    if (lease.releasePromise) return lease.releasePromise;
    if (leaseRef.current?.playbackId === lease.playbackId) leaseRef.current = null;
    lease.releasePromise = (async () => {
      // Cancellation has an acoustic tail too. Hold the gate until the speaker settles.
      await new Promise((resolve) => window.setTimeout(resolve, SPEAKER_TAIL_MS));
      try {
        const released = lease.guided
          ? await setGuideAudio?.(false, lease.sessionId, lease.playbackId, lease.succeeded ?? false)
          : await setGuideAudio?.(false, lease.sessionId, lease.playbackId);
        if (!released) setError('음성 정리를 확인하지 못했어요. 다시 연결해 주세요.');
        return released === true;
      }
      catch { setError('음성 정리를 확인하지 못했어요. 다시 연결해 주세요.'); return false; }
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
    setIsPlaying(false);
  }, [release, cancelTts]);

  const cancelAndWait = useCallback(async () => {
    cancel();
    const state = useGuidedLearningStore.getState();
    const current = state.snapshot;
    const role = state.roleAudio;
    const g = current?.guided;
    if (current && current.sessionId === snapshot?.sessionId && (g?.audioOwner === 'ROLE' || role)) {
      if (!role || role.sessionId !== current.sessionId || role.nodeId !== g?.nodeId || role.attemptId !== g.attemptId) {
        setError('음성 정리를 확인하지 못했어요. 다시 연결해 주세요.');
        return false;
      }
      pendingReleaseRef.current = (async () => {
        try {
          const accepted = await setGuideAudio?.(false, role.sessionId, role.playbackId, false, { nodeId: role.nodeId, attemptId: role.attemptId });
          // If this exact playback finished on its own while the cancel was in flight,
          // the server refuses the cancel but has already broadcast its release.
          const released = accepted === true
            || useGuidedLearningStore.getState().releasedRolePlaybacks.includes(role.playbackId);
          if (!released) setError('음성 정리를 확인하지 못했어요. 다시 연결해 주세요.');
          return released;
        } catch { setError('음성 정리를 확인하지 못했어요. 다시 연결해 주세요.'); return false; }
      })();
    }
    const released = pendingReleaseRef.current ? await pendingReleaseRef.current : true;
    const latest = useGuidedLearningStore.getState();
    if (current && (latest.error || latest.snapshot?.sessionId !== current.sessionId
      || latest.snapshot?.guided?.nodeId !== g?.nodeId || latest.snapshot?.guided?.attemptId !== g?.attemptId
      || latest.roleAudio && latest.roleAudio.playbackId !== role?.playbackId)) {
      setError('수업 상황이 바뀌었어요. 현재 화면에서 다시 눌러 주세요.');
      return false;
    }
    return released;
  }, [cancel, setGuideAudio, snapshot?.sessionId]);
  const reconcileIdle = useCallback((authoritative: GuidedSnapshot | null) => {
    // Called only after an explicit authoritative GET. An unacknowledged
    // release cannot be repaired by an old render or an optimistic click.
    if (leaseRef.current || authoritative?.guided && authoritative.guided.audioOwner !== 'NONE') return;
    pendingReleaseRef.current = null;
    setError(null);
  }, []);

  const speak = useCallback(async (text: string | Array<{ text: string; language?: string; voice?: number }>, slow = false) => {
    const lines = typeof text === 'string' ? [{ text, language: 'en-US' }] : text;
    if (!enabled || !lines.some(line => line.text.trim())) return;
    const cancelled = cancelAndWait();
    const generation = generationRef.current;
    if (!await cancelled || generation !== generationRef.current) return;
    setError(null);
    setIsPlaying(true);
    // Include acquisition/ack latency in the limit so local speech stops before server expiry.
    timerRef.current = window.setTimeout(() => {
      cancel();
      setError('음성 재생 시간이 길어 중단했어요. 다시 눌러 주세요.');
    }, MAX_GUIDE_PLAYBACK_MS);
    let lease: GuideLease | null = null;
    if (snapshot?.stage === 'ROLEPLAY' || (snapshot && 'contractVersion' in snapshot && snapshot.contractVersion === 2)) {
      lease = { sessionId: snapshot.sessionId, playbackId: crypto.randomUUID(), guided: 'contractVersion' in snapshot && snapshot.contractVersion === 2 };
      if (lease.guided) {
        const current = useGuidedLearningStore.getState().snapshot;
        const context = current?.sessionId === snapshot.sessionId ? current.guided : ('guided' in snapshot ? snapshot.guided : null);
        lease.nodeId = context?.nodeId;
        lease.attemptId = context?.attemptId;
      }
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
        setIsPlaying(false);
        return;
      }
    }
    try {
      for (const line of lines) {
        if (generation !== generationRef.current) break;
        const played = lease?.guided
          ? line.voice === undefined
            ? await speakTts(line.text, line.language ?? 'en-US', slow ? 0.7 : undefined, true)
            : await speakTts(line.text, line.language ?? 'en-US', slow ? 0.7 : undefined, true, line.voice)
          : await speakTts(line.text, line.language ?? 'en-US', slow ? 0.7 : undefined);
        if (played === false) throw new Error('playback failed');
      }
      if (lease && generation === generationRef.current) lease.succeeded = true;
    } catch {
      if (generation === generationRef.current) setError('음성을 재생하지 못했어요. 다시 눌러 주세요.');
    } finally {
      if (generation === generationRef.current) {
        setIsPlaying(false);
        if (timerRef.current) window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (lease) await release(lease);
    }
  }, [cancel, cancelAndWait, enabled, release, setGuideAudio, snapshot, speakTts]);

  const nodeId = snapshot && 'guided' in snapshot ? snapshot.guided?.nodeId : undefined;
  useEffect(() => () => cancel(), [cancel, enabled, snapshot?.sessionId, snapshot?.stage, nodeId]);
  useEffect(() => useGuidedLearningStore.subscribe(state => {
    const lease = leaseRef.current;
    if (!lease?.guided) return;
    if (state.error || state.snapshot?.sessionId !== lease.sessionId
      || state.snapshot.guided?.nodeId !== lease.nodeId || state.snapshot.guided?.attemptId !== lease.attemptId) cancel();
  }), [cancel]);
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
  return { speak, cancel, cancelAndWait, reconcileIdle, isPlaying: isPlaying || !!roleAudio && roleAudio.sessionId === snapshot?.sessionId, error };
}
