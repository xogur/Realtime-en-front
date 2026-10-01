// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MISSION_GUIDE_AUDIO_RELEASE_EVENT, useMissionGuideAudio, type SetMissionGuideAudio } from './useMissionGuideAudio';
import type { MissionSnapshot } from './types';

const mocks = vi.hoisted(() => ({ speak: vi.fn(async () => true), cancel: vi.fn() }));
vi.mock('@/hooks/useBrowserTts', () => ({ useBrowserTts: () => mocks }));
const snapshot = {
  sessionId: 'mission-1', stage: 'ROLEPLAY',
} as MissionSnapshot;

describe('mission guide playback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.speak.mockResolvedValue(true);
  });
  afterEach(() => vi.useRealTimers());

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
