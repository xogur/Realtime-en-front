// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useStoryCheckStore } from './storyCheck';
import { isAvatarEcho, isFillerOnly, useStoryAnswerListener } from './useStoryAnswerListener';

const browserStt = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useBrowserStt', () => ({ useBrowserStt: browserStt }));

describe('story answer listener', () => {
  it('recognises thinking sounds only', () => {
    expect(isFillerOnly('음...')).toBe(true);
    expect(isFillerOnly('어 음')).toBe(true);
    expect(isFillerOnly('음 용')).toBe(false);
    expect(isFillerOnly('용')).toBe(false);
    expect(isFillerOnly('')).toBe(false);
  });

  it('without the server STT reports unavailable instead of starting browser recognition', async () => {
    useStoryCheckStore.getState().clear();
    const onUnavailable = vi.fn();
    const { result } = renderHook(() => useStoryAnswerListener({ onAnswer: vi.fn(), onUnavailable, avatarLine: () => '' }));
    await act(async () => { await result.current.listen(); });
    expect(onUnavailable).toHaveBeenCalledOnce();
    expect(result.current.state).toBe('idle');
    expect(browserStt).not.toHaveBeenCalled();
  });

  describe('server STT (Korean Whisper)', () => {
    const PROMPT = { checkId: 'check-srv0001', seq: 2, attempt: 0, kind: 'question', questionKo: '누가 숨었지?', speechKo: '가장 용감한 병사들은 어디에 숨었지?', index: 0, total: 2 };
    const say = (type: 'story_check_partial' | 'story_check_heard', content: string, seq = 2) =>
      act(() => { useStoryCheckStore.getState().receive(type, { checkId: 'check-srv0001', seq, content }); });

    function setup() {
      useStoryCheckStore.getState().clear();
      useStoryCheckStore.getState().receive('story_check_prompt', PROMPT);
      const server = { arm: vi.fn(() => true), disarm: vi.fn() };
      const onAnswer = vi.fn();
      const onUnavailable = vi.fn();
      const hook = renderHook(() => useStoryAnswerListener({ onAnswer, onUnavailable, avatarLine: () => PROMPT.speechKo, server }));
      return { ...hook, server, onAnswer, onUnavailable };
    }

    it('arms the server for the prompt and answers with its final, remembering it to show back', async () => {
      const { result, server, onAnswer } = setup();
      await act(async () => { await result.current.listen(); });
      expect(server.arm).toHaveBeenCalledWith('check-srv0001', 2);
      expect(result.current.state).toBe('listening');
      say('story_check_partial', '나무');
      expect(result.current).toMatchObject({ state: 'hearing', heard: '나무' });
      say('story_check_heard', '나무 말 안에요', 1);
      expect(onAnswer).not.toHaveBeenCalled();
      say('story_check_heard', '나무 말 안에요');
      expect(onAnswer).toHaveBeenCalledWith('나무 말 안에요');
      expect(result.current.answer).toBe('나무 말 안에요');
      act(() => result.current.forget());
      expect(result.current.answer).toBe('');
    });

    it('re-arms after a thinking sound or the avatar echo and disarms on stop', async () => {
      const { result, server, onAnswer } = setup();
      await act(async () => { await result.current.listen(); });
      say('story_check_heard', '음…');
      say('story_check_heard', '어디에 숨었지');
      expect(onAnswer).not.toHaveBeenCalled();
      expect(server.arm).toHaveBeenCalledTimes(3);
      act(() => result.current.stop());
      expect(server.disarm).toHaveBeenCalledTimes(1);
    });

    it('reports unavailable when the socket cannot arm', async () => {
      const { result, server, onUnavailable } = setup();
      server.arm.mockReturnValue(false);
      await act(async () => { await result.current.listen(); });
      expect(onUnavailable).toHaveBeenCalled();
      expect(result.current.state).toBe('idle');
    });
  });

  it('tells the avatar echo from an answer', () => {
    expect(isAvatarEcho('어디에 숨었지', '가장 용감한 병사들은 어디에 숨었지?')).toBe(true);
    expect(isAvatarEcho('나무 말', '가장 용감한 병사들은 어디에 숨었지?')).toBe(false);
    expect(isAvatarEcho('지', '숨었지')).toBe(false);
  });
});
