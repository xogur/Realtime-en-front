import { getKioskIdFromLocation } from '@/lib/kioskIdentity';

import {
  MissionLearningApiError,
  type AgeBand,
  type LearnerProfile,
  type LearningLevel,
  type MissionAction,
  type MissionLearningHomeDetail,
  type MissionSnapshot,
  type PronunciationResult,
} from './types';

export type MissionLearningHome = {
  enabled: boolean;
  contractVersion: number;
};

const HOME_TIMEOUT_MS = 4000;
const WRITE_TIMEOUT_MS = 8000;
const PRONUNCIATION_TIMEOUT_MS = 15000;

function backendUrl(pathname: string): string {
  const configured = process.env.NEXT_PUBLIC_WS_URL?.trim();
  const fallback = typeof window === 'undefined'
    ? 'ws://localhost:18003/ws'
    : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.hostname}:18003/ws`;
  const url = new URL(configured || fallback, typeof window === 'undefined' ? fallback : window.location.href);
  url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
  // A query in the path must stay a query; assigning it to pathname would encode "?" as %3F.
  const [path, query = ''] = pathname.split('?', 2);
  url.pathname = path;
  url.search = query ? `?${query}` : '';
  url.hash = '';
  return url.toString();
}

export function getMissionLearningHomeApiUrl(): string {
  return backendUrl('/api/mission-learning/home');
}

export function getKioskMissionLearningUrl(path: string, kioskId = getKioskIdFromLocation()): string {
  return backendUrl(`/api/kiosks/${encodeURIComponent(kioskId)}/mission-learning${path}`);
}

export function parseMissionLearningHome(payload: unknown): MissionLearningHome | null {
  if (!payload || typeof payload !== 'object') return null;
  const { enabled, contractVersion } = payload as Record<string, unknown>;
  if (typeof enabled !== 'boolean' || typeof contractVersion !== 'number') return null;
  return { enabled, contractVersion };
}

export async function fetchMissionLearningHome(signal?: AbortSignal): Promise<MissionLearningHome | null> {
  const timeout = AbortSignal.timeout(HOME_TIMEOUT_MS);
  const response = await fetch(getMissionLearningHomeApiUrl(), {
    cache: 'no-store',
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  if (!response.ok) return null;
  return parseMissionLearningHome(await response.json());
}

function isSnapshot(value: unknown): value is MissionSnapshot {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as Record<string, unknown>;
  return snapshot.type === 'learning_mission_state'
    && (snapshot.contractVersion === undefined || snapshot.contractVersion === 1)
    && typeof snapshot.sessionId === 'string'
    && typeof snapshot.revision === 'number'
    && typeof snapshot.stage === 'string'
    && Array.isArray(snapshot.allowedActions);
}

async function request<T>(path: string, init: RequestInit, timeoutMs = WRITE_TIMEOUT_MS): Promise<T> {
  let response: Response;
  try {
    response = await fetch(getKioskMissionLearningUrl(path), {
      ...init,
      cache: 'no-store',
      headers: init.headers ?? (init.body ? { 'Content-Type': 'application/json' } : undefined),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new MissionLearningApiError('NETWORK_ERROR', '서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.', 0);
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
    throw new MissionLearningApiError(
      typeof error.code === 'string' ? error.code : 'REQUEST_FAILED',
      typeof error.message === 'string' ? error.message : '요청을 처리하지 못했어요.',
      response.status,
      isSnapshot(error.snapshot) ? error.snapshot : undefined,
    );
  }
  return body as T;
}

function snapshotOrThrow(value: unknown): MissionSnapshot {
  if (!isSnapshot(value)) throw new MissionLearningApiError('BAD_RESPONSE', '서버 응답을 이해하지 못했어요.', 0);
  return value;
}

export function newCommandId(): string {
  // randomUUID exists only in secure contexts; kiosks may load over plain http.
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return `cmd-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

export async function getMissionHome(): Promise<MissionLearningHomeDetail> {
  return request<MissionLearningHomeDetail>('/home', { method: 'GET' }, HOME_TIMEOUT_MS);
}

export async function putMissionProfile(ageBand: AgeBand, level: LearningLevel): Promise<LearnerProfile> {
  return request<LearnerProfile>('/profile', { method: 'PUT', body: JSON.stringify({ ageBand, level }) });
}

/** Opens or closes the learning screen on the kiosk's guide display (/chat). */
export async function setMissionEntry(open: boolean, returnTo: 'mode' | null = null): Promise<void> {
  await request('/entry', { method: 'POST', body: JSON.stringify({ open, returnTo }) });
}

export async function startMission(missionId: string, clientCommandId = newCommandId()): Promise<MissionSnapshot> {
  return snapshotOrThrow(await request('/sessions', {
    method: 'POST',
    body: JSON.stringify({ missionId, clientCommandId }),
  }));
}

export async function getMissionSession(sessionId: string): Promise<MissionSnapshot> {
  return snapshotOrThrow(await request(`/sessions/${encodeURIComponent(sessionId)}`, { method: 'GET' }));
}

export async function sendMissionCommand(
  snapshot: Pick<MissionSnapshot, 'sessionId' | 'revision'>,
  action: MissionAction,
  payload?: { expressionId?: string },
  clientCommandId = newCommandId(),
): Promise<MissionSnapshot> {
  return snapshotOrThrow(await request(`/sessions/${encodeURIComponent(snapshot.sessionId)}/commands`, {
    method: 'POST',
    body: JSON.stringify({ action, expectedRevision: snapshot.revision, clientCommandId, payload }),
  }));
}

/** Uploads one read-aloud recording (16 kHz mono WAV) of a summary expression. */
export async function assessPronunciation(
  sessionId: string,
  expressionId: string,
  wav: Blob,
): Promise<{ result: PronunciationResult; snapshot: MissionSnapshot }> {
  const body = await request<{ result: PronunciationResult; snapshot: unknown }>(
    `/sessions/${encodeURIComponent(sessionId)}/pronunciation?expressionId=${encodeURIComponent(expressionId)}`,
    { method: 'POST', body: wav, headers: { 'Content-Type': 'audio/wav' } },
    PRONUNCIATION_TIMEOUT_MS,
  );
  return { result: body.result, snapshot: snapshotOrThrow(body.snapshot) };
}
