import { createClientCommandId } from '@/lib/kioskIdentity';

/*
 * Story screen state shared by the avatar window (owns the story: playback,
 * questions, controls) and the guide window (/chat, only shows the scene). The
 * windows can live in separate Chrome profiles, so the relay goes through
 * /api/story-control like the translator control.
 */

export type StoryViewPhase = 'picker' | 'listening' | 'paused' | 'checking' | 'recap';
export const STORY_VIEW_PHASES: readonly StoryViewPhase[] = ['picker', 'listening', 'paused', 'checking', 'recap'];

/** What the guide window shows: the avatar publishes it whenever the sentence or phase changes. */
export type StoryView = { phase: StoryViewPhase; chapterIndex: number; sentenceIndex: number };

export type StoryControlCommand =
  | { action: 'open'; storyId: string | null }
  | { action: 'view'; storyId: string; view: StoryView }
  | { action: 'close'; returnTo?: 'mode' | null };

export type StoryControlState = {
  action: 'open' | 'close';
  storyId: string | null;
  returnTo: 'mode' | null;
  view: StoryView | null;
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

function isIndex(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

export function parseStoryView(value: unknown): StoryView | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object') return undefined;
  const view = value as Record<string, unknown>;
  if (!STORY_VIEW_PHASES.includes(view.phase as StoryViewPhase) || !isIndex(view.chapterIndex) || !isIndex(view.sentenceIndex)) return undefined;
  return { phase: view.phase as StoryViewPhase, chapterIndex: view.chapterIndex, sentenceIndex: view.sentenceIndex };
}

export function parseStoryControlState(value: unknown): (StoryControlState & { clientId?: string }) | null {
  if (!value || typeof value !== 'object') return null;
  const state = value as Record<string, unknown>;
  if (state.action !== 'open' && state.action !== 'close') return null;
  if (typeof state.version !== 'number' || !Number.isInteger(state.version)) return null;
  if (state.storyId !== null && typeof state.storyId !== 'string') return null;
  if (state.returnTo !== null && state.returnTo !== 'mode') return null;
  if (state.clientId !== undefined && typeof state.clientId !== 'string') return null;
  const view = parseStoryView(state.view);
  if (view === undefined) return null;
  return {
    action: state.action,
    storyId: state.storyId as string | null,
    returnTo: state.returnTo as 'mode' | null,
    view,
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
      // A rejected command is final: the story was closed or the request is invalid.
      if (response.status === 409 || response.status === 400) return false;
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

/**
 * Publishes view updates one at a time and drops intermediate ones, so the
 * guide window always ends on the newest sentence even if requests overlap.
 */
export function createStoryViewPublisher(kioskId: string) {
  let pending: { storyId: string; view: StoryView } | null = null;
  let running = false;
  let last = '';
  const drain = async () => {
    running = true;
    while (pending) {
      const next = pending;
      pending = null;
      const key = JSON.stringify(next);
      if (key === last) continue;
      if (await publishStoryControl({ action: 'view', ...next }, kioskId)) last = key;
    }
    running = false;
  };
  return {
    publish(storyId: string, view: StoryView) {
      pending = { storyId, view };
      if (!running) void drain();
    },
    reset() {
      pending = null;
      last = '';
    },
  };
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
          onState({ action: state.action, storyId: state.storyId, returnTo: state.returnTo, view: state.view, version: state.version }, { initial });
        }
      } catch {
        if (controller.signal.aborted) break;
        await waitBeforeRetry();
      }
    }
  })();

  return () => controller.abort();
}
