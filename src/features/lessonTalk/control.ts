import { createClientCommandId } from '@/lib/kioskIdentity';

/*
 * Lesson talk view shared by the avatar window (owns the lesson) and the guide
 * window (/chat, only mirrors it). The windows can live in separate Chrome
 * profiles, so the relay goes through /api/lesson-control like the story relay.
 * The guide window is optional: the lesson never waits for it.
 */

export type LessonViewPhase = 'setup' | 'lesson' | 'recap' | 'paused';
export const LESSON_VIEW_PHASES: readonly LessonViewPhase[] = ['setup', 'lesson', 'recap', 'paused'];

export type LessonView = {
  phase: LessonViewPhase;
  titleKo: string;
  topicId: string;
  turnIndex: number;
  turnTotal: number;
  lineEn: string;
  lineKo: string;
  expressionEn: string;
};

export type LessonControlState = { action: 'open' | 'close'; view: LessonView | null; version: number };

const PATH = '/api/lesson-control';
const RETRY_MS = 500;
let clientId: string | null = null;

function getClientId() {
  clientId ??= createClientCommandId();
  return clientId;
}

function controlUrl(kioskId: string, after?: number) {
  const url = new URL(PATH, window.location.origin);
  url.searchParams.set('kioskId', kioskId);
  if (after !== undefined) url.searchParams.set('after', String(after));
  return url.toString();
}

function isText(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length <= max;
}

function isIndex(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 64;
}

export function parseLessonView(value: unknown): LessonView | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object') return undefined;
  const view = value as Record<string, unknown>;
  if (!LESSON_VIEW_PHASES.includes(view.phase as LessonViewPhase) || !isIndex(view.turnIndex) || !isIndex(view.turnTotal)) return undefined;
  if (!isText(view.titleKo, 80) || !isText(view.topicId, 32) || !isText(view.lineEn, 300) || !isText(view.lineKo, 300)
    || !isText(view.expressionEn, 200)) return undefined;
  return {
    phase: view.phase as LessonViewPhase, titleKo: view.titleKo, topicId: view.topicId, turnIndex: view.turnIndex,
    turnTotal: view.turnTotal, lineEn: view.lineEn, lineKo: view.lineKo, expressionEn: view.expressionEn,
  };
}

export function parseLessonControlState(value: unknown): (LessonControlState & { clientId?: string }) | null {
  if (!value || typeof value !== 'object') return null;
  const state = value as Record<string, unknown>;
  if (state.action !== 'open' && state.action !== 'close') return null;
  if (typeof state.version !== 'number' || !Number.isInteger(state.version)) return null;
  if (state.clientId !== undefined && typeof state.clientId !== 'string') return null;
  const view = parseLessonView(state.view);
  if (view === undefined) return null;
  return { action: state.action, view, version: state.version, clientId: state.clientId as string | undefined };
}

export async function publishLessonControl(
  command: { action: 'view'; view: LessonView } | { action: 'close' },
  kioskId: string,
): Promise<boolean> {
  try {
    const response = await fetch(controlUrl(kioskId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...command, clientId: getClientId(), commandId: createClientCommandId() }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** Publishes one view at a time and drops intermediate ones, so the guide ends on the newest line. */
export function createLessonViewPublisher(kioskId: string) {
  let pending: LessonView | null = null;
  let running = false;
  let last = '';
  const drain = async () => {
    running = true;
    while (pending) {
      const next = pending;
      pending = null;
      const key = JSON.stringify(next);
      if (key === last) continue;
      if (await publishLessonControl({ action: 'view', view: next }, kioskId)) last = key;
    }
    running = false;
  };
  return {
    publish(view: LessonView) {
      pending = view;
      if (!running) void drain();
    },
    close() {
      pending = null;
      last = '';
      void publishLessonControl({ action: 'close' }, kioskId);
    },
  };
}

/** Calls `onState` with the current state first, then with every change from another window. */
export function subscribeLessonControl(kioskId: string, onState: (state: LessonControlState) => void): () => void {
  const controller = new AbortController();
  const own = getClientId();
  let lastVersion: number | null = null;
  const wait = () => new Promise<void>((resolve) => {
    const timer = window.setTimeout(resolve, RETRY_MS);
    controller.signal.addEventListener('abort', () => { window.clearTimeout(timer); resolve(); }, { once: true });
  });
  void (async () => {
    while (!controller.signal.aborted) {
      try {
        const response = await fetch(controlUrl(kioskId, lastVersion ?? undefined), { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error(`Lesson control returned ${response.status}`);
        const state = parseLessonControlState(await response.json());
        if (!state) throw new Error('Invalid lesson control response');
        const initial = lastVersion === null;
        const changed = initial || state.version !== lastVersion;
        lastVersion = state.version;
        if (changed && (initial || state.clientId !== own)) onState({ action: state.action, view: state.view, version: state.version });
      } catch {
        if (controller.signal.aborted) break;
        await wait();
      }
    }
  })();
  return () => controller.abort();
}
