'use client';

import { useEffect, useRef } from 'react';

import { useMissionLearningStore } from './store';

type Options = {
  enabled: boolean;
  startLearningRoleplay: (sessionId: string) => void;
  startListening: () => void;
  stopListening: () => void;
};

/**
 * Runs on the avatar (controller) screen. The guide screen moves the mission into ROLEPLAY;
 * this opens the microphone and asks the server to voice the avatar, then closes the
 * microphone once the roleplay ends.
 */
export function useMissionRoleplayVoice({ enabled, startLearningRoleplay, startListening, stopListening }: Options) {
  const snapshot = useMissionLearningStore((state) => state.snapshot);
  const activeSessionRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !snapshot) return;
    if (snapshot.stage === 'ROLEPLAY') {
      if (activeSessionRef.current === snapshot.sessionId) return;
      activeSessionRef.current = snapshot.sessionId;
      if (snapshot.roleplay?.voiceStarted) {
        // Reloaded mid-roleplay: the server already voiced the opening; only reopen the mic.
        startListening();
      } else {
        startLearningRoleplay(snapshot.sessionId);
      }
      return;
    }
    if (activeSessionRef.current === snapshot.sessionId) {
      activeSessionRef.current = null;
      stopListening();
    }
  }, [enabled, snapshot, startLearningRoleplay, startListening, stopListening]);
}
