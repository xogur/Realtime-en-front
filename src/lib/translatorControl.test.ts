// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  publishTranslatorControl,
  subscribeTranslatorControl,
  TRANSLATOR_WINDOW_MESSAGE,
} from './translator';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('translator control client', () => {
  it('publishes an action for the selected kiosk', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(publishTranslatorControl({
      channel: TRANSLATOR_WINDOW_MESSAGE,
      action: 'open',
    }, 'A02')).resolves.toBe(true);

    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/api/translator-control?kioskId=A02');
    expect(options).toMatchObject({ method: 'POST' });
    expect(JSON.parse(String(options?.body))).toMatchObject({ action: 'open' });
  });

  it('retries a transient publish failure', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = publishTranslatorControl({
      channel: TRANSLATOR_WINDOW_MESSAGE,
      action: 'open',
    }, 'A02');
    await vi.runAllTimersAsync();

    await expect(result).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    const retryBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(retryBody.commandId).toBe(firstBody.commandId);
  });

  it('converts a remote control response into a local translator message', async () => {
    let requestCount = 0;
    const fetchMock = vi.fn((_url: string | URL | Request, options?: RequestInit) => {
      requestCount += 1;
      if (requestCount === 1) {
        return Promise.resolve(new Response(JSON.stringify({
          action: 'open',
          version: 1,
          clientId: 'remote-chat-profile',
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      }
      return new Promise<Response>((_resolve, reject) => {
        options?.signal?.addEventListener('abort', () => reject(new DOMException(
          'Aborted',
          'AbortError',
        )), { once: true });
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const onMessage = vi.fn();

    const unsubscribe = subscribeTranslatorControl('A02', onMessage);
    await vi.waitFor(() => expect(onMessage).toHaveBeenCalledWith({
      channel: TRANSLATOR_WINDOW_MESSAGE,
      action: 'open',
    }));
    unsubscribe();

    expect(String(fetchMock.mock.calls[0][0])).toContain('kioskId=A02');
  });

  it('reconciles a reset channel to its authoritative closed state', async () => {
    let requestCount = 0;
    vi.stubGlobal('fetch', vi.fn((_url: string | URL | Request, options?: RequestInit) => {
      requestCount += 1;
      if (requestCount === 1) {
        return Promise.resolve(new Response(JSON.stringify({
          action: 'close',
          version: 0,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      }
      return new Promise<Response>((_resolve, reject) => {
        options?.signal?.addEventListener('abort', () => reject(new DOMException(
          'Aborted',
          'AbortError',
        )), { once: true });
      });
    }));
    const onMessage = vi.fn();

    const unsubscribe = subscribeTranslatorControl('A02', onMessage);
    await vi.waitFor(() => expect(onMessage).toHaveBeenCalledWith({
      channel: TRANSLATOR_WINDOW_MESSAGE,
      action: 'close',
    }));
    unsubscribe();
  });

  it('ignores its own echoed command while advancing the long-poll cursor', async () => {
    const postedBodies: Array<Record<string, unknown>> = [];
    let ownClientId = '';
    const fetchMock = vi.fn((_url: string | URL | Request, options?: RequestInit) => {
      if (options?.method === 'POST') {
        const body = JSON.parse(String(options.body)) as Record<string, unknown>;
        postedBodies.push(body);
        ownClientId = String(body.clientId);
        return Promise.resolve(new Response('{}', { status: 200 }));
      }
      if (!ownClientId) throw new Error('Publish must happen before subscribe');
      if (fetchMock.mock.calls.filter(([, init]) => init?.method !== 'POST').length === 1) {
        return Promise.resolve(new Response(JSON.stringify({
          action: 'close',
          version: 2,
          clientId: ownClientId,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      }
      return new Promise<Response>((_resolve, reject) => {
        options?.signal?.addEventListener('abort', () => reject(new DOMException(
          'Aborted',
          'AbortError',
        )), { once: true });
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    await publishTranslatorControl({ channel: TRANSLATOR_WINDOW_MESSAGE, action: 'close' }, 'A02');
    const onMessage = vi.fn();

    const unsubscribe = subscribeTranslatorControl('A02', onMessage);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    unsubscribe();

    expect(postedBodies).toHaveLength(1);
    expect(onMessage).not.toHaveBeenCalled();
    expect(String(fetchMock.mock.calls[2][0])).toContain('after=2');
  });
});
