// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSttAdapter } from './useSttAdapter';

const mocks = vi.hoisted(() => ({
  startBrowser: vi.fn(async () => true),
  stopBrowser: vi.fn(async () => undefined),
  startServer: vi.fn(async () => true),
  stopServer: vi.fn(async () => undefined),
  resolveLanguage: undefined as undefined | (() => string | undefined),
}));

// A server-STT build: English server recognition unless a start asks for a language.
vi.mock('@/lib/stt', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/stt')>();
  return { ...actual, getConfiguredSttProvider: () => 'server' };
});

vi.mock('./useAudioRecorder', () => ({
  useAudioRecorder: () => ({
    startRecording: mocks.startServer,
    prepareRecording: vi.fn(async () => true),
    pauseRecording: vi.fn(async () => undefined),
    stopRecording: mocks.stopServer,
    setOnDataAvailable: vi.fn(),
    isRecording: false,
  }),
}));

vi.mock('./useBrowserStt', () => ({
  useBrowserStt: (options: { resolveLanguage?: () => string | undefined }) => {
    mocks.resolveLanguage = options.resolveLanguage;
    return { start: mocks.startBrowser, stop: mocks.stopBrowser, isRecording: false };
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

describe('useSttAdapter language start on a server build', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.startBrowser.mockResolvedValue(true); });

  it('recognises the requested language in the browser, then returns to the server model', async () => {
    const { result } = renderHook(() => useSttAdapter(makeOptions()));

    await act(async () => { await result.current.start({ language: 'ko-KR' }); });
    expect(mocks.startBrowser).toHaveBeenCalledOnce();
    expect(mocks.startServer).not.toHaveBeenCalled();
    expect(mocks.resolveLanguage?.()).toBe('ko-KR');
    expect(result.current.provider).toBe('browser');

    await act(async () => { await result.current.stop(); });
    expect(mocks.stopBrowser).toHaveBeenCalled();
    await act(async () => { await result.current.start(); });
    expect(mocks.startServer).toHaveBeenCalledOnce();
    expect(mocks.resolveLanguage?.()).toBeUndefined();
    expect(result.current.provider).toBe('server');
  });

  it('falls back to the server recorder when browser recognition cannot start', async () => {
    mocks.startBrowser.mockResolvedValue(false);
    const { result } = renderHook(() => useSttAdapter(makeOptions()));

    await act(async () => { await result.current.start({ language: 'ko-KR' }); });

    expect(mocks.startServer).toHaveBeenCalledOnce();
    expect(result.current.provider).toBe('server');
  });
});
