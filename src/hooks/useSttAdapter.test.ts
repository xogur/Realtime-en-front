// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSttAdapter } from './useSttAdapter';

const mocks = vi.hoisted(() => ({
  startBrowser: vi.fn(),
  stopBrowser: vi.fn(),
  startServer: vi.fn(),
  stopServer: vi.fn(),
  setOnDataAvailable: vi.fn(),
  onUnavailable: undefined as undefined | (() => void),
}));

vi.mock('./useAudioRecorder', () => ({
  useAudioRecorder: () => ({
    startRecording: mocks.startServer,
    stopRecording: mocks.stopServer,
    setOnDataAvailable: mocks.setOnDataAvailable,
    isRecording: false,
  }),
}));

vi.mock('./useBrowserStt', () => ({
  useBrowserStt: (options: { onUnavailable: () => void }) => {
    mocks.onUnavailable = options.onUnavailable;
    return {
      start: mocks.startBrowser,
      stop: mocks.stopBrowser,
      isRecording: false,
    };
  },
}));

const makeOptions = () => ({
  onAudioData: vi.fn(),
  onFinalTranscript: vi.fn(),
  onInterimTranscript: vi.fn(),
  onReadyChange: vi.fn(),
  onError: vi.fn(),
  onSpeechStarted: vi.fn(),
  getPlaybackState: vi.fn(() => ({ isPlaying: false, text: '' })),
});

describe('useSttAdapter browser fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.startBrowser.mockResolvedValue(false);
    mocks.stopBrowser.mockResolvedValue(undefined);
    mocks.startServer.mockResolvedValue(true);
    mocks.stopServer.mockResolvedValue(undefined);
  });

  afterEach(cleanup);

  it('switches to server when browser recognition cannot start', async () => {
    const { result } = renderHook(() => useSttAdapter(makeOptions()));

    await act(async () => {
      expect(await result.current.start()).toBe(true);
    });

    expect(result.current.provider).toBe('server');
    expect(mocks.startServer).toHaveBeenCalledTimes(1);
  });

  it('switches to server after repeated browser service failures', () => {
    const { result } = renderHook(() => useSttAdapter(makeOptions()));

    act(() => mocks.onUnavailable?.());

    expect(result.current.provider).toBe('server');
    expect(mocks.startServer).toHaveBeenCalledTimes(1);
  });
});
