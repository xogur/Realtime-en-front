import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';

import { GET, POST } from './route';

function request(kioskId: string, init?: { method: string; body: string }, after?: number) {
  const url = new URL('http://localhost/api/lesson-control');
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

const VIEW = { phase: 'lesson', titleKo: '원하는 것 부탁하기', topicId: 'daily', turnIndex: 1, turnTotal: 5,
  lineEn: 'Anything else?', lineKo: '다른 것도 필요하신가요?', expressionEn: 'Can I have ___, please?' };

describe('lesson control relay', () => {
  it('opens with a view, follows updates and closes', async () => {
    const kioskId = `lesson-${Date.now()}`;
    await expect((await GET(request(kioskId))).json()).resolves.toMatchObject({ action: 'close', view: null, version: 0 });
    expect((await publish(kioskId, { action: 'view', view: VIEW })).status).toBe(200);
    await expect((await GET(request(kioskId))).json()).resolves.toMatchObject({ action: 'open', view: VIEW, version: 1 });
    await publish(kioskId, { action: 'close' });
    await expect((await GET(request(kioskId))).json()).resolves.toMatchObject({ action: 'close', view: null, version: 2 });
  });

  it('wakes a long-poll waiter on change and ignores a repeated command', async () => {
    const kioskId = `lesson-wait-${Date.now()}`;
    await publish(kioskId, { action: 'view', view: VIEW, commandId: 'same' });
    const waiting = GET(request(kioskId, undefined, 1));
    await publish(kioskId, { action: 'view', view: { ...VIEW, turnIndex: 2 } });
    await expect((await waiting).json()).resolves.toMatchObject({ version: 2, view: { turnIndex: 2 } });
    await publish(kioskId, { action: 'view', view: VIEW, commandId: 'same' });
    await expect((await GET(request(kioskId))).json()).resolves.toMatchObject({ version: 2 });
  });

  it('rejects invalid kiosks, actions and views', async () => {
    expect((await GET(request('bad id!'))).status).toBe(400);
    const kioskId = `lesson-bad-${Date.now()}`;
    expect((await publish(kioskId, { action: 'open' })).status).toBe(400);
    for (const view of [{ ...VIEW, phase: 'quiz' }, { ...VIEW, turnIndex: 99 }, { ...VIEW, lineEn: 'x'.repeat(301) },
      { ...VIEW, lineKo: 'a\u0000b' }, null]) {
      expect((await publish(kioskId, { action: 'view', view })).status).toBe(400);
    }
    expect((await POST(request(kioskId, { method: 'POST', body: JSON.stringify({ action: 'close' }) }))).status).toBe(400);
  });
});
