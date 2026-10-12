// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StoryTalkAvatar } from './StoryTalkAvatar';
import type { StoryTalk } from './control';

const posted: Record<string, unknown>[] = [];
let status = 200;

beforeEach(() => {
  posted.length = 0;
  status = 200;
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
    posted.push(JSON.parse(String(init?.body)));
    return new Response('{}', { status });
  }));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

const paused: StoryTalk = { phase: 'paused', requestId: 'talk-1', position: { storyId: 'odyssey', chapterIndex: 0, heardThrough: 1 } };

function setup(talk: StoryTalk | null) {
  const onTalkChange = vi.fn();
  const startTalk = vi.fn(() => 'talk-id');
  const utils = render(<StoryTalkAvatar kioskId="A02" talk={talk} onTalkChange={onTalkChange} startTalk={startTalk}
    listen={vi.fn()} mute={vi.fn()} talkError={null} />);
  return { onTalkChange, startTalk, ...utils };
}

describe('avatar story talk', () => {
  it('waits behind a paused cover and asks the guide screen to stop the story', async () => {
    const { onTalkChange } = setup(null);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /AI 선생님과 이야기하기/ })); });

    expect(onTalkChange).toHaveBeenCalledWith(expect.objectContaining({ phase: 'requested', position: null }));
    expect(posted[0]).toMatchObject({ action: 'talk', phase: 'requested' });
  });

  it('confirms before talking and gives the avatar only what was heard', async () => {
    const { onTalkChange, startTalk } = setup(paused);
    expect(screen.getByText(/2번째 문장까지 들었어요/)).toBeTruthy();

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '이야기하기' })); });

    expect(posted[0]).toMatchObject({ action: 'talk', phase: 'active', requestId: 'talk-1' });
    expect(onTalkChange).toHaveBeenCalledWith({ ...paused, phase: 'active' });
    expect(startTalk.mock.calls[0][0].chapter.sentences).toHaveLength(2);
  });

  it('hands the story back when the learner keeps listening', async () => {
    const { onTalkChange, startTalk } = setup(paused);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '계속 듣기' })); });

    expect(onTalkChange).toHaveBeenCalledWith(null);
    expect(posted[0]).toMatchObject({ action: 'talk', phase: 'off', requestId: 'talk-1' });
    expect(startTalk).not.toHaveBeenCalled();
  });

  it('does not talk when the relay refused the turn', async () => {
    status = 409;
    const { startTalk, onTalkChange } = setup(paused);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '이야기하기' })); });

    expect(startTalk).not.toHaveBeenCalled();
    expect(onTalkChange).toHaveBeenCalledWith(null);
  });

  it('withdraws a request the guide screen never answers', async () => {
    vi.useFakeTimers();
    const { onTalkChange } = setup({ phase: 'requested', requestId: 'talk-2', position: null });
    await act(async () => { vi.advanceTimersByTime(6_000); });

    expect(onTalkChange).toHaveBeenCalledWith(null);
    expect(posted[0]).toMatchObject({ phase: 'off', requestId: 'talk-2' });
  });

  it('returns from an active talk to the story', async () => {
    const { onTalkChange } = setup({ ...paused, phase: 'active' });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '이야기로' })); });

    expect(onTalkChange).toHaveBeenCalledWith(null);
    expect(posted[0]).toMatchObject({ phase: 'off', requestId: 'talk-1' });
  });
});
