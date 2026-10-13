import { NextRequest, NextResponse } from 'next/server';

// Relays the story screen state from the avatar window (owner) to the guide
// window (viewer); they may run in separate browser profiles. Mirrors
// /api/translator-control.

type StoryAction = 'open' | 'close';
type ViewPhase = 'picker' | 'listening' | 'paused' | 'checking' | 'recap';

/** What the guide window shows. */
type StoryView = { phase: ViewPhase; chapterIndex: number; sentenceIndex: number };

type StoryControlState = {
  action: StoryAction;
  storyId: string | null;
  returnTo: 'mode' | null;
  view: StoryView | null;
  version: number;
  clientId?: string;
  updatedAt: number;
};

type StoryControlChannel = {
  state: StoryControlState;
  waiters: Set<() => void>;
  processedCommandIds: Set<string>;
};

const KIOSK_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/;
const STORY_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;
const VIEW_PHASES: readonly ViewPhase[] = ['picker', 'listening', 'paused', 'checking', 'recap'];
const LONG_POLL_TIMEOUT_MS = 25_000;
const MAX_CHANNELS = 128;
const MAX_WAITERS_PER_CHANNEL = 8;
const MAX_PROCESSED_COMMAND_IDS = 64;
const MAX_CHAPTERS = 64;
const MAX_SENTENCES = 512;

const globalStore = globalThis as typeof globalThis & {
  __realtimeEnStoryChannels?: Map<string, StoryControlChannel>;
};

const channels = globalStore.__realtimeEnStoryChannels ?? new Map<string, StoryControlChannel>();
globalStore.__realtimeEnStoryChannels = channels;

function getKioskId(request: NextRequest): string | null {
  const kioskId = request.nextUrl.searchParams.get('kioskId')?.trim() ?? '';
  return KIOSK_ID_PATTERN.test(kioskId) ? kioskId : null;
}

function getChannel(kioskId: string): StoryControlChannel | null {
  const existing = channels.get(kioskId);
  if (existing) return existing;

  if (channels.size >= MAX_CHANNELS) {
    const oldest = [...channels.entries()]
      .filter(([, channel]) => channel.waiters.size === 0)
      .sort((a, b) => a[1].state.updatedAt - b[1].state.updatedAt)[0];
    if (oldest) channels.delete(oldest[0]);
    else return null;
  }

  const channel: StoryControlChannel = {
    state: { action: 'close', storyId: null, returnTo: null, view: null, version: 0, updatedAt: Date.now() },
    waiters: new Set(),
    processedCommandIds: new Set(),
  };
  channels.set(kioskId, channel);
  return channel;
}

function noStoreJson(body: object, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  });
}

async function waitForChange(request: NextRequest, channel: StoryControlChannel) {
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
    if (request.signal.aborted) finish();
  });
}

function isBoundedId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128;
}

function isIndex(value: unknown, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max;
}

function parseView(value: unknown): StoryView | null {
  if (!value || typeof value !== 'object') return null;
  const view = value as Record<string, unknown>;
  if (!VIEW_PHASES.includes(view.phase as ViewPhase)) return null;
  if (!isIndex(view.chapterIndex, MAX_CHAPTERS - 1) || !isIndex(view.sentenceIndex, MAX_SENTENCES - 1)) return null;
  return { phase: view.phase as ViewPhase, chapterIndex: view.chapterIndex, sentenceIndex: view.sentenceIndex };
}

export async function GET(request: NextRequest) {
  const kioskId = getKioskId(request);
  if (!kioskId) return noStoreJson({ error: 'Invalid kioskId' }, 400);

  const channel = getChannel(kioskId);
  if (!channel) return noStoreJson({ error: 'Story control capacity reached' }, 503);
  const afterParam = request.nextUrl.searchParams.get('after');
  const after = afterParam === null ? null : Number(afterParam);
  if (after !== null && Number.isInteger(after) && after === channel.state.version) {
    if (channel.waiters.size >= MAX_WAITERS_PER_CHANNEL) {
      return noStoreJson({ error: 'Too many story control subscribers' }, 429);
    }
    await waitForChange(request, channel);
  }

  return noStoreJson(channel.state);
}

export async function POST(request: NextRequest) {
  const kioskId = getKioskId(request);
  if (!kioskId) return noStoreJson({ error: 'Invalid kioskId' }, 400);

  const body = await request.json().catch(() => null) as {
    action?: unknown;
    storyId?: unknown;
    returnTo?: unknown;
    clientId?: unknown;
    commandId?: unknown;
    view?: unknown;
  } | null;
  if (!body || (body.action !== 'open' && body.action !== 'close' && body.action !== 'view')) {
    return noStoreJson({ error: 'Invalid action' }, 400);
  }
  const storyIdValid = typeof body.storyId === 'string' && STORY_ID_PATTERN.test(body.storyId);
  if (body.action === 'open' && body.storyId !== null && body.storyId !== undefined && !storyIdValid) {
    return noStoreJson({ error: 'Invalid storyId' }, 400);
  }
  if (body.action === 'view' && !storyIdValid) return noStoreJson({ error: 'Invalid storyId' }, 400);
  const view = body.action === 'view' ? parseView(body.view) : null;
  if (body.action === 'view' && !view) return noStoreJson({ error: 'Invalid view' }, 400);
  if (body.returnTo !== undefined && body.returnTo !== null && body.returnTo !== 'mode') {
    return noStoreJson({ error: 'Invalid returnTo' }, 400);
  }
  if (!isBoundedId(body.clientId)) return noStoreJson({ error: 'Invalid clientId' }, 400);
  if (!isBoundedId(body.commandId)) return noStoreJson({ error: 'Invalid commandId' }, 400);

  const channel = getChannel(kioskId);
  if (!channel) return noStoreJson({ error: 'Story control capacity reached' }, 503);
  if (channel.processedCommandIds.has(body.commandId)) {
    return noStoreJson(channel.state);
  }
  if (body.action === 'view' && channel.state.action !== 'open') {
    // A late view update must not reopen a story that was closed.
    return noStoreJson({ error: 'Story is closed', state: channel.state }, 409);
  }
  channel.processedCommandIds.add(body.commandId);
  if (channel.processedCommandIds.size > MAX_PROCESSED_COMMAND_IDS) {
    const oldestCommandId = channel.processedCommandIds.values().next().value;
    if (oldestCommandId) channel.processedCommandIds.delete(oldestCommandId);
  }
  const base = { version: channel.state.version + 1, clientId: body.clientId, updatedAt: Date.now() };
  if (body.action === 'view') {
    channel.state = { ...channel.state, ...base, storyId: body.storyId as string, view };
  } else if (body.action === 'open') {
    channel.state = {
      ...base, action: 'open', storyId: storyIdValid ? body.storyId as string : null, returnTo: null,
      view: { phase: 'picker', chapterIndex: 0, sentenceIndex: 0 },
    };
  } else {
    channel.state = { ...base, action: 'close', storyId: null, returnTo: body.returnTo === 'mode' ? 'mode' : null, view: null };
  }
  for (const notify of [...channel.waiters]) notify();

  return noStoreJson(channel.state);
}
