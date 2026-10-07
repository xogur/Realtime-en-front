import { beforeEach, describe, expect, it } from 'vitest';
import { guidedFixture } from './fixtures';
import { useGuidedLearningStore } from './store';

const scope = { sessionId: 'guided-one', nodeId: 'r1', attemptId: 'attempt-one', controllerEpoch: 2, captureEpoch: 4 };
describe('guided voice evidence scope', () => {
  beforeEach(() => useGuidedLearningStore.setState({ snapshot: guidedFixture(), error: null, retiredSessions: [], captureStatus: null, partialTranscript: '', roleAudio: null }));
  it('keeps only current ROLE metadata and ignores stale starts and mismatched releases', () => {
    const store = useGuidedLearningStore.getState();
    const role = { sessionId: scope.sessionId, nodeId: scope.nodeId, attemptId: scope.attemptId, playbackId: 'role-one' };
    store.receiveRoleAudio({ ...role, active: true });
    store.receiveRoleAudio({ ...role, active: true, attemptId: 'old', playbackId: 'old-role' });
    store.receiveRoleAudio({ ...role, active: false, sessionId: 'other' });
    store.receiveRoleAudio({ ...role, active: false, playbackId: 'other' });
    expect(useGuidedLearningStore.getState().roleAudio).toEqual(role);
    store.reconcileHome(guidedFixture());
    expect(useGuidedLearningStore.getState().roleAudio).toEqual(role);
    const next = guidedFixture({ revision: 3 }); next.guided!.attemptId = 'new';
    store.pushSnapshot(next);
    expect(useGuidedLearningStore.getState().roleAudio).toBeNull();
    store.receiveRoleAudio({ ...role, active: true });
    expect(useGuidedLearningStore.getState().roleAudio).toBeNull();
  });
  it('rejects stale, gated, oversized and wrong-controller partials', () => {
    const store = useGuidedLearningStore.getState();
    store.receivePartial({ ...scope, content: 'Water' });
    expect(useGuidedLearningStore.getState().partialTranscript).toBe('Water');
    for (const invalid of [{ attemptId: 'old' }, { controllerEpoch: 1 }, { captureEpoch: 3 }, { content: 'x'.repeat(301) }]) store.receivePartial({ ...scope, content: 'bad', ...invalid });
    expect(useGuidedLearningStore.getState().partialTranscript).toBe('Water');
    const next = guidedFixture({ revision: 3 }); next.guided!.audioOwner = 'ROLE';
    store.pushSnapshot(next);
    store.receivePartial({ ...scope, content: 'echo' });
    expect(useGuidedLearningStore.getState().partialTranscript).toBe('');
  });
  it('clears voice evidence on new attempts and cannot restore listening from an old capture epoch', () => {
    const store = useGuidedLearningStore.getState();
    store.receiveCaptureStatus({ ...scope, status: 'LISTENING' });
    store.receivePartial({ ...scope, content: 'Water' });
    const next = guidedFixture({ revision: 3 }); next.guided!.attemptId = 'new';
    store.pushSnapshot(next);
    expect(useGuidedLearningStore.getState().captureStatus).toBeNull();
    expect(useGuidedLearningStore.getState().partialTranscript).toBe('');
    store.receiveCaptureStatus({ ...scope, status: 'LISTENING' });
    expect(useGuidedLearningStore.getState().captureStatus).toBeNull();
    store.receiveCaptureStatus({ ...scope, attemptId: 'new', status: 'ERROR' });
    expect(useGuidedLearningStore.getState().captureStatus?.status).toBe('ERROR');
  });
  it('preserves a current listening replay when the home request resolves after the socket replay', () => {
    const store = useGuidedLearningStore.getState();
    store.receiveCaptureStatus({ ...scope, status: 'LISTENING' });
    store.reconcileHome(guidedFixture({ revision: 3 }));
    expect(useGuidedLearningStore.getState().captureStatus).toEqual({ ...scope, status: 'LISTENING' });
  });
  it('discards replayed status when home resolves with a different capture epoch', () => {
    const store = useGuidedLearningStore.getState();
    store.receiveCaptureStatus({ ...scope, status: 'LISTENING' });
    const next = guidedFixture({ revision: 3 }); next.guided!.captureEpoch = 5;
    store.reconcileHome(next);
    expect(useGuidedLearningStore.getState().captureStatus).toBeNull();
  });
  it('discards listening when reconciled home no longer permits capture', () => {
    const store = useGuidedLearningStore.getState();
    store.receiveCaptureStatus({ ...scope, status: 'LISTENING' });
    const next = guidedFixture({ revision: 3 }); next.guided!.inputState = 'LOCKED';
    store.reconcileHome(next);
    expect(useGuidedLearningStore.getState().captureStatus).toBeNull();
  });
});
