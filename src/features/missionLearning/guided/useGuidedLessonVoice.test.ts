// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { guidedFixture } from './fixtures';
import { useGuidedLearningStore } from './store';
import { useGuidedLessonVoice } from './useGuidedLessonVoice';

describe('guided controller voice acknowledgement', () => {
  it('keeps the original eight-second acknowledgement deadline across unrelated revisions', async () => {
    vi.useFakeTimers();
    const startVoice = vi.fn(() => true), syncCapture = vi.fn();
    renderHook(() => useGuidedLessonVoice({ enabled: true, connected: true, startVoice, syncCapture }));
    await act(async () => vi.advanceTimersByTimeAsync(7000));
    act(() => useGuidedLearningStore.getState().pushSnapshot(guidedFixture({ revision: 3 })));
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(useGuidedLearningStore.getState().error).toContain('음성 준비 응답');
    expect(startVoice).toHaveBeenCalledOnce();
    expect(syncCapture).not.toHaveBeenCalledWith(true, expect.anything(), expect.anything());
  });
  it('keeps recognition recovery locked until explicit Retry even after voice ack', () => {
    const s = guidedFixture();
    s.guided = { ...s.guided!, inputState: 'LOCKED', recoveryReason: 'NO_FINAL', turnStatus: 'NONE' };
    useGuidedLearningStore.setState({ snapshot: s });
    const startVoice = vi.fn(() => true), syncCapture = vi.fn();
    renderHook(() => useGuidedLessonVoice({ enabled: true, connected: true, startVoice, syncCapture }));
    act(() => useGuidedLearningStore.getState().acknowledgeVoice(s.sessionId));
    expect(syncCapture).not.toHaveBeenCalledWith(true, expect.anything(), expect.anything());
  });
  beforeEach(() => useGuidedLearningStore.setState({ snapshot: guidedFixture(), voiceAck: null, error: null, voiceRetry: 0, retiredSessions: [] }));
  afterEach(() => { cleanup(); vi.useRealTimers(); });
  it('does not open capture until explicit ack; preserves ongoing PROCESSING capture', () => {
    const startVoice = vi.fn(() => true), syncCapture = vi.fn();
    renderHook(() => useGuidedLessonVoice({ enabled: true, connected: true, startVoice, syncCapture }));
    expect(startVoice).toHaveBeenCalledWith('guided-one', 2);
    expect(syncCapture).toHaveBeenLastCalledWith(false, 'guided-one', 'attempt-one');
    act(() => useGuidedLearningStore.getState().acknowledgeVoice('guided-one'));
    expect(syncCapture).toHaveBeenLastCalledWith(true, 'guided-one', 'attempt-one');
    syncCapture.mockClear();
    const s = guidedFixture({ revision: 3 }); s.guided!.inputState = 'PROCESSING';
    act(() => useGuidedLearningStore.getState().pushSnapshot(s));
    expect(syncCapture).not.toHaveBeenCalled();
  });
  it('requires fresh ack after reconnect and on same-socket retry', () => {
    const startVoice = vi.fn(() => true), syncCapture = vi.fn();
    const { rerender } = renderHook(({ connected }) => useGuidedLessonVoice({ enabled: true, connected, startVoice, syncCapture }), { initialProps: { connected: true } });
    act(() => useGuidedLearningStore.getState().acknowledgeVoice('guided-one'));
    rerender({ connected: false }); rerender({ connected: true });
    expect(syncCapture).toHaveBeenLastCalledWith(false, 'guided-one', 'attempt-one');
    act(() => useGuidedLearningStore.getState().acknowledgeVoice('guided-one'));
    expect(syncCapture).toHaveBeenLastCalledWith(true, 'guided-one', 'attempt-one');
    act(() => useGuidedLearningStore.getState().retryVoice());
    expect(syncCapture).toHaveBeenLastCalledWith(false, 'guided-one', 'attempt-one');
    act(() => useGuidedLearningStore.getState().acknowledgeVoice('guided-one'));
    expect(syncCapture).toHaveBeenLastCalledWith(true, 'guided-one', 'attempt-one');
  });
  it('times out closed without auto retry or capture', async () => {
    vi.useFakeTimers();
    const startVoice = vi.fn(() => true), syncCapture = vi.fn();
    renderHook(() => useGuidedLessonVoice({ enabled: true, connected: true, startVoice, syncCapture }));
    await act(async () => vi.advanceTimersByTimeAsync(8000));
    expect(useGuidedLearningStore.getState().error).toContain('음성');
    expect(startVoice).toHaveBeenCalledOnce();
    expect(syncCapture).not.toHaveBeenCalledWith(true, expect.anything(), expect.anything());
  });
  it('opens a fresh LOCKED practice only after ready ack and closes on invalid contract', () => {
    const snapshot = guidedFixture(); snapshot.guided!.inputState = 'LOCKED';
    useGuidedLearningStore.setState({ snapshot });
    const startVoice = vi.fn(() => true), syncCapture = vi.fn();
    renderHook(() => useGuidedLessonVoice({ enabled: true, connected: true, startVoice, syncCapture }));
    act(() => useGuidedLearningStore.getState().acknowledgeVoice(snapshot.sessionId));
    expect(syncCapture).toHaveBeenLastCalledWith(true, snapshot.sessionId, 'attempt-one');
    act(() => { useGuidedLearningStore.getState().pushSnapshot({ ...snapshot, contractVersion: 3 }); });
    expect(syncCapture).toHaveBeenLastCalledWith(false, snapshot.sessionId, 'attempt-one');
  });
});
