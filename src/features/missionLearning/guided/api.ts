import { getKioskMissionLearningUrl } from '../api';
import { parseGuidedHome, parseGuidedSnapshot, type GuidedAction, type GuidedLevel, type GuidedSnapshot } from './types';

export class GuidedApiError extends Error {
  constructor(message: string, public code: string, public snapshot: GuidedSnapshot | null = null) { super(message); }
}
export async function guidedRequest(path: string, body?: Record<string, unknown>, method = 'POST'): Promise<unknown> {
  const response = await fetch(getKioskMissionLearningUrl(`/v2${path}`), {
    method: body ? method : 'GET', cache: 'no-store', credentials: 'same-origin',
    signal: AbortSignal.timeout(8000),
    ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  });
  const value = await response.json();
  if (!response.ok) {
    const detail = value.detail ?? value;
    throw new GuidedApiError('요청을 처리하지 못했어요. 최신 수업 상태를 확인해 주세요.', detail.code ?? 'REQUEST_FAILED', parseGuidedSnapshot(detail.snapshot));
  }
  return value;
}
const snapshot = (value: unknown) => {
  const v = value as { snapshot?: unknown };
  const result = parseGuidedSnapshot(v.snapshot ?? value);
  if (!result) throw new GuidedApiError('수업 연결 정보가 맞지 않아요. 다시 연결해 주세요.', 'INVALID_CONTRACT');
  return result;
};
export async function getGuidedHome() {
  const home = parseGuidedHome(await guidedRequest('/home'));
  if (!home) throw new GuidedApiError('수업 연결 정보가 맞지 않아요. 다시 연결해 주세요.', 'INVALID_CONTRACT');
  return home;
}
export const getGuidedSession = async (id: string) => snapshot(await guidedRequest(`/sessions/${encodeURIComponent(id)}`));
export const saveGuidedProfile = (level: GuidedLevel, expectedRevision: number) => guidedRequest('/profile', { level, expectedRevision, clientCommandId: crypto.randomUUID() }, 'PUT');
export const startGuidedLesson = async (lessonId: string) => snapshot(await guidedRequest('/sessions', { lessonId, clientCommandId: crypto.randomUUID() }));
export const sendGuidedCommand = async (s: GuidedSnapshot, action: GuidedAction, payload?: Record<string, string>) => snapshot(await guidedRequest(`/sessions/${encodeURIComponent(s.sessionId)}/commands`, {
  action, expectedRevision: s.revision, clientCommandId: crypto.randomUUID(), ...(payload ? { payload } : {}),
}));
