import { useCallback, useEffect, useRef } from 'react';
import {
  useStore,
  type ChatMessageMetadata,
  type TurnCorrection,
  type TurnEvaluation,
} from '@/stores/useStore';
import { useAudioPlayer } from './useAudioPlayer';
import { useSttAdapter } from './useSttAdapter';
import { MISSION_GUIDE_AUDIO_RELEASE_EVENT, type SetMissionGuideAudio } from '@/features/missionLearning/useMissionGuideAudio';
import type { Emotion, TtsAudioChunk, TtsVisemeTimeline } from '@/lib/lipsync/types';
import { speechEvidenceMatchesText } from '@/lib/missionText';
import { getKioskIdFromLocation, withKioskSessionParams, type KioskRole } from '@/lib/kioskIdentity';
import {
  buildBrowserPartialTranscriptMessage,
  buildBrowserTranscriptMessage,
  type BrowserFinalTranscript,
  type SpeechEvidenceV1,
} from '@/lib/stt';
import { isTopicId, type TopicId, type TopicSegment } from '@/lib/conversationTopics';
import { isDifficultyId, type DifficultyId } from '@/lib/conversationDifficulties';
import {
  buildStartConversationMessage,
  type PendingConversationStart,
} from '@/lib/conversationSocketMessages';
import { isTranslatorWindowMessage, TRANSLATOR_WINDOW_MESSAGE } from '@/lib/translator';
import { TEXT_ONLY_TEST_MODE } from '@/lib/testMode';
import { useLearningStore } from '@/features/learning/useLearningStore';
import type { AttemptPurpose, LearningSnapshot } from '@/features/learning/types';
import { parseMissionEntry, useMissionLearningStore } from '@/features/missionLearning/store';
import type { MissionSnapshot } from '@/features/missionLearning/types';
import { isGuidedTerminal, useGuidedLearningStore } from '@/features/missionLearning/guided/store';

const EVALUATION_BATCH_DELAY_SECONDS = 30;
const EVALUATION_BATCH_MAX_TURNS = 4;
const SUPPLEMENTARY_POLL_MAX_DURATION_MS = 5 * 60_000;
const SUPPLEMENTARY_FETCH_TIMEOUT_MS = 15_000;
const SUPPLEMENTARY_POLL_INITIAL_DELAY_MS = 2_000;
const SUPPLEMENTARY_POLL_MAX_DELAY_MS = 12_000;
const MAX_SEEN_EVENT_SEQS = 2000;
const EVENT_SEQ_DEDUPE_EXEMPT_TYPES = new Set([
  'session_replay_start',
  'session_replay_end',
  'kiosk_session_ready',
]);

const EMOTION_TAG_MAP: Record<string, Emotion> = {
  '기쁨': 'happy',
  '슬픔': 'sad',
  '놀람': 'surprised',
  '분노': 'angry',
  '짜증': 'annoyed',
  '보통': 'neutral',
  happy: 'happy',
  sad: 'sad',
  surprised: 'surprised',
  angry: 'angry',
  annoyed: 'annoyed',
  neutral: 'neutral',
};

const KOREAN_INTERPRETATION_LABEL = '한국어 해석:';

type SocketMessage = {
  type: string;
  content?: string;
  korean_content?: string;
  suggestions?: string[];
  correction?: TurnCorrection;
  evaluation?: TurnEvaluation;
  turnId?: string;
  code?: string;
  generation_id?: number | string | null;
  response_id?: string;
  segment_id?: string;
  sample_rate?: number;
  seq?: number;
  text?: string;
  emotion?: string;
  timeline?: TtsVisemeTimeline;
  reason?: string;
  evaluation_policy?: 'evaluate' | 'skip';
  evaluation_reason?: string;
  pendingCount?: number;
  inFlightCount?: number;
  phase?: 'queued' | 'evaluating' | 'idle';
  revision?: number;
  maxTurns?: number;
  delaySeconds?: number;
  nextFlushAtEpochMs?: number | null;
  serverEpochMs?: number | null;
  sessionEpoch?: number;
  eventSeq?: number;
  speechEvidence?: SpeechEvidenceV1;
  requestId?: string;
  learningSessionId?: string;
  activeSegmentId?: string | null;
  segmentId?: string;
  topicId?: TopicId;
  label?: string;
  mode?: TopicSegment['mode'];
  aiRole?: string;
  userRole?: string;
  scenarioId?: string;
  scenarioTitle?: string;
  openingLine?: string;
  difficultyId?: DifficultyId;
  difficultyLabel?: string;
  difficultyPolicyVersion?: number;
  sequence?: number;
  occurrence?: number;
  status?: TopicSegment['status'];
  startedAt?: string;
  endedAt?: string;
  createdAt?: string;
  isOpening?: boolean;
  segments?: TopicSegment[];
  lessonSessionId?: string;
  snapshot?: LearningSnapshot;
  activeAttempt?: LearningSnapshot['activeAttempt'];
  playbackId?: string;
  sessionId?: string;
  active?: boolean;
  accepted?: boolean;
  captureEpoch?: number;
  captureActive?: boolean;
  nodeId?: string;
  attemptId?: string;
  controllerEpoch?: number;
  guidedSessionId?: string;
  guidedNodeId?: string;
  guidedAttemptId?: string;
  guidedPlaybackId?: string;
};

type TurnResultsResponse = {
  results?: SocketMessage[];
  evaluationBatchStatus?: SocketMessage | null;
};

type ConnectOptions = {
  startRecording?: boolean;
  role?: KioskRole;
};

type SupplementaryPollState = {
  abortController: AbortController | null;
  attempt: number;
  clientTurnId: string;
  generationId: string;
  startedAtEpochMs: number;
  timeoutId: number | null;
};

type SupplementaryFetchOptions = {
  expectedClientTurnId?: string;
  replayedMessageKeys?: readonly string[];
  replaySequence?: number;
  shouldApply?: () => boolean;
  signal?: AbortSignal;
};

export function isCurrentSupplementaryPoll<T>(
  polls: Map<string, T>,
  pollKey: string,
  pollState: T,
): boolean {
  return polls.get(pollKey) === pollState;
}

export function shouldIgnorePartialAssistantAnswer(
  generationId: string | null,
  finalizedGenerationIds: ReadonlySet<string>,
): boolean {
  return generationId !== null && finalizedGenerationIds.has(generationId);
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = SUPPLEMENTARY_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  if (init.signal?.aborted) {
    controller.abort();
  } else {
    init.signal?.addEventListener('abort', abortFromCaller, { once: true });
  }
  const timeoutId = setTimeout(() => controller.abort(), Math.max(0, timeoutMs));

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
    init.signal?.removeEventListener('abort', abortFromCaller);
  }
}

export function buildClientTurnId(
  backendTurnId: string | null,
  eventSeq?: number,
  serverTurnId?: string | null,
): string | undefined {
  if (serverTurnId?.trim()) {
    return serverTurnId.trim();
  }
  if (!backendTurnId) {
    return undefined;
  }
  return typeof eventSeq === 'number' ? `${backendTurnId}:event-${eventSeq}` : backendTurnId;
}

export function getSupplementaryPollDelayMs(attempt: number): number {
  return Math.min(
    SUPPLEMENTARY_POLL_MAX_DELAY_MS,
    Math.round(SUPPLEMENTARY_POLL_INITIAL_DELAY_MS * (1.5 ** Math.max(0, attempt))),
  );
}

export function isEvaluationBatchIdle(
  status?: Pick<SocketMessage, 'pendingCount' | 'inFlightCount' | 'phase'> | null,
): boolean {
  return Boolean(
    status
    && status.phase === 'idle'
    && Number(status.pendingCount ?? 0) === 0
    && Number(status.inFlightCount ?? 0) === 0,
  );
}

export function buildAudioPacket(
  pcmData: Int16Array,
  isPlaying: boolean,
  sampleRate = 48_000,
  nowEpochMs = Date.now(),
): Uint8Array {
  let peak = 0;
  for (let index = 0; index < pcmData.length; index += 1) {
    peak = Math.max(peak, Math.abs(pcmData[index]));
  }

  const header = new ArrayBuffer(16);
  const view = new DataView(header);
  view.setUint32(0, nowEpochMs >>> 0, false);
  view.setUint32(4, isPlaying ? 1 : 0, false);
  view.setUint32(8, sampleRate, false);
  view.setUint32(12, Math.min(1_000_000, Math.round((peak / 32_768) * 1_000_000)), false);

  const pcmBytes = new Uint8Array(pcmData.buffer, pcmData.byteOffset, pcmData.byteLength);
  const payload = new Uint8Array(header.byteLength + pcmBytes.length);
  payload.set(new Uint8Array(header), 0);
  payload.set(pcmBytes, header.byteLength);
  return payload;
}

export function shouldProcessEventSeq(
  data: Pick<SocketMessage, 'type' | 'eventSeq'>,
  seenEventSeqs: Set<string>,
  eventSeqOrder: string[],
): boolean {
  if (typeof data.eventSeq !== 'number' || EVENT_SEQ_DEDUPE_EXEMPT_TYPES.has(data.type)) {
    return true;
  }

  const key = `${data.type}:${data.eventSeq}`;
  if (seenEventSeqs.has(key)) {
    return false;
  }

  seenEventSeqs.add(key);
  eventSeqOrder.push(key);
  while (eventSeqOrder.length > MAX_SEEN_EVENT_SEQS) {
    const oldest = eventSeqOrder.shift();
    if (oldest) {
      seenEventSeqs.delete(oldest);
    }
  }

  return true;
}

function getDefaultWsUrl(): string {
  if (typeof window === 'undefined') {
    return 'ws://localhost:18003/ws';
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.hostname}:18003/ws`;
}

function getConfiguredWsUrl(role: KioskRole): string {
  const configuredUrl = process.env.NEXT_PUBLIC_WS_URL;
  let wsUrl = configuredUrl && configuredUrl.trim().length > 0 ? configuredUrl : getDefaultWsUrl();

  if (typeof window !== 'undefined' && window.location.protocol === 'https:' && wsUrl.startsWith('ws://')) {
    wsUrl = wsUrl.replace('ws://', 'wss://');
  }

  return withKioskSessionParams(wsUrl, role);
}

export function getTurnResultsUrl(generationId?: string, turnId?: string): string {
  const configuredUrl = process.env.NEXT_PUBLIC_WS_URL;
  const wsUrl = configuredUrl && configuredUrl.trim().length > 0 ? configuredUrl : getDefaultWsUrl();
  const url = new URL(wsUrl, typeof window === 'undefined' ? 'ws://localhost' : window.location.href);

  if (url.protocol === 'wss:') {
    url.protocol = 'https:';
  } else {
    url.protocol = 'http:';
  }
  url.pathname = `/api/kiosks/${encodeURIComponent(getKioskIdFromLocation())}/turn-results`;
  url.search = '';
  if (generationId) {
    url.searchParams.set('generationId', generationId);
  }
  if (turnId) {
    url.searchParams.set('turnId', turnId);
  }
  return url.toString();
}

function sanitizeModelText(text: string): string {
  return text
    .replace(/<\/?start_of_turn>/gi, ' ')
    .replace(/<\/?end_of_turn>/gi, ' ')
    .replace(/<\|(?:start|end)_of_turn\|>/gi, ' ')
    .replace(/<\/?[^>\s/]+_of_turn>/gi, ' ')
    .replace(/(?:^|\s)(?:user|assistant)(?=\s|$)/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function isSttInputReady(
  provider: 'browser' | 'server',
  isCaptureReady: boolean,
  isServerReady: boolean,
): boolean {
  return isCaptureReady && (provider === 'browser' || isServerReady);
}

export function isCurrentSttCaptureRequest<T>(
  requestedSessionId: number,
  currentSessionId: number,
  initiatingSocket: T,
  currentSocket: T,
): boolean {
  return requestedSessionId === currentSessionId
    && initiatingSocket === currentSocket;
}

export function buildSttCaptureStateMessage(active: boolean, captureSessionId: number) {
  return {
    type: 'stt_capture_state' as const,
    active,
    capture_session_id: captureSessionId,
  };
}

export type SttCaptureStartResult = 'started' | 'failed' | 'superseded';

export async function startSttCaptureOperation<T>({
  sendCaptureState,
  startInput,
  getCurrentSessionId,
  getCurrentSocket,
  isOperationCurrent = () => true,
}: {
  sendCaptureState: (active: boolean) => number;
  startInput: () => Promise<boolean | void>;
  getCurrentSessionId: () => number;
  getCurrentSocket: () => T;
  isOperationCurrent?: () => boolean;
}): Promise<SttCaptureStartResult> {
  const initiatingSocket = getCurrentSocket();
  const requestedSessionId = sendCaptureState(true);
  const requestIsCurrent = () => isOperationCurrent() && isCurrentSttCaptureRequest(
    requestedSessionId,
    getCurrentSessionId(),
    initiatingSocket,
    getCurrentSocket(),
  );
  const closeFailedStartIfCurrent = () => {
    if (requestIsCurrent()) sendCaptureState(false);
  };

  try {
    const started = await startInput();
    if (!requestIsCurrent()) return 'superseded';
    if (started === false) {
      closeFailedStartIfCurrent();
      return 'failed';
    }
    return 'started';
  } catch (error) {
    if (!requestIsCurrent()) return 'superseded';
    closeFailedStartIfCurrent();
    throw error;
  }
}

export async function stopSttCaptureOperation(
  sendCaptureState: (active: boolean) => number,
  stopInput: () => Promise<void>,
): Promise<void> {
  sendCaptureState(false);
  await stopInput();
}

export function isMessageForCurrentGeneration(
  generationId: number | string | null | undefined,
  activeGenerationId: string | null,
): boolean {
  return generationId === undefined
    || generationId === null
    || activeGenerationId === null
    || String(generationId) === activeGenerationId;
}

export function isTtsControlForCurrentGeneration(
  generationId: number | string | null | undefined,
  playbackGenerationId: string | null,
): boolean {
  if (generationId === undefined || generationId === null) return true;
  return playbackGenerationId !== null && String(generationId) === playbackGenerationId;
}

export function shouldApplyTtsMute(
  generationId: number | string | null | undefined,
  playbackGenerationId: string | null,
  isPlaying: boolean,
): boolean {
  return isPlaying
    && isTtsControlForCurrentGeneration(generationId, playbackGenerationId);
}

export type TranslatorTtsGate = 'normal' | 'translator-open' | 'waiting-next-turn';
export type TranslatorTtsGateEvent =
  | 'open-translator'
  | 'close-translator'
  | 'capture-boundary-ready'
  | 'conversation-input-ready'
  | 'final-user-request';
export const CONVERSATION_USER_INPUT_EVENT = 'realtime-en:conversation-user-input';

function normalizeConversationInput(text: string): string {
  return sanitizeUserTranscript(text).replace(/\s+/g, ' ').trim();
}

export function notifyConversationUserInput(text: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<string>(CONVERSATION_USER_INPUT_EVENT, {
    detail: normalizeConversationInput(text),
  }));
}

export function transitionTranslatorTtsGate(
  current: TranslatorTtsGate,
  event: TranslatorTtsGateEvent,
): TranslatorTtsGate {
  if (event === 'open-translator') return 'translator-open';
  if (event === 'close-translator') {
    return current === 'translator-open' ? 'waiting-next-turn' : current;
  }
  if (
    (event === 'capture-boundary-ready' || event === 'conversation-input-ready')
    && current === 'waiting-next-turn'
  ) return 'normal';
  return current;
}

export function canPlayConversationTts(gate: TranslatorTtsGate): boolean {
  return gate === 'normal';
}

function sanitizeUserTranscript(text: string): string {
  const hasStructuredTurnMarker = /<\|?(?:start|end)_of_turn\|?>|<\/?[^>\s/]+_of_turn>/i.test(text);
  const sanitized = text
    .replace(/<\/?start_of_turn>/gi, ' ')
    .replace(/<\/?end_of_turn>/gi, ' ')
    .replace(/<\|(?:start|end)_of_turn\|>/gi, ' ')
    .replace(/<\/?[^>\s/]+_of_turn>/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return hasStructuredTurnMarker
    ? sanitized.replace(/^(?:user|assistant)(?=\s|$)\s*/i, '').trim()
    : sanitized;
}

export function addFinalUserRequestMessage(
  addMessage: (
    role: 'user',
    content: string,
    id?: string,
    speechEvidence?: SpeechEvidenceV1,
    metadata?: ChatMessageMetadata,
  ) => void,
  content: string,
  clientTurnId?: string,
  speechEvidence?: SpeechEvidenceV1,
  metadata?: ChatMessageMetadata,
): void {
  const sanitizedContent = sanitizeUserTranscript(content);
  const sanitizedEvidence = speechEvidence
    ? {
        ...speechEvidence,
        finalSegments: speechEvidence.finalSegments.map(sanitizeUserTranscript),
      }
    : undefined;
  const matchingEvidence = sanitizedEvidence
    && speechEvidenceMatchesText(sanitizedContent, sanitizedEvidence)
    ? sanitizedEvidence
    : undefined;
  if (metadata) {
    addMessage('user', sanitizedContent, clientTurnId, matchingEvidence, metadata);
  } else {
    addMessage('user', sanitizedContent, clientTurnId, matchingEvidence);
  }
}

function parseTaggedEmotion(text: string): { emotion: Emotion; displayMessage: string } {
  const sanitizedText = sanitizeModelText(text);
  const match = sanitizedText.match(/^\(([^)]+)\)\s*([\s\S]*)/);
  if (!match) {
    return { emotion: 'neutral', displayMessage: sanitizedText };
  }

  const emotion = EMOTION_TAG_MAP[match[1]] ?? 'neutral';
  return {
    emotion,
    displayMessage: match[2],
  };
}

function formatAssistantDisplayMessage(englishText: string, koreanText?: string): string {
  const english = sanitizeModelText(englishText);
  const korean = sanitizeModelText(koreanText ?? '');
  if (!korean) {
    return english;
  }
  return `${english}\n\n${KOREAN_INTERPRETATION_LABEL} ${korean}`;
}

function unwrapReplySuggestion(value: unknown, depth = 0): string[] {
  if (depth > 2) return [];
  if (Array.isArray(value)) {
    return value.flatMap((item) => unwrapReplySuggestion(item, depth + 1));
  }
  if (typeof value !== 'string') return [];

  const sanitized = sanitizeModelText(value).trim();
  if (!sanitized) return [];
  try {
    const decoded: unknown = JSON.parse(sanitized);
    if (decoded !== sanitized) {
      const unwrapped = unwrapReplySuggestion(decoded, depth + 1);
      if (unwrapped.length > 0) return unwrapped;
    }
  } catch {
    // A normal sentence is not JSON and should be displayed unchanged.
  }
  return [sanitized];
}

export function normalizeReplySuggestions(data: SocketMessage): string[] {
  const rawSuggestions: unknown[] = Array.isArray(data.suggestions) ? data.suggestions : [];
  const seen = new Set<string>();
  const suggestions: string[] = [];
  for (const rawSuggestion of rawSuggestions) {
    for (const suggestion of unwrapReplySuggestion(rawSuggestion)) {
      const key = suggestion.replace(/\s+/g, ' ').trim().toLocaleLowerCase('en');
      if (!key || seen.has(key)) continue;
      seen.add(key);
      suggestions.push(suggestion.replace(/\s+/g, ' ').trim());
      if (suggestions.length >= 3) return suggestions;
    }
  }
  return suggestions;
}

export function useVoiceSocket() {
  const socketRef = useRef<WebSocket | null>(null);
  const isConnecting = useRef(false);
  const isDisconnecting = useRef(false);
  const activeGenerationIdRef = useRef<string | null>(null);
  const sttCaptureSessionIdRef = useRef(0);
  const sttInputOperationRef = useRef(0);
  const guidedCaptureRef = useRef<{ guidedSessionId: string; nodeId: string; attemptId: string; controllerEpoch: number; captureEpoch: number } | null>(null);
  const guidedMicRef = useRef<{ sessionId: string; attemptId: string; active: boolean; starting: boolean; manualStop: boolean; operation: number; retryConsumed: boolean } | null>(null);
  const guidedRoleAudioRef = useRef<{ sessionId: string; nodeId: string; attemptId: string; playbackId: string; generationComplete: boolean } | null>(null);
  const guidedTtsQuarantineRef = useRef(false);
  const guidedFreeTalkRequestedRef = useRef(false);
  const guidedHandoffRef = useRef<{ sessionId: string; id: string; socket: WebSocket } | null>(null);
  const completedGuidedHandoffRef = useRef<string | null>(null);
  const completedGuidedHandoffRequestRef = useRef<string | null>(null);
  const guideAudioRef = useRef<{
    playbackId: string; sessionId: string; shouldResume: boolean; stopped: Promise<void>;
  } | null>(null);
  const guideAudioRequestsRef = useRef(new Map<string, { settle: (accepted: boolean) => void; timer: number }>());
  const guideReleaseRequestsRef = useRef(new Map<string, { sessionId: string; settle: (accepted: boolean) => void; timer: number; promise: Promise<boolean> }>());
  const viewerGuideAudioRef = useRef<{ sessionId: string; playbackId: string } | null>(null);
  const ttsPlaybackGenerationIdRef = useRef<string | null>(null);
  const translatorTtsGateRef = useRef<TranslatorTtsGate>('normal');
  const translatorShouldResumeCaptureRef = useRef(false);
  const backendTurnIdToClientTurnIdRef = useRef<Map<string, string>>(new Map());
  const abandonedEvaluationTurnIdsRef = useRef<Set<string>>(new Set());
  const seenEventSeqsRef = useRef<Set<string>>(new Set());
  const eventSeqOrderRef = useRef<string[]>([]);
  const roleRef = useRef<KioskRole>('controller');
  const disconnectRef = useRef<() => void>(() => undefined);
  const isReplayingSessionRef = useRef(false);
  const sessionReplaySequenceRef = useRef(0);
  const supplementaryPollsRef = useRef<Map<string, SupplementaryPollState>>(new Map());
  const processedSupplementaryKeysRef = useRef<Set<string>>(new Set());
  const finalizedAssistantGenerationIdsRef = useRef<Set<string>>(new Set());
  const activeSpeechTextRef = useRef('');
  const sttProviderRef = useRef<'browser' | 'server'>('browser');
  const isSttCaptureReadyRef = useRef(false);
  const isServerSttReadyRef = useRef(false);
  const pendingTopicStartRef = useRef<PendingConversationStart | null>(null);
  const pendingResumeSegmentRef = useRef<string | null>(null);
  const learningPurposeRef = useRef<AttemptPurpose | null>(null);
  const learningAttemptTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const learningCommandTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingLearningMessageRef = useRef<Record<string, unknown> | null>(null);

  const publishGuidedCaptureStatus = useCallback((status: 'PREPARING' | 'LISTENING' | 'STOPPED' | 'ERROR') => {
    const snapshot = useGuidedLearningStore.getState().snapshot;
    const g = snapshot?.guided;
    if (roleRef.current !== 'controller' || !g || isGuidedTerminal(snapshot)
      || g.phase === 'DEMO' || g.phase === 'RECAP' || typeof g.controllerEpoch !== 'number') return;
    const data = { type: 'guided_capture_status', sessionId: snapshot!.sessionId, nodeId: g.nodeId,
      attemptId: g.attemptId, controllerEpoch: g.controllerEpoch, captureEpoch: sttCaptureSessionIdRef.current, status };
    useGuidedLearningStore.getState().receiveCaptureStatus(data);
    if (socketRef.current?.readyState === WebSocket.OPEN) socketRef.current.send(JSON.stringify(data));
  }, []);

  const setConnecting = useStore((state) => state.setConnecting);
  const setConnected = useStore((state) => state.setConnected);
  const setSttReady = useStore((state) => state.setSttReady);
  const isConnected = useStore((state) => state.isConnected);
  const isSttReady = useStore((state) => state.isSttReady);
  const addMessage = useStore((state) => state.addMessage);
  const appendToLastAssistantMessage = useStore((state) => state.appendToLastAssistantMessage);
  const appendToAssistantMessage = useStore((state) => state.appendToAssistantMessage);
  const setLastAssistantSuggestions = useStore((state) => state.setLastAssistantSuggestions);
  const setAssistantSuggestions = useStore((state) => state.setAssistantSuggestions);
  const assignLatestPendingUserTurnId = useStore((state) => state.assignLatestPendingUserTurnId);
  const setTurnCorrection = useStore((state) => state.setTurnCorrection);
  const setTurnCorrectionSkipped = useStore((state) => state.setTurnCorrectionSkipped);
  const setTurnCorrectionUnavailable = useStore((state) => state.setTurnCorrectionUnavailable);
  const setTurnEvaluation = useStore((state) => state.setTurnEvaluation);
  const setTurnEvaluationSkipped = useStore((state) => state.setTurnEvaluationSkipped);
  const setTurnEvaluationUnavailable = useStore((state) => state.setTurnEvaluationUnavailable);
  const getPendingEvaluationTurnIds = useStore((state) => state.getPendingEvaluationTurnIds);
  const skipPendingTurnEvaluations = useStore((state) => state.skipPendingTurnEvaluations);
  const setEvaluationBatchStatus = useStore((state) => state.setEvaluationBatchStatus);
  const queueLocalEvaluationBatchTurn = useStore((state) => state.queueLocalEvaluationBatchTurn);
  const clearEvaluationBatchStatus = useStore((state) => state.clearEvaluationBatchStatus);
  const setThinking = useStore((state) => state.setThinking);
  const setSocket = useStore((state) => state.setSocket);
  const upsertTtsSegment = useStore((state) => state.upsertTtsSegment);
  const patchTtsSegment = useStore((state) => state.patchTtsSegment);
  const clearTtsSegments = useStore((state) => state.clearTtsSegments);
  const setLipSyncMode = useStore((state) => state.setLipSyncMode);
  const clearMessages = useStore((state) => state.clearMessages);
  const beginSessionReplay = useStore((state) => state.beginSessionReplay);
  const finishSessionReplay = useStore((state) => state.finishSessionReplay);
  const reconcileSessionReplayPendingEvaluations = useStore((state) => state.reconcileSessionReplayPendingEvaluations);
  const setConversationState = useStore((state) => state.setConversationState);
  const upsertTopicSegment = useStore((state) => state.upsertTopicSegment);
  const setConversationStartStatus = useStore((state) => state.setConversationStartStatus);

  const sendLearningMessage = useCallback((payload: Record<string, unknown>) => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) return false;
    socketRef.current.send(JSON.stringify(payload));
    useLearningStore.getState().setCommandPending(true);
    if (learningCommandTimeoutRef.current) clearTimeout(learningCommandTimeoutRef.current);
    learningCommandTimeoutRef.current = setTimeout(() => {
      useLearningStore.getState().setError('서버 응답이 늦어지고 있습니다. 연결을 확인하고 다시 시도해 주세요.');
      learningCommandTimeoutRef.current = null;
    }, 8_000);
    return true;
  }, []);

  const getMessageMetadata = useCallback((data: SocketMessage): ChatMessageMetadata | undefined => {
    const topicId = isTopicId(data.topicId) ? data.topicId : undefined;
    if (!data.learningSessionId && !data.segmentId && !topicId && !data.createdAt && !data.isOpening) {
      return undefined;
    }
    return {
      learningSessionId: data.learningSessionId,
      segmentId: data.segmentId,
      topicId,
      createdAt: data.createdAt,
      isOpening: data.isOpening,
    };
  }, []);

  const notifyTtsPlaybackStopped = useCallback(() => {
    activeSpeechTextRef.current = '';
    ttsPlaybackGenerationIdRef.current = null;
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      if (guidedRoleAudioRef.current?.generationComplete) {
        socketRef.current.send(JSON.stringify({ type: 'guided_role_audio_complete', playbackId: guidedRoleAudioRef.current.playbackId, success: true }));
        guidedRoleAudioRef.current = null;
      }
      socketRef.current.send(JSON.stringify({ type: 'tts_stop' }));
    }
  }, []);

  const { playPcmChunk, clearQueue, muteTts, unmuteTts } = useAudioPlayer({
    onPlaybackIdle: notifyTtsPlaybackStopped,
  });

  const cleanupSocket = useCallback(() => {
    if (!socketRef.current) return;
    socketRef.current.onopen = null;
    socketRef.current.onmessage = null;
    socketRef.current.onclose = null;
    socketRef.current.onerror = null;
    if (
      socketRef.current.readyState === WebSocket.OPEN ||
      socketRef.current.readyState === WebSocket.CONNECTING
    ) {
      socketRef.current.close();
    }
    socketRef.current = null;
  }, []);

  const clearSupplementaryPolling = useCallback(() => {
    supplementaryPollsRef.current.forEach(({ abortController, timeoutId }) => {
      abortController?.abort();
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    });
    supplementaryPollsRef.current.clear();
  }, []);

  const flushActiveTts = useCallback(
    (responseId?: string) => {
      if (guidedRoleAudioRef.current) {
        if (socketRef.current?.readyState === WebSocket.OPEN) socketRef.current.send(JSON.stringify({ type: 'guided_role_audio_complete', playbackId: guidedRoleAudioRef.current.playbackId, success: false }));
        guidedRoleAudioRef.current = null;
      }
      activeSpeechTextRef.current = '';
      ttsPlaybackGenerationIdRef.current = null;
      clearQueue(responseId);
      clearTtsSegments(responseId);
      useStore.getState().setPartialMessage('');
      setLipSyncMode('heuristic');
    },
    [clearQueue, clearTtsSegments, setLipSyncMode],
  );

  const handleSttAudioData = useCallback((pcmData: Int16Array) => {
    if (guideAudioRef.current) return;
    if (useGuidedLearningStore.getState().error) return;
    const guided = useGuidedLearningStore.getState().snapshot;
    if (guided && !isGuidedTerminal(guided) && (!['READY', 'PROCESSING'].includes(guided.guided?.inputState ?? '') || guided.guided?.audioOwner !== 'NONE' || guidedMicRef.current?.manualStop)) return;
    if (socketRef.current?.readyState !== WebSocket.OPEN) return;
    socketRef.current.send(buildAudioPacket(pcmData, useStore.getState().isPlaying));
  }, []);

  const handleBrowserFinalTranscript = useCallback((transcript: BrowserFinalTranscript) => {
    if (guideAudioRef.current) return;
    if (useGuidedLearningStore.getState().error) return;
    useStore.getState().setLiveTranscript('');
    if (socketRef.current?.readyState !== WebSocket.OPEN) return;
    const guided = useGuidedLearningStore.getState().snapshot;
    if (guided && !isGuidedTerminal(guided)) {
      const context = guidedCaptureRef.current;
      guidedCaptureRef.current = null;
      if (!context || context.guidedSessionId !== guided.sessionId || context.attemptId !== guided.guided?.attemptId
        || context.nodeId !== guided.guided.nodeId || context.captureEpoch !== sttCaptureSessionIdRef.current
        || !['READY', 'PROCESSING'].includes(guided.guided.inputState) || guided.guided.audioOwner !== 'NONE' || guidedMicRef.current?.manualStop) return;
      socketRef.current.send(JSON.stringify({ ...JSON.parse(buildBrowserTranscriptMessage(transcript)), ...context }));
      return;
    }
    socketRef.current.send(buildBrowserTranscriptMessage(transcript));
  }, []);

  const handleBrowserInterimTranscript = useCallback((transcript: string) => {
    if (guideAudioRef.current) return;
    if (useGuidedLearningStore.getState().error) return;
    const guided = useGuidedLearningStore.getState().snapshot;
    if (guided && !isGuidedTerminal(guided)) {
      const context = guidedCaptureRef.current;
      if (!context || context.guidedSessionId !== guided.sessionId || context.attemptId !== guided.guided?.attemptId
        || context.nodeId !== guided.guided.nodeId || context.captureEpoch !== sttCaptureSessionIdRef.current
        || !['READY', 'PROCESSING'].includes(guided.guided.inputState) || guided.guided.audioOwner !== 'NONE'
        || guidedMicRef.current?.manualStop) return;
      useGuidedLearningStore.getState().receivePartial({ ...context, sessionId: context.guidedSessionId, content: transcript });
      if (socketRef.current?.readyState === WebSocket.OPEN) socketRef.current.send(JSON.stringify({ ...JSON.parse(buildBrowserPartialTranscriptMessage(transcript)), ...context }));
      return;
    }
    useStore.getState().setLiveTranscript(transcript);
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(buildBrowserPartialTranscriptMessage(transcript));
    }
  }, []);

  const handleBrowserSpeechStarted = useCallback(() => {
    if (guideAudioRef.current) return;
    const guided = useGuidedLearningStore.getState().snapshot;
    if (guided && !isGuidedTerminal(guided)) {
      guidedCaptureRef.current = null;
      const g = guided.guided;
      if (!g || g.inputState !== 'READY' || g.audioOwner !== 'NONE' || !g.voiceStarted
        || typeof g.controllerEpoch !== 'number' || guidedMicRef.current?.manualStop
        || socketRef.current?.readyState !== WebSocket.OPEN) return;
      const context = { guidedSessionId: guided.sessionId, nodeId: g.nodeId, attemptId: g.attemptId,
        controllerEpoch: g.controllerEpoch, captureEpoch: sttCaptureSessionIdRef.current };
      guidedCaptureRef.current = context;
      socketRef.current.send(JSON.stringify({ type: 'guided_capture_start', ...context }));
      return;
    }
    if (!useStore.getState().isPlaying) return;
    flushActiveTts();
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'tts_stop' }));
    }
  }, [flushActiveTts]);

  const handleBrowserSttReadyChange = useCallback((ready: boolean) => {
    isSttCaptureReadyRef.current = ready;
    const fullyReady = isSttInputReady(
      sttProviderRef.current,
      ready,
      isServerSttReadyRef.current,
    );
    setSttReady(fullyReady);
    setConnecting(ready && sttProviderRef.current === 'server' ? !fullyReady : false);
    if (ready) publishGuidedCaptureStatus(fullyReady ? 'LISTENING' : 'PREPARING');
  }, [publishGuidedCaptureStatus, setConnecting, setSttReady]);

  const handleBrowserSttError = useCallback((code: string) => {
    console.error('Browser STT error:', code);
    if (guidedMicRef.current) { guidedMicRef.current.active = false; guidedMicRef.current.starting = false; }
    publishGuidedCaptureStatus('ERROR');
  }, [publishGuidedCaptureStatus]);

  const handleUtteranceAborted = useCallback((reason: 'NO_SPEECH' | 'NO_FINAL' | 'VOICE_NOT_READY') => {
    const context = guidedCaptureRef.current;
    guidedCaptureRef.current = null;
    if (!context || guidedMicRef.current?.manualStop || socketRef.current?.readyState !== WebSocket.OPEN) return;
    const s = useGuidedLearningStore.getState().snapshot;
    if (s?.sessionId !== context.guidedSessionId || s.guided?.attemptId !== context.attemptId
      || s.guided.nodeId !== context.nodeId || sttCaptureSessionIdRef.current !== context.captureEpoch) return;
    socketRef.current.send(JSON.stringify({ type: 'guided_capture_cancel', ...context, reason }));
  }, []);

  const getPlaybackState = useCallback(() => ({
    isPlaying: useStore.getState().isPlaying,
    text: activeSpeechTextRef.current,
  }), []);

  const {
    provider: sttProvider,
    start: startSttInput,
    stop: stopSttInput,
    isRecording,
  } = useSttAdapter({
    onAudioData: handleSttAudioData,
    onFinalTranscript: handleBrowserFinalTranscript,
    onInterimTranscript: handleBrowserInterimTranscript,
    onReadyChange: handleBrowserSttReadyChange,
    onError: handleBrowserSttError,
    onSpeechStarted: handleBrowserSpeechStarted,
    onUtteranceAborted: handleUtteranceAborted,
    getPlaybackState,
  });

  const sendSttCaptureState = useCallback((active: boolean) => {
    const captureSessionId = sttCaptureSessionIdRef.current + 1;
    sttCaptureSessionIdRef.current = captureSessionId;
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(
        buildSttCaptureStateMessage(active, captureSessionId),
      ));
    }
    return captureSessionId;
  }, []);

  const startSttCapture = useCallback(async (captureOptions?: { requiredAudio?: boolean }) => {
    if (guideAudioRef.current) return 'superseded' as const;
    const operation = sttInputOperationRef.current;
    // The control message is placed on the WebSocket before MediaRecorder can
    // produce new binary frames. The backend completes its discard barrier
    // before reading those frames.
    const result = await startSttCaptureOperation({
      sendCaptureState: sendSttCaptureState,
      startInput: () => startSttInput(captureOptions),
      getCurrentSessionId: () => sttCaptureSessionIdRef.current,
      getCurrentSocket: () => socketRef.current,
      isOperationCurrent: () => sttInputOperationRef.current === operation,
    });
    if (result === 'started' && translatorTtsGateRef.current === 'waiting-next-turn') {
      translatorShouldResumeCaptureRef.current = false;
      translatorTtsGateRef.current = transitionTranslatorTtsGate(
        translatorTtsGateRef.current,
        'capture-boundary-ready',
      );
    }
    if (result === 'started') publishGuidedCaptureStatus(useStore.getState().isSttReady ? 'LISTENING' : 'PREPARING');
    else if (result === 'failed') publishGuidedCaptureStatus('ERROR');
    return result;
  }, [publishGuidedCaptureStatus, sendSttCaptureState, startSttInput]);

  const stopSttCapture = useCallback(async () => {
    guidedCaptureRef.current = null;
    // Close the backend epoch first so any final browser callback or trailing
    // PCM chunk emitted during local teardown is rejected.
    await stopSttCaptureOperation(sendSttCaptureState, stopSttInput);
  }, [sendSttCaptureState, stopSttInput]);

  const clearGuideAudioRequests = useCallback(() => {
    if (viewerGuideAudioRef.current) {
      window.dispatchEvent(new CustomEvent(MISSION_GUIDE_AUDIO_RELEASE_EVENT, { detail: viewerGuideAudioRef.current }));
      viewerGuideAudioRef.current = null;
    }
    guideAudioRequestsRef.current.forEach(({ settle, timer }) => {
      window.clearTimeout(timer);
      settle(false);
    });
    guideAudioRequestsRef.current.clear();
    guideReleaseRequestsRef.current.forEach(({ settle, timer }) => { window.clearTimeout(timer); settle(false); });
    guideReleaseRequestsRef.current.clear();
    guideAudioRef.current = null;
  }, []);

  const setMissionGuideAudio = useCallback<SetMissionGuideAudio>((active, sessionId, playbackId, playbackSucceeded = false, cancelRole) => {
    const socket = socketRef.current;
    if (roleRef.current !== 'viewer' || socket?.readyState !== WebSocket.OPEN) return Promise.resolve(false);
    if (!active) {
      if (viewerGuideAudioRef.current?.playbackId === playbackId) viewerGuideAudioRef.current = null;
      const existing = guideReleaseRequestsRef.current.get(playbackId);
      if (existing) return existing.sessionId === sessionId ? existing.promise : Promise.resolve(false);
      if (guideReleaseRequestsRef.current.size >= 2) return Promise.resolve(false);
      let settle!: (accepted: boolean) => void;
      const promise = new Promise<boolean>(resolve => { settle = resolve; });
      const timer = window.setTimeout(() => { guideReleaseRequestsRef.current.delete(playbackId); settle(false); }, 10_000);
      guideReleaseRequestsRef.current.set(playbackId, { sessionId, settle, timer, promise });
      try { socket.send(JSON.stringify({ type: 'mission_guide_audio', active, sessionId, playbackId, playbackSucceeded,
        ...(cancelRole ? { cancelRole: true, nodeId: cancelRole.nodeId, attemptId: cancelRole.attemptId } : {}) })); }
      catch { window.clearTimeout(timer); guideReleaseRequestsRef.current.delete(playbackId); settle(false); }
      return promise;
    }
    // One guide owns browser TTS at a time; do not grow an unbounded request queue.
    if (guideAudioRequestsRef.current.size > 0 || guideReleaseRequestsRef.current.size > 0 || viewerGuideAudioRef.current) return Promise.resolve(false);
    return new Promise((settle) => {
      viewerGuideAudioRef.current = { sessionId, playbackId };
      const timer = window.setTimeout(() => {
        guideAudioRequestsRef.current.delete(playbackId);
        if (socket.readyState === WebSocket.OPEN) {
          try { socket.send(JSON.stringify({ type: 'mission_guide_audio', active: false, sessionId, playbackId })); }
          catch { /* Disconnected leases expire on the server too. */ }
        }
        settle(false);
      }, 10_000);
      guideAudioRequestsRef.current.set(playbackId, { settle, timer });
      try { socket.send(JSON.stringify({ type: 'mission_guide_audio', active, sessionId, playbackId })); }
      catch {
        window.clearTimeout(timer);
        guideAudioRequestsRef.current.delete(playbackId);
        viewerGuideAudioRef.current = null;
        settle(false);
      }
    });
  }, []);

  const handleMissionGuideAudio = useCallback(async (data: SocketMessage) => {
    if (roleRef.current === 'viewer') {
      if (data.active === false && data.playbackId === viewerGuideAudioRef.current?.playbackId) {
        window.dispatchEvent(new CustomEvent(MISSION_GUIDE_AUDIO_RELEASE_EVENT, { detail: viewerGuideAudioRef.current }));
        viewerGuideAudioRef.current = null;
      }
      return;
    }
    if (roleRef.current !== 'controller' || typeof data.playbackId !== 'string' || !data.playbackId
      || data.playbackId.length > 128 || typeof data.sessionId !== 'string' || !data.sessionId
      || data.sessionId.length > 128 || typeof data.active !== 'boolean') return;
    if (typeof data.captureEpoch === 'number' && Number.isSafeInteger(data.captureEpoch)
      && data.captureEpoch >= 0 && data.captureEpoch < Number.MAX_SAFE_INTEGER) {
      sttCaptureSessionIdRef.current = Math.max(sttCaptureSessionIdRef.current, data.captureEpoch);
    }
    if (data.active) {
      if (guideAudioRef.current?.playbackId === data.playbackId) return;
      const shouldResume = guideAudioRef.current?.shouldResume ?? useStore.getState().isRecording;
      // Server has already closed and discarded this epoch before relaying the lease.
      // Local stop must not create another competing backend capture transition.
      const lease = {
        playbackId: data.playbackId, sessionId: data.sessionId, shouldResume,
        stopped: Promise.resolve(),
      };
      guideAudioRef.current = lease;
      // A ROLE lease can arrive with a server epoch older than a locally sent
      // start still in flight. Cancel that local operation without sending a
      // competing capture reset or reporting an intentional stop as failure.
      sttInputOperationRef.current += 1;
      if (guidedMicRef.current?.sessionId === data.sessionId) {
        guidedMicRef.current.operation += 1;
        guidedMicRef.current.active = false;
        guidedMicRef.current.starting = false;
      }
      lease.stopped = stopSttInput();
      useStore.getState().setLiveTranscript('');
      isSttCaptureReadyRef.current = false;
      setSttReady(false);
      flushActiveTts();
      return;
    }
    const lease = guideAudioRef.current;
    if (!lease || lease.playbackId !== data.playbackId) return;
    await lease.stopped;
    if (guideAudioRef.current !== lease) return;
    guideAudioRef.current = null;
    const snapshot = useMissionLearningStore.getState().snapshot;
    const guided = useGuidedLearningStore.getState().snapshot;
    const guidedReady = guided?.sessionId === lease.sessionId && guided.guided?.inputState === 'READY'
      && guided.guided.audioOwner === 'NONE' && !guidedMicRef.current?.manualStop;
    if (lease.shouldResume && data.captureActive === true && !guideAudioRef.current
      && (guidedReady || (snapshot?.stage === 'ROLEPLAY' && snapshot.sessionId === lease.sessionId))
      && translatorTtsGateRef.current !== 'translator-open'
      && socketRef.current?.readyState === WebSocket.OPEN) {
      const mic = guidedReady ? guidedMicRef.current : null;
      const operation = mic ? ++mic.operation : 0;
      if (mic) mic.starting = true;
      try {
        const result = await startSttCapture();
        if (mic && guidedMicRef.current === mic && mic.operation === operation) {
          mic.starting = false; mic.active = result === 'started';
        }
      } catch {
        if (mic && guidedMicRef.current === mic && mic.operation === operation) { mic.starting = false; mic.active = false; }
        publishGuidedCaptureStatus('ERROR');
      }
    }
  }, [flushActiveTts, publishGuidedCaptureStatus, setSttReady, startSttCapture, stopSttInput]);

  const suspendTtsForTranslator = useCallback(() => {
    if (translatorTtsGateRef.current === 'translator-open') return;

    // ControlPanel closes the STT capture epoch for the translator. Close the
    // playback gate synchronously so late chunks cannot refill the queue while
    // that reset barrier is running.
    translatorTtsGateRef.current = transitionTranslatorTtsGate(
      translatorTtsGateRef.current,
      'open-translator',
    );
    translatorShouldResumeCaptureRef.current = translatorShouldResumeCaptureRef.current
      || useStore.getState().isRecording;
    flushActiveTts();
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'tts_stop' }));
    }
  }, [flushActiveTts]);

  const resumeTtsAfterTranslator = useCallback(() => {
    if (translatorTtsGateRef.current !== 'translator-open') return;

    translatorTtsGateRef.current = transitionTranslatorTtsGate(
      translatorTtsGateRef.current,
      'close-translator',
    );
    if (!translatorShouldResumeCaptureRef.current) {
      translatorTtsGateRef.current = transitionTranslatorTtsGate(
        translatorTtsGateRef.current,
        'capture-boundary-ready',
      );
    }
  }, []);

  useEffect(() => {
    const handleTranslatorMessage = (event: MessageEvent) => {
      if (event.origin && event.origin !== window.location.origin) return;
      if (!isTranslatorWindowMessage(event.data)) return;
      if (roleRef.current === 'viewer') return;

      if (event.data.action === 'open') {
        suspendTtsForTranslator();
      } else {
        resumeTtsAfterTranslator();
      }
    };
    const handleConversationUserInput = (event: Event) => {
      if (translatorTtsGateRef.current !== 'waiting-next-turn') return;
      const text = (event as CustomEvent<unknown>).detail;
      if (typeof text !== 'string' || !text.trim()) return;
      translatorShouldResumeCaptureRef.current = false;
      translatorTtsGateRef.current = transitionTranslatorTtsGate(
        translatorTtsGateRef.current,
        'conversation-input-ready',
      );
    };

    window.addEventListener('message', handleTranslatorMessage);
    window.addEventListener(CONVERSATION_USER_INPUT_EVENT, handleConversationUserInput);
    const channel = 'BroadcastChannel' in window
      ? new BroadcastChannel(TRANSLATOR_WINDOW_MESSAGE)
      : null;
    channel?.addEventListener('message', handleTranslatorMessage);

    return () => {
      window.removeEventListener('message', handleTranslatorMessage);
      window.removeEventListener(CONVERSATION_USER_INPUT_EVENT, handleConversationUserInput);
      channel?.removeEventListener('message', handleTranslatorMessage);
      channel?.close();
    };
  }, [resumeTtsAfterTranslator, suspendTtsForTranslator]);

  useEffect(() => {
    sttProviderRef.current = sttProvider;
  }, [sttProvider]);

  const getGenerationId = useCallback((data: SocketMessage): string | null => {
    if (data.generation_id === undefined || data.generation_id === null) {
      return null;
    }
    return String(data.generation_id);
  }, []);

  const getTurnId = useCallback(
    (data: SocketMessage): string | null => {
      if (data.turnId?.trim()) {
        return data.turnId.trim();
      }
      const backendTurnId = getGenerationId(data);
      if (!backendTurnId) {
        return null;
      }
      return backendTurnIdToClientTurnIdRef.current.get(backendTurnId) ?? backendTurnId;
    },
    [getGenerationId],
  );

  const discardPendingEvaluations = useCallback(
    (reason = 'mic_disconnected') => {
      getPendingEvaluationTurnIds().forEach((turnId) => {
        abandonedEvaluationTurnIdsRef.current.add(turnId);
      });
      skipPendingTurnEvaluations(reason);
    },
    [getPendingEvaluationTurnIds, skipPendingTurnEvaluations],
  );

  const isCurrentGeneration = useCallback(
    (data: SocketMessage): boolean => {
      return isMessageForCurrentGeneration(
        data.generation_id,
        activeGenerationIdRef.current,
      );
    },
    [],
  );

  const bindActiveGenerationToPendingUser = useCallback(
    (data: SocketMessage) => {
      const generationId = getGenerationId(data);
      if (!generationId) return;

      if (!activeGenerationIdRef.current) {
        activeGenerationIdRef.current = generationId;
      }
      if (generationId === activeGenerationIdRef.current) {
        const clientTurnId = buildClientTurnId(
          generationId,
          data.eventSeq,
          data.turnId,
        ) ?? generationId;
        backendTurnIdToClientTurnIdRef.current.set(generationId, clientTurnId);
        assignLatestPendingUserTurnId(clientTurnId);
      }
    },
    [assignLatestPendingUserTurnId, getGenerationId],
  );

  const canAcceptGuidedRoleEvent = useCallback((data: SocketMessage) => {
      const guided = useGuidedLearningStore.getState().snapshot;
      if (guided || guidedTtsQuarantineRef.current) {
        const lease = guidedRoleAudioRef.current;
        const g = guided?.guided;
        if (useGuidedLearningStore.getState().error || isGuidedTerminal(guided) || !g || !lease
          || guideAudioRef.current?.playbackId !== lease.playbackId
          || lease.sessionId !== guided.sessionId || lease.nodeId !== g.nodeId || lease.attemptId !== g.attemptId
          || data.guidedSessionId !== lease.sessionId || data.guidedNodeId !== lease.nodeId
          || data.guidedAttemptId !== lease.attemptId || data.guidedPlaybackId !== lease.playbackId) return false;
      }
      else if (data.guidedSessionId !== undefined) return false;
      return true;
  }, []);

  const handleTtsChunk = useCallback(
    (data: SocketMessage) => {
      if (!canAcceptGuidedRoleEvent(data)) return;
      if (guideAudioRef.current && guideAudioRef.current.playbackId !== guidedRoleAudioRef.current?.playbackId) return;
      if (!canPlayConversationTts(translatorTtsGateRef.current)) return;
      bindActiveGenerationToPendingUser(data);
      if (!isCurrentGeneration(data)) return;
      if (roleRef.current === 'viewer') return;

      const chunk: TtsAudioChunk = {
        content: data.content ?? '',
        generationId: getGenerationId(data) ?? undefined,
        responseId: data.response_id,
        segmentId: data.segment_id,
        sampleRate: data.sample_rate,
        seq: data.seq,
      };

      if (!useStore.getState().isPlaying && socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({ type: 'tts_start' }));
      }

      useStore.getState().setThinking(false);
      ttsPlaybackGenerationIdRef.current = getGenerationId(data);
      playPcmChunk(chunk);
    },
    [bindActiveGenerationToPendingUser, canAcceptGuidedRoleEvent, getGenerationId, isCurrentGeneration, playPcmChunk],
  );

  const handlePartialAssistantAnswer = useCallback(
    (data: SocketMessage) => {
      if (!canAcceptGuidedRoleEvent(data)) return;
      bindActiveGenerationToPendingUser(data);
      if (!isCurrentGeneration(data)) return;
      if (shouldIgnorePartialAssistantAnswer(
        getGenerationId(data),
        finalizedAssistantGenerationIdsRef.current,
      )) return;

      const rawText = data.content ?? '';
      const { emotion, displayMessage } = parseTaggedEmotion(rawText);
      useStore.getState().setThinking(false);
      useStore.getState().setEmotion(emotion);
      useStore.getState().setPartialMessage(displayMessage);
    },
    [bindActiveGenerationToPendingUser, canAcceptGuidedRoleEvent, getGenerationId, isCurrentGeneration],
  );

  const handleFinalAssistantAnswer = useCallback(
    (data: SocketMessage) => {
      if (!canAcceptGuidedRoleEvent(data)) return;
      bindActiveGenerationToPendingUser(data);
      if (!isCurrentGeneration(data)) return;

      const rawText = data.content ?? '';
      const generationId = getGenerationId(data);
      if (generationId) finalizedAssistantGenerationIdsRef.current.add(generationId);
      const { emotion, displayMessage } = parseTaggedEmotion(rawText);
      const turnId = getTurnId(data) ?? undefined;
      // Guided ROLE lines belong to the lesson screen; keeping them out of the
      // chat timeline stops them from reappearing after the free-talk handoff.
      if (data.guidedSessionId === undefined) addMessage(
        'assistant',
        formatAssistantDisplayMessage(displayMessage, data.korean_content),
        turnId,
        undefined,
        getMessageMetadata(data),
      );
      useStore.getState().setPartialMessage('');
      useStore.getState().setEmotion(emotion);
      if (data.isOpening) {
        setConversationStartStatus('idle');
      }
    },
    [
      addMessage,
      bindActiveGenerationToPendingUser,
      canAcceptGuidedRoleEvent,
      getGenerationId,
      getMessageMetadata,
      getTurnId,
      isCurrentGeneration,
      setConversationStartStatus,
    ],
  );

  const handleAssistantTranslation = useCallback(
    (data: SocketMessage) => {
      const korean = sanitizeModelText(data.content ?? '');
      if (!korean) return;
      const content = `${KOREAN_INTERPRETATION_LABEL} ${korean}`;
      const turnId = getTurnId(data);
      if (turnId) {
        appendToAssistantMessage(turnId, content);
      } else if (isCurrentGeneration(data)) {
        appendToLastAssistantMessage(content);
      }
    },
    [appendToAssistantMessage, appendToLastAssistantMessage, getTurnId, isCurrentGeneration],
  );

  const handleAssistantReplySuggestions = useCallback(
    (data: SocketMessage) => {
      const suggestions = normalizeReplySuggestions(data);
      if (suggestions.length === 0) return;
      const turnId = getTurnId(data);
      if (turnId) {
        setAssistantSuggestions(turnId, suggestions);
      } else if (isCurrentGeneration(data)) {
        setLastAssistantSuggestions(suggestions);
      }
    },
    [getTurnId, isCurrentGeneration, setAssistantSuggestions, setLastAssistantSuggestions],
  );

  const handleTurnEvaluation = useCallback(
    (data: SocketMessage) => {
      const turnId = getTurnId(data);
      if (!turnId || !data.evaluation) return;
      setTurnEvaluation(turnId, data.evaluation);
    },
    [getTurnId, setTurnEvaluation],
  );

  const handleTurnCorrection = useCallback(
    (data: SocketMessage) => {
      const turnId = getTurnId(data);
      if (!turnId || !data.correction) return;
      setTurnCorrection(turnId, data.correction);
    },
    [getTurnId, setTurnCorrection],
  );

  const handleTurnCorrectionError = useCallback(
    (data: SocketMessage) => {
      const turnId = getTurnId(data);
      if (!turnId) return;
      setTurnCorrectionUnavailable(turnId, data.code ?? 'provider_error');
      console.warn('Turn correction unavailable:', data.code ?? 'provider_error');
    },
    [getTurnId, setTurnCorrectionUnavailable],
  );

  const handleTurnCorrectionSkipped = useCallback(
    (data: SocketMessage) => {
      const turnId = getTurnId(data);
      if (!turnId) return;
      bindActiveGenerationToPendingUser(data);
      setTurnCorrectionSkipped(turnId, data.reason ?? 'policy_skip');
    },
    [bindActiveGenerationToPendingUser, getTurnId, setTurnCorrectionSkipped],
  );

  const handleTurnEvaluationError = useCallback(
    (data: SocketMessage) => {
      const turnId = getTurnId(data);
      if (!turnId) return;
      setTurnEvaluationUnavailable(turnId, data.code ?? 'provider_error');
      console.warn('Turn evaluation unavailable:', data.code ?? 'provider_error');
    },
    [getTurnId, setTurnEvaluationUnavailable],
  );

  const handleTurnEvaluationSkipped = useCallback(
    (data: SocketMessage) => {
      const turnId = getTurnId(data);
      if (!turnId) return;
      bindActiveGenerationToPendingUser(data);
      setTurnEvaluationSkipped(turnId, data.reason ?? 'policy_skip');
    },
    [bindActiveGenerationToPendingUser, getTurnId, setTurnEvaluationSkipped],
  );

  const handleEvaluationBatchStatus = useCallback(
    (data: SocketMessage) => {
      setEvaluationBatchStatus({
        pendingCount: Number(data.pendingCount ?? 0),
        inFlightCount: Number(data.inFlightCount ?? 0),
        phase: data.phase,
        revision: data.revision,
        sessionEpoch: data.sessionEpoch,
        maxTurns: Number(data.maxTurns ?? 1),
        delaySeconds: Number(data.delaySeconds ?? 0),
        nextFlushAtEpochMs: data.nextFlushAtEpochMs ?? null,
        serverEpochMs: data.serverEpochMs ?? null,
      });
    },
    [setEvaluationBatchStatus],
  );

  const getSupplementaryEventKey = useCallback((data: SocketMessage): string => {
    const generationId = data.turnId ?? getGenerationId(data) ?? 'none';
    const payloadKey = data.code ?? data.reason ?? data.content ?? JSON.stringify(data.suggestions ?? data.evaluation ?? data.correction ?? '');
    return `${data.type}:${generationId}:${payloadKey}`;
  }, [getGenerationId]);

  const wasSupplementaryResultApplied = useCallback((data: SocketMessage): boolean => {
    const turnId = getTurnId(data);
    if (!turnId) return false;
    const messages = useStore.getState().messages;

    if (data.type === 'assistant_translation') {
      const korean = sanitizeModelText(data.content ?? '');
      return Boolean(korean && messages.some((message) => (
        message.role === 'assistant'
        && message.id === turnId
        && message.content.includes(korean)
      )));
    }
    if (data.type === 'assistant_reply_suggestions') {
      const suggestions = normalizeReplySuggestions(data);
      return suggestions.length > 0 && messages.some((message) => (
        message.role === 'assistant'
        && message.id === turnId
        && suggestions.every((suggestion) => message.suggestions?.includes(suggestion))
      ));
    }

    const message = messages.find((candidate) => candidate.role === 'user' && candidate.id === turnId);
    if (!message) return false;
    if (data.type.startsWith('turn_correction')) {
      return Boolean(message.correction) || Boolean(message.correctionStatus && message.correctionStatus !== 'pending');
    }
    if (data.type.startsWith('turn_evaluation')) {
      return Boolean(message.evaluation) || Boolean(message.evaluationStatus && message.evaluationStatus !== 'pending');
    }
    return false;
  }, [getTurnId]);

  const handleSupplementaryHttpMessage = useCallback(
    (data: SocketMessage): boolean => {
      const key = getSupplementaryEventKey(data);
      if (processedSupplementaryKeysRef.current.has(key)) return true;

      switch (data.type) {
        case 'assistant_translation':
          handleAssistantTranslation(data);
          break;
        case 'assistant_reply_suggestions':
          handleAssistantReplySuggestions(data);
          break;
        case 'turn_evaluation':
          handleTurnEvaluation(data);
          break;
        case 'turn_correction':
          handleTurnCorrection(data);
          break;
        case 'turn_correction_skipped':
          handleTurnCorrectionSkipped(data);
          break;
        case 'turn_correction_error':
          handleTurnCorrectionError(data);
          break;
        case 'turn_evaluation_skipped':
          handleTurnEvaluationSkipped(data);
          break;
        case 'turn_evaluation_error':
          handleTurnEvaluationError(data);
          break;
        default:
          return false;
      }

      const applied = wasSupplementaryResultApplied(data);
      if (applied) {
        processedSupplementaryKeysRef.current.add(key);
      }
      return applied;
    },
    [
      getSupplementaryEventKey,
      handleAssistantReplySuggestions,
      handleAssistantTranslation,
      handleTurnCorrection,
      handleTurnCorrectionError,
      handleTurnCorrectionSkipped,
      handleTurnEvaluation,
      handleTurnEvaluationError,
      handleTurnEvaluationSkipped,
      wasSupplementaryResultApplied,
    ],
  );

  const fetchSupplementaryTurnResults = useCallback(
    async (
      generationId?: string,
      options: SupplementaryFetchOptions = {},
    ): Promise<boolean> => {
      const response = await fetchWithTimeout(
        getTurnResultsUrl(generationId, options.expectedClientTurnId),
        { cache: 'no-store', signal: options.signal },
      );
      if (!response.ok) return false;

      const payload = (await response.json()) as TurnResultsResponse;
      if (options.shouldApply && !options.shouldApply()) return false;
      (payload.results ?? []).forEach(handleSupplementaryHttpMessage);
      if (payload.evaluationBatchStatus) {
        handleEvaluationBatchStatus(payload.evaluationBatchStatus);
      }
      if (
        options.replayedMessageKeys
        && isEvaluationBatchIdle(payload.evaluationBatchStatus)
        && options.replaySequence === sessionReplaySequenceRef.current
        && !isReplayingSessionRef.current
      ) {
        reconcileSessionReplayPendingEvaluations(options.replayedMessageKeys);
      }

      if (!generationId) return false;
      const clientTurnId = options.expectedClientTurnId
        ?? backendTurnIdToClientTurnIdRef.current.get(generationId)
        ?? generationId;
      const message = useStore.getState().messages.find((candidate) => (
        candidate.role === 'user' && candidate.id === clientTurnId
      ));
      return Boolean(message?.evaluationStatus && message.evaluationStatus !== 'pending');
    },
    [
      handleEvaluationBatchStatus,
      handleSupplementaryHttpMessage,
      reconcileSessionReplayPendingEvaluations,
    ],
  );

  const scheduleSupplementaryPolling = useCallback(
    (generationId: string | null, clientTurnId?: string | null) => {
      if (!generationId || typeof window === 'undefined') return;
      if (isReplayingSessionRef.current) return;
      const pollKey = clientTurnId
        ?? backendTurnIdToClientTurnIdRef.current.get(generationId)
        ?? generationId;
      if (supplementaryPollsRef.current.has(pollKey)) return;

      supplementaryPollsRef.current.forEach((state, key) => {
        if (state.generationId !== generationId || key === pollKey) return;
        state.abortController?.abort();
        if (state.timeoutId !== null) window.clearTimeout(state.timeoutId);
        supplementaryPollsRef.current.delete(key);
      });

      const pollState: SupplementaryPollState = {
        abortController: null,
        attempt: 0,
        clientTurnId: pollKey,
        generationId,
        startedAtEpochMs: Date.now(),
        timeoutId: null,
      };
      supplementaryPollsRef.current.set(pollKey, pollState);

      const poll = async () => {
        if (!isCurrentSupplementaryPoll(supplementaryPollsRef.current, pollKey, pollState)) return;

        let terminal = false;
        const requestController = new AbortController();
        pollState.abortController = requestController;
        try {
          terminal = await fetchSupplementaryTurnResults(generationId, {
            expectedClientTurnId: pollState.clientTurnId,
            shouldApply: () => isCurrentSupplementaryPoll(
              supplementaryPollsRef.current,
              pollKey,
              pollState,
            ),
            signal: requestController.signal,
          });
        } catch (error) {
          if (!requestController.signal.aborted) {
            console.warn('Could not fetch turn results:', error);
          }
        } finally {
          if (pollState.abortController === requestController) {
            pollState.abortController = null;
          }
        }

        if (!isCurrentSupplementaryPoll(supplementaryPollsRef.current, pollKey, pollState)) return;

        const timedOut = Date.now() - pollState.startedAtEpochMs >= SUPPLEMENTARY_POLL_MAX_DURATION_MS;
        if (terminal || timedOut) {
          if (timedOut) {
            const message = useStore.getState().messages.find((candidate) => (
              candidate.role === 'user' && candidate.id === pollState.clientTurnId
            ));
            if (message?.evaluationStatus === 'pending') {
              useStore.getState().setTurnEvaluationUnavailable(
                pollState.clientTurnId,
                'supplementary_poll_timeout',
              );
            }
          }
          if (isCurrentSupplementaryPoll(supplementaryPollsRef.current, pollKey, pollState)) {
            supplementaryPollsRef.current.delete(pollKey);
          }
          return;
        }

        const delay = getSupplementaryPollDelayMs(pollState.attempt);
        pollState.attempt += 1;
        pollState.timeoutId = window.setTimeout(() => {
          pollState.timeoutId = null;
          void poll();
        }, delay);
      };

      void poll();
    },
    [fetchSupplementaryTurnResults],
  );

  const handleSegmentStart = useCallback(
    (data: SocketMessage) => {
      if (!canAcceptGuidedRoleEvent(data)) return;
      if (!isCurrentGeneration(data)) return;
      if (!data.segment_id || !data.response_id) return;
      if (data.text?.trim()) {
        activeSpeechTextRef.current = `${activeSpeechTextRef.current} ${data.text}`.trim();
      }
      upsertTtsSegment({
        responseId: data.response_id,
        segmentId: data.segment_id,
        sampleRate: data.sample_rate ?? 48000,
        text: data.text,
        emotion: data.emotion ? EMOTION_TAG_MAP[data.emotion] ?? 'neutral' : undefined,
      });
    },
    [canAcceptGuidedRoleEvent, isCurrentGeneration, upsertTtsSegment],
  );

  const handleSegmentTimeline = useCallback(
    (data: SocketMessage) => {
      if (!canAcceptGuidedRoleEvent(data)) return;
      if (!isCurrentGeneration(data)) return;
      const timeline = data.timeline;
      if (!timeline?.segmentId) return;
      patchTtsSegment(timeline.segmentId, {
        timeline,
        responseId: timeline.responseId,
        segmentId: timeline.segmentId,
        sampleRate: timeline.sampleRate,
      });
      setLipSyncMode('timeline');
    },
    [canAcceptGuidedRoleEvent, isCurrentGeneration, patchTtsSegment, setLipSyncMode],
  );

  const handleSegmentEnd = useCallback(
    (data: SocketMessage) => {
      if (!canAcceptGuidedRoleEvent(data)) return;
      if (!isCurrentGeneration(data)) return;
      if (!data.segment_id) return;
      patchTtsSegment(data.segment_id, {});
    },
    [canAcceptGuidedRoleEvent, isCurrentGeneration, patchTtsSegment],
  );

  const connect = useCallback((options?: ConnectOptions) => {
    if (isConnecting.current || isDisconnecting.current) return;
    if (socketRef.current?.readyState === WebSocket.OPEN) return;

    const role = options?.role ?? 'controller';
    const shouldStartRecording = options?.startRecording ?? role === 'controller';
    roleRef.current = role;

    isConnecting.current = true;
    isSttCaptureReadyRef.current = false;
    isServerSttReadyRef.current = false;
    setConnecting(true);
    setSttReady(false);

    const ws = new WebSocket(getConfiguredWsUrl(role));

    ws.onopen = () => {
      isConnecting.current = false;
      setConnected(true);
      setSocket(ws);
      if (shouldStartRecording) {
        void startSttCapture().then((result) => {
          if (result !== 'failed') return;
          pendingTopicStartRef.current = null;
          pendingResumeSegmentRef.current = null;
          setConversationStartStatus(
            'error',
            '마이크를 시작하지 못했습니다. 브라우저 마이크 권한과 입력 장치를 확인해 주세요.',
          );
        }).catch(() => {
          pendingTopicStartRef.current = null;
          pendingResumeSegmentRef.current = null;
          setConversationStartStatus(
            'error',
            '마이크를 시작하지 못했습니다. 브라우저 마이크 권한과 입력 장치를 확인해 주세요.',
          );
        });
      } else {
        setConnecting(false);
      }

      const currentVoice = useStore.getState().voice;
      ws.send(JSON.stringify({ type: 'set_voice', voice: currentVoice }));

      if (TEXT_ONLY_TEST_MODE) {
        const pendingTopic = pendingTopicStartRef.current;
        if (pendingTopic && !pendingTopic.sent) {
          pendingTopic.sent = true;
          ws.send(JSON.stringify(buildStartConversationMessage(pendingTopic)));
        }
        const pendingSegmentId = pendingResumeSegmentRef.current;
        if (pendingSegmentId) {
          pendingResumeSegmentRef.current = null;
          ws.send(JSON.stringify({
            type: 'resume_conversation',
            segmentId: pendingSegmentId,
          }));
        }
      }
    };

    ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data) as SocketMessage;

        if (!shouldProcessEventSeq(data, seenEventSeqsRef.current, eventSeqOrderRef.current)) {
          return;
        }

        switch (data.type) {
          case 'mission_guide_audio_released': {
            const pending = data.playbackId ? guideReleaseRequestsRef.current.get(data.playbackId) : undefined;
            if (pending && pending.sessionId === data.sessionId && data.playbackId) {
              window.clearTimeout(pending.timer); guideReleaseRequestsRef.current.delete(data.playbackId);
              pending.settle(data.accepted === true);
            }
            break;
          }
          case 'mission_guide_audio_ready': {
            const request = data.playbackId ? guideAudioRequestsRef.current.get(data.playbackId) : undefined;
            if (request && data.playbackId) {
              window.clearTimeout(request.timer);
              guideAudioRequestsRef.current.delete(data.playbackId);
              request.settle(data.accepted === true);
            }
            break;
          }
          case 'mission_guide_audio':
            await handleMissionGuideAudio(data);
            break;
          case 'session_replay_start':
            isReplayingSessionRef.current = true;
            sessionReplaySequenceRef.current += 1;
            clearSupplementaryPolling();
            processedSupplementaryKeysRef.current.clear();
            finalizedAssistantGenerationIdsRef.current.clear();
            beginSessionReplay();
            activeGenerationIdRef.current = null;
            backendTurnIdToClientTurnIdRef.current.clear();
            seenEventSeqsRef.current.clear();
            eventSeqOrderRef.current = [];
            useStore.getState().setPartialMessage('');
            useStore.getState().setThinking(false);
            break;
          case 'session_replay_end': {
            isReplayingSessionRef.current = false;
            const replaySequence = sessionReplaySequenceRef.current;
            const replayedMessageKeys = [...useStore.getState().sessionReplayMessageKeys];
            finishSessionReplay();
            fetchSupplementaryTurnResults(undefined, {
              replayedMessageKeys,
              replaySequence,
            }).catch((error) => {
              console.warn('Could not restore replayed turn results:', error);
            });
            break;
          }
          case 'kiosk_session_ready':
            if (typeof data.sessionEpoch === 'number') {
              useLearningStore.getState().setSessionEpoch(data.sessionEpoch);
              const pendingLearning = pendingLearningMessageRef.current;
              if (pendingLearning) {
                pendingLearningMessageRef.current = null;
                sendLearningMessage({ ...pendingLearning, sessionEpoch: data.sessionEpoch });
              }
            }
            break;
          case 'learning_state':
            if (learningCommandTimeoutRef.current) clearTimeout(learningCommandTimeoutRef.current);
            learningCommandTimeoutRef.current = null;
            if (role === 'controller' && useLearningStore.getState().snapshot?.activeAttempt && !data.activeAttempt) {
              if (learningAttemptTimeoutRef.current) clearTimeout(learningAttemptTimeoutRef.current);
              learningAttemptTimeoutRef.current = null;
              void stopSttCapture();
              learningPurposeRef.current = null;
            }
            useLearningStore.getState().setSnapshot(data as unknown as LearningSnapshot);
            break;
          case 'learning_partial_transcript':
            useLearningStore.getState().setPartialTranscript(data.content ?? '');
            break;
          case 'learning_attempt_ready':
            if (learningCommandTimeoutRef.current) clearTimeout(learningCommandTimeoutRef.current);
            learningCommandTimeoutRef.current = null;
            useLearningStore.getState().setCommandPending(false);
            break;
          case 'learning_attempt_received':
            if (learningCommandTimeoutRef.current) clearTimeout(learningCommandTimeoutRef.current);
            learningCommandTimeoutRef.current = null;
            if (learningAttemptTimeoutRef.current) clearTimeout(learningAttemptTimeoutRef.current);
            learningAttemptTimeoutRef.current = null;
            useLearningStore.getState().setCommandPending(false);
            if (role === 'controller') void stopSttCapture();
            learningPurposeRef.current = null;
            break;
          case 'learning_error':
            if (learningCommandTimeoutRef.current) clearTimeout(learningCommandTimeoutRef.current);
            learningCommandTimeoutRef.current = null;
            if (learningAttemptTimeoutRef.current) clearTimeout(learningAttemptTimeoutRef.current);
            learningAttemptTimeoutRef.current = null;
            if (data.snapshot) useLearningStore.getState().setSnapshot(data.snapshot);
            useLearningStore.getState().setError(data.content ?? '학습 요청을 처리하지 못했습니다.');
            if (role === 'controller' && learningPurposeRef.current) void stopSttCapture();
            learningPurposeRef.current = null;
            break;
          case 'learning_mission_state':
            if ((data as Record<string, unknown>).contractVersion !== undefined && (data as Record<string, unknown>).contractVersion !== 1) {
              const previousGuided = useGuidedLearningStore.getState().snapshot;
              if (useGuidedLearningStore.getState().pushSnapshot(data)) {
                guidedTtsQuarantineRef.current = true;
                const snapshot = useGuidedLearningStore.getState().snapshot;
                // A new step or attempt discards whatever the previous one queued,
                // even when its ROLE lease was already released.
                if (role === 'controller' && previousGuided && !isGuidedTerminal(previousGuided)
                  && (previousGuided.sessionId !== snapshot?.sessionId || previousGuided.guided?.nodeId !== snapshot?.guided?.nodeId
                    || previousGuided.guided?.attemptId !== snapshot?.guided?.attemptId)) flushActiveTts();
                if (guidedHandoffRef.current && (snapshot?.sessionId !== guidedHandoffRef.current.sessionId
                  || snapshot.handoff?.status === 'FAILED'
                  || isGuidedTerminal(snapshot) && snapshot.handoff?.status !== 'COMPLETE')) guidedHandoffRef.current = null;
                const lease = guidedRoleAudioRef.current;
                if (lease && (snapshot?.sessionId !== lease.sessionId || snapshot?.guided?.nodeId !== lease.nodeId
                  || snapshot?.guided?.attemptId !== lease.attemptId)) flushActiveTts();
              }
              {
                const state = useGuidedLearningStore.getState();
                const snapshot = state.snapshot;
                const grant = snapshot?.handoff;
                if (!state.error && role === 'controller' && snapshot && grant && ['PREPARED', 'STARTING'].includes(grant.status)
                  && (guidedHandoffRef.current?.id !== grant.id || guidedHandoffRef.current.socket !== ws)) {
                  guidedHandoffRef.current = { sessionId: snapshot.sessionId, id: grant.id, socket: ws };
                  ws.send(JSON.stringify({ type: 'consume_guided_handoff', sessionId: snapshot.sessionId, handoffId: grant.id }));
                }
                if (role === 'viewer' && snapshot && grant?.status === 'COMPLETE' && isGuidedTerminal(snapshot)) {
                  guidedTtsQuarantineRef.current = false;
                  state.reconcileHome(null);
                }
              }
              break;
            }
            if (typeof (data as Record<string, unknown>).sessionId === 'string'
              && typeof (data as Record<string, unknown>).revision === 'number') {
              useMissionLearningStore.getState().pushSnapshot(data as unknown as MissionSnapshot);
            }
            break;
          case 'guided_role_audio': {
            useGuidedLearningStore.getState().receiveRoleAudio(data as Record<string, unknown>);
            if (roleRef.current !== 'controller' || typeof data.playbackId !== 'string') break;
            const message = data as Record<string, unknown>;
            if (message.active === false) {
              if (guidedRoleAudioRef.current?.playbackId === data.playbackId) guidedRoleAudioRef.current = null;
            } else if (message.generationComplete === true && guidedRoleAudioRef.current?.playbackId === data.playbackId) {
              if (message.synthesisSucceeded !== true) { flushActiveTts(); break; }
              guidedRoleAudioRef.current.generationComplete = true;
              if (!useStore.getState().isPlaying) notifyTtsPlaybackStopped();
            } else if (message.active === true) {
              const snapshot = useGuidedLearningStore.getState().snapshot;
              const g = snapshot?.guided;
              if (!snapshot || !g || snapshot.sessionId !== data.sessionId || g.nodeId !== data.nodeId
                || g.attemptId !== data.attemptId) break;
              activeGenerationIdRef.current = null;
              guidedRoleAudioRef.current = { sessionId: data.sessionId!, nodeId: data.nodeId!, attemptId: data.attemptId!, playbackId: data.playbackId, generationComplete: false };
            }
            break;
          }
          case 'guided_partial_transcript':
            useGuidedLearningStore.getState().receivePartial(data as unknown as Record<string, unknown>);
            break;
          case 'guided_capture_status':
            useGuidedLearningStore.getState().receiveCaptureStatus(data as unknown as Record<string, unknown>);
            break;
          case 'guided_voice_ready': {
            if (roleRef.current === 'controller' && typeof (data as Record<string, unknown>).sessionId === 'string') {
              if (typeof data.captureEpoch === 'number' && Number.isSafeInteger(data.captureEpoch) && data.captureEpoch >= 0) {
                sttCaptureSessionIdRef.current = Math.max(sttCaptureSessionIdRef.current, data.captureEpoch);
              }
              useGuidedLearningStore.getState().acknowledgeVoice((data as Record<string, unknown>).sessionId as string);
            }
            break;
          }
          case 'learning_mission_entry': {
            const entry = parseMissionEntry(data as Record<string, unknown>);
            if (entry) useMissionLearningStore.getState().setEntry(entry);
            break;
          }
          case 'learning_mission_error':
            console.warn('[MissionLearning]', data.code, data.content);
            break;
          case 'conversation_state':
            if (data.learningSessionId && Array.isArray(data.segments)) {
              setConversationState(
                data.learningSessionId,
                data.segments,
                data.activeSegmentId ?? null,
              );
            }
            break;
          case 'conversation_started':
            if (typeof data.requestId === 'string' && data.requestId === completedGuidedHandoffRequestRef.current) break;
            if (guidedHandoffRef.current) {
              if (data.requestId !== guidedHandoffRef.current.id) break;
              const resumeMicrophone = role === 'controller' && !guidedMicRef.current?.manualStop;
              completedGuidedHandoffRequestRef.current = guidedHandoffRef.current.id;
              completedGuidedHandoffRef.current = guidedHandoffRef.current.sessionId;
              guidedHandoffRef.current = null;
              guidedTtsQuarantineRef.current = false;
              guidedMicRef.current = null;
              useGuidedLearningStore.getState().reconcileHome(null);
              // The server reset learning capture before opening free talk.
              // Only this exact grant ACK authorizes a fresh microphone start.
              if (resumeMicrophone) void startSttCapture();
            }
            if (guidedFreeTalkRequestedRef.current && isGuidedTerminal(useGuidedLearningStore.getState().snapshot)) {
              guidedFreeTalkRequestedRef.current = false; guidedTtsQuarantineRef.current = false;
              guidedMicRef.current = null;
              useGuidedLearningStore.getState().reconcileHome(null);
            }
            // A newly selected topic starts a fresh assistant generation. Clear
            // the previous generation binding so its opening TTS is accepted,
            // including when the learner switches topics without clearing history.
            activeGenerationIdRef.current = null;
            flushActiveTts();
            if (
              data.learningSessionId
              && data.segmentId
              && isTopicId(data.topicId)
              && data.label
              && data.mode
              && data.aiRole
              && data.userRole
              && data.scenarioId
              && data.scenarioTitle
              && data.openingLine
              && isDifficultyId(data.difficultyId)
              && data.difficultyLabel
              && typeof data.difficultyPolicyVersion === 'number'
              && typeof data.sequence === 'number'
              && typeof data.occurrence === 'number'
              && data.status
              && data.startedAt
            ) {
              upsertTopicSegment({
                segmentId: data.segmentId,
                topicId: data.topicId,
                label: data.label,
                mode: data.mode,
                aiRole: data.aiRole,
                userRole: data.userRole,
                scenarioId: data.scenarioId,
                scenarioTitle: data.scenarioTitle,
                openingLine: data.openingLine,
                difficultyId: data.difficultyId,
                difficultyLabel: data.difficultyLabel,
                difficultyPolicyVersion: data.difficultyPolicyVersion,
                sequence: data.sequence,
                occurrence: data.occurrence,
                status: data.status,
                startedAt: data.startedAt,
                endedAt: data.endedAt,
              }, data.learningSessionId);
            }
            pendingTopicStartRef.current = null;
            setConversationStartStatus('opening');
            break;
          case 'conversation_start_error':
            pendingTopicStartRef.current = null;
            setConversationStartStatus(
              'error',
              data.content ?? '대화를 시작하지 못했습니다. 다시 시도해 주세요.',
            );
            break;
          case 'conversation_resumed':
            if (guidedFreeTalkRequestedRef.current && isGuidedTerminal(useGuidedLearningStore.getState().snapshot)) {
              guidedFreeTalkRequestedRef.current = false; guidedTtsQuarantineRef.current = false;
              guidedMicRef.current = null;
              useGuidedLearningStore.getState().reconcileHome(null);
            }
            pendingResumeSegmentRef.current = null;
            setConversationStartStatus('idle');
            break;
          case 'conversation_resume_error':
            pendingResumeSegmentRef.current = null;
            setConversationStartStatus(
              'error',
              data.content ?? '대화를 이어서 시작하지 못했습니다.',
            );
            break;
          case 'tts_segment_start':
            if (guideAudioRef.current && guideAudioRef.current.playbackId !== guidedRoleAudioRef.current?.playbackId) break;
            if (!canPlayConversationTts(translatorTtsGateRef.current)) break;
            handleSegmentStart(data);
            break;
          case 'tts_viseme_timeline':
            if (guideAudioRef.current && guideAudioRef.current.playbackId !== guidedRoleAudioRef.current?.playbackId) break;
            if (!canPlayConversationTts(translatorTtsGateRef.current)) break;
            handleSegmentTimeline(data);
            break;
          case 'tts_chunk':
            handleTtsChunk(data);
            break;
          case 'tts_segment_end':
            if (guideAudioRef.current && guideAudioRef.current.playbackId !== guidedRoleAudioRef.current?.playbackId) break;
            if (!canPlayConversationTts(translatorTtsGateRef.current)) break;
            handleSegmentEnd(data);
            break;
          case 'tts_flush':
            if (!canAcceptGuidedRoleEvent(data)) break;
            if (!isCurrentGeneration(data)) break;
            flushActiveTts(data.response_id);
            break;
          case 'partial_user_request':
            if (useGuidedLearningStore.getState().snapshot) break;
            useStore.getState().setLiveTranscript(sanitizeModelText(data.content ?? ''));
            break;
          case 'partial_assistant_answer':
            handlePartialAssistantAnswer(data);
            break;
          case 'final_user_request':
            // Guided observations arrive in the scoped snapshot, never through
            // the free-talk generation/history path (including delayed finals).
            if (useGuidedLearningStore.getState().snapshot || guidedTtsQuarantineRef.current) break;
            useStore.getState().setLiveTranscript('');
            const nextGenerationId = getGenerationId(data);
            // A final arriving before the capture reset finishes belongs to
            // the old/translator epoch. Keep it visible for diagnostics, but
            // never let it reopen conversation audio.
            translatorTtsGateRef.current = transitionTranslatorTtsGate(
              translatorTtsGateRef.current,
              'final-user-request',
            );
            activeGenerationIdRef.current = nextGenerationId;
            const clientTurnId = buildClientTurnId(
              activeGenerationIdRef.current,
              data.eventSeq,
              data.turnId,
            );
            if (activeGenerationIdRef.current && clientTurnId) {
              backendTurnIdToClientTurnIdRef.current.set(activeGenerationIdRef.current, clientTurnId);
            }
            setThinking(true);
            useStore.getState().setPartialMessage('');
            addFinalUserRequestMessage(
              addMessage,
              data.content ?? '',
              clientTurnId,
              data.speechEvidence,
              getMessageMetadata(data),
            );
            if (clientTurnId && abandonedEvaluationTurnIdsRef.current.has(clientTurnId)) {
              setTurnEvaluationSkipped(clientTurnId, 'mic_disconnected');
            } else if (clientTurnId && data.evaluation_policy === 'skip') {
              setTurnEvaluationSkipped(
                clientTurnId,
                data.evaluation_reason ?? 'policy_skip',
              );
            } else {
              queueLocalEvaluationBatchTurn(
                EVALUATION_BATCH_DELAY_SECONDS,
                EVALUATION_BATCH_MAX_TURNS,
                data.sessionEpoch,
              );
            }
            scheduleSupplementaryPolling(activeGenerationIdRef.current, clientTurnId);
            break;
          case 'final_assistant_answer':
            handleFinalAssistantAnswer(data);
            if (data.guidedSessionId === undefined) scheduleSupplementaryPolling(getGenerationId(data), getTurnId(data));
            break;
          case 'assistant_translation':
            handleSupplementaryHttpMessage(data);
            break;
          case 'assistant_reply_suggestions':
            handleSupplementaryHttpMessage(data);
            break;
          case 'turn_evaluation':
            handleSupplementaryHttpMessage(data);
            break;
          case 'turn_correction':
            handleSupplementaryHttpMessage(data);
            break;
          case 'turn_correction_skipped':
            handleSupplementaryHttpMessage(data);
            break;
          case 'turn_correction_error':
            handleSupplementaryHttpMessage(data);
            break;
          case 'turn_evaluation_skipped':
            handleSupplementaryHttpMessage(data);
            break;
          case 'turn_evaluation_error':
            handleSupplementaryHttpMessage(data);
            break;
          case 'evaluation_batch_status':
            handleEvaluationBatchStatus(data);
            break;
          case 'stt_provider_status':
            if (sttProviderRef.current === 'server') {
              isServerSttReadyRef.current = data.content === 'ready';
              const fullyReady = isSttInputReady(
                'server',
                isSttCaptureReadyRef.current,
                isServerSttReadyRef.current,
              );
              setSttReady(fullyReady);
              if (isSttCaptureReadyRef.current) publishGuidedCaptureStatus(fullyReady ? 'LISTENING' : 'PREPARING');
              if (isSttCaptureReadyRef.current) {
                setConnecting(!fullyReady);
              }
            }
            console.info('STT provider status:', data.content);
            break;
          case 'stt_provider_error':
            publishGuidedCaptureStatus('ERROR');
            if (sttProviderRef.current === 'server') {
              isServerSttReadyRef.current = false;
              setSttReady(false);
              setConnecting(false);
            }
            console.error('STT provider error:', data.content);
            break;
          case 'mute_tts':
            if (!canAcceptGuidedRoleEvent(data)) break;
            if (!shouldApplyTtsMute(
              data.generation_id,
              ttsPlaybackGenerationIdRef.current,
              useStore.getState().isPlaying,
            )) break;
            muteTts();
            break;
          case 'unmute_tts':
            if (!canAcceptGuidedRoleEvent(data)) break;
            if (!isTtsControlForCurrentGeneration(
              data.generation_id,
              ttsPlaybackGenerationIdRef.current,
            )) break;
            unmuteTts();
            break;
          case 'stop_tts':
          case 'tts_interruption':
            if (!canAcceptGuidedRoleEvent(data)) break;
            if (!isCurrentGeneration(data)) break;
            flushActiveTts(data.response_id);
            if (socketRef.current?.readyState === WebSocket.OPEN) {
              socketRef.current.send(JSON.stringify({ type: 'tts_stop' }));
            }
            break;
          default:
            break;
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    ws.onclose = () => {
      clearGuideAudioRequests();
      isConnecting.current = false;
      isSttCaptureReadyRef.current = false;
      isServerSttReadyRef.current = false;
      setConnecting(false);
      setConnected(false);
      setSttReady(false);
      setSocket(null);
      activeGenerationIdRef.current = null;
      if (pendingTopicStartRef.current || pendingResumeSegmentRef.current) {
        pendingTopicStartRef.current = null;
        pendingResumeSegmentRef.current = null;
        setConversationStartStatus('error', '서버 연결이 종료되었습니다. 다시 시도해 주세요.');
      }
      if (pendingLearningMessageRef.current || learningPurposeRef.current) {
        pendingLearningMessageRef.current = null;
        learningPurposeRef.current = null;
        useLearningStore.getState().setError('서버 연결이 종료되었습니다. 다시 연결해 주세요.');
      }
      useStore.getState().setLiveTranscript('');
      if (roleRef.current === 'controller') {
        discardPendingEvaluations();
      }
      flushActiveTts();
      void stopSttInput();
    };

    ws.onerror = (error) => {
      clearGuideAudioRequests();
      console.error('Voice Socket Error:', error);
      isConnecting.current = false;
      isSttCaptureReadyRef.current = false;
      isServerSttReadyRef.current = false;
      setConnecting(false);
      setConnected(false);
      setSttReady(false);
      setSocket(null);
      activeGenerationIdRef.current = null;
      if (pendingTopicStartRef.current || pendingResumeSegmentRef.current) {
        pendingTopicStartRef.current = null;
        pendingResumeSegmentRef.current = null;
        setConversationStartStatus('error', '서버에 연결하지 못했습니다. 다시 시도해 주세요.');
      }
      if (pendingLearningMessageRef.current || learningPurposeRef.current) {
        pendingLearningMessageRef.current = null;
        learningPurposeRef.current = null;
        useLearningStore.getState().setError('서버에 연결하지 못했습니다. 다시 시도해 주세요.');
      }
      clearSupplementaryPolling();
      clearEvaluationBatchStatus();
    };

    socketRef.current = ws;
  }, [
    addMessage,
    canAcceptGuidedRoleEvent,
    clearGuideAudioRequests,
    clearEvaluationBatchStatus,
    clearSupplementaryPolling,
    discardPendingEvaluations,
    flushActiveTts,
    fetchSupplementaryTurnResults,
    handleEvaluationBatchStatus,
    handleMissionGuideAudio,
    notifyTtsPlaybackStopped,
    publishGuidedCaptureStatus,
    handleFinalAssistantAnswer,
    handlePartialAssistantAnswer,
    handleSegmentEnd,
    handleSegmentStart,
    handleSegmentTimeline,
    handleTtsChunk,
    handleSupplementaryHttpMessage,
    getGenerationId,
    getMessageMetadata,
    getTurnId,
    isCurrentGeneration,
    muteTts,
    queueLocalEvaluationBatchTurn,
    scheduleSupplementaryPolling,
    sendLearningMessage,
    setConnected,
    setConnecting,
    setSttReady,
    setSocket,
    setThinking,
    setTurnEvaluationSkipped,
    setConversationState,
    setConversationStartStatus,
    upsertTopicSegment,
    beginSessionReplay,
    finishSessionReplay,
    startSttCapture,
    stopSttCapture,
    stopSttInput,
    unmuteTts,
  ]);

  const disconnect = useCallback(() => {
    if (isDisconnecting.current) return;
    isDisconnecting.current = true;
    if (learningAttemptTimeoutRef.current) clearTimeout(learningAttemptTimeoutRef.current);
    learningAttemptTimeoutRef.current = null;
    if (learningCommandTimeoutRef.current) clearTimeout(learningCommandTimeoutRef.current);
    learningCommandTimeoutRef.current = null;
    pendingLearningMessageRef.current = null;
    learningPurposeRef.current = null;
    clearGuideAudioRequests();
    cleanupSocket();
    activeGenerationIdRef.current = null;
    clearSupplementaryPolling();
    if (roleRef.current === 'controller') {
      discardPendingEvaluations();
    }
    flushActiveTts();
    isSttCaptureReadyRef.current = false;
    isServerSttReadyRef.current = false;
    setConnected(false);
    setSttReady(false);
    setSocket(null);
    useStore.getState().setLiveTranscript('');
    void stopSttInput();
    isDisconnecting.current = false;
  }, [cleanupSocket, clearGuideAudioRequests, clearSupplementaryPolling, discardPendingEvaluations, flushActiveTts, setConnected, setSocket, setSttReady, stopSttInput]);

  const startListening = useCallback(() => {
    const mic = guidedMicRef.current;
    if (mic && !mic.manualStop && (mic.active || mic.starting)) return;
    if (mic) mic.manualStop = false;
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      const operation = mic ? ++mic.operation : 0;
      if (mic) mic.starting = true;
      void startSttCapture().then(result => {
        if (mic && guidedMicRef.current === mic && mic.operation === operation) {
          mic.starting = false; mic.active = result === 'started';
        }
      }).catch(() => {
        if (mic && guidedMicRef.current === mic && mic.operation === operation) { mic.starting = false; mic.active = false; }
        publishGuidedCaptureStatus('ERROR');
      });
      return;
    }
    connect();
  }, [connect, publishGuidedCaptureStatus, startSttCapture]);

  const sendPendingTopicStart = useCallback(() => {
    const pending = pendingTopicStartRef.current;
    if (!pending || pending.sent) return;
    if (socketRef.current?.readyState !== WebSocket.OPEN) return;
    pending.sent = true;
    socketRef.current.send(JSON.stringify(buildStartConversationMessage(pending)));
  }, []);

  const startConversation = useCallback((topicId: TopicId, difficultyId: DifficultyId) => {
    guidedFreeTalkRequestedRef.current = isGuidedTerminal(useGuidedLearningStore.getState().snapshot);
    pendingResumeSegmentRef.current = null;
    const requestId = crypto.randomUUID();
    pendingTopicStartRef.current = {
      requestId,
      topicId,
      difficultyId,
      sent: false,
    };
    setConversationStartStatus('preparing');
    if (TEXT_ONLY_TEST_MODE) {
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        sendPendingTopicStart();
      } else {
        connect({ role: 'controller', startRecording: false });
      }
      return;
    }
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      void startSttCapture().then((result) => {
        if (result === 'superseded' || pendingTopicStartRef.current?.requestId !== requestId) return;
        if (result === 'started' && useStore.getState().isSttReady) {
          sendPendingTopicStart();
        } else {
          if (result !== 'failed') return;
          pendingTopicStartRef.current = null;
          setConversationStartStatus('error', '마이크를 시작하지 못했습니다. 브라우저 마이크 권한과 입력 장치를 확인해 주세요.');
        }
      }).catch(() => {
        if (pendingTopicStartRef.current?.requestId !== requestId) return;
        pendingTopicStartRef.current = null;
        setConversationStartStatus('error', '마이크를 시작하지 못했습니다. 브라우저 마이크 권한과 입력 장치를 확인해 주세요.');
      });
      return;
    }
    connect();
  }, [connect, sendPendingTopicStart, setConversationStartStatus, startSttCapture]);

  const sendPendingResume = useCallback(() => {
    const segmentId = pendingResumeSegmentRef.current;
    if (!segmentId || socketRef.current?.readyState !== WebSocket.OPEN) return;
    pendingResumeSegmentRef.current = null;
    socketRef.current.send(JSON.stringify({
      type: 'resume_conversation',
      segmentId,
    }));
  }, []);

  const resumeConversation = useCallback((segmentId: string) => {
    guidedFreeTalkRequestedRef.current = isGuidedTerminal(useGuidedLearningStore.getState().snapshot);
    pendingTopicStartRef.current = null;
    pendingResumeSegmentRef.current = segmentId;
    setConversationStartStatus('preparing');
    if (TEXT_ONLY_TEST_MODE) {
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        sendPendingResume();
      } else {
        connect({ role: 'controller', startRecording: false });
      }
      return;
    }
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      void startSttCapture().then((result) => {
        if (result === 'superseded' || pendingResumeSegmentRef.current !== segmentId) return;
        if (result === 'started' && useStore.getState().isSttReady) {
          sendPendingResume();
        } else {
          if (result !== 'failed') return;
          pendingResumeSegmentRef.current = null;
          setConversationStartStatus('error', '마이크를 시작하지 못했습니다. 브라우저 마이크 권한과 입력 장치를 확인해 주세요.');
        }
      }).catch(() => {
        if (pendingResumeSegmentRef.current !== segmentId) return;
        pendingResumeSegmentRef.current = null;
        setConversationStartStatus('error', '마이크를 시작하지 못했습니다. 브라우저 마이크 권한과 입력 장치를 확인해 주세요.');
      });
      return;
    }
    connect();
  }, [connect, sendPendingResume, setConversationStartStatus, startSttCapture]);

  const stopListening = useCallback(() => {
    const snapshot = useGuidedLearningStore.getState().snapshot;
    if (!guidedMicRef.current && snapshot) guidedMicRef.current = {
      sessionId: snapshot.sessionId, attemptId: snapshot.guided?.attemptId ?? '',
      active: false, starting: false, manualStop: true, operation: 0, retryConsumed: false,
    };
    const mic = guidedMicRef.current;
    if (mic) { mic.manualStop = true; mic.active = false; mic.starting = false; mic.operation++; }
    const operation = mic?.operation;
    const current = () => {
      const latest = useGuidedLearningStore.getState().snapshot;
      return latest?.sessionId === snapshot?.sessionId && latest?.guided?.attemptId === snapshot?.guided?.attemptId
        && guidedMicRef.current === mic && (!mic || mic.operation === operation && mic.manualStop);
    };
    if (guideAudioRef.current) guideAudioRef.current.shouldResume = false;
    useStore.getState().setLiveTranscript('');
    isSttCaptureReadyRef.current = false;
    setSttReady(false);
    void stopSttCapture().then(() => { if (current()) publishGuidedCaptureStatus('STOPPED'); })
      .catch(() => { if (current()) publishGuidedCaptureStatus('ERROR'); });
  }, [publishGuidedCaptureStatus, setSttReady, stopSttCapture]);

  const startGuidedLearningVoice = useCallback((sessionId: string, expectedRevision: number) => {
    if (socketRef.current?.readyState !== WebSocket.OPEN || roleRef.current !== 'controller') return false;
    activeGenerationIdRef.current = null;
    guidedTtsQuarantineRef.current = true; guidedFreeTalkRequestedRef.current = false;
    socketRef.current.send(JSON.stringify({ type: 'start_guided_learning_voice', sessionId, expectedRevision }));
    // Old ROLE cancellation also changes the server revision: enqueue it after binding.
    flushActiveTts();
    return true;
  }, [flushActiveTts]);

  const syncGuidedCapture = useCallback((active: boolean, sessionId: string, attemptId: string, resumeRequested = false) => {
      if (completedGuidedHandoffRef.current === sessionId) return;
    let state = guidedMicRef.current;
    const changedScope = !state || state.sessionId !== sessionId || state.attemptId !== attemptId;
    if (changedScope) {
      state = { sessionId, attemptId, active: false, starting: false,
        manualStop: state?.sessionId === sessionId ? state.manualStop : false, operation: 0, retryConsumed: false };
      guidedMicRef.current = state;
    }
    if (!state) return;
    if (resumeRequested && !state.retryConsumed) { state.manualStop = false; state.retryConsumed = true; }
    if (state.manualStop || guideAudioRef.current) active = false;
    if (!changedScope && (active ? state.active || state.starting : !state.active && !state.starting)) return;
    state.active = false;
    state.starting = active;
    const operation = ++state.operation;
    const current = () => guidedMicRef.current === state && state.operation === operation;
    const deadline = active ? window.setTimeout(() => {
      if (!current()) return;
      state.operation += 1; state.starting = false; state.active = false;
      sendSttCaptureState(false);
      void stopSttInput();
      publishGuidedCaptureStatus('ERROR');
    }, 8000) : null;
    guidedCaptureRef.current = null;
    void (async () => {
      try {
        await stopSttCapture();
        if (!current()) return;
        if (!active || state.manualStop || guideAudioRef.current) { state.starting = false; publishGuidedCaptureStatus('STOPPED'); return; }
        publishGuidedCaptureStatus('PREPARING');
        const result = await startSttCapture();
        if (!current()) return;
        state.starting = false;
        state.active = result === 'started';
        if (result === 'failed') publishGuidedCaptureStatus('ERROR');
      } catch {
        if (!current()) return;
        state.starting = false; state.active = false;
        publishGuidedCaptureStatus('ERROR');
      } finally { if (deadline !== null) window.clearTimeout(deadline); }
    })();
  }, [publishGuidedCaptureStatus, sendSttCaptureState, startSttCapture, stopSttCapture, stopSttInput]);

  const startLearningSession = useCallback((topicId: 'restaurant' | 'airport') => {
    const message = {
      type: 'start_learning_session', requestId: crypto.randomUUID(), topicId,
      sessionEpoch: useLearningStore.getState().sessionEpoch,
    };
    if (socketRef.current?.readyState === WebSocket.OPEN && useLearningStore.getState().sessionEpoch !== null) {
      sendLearningMessage(message);
    } else {
      pendingLearningMessageRef.current = message;
      connect({ role: 'controller', startRecording: false });
    }
  }, [connect, sendLearningMessage]);

  // Mission roleplay: open the microphone first, then let the server voice the avatar's opening.
  const startLearningRoleplay = useCallback((sessionId: string) => {
    const send = () => {
      if (socketRef.current?.readyState !== WebSocket.OPEN) return;
      // Like conversation_started in free talk: the opening is a new generation, so drop the
      // binding to the previous mission's last reply or its TTS chunks are ignored.
      activeGenerationIdRef.current = null;
      flushActiveTts();
      socketRef.current.send(JSON.stringify({ type: 'start_learning_roleplay', sessionId }));
    };
    if (TEXT_ONLY_TEST_MODE) {
      send();
      return;
    }
    void startSttCapture().then((result) => {
      if (result !== 'superseded') send();
    });
  }, [flushActiveTts, startSttCapture]);

  const learningCommand = useCallback((action: string, payload?: Record<string, unknown>) => {
    const state = useLearningStore.getState();
    if (!state.snapshot) return;
    const message = {
      type: 'learning_command', clientCommandId: crypto.randomUUID(),
      lessonSessionId: state.snapshot.lessonSessionId, expectedRevision: state.snapshot.revision,
      sessionEpoch: state.sessionEpoch, action, payload,
    };
    if (state.sessionEpoch === null || !sendLearningMessage(message)) {
      pendingLearningMessageRef.current = message;
      connect({ role: 'controller', startRecording: false });
    }
  }, [connect, sendLearningMessage]);

  const beginLearningAttempt = useCallback(async (purpose: AttemptPurpose) => {
    const state = useLearningStore.getState();
    if (!state.snapshot) return;
    if (socketRef.current?.readyState !== WebSocket.OPEN || state.sessionEpoch === null) {
      useLearningStore.getState().setError('서버 연결을 준비하고 있습니다. 잠시 후 다시 눌러 주세요.');
      connect({ role: 'controller', startRecording: false });
      return;
    }
    learningPurposeRef.current = purpose;
    useLearningStore.getState().setCommandPending(true);
    // WebSocket preserves message order: open the new capture epoch and bind
    // the attempt before MediaRecorder can emit its first binary frame.
    const captureEpoch = sendSttCaptureState(true);
    const attemptId = crypto.randomUUID();
    const sent = sendLearningMessage({
      type: 'begin_learning_attempt', clientCommandId: crypto.randomUUID(),
      lessonSessionId: state.snapshot.lessonSessionId, expectedRevision: state.snapshot.revision,
      sessionEpoch: state.sessionEpoch, captureEpoch,
      attemptId, purpose,
    });
    if (!sent) {
      sendSttCaptureState(false);
      useLearningStore.getState().setError('서버 연결이 끊어졌습니다. 다시 시도해 주세요.');
      return;
    }
    const started = await startSttInput({ requiredAudio: true });
    if (!started) {
      sendSttCaptureState(false);
      sendLearningMessage({
        type: 'cancel_learning_attempt', clientCommandId: crypto.randomUUID(),
        lessonSessionId: state.snapshot.lessonSessionId, attemptId,
        sessionEpoch: state.sessionEpoch,
      });
      useLearningStore.getState().setError('학습 녹음을 시작하지 못했습니다. 마이크를 확인해 주세요.');
      return;
    }
    if (learningAttemptTimeoutRef.current) clearTimeout(learningAttemptTimeoutRef.current);
    learningAttemptTimeoutRef.current = setTimeout(() => {
      sendSttCaptureState(false);
      sendLearningMessage({
        type: 'cancel_learning_attempt', clientCommandId: crypto.randomUUID(),
        lessonSessionId: state.snapshot?.lessonSessionId, attemptId,
        sessionEpoch: useLearningStore.getState().sessionEpoch,
      });
      useLearningStore.getState().setError('음성 입력 시간이 초과되었습니다. 한 문장씩 다시 말해 주세요.');
      learningAttemptTimeoutRef.current = null;
      learningPurposeRef.current = null;
    }, 15_000);
  }, [connect, sendLearningMessage, sendSttCaptureState, startSttInput]);

  const pauseConversationForUsageEnd = useCallback(() => {
    stopListening();
    flushActiveTts();
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'tts_stop' }));
    }
  }, [flushActiveTts, stopListening]);

  useEffect(() => {
    if (!isConnected || (!isSttReady && !TEXT_ONLY_TEST_MODE)) return;
    sendPendingTopicStart();
    sendPendingResume();
  }, [isConnected, isSttReady, sendPendingResume, sendPendingTopicStart]);

  useEffect(() => {
    disconnectRef.current = disconnect;
  }, [disconnect]);

  useEffect(() => {
    let previousVoice = useStore.getState().voice;
    const unsubscribe = useStore.subscribe((state) => {
      if (state.voice === previousVoice) return;
      previousVoice = state.voice;
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({ type: 'set_voice', voice: state.voice }));
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = useStore.subscribe((state, prevState) => {
      if (state.speed === prevState.speed) return;
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({ type: 'set_speed', speed: Math.round(state.speed * 100) }));
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => () => {
    disconnectRef.current();
  }, []);

  const resetConversation = useCallback((stopPlayback: boolean) => {
    if (stopPlayback) {
      flushActiveTts();
    }
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      if (stopPlayback) {
        socketRef.current.send(JSON.stringify({ type: 'tts_stop' }));
      }
      socketRef.current.send(JSON.stringify({ type: 'clear_history' }));
    } else if (typeof window !== 'undefined') {
      const ws = new WebSocket(getConfiguredWsUrl('controller'));
      ws.onopen = () => {
        if (stopPlayback) {
          ws.send(JSON.stringify({ type: 'tts_stop' }));
        }
        ws.send(JSON.stringify({ type: 'clear_history' }));
        window.setTimeout(() => ws.close(), 100);
      };
      ws.onerror = () => ws.close();
    }
    clearMessages();
    clearSupplementaryPolling();
    processedSupplementaryKeysRef.current.clear();
    finalizedAssistantGenerationIdsRef.current.clear();
    abandonedEvaluationTurnIdsRef.current.clear();
    activeGenerationIdRef.current = null;
    pendingTopicStartRef.current = null;
    pendingResumeSegmentRef.current = null;
    useStore.getState().setPartialMessage('');
  }, [clearMessages, clearSupplementaryPolling, flushActiveTts]);

  const clearHistory = useCallback(() => {
    resetConversation(false);
  }, [resetConversation]);

  const prepareForReservationIntro = useCallback(() => {
    stopListening();
    resetConversation(true);
  }, [resetConversation, stopListening]);

  return {
    connect,
    disconnect,
    startListening,
    startConversation,
    resumeConversation,
    stopListening,
    pauseConversationForUsageEnd,
    isConnected,
    isSttReady,
    isRecording,
    sttProvider,
    clearHistory,
    prepareForReservationIntro,
    startLearningSession,
    learningCommand,
    beginLearningAttempt,
    startLearningRoleplay,
    startGuidedLearningVoice,
    syncGuidedCapture,
    setMissionGuideAudio,
  };
}
