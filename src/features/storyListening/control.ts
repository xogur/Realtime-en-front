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

export type StoryControlState = {
  action: 'open' | 'close';
  storyId: string | null;
  returnTo: 'mode' | null;
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

export function parseStoryControlState(value: unknown): (StoryControlState & { clientId?: string }) | null {
  if (!value || typeof value !== 'object') return null;
  const state = value as Record<string, unknown>;
  if (state.action !== 'open' && state.action !== 'close') return null;
  if (typeof state.version !== 'number' || !Number.isInteger(state.version)) return null;
  if (state.storyId !== null && typeof state.storyId !== 'string') return null;
  if (state.returnTo !== null && state.returnTo !== 'mode') return null;
  if (state.clientId !== undefined && typeof state.clientId !== 'string') return null;
  return {
    action: state.action,
    storyId: state.storyId as string | null,
    returnTo: state.returnTo as 'mode' | null,
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
          onState({ action: state.action, storyId: state.storyId, returnTo: state.returnTo, version: state.version }, { initial });
        }
      } catch {
        if (controller.signal.aborted) break;
        await waitBeforeRetry();
      }
    }
  })();

  return () => controller.abort();
}
