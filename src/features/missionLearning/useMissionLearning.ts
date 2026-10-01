'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  getMissionHome,
  getMissionSession,
  putMissionProfile,
  sendMissionCommand,
  startMission,
} from './api';
import { isTerminalSnapshot, useMissionLearningStore } from './store';
import {
  MissionLearningApiError,
  type AgeBand,
  type LearningLevel,
  type MissionAction,
  type MissionLearningHomeDetail,
  type MissionSnapshot,
} from './types';

export { acceptSnapshot } from './store';

export type MissionLearningStatus = 'loading' | 'ready' | 'error';

export function useMissionLearning(open: boolean) {
  const [status, setStatus] = useState<MissionLearningStatus>('loading');
  const [home, setHome] = useState<MissionLearningHomeDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);
  const storedSnapshot = useMissionLearningStore((state) => state.snapshot);
  const pushSnapshot = useMissionLearningStore((state) => state.pushSnapshot);
  const snapshot = isTerminalSnapshot(storedSnapshot) ? null : storedSnapshot;

  const refreshHome = useCallback(async () => {
    const nextHome = await getMissionHome();
    setHome(nextHome);
    if (nextHome.activeSession) pushSnapshot(nextHome.activeSession);
    return nextHome;
  }, [pushSnapshot]);

  const reload = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const nextHome = await refreshHome();
      setStatus(nextHome.enabled ? 'ready' : 'error');
      if (!nextHome.enabled) setError('지금은 학습모드를 사용할 수 없어요.');
    } catch (caught) {
      setStatus('error');
      setError(caught instanceof MissionLearningApiError ? caught.message : '학습모드를 불러오지 못했어요.');
    }
  }, [refreshHome]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => void reload(), 0);
    return () => window.clearTimeout(timer);
  }, [open, reload]);

  // A finished or abandoned session (possibly ended on another screen) returns to the mission list.
  const terminalSessionId = isTerminalSnapshot(storedSnapshot) ? storedSnapshot?.sessionId : null;
  useEffect(() => {
    if (!open || !terminalSessionId) return;
    const timer = window.setTimeout(() => {
      useMissionLearningStore.getState().clearSnapshot(terminalSessionId);
      void refreshHome().catch(() => undefined);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open, refreshHome, terminalSessionId]);

  const run = useCallback(async (task: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (caught) {
      if (caught instanceof MissionLearningApiError) {
        if (caught.snapshot) pushSnapshot(caught.snapshot);
        setError(caught.message);
      } else {
        setError('요청을 처리하지 못했어요.');
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [pushSnapshot]);

  const saveProfile = useCallback((ageBand: AgeBand, level: LearningLevel) => run(async () => {
    await putMissionProfile(ageBand, level);
    await refreshHome();
  }), [refreshHome, run]);

  const start = useCallback((missionId: string) => run(async () => {
    pushSnapshot(await startMission(missionId));
  }), [pushSnapshot, run]);

  const command = useCallback((action: MissionAction, payload?: { expressionId?: string }) => run(async () => {
    const current = useMissionLearningStore.getState().snapshot;
    if (!current || isTerminalSnapshot(current)) return;
    pushSnapshot(await sendMissionCommand(current, action, payload));
  }), [pushSnapshot, run]);

  const refreshSession = useCallback(() => run(async () => {
    const current = useMissionLearningStore.getState().snapshot;
    if (current) pushSnapshot(await getMissionSession(current.sessionId));
  }), [pushSnapshot, run]);

  return {
    status, home, snapshot: snapshot as MissionSnapshot | null, busy, error,
    reload, saveProfile, start, command, refreshSession,
  };
}
