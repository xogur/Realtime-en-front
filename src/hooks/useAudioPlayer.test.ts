// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useStore } from '@/stores/useStore';
import { useAudioPlayer } from './useAudioPlayer';

class FakeAudioParam {
  value = 1;
  events: Array<[string, number, number]> = [];

  cancelScheduledValues(time: number) {
    this.events.push(['cancel', this.value, time]);
  }

  setValueAtTime(value: number, time: number) {
    this.value = value;
    this.events.push(['set', value, time]);
  }

  linearRampToValueAtTime(value: number, time: number) {
    this.value = value;
    this.events.push(['ramp', value, time]);
  }
}

class FakeSource {
  buffer: { duration: number } | null = null;
  onended: (() => void) | null = null;
  connect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}

class FakeAudioContext {
  static latest: FakeAudioContext;
  currentTime = 10;
  destination = {};
  state: AudioContextState = 'running';
  gain = { gain: new FakeAudioParam(), connect: vi.fn() };
  analyser = { connect: vi.fn(), fftSize: 0, minDecibels: 0, maxDecibels: 0, smoothingTimeConstant: 0 };
  sources: FakeSource[] = [];

  constructor() {
    FakeAudioContext.latest = this;
  }

  createAnalyser() {
    return this.analyser;
  }

  createGain() {
    return this.gain;
  }

  createBuffer(_channels: number, length: number, sampleRate: number) {
    return {
      duration: length / sampleRate,
      copyToChannel: vi.fn(),
    };
  }

  createBufferSource() {
    const source = new FakeSource();
    this.sources.push(source);
    return source;
  }

  close = vi.fn();
  resume = vi.fn();
}

describe('useAudioPlayer TTS ducking', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      value: FakeAudioContext,
    });
    useStore.getState().setPlaying(false);
    useStore.getState().setAudioAnalyser(null);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('ramps to five percent without changing the playing state', () => {
    const { result } = renderHook(() => useAudioPlayer());

    act(() => {
      result.current.playPcmChunk({ content: 'AAA=', sampleRate: 16_000 });
      result.current.muteTts();
    });

    expect(FakeAudioContext.latest.gain.gain.events.at(-1)).toEqual(['ramp', 0.05, 10.015]);
    expect(useStore.getState().isPlaying).toBe(true);
  });

  it('restores gain smoothly and clearQueue resets it immediately', () => {
    const { result } = renderHook(() => useAudioPlayer());

    act(() => {
      result.current.muteTts();
      result.current.unmuteTts();
    });
    expect(FakeAudioContext.latest.gain.gain.events.at(-1)).toEqual(['ramp', 1, 10.04]);

    act(() => result.current.clearQueue());
    expect(FakeAudioContext.latest.gain.gain.events.at(-1)).toEqual(['set', 1, 10]);
    expect(useStore.getState().isPlaying).toBe(false);
  });

  it('resets gain when the final source ends naturally', () => {
    const { result } = renderHook(() => useAudioPlayer());

    act(() => {
      result.current.playPcmChunk({ content: 'AAA=', sampleRate: 16_000 });
      result.current.muteTts();
    });
    act(() => FakeAudioContext.latest.sources[0].onended?.());

    expect(FakeAudioContext.latest.gain.gain.events.at(-1)).toEqual(['set', 1, 10]);
    expect(useStore.getState().isPlaying).toBe(false);
  });
});
