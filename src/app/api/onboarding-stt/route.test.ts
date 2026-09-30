import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

const request = (body: Uint8Array, origin = 'http://localhost:3004') => new NextRequest('http://localhost:3004/api/onboarding-stt', {
  method: 'POST', headers: { host: 'localhost:3004', origin, 'content-type': 'application/octet-stream' },
  body: body.buffer as ArrayBuffer,
});
afterEach(() => vi.unstubAllGlobals());
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
  it('returns a bounded failure without exposing internal errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('internal details'); }));
    const response = await POST(request(new Uint8Array(4000)));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'stt_unavailable' });
  });
});
