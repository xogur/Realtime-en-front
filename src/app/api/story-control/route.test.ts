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

  it('rejects an invalid kiosk id', async () => {
    expect((await GET(request('../x'))).status).toBe(400);
  });
});
