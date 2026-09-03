import { useCallback, useEffect, useRef } from 'react';
import {
  useStore,
  type ChatMessageMetadata,
  type TurnCorrection,
  type TurnEvaluation,
} from '@/stores/useStore';
import { useAudioPlayer } from './useAudioPlayer';
import { useSttAdapter } from './useSttAdapter';
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
}: {
  sendCaptureState: (active: boolean) => number;
  startInput: () => Promise<boolean | void>;
  getCurrentSessionId: () => number;
  getCurrentSocket: () => T;
}): Promise<SttCaptureStartResult> {
  const initiatingSocket = getCurrentSocket();
  const requestedSessionId = sendCaptureState(true);
  const requestIsCurrent = () => isCurrentSttCaptureRequest(
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
    if (socketRef.current?.readyState !== WebSocket.OPEN) return;
    socketRef.current.send(buildAudioPacket(pcmData, useStore.getState().isPlaying));
  }, []);

  const handleBrowserFinalTranscript = useCallback((transcript: BrowserFinalTranscript) => {
    useStore.getState().setLiveTranscript('');
    if (socketRef.current?.readyState !== WebSocket.OPEN) return;
    socketRef.current.send(buildBrowserTranscriptMessage(transcript));
  }, []);

  const handleBrowserInterimTranscript = useCallback((transcript: string) => {
    useStore.getState().setLiveTranscript(transcript);
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(buildBrowserPartialTranscriptMessage(transcript));
    }
  }, []);

  const handleBrowserSpeechStarted = useCallback(() => {
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
  }, [setConnecting, setSttReady]);

  const handleBrowserSttError = useCallback((code: string) => {
    console.error('Browser STT error:', code);
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

  const startSttCapture = useCallback(async () => {
    // The control message is placed on the WebSocket before MediaRecorder can
    // produce new binary frames. The backend completes its discard barrier
    // before reading those frames.
    const result = await startSttCaptureOperation({
      sendCaptureState: sendSttCaptureState,
      startInput: startSttInput,
      getCurrentSessionId: () => sttCaptureSessionIdRef.current,
      getCurrentSocket: () => socketRef.current,
    });
    if (result === 'started' && translatorTtsGateRef.current === 'waiting-next-turn') {
      translatorShouldResumeCaptureRef.current = false;
      translatorTtsGateRef.current = transitionTranslatorTtsGate(
        translatorTtsGateRef.current,
        'capture-boundary-ready',
      );
    }
    return result;
  }, [sendSttCaptureState, startSttInput]);

  const stopSttCapture = useCallback(async () => {
    // Close the backend epoch first so any final browser callback or trailing
    // PCM chunk emitted during local teardown is rejected.
    await stopSttCaptureOperation(sendSttCaptureState, stopSttInput);
  }, [sendSttCaptureState, stopSttInput]);

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

  const handleTtsChunk = useCallback(
    (data: SocketMessage) => {
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
    [bindActiveGenerationToPendingUser, getGenerationId, isCurrentGeneration, playPcmChunk],
  );

  const handlePartialAssistantAnswer = useCallback(
    (data: SocketMessage) => {
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
    [bindActiveGenerationToPendingUser, getGenerationId, isCurrentGeneration],
  );

  const handleFinalAssistantAnswer = useCallback(
    (data: SocketMessage) => {
      bindActiveGenerationToPendingUser(data);
      if (!isCurrentGeneration(data)) return;

      const rawText = data.content ?? '';
      const generationId = getGenerationId(data);
      if (generationId) finalizedAssistantGenerationIdsRef.current.add(generationId);
      const { emotion, displayMessage } = parseTaggedEmotion(rawText);
      const turnId = getTurnId(data) ?? undefined;
      addMessage(
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
    [isCurrentGeneration, upsertTtsSegment],
  );

  const handleSegmentTimeline = useCallback(
    (data: SocketMessage) => {
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
    [isCurrentGeneration, patchTtsSegment, setLipSyncMode],
  );

  const handleSegmentEnd = useCallback(
    (data: SocketMessage) => {
      if (!isCurrentGeneration(data)) return;
      if (!data.segment_id) return;
      patchTtsSegment(data.segment_id, {});
    },
    [isCurrentGeneration, patchTtsSegment],
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
            if (!canPlayConversationTts(translatorTtsGateRef.current)) break;
            handleSegmentStart(data);
            break;
          case 'tts_viseme_timeline':
            if (!canPlayConversationTts(translatorTtsGateRef.current)) break;
            handleSegmentTimeline(data);
            break;
          case 'tts_chunk':
            handleTtsChunk(data);
            break;
          case 'tts_segment_end':
            if (!canPlayConversationTts(translatorTtsGateRef.current)) break;
            handleSegmentEnd(data);
            break;
          case 'tts_flush':
            if (!isCurrentGeneration(data)) break;
            flushActiveTts(data.response_id);
            break;
          case 'partial_user_request':
            useStore.getState().setLiveTranscript(sanitizeModelText(data.content ?? ''));
            break;
          case 'partial_assistant_answer':
            handlePartialAssistantAnswer(data);
            break;
          case 'final_user_request':
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
            scheduleSupplementaryPolling(getGenerationId(data), getTurnId(data));
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
              if (isSttCaptureReadyRef.current) {
                setConnecting(!fullyReady);
              }
            }
            console.info('STT provider status:', data.content);
            break;
          case 'stt_provider_error':
            if (sttProviderRef.current === 'server') {
              isServerSttReadyRef.current = false;
              setSttReady(false);
              setConnecting(false);
            }
            console.error('STT provider error:', data.content);
            break;
          case 'mute_tts':
            if (!shouldApplyTtsMute(
              data.generation_id,
              ttsPlaybackGenerationIdRef.current,
              useStore.getState().isPlaying,
            )) break;
            muteTts();
            break;
          case 'unmute_tts':
            if (!isTtsControlForCurrentGeneration(
              data.generation_id,
              ttsPlaybackGenerationIdRef.current,
            )) break;
            unmuteTts();
            break;
          case 'stop_tts':
          case 'tts_interruption':
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
      useStore.getState().setLiveTranscript('');
      if (roleRef.current === 'controller') {
        discardPendingEvaluations();
      }
      flushActiveTts();
      void stopSttInput();
    };

    ws.onerror = (error) => {
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
      clearSupplementaryPolling();
      clearEvaluationBatchStatus();
    };

    socketRef.current = ws;
  }, [
    addMessage,
    clearEvaluationBatchStatus,
    clearSupplementaryPolling,
    discardPendingEvaluations,
    flushActiveTts,
    fetchSupplementaryTurnResults,
    handleEvaluationBatchStatus,
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
    stopSttInput,
    unmuteTts,
  ]);

  const disconnect = useCallback(() => {
    if (isDisconnecting.current) return;
    isDisconnecting.current = true;
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
  }, [cleanupSocket, clearSupplementaryPolling, discardPendingEvaluations, flushActiveTts, setConnected, setSocket, setSttReady, stopSttInput]);

  const startListening = useCallback(() => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      void startSttCapture();
      return;
    }
    connect();
  }, [connect, startSttCapture]);

  const sendPendingTopicStart = useCallback(() => {
    const pending = pendingTopicStartRef.current;
    if (!pending || pending.sent) return;
    if (socketRef.current?.readyState !== WebSocket.OPEN) return;
    pending.sent = true;
    socketRef.current.send(JSON.stringify(buildStartConversationMessage(pending)));
  }, []);

  const startConversation = useCallback((topicId: TopicId, difficultyId: DifficultyId) => {
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
    useStore.getState().setLiveTranscript('');
    isSttCaptureReadyRef.current = false;
    setSttReady(false);
    void stopSttCapture();
  }, [setSttReady, stopSttCapture]);

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
  };
}
