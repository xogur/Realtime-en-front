import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';

import { GET, POST } from './route';

function request(kioskId: string, init?: RequestInit, after?: number) {
  const url = new URL('http://localhost/api/translator-control');
  url.searchParams.set('kioskId', kioskId);
  if (after !== undefined) url.searchParams.set('after', String(after));
  return new NextRequest(url, init);
}

async function publish(
  kioskId: string,
  action: 'open' | 'close',
  clientId: string,
  commandId = `${clientId}-${action}-${Date.now()}-${Math.random()}`,
) {
  return POST(request(kioskId, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, clientId, commandId }),
  }));
}

describe('translator control relay', () => {
  it('relays state between independent clients sharing a kioskId', async () => {
    const kioskId = `relay-${Date.now()}`;
    const published = await publish(kioskId, 'open', 'chat-profile');
    expect(published.status).toBe(200);

    const received = await GET(request(kioskId, undefined, -1));
    await expect(received.json()).resolves.toMatchObject({
      action: 'open',
      version: 1,
      clientId: 'chat-profile',
    });
  });

  it('isolates translator state by kioskId', async () => {
    const suffix = Date.now();
    await publish(`A-${suffix}`, 'open', 'chat-profile');

    const otherKiosk = await GET(request(`B-${suffix}`, undefined, -1));
    await expect(otherKiosk.json()).resolves.toMatchObject({
      action: 'close',
      version: 0,
    });
  });

  it('returns current state immediately when no long-poll cursor is supplied', async () => {
    const kioskId = `current-${Date.now()}`;
    const response = await GET(request(kioskId));

    await expect(response.json()).resolves.toMatchObject({ action: 'close', version: 0 });
  });

  it('rejects invalid actions instead of broadcasting arbitrary payloads', async () => {
    const response = await POST(request('A02', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', clientId: 'chat-profile', commandId: 'bad-action' }),
    }));

    expect(response.status).toBe(400);
  });

  it.each([
    ['', 'empty clientId'],
    ['x'.repeat(129), 'oversized clientId'],
  ])('rejects an %s (%s)', async (clientId) => {
    const response = await publish('A02', 'open', clientId);
    expect(response.status).toBe(400);
  });

  it('rejects an invalid kioskId', async () => {
    const response = await publish('invalid kiosk id', 'open', 'chat-profile');
    expect(response.status).toBe(400);
  });

  it('rejects malformed JSON', async () => {
    const response = await POST(request('A02', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    }));
    expect(response.status).toBe(400);
  });

  it('wakes a waiting client as soon as another profile changes state', async () => {
    const kioskId = `wait-${Date.now()}`;
    const pending = GET(request(kioskId, undefined, 0));
    await publish(kioskId, 'open', 'chat-profile');

    const received = await pending;
    await expect(received.json()).resolves.toMatchObject({ action: 'open', version: 1 });
  });

  it('treats a retried desired-state publish as idempotent', async () => {
    const kioskId = `idempotent-${Date.now()}`;
    const first = await publish(kioskId, 'open', 'chat-profile', 'same-command');
    const retry = await publish(kioskId, 'open', 'chat-profile', 'same-command');

    expect((await first.json()).version).toBe(1);
    expect((await retry.json()).version).toBe(1);
  });

  it('does not let a late retry overwrite a newer opposite action', async () => {
    const kioskId = `ordered-${Date.now()}`;
    await publish(kioskId, 'open', 'chat-profile', 'open-command');
    await publish(kioskId, 'close', 'avatar-profile', 'close-command');
    const lateRetry = await publish(kioskId, 'open', 'chat-profile', 'open-command');

    await expect(lateRetry.json()).resolves.toMatchObject({ action: 'close', version: 2 });
  });

  it('caps concurrent subscribers for one kiosk', async () => {
    const kioskId = `waiter-cap-${Date.now()}`;
    const controllers = Array.from({ length: 8 }, () => new AbortController());
    const pending = controllers.map((controller) => GET(request(kioskId, {
      signal: controller.signal,
    }, 0)));

    const rejected = await GET(request(kioskId, undefined, 0));
    expect(rejected.status).toBe(429);

    controllers.forEach((controller) => controller.abort());
    await Promise.all(pending);
  });
});
