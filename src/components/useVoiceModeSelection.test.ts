// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useVoiceModeSelection } from './useVoiceModeSelection';

type Options = {
  language?: string;
  onFinalTranscript: (result: { text: string }) => void;
  onError: (code: string) => void;
  hint?: () => string | null;
};
const mocks = vi.hoisted(() => ({
  options: null as Options | null,
  prepare: vi.fn(async () => true), start: vi.fn(async () => true),
  takeAudioInput: vi.fn<() => Promise<MediaStream | null>>(async () => null),
  pause: vi.fn(async () => undefined), stop: vi.fn(async () => undefined), speak: vi.fn(async () => true), cancel: vi.fn(),
}));
const browserStt = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useBrowserStt', () => ({ useBrowserStt: browserStt }));
vi.mock('@/hooks/useOnboardingStt', () => ({
  useOnboardingStt: (options: Options) => {
    mocks.options = options;
    return { prepare: mocks.prepare, takeAudioInput: mocks.takeAudioInput, startAndWaitUntilReady: mocks.start, pause: mocks.pause, stop: mocks.stop, isRecording: true };
  },
}));
vi.mock('@/hooks/useBrowserTts', () => ({
  useBrowserTts: () => ({ speak: mocks.speak, cancel: mocks.cancel, isSpeaking: false }),
}));

describe('voice mode selection', () => {
  afterEach(() => vi.useRealTimers());
  it('does not announce a stale prompt after slow microphone preparation', async () => {
    vi.useFakeTimers();
    let prepare!: (ready: boolean) => void;
    mocks.prepare.mockImplementationOnce(() => new Promise(resolve => { prepare = resolve; }));
    const { result } = renderHook(() => useVoiceModeSelection({ enabled: true, learningReady: true, onSelect: vi.fn() }));
    await act(async () => vi.advanceTimersByTimeAsync(6000));
    expect(result.current.status).toBe('unavailable');
    await act(async () => prepare(true));
    expect(mocks.speak).not.toHaveBeenCalled();
    expect(mocks.start).not.toHaveBeenCalled();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prepare.mockResolvedValue(true);
    mocks.start.mockResolvedValue(true);
    mocks.speak.mockResolvedValue(true);
  });

  it('waits for the prompt to finish and accepts only a final answer', async () => {
    let finish!: (value: boolean) => void;
    mocks.speak.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const onSelect = vi.fn();
    const { result } = renderHook(() => useVoiceModeSelection({ enabled: true, learningReady: true, onSelect }));
    await waitFor(() => expect(result.current.status).toBe('prompting'));
    act(() => mocks.options?.onFinalTranscript({ text: '학습모드' }));
    expect(onSelect).not.toHaveBeenCalled();
    expect(mocks.start).not.toHaveBeenCalled();
    act(() => finish(true));
    await waitFor(() => expect(result.current.status).toBe('listening'));
    act(() => mocks.options?.onFinalTranscript({ text: '학습모드 말고 프리토킹' }));
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith('free_talk'));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('listens with the kiosk Korean STT server, never browser recognition', async () => {
    const { result } = renderHook(() => useVoiceModeSelection({ enabled: true, learningReady: true, onSelect: vi.fn() }));
    await waitFor(() => expect(result.current.status).toBe('listening'));
    expect(mocks.options?.language).toBe('ko');
    expect(mocks.options?.hint?.()).toBe('mode');
    expect(browserStt).not.toHaveBeenCalled();
  });

  it('keeps listening after an empty or busy STT result and falls back to touch when the server fails', async () => {
    const onSelect = vi.fn();
    const { result } = renderHook(() => useVoiceModeSelection({ enabled: true, learningReady: true, onSelect }));
    await waitFor(() => expect(result.current.status).toBe('listening'));
    act(() => { mocks.options?.onError('STT_NO_RESULT'); mocks.options?.onError('STT_BUSY'); });
    expect(result.current.status).toBe('listening');
    act(() => mocks.options?.onFinalTranscript({ text: '음, 3번이요' }));
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith('story'));
    const second = renderHook(() => useVoiceModeSelection({ enabled: true, learningReady: true, onSelect: vi.fn() }));
    await waitFor(() => expect(second.result.current.status).toBe('listening'));
    act(() => mocks.options?.onError('STT_UNAVAILABLE'));
    expect(second.result.current.status).toBe('unavailable');
  });

  it('never selects unavailable learning mode and asks again', async () => {
    const onSelect = vi.fn();
    const { result } = renderHook(() => useVoiceModeSelection({ enabled: true, learningReady: false, onSelect }));
    await waitFor(() => expect(result.current.status).toBe('listening'));
    act(() => mocks.options?.onFinalTranscript({ text: '2번' }));
    await waitFor(() => expect(mocks.speak).toHaveBeenCalledTimes(2));
    expect(onSelect).not.toHaveBeenCalled();
    await act(async () => result.current.select('learning'));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('stops asking after three misheard answers and leaves touch selection', async () => {
    const onSelect = vi.fn();
    const { result } = renderHook(() => useVoiceModeSelection({ enabled: true, learningReady: true, onSelect }));
    for (let miss = 1; miss <= 3; miss += 1) {
      await waitFor(() => expect(result.current.status).toBe('listening'));
      act(() => mocks.options?.onFinalTranscript({ text: '바나나' }));
    }
    await waitFor(() => expect(result.current.status).toBe('unavailable'));
    expect(result.current.error).toContain('잘 알아듣지 못했어요');
    expect(mocks.speak).toHaveBeenCalledTimes(3);
    await act(async () => result.current.select('story'));
    expect(onSelect).toHaveBeenCalledWith('story');
  });

  it('allows touch after permission denial without publishing conversation mic state', async () => {
    const onSelect = vi.fn();
    const { result } = renderHook(() => useVoiceModeSelection({ enabled: true, learningReady: true, onSelect }));
    await waitFor(() => expect(result.current.status).toBe('listening'));
    act(() => mocks.options?.onError('MICROPHONE_DENIED'));
    expect(result.current.error).toContain('마이크 권한');
    await act(async () => result.current.select('learning'));
    expect(onSelect).toHaveBeenCalledWith('learning');
  });

  it('keeps touch selection available when no cancellable mode voice can be played', async () => {
    mocks.speak.mockResolvedValueOnce(false);
    const onSelect = vi.fn();
    const { result } = renderHook(() => useVoiceModeSelection({ enabled: true, learningReady: true, onSelect }));
    await waitFor(() => expect(result.current.status).toBe('unavailable'));
    expect(mocks.start).not.toHaveBeenCalled();
    expect(result.current.error).toContain('터치');
    await act(async () => result.current.select('learning'));
    expect(onSelect).toHaveBeenCalledWith('learning');
  });

  it('passes the open microphone to learning and releases it if selection is cancelled during teardown', async () => {
    const stopTrack = vi.fn();
    const input = { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream;
    mocks.takeAudioInput.mockResolvedValueOnce(input);
    const onSelect = vi.fn();
    const { result, rerender } = renderHook(({ enabled }) => useVoiceModeSelection({ enabled, learningReady: true, onSelect }), { initialProps: { enabled: true } });
    await waitFor(() => expect(result.current.status).toBe('listening'));
    await act(async () => result.current.select('learning'));
    expect(onSelect).toHaveBeenCalledWith('learning', input);
    expect(stopTrack).not.toHaveBeenCalled();
    rerender({ enabled: false }); rerender({ enabled: true });
    await waitFor(() => expect(result.current.status).toBe('listening'));
    mocks.takeAudioInput.mockResolvedValueOnce(input);
    let finish!: () => void;
    mocks.stop.mockImplementationOnce(() => new Promise(resolve => { finish = () => resolve(undefined); }));
    let selection!: Promise<void>;
    await act(async () => { selection = result.current.select('learning'); });
    rerender({ enabled: false });
    await act(async () => { finish(); await selection; });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(stopTrack).toHaveBeenCalledOnce();
  });

  it('cancels pending selection and listening when the dialog closes', async () => {
    const onSelect = vi.fn();
    let finishPrompt!: (value: boolean) => void;
    mocks.speak.mockImplementationOnce(() => new Promise((resolve) => { finishPrompt = resolve; }));
    const { result, rerender } = renderHook(({ enabled }) => useVoiceModeSelection({ enabled, learningReady: true, onSelect }), { initialProps: { enabled: true } });
    await waitFor(() => expect(result.current.status).toBe('prompting'));
    rerender({ enabled: false });
    act(() => finishPrompt(true));
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.stop).toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });
});
