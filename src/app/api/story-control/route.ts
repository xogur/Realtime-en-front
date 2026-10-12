import { NextRequest, NextResponse } from 'next/server';

// Relays the story screen state between the avatar and guide windows, which may
// run in separate browser profiles. Mirrors /api/translator-control.

type StoryAction = 'open' | 'close';
type TalkPhase = 'requested' | 'paused' | 'active';

/** Where the guide window paused the story, so the avatar can explain what was heard. */
type StoryPosition = { storyId: string; chapterIndex: number; heardThrough: number };

/** Story playback and the avatar talk never run together; this records who holds the turn. */
type StoryTalk = { phase: TalkPhase; requestId: string; position: StoryPosition | null };

type StoryControlState = {
  action: StoryAction;
  storyId: string | null;
  returnTo: 'mode' | null;
  talk: StoryTalk | null;
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
    state: { action: 'close', storyId: null, returnTo: null, talk: null, version: 0, updatedAt: Date.now() },
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

function isIndex(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

function parsePosition(value: unknown): StoryPosition | null | undefined {
  if (value === null) return null;
  if (!value || typeof value !== 'object') return undefined;
  const position = value as Record<string, unknown>;
  if (typeof position.storyId !== 'string' || !STORY_ID_PATTERN.test(position.storyId)) return undefined;
  if (!isIndex(position.chapterIndex, 0, MAX_CHAPTERS - 1) || !isIndex(position.heardThrough, -1, MAX_SENTENCES - 1)) return undefined;
  return { storyId: position.storyId, chapterIndex: position.chapterIndex, heardThrough: position.heardThrough };
}

/** Returns the next talk state, or null when the command does not follow the current turn. */
function nextTalk(current: StoryTalk | null, phase: unknown, requestId: string, position: unknown): { talk: StoryTalk | null } | null {
  const matches = current?.requestId === requestId;
  if (phase === 'requested') return { talk: { phase, requestId, position: null } };
  if (phase === 'off') return matches ? { talk: null } : null;
  if (phase === 'paused') {
    const parsed = parsePosition(position);
    return matches && current?.phase === 'requested' && parsed !== undefined ? { talk: { phase, requestId, position: parsed } } : null;
  }
  if (phase === 'active') {
    return matches && current?.phase === 'paused' && current.position ? { talk: { ...current, phase } } : null;
  }
  return null;
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
    phase?: unknown;
    requestId?: unknown;
    position?: unknown;
  } | null;
  if (!body || (body.action !== 'open' && body.action !== 'close' && body.action !== 'talk')) {
    return noStoreJson({ error: 'Invalid action' }, 400);
  }
  if (body.action === 'open' && (typeof body.storyId !== 'string' || !STORY_ID_PATTERN.test(body.storyId))) {
    return noStoreJson({ error: 'Invalid storyId' }, 400);
  }
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
  channel.processedCommandIds.add(body.commandId);
  if (channel.processedCommandIds.size > MAX_PROCESSED_COMMAND_IDS) {
    const oldestCommandId = channel.processedCommandIds.values().next().value;
    if (oldestCommandId) channel.processedCommandIds.delete(oldestCommandId);
  }
  if (body.action === 'talk') {
    if (!isBoundedId(body.requestId)) return noStoreJson({ error: 'Invalid requestId' }, 400);
    const next = channel.state.action === 'open'
      ? nextTalk(channel.state.talk, body.phase, body.requestId, body.position)
      : null;
    // A stale or out-of-order turn keeps the current owner; the caller reads the state back.
    if (!next) {
      channel.processedCommandIds.delete(body.commandId);
      return noStoreJson({ error: 'Talk state conflict', state: channel.state }, 409);
    }
    channel.state = {
      ...channel.state,
      talk: next.talk,
      version: channel.state.version + 1,
      clientId: body.clientId,
      updatedAt: Date.now(),
    };
    for (const notify of [...channel.waiters]) notify();
    return noStoreJson(channel.state);
  }
  channel.state = {
    action: body.action,
    storyId: body.action === 'open' ? body.storyId as string : null,
    returnTo: body.action === 'close' && body.returnTo === 'mode' ? 'mode' : null,
    talk: null,
    version: channel.state.version + 1,
    clientId: body.clientId,
    updatedAt: Date.now(),
  };
  for (const notify of [...channel.waiters]) notify();

  return noStoreJson(channel.state);
}
