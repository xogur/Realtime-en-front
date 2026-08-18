import { NextRequest, NextResponse } from 'next/server';

type TranslatorAction = 'open' | 'close';

type TranslatorControlState = {
  action: TranslatorAction;
  version: number;
  clientId?: string;
  updatedAt: number;
};

type TranslatorControlChannel = {
  state: TranslatorControlState;
  waiters: Set<() => void>;
  processedCommandIds: Set<string>;
};

const KIOSK_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/;
const LONG_POLL_TIMEOUT_MS = 25_000;
const MAX_CHANNELS = 128;
const MAX_WAITERS_PER_CHANNEL = 8;
const MAX_PROCESSED_COMMAND_IDS = 64;

const globalStore = globalThis as typeof globalThis & {
  __realtimeEnTranslatorChannels?: Map<string, TranslatorControlChannel>;
};

const channels = globalStore.__realtimeEnTranslatorChannels
  ?? new Map<string, TranslatorControlChannel>();
globalStore.__realtimeEnTranslatorChannels = channels;

function getKioskId(request: NextRequest): string | null {
  const kioskId = request.nextUrl.searchParams.get('kioskId')?.trim() ?? '';
  return KIOSK_ID_PATTERN.test(kioskId) ? kioskId : null;
}

function getChannel(kioskId: string): TranslatorControlChannel | null {
  const existing = channels.get(kioskId);
  if (existing) return existing;

  if (channels.size >= MAX_CHANNELS) {
    const oldest = [...channels.entries()]
      .filter(([, channel]) => channel.waiters.size === 0)
      .sort((a, b) => a[1].state.updatedAt - b[1].state.updatedAt)[0];
    if (oldest) channels.delete(oldest[0]);
    else return null;
  }

  const channel: TranslatorControlChannel = {
    state: { action: 'close', version: 0, updatedAt: Date.now() },
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

async function waitForChange(request: NextRequest, channel: TranslatorControlChannel) {
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

export async function GET(request: NextRequest) {
  const kioskId = getKioskId(request);
  if (!kioskId) return noStoreJson({ error: 'Invalid kioskId' }, 400);

  const channel = getChannel(kioskId);
  if (!channel) return noStoreJson({ error: 'Translator control capacity reached' }, 503);
  const afterParam = request.nextUrl.searchParams.get('after');
  const after = afterParam === null ? null : Number(afterParam);
  if (after !== null && Number.isInteger(after) && after === channel.state.version) {
    if (channel.waiters.size >= MAX_WAITERS_PER_CHANNEL) {
      return noStoreJson({ error: 'Too many translator control subscribers' }, 429);
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
    clientId?: unknown;
    commandId?: unknown;
  } | null;
  if (!body || (body.action !== 'open' && body.action !== 'close')) {
    return noStoreJson({ error: 'Invalid action' }, 400);
  }
  if (
    typeof body.clientId !== 'string'
    || body.clientId.length === 0
    || body.clientId.length > 128
  ) {
    return noStoreJson({ error: 'Invalid clientId' }, 400);
  }
  if (
    typeof body.commandId !== 'string'
    || body.commandId.length === 0
    || body.commandId.length > 128
  ) {
    return noStoreJson({ error: 'Invalid commandId' }, 400);
  }

  const channel = getChannel(kioskId);
  if (!channel) return noStoreJson({ error: 'Translator control capacity reached' }, 503);
  if (channel.processedCommandIds.has(body.commandId)) {
    return noStoreJson(channel.state);
  }
  channel.processedCommandIds.add(body.commandId);
  if (channel.processedCommandIds.size > MAX_PROCESSED_COMMAND_IDS) {
    const oldestCommandId = channel.processedCommandIds.values().next().value;
    if (oldestCommandId) channel.processedCommandIds.delete(oldestCommandId);
  }
  channel.state = {
    action: body.action,
    version: channel.state.version + 1,
    clientId: body.clientId,
    updatedAt: Date.now(),
  };
  for (const notify of [...channel.waiters]) notify();

  return noStoreJson(channel.state);
}
