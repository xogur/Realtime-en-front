import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';

import { GET, POST } from './route';

function request(kioskId: string, init?: { method: string; body: string }, after?: number) {
  const url = new URL('http://localhost/api/story-control');
  url.searchParams.set('kioskId', kioskId);
  if (after !== undefined) url.searchParams.set('after', String(after));
  return new NextRequest(url, init ? { ...init, headers: { 'Content-Type': 'application/json' } } : undefined);
}

function publish(kioskId: string, body: Record<string, unknown>) {
  return POST(request(kioskId, {
    method: 'POST',
    body: JSON.stringify({ clientId: 'avatar', commandId: `${Date.now()}-${Math.random()}`, ...body }),
  }));
}

const VIEW = { phase: 'listening', chapterIndex: 2, sentenceIndex: 4 };

describe('story control relay', () => {
  it('opens on the picker, mirrors the avatar view and closes back to mode selection', async () => {
    const kioskId = `story-${Date.now()}`;
    expect((await publish(kioskId, { action: 'open', storyId: null })).status).toBe(200);
    await expect((await GET(request(kioskId))).json()).resolves.toMatchObject({
      action: 'open', storyId: null, view: { phase: 'picker', chapterIndex: 0, sentenceIndex: 0 }, version: 1,
    });

    expect((await publish(kioskId, { action: 'view', storyId: 'odyssey', view: VIEW })).status).toBe(200);
    await expect((await GET(request(kioskId))).json()).resolves.toMatchObject({ action: 'open', storyId: 'odyssey', view: VIEW, version: 2 });

    await publish(kioskId, { action: 'close', returnTo: 'mode' });
    await expect((await GET(request(kioskId))).json()).resolves.toMatchObject({
      action: 'close', storyId: null, view: null, returnTo: 'mode', version: 3,
    });
  });

  it('wakes a long-poll waiter when the view changes', async () => {
    const kioskId = `story-wait-${Date.now()}`;
    await publish(kioskId, { action: 'open', storyId: null });
    const waiting = GET(request(kioskId, undefined, 1));
    await publish(kioskId, { action: 'view', storyId: 'reluctant-dragon', view: VIEW });
    await expect((await waiting).json()).resolves.toMatchObject({ storyId: 'reluctant-dragon', version: 2 });
  });

  it('ignores a repeated command id', async () => {
    const kioskId = `story-dup-${Date.now()}`;
    const body = { action: 'open', storyId: null, commandId: 'same' };
    await publish(kioskId, body);
    await publish(kioskId, body);
    await expect((await GET(request(kioskId))).json()).resolves.toMatchObject({ version: 1 });
  });

  it('refuses a view update for a closed story so a late update cannot reopen it', async () => {
    const kioskId = `story-late-${Date.now()}`;
    expect((await publish(kioskId, { action: 'view', storyId: 'odyssey', view: VIEW })).status).toBe(409);
    await expect((await GET(request(kioskId))).json()).resolves.toMatchObject({ action: 'close', version: 0 });
  });

  it.each([
    { action: 'talk' },
    { action: 'open', storyId: '../x' },
    { action: 'view', storyId: 'odyssey' },
    { action: 'view', storyId: 'Odyssey', view: VIEW },
    { action: 'view', storyId: 'odyssey', view: { ...VIEW, phase: 'quiz' } },
    { action: 'view', storyId: 'odyssey', view: { ...VIEW, chapterIndex: -1 } },
    { action: 'view', storyId: 'odyssey', view: { ...VIEW, sentenceIndex: 0.5 } },
    { action: 'view', storyId: 'odyssey', view: { ...VIEW, sentenceIndex: 512 } },
    { action: 'close', returnTo: 'library' },
  ])('refuses malformed command %j', async (body) => {
    const kioskId = `story-bad-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await publish(kioskId, { action: 'open', storyId: null });
    expect((await publish(kioskId, body)).status).toBe(400);
  });

  it('refuses invalid kiosk and client ids', async () => {
    expect((await GET(request('../bad'))).status).toBe(400);
    const response = await POST(request(`story-id-${Date.now()}`, {
      method: 'POST', body: JSON.stringify({ action: 'open', storyId: null, clientId: '', commandId: 'c1' }),
    }));
    expect(response.status).toBe(400);
  });
});
