import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

const request = (body: Uint8Array, origin = 'http://localhost:3004', query = '') => new NextRequest(`http://localhost:3004/api/onboarding-stt${query}`, {
  method: 'POST', headers: { host: 'localhost:3004', origin, 'content-type': 'application/octet-stream' },
  body: body.buffer as ArrayBuffer,
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe('Korean STT proxy', () => {
  it('rejects invalid and cross-origin audio before contacting the STT service', async () => {
    vi.stubGlobal('fetch', vi.fn());
    expect((await POST(request(new Uint8Array(4000), 'https://untrusted.example'))).status).toBe(403);
    expect((await POST(request(new Uint8Array(4000), 'not a url'))).status).toBe(403);
    expect((await POST(request(new Uint8Array(3201)))).status).toBe(400);
    expect((await POST(request(new Uint8Array(384002)))).status).toBe(413);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('sends Korean PCM to the fixed internal service and returns only a transcript', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ text: '중급으로 할게요' }))));
    const response = await POST(request(new Uint8Array(4000)));
    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledWith('http://stt:8013/transcribe/ko', expect.objectContaining({ method: 'POST' }));
    expect(await response.json()).toEqual({ text: '중급으로 할게요', language: 'ko', provider: 'crisperwhisper' });
  });
  it('sends English PCM to the matching endpoint of the same service', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ text: 'Good morning' }))));
    const response = await POST(request(new Uint8Array(4000), undefined, '?language=en'));
    expect(fetch).toHaveBeenCalledWith('http://stt:8013/transcribe/en', expect.objectContaining({ method: 'POST' }));
    expect(await response.json()).toEqual({ text: 'Good morning', language: 'en', provider: 'crisperwhisper' });
    vi.stubEnv('ONBOARDING_STT_URL', 'http://10.0.0.5:9000/transcribe/ko');
    await POST(request(new Uint8Array(4000), undefined, '?language=en'));
    expect(fetch).toHaveBeenLastCalledWith('http://10.0.0.5:9000/transcribe/en', expect.anything());
    await POST(request(new Uint8Array(4000), undefined, '?language=ko'));
    expect(fetch).toHaveBeenLastCalledWith('http://10.0.0.5:9000/transcribe/ko', expect.anything());
  });
  it('rejects unknown languages and never sends English to a Korean-only endpoint', async () => {
    vi.stubGlobal('fetch', vi.fn());
    for (const query of ['?language=ja', '?language=', '?language=../en']) {
      expect((await POST(request(new Uint8Array(4000), undefined, query))).status).toBe(400);
    }
    vi.stubEnv('ONBOARDING_STT_URL', 'http://10.0.0.5:9000/korean');
    expect((await POST(request(new Uint8Array(4000), undefined, '?language=en'))).status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('turns a step hint into the server-owned Korean question, never client text', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ text: '초급이요' }))));
    await POST(request(new Uint8Array(4000), undefined, '?language=ko&hint=difficulty'));
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://stt:8013/transcribe/ko');
    const header = (init.headers as Record<string, string>)['X-STT-Context'];
    expect(decodeURIComponent(header)).toBe('초급, 중급, 고급 중 하나를 말씀해 주세요.');
    for (const query of ['?hint=__proto__', '?hint=hasOwnProperty', '?hint=context', '?language=en&hint=name', '?hint=']) {
      expect((await POST(request(new Uint8Array(4000), undefined, query))).status).toBe(400);
    }
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('passes a busy STT service through as 429', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('busy', { status: 429 })));
    expect((await POST(request(new Uint8Array(4000)))).status).toBe(429);
  });
  it('returns a bounded failure without exposing internal errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('internal details'); }));
    const response = await POST(request(new Uint8Array(4000)));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'stt_unavailable' });
  });
});
