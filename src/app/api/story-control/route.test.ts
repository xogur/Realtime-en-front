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

describe('story control relay', () => {
  it('relays the opened story and a close that returns to mode selection', async () => {
    const kioskId = `story-${Date.now()}`;
    expect((await publish(kioskId, { action: 'open', storyId: 'odyssey' })).status).toBe(200);
    await expect((await GET(request(kioskId))).json()).resolves.toMatchObject({ action: 'open', storyId: 'odyssey', version: 1 });

    await publish(kioskId, { action: 'close', returnTo: 'mode' });
    await expect((await GET(request(kioskId))).json()).resolves.toMatchObject({ action: 'close', storyId: null, returnTo: 'mode', version: 2 });
  });

  it('wakes a long-poll waiter when the state changes', async () => {
    const kioskId = `story-wait-${Date.now()}`;
    const waiting = GET(request(kioskId, undefined, 0));
    await publish(kioskId, { action: 'open', storyId: 'odyssey' });
    await expect((await waiting).json()).resolves.toMatchObject({ action: 'open', version: 1 });
  });

  it('ignores a repeated command id', async () => {
    const kioskId = `story-dup-${Date.now()}`;
    const body = { action: 'open', storyId: 'odyssey', commandId: 'same' };
    await publish(kioskId, body);
    await publish(kioskId, body);
    await expect((await GET(request(kioskId))).json()).resolves.toMatchObject({ version: 1 });
  });

  it.each([
    [{ action: 'open' }],
    [{ action: 'open', storyId: '../etc' }],
    [{ action: 'close', returnTo: 'home' }],
    [{ action: 'play', storyId: 'odyssey' }],
    [{ action: 'open', storyId: 'odyssey', clientId: '' }],
  ])('rejects invalid commands %j', async (body) => {
    expect((await publish('A02', body)).status).toBe(400);
  });

  it('moves the talk turn only in order and clears it when the story closes', async () => {
    const kioskId = `story-talk-${Date.now()}`;
    const position = { storyId: 'odyssey', chapterIndex: 1, heardThrough: 3 };
    // No talk before a story is open.
    expect((await publish(kioskId, { action: 'talk', phase: 'requested', requestId: 't1' })).status).toBe(409);
    await publish(kioskId, { action: 'open', storyId: 'odyssey' });
    // Active needs the guide's pause (and its position) first.
    expect((await publish(kioskId, { action: 'talk', phase: 'requested', requestId: 't1' })).status).toBe(200);
    expect((await publish(kioskId, { action: 'talk', phase: 'active', requestId: 't1' })).status).toBe(409);
    expect((await publish(kioskId, { action: 'talk', phase: 'paused', requestId: 'old', position })).status).toBe(409);
    expect((await publish(kioskId, { action: 'talk', phase: 'paused', requestId: 't1', position })).status).toBe(200);
    expect((await publish(kioskId, { action: 'talk', phase: 'active', requestId: 't1' })).status).toBe(200);
    await expect((await GET(request(kioskId))).json()).resolves.toMatchObject({
      action: 'open', storyId: 'odyssey', talk: { phase: 'active', requestId: 't1', position },
    });
    expect((await publish(kioskId, { action: 'talk', phase: 'off', requestId: 'other' })).status).toBe(409);
    await publish(kioskId, { action: 'close' });
    await expect((await GET(request(kioskId))).json()).resolves.toMatchObject({ action: 'close', talk: null });
  });

  it('lets a refused talk command be retried with the same command id', async () => {
    const kioskId = `story-talk-retry-${Date.now()}`;
    await publish(kioskId, { action: 'open', storyId: 'odyssey' });
    const early = { action: 'talk', phase: 'off', requestId: 't1', commandId: 'same-off' };
    expect((await publish(kioskId, early)).status).toBe(409);
    await publish(kioskId, { action: 'talk', phase: 'requested', requestId: 't1' });
    expect((await publish(kioskId, early)).status).toBe(200);
    await expect((await GET(request(kioskId))).json()).resolves.toMatchObject({ talk: null });
  });

  it.each([
    [{ phase: 'paused', requestId: 't1', position: { storyId: '../x', chapterIndex: 0, heardThrough: 0 } }],
    [{ phase: 'paused', requestId: 't1', position: { storyId: 'odyssey', chapterIndex: -1, heardThrough: 0 } }],
    [{ phase: 'paused', requestId: 't1', position: { storyId: 'odyssey', chapterIndex: 0, heardThrough: 0.5 } }],
    [{ phase: 'later', requestId: 't1' }],
  ])('refuses malformed talk %j', async (talk) => {
    const kioskId = `bad-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await publish(kioskId, { action: 'open', storyId: 'odyssey' });
    await publish(kioskId, { action: 'talk', phase: 'requested', requestId: 't1' });
    expect((await publish(kioskId, { action: 'talk', ...talk })).status).toBe(409);
  });

  it('rejects a talk command without a request id', async () => {
    expect((await publish('A02', { action: 'talk', phase: 'requested' })).status).toBe(400);
  });

  it('rejects an invalid kiosk id', async () => {
    expect((await GET(request('../x'))).status).toBe(400);
  });
});
