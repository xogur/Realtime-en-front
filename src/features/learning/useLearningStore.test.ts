import { beforeEach, describe, expect, it } from 'vitest';
import { useLearningStore } from './useLearningStore';
import type { LearningSnapshot } from './types';

const snapshot: LearningSnapshot = {
  type: 'learning_state', lessonSessionId: 'lesson-1', revision: 1,
  status: 'ACTIVE', stage: 'EXPRESSION_INTRO',
  topic: { id: 'restaurant', labelKo: '음식점' },
  unit: { id: 'r1', goalKo: '주문하기' }, expressions: [],
  currentExpressionId: null, allowedActions: ['CONTINUE'],
};

beforeEach(() => useLearningStore.getState().reset());

describe('learning store', () => {
  it('treats a server snapshot as authoritative and clears pending UI', () => {
    useLearningStore.getState().setCommandPending(true);
    useLearningStore.getState().setPartialTranscript('hello');
    useLearningStore.getState().setSnapshot(snapshot);

    expect(useLearningStore.getState()).toMatchObject({ snapshot, isCommandPending: false, partialTranscript: '' });
  });

  it('ignores an out-of-order snapshot for the same lesson', () => {
    const newer = { ...snapshot, revision: 4, stage: 'APPLY_READY' as const };
    useLearningStore.getState().setSnapshot(newer);
    useLearningStore.getState().setSnapshot({ ...snapshot, revision: 3 });

    expect(useLearningStore.getState().snapshot).toEqual(newer);
  });
});
