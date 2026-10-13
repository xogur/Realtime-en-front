// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createStoryViewPublisher, parseStoryControlState } from './control';

const view = (sentenceIndex: number) => ({ phase: 'listening' as const, chapterIndex: 0, sentenceIndex });

describe('story view publisher', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends one update at a time and ends on the newest view', async () => {
    const pending: Array<(value: Response) => void> = [];
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => pending.push(resolve)));
    vi.stubGlobal('fetch', fetchMock);
    const publisher = createStoryViewPublisher('A01');
    publisher.publish('odyssey', view(0));
    publisher.publish('odyssey', view(1));
    publisher.publish('odyssey', view(2));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    pending.shift()!(new Response('{}', { status: 200 }));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const body = JSON.parse((fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].body as string);
    expect(body).toMatchObject({ action: 'view', storyId: 'odyssey', view: view(2) });
    pending.shift()!(new Response('{}', { status: 200 }));
    await Promise.resolve();
    publisher.publish('odyssey', view(2));
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('parses only valid relay states', () => {
    const state = { action: 'open', storyId: 'odyssey', returnTo: null, view: view(3), version: 4 };
    expect(parseStoryControlState(state)).toMatchObject(state);
    expect(parseStoryControlState({ ...state, view: { ...view(3), phase: 'quiz' } })).toBeNull();
    expect(parseStoryControlState({ ...state, view: { ...view(3), sentenceIndex: -1 } })).toBeNull();
    expect(parseStoryControlState({ ...state, view: null })).toMatchObject({ view: null });
  });
});
