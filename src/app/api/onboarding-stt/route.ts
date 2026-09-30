import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
const MAX_BYTES = 16_000 * 2 * 12;

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  let allowedOrigin = !origin;
  try { allowedOrigin ||= new URL(origin!).host === request.headers.get('host'); } catch { /* reject malformed Origin */ }
  if (!allowedOrigin) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  if (request.headers.get('content-type') !== 'application/octet-stream') {
    return NextResponse.json({ error: 'invalid_audio' }, { status: 415 });
  }
  const reader = request.body?.getReader();
  if (!reader) return NextResponse.json({ error: 'missing_audio' }, { status: 400 });
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      return NextResponse.json({ error: 'audio_too_long' }, { status: 413 });
    }
    chunks.push(value);
  }
  if (size < 3200 || size % 2) return NextResponse.json({ error: 'invalid_audio' }, { status: 400 });
  try {
    const response = await fetch(process.env.ONBOARDING_STT_URL || 'http://stt:8013/transcribe/ko', {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: Buffer.concat(chunks),
      signal: AbortSignal.timeout(20_000),
      cache: 'no-store',
    });
    if (!response.ok) return NextResponse.json({ error: 'stt_unavailable' }, { status: response.status === 429 ? 429 : 503 });
    const data = await response.json();
    return NextResponse.json({ text: String(data.text ?? ''), language: 'ko', provider: 'crisperwhisper' });
  } catch {
    return NextResponse.json({ error: 'stt_unavailable' }, { status: 503 });
  }
}
