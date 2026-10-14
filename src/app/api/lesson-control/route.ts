import { NextRequest, NextResponse } from 'next/server';

// Relays the lesson talk view from the avatar window (owner) to the optional guide
// window (/chat, read-only). Last write wins; mirrors /api/story-control.

type ViewPhase = 'setup' | 'lesson' | 'recap' | 'paused';
type LessonView = {
  phase: ViewPhase; titleKo: string; topicId: string; turnIndex: number; turnTotal: number;
  lineEn: string; lineKo: string; expressionEn: string;
};
type LessonControlState = { action: 'open' | 'close'; view: LessonView | null; version: number; clientId?: string; updatedAt: number };
type Channel = { state: LessonControlState; waiters: Set<() => void>; processedCommandIds: Set<string> };

const KIOSK_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/;
const VIEW_PHASES: readonly ViewPhase[] = ['setup', 'lesson', 'recap', 'paused'];
const LONG_POLL_TIMEOUT_MS = 25_000;
const MAX_CHANNELS = 128;
const MAX_WAITERS_PER_CHANNEL = 8;
const MAX_PROCESSED_COMMAND_IDS = 64;

const globalStore = globalThis as typeof globalThis & { __realtimeEnLessonChannels?: Map<string, Channel> };
const channels = globalStore.__realtimeEnLessonChannels ?? new Map<string, Channel>();
globalStore.__realtimeEnLessonChannels = channels;

function getKioskId(request: NextRequest): string | null {
  const kioskId = request.nextUrl.searchParams.get('kioskId')?.trim() ?? '';
  return KIOSK_ID_PATTERN.test(kioskId) ? kioskId : null;
}

function getChannel(kioskId: string): Channel | null {
  const existing = channels.get(kioskId);
  if (existing) return existing;
  if (channels.size >= MAX_CHANNELS) {
    const oldest = [...channels.entries()]
      .filter(([, channel]) => channel.waiters.size === 0)
      .sort((a, b) => a[1].state.updatedAt - b[1].state.updatedAt)[0];
    if (!oldest) return null;
    channels.delete(oldest[0]);
  }
  const channel: Channel = {
    state: { action: 'close', view: null, version: 0, updatedAt: Date.now() },
    waiters: new Set(),
    processedCommandIds: new Set(),
  };
  channels.set(kioskId, channel);
  return channel;
}

function json(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store, max-age=0' } });
}

function isText(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length <= max && !/[\u0000-\u001f]/.test(value);
}

function isIndex(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 64;
}

function parseView(value: unknown): LessonView | null {
  if (!value || typeof value !== 'object') return null;
  const view = value as Record<string, unknown>;
  if (!VIEW_PHASES.includes(view.phase as ViewPhase) || !isIndex(view.turnIndex) || !isIndex(view.turnTotal)) return null;
  if (!isText(view.titleKo, 80) || !isText(view.topicId, 32) || !isText(view.lineEn, 300) || !isText(view.lineKo, 300)
    || !isText(view.expressionEn, 200)) return null;
  return {
    phase: view.phase as ViewPhase, titleKo: view.titleKo, topicId: view.topicId, turnIndex: view.turnIndex,
    turnTotal: view.turnTotal, lineEn: view.lineEn, lineKo: view.lineKo, expressionEn: view.expressionEn,
  };
}

function isBoundedId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128;
}

async function waitForChange(request: NextRequest, channel: Channel) {
  if (request.signal.aborted) return;
  await new Promise<void>((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      channel.waiters.delete(finish);
      request.signal.removeEventListener('abort', finish);
      resolve();
    };
    const timer = setTimeout(finish, LONG_POLL_TIMEOUT_MS);
    channel.waiters.add(finish);
    request.signal.addEventListener('abort', finish, { once: true });
  });
}

export async function GET(request: NextRequest) {
  const kioskId = getKioskId(request);
  if (!kioskId) return json({ error: 'Invalid kioskId' }, 400);
  const channel = getChannel(kioskId);
  if (!channel) return json({ error: 'Lesson control capacity reached' }, 503);
  const afterParam = request.nextUrl.searchParams.get('after');
  const after = afterParam === null ? null : Number(afterParam);
  if (after !== null && Number.isInteger(after) && after === channel.state.version) {
    if (channel.waiters.size >= MAX_WAITERS_PER_CHANNEL) return json({ error: 'Too many lesson control subscribers' }, 429);
    await waitForChange(request, channel);
  }
  return json(channel.state);
}

export async function POST(request: NextRequest) {
  const kioskId = getKioskId(request);
  if (!kioskId) return json({ error: 'Invalid kioskId' }, 400);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || (body.action !== 'view' && body.action !== 'close')) return json({ error: 'Invalid action' }, 400);
  const view = body.action === 'view' ? parseView(body.view) : null;
  if (body.action === 'view' && !view) return json({ error: 'Invalid view' }, 400);
  if (!isBoundedId(body.clientId) || !isBoundedId(body.commandId)) return json({ error: 'Invalid command' }, 400);
  const channel = getChannel(kioskId);
  if (!channel) return json({ error: 'Lesson control capacity reached' }, 503);
  if (channel.processedCommandIds.has(body.commandId)) return json(channel.state);
  channel.processedCommandIds.add(body.commandId);
  if (channel.processedCommandIds.size > MAX_PROCESSED_COMMAND_IDS) {
    const oldest = channel.processedCommandIds.values().next().value;
    if (oldest) channel.processedCommandIds.delete(oldest);
  }
  channel.state = {
    action: body.action === 'view' ? 'open' : 'close', view, version: channel.state.version + 1,
    clientId: body.clientId, updatedAt: Date.now(),
  };
  for (const notify of [...channel.waiters]) notify();
  return json(channel.state);
}
