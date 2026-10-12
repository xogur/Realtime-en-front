import { createClientCommandId } from '@/lib/kioskIdentity';

/*
 * Story screen state shared by the avatar window (chooses the mode) and the
 * guide window (/chat, shows the story). The windows can live in separate
 * Chrome profiles, so the relay goes through /api/story-control like the
 * translator control.
 */

export type StoryControlCommand =
  | { action: 'open'; storyId: string }
  | { action: 'close'; returnTo?: 'mode' | null };

/** Where the guide window paused: the chapter and the last sentence the learner has heard in it (-1: none). */
export type StoryPosition = { storyId: string; chapterIndex: number; heardThrough: number };

/**
 * Story audio and the avatar talk never run together.
 * requested (avatar) → paused (guide stopped audio, reports position) → active (avatar talking) → off.
 */
export type StoryTalk = { phase: 'requested' | 'paused' | 'active'; requestId: string; position: StoryPosition | null };
export type StoryTalkCommand =
  | { phase: 'requested' | 'active' | 'off'; requestId: string }
  | { phase: 'paused'; requestId: string; position: StoryPosition | null };

export type StoryControlState = {
  action: 'open' | 'close';
  storyId: string | null;
  returnTo: 'mode' | null;
  talk: StoryTalk | null;
  version: number;
};

const STORY_CONTROL_PATH = '/api/story-control';
const RETRY_MS = 500;
const PUBLISH_ATTEMPTS = 3;
const PUBLISH_RETRY_MS = 150;
let storyClientId: string | null = null;

function getStoryClientId() {
  storyClientId ??= createClientCommandId();
  return storyClientId;
}

function controlUrl(kioskId: string, after?: number) {
  const url = new URL(STORY_CONTROL_PATH, window.location.origin);
  url.searchParams.set('kioskId', kioskId);
  if (after !== undefined) url.searchParams.set('after', String(after));
  return url.toString();
}

function isIndex(value: unknown, min: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min;
}

function parsePosition(value: unknown): StoryPosition | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object') return undefined;
  const position = value as Record<string, unknown>;
  if (typeof position.storyId !== 'string' || !isIndex(position.chapterIndex, 0) || !isIndex(position.heardThrough, -1)) return undefined;
  return { storyId: position.storyId, chapterIndex: position.chapterIndex, heardThrough: position.heardThrough };
}

function parseTalk(value: unknown): StoryTalk | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object') return undefined;
  const talk = value as Record<string, unknown>;
  if (talk.phase !== 'requested' && talk.phase !== 'paused' && talk.phase !== 'active') return undefined;
  if (typeof talk.requestId !== 'string' || !talk.requestId) return undefined;
  const position = parsePosition(talk.position);
  if (position === undefined) return undefined;
  return { phase: talk.phase, requestId: talk.requestId, position };
}

export function parseStoryControlState(value: unknown): (StoryControlState & { clientId?: string }) | null {
  if (!value || typeof value !== 'object') return null;
  const state = value as Record<string, unknown>;
  if (state.action !== 'open' && state.action !== 'close') return null;
  if (typeof state.version !== 'number' || !Number.isInteger(state.version)) return null;
  if (state.storyId !== null && typeof state.storyId !== 'string') return null;
  if (state.returnTo !== null && state.returnTo !== 'mode') return null;
  if (state.clientId !== undefined && typeof state.clientId !== 'string') return null;
  const talk = parseTalk(state.talk);
  if (talk === undefined) return null;
  return {
    action: state.action,
    storyId: state.storyId as string | null,
    returnTo: state.returnTo as 'mode' | null,
    talk,
    version: state.version,
    clientId: state.clientId as string | undefined,
  };
}

export async function publishStoryControl(command: StoryControlCommand, kioskId: string): Promise<boolean> {
  const body = JSON.stringify({ ...command, clientId: getStoryClientId(), commandId: createClientCommandId() });
  for (let attempt = 0; attempt < PUBLISH_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(controlUrl(kioskId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      if (response.ok) return true;
    } catch {
      // Retried below; the other window may be in a different profile.
    }
    if (attempt + 1 < PUBLISH_ATTEMPTS) {
      await new Promise((resolve) => window.setTimeout(resolve, PUBLISH_RETRY_MS));
    }
  }
  console.warn('[StoryListening] Failed to publish story screen state.');
  return false;
}

/** Moves the talk turn; false when the relay refused it (stale turn) or could not be reached. */
export async function publishStoryTalk(command: StoryTalkCommand, kioskId: string): Promise<boolean> {
  const body = JSON.stringify({ action: 'talk', ...command, clientId: getStoryClientId(), commandId: createClientCommandId() });
  for (let attempt = 0; attempt < PUBLISH_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(controlUrl(kioskId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      if (response.ok) return true;
      // A conflict is final: another turn owns the story now.
      if (response.status === 409 || response.status === 400) return false;
    } catch {
      // Retried below.
    }
    if (attempt + 1 < PUBLISH_ATTEMPTS) {
      await new Promise((resolve) => window.setTimeout(resolve, PUBLISH_RETRY_MS));
    }
  }
  return false;
}

/**
 * Calls `onState` with the current state first (`initial`), then with every
 * change made by another window. Own changes are applied locally by the caller.
 */
export function subscribeStoryControl(
  kioskId: string,
  onState: (state: StoryControlState, meta: { initial: boolean }) => void,
): () => void {
  const controller = new AbortController();
  const clientId = getStoryClientId();
  let lastVersion: number | null = null;

  const waitBeforeRetry = () => new Promise<void>((resolve) => {
    const finish = () => {
      window.clearTimeout(timer);
      controller.signal.removeEventListener('abort', finish);
      resolve();
    };
    const timer = window.setTimeout(finish, RETRY_MS);
    controller.signal.addEventListener('abort', finish, { once: true });
  });

  void (async () => {
    while (!controller.signal.aborted) {
      try {
        const response = await fetch(controlUrl(kioskId, lastVersion ?? undefined), {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Story control returned ${response.status}`);
        const state = parseStoryControlState(await response.json());
        if (!state) throw new Error('Invalid story control response');
        const initial = lastVersion === null;
        const changed = initial || state.version !== lastVersion;
        lastVersion = state.version;
        if (controller.signal.aborted) break;
        if (changed && (initial || state.clientId !== clientId)) {
          onState({ action: state.action, storyId: state.storyId, returnTo: state.returnTo, talk: state.talk, version: state.version }, { initial });
        }
      } catch {
        if (controller.signal.aborted) break;
        await waitBeforeRetry();
      }
    }
  })();

  return () => controller.abort();
}
