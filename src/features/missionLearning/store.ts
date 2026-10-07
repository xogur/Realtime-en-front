import { create } from 'zustand';

import type { MissionSnapshot } from './types';

export type MissionEntryState = { open: boolean; returnTo: 'mode' | null; seq: number };

export function isTerminalSnapshot(snapshot: MissionSnapshot | null): boolean {
  return snapshot?.stage === 'COMPLETED' || snapshot?.stage === 'ABANDONED';
}

/** Newer server state wins; an older revision of the same session is ignored. */
export function acceptSnapshot(current: MissionSnapshot | null, next: MissionSnapshot): MissionSnapshot {
  if (current && current.sessionId === next.sessionId && next.revision < current.revision) return current;
  return next;
}

type MissionLearningStore = {
  entry: MissionEntryState | null;
  snapshot: MissionSnapshot | null;
  setEntry: (entry: MissionEntryState) => void;
  pushSnapshot: (snapshot: MissionSnapshot) => void;
  clearSnapshot: (sessionId?: string) => void;
};

/**
 * Server-pushed learning state shared by the avatar (controller) and guide (/chat) screens.
 * Both screens receive the same broadcasts over their kiosk websocket.
 */
export const useMissionLearningStore = create<MissionLearningStore>((set) => ({
  entry: null,
  snapshot: null,
  setEntry: (entry) => set((state) => (
    state.entry && entry.seq < state.entry.seq ? state : { entry }
  )),
  pushSnapshot: (snapshot) => set((state) => (
    'contractVersion' in snapshot && snapshot.contractVersion !== 1 ? state : { snapshot: acceptSnapshot(state.snapshot, snapshot) }
  )),
  clearSnapshot: (sessionId) => set((state) => (
    sessionId && state.snapshot?.sessionId !== sessionId ? state : { snapshot: null }
  )),
}));

export function parseMissionEntry(data: Record<string, unknown>): MissionEntryState | null {
  if (typeof data.open !== 'boolean' || typeof data.seq !== 'number') return null;
  return { open: data.open, returnTo: data.returnTo === 'mode' ? 'mode' : null, seq: data.seq };
}
