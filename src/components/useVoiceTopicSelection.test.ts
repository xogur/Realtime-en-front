// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useVoiceTopicSelection } from './useVoiceTopicSelection';

type Options = {
  language: string;
  onFinalTranscript: (result: { text: string }) => void;
  onInterimTranscript: (text: string) => void;
  onError: (code: string) => void;
};
const mocks = vi.hoisted(() => ({
  options: null as Options | null,
  prepare: vi.fn(async () => true),
  start: vi.fn(async () => true),
  stop: vi.fn(async () => undefined),
  speak: vi.fn(async (_text: string) => true),
  cancel: vi.fn(),
}));
vi.mock('@/hooks/useBrowserStt', () => ({
  useBrowserStt: (options: Options) => {
    mocks.options = options;
    return { prepare: mocks.prepare, startAndWaitUntilReady: mocks.start, stop: mocks.stop, isRecording: true, status: 'listening' };
  },
}));
vi.mock('@/hooks/useBrowserTts', () => ({
  useBrowserTts: () => ({ speak: mocks.speak, cancel: mocks.cancel, isSpeaking: false }),
}));
const props = () => ({ enabled: true, onDifficultySelect: vi.fn(), onSelect: vi.fn() });

describe('post-prompt browser STT selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prepare.mockResolvedValue(true);
    mocks.start.mockResolvedValue(true);
    mocks.speak.mockResolvedValue(true);
  });

  it('does not start recognition or accept transcripts until TTS has finished', async () => {
    let finishPrompt!: (result: boolean) => void;
    mocks.speak.mockImplementationOnce(() => new Promise((resolve) => { finishPrompt = resolve; }));
    const callbacks = props();
    const { result } = renderHook(() => useVoiceTopicSelection(callbacks));
    await waitFor(() => expect(result.current.sttStatus).toBe('prompting'));
    expect(mocks.options?.language).toBe('ko-KR');
    expect(mocks.start).not.toHaveBeenCalled();
    expect(result.current.isRecording).toBe(false);
    act(() => mocks.options?.onFinalTranscript({ text: '초급' }));
    expect(callbacks.onDifficultySelect).not.toHaveBeenCalled();
    act(() => finishPrompt(true));
    await waitFor(() => expect(result.current.isRecording).toBe(true));
    expect(mocks.start).toHaveBeenCalledOnce();
  });

  it('keeps interim text visible but waits for final corrections', async () => {
    const callbacks = props();
    const { result } = renderHook(() => useVoiceTopicSelection(callbacks));
    await waitFor(() => expect(result.current.isRecording).toBe(true));
    act(() => mocks.options?.onInterimTranscript('초급'));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 350)); });
    expect(result.current.interim).toBe('초급');
    expect(callbacks.onDifficultySelect).not.toHaveBeenCalled();
    act(() => mocks.options?.onFinalTranscript({ text: '초급 말고 중급' }));
    await waitFor(() => expect(result.current.phase).toBe('topic'));
    expect(result.current.recognizedSpeech.difficulty).toBe('초급 말고 중급');
    expect(callbacks.onDifficultySelect).toHaveBeenCalledWith('intermediate');
    await waitFor(() => expect(mocks.speak).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.isRecording).toBe(true));
    expect(mocks.start).toHaveBeenCalledTimes(2);
  });

  it('retains unmatched recognition through the retry prompt', async () => {
    const { result } = renderHook(() => useVoiceTopicSelection(props()));
    await waitFor(() => expect(result.current.isRecording).toBe(true));
    act(() => mocks.options?.onFinalTranscript({ text: '조금' }));
    expect(result.current.recognizedSpeech.difficulty).toBe('조금');
    await waitFor(() => expect(mocks.speak).toHaveBeenCalledTimes(2));
    expect(result.current.phase).toBe('difficulty');
    expect(result.current.recognizedSpeech.difficulty).toBe('조금');
  });

  it('shows final difficulty and topic before launching once', async () => {
    const callbacks = props();
    const { result } = renderHook(() => useVoiceTopicSelection(callbacks));
    await waitFor(() => expect(result.current.isRecording).toBe(true));
    act(() => mocks.options?.onFinalTranscript({ text: '초급으로 음식점 할게요' }));
    expect(result.current.recognizedSpeech).toEqual({ difficulty: '초급으로 음식점 할게요', topic: '초급으로 음식점 할게요' });
    expect(callbacks.onSelect).not.toHaveBeenCalled();
    await waitFor(() => expect(callbacks.onSelect).toHaveBeenCalledExactlyOnceWith('restaurant', 'beginner'), { timeout: 2000 });
  });

  it('does not restart listening if the dialog closes during a prompt', async () => {
    let finishPrompt!: (result: boolean) => void;
    mocks.speak.mockImplementationOnce(() => new Promise((resolve) => { finishPrompt = resolve; }));
    const { result } = renderHook(() => useVoiceTopicSelection(props()));
    await waitFor(() => expect(result.current.sttStatus).toBe('prompting'));
    await act(async () => { await result.current.stop(); finishPrompt(true); });
    expect(mocks.start).not.toHaveBeenCalled();
    expect(result.current.phase).toBe('idle');
  });

  it('cancels a delayed voice selection when the dialog closes', async () => {
    const callbacks = props();
    const { result } = renderHook(() => useVoiceTopicSelection(callbacks));
    await waitFor(() => expect(result.current.isRecording).toBe(true));
    act(() => mocks.options?.onFinalTranscript({ text: '초급 공항' }));
    await act(async () => { await result.current.stop(); await new Promise((resolve) => setTimeout(resolve, 1300)); });
    expect(callbacks.onSelect).not.toHaveBeenCalled();
    expect(result.current.recognizedSpeech).toEqual({ difficulty: '', topic: '' });
  });

  it('keeps touch selection available when browser recognition is unsupported', async () => {
    mocks.start.mockResolvedValue(false);
    const callbacks = props();
    const { result } = renderHook(() => useVoiceTopicSelection(callbacks));
    await waitFor(() => expect(result.current.phase).toBe('unavailable'));
    expect(result.current.error).toContain('터치');
    await act(async () => { result.current.selectTopicByTouch('airport', 'advanced'); });
    expect(callbacks.onSelect).toHaveBeenCalledWith('airport', 'advanced');
  });

  it('selects numbered difficulty and topic using the current stage', async () => {
    const callbacks = props();
    const { result } = renderHook(() => useVoiceTopicSelection(callbacks));
    await waitFor(() => expect(result.current.isRecording).toBe(true));
    act(() => mocks.options?.onFinalTranscript({ text: '2번' }));
    await waitFor(() => expect(result.current.phase).toBe('topic'));
    expect(callbacks.onDifficultySelect).toHaveBeenCalledWith('intermediate');
    await waitFor(() => expect(result.current.isRecording).toBe(true));
    act(() => mocks.options?.onFinalTranscript({ text: '1번' }));
    await waitFor(() => expect(callbacks.onSelect).toHaveBeenCalledExactlyOnceWith('restaurant', 'intermediate'), { timeout: 2000 });
  });
});
