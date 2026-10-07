// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MISSION_GUIDE_AUDIO_RELEASE_EVENT, useMissionGuideAudio, type SetMissionGuideAudio } from './useMissionGuideAudio';
import type { MissionSnapshot } from './types';
import { guidedFixture } from './guided/fixtures';
import { useGuidedLearningStore } from './guided/store';

const mocks = vi.hoisted(() => ({ speak: vi.fn<(text: string, language?: string, rate?: number, requireVoice?: boolean) => Promise<boolean>>(async () => true), cancel: vi.fn() }));
vi.mock('@/hooks/useBrowserTts', () => ({ useBrowserTts: () => mocks }));
const snapshot = {
  sessionId: 'mission-1', stage: 'ROLEPLAY',
} as MissionSnapshot;

describe('mission guide playback', () => {
  it('waits for automatic ROLE cancellation acknowledgement even without a browser speech lease', async () => {
    const guided = guidedFixture(); guided.guided!.audioOwner = 'ROLE';
    const roleAudio = { sessionId: guided.sessionId, nodeId: guided.guided!.nodeId, attemptId: guided.guided!.attemptId, playbackId: 'automatic-role' };
    useGuidedLearningStore.setState({ snapshot: guided, roleAudio });
    let release!: (accepted: boolean) => void;
    const setGuideAudio = vi.fn<SetMissionGuideAudio>(() => new Promise(resolve => { release = resolve; }));
    const { result } = renderHook(() => useMissionGuideAudio({ enabled: true, snapshot: guided, setGuideAudio }));
    expect(result.current.isPlaying).toBe(true);
    let settled = false;
    const pending = result.current.cancelAndWait().then(value => { settled = true; return value; });
    await act(async () => undefined);
    expect(settled).toBe(false);
    expect(setGuideAudio).toHaveBeenCalledWith(false, guided.sessionId, 'automatic-role', false, { nodeId: roleAudio.nodeId, attemptId: roleAudio.attemptId });
    await act(async () => release(true));
    await expect(pending).resolves.toBe(true);
  });
  it.each(['missing', 'stale', 'rejected'] as const)('does not authorize Retry after %s automatic ROLE release', async kind => {
    const guided = guidedFixture(); guided.guided!.audioOwner = 'ROLE';
    useGuidedLearningStore.setState({ snapshot: guided, roleAudio: kind === 'missing' ? null : {
      sessionId: guided.sessionId, nodeId: guided.guided!.nodeId,
      attemptId: kind === 'stale' ? 'old-attempt' : guided.guided!.attemptId, playbackId: 'role-current',
    } });
    const setGuideAudio = vi.fn<SetMissionGuideAudio>(async () => false);
    const { result } = renderHook(() => useMissionGuideAudio({ enabled: true, snapshot: guided, setGuideAudio }));
    await act(async () => { expect(await result.current.cancelAndWait()).toBe(false); });
    expect(setGuideAudio).toHaveBeenCalledTimes(kind === 'rejected' ? 1 : 0);
    expect(result.current.error).toContain('다시 연결');
    expect(mocks.speak).not.toHaveBeenCalled();
  });
  it('accepts a refused cancel only when that exact ROLE playback was already released by the server', async () => {
    const guided = guidedFixture(); guided.guided!.audioOwner = 'ROLE';
    const role = { sessionId: guided.sessionId, nodeId: guided.guided!.nodeId, attemptId: guided.guided!.attemptId, playbackId: 'finishing-role' };
    useGuidedLearningStore.setState({ snapshot: guided, roleAudio: role, releasedRolePlaybacks: [] });
    let release!: (accepted: boolean) => void;
    const setGuideAudio = vi.fn<SetMissionGuideAudio>(() => new Promise(resolve => { release = resolve; }));
    const { result } = renderHook(() => useMissionGuideAudio({ enabled: true, snapshot: guided, setGuideAudio }));
    const pending = result.current.cancelAndWait();
    // Natural completion wins the race: its release broadcast precedes the refused cancel ACK.
    act(() => {
      useGuidedLearningStore.getState().receiveRoleAudio({ type: 'guided_role_audio', active: false, sessionId: guided.sessionId, playbackId: 'other-role' });
    });
    await act(async () => release(false));
    await expect(pending).resolves.toBe(false);

    act(() => useGuidedLearningStore.setState({ snapshot: guided, roleAudio: role, error: null }));
    const second = renderHook(() => useMissionGuideAudio({ enabled: true, snapshot: guided, setGuideAudio }));
    const retry = second.result.current.cancelAndWait();
    act(() => {
      useGuidedLearningStore.getState().receiveRoleAudio({ type: 'guided_role_audio', active: false, sessionId: guided.sessionId, playbackId: 'finishing-role' });
    });
    await act(async () => release(false));
    await expect(retry).resolves.toBe(true);
    expect(second.result.current.error).toBeNull();
  });
  it('rejects an old ROLE acknowledgement after the attempt changes during cancellation', async () => {
    const guided = guidedFixture(); guided.guided!.audioOwner = 'ROLE';
    const role = { sessionId: guided.sessionId, nodeId: guided.guided!.nodeId, attemptId: guided.guided!.attemptId, playbackId: 'old-role' };
    useGuidedLearningStore.setState({ snapshot: guided, roleAudio: role });
    let release!: (accepted: boolean) => void;
    const setGuideAudio = vi.fn<SetMissionGuideAudio>(() => new Promise(resolve => { release = resolve; }));
    const { result } = renderHook(() => useMissionGuideAudio({ enabled: true, snapshot: guided, setGuideAudio }));
    const pending = result.current.cancelAndWait();
    const next = guidedFixture({ revision: 3 }); next.guided!.attemptId = 'replacement'; next.guided!.audioOwner = 'ROLE';
    act(() => {
      useGuidedLearningStore.getState().pushSnapshot(next);
      useGuidedLearningStore.getState().receiveRoleAudio({ ...role, attemptId: 'replacement', playbackId: 'new-role', active: true });
    });
    await act(async () => release(true));
    await expect(pending).resolves.toBe(false);
  });
  it.each([false, true])('only acquires the latest concurrent speech after delayed release %s', async delayedRelease => {
    vi.useFakeTimers();
    let released!: (accepted: boolean) => void;
    let spoken!: (played: boolean) => void;
    const setGuideAudio = vi.fn<SetMissionGuideAudio>(async () => true);
    const { result } = renderHook(() => useMissionGuideAudio({ enabled: true, snapshot: guidedFixture(), setGuideAudio }));
    if (delayedRelease) {
      mocks.speak.mockImplementationOnce(() => new Promise(() => undefined));
      await act(async () => { void result.current.speak('Previous.'); });
      setGuideAudio.mockImplementationOnce(() => new Promise(resolve => { released = resolve; }));
      act(() => result.current.cancel());
      await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    }
    setGuideAudio.mockClear(); mocks.speak.mockClear();
    mocks.speak.mockImplementationOnce(() => new Promise(resolve => { spoken = resolve; }));
    let first!: Promise<void>; let latest!: Promise<void>;
    await act(async () => {
      first = result.current.speak('Superseded.');
      latest = result.current.speak('Latest.');
    });
    if (delayedRelease) await act(async () => released(true));
    expect(setGuideAudio.mock.calls.filter(call => call[0])).toHaveLength(1);
    expect(mocks.speak).toHaveBeenCalledExactlyOnceWith('Latest.', 'en-US', undefined, true);
    expect(result.current.isPlaying).toBe(true);
    await act(async () => { spoken(true); await vi.advanceTimersByTimeAsync(300); await Promise.all([first, latest]); });
    expect(result.current.isPlaying).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('keeps a failed release closed until authoritative idle recovery', async () => {
    vi.useFakeTimers();
    const guided = guidedFixture();
    const setGuideAudio = vi.fn<SetMissionGuideAudio>(async active => active);
    const { result } = renderHook(() => useMissionGuideAudio({ enabled: true, snapshot: guided, setGuideAudio }));
    let playback!: Promise<void>;
    await act(async () => { playback = result.current.speak('Water, please.'); });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); await playback; });
    expect(await result.current.cancelAndWait()).toBe(false);
    act(() => result.current.reconcileIdle({ ...guided, guided: { ...guided.guided!, audioOwner: 'ROLE' } }));
    expect(await result.current.cancelAndWait()).toBe(false);
    act(() => result.current.reconcileIdle(guided));
    expect(await result.current.cancelAndWait()).toBe(true);
  });
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.speak.mockResolvedValue(true);
    useGuidedLearningStore.setState({ snapshot: null, error: null, retiredSessions: [], roleAudio: null, releasedRolePlaybacks: [] });
  });
  afterEach(() => vi.useRealTimers());

  it('gates v2 PREP, plays DEMO lines sequentially, and reports successful completion', async () => {
    vi.useFakeTimers();
    const setGuideAudio = vi.fn<SetMissionGuideAudio>(async () => true);
    const { result } = renderHook(() => useMissionGuideAudio({ enabled: true, snapshot: guidedFixture(), setGuideAudio }));
    let playback!: Promise<void>;
    await act(async () => { playback = result.current.speak([{ text: 'Hello.' }, { text: 'Water, please.' }]); });
    expect(setGuideAudio).toHaveBeenCalledWith(true, 'guided-one', expect.any(String));
    expect(mocks.speak.mock.calls.map(c => c[0])).toEqual(['Hello.', 'Water, please.']);
    await act(async () => { await vi.advanceTimersByTimeAsync(300); await playback; });
    expect(setGuideAudio).toHaveBeenLastCalledWith(false, 'guided-one', expect.any(String), true);
  });

  it('does not claim playback success when browser speech returns false', async () => {
    vi.useFakeTimers();
    mocks.speak.mockResolvedValueOnce(false);
    const setGuideAudio = vi.fn<SetMissionGuideAudio>(async () => true);
    const { result } = renderHook(() => useMissionGuideAudio({ enabled: true, snapshot: guidedFixture(), setGuideAudio }));
    let playback!: Promise<void>;
    await act(async () => { playback = result.current.speak('Water, please.'); });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); await playback; });
    expect(setGuideAudio).toHaveBeenLastCalledWith(false, 'guided-one', expect.any(String), false);
    expect(result.current.error).toContain('음성을 재생하지 못했어요');
  });
  it('cancels a pending v2 audio lease when another screen changes the same-node attempt', async () => {
    const guided = guidedFixture();
    useGuidedLearningStore.setState({ snapshot: guided });
    let ready!: (accepted: boolean) => void;
    const setGuideAudio = vi.fn<SetMissionGuideAudio>(async () => true);
    setGuideAudio.mockImplementationOnce(() => new Promise(resolve => { ready = resolve; }));
    const { result } = renderHook(() => useMissionGuideAudio({ enabled: true, snapshot: guided, setGuideAudio }));
    let playback!: Promise<void>;
    act(() => { playback = result.current.speak('Water, please.'); });
    await waitFor(() => expect(setGuideAudio).toHaveBeenCalledOnce());
    vi.useFakeTimers();
    act(() => { useGuidedLearningStore.getState().pushSnapshot({ ...guided, revision: 3, guided: { ...guided.guided!, attemptId: 'other-screen-attempt' } }); });
    await act(async () => { ready(true); await vi.advanceTimersByTimeAsync(300); await playback; });
    expect(mocks.speak).not.toHaveBeenCalled();
    expect(setGuideAudio).toHaveBeenLastCalledWith(false, 'guided-one', expect.any(String), false);
  });

  it('waits for the capture barrier and holds it through the speaker tail', async () => {
    let ready!: (accepted: boolean) => void;
    let finished!: (success: boolean) => void;
    const setGuideAudio = vi.fn<SetMissionGuideAudio>(async () => true);
    setGuideAudio.mockImplementationOnce(() => new Promise((resolve) => { ready = resolve; }));
    mocks.speak.mockImplementationOnce(() => new Promise((resolve) => { finished = resolve; }));
    const { result } = renderHook(() => useMissionGuideAudio({ enabled: true, snapshot, setGuideAudio }));
    let playback!: Promise<void>;
    act(() => { playback = result.current.speak('Iced, please.'); });
    await waitFor(() => expect(setGuideAudio).toHaveBeenCalledOnce());
    expect(mocks.speak).not.toHaveBeenCalled();
    await act(async () => ready(true));
    expect(mocks.speak).toHaveBeenCalledWith('Iced, please.', 'en-US', undefined);
    vi.useFakeTimers();
    await act(async () => finished(true));
    expect(setGuideAudio).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(300); await playback; });
    expect(setGuideAudio).toHaveBeenLastCalledWith(false, 'mission-1', expect.any(String));
  });

  it('does not play when the server cannot pause the mic', async () => {
    const setGuideAudio = vi.fn<SetMissionGuideAudio>(async () => false);
    const { result } = renderHook(() => useMissionGuideAudio({ enabled: true, snapshot, setGuideAudio }));
    await act(async () => result.current.speak('Hot, please.'));
    expect(mocks.speak).not.toHaveBeenCalled();
    expect(result.current.error).toContain('도움 카드 음성을 준비하지 못했어요');
  });

  it('cancels and releases a pending acquisition when the stage ends', async () => {
    let ready!: (accepted: boolean) => void;
    const setGuideAudio = vi.fn<SetMissionGuideAudio>(async () => true);
    setGuideAudio.mockImplementationOnce(() => new Promise((resolve) => { ready = resolve; }));
    const { result, rerender } = renderHook(({ stage }) => useMissionGuideAudio({ enabled: true,
      snapshot: { ...snapshot, stage }, setGuideAudio }), { initialProps: { stage: 'ROLEPLAY' as MissionSnapshot['stage'] } });
    act(() => { void result.current.speak('Iced, please.'); });
    await waitFor(() => expect(setGuideAudio).toHaveBeenCalledOnce());
    vi.useFakeTimers();
    rerender({ stage: 'FEEDBACK' });
    await act(async () => ready(true));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(mocks.speak).not.toHaveBeenCalled();
    expect(setGuideAudio).toHaveBeenLastCalledWith(false, 'mission-1', expect.any(String));
  });

  it('stops a stuck TTS before the 30-second server lease expires', async () => {
    vi.useFakeTimers();
    const setGuideAudio = vi.fn<SetMissionGuideAudio>(async () => true);
    mocks.speak.mockImplementationOnce(() => new Promise(() => undefined));
    const { result } = renderHook(() => useMissionGuideAudio({ enabled: true, snapshot, setGuideAudio }));
    await act(async () => { void result.current.speak('Iced, please.'); });
    expect(mocks.speak).toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(27_300); });
    expect(result.current.error).toContain('재생 시간이 길어');
    expect(setGuideAudio).toHaveBeenLastCalledWith(false, 'mission-1', expect.any(String));
  });

  it('includes a four-second ack delay in the local 27-second deadline', async () => {
    vi.useFakeTimers();
    let ready!: (accepted: boolean) => void;
    const setGuideAudio = vi.fn<SetMissionGuideAudio>(async () => true);
    setGuideAudio.mockImplementationOnce(() => new Promise((resolve) => { ready = resolve; }));
    mocks.speak.mockImplementationOnce(() => new Promise(() => undefined));
    const { result } = renderHook(() => useMissionGuideAudio({ enabled: true, snapshot, setGuideAudio }));
    await act(async () => { void result.current.speak('Iced, please.'); });
    await act(async () => { await vi.advanceTimersByTimeAsync(4_000); ready(true); });
    expect(mocks.speak).toHaveBeenCalled();
    const before = mocks.cancel.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(22_999); });
    expect(mocks.cancel.mock.calls.length).toBe(before);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(mocks.cancel.mock.calls.length).toBe(before + 1);
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(setGuideAudio).toHaveBeenLastCalledWith(false, 'mission-1', expect.any(String));
  });

  it('cancels the matching playback when the socket disconnects or the server releases it', async () => {
    const setGuideAudio = vi.fn<SetMissionGuideAudio>(async () => true);
    mocks.speak.mockImplementationOnce(() => new Promise(() => undefined));
    const { result } = renderHook(() => useMissionGuideAudio({ enabled: true, snapshot, setGuideAudio }));
    await act(async () => { void result.current.speak('Iced, please.'); });
    const playbackId = setGuideAudio.mock.calls[0][2];
    const before = mocks.cancel.mock.calls.length;
    act(() => window.dispatchEvent(new CustomEvent(MISSION_GUIDE_AUDIO_RELEASE_EVENT, { detail: { playbackId: 'old-play' } })));
    expect(mocks.cancel.mock.calls.length).toBe(before);
    act(() => window.dispatchEvent(new CustomEvent(MISSION_GUIDE_AUDIO_RELEASE_EVENT, { detail: { playbackId } })));
    expect(mocks.cancel.mock.calls.length).toBe(before + 1);
    expect(result.current.error).toContain('음성 재생이 중단됐어요');
  });
});
