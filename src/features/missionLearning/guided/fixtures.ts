import type { GuidedSnapshot } from './types';

/** Synthetic contract fixture for deterministic UI/transport regression tests. */
export function guidedFixture(overrides: Partial<GuidedSnapshot> = {}): GuidedSnapshot {
  return {
    type: 'learning_mission_state', contractVersion: 2, sessionId: 'guided-one', kioskId: 'A01',
    lessonId: 'request_beginner', contentVersion: 'guided-v2-draft-1', level: 'beginner', stage: 'PREP',
    revision: 2, allowedActions: ['SELECT_CHOICE', 'SHOW_SUPPORT', 'PLAY_MODEL', 'SKIP_NODE', 'ABANDON'],
    guided: {
      phase: 'REHEARSE', nodeId: 'r1', attemptId: 'attempt-one', inputState: 'READY', audioOwner: 'NONE',
      intentKo: '원하는 음료를 부탁해 보세요.', supportVisible: 'FRAME', supportExposure: 'FRAME',
      display: { frameEn: 'Can I have ___, please?', contentCues: ['water'] },
      choices: [{ id: 'water', labelEn: 'water' }, { id: 'tea', labelEn: 'tea' }], selectedChoiceId: 'water',
      stallCount: 0, attemptCount: 0, outcome: null, audioId: 'r1', voiceStarted: true,
      captureEpoch: 4, controllerEpoch: 2,
    }, recap: null, handoff: null, endReason: null, ...overrides,
  };
}
