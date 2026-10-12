// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StoryListeningView } from './StoryListeningView';
import type { StoryTalk } from './control';
import { ODYSSEY } from './stories/odyssey';
import { RELUCTANT_DRAGON } from './stories/reluctantDragon';
import { buildStoryTalkContext, STORY_TALK_LIMITS } from './storyTalkContext';

class SpeechAudio extends EventTarget {
  static all: SpeechAudio[] = [];
  currentTime = 0; duration = 4; playbackRate = 1; preservesPitch = true; preload = ''; paused = true;
  play = vi.fn(async () => { this.paused = false; this.dispatchEvent(new Event('playing')); });
  pause = vi.fn(() => { this.paused = true; });
  load = vi.fn(); removeAttribute = vi.fn();
  constructor(public src: string) { super(); SpeechAudio.all.push(this); }
  finish() { this.paused = true; this.dispatchEvent(new Event('ended')); }
}

const requested: StoryTalk = { phase: 'requested', requestId: 'talk-1', position: null };

describe('story talk on the guide screen', () => {
  beforeEach(() => { vi.useFakeTimers(); SpeechAudio.all = []; vi.stubGlobal('Audio', SpeechAudio); });
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

  const view = (talk: StoryTalk | null, onTalkPaused = vi.fn(), onEndTalk = vi.fn()) => (
    <StoryListeningView isOpen storyId="odyssey" onBack={vi.fn()} onClose={vi.fn()}
      talk={talk} onTalkPaused={onTalkPaused} onEndTalk={onEndTalk} />
  );

  it('pauses narration, reports the heard sentence, and resumes when the talk ends', async () => {
    const onTalkPaused = vi.fn();
    const { rerender } = render(view(null, onTalkPaused));
    fireEvent.click(screen.getByRole('button', { name: '오디세우스의 모험 시작' }));
    fireEvent.click(screen.getByRole('button', { name: /이야기 시작하기/ }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '바로 시작' })); });
    const playing = SpeechAudio.all.at(-1)!;
    expect(playing.paused).toBe(false);

    rerender(view(requested, onTalkPaused));
    await act(async () => { vi.runOnlyPendingTimers(); });

    expect(playing.paused).toBe(true);
    expect(onTalkPaused).toHaveBeenCalledWith('talk-1', { storyId: 'odyssey', chapterIndex: 0, heardThrough: 0 });
    expect(screen.getByText('이야기를 잠깐 멈췄어요')).toBeTruthy();
    expect(screen.getByRole('dialog', { hidden: true }).hasAttribute('inert')).toBe(true);

    const plays = playing.play.mock.calls.length;
    await act(async () => { rerender(view(null, onTalkPaused)); });
    expect(playing.play.mock.calls.length).toBe(plays + 1);
    expect(screen.queryByText('이야기를 잠깐 멈췄어요')).toBeNull();
  });

  it('answers a request from the library without a position and offers to continue', async () => {
    const onTalkPaused = vi.fn();
    const onEndTalk = vi.fn();
    render(view(requested, onTalkPaused, onEndTalk));
    await act(async () => { vi.runOnlyPendingTimers(); });

    expect(onTalkPaused).toHaveBeenCalledWith('talk-1', null);
    fireEvent.click(screen.getByRole('button', { name: /이야기 계속/ }));
    expect(onEndTalk).toHaveBeenCalledWith('talk-1');
  });

  it('keeps a start requested during the talk until the talk ends', async () => {
    const { rerender } = render(view(null));
    fireEvent.click(screen.getByRole('button', { name: '오디세우스의 모험 시작' }));
    fireEvent.click(screen.getByRole('button', { name: /이야기 시작하기/ }));
    rerender(view({ ...requested, phase: 'active', position: { storyId: 'odyssey', chapterIndex: 0, heardThrough: -1 } }));
    // The chapter title card would start narration by itself after a moment.
    await act(async () => { vi.advanceTimersByTime(3000); });
    expect(SpeechAudio.all.every((audio) => audio.play.mock.calls.length === 0)).toBe(true);

    await act(async () => { rerender(view(null)); });
    expect(SpeechAudio.all.some((audio) => audio.play.mock.calls.length > 0)).toBe(true);
  });
});

describe('story talk context', () => {
  it('includes only the heard sentences and words of the current chapter', () => {
    const chapter = ODYSSEY.chapters[1];
    const context = buildStoryTalkContext({ storyId: 'odyssey', chapterIndex: 1, heardThrough: 0 })!;

    expect(context.chapter.sentences).toEqual([{ en: chapter.sentences[0].en, ko: chapter.sentences[0].ko }]);
    expect(context.chapter.complete).toBe(false);
    const heard = chapter.sentences[0].en.toLowerCase();
    expect(context.chapter.words.every((word) => heard.includes(word.word.toLowerCase()))).toBe(true);
    expect(context.previous).toHaveLength(1);
    expect(context.previous[0].recapKo).toContain(ODYSSEY.chapters[0].sentences[0].ko);
  });

  it('keeps recaps of the latest chapters within the budget', () => {
    const last = RELUCTANT_DRAGON.chapters.length - 1;
    const context = buildStoryTalkContext({ storyId: 'reluctant-dragon', chapterIndex: last, heardThrough: 999 })!;

    const recap = context.previous.reduce((sum, item) => sum + item.recapKo.length, 0);
    expect(recap).toBeLessThanOrEqual(STORY_TALK_LIMITS.recapChars);
    expect(context.previous.at(-1)!.recapKo.length).toBeGreaterThan(0);
    expect(context.chapter.complete).toBe(true);
    expect(context.chapter.sentences.length).toBe(RELUCTANT_DRAGON.chapters[last].sentences.length);
  });

  it('fails closed for an unknown story or chapter', () => {
    expect(buildStoryTalkContext({ storyId: 'nope', chapterIndex: 0, heardThrough: 0 })).toBeNull();
    expect(buildStoryTalkContext({ storyId: 'odyssey', chapterIndex: 99, heardThrough: 0 })).toBeNull();
  });
});
