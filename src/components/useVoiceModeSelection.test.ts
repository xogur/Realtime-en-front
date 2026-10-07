// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useVoiceModeSelection } from './useVoiceModeSelection';

type Options = {
  onFinalTranscript: (result: { text: string }) => void;
  onInterimTranscript: (text: string) => void;
  onError: (code: string) => void;
};
const mocks = vi.hoisted(() => ({
  options: null as Options | null,
  prepare: vi.fn(async () => true), start: vi.fn(async () => true),
  takeAudioInput: vi.fn<() => Promise<MediaStream | null>>(async () => null),
  stop: vi.fn(async () => undefined), speak: vi.fn(async () => true), cancel: vi.fn(),
}));
vi.mock('@/hooks/useBrowserStt', () => ({
  useBrowserStt: (options: Options) => {
    mocks.options = options;
    return { prepare: mocks.prepare, takeAudioInput: mocks.takeAudioInput, startAndWaitUntilReady: mocks.start, stop: mocks.stop, isRecording: true };
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
    act(() => mocks.options?.onInterimTranscript('학습모드'));
    expect(onSelect).not.toHaveBeenCalled();
    act(() => mocks.options?.onFinalTranscript({ text: '학습모드 말고 프리토킹' }));
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith('free_talk'));
    expect(onSelect).toHaveBeenCalledTimes(1);
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
