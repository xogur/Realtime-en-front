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

vi.mock('@/lib/stt', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/stt')>();
  return {
    ...actual,
    getConfiguredSttProvider: () => 'browser',
  };
});

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

describe('useSttAdapter browser provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.startBrowser.mockResolvedValue(false);
    mocks.stopBrowser.mockResolvedValue(undefined);
    mocks.startServer.mockResolvedValue(true);
    mocks.stopServer.mockResolvedValue(undefined);
  });

  afterEach(cleanup);

  it('falls back to server when browser recognition cannot start', async () => {
    const { result } = renderHook(() => useSttAdapter(makeOptions()));

    await act(async () => {
      expect(await result.current.start()).toBe(true);
    });

    expect(result.current.provider).toBe('server');
    expect(mocks.stopBrowser).toHaveBeenCalledTimes(1);
    expect(mocks.startServer).toHaveBeenCalledTimes(1);
  });

  it('falls back to server after browser service failures', async () => {
    mocks.startBrowser.mockResolvedValueOnce(true);
    const { result } = renderHook(() => useSttAdapter(makeOptions()));

    await act(async () => {
      expect(await result.current.start()).toBe(true);
      mocks.onUnavailable?.();
      await Promise.resolve();
    });

    expect(result.current.provider).toBe('server');
    expect(mocks.startServer).toHaveBeenCalledTimes(1);
  });

  it('does not start the server recorder after stop cancels a pending browser start', async () => {
    let resolveBrowserStart: ((started: boolean) => void) | undefined;
    mocks.startBrowser.mockImplementationOnce(() => new Promise<boolean>((resolve) => {
      resolveBrowserStart = resolve;
    }));
    const { result } = renderHook(() => useSttAdapter(makeOptions()));

    let pendingStart: Promise<boolean | void> | undefined;
    act(() => {
      pendingStart = result.current.start();
    });
    await act(async () => {
      await result.current.stop();
      resolveBrowserStart?.(false);
      expect(await pendingStart).toBe(false);
    });

    expect(mocks.stopBrowser).toHaveBeenCalledTimes(1);
    expect(mocks.startServer).not.toHaveBeenCalled();
  });
});
