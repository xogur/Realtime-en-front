// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useBrowserStt } from './useBrowserStt';
import type { BrowserSpeechResultEvent } from '@/lib/stt';

type RecognitionHandlers = {
  onstart: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

class FakeSpeechRecognition implements RecognitionHandlers {
  static instances: FakeSpeechRecognition[] = [];

  lang = '';
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  unspokenPunctuation = false;
  onstart: (() => void) | null = null;
  onspeechstart: (() => void) | null = null;
  onspeechend: (() => void) | null = null;
  onaudioend: (() => void) | null = null;
  onnomatch: (() => void) | null = null;
  onresult: ((event: BrowserSpeechResultEvent) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  startedWith: MediaStreamTrack | null = null;

  constructor() {
    FakeSpeechRecognition.instances.push(this);
  }

  start(audioTrack?: MediaStreamTrack) {
    this.startedWith = audioTrack ?? null;
    this.onstart?.();
  }

  stop() {}
  abort() {}
}

class FakeAudioTrack extends EventTarget {
  kind = 'audio';
  readyState: MediaStreamTrackState = 'live';
  stop = vi.fn(() => {
    this.readyState = 'ended';
  });
  getCapabilities = vi.fn(() => ({
    echoCancellation: [true, false, 'all'],
  }));
  applyConstraints = vi.fn(async () => undefined);
  getSettings = vi.fn(() => ({
    echoCancellation: 'all',
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1,
    sampleRate: 48_000,
  }));
}

const makeMediaStream = (track: FakeAudioTrack): MediaStream => ({
  getAudioTracks: () => [track as unknown as MediaStreamTrack],
  getTracks: () => [track as unknown as MediaStreamTrack],
} as MediaStream);

class FakeSpeechRecognitionWithoutPunctuation extends FakeSpeechRecognition {
  constructor() {
    super();
    Reflect.deleteProperty(this, 'unspokenPunctuation');
  }
}

class FakeSpeechRecognitionWithThrowingPunctuation extends FakeSpeechRecognition {
  constructor() {
    super();
    Reflect.deleteProperty(this, 'unspokenPunctuation');
    Object.defineProperty(this, 'unspokenPunctuation', {
      configurable: true,
      set: () => {
        throw new Error('unsupported');
      },
    });
  }
}

const makeOptions = () => ({
  onFinalTranscript: vi.fn(),
  onInterimTranscript: vi.fn(),
  onReadyChange: vi.fn(),
  onError: vi.fn(),
  onUnavailable: vi.fn(),
  onSpeechStarted: vi.fn(),
  getPlaybackState: vi.fn(() => ({ isPlaying: false, text: '' })),
});

describe('useBrowserStt restart handling', () => {
  let audioTrack: FakeAudioTrack;
  let getUserMedia: ReturnType<typeof vi.fn>;
  let originalMediaDevicesDescriptor: PropertyDescriptor | undefined;
  let originalRecognitionDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    FakeSpeechRecognition.instances = [];
    originalMediaDevicesDescriptor = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
    originalRecognitionDescriptor = Object.getOwnPropertyDescriptor(
      window,
      'webkitSpeechRecognition',
    );
    Object.defineProperty(window, 'webkitSpeechRecognition', {
      configurable: true,
      value: FakeSpeechRecognition,
    });
    audioTrack = new FakeAudioTrack();
    getUserMedia = vi.fn(async () => makeMediaStream(audioTrack));
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    });
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    if (originalRecognitionDescriptor) {
      Object.defineProperty(window, 'webkitSpeechRecognition', originalRecognitionDescriptor);
    } else {
      Reflect.deleteProperty(window, 'webkitSpeechRecognition');
    }
    if (originalMediaDevicesDescriptor) {
      Object.defineProperty(navigator, 'mediaDevices', originalMediaDevicesDescriptor);
    } else {
      Reflect.deleteProperty(navigator, 'mediaDevices');
    }
  });

  it('uses the standard recognizer start call after configuring the microphone', async () => {
    const options = makeOptions();
    const { result } = renderHook(() => useBrowserStt(options));

    await act(async () => {
      expect(await result.current.start()).toBe(true);
    });

    const firstRecognition = FakeSpeechRecognition.instances.at(-1)!;
    expect(firstRecognition.startedWith).toBeNull();
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
    });
    expect(audioTrack.applyConstraints).toHaveBeenCalledWith({
      echoCancellation: { exact: 'all' },
    });

    act(() => firstRecognition.onend?.());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });

    expect(FakeSpeechRecognition.instances.at(-1)?.startedWith).toBeNull();
    expect(getUserMedia).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.stop();
    });
    expect(audioTrack.stop).toHaveBeenCalledTimes(1);
  });

  it('serializes simultaneous start calls onto one recognizer', async () => {
    const options = makeOptions();
    const { result } = renderHook(() => useBrowserStt(options));

    await act(async () => {
      const starts = await Promise.all([
        result.current.start(),
        result.current.start(),
      ]);
      expect(starts).toEqual([true, true]);
    });

    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(FakeSpeechRecognition.instances).toHaveLength(1);
  });

  it('falls back to standard AEC when the advertised all mode is rejected', async () => {
    audioTrack.applyConstraints
      .mockRejectedValueOnce(new DOMException('unsupported', 'OverconstrainedError'))
      .mockResolvedValueOnce(undefined);
    const options = makeOptions();
    const { result } = renderHook(() => useBrowserStt(options));

    await act(async () => {
      expect(await result.current.start()).toBe(true);
    });

    expect(audioTrack.applyConstraints).toHaveBeenNthCalledWith(1, {
      echoCancellation: { exact: 'all' },
    });
    expect(audioTrack.applyConstraints).toHaveBeenNthCalledWith(2, {
      echoCancellation: true,
    });
  });

  it('keeps the microphone usable when capability diagnostics throw', async () => {
    audioTrack.getCapabilities.mockImplementation(() => {
      throw new DOMException('unsupported', 'NotSupportedError');
    });
    audioTrack.getSettings.mockImplementation(() => {
      throw new DOMException('unsupported', 'NotSupportedError');
    });
    const options = makeOptions();
    const { result } = renderHook(() => useBrowserStt(options));

    await act(async () => {
      expect(await result.current.start()).toBe(true);
    });

    expect(audioTrack.applyConstraints).toHaveBeenCalledWith({ echoCancellation: true });
    expect(FakeSpeechRecognition.instances.at(-1)?.startedWith).toBeNull();
  });

  it.each([
    ['audio-capture', 'MICROPHONE_UNAVAILABLE'],
    ['not-allowed', 'MICROPHONE_DENIED'],
  ])('releases the AEC track and falls back after %s', async (browserError, appError) => {
    const options = makeOptions();
    const { result } = renderHook(() => useBrowserStt(options));

    await act(async () => {
      await result.current.start();
    });
    const recognition = FakeSpeechRecognition.instances.at(-1)!;
    act(() => {
      recognition.onerror?.({ error: browserError });
    });

    expect(audioTrack.stop).toHaveBeenCalledTimes(1);
    expect(options.onReadyChange).toHaveBeenLastCalledWith(false);
    expect(options.onError).toHaveBeenCalledWith(appError);
    expect(options.onUnavailable).toHaveBeenCalledTimes(1);
  });

  it('releases a late microphone acquisition after stop', async () => {
    let resolveStream: ((stream: MediaStream) => void) | undefined;
    getUserMedia.mockImplementation(() => new Promise<MediaStream>((resolve) => {
      resolveStream = resolve;
    }));
    const options = makeOptions();
    const { result } = renderHook(() => useBrowserStt(options));

    let startPromise: Promise<boolean> | undefined;
    act(() => {
      startPromise = result.current.start();
    });
    await act(async () => {
      await result.current.stop();
      resolveStream?.(makeMediaStream(audioTrack));
      await startPromise;
    });

    expect(audioTrack.stop).toHaveBeenCalledTimes(1);
    expect(FakeSpeechRecognition.instances).toHaveLength(0);
  });

  it('does not let a stale start cancel a newer start after stop', async () => {
    const replacementTrack = new FakeAudioTrack();
    let resolveFirstStream: ((stream: MediaStream) => void) | undefined;
    getUserMedia
      .mockImplementationOnce(() => new Promise<MediaStream>((resolve) => {
        resolveFirstStream = resolve;
      }))
      .mockResolvedValueOnce(makeMediaStream(replacementTrack));
    const options = makeOptions();
    const { result } = renderHook(() => useBrowserStt(options));

    let staleStart: Promise<boolean> | undefined;
    let currentStart: Promise<boolean> | undefined;
    act(() => {
      staleStart = result.current.start();
    });
    await act(async () => {
      await result.current.stop();
      currentStart = result.current.start();
      resolveFirstStream?.(makeMediaStream(audioTrack));
      expect(await staleStart).toBe(false);
      expect(await currentStart).toBe(true);
    });

    expect(audioTrack.stop).toHaveBeenCalledTimes(1);
    expect(replacementTrack.stop).not.toHaveBeenCalled();
    expect(FakeSpeechRecognition.instances).toHaveLength(1);
    expect(FakeSpeechRecognition.instances[0].startedWith).toBeNull();
  });

  it('reacquires the microphone and restarts recognition when the input track ends', async () => {
    const replacementTrack = new FakeAudioTrack();
    getUserMedia
      .mockResolvedValueOnce(makeMediaStream(audioTrack))
      .mockResolvedValueOnce(makeMediaStream(replacementTrack));
    const options = makeOptions();
    const { result } = renderHook(() => useBrowserStt(options));

    await act(async () => {
      await result.current.start();
    });
    act(() => {
      audioTrack.dispatchEvent(new Event('ended'));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });

    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(FakeSpeechRecognition.instances.at(-1)?.startedWith).toBeNull();
    expect(options.onError).toHaveBeenCalledWith('MICROPHONE_UNAVAILABLE');
  });

  it('keeps playback echo from triggering barge-in', async () => {
    const options = makeOptions();
    options.getPlaybackState.mockReturnValue({
      isPlaying: true,
      text: 'Please tell me about your morning walk',
    });
    const { result } = renderHook(() => useBrowserStt(options));

    await act(async () => {
      await result.current.start();
    });
    const recognition = FakeSpeechRecognition.instances.at(-1)!;
    act(() => {
      recognition.onresult?.({
        resultIndex: 0,
        results: [{
          0: { transcript: 'Please tell me about your morning walk' },
          isFinal: false,
          length: 1,
        }],
      });
    });

    expect(options.onSpeechStarted).not.toHaveBeenCalled();
    expect(options.onInterimTranscript).toHaveBeenLastCalledWith('');
  });

  it('triggers barge-in once for repeated non-echo interim results', async () => {
    const options = makeOptions();
    options.getPlaybackState.mockReturnValue({
      isPlaying: true,
      text: 'Please tell me about your morning walk',
    });
    const { result } = renderHook(() => useBrowserStt(options));

    await act(async () => {
      await result.current.start();
    });
    const recognition = FakeSpeechRecognition.instances.at(-1)!;
    act(() => {
      recognition.onresult?.({
        resultIndex: 0,
        results: [{ 0: { transcript: 'Stop please' }, isFinal: false, length: 1 }],
      });
      recognition.onresult?.({
        resultIndex: 0,
        results: [{ 0: { transcript: 'Stop please I want to answer' }, isFinal: false, length: 1 }],
      });
    });

    expect(options.onSpeechStarted).toHaveBeenCalledTimes(1);
    expect(options.onInterimTranscript).toHaveBeenLastCalledWith(
      'Stop please I want to answer',
    );
  });

  it('does not fall back after repeated healthy no-speech restarts', async () => {
    const options = makeOptions();
    const { result } = renderHook(() => useBrowserStt(options));

    await act(async () => {
      await result.current.start();
    });

    for (let cycle = 0; cycle < 12; cycle += 1) {
      const recognition = FakeSpeechRecognition.instances.at(-1)!;
      act(() => {
        recognition.onerror?.({ error: 'no-speech' });
        recognition.onend?.();
      });
      await act(async () => {
        await vi.runOnlyPendingTimersAsync();
      });
    }

    expect(FakeSpeechRecognition.instances).toHaveLength(13);
    expect(options.onUnavailable).not.toHaveBeenCalled();
    expect(options.onError).not.toHaveBeenCalledWith('STT_UNAVAILABLE');
  });

  it('still falls back after repeated service failures', async () => {
    const options = makeOptions();
    const { result } = renderHook(() => useBrowserStt(options));

    await act(async () => {
      await result.current.start();
    });

    for (let cycle = 0; cycle < 11; cycle += 1) {
      const recognition = FakeSpeechRecognition.instances.at(-1)!;
      act(() => {
        recognition.onerror?.({ error: 'network' });
        recognition.onend?.();
      });
      await act(async () => {
        await vi.runOnlyPendingTimersAsync();
      });
    }

    expect(options.onUnavailable).toHaveBeenCalledTimes(1);
    expect(options.onError).toHaveBeenCalledWith('STT_UNAVAILABLE');
  });

  it('enables supported punctuation inference and preserves separate final segments', async () => {
    const options = makeOptions();
    const { result } = renderHook(() => useBrowserStt(options));

    await act(async () => {
      await result.current.start();
    });

    const recognition = FakeSpeechRecognition.instances.at(-1)!;
    expect(recognition.unspokenPunctuation).toBe(true);

    act(() => {
      recognition.onresult?.({
        resultIndex: 0,
        results: [{ 0: { transcript: 'I like morning walks' }, isFinal: true, length: 1 }],
      });
      recognition.onresult?.({
        resultIndex: 1,
        results: [
          { 0: { transcript: 'I like morning walks' }, isFinal: true, length: 1 },
          { 0: { transcript: 'They make me feel fresh' }, isFinal: true, length: 1 },
        ],
      });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
    });

    expect(options.onFinalTranscript).toHaveBeenCalledWith({
      text: 'I like morning walks They make me feel fresh',
      speechEvidence: {
        version: 1,
        provider: 'browser',
        finalSegments: ['I like morning walks', 'They make me feel fresh'],
      },
    });
  });

  it.each([
    ['missing', FakeSpeechRecognitionWithoutPunctuation],
    ['throwing', FakeSpeechRecognitionWithThrowingPunctuation],
  ])('continues recognition when the punctuation property is %s', async (_name, Recognition) => {
    Object.defineProperty(window, 'webkitSpeechRecognition', {
      configurable: true,
      value: Recognition,
    });
    const options = makeOptions();
    const { result } = renderHook(() => useBrowserStt(options));

    await act(async () => {
      expect(await result.current.start()).toBe(true);
    });
    const recognition = FakeSpeechRecognition.instances.at(-1)!;
    act(() => {
      recognition.onresult?.({
        resultIndex: 0,
        results: [{ 0: { transcript: 'I like this cafe' }, isFinal: true, length: 1 }],
      });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
    });

    expect(options.onFinalTranscript).toHaveBeenCalledTimes(1);
    expect(options.onUnavailable).not.toHaveBeenCalled();
  });

  it('keeps pending finals when a healthy recognizer restarts its result indexes', async () => {
    const options = makeOptions();
    const { result } = renderHook(() => useBrowserStt(options));

    await act(async () => {
      await result.current.start();
    });
    const firstRecognition = FakeSpeechRecognition.instances.at(-1)!;
    act(() => {
      firstRecognition.onresult?.({
        resultIndex: 0,
        results: [{ 0: { transcript: 'I like coffee' }, isFinal: true, length: 1 }],
      });
      firstRecognition.onend?.();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });

    const secondRecognition = FakeSpeechRecognition.instances.at(-1)!;
    expect(secondRecognition).not.toBe(firstRecognition);
    act(() => {
      secondRecognition.onresult?.({
        resultIndex: 0,
        results: [{ 0: { transcript: 'It tastes good' }, isFinal: true, length: 1 }],
      });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
    });

    expect(options.onFinalTranscript).toHaveBeenCalledWith({
      text: 'I like coffee It tastes good',
      speechEvidence: {
        version: 1,
        provider: 'browser',
        finalSegments: ['I like coffee', 'It tastes good'],
      },
    });
  });
});
