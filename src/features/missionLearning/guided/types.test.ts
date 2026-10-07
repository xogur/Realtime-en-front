import { beforeEach, describe, expect, it } from 'vitest';
import { guidedFixture } from './fixtures';
import { parseGuidedHome, parseGuidedSnapshot } from './types';
import { useGuidedLearningStore } from './store';

describe('guided v2 contract boundary', () => {
  it('accepts optional recovery and turn metadata but rejects unknown enums', () => {
    const s = guidedFixture();
    expect(parseGuidedSnapshot({ ...s, guided: { ...s.guided, turnStatus: 'CAPTURING', recoveryReason: 'NO_FINAL' } })).not.toBeNull();
    for (const meta of [{ turnStatus: 'GUESS' }, { recoveryReason: 'FAILED' }]) expect(parseGuidedSnapshot({ ...s, guided: { ...s.guided, ...meta } })).toBeNull();
  });
  beforeEach(() => useGuidedLearningStore.setState({ snapshot: null, error: null }));
  it('accepts the explicit v2 contract and rejects missing/unknown contract values', () => {
    const valid = guidedFixture();
    expect(parseGuidedSnapshot(valid)).toEqual(valid);
    for (const bad of [{ ...valid, contractVersion: 3 }, { ...valid, guided: null },
      { ...valid, guided: { ...valid.guided, inputState: 'CLOSED' } },
      { ...valid, guided: { ...valid.guided, audioOwner: 'GUIDE' } },
      { ...valid, level: 'adult' }, { ...valid, allowedActions: ['INVENT_SUCCESS'] }]) expect(parseGuidedSnapshot(bad)).toBeNull();
  });
  it('rejects hidden model/frame leakage and stale acknowledgements', () => {
    const current = guidedFixture({ revision: 8 });
    expect(parseGuidedSnapshot({ ...current, guided: { ...current.guided, supportVisible: 'NONE' } })).toBeNull();
    expect(parseGuidedSnapshot({ ...current, guided: { ...current.guided, display: { modelEn: 'secret answer', contentCues: [] } } })).toBeNull();
    const store = useGuidedLearningStore.getState();
    expect(store.pushSnapshot(current)).toBe(true);
    expect(store.pushSnapshot(guidedFixture({ revision: 2, receiptRevision: 9 }))).toBe(false);
    expect(useGuidedLearningStore.getState().snapshot).toEqual(current);
    expect(store.pushSnapshot(guidedFixture({ sessionId: 'another' }))).toBe(false);
  });
  it('validates level availability metadata without age fields', () => {
    const home = { contractVersion: 2, contentVersion: 'v2', levels: [{ id: 'beginner', labelKo: '초급', available: true }], profile: null, lessons: [], activeSessionId: null };
    expect(parseGuidedHome(home)).toEqual(home);
    expect(parseGuidedHome({ ...home, levels: ['adult'] })).toBeNull();
  });
  it('recovers expired state authoritatively and ignores retired-session packets', () => {
    const store = useGuidedLearningStore.getState();
    store.pushSnapshot(guidedFixture());
    store.reconcileHome(null);
    expect(useGuidedLearningStore.getState().snapshot).toBeNull();
    expect(store.pushSnapshot(guidedFixture({ revision: 90 }))).toBe(false);
    expect(store.pushSnapshot(guidedFixture({ sessionId: 'fresh-session' }))).toBe(true);
  });
  it('accepts unbound voice without epochs and rejects negative wire epochs', () => {
    const s = guidedFixture();
    delete s.guided!.controllerEpoch; delete s.guided!.captureEpoch; s.guided!.voiceStarted = false;
    expect(parseGuidedSnapshot(s)).toEqual(s);
    expect(parseGuidedSnapshot({ ...s, guided: { ...s.guided, controllerEpoch: -1 } })).toBeNull();
  });
});
