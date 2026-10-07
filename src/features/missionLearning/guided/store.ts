import { create } from 'zustand';
import { parseGuidedSnapshot, type GuidedSnapshot } from './types';

export const isGuidedTerminal = (s: GuidedSnapshot | null) => s?.stage === 'COMPLETED' || s?.stage === 'ABANDONED';

export type GuidedCaptureStatus = {
  sessionId: string; nodeId: string; attemptId: string; controllerEpoch: number; captureEpoch: number;
  status: 'PREPARING' | 'LISTENING' | 'STOPPED' | 'ERROR';
};
export function matchesGuidedVoiceScope(snapshot: GuidedSnapshot | null, value: Record<string, unknown>) {
  const g = snapshot?.guided;
  return !!g && !isGuidedTerminal(snapshot) && g.phase !== 'DEMO' && g.phase !== 'RECAP'
    && snapshot?.sessionId === value.sessionId && g.nodeId === value.nodeId && g.attemptId === value.attemptId
    && typeof g.controllerEpoch === 'number' && g.controllerEpoch === value.controllerEpoch
    && typeof g.captureEpoch === 'number' && g.captureEpoch === value.captureEpoch;
}

export const useGuidedLearningStore = create<{
  roleAudio: { sessionId: string; nodeId: string; attemptId: string; playbackId: string } | null;
  /** Server-confirmed ROLE releases (stop proof for that exact playback only). */
  releasedRolePlaybacks: string[];
  receiveRoleAudio: (value: Record<string, unknown>) => void;
  snapshot: GuidedSnapshot | null; error: string | null; voiceRetry: number;
  retryVoice: () => void;
  voiceAck: { sessionId: string; sequence: number } | null;
  acknowledgeVoice: (sessionId: string) => void;
  retiredSessions: string[];
  partialTranscript: string;
  captureStatus: GuidedCaptureStatus | null;
  receivePartial: (value: Record<string, unknown>) => void;
  receiveCaptureStatus: (value: Record<string, unknown>) => void;
  reconcileHome: (snapshot: GuidedSnapshot | null) => void;
  pushSnapshot: (value: unknown) => boolean;
  setError: (message: string | null) => void;
}>((set, get) => ({
  snapshot: null, error: null, voiceRetry: 0,
  roleAudio: null, releasedRolePlaybacks: [],
  receiveRoleAudio: value => {
    const { snapshot, error, roleAudio } = get();
    if (value.active === false) {
      if (typeof value.playbackId === 'string' && value.playbackId && value.playbackId.length <= 128) {
        set(s => ({ releasedRolePlaybacks: [...s.releasedRolePlaybacks, value.playbackId as string].slice(-16) }));
      }
      if (roleAudio && roleAudio.playbackId === value.playbackId && roleAudio.sessionId === value.sessionId) set({ roleAudio: null });
      return;
    }
    const g = snapshot?.guided;
    if (error || isGuidedTerminal(snapshot) || !g || value.active !== true || value.generationComplete === true
      || snapshot?.sessionId !== value.sessionId || g.nodeId !== value.nodeId || g.attemptId !== value.attemptId
      || typeof value.playbackId !== 'string' || !value.playbackId || value.playbackId.length > 128) return;
    set({ roleAudio: { sessionId: snapshot.sessionId, nodeId: g.nodeId, attemptId: g.attemptId, playbackId: value.playbackId } });
  },
  voiceAck: null,
  retiredSessions: [],
  partialTranscript: '', captureStatus: null,
  receivePartial: value => {
    const { snapshot, error } = get();
    if (error || !matchesGuidedVoiceScope(snapshot, value) || snapshot?.guided?.audioOwner !== 'NONE'
      || !['READY', 'PROCESSING'].includes(snapshot.guided.inputState)
      || typeof value.content !== 'string' || value.content.length > 300) return;
    set({ partialTranscript: value.content });
  },
  receiveCaptureStatus: value => {
    const { snapshot, error } = get();
    if (error || !matchesGuidedVoiceScope(snapshot, value)
      || !['PREPARING', 'LISTENING', 'STOPPED', 'ERROR'].includes(value.status as string)
      || value.status === 'LISTENING' && (snapshot?.guided?.audioOwner !== 'NONE'
        || !['READY', 'PROCESSING'].includes(snapshot.guided.inputState))) return;
    const { sessionId, nodeId, attemptId, controllerEpoch, captureEpoch, status } = value;
    set({ captureStatus: { sessionId, nodeId, attemptId, controllerEpoch, captureEpoch, status } as GuidedCaptureStatus,
      ...(status !== 'LISTENING' ? { partialTranscript: '' } : {}) });
  },
  reconcileHome: snapshot => set(s => ({
    snapshot, error: null, partialTranscript: '',
    roleAudio: snapshot?.sessionId === s.roleAudio?.sessionId && snapshot?.guided?.nodeId === s.roleAudio?.nodeId
      && snapshot?.guided?.attemptId === s.roleAudio?.attemptId && !isGuidedTerminal(snapshot) ? s.roleAudio : null,
    // Socket replay may precede the initial home request. Preserve only a
    // status still authorized by that home snapshot's exact capture scope.
    captureStatus: !s.error && s.captureStatus && matchesGuidedVoiceScope(snapshot, s.captureStatus)
      && (s.captureStatus.status !== 'LISTENING' || snapshot?.guided?.audioOwner === 'NONE'
        && ['READY', 'PROCESSING'].includes(snapshot.guided.inputState)) ? s.captureStatus : null,
    retiredSessions: s.snapshot && s.snapshot.sessionId !== snapshot?.sessionId
      ? [...s.retiredSessions, s.snapshot.sessionId].slice(-32) : s.retiredSessions,
  })),
  acknowledgeVoice: sessionId => set(s => ({ voiceAck: { sessionId, sequence: (s.voiceAck?.sequence ?? 0) + 1 } })),
  retryVoice: () => set(s => ({ voiceRetry: s.voiceRetry + 1 })),
  pushSnapshot: value => {
    const next = parseGuidedSnapshot(value);
    if (!next) { set({ error: '수업 연결 정보가 맞지 않아요. 다시 연결해 주세요.' }); return false; }
    const current = get().snapshot;
    if (get().retiredSessions.includes(next.sessionId)) return false;
    if (current && (current.sessionId === next.sessionId ? current.revision >= next.revision : !isGuidedTerminal(current))) return false;
    const scopeChanged = current?.sessionId !== next.sessionId || current?.guided?.attemptId !== next.guided?.attemptId
      || current?.guided?.captureEpoch !== next.guided?.captureEpoch || current?.guided?.controllerEpoch !== next.guided?.controllerEpoch;
    set({ snapshot: next, error: null,
      ...(isGuidedTerminal(next) || current?.sessionId !== next.sessionId || current?.guided?.nodeId !== next.guided?.nodeId
        || current?.guided?.attemptId !== next.guided?.attemptId ? { roleAudio: null } : {}),
      ...(current && current.sessionId !== next.sessionId ? { retiredSessions: [...get().retiredSessions, current.sessionId].slice(-32) } : {}),
      ...(scopeChanged ? { captureStatus: null } : {}),
      ...(scopeChanged || next.guided?.outcome || next.guided?.audioOwner !== 'NONE' ? { partialTranscript: '' } : {}) });
    return true;
  },
  setError: error => set({ error }),
}));
