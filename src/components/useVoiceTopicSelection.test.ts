// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useVoiceTopicSelection } from './useVoiceTopicSelection';

type SttOptions = {
  onFinalTranscript: (transcript: {
    text: string;
    speechEvidence: { version: 1; provider: 'browser'; finalSegments: string[] };
  }) => void;
  onInterimTranscript: (transcript: string) => void;
  onReadyChange: (ready: boolean) => void;
  onSpeechStarted: () => void;
};

const mocks = vi.hoisted(() => ({
  order: [] as string[],
  autoReady: true,
  readyResolver: null as ((ready: boolean) => void) | null,
  sttOptions: null as SttOptions | null,
  prepare: vi.fn(async () => {
    mocks.order.push('prepare');
    return true;
  }),
  start: vi.fn(async () => {
    mocks.order.push('start');
    if (mocks.autoReady) {
      mocks.sttOptions?.onReadyChange(true);
      return true;
    }
    return new Promise<boolean>((resolve) => { mocks.readyResolver = resolve; });
  }),
  stop: vi.fn(async () => {
    mocks.order.push('stop');
  }),
  restart: vi.fn(async () => {
    mocks.order.push('restart');
    if (mocks.autoReady) mocks.sttOptions?.onReadyChange(true);
    return true;
  }),
  speak: vi.fn(async (text: string) => {
    mocks.order.push(`speak:${text}`);
    return true;
  }),
  cancel: vi.fn(),
}));

vi.mock('@/hooks/useBrowserStt', () => ({
  useBrowserStt: (options: SttOptions) => {
    mocks.sttOptions = options;
    return {
      prepare: mocks.prepare,
      start: mocks.start,
      startAndWaitUntilReady: mocks.start,
      restartAndWaitUntilReady: mocks.restart,
      stop: mocks.stop,
      isRecording: true,
      status: 'listening',
    };
  },
}));

vi.mock('@/hooks/useBrowserTts', () => ({
  useBrowserTts: () => ({
    speak: mocks.speak,
    cancel: mocks.cancel,
    isSpeaking: true,
  }),
}));

const finalTranscript = (text: string) => ({
  text,
  speechEvidence: {
    version: 1 as const,
    provider: 'browser' as const,
    finalSegments: [text],
  },
});

describe('useVoiceTopicSelection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.order.length = 0;
    mocks.autoReady = true;
    mocks.readyResolver = null;
    mocks.sttOptions = null;
    mocks.speak.mockImplementation(async (text: string) => {
      mocks.order.push(`speak:${text}`);
      return true;
    });
  });

  it('opens STT before starting the difficulty prompt', async () => {
    renderHook(() => useVoiceTopicSelection({
      enabled: true,
      onDifficultySelect: vi.fn(),
      onSelect: vi.fn(),
    }));

    await waitFor(() => expect(mocks.start).toHaveBeenCalledOnce());
    expect(mocks.speak).toHaveBeenCalledWith(expect.stringContaining('대화 난이도'), 'ko-KR');
    expect(mocks.order.indexOf('start')).toBeLessThan(
      mocks.order.findIndex((entry) => entry.startsWith('speak:대화 난이도')),
    );
  });

  it('waits for the recognizer ready event before speaking the difficulty prompt', async () => {
    mocks.autoReady = false;
    renderHook(() => useVoiceTopicSelection({
      enabled: true,
      onDifficultySelect: vi.fn(),
      onSelect: vi.fn(),
    }));

    await waitFor(() => expect(mocks.start).toHaveBeenCalledOnce());
    expect(mocks.speak).not.toHaveBeenCalled();

    act(() => {
      mocks.sttOptions?.onReadyChange(true);
      mocks.readyResolver?.(true);
    });
    await waitFor(() => expect(mocks.speak).toHaveBeenCalledWith(
      expect.stringContaining('대화 난이도'),
      'ko-KR',
    ));
  });

  it('moves to topic selection as soon as an exact difficulty interim is heard', async () => {
    const onDifficultySelect = vi.fn();
    const { result } = renderHook(() => useVoiceTopicSelection({
      enabled: true,
      onDifficultySelect,
      onSelect: vi.fn(),
    }));
    await waitFor(() => expect(result.current.phase).toBe('difficulty'));

    act(() => mocks.sttOptions?.onInterimTranscript('초급'));
    await waitFor(() => expect(result.current.phase).toBe('topic'), { timeout: 1_000 });
    expect(onDifficultySelect).toHaveBeenCalledWith('beginner');
  });

  it('accepts a fast combined answer while the difficulty prompt is playing', async () => {
    const onDifficultySelect = vi.fn();
    const onSelect = vi.fn();
    renderHook(() => useVoiceTopicSelection({
      enabled: true,
      onDifficultySelect,
      onSelect,
    }));

    await waitFor(() => expect(mocks.start).toHaveBeenCalledOnce());
    const startIndex = mocks.order.indexOf('start');
    const promptIndex = mocks.order.findIndex((entry) => entry.startsWith('speak:대화 난이도'));
    expect(startIndex).toBeGreaterThanOrEqual(0);
    expect(promptIndex).toBeGreaterThanOrEqual(0);
    expect(startIndex).toBeLessThan(promptIndex);

    act(() => mocks.sttOptions?.onSpeechStarted());
    expect(mocks.cancel).toHaveBeenCalled();

    act(() => mocks.sttOptions?.onInterimTranscript('초급으로 음식점 할게요'));
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith('restaurant', 'beginner'));
    expect(onDifficultySelect).toHaveBeenCalledWith('beginner');
    expect(mocks.stop).toHaveBeenCalled();
  });

  it('prompts for the topic after difficulty and starts on a spoken topic', async () => {
    const onDifficultySelect = vi.fn();
    const onSelect = vi.fn();
    renderHook(() => useVoiceTopicSelection({
      enabled: true,
      onDifficultySelect,
      onSelect,
    }));
    await waitFor(() => expect(mocks.start).toHaveBeenCalledOnce());

    act(() => mocks.sttOptions?.onFinalTranscript(finalTranscript('초급으로 할게요')));
    await waitFor(() => expect(onDifficultySelect).toHaveBeenCalledWith('beginner'));
    await waitFor(() => expect(mocks.speak).toHaveBeenCalledWith(
      expect.stringContaining('주제나 상황'),
      'ko-KR',
    ));
    expect(onSelect).not.toHaveBeenCalled();

    act(() => mocks.sttOptions?.onInterimTranscript('음식점이요'));
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith('restaurant', 'beginner'));
  });

  it('accepts difficulty and topic while each TTS prompt is still playing', async () => {
    let finishDifficultyPrompt: ((played: boolean) => void) | undefined;
    mocks.speak.mockImplementationOnce((text: string) => {
      mocks.order.push(`speak:${text}`);
      return new Promise<boolean>((resolve) => {
        finishDifficultyPrompt = resolve;
      });
    });
    const onDifficultySelect = vi.fn();
    const onSelect = vi.fn();

    const { result } = renderHook(() => useVoiceTopicSelection({
      enabled: true,
      onDifficultySelect,
      onSelect,
    }));
    await waitFor(() => expect(mocks.speak).toHaveBeenCalledWith(
      expect.stringContaining('대화 난이도'),
      'ko-KR',
    ));

    act(() => {
      mocks.sttOptions?.onSpeechStarted();
      mocks.sttOptions?.onFinalTranscript(finalTranscript('초급'));
    });
    await waitFor(() => expect(result.current.phase).toBe('topic'));
    expect(onDifficultySelect).toHaveBeenCalledWith('beginner');
    expect(mocks.speak).toHaveBeenCalledWith(expect.stringContaining('주제나 상황'), 'ko-KR');

    act(() => {
      mocks.sttOptions?.onSpeechStarted();
      mocks.sttOptions?.onFinalTranscript(finalTranscript('음식점'));
    });
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith('restaurant', 'beginner'));
    expect(finishDifficultyPrompt).toBeTypeOf('function');
    act(() => finishDifficultyPrompt?.(true));
  });
});
