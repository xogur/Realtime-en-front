// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useStore } from '@/stores/useStore';
import { StoryTalkPanel, storyTalkStatus } from './StoryTalkPanel';

const base = { connected: true, stalled: false, error: null, playing: false, thinking: false, streaming: false, recording: true, ready: true, hearing: false };

describe('story talk status', () => {
  it.each([
    [{ connected: false }, 'connecting'],
    [{ connected: false, stalled: true }, 'offline'],
    [{ error: '마이크 오류' }, 'error'],
    [{ playing: true }, 'speaking'],
    [{ streaming: true }, 'thinking'],
    [{ hearing: true }, 'hearing'],
    [{}, 'listening'],
    [{ ready: false }, 'preparing'],
    [{ recording: false, ready: false }, 'muted'],
  ])('%j → %s', (patch, expected) => {
    expect(storyTalkStatus({ ...base, ...patch })).toBe(expected);
  });
});

describe('story talk panel', () => {
  beforeEach(() => {
    useStore.setState({
      isConnected: true, isRecording: true, isSttReady: true, isPlaying: false, isThinking: false,
      messages: [
        { role: 'user', content: '예전 프리토킹' },
        { role: 'assistant', content: '지난 이야기 대화', storyTalkId: 'old-talk' },
        { role: 'assistant', content: '이야기를 잠깐 멈췄어.', storyTalkId: 'talk-1' },
      ],
      liveTranscript: '', partialMessage: '',
    });
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  const panel = (props: Partial<Parameters<typeof StoryTalkPanel>[0]> = {}) => (
    <StoryTalkPanel where="오디세우스의 모험 · 1장" talkId="talk-1" error={null}
      onListen={vi.fn()} onMute={vi.fn()} onRetry={vi.fn()} onFinish={vi.fn()} {...props} />
  );

  it('shows only this talk, the live utterance and the streaming answer', () => {
    render(panel());
    expect(screen.queryByText('예전 프리토킹')).toBeNull();
    expect(screen.queryByText('지난 이야기 대화')).toBeNull();
    expect(screen.getByText('이야기를 잠깐 멈췄어.')).toBeTruthy();
    expect(screen.getByText('지금 말해 보세요')).toBeTruthy();

    act(() => { useStore.setState({ liveTranscript: 'brave 발음' }); });
    expect(document.querySelector('[data-story-talk-live]')?.textContent).toContain('brave 발음');
    expect(screen.getByText('듣고 있어요')).toBeTruthy();

    act(() => { useStore.setState({ liveTranscript: '', partialMessage: 'brave는 브레이브' }); });
    expect(document.querySelector('[data-story-talk-streaming]')?.textContent).toContain('brave는 브레이브');
    expect(screen.getByText('대답을 생각하는 중')).toBeTruthy();
  });

  it('toggles the microphone and shows when it is off', () => {
    const onMute = vi.fn();
    const onListen = vi.fn();
    const { rerender } = render(panel({ onMute, onListen }));
    fireEvent.click(screen.getByRole('button', { name: '마이크 끄기' }));
    expect(onMute).toHaveBeenCalled();

    act(() => { useStore.setState({ isRecording: false, isSttReady: false }); });
    rerender(panel({ onMute, onListen }));
    expect(screen.getByText('마이크가 꺼져 있어요')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '마이크 켜기' }));
    expect(onListen).toHaveBeenCalled();
  });

  it('reports a connection that never opens and offers a retry', () => {
    vi.useFakeTimers();
    useStore.setState({ isConnected: false, isRecording: false });
    const onRetry = vi.fn();
    render(panel({ onRetry }));
    expect(screen.getByText('AI 선생님 연결 중')).toBeTruthy();
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(screen.getByText('AI 서버에 연결하지 못했어요')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /다시 시도/ }));
    expect(onRetry).toHaveBeenCalled();
  });
});
