import { create } from 'zustand';
import type { LearningSnapshot } from './types';

type LearningState = {
  snapshot: LearningSnapshot | null;
  error: string | null;
  partialTranscript: string;
  isCommandPending: boolean;
  sessionEpoch: number | null;
  setSnapshot: (snapshot: LearningSnapshot | null) => void;
  setError: (error: string | null) => void;
  setPartialTranscript: (value: string) => void;
  setCommandPending: (value: boolean) => void;
  setSessionEpoch: (value: number | null) => void;
  reset: () => void;
};

export const useLearningStore = create<LearningState>((set) => ({
  snapshot: null,
  error: null,
  partialTranscript: '',
  isCommandPending: false,
  sessionEpoch: null,
  setSnapshot: (snapshot) => set((state) => {
    if (
      snapshot
      && state.snapshot?.lessonSessionId === snapshot.lessonSessionId
      && snapshot.revision < state.snapshot.revision
    ) {
      return state;
    }
    return { snapshot, error: null, isCommandPending: false, partialTranscript: '' };
  }),
  setError: (error) => set({ error, isCommandPending: false }),
  setPartialTranscript: (partialTranscript) => set({ partialTranscript }),
  setCommandPending: (isCommandPending) => set({ isCommandPending }),
  setSessionEpoch: (sessionEpoch) => set({ sessionEpoch }),
  reset: () => set({ snapshot: null, error: null, partialTranscript: '', isCommandPending: false }),
}));
