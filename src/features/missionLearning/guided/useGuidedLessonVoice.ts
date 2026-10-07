'use client';
import { useEffect, useRef } from 'react';
import { isGuidedTerminal, useGuidedLearningStore } from './store';

/** Controller only. A connected socket is not a voice-ready acknowledgement. */
export function useGuidedLessonVoice({ enabled, connected, startVoice, syncCapture }: {
  enabled: boolean; connected: boolean;
  startVoice: (sessionId: string, revision: number) => boolean;
  syncCapture: (active: boolean, sessionId: string, attemptId: string, resumeRequested?: boolean) => void;
}) {
  const snapshot = useGuidedLearningStore(s => s.snapshot);
  const retry = useGuidedLearningStore(s => s.voiceRetry);
  const ack = useGuidedLearningStore(s => s.voiceAck);
  const error = useGuidedLearningStore(s => s.error);
  const request = useRef<{ sessionId: string; ackSequence: number; acknowledged: boolean; deadline: number } | null>(null);
  useEffect(() => {
    request.current = null;
  }, [connected, retry]);
  useEffect(() => {
    if (!enabled || !connected || error || !snapshot || isGuidedTerminal(snapshot) || snapshot.stage === 'BRIEF' || snapshot.guided?.phase === 'RECAP') {
      if (snapshot) syncCapture(false, snapshot.sessionId, snapshot.guided?.attemptId ?? '');
      else if (request.current) syncCapture(false, request.current.sessionId, '');
      request.current = null;
      return;
    }
    const g = snapshot.guided;
    if (!g) return;
    if (!request.current || request.current.sessionId !== snapshot.sessionId) {
      request.current = { sessionId: snapshot.sessionId, ackSequence: ack?.sequence ?? 0, acknowledged: false, deadline: performance.now() + 8000 };
      // Binding consumes this revision. A capture-close first would publish a
      // newer revision and make same-socket voice recovery conflict.
      const started = startVoice(snapshot.sessionId, snapshot.revision);
      syncCapture(false, snapshot.sessionId, g.attemptId);
      if (!started) {
        useGuidedLearningStore.getState().setError('아바타 음성 연결을 확인해 주세요.');
      }
      return;
    }
    if (ack?.sessionId === snapshot.sessionId && ack.sequence > request.current.ackSequence && g.voiceStarted) request.current.acknowledged = true;
    // PROCESSING starts at speech onset: preserve that utterance until its final.
    // Playback capture barriers are owned by the server's guide-audio lease.
    const freshPractice = g.phase !== 'DEMO' && g.phase !== 'RECAP' && !g.outcome && g.inputState === 'LOCKED';
    if (request.current.acknowledged && !g.recoveryReason && (g.inputState === 'READY' || freshPractice) && g.audioOwner === 'NONE') {
      if (g.retryRequested) syncCapture(true, snapshot.sessionId, g.attemptId, true);
      else syncCapture(true, snapshot.sessionId, g.attemptId);
    }
  }, [enabled, connected, retry, snapshot, ack, error, startVoice, syncCapture]);
  useEffect(() => {
    if (!enabled || !connected || !request.current || request.current.acknowledged) return;
    const pending = request.current;
    const timer = window.setTimeout(() => {
      if (request.current === pending && !pending.acknowledged) useGuidedLearningStore.getState().setError('음성 준비 응답이 없어요. 다시 연결해 주세요.');
    }, Math.max(0, pending.deadline - performance.now()));
    return () => window.clearTimeout(timer);
  }, [enabled, connected, retry, snapshot, ack]);
}
