// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useBrowserStt } from './useBrowserStt';

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
  onstart: (() => void) | null = null;
  onspeechstart: (() => void) | null = null;
  onspeechend: (() => void) | null = null;
  onaudioend: (() => void) | null = null;
  onnomatch: (() => void) | null = null;
  onresult = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;

  constructor() {
    FakeSpeechRecognition.instances.push(this);
  }

  start() {
    this.onstart?.();
  }

  stop() {}
  abort() {}
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
  beforeEach(() => {
    vi.useFakeTimers();
    FakeSpeechRecognition.instances = [];
    Object.defineProperty(window, 'webkitSpeechRecognition', {
      configurable: true,
      value: FakeSpeechRecognition,
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    Reflect.deleteProperty(window, 'webkitSpeechRecognition');
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
});
