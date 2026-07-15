import { useCallback, useEffect, useRef } from 'react';
import { useStore, type TurnCorrection, type TurnEvaluation } from '@/stores/useStore';
import { useAudioPlayer } from './useAudioPlayer';
import { useAudioRecorder } from './useAudioRecorder';
import type { Emotion, TtsAudioChunk, TtsVisemeTimeline } from '@/lib/lipsync/types';
import { getKioskIdFromLocation, withKioskSessionParams, type KioskRole } from '@/lib/kioskIdentity';

const EVALUATION_BATCH_DELAY_SECONDS = 30;
const EVALUATION_BATCH_MAX_TURNS = 4;
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
  maxTurns?: number;
  delaySeconds?: number;
  nextFlushAtEpochMs?: number | null;
  eventSeq?: number;
};

type TurnResultsResponse = {
  results?: SocketMessage[];
  evaluationBatchStatus?: SocketMessage | null;
};

type ConnectOptions = {
  startRecording?: boolean;
  role?: KioskRole;
};

export function buildClientTurnId(backendTurnId: string | null, eventSeq?: number): string | undefined {
  if (!backendTurnId) {
    return undefined;
  }
  return typeof eventSeq === 'number' ? `${backendTurnId}:event-${eventSeq}` : backendTurnId;
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

function getTurnResultsUrl(generationId?: string): string {
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

function normalizeReplySuggestions(data: SocketMessage): string[] {
  const rawSuggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
  return rawSuggestions
    .map((suggestion) => sanitizeModelText(String(suggestion)))
    .filter((suggestion) => suggestion.length > 0)
    .slice(0, 3);
}

export function useVoiceSocket() {
  const socketRef = useRef<WebSocket | null>(null);
  const isConnecting = useRef(false);
  const isDisconnecting = useRef(false);
  const activeGenerationIdRef = useRef<string | null>(null);
  const backendTurnIdToClientTurnIdRef = useRef<Map<string, string>>(new Map());
  const abandonedEvaluationTurnIdsRef = useRef<Set<string>>(new Set());
  const seenEventSeqsRef = useRef<Set<string>>(new Set());
  const eventSeqOrderRef = useRef<string[]>([]);
  const roleRef = useRef<KioskRole>('controller');
  const disconnectRef = useRef<() => void>(() => undefined);
  const isReplayingSessionRef = useRef(false);
  const supplementaryPollTimeoutsRef = useRef<number[]>([]);
  const processedSupplementaryKeysRef = useRef<Set<string>>(new Set());

  const setConnecting = useStore((state) => state.setConnecting);
  const setConnected = useStore((state) => state.setConnected);
  const isConnected = useStore((state) => state.isConnected);
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

  const notifyTtsPlaybackStopped = useCallback(() => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'tts_stop' }));
    }
  }, []);

  const { playPcmChunk, clearQueue } = useAudioPlayer({
    onPlaybackIdle: notifyTtsPlaybackStopped,
  });
  const { startRecording, stopRecording, setOnDataAvailable, isRecording } = useAudioRecorder();

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
    supplementaryPollTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    supplementaryPollTimeoutsRef.current = [];
  }, []);

  const flushActiveTts = useCallback(
    (responseId?: string) => {
      clearQueue(responseId);
      clearTtsSegments(responseId);
      useStore.getState().setPartialMessage('');
      setLipSyncMode('heuristic');
    },
    [clearQueue, clearTtsSegments, setLipSyncMode],
  );

  const getGenerationId = useCallback((data: SocketMessage): string | null => {
    if (data.generation_id === undefined || data.generation_id === null) {
      return null;
    }
    return String(data.generation_id);
  }, []);

  const getTurnId = useCallback(
    (data: SocketMessage): string | null => {
      const backendTurnId = data.turnId ?? getGenerationId(data);
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
      const generationId = getGenerationId(data);
      return !generationId || !activeGenerationIdRef.current || generationId === activeGenerationIdRef.current;
    },
    [getGenerationId],
  );

  const bindActiveGenerationToPendingUser = useCallback(
    (data: SocketMessage) => {
      const generationId = getGenerationId(data);
      if (!generationId) return;

      if (!activeGenerationIdRef.current) {
        activeGenerationIdRef.current = generationId;
      }
      if (generationId === activeGenerationIdRef.current) {
        const clientTurnId = backendTurnIdToClientTurnIdRef.current.get(generationId) ?? generationId;
        assignLatestPendingUserTurnId(clientTurnId);
      }
    },
    [assignLatestPendingUserTurnId, getGenerationId],
  );

  const handleTtsChunk = useCallback(
    (data: SocketMessage) => {
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
      playPcmChunk(chunk);
    },
    [bindActiveGenerationToPendingUser, getGenerationId, isCurrentGeneration, playPcmChunk],
  );

  const handlePartialAssistantAnswer = useCallback(
    (data: SocketMessage) => {
      bindActiveGenerationToPendingUser(data);
      if (!isCurrentGeneration(data)) return;

      const rawText = data.content ?? '';
      const { emotion, displayMessage } = parseTaggedEmotion(rawText);
      useStore.getState().setThinking(false);
      useStore.getState().setEmotion(emotion);
      useStore.getState().setPartialMessage(displayMessage);
    },
    [bindActiveGenerationToPendingUser, isCurrentGeneration],
  );

  const handleFinalAssistantAnswer = useCallback(
    (data: SocketMessage) => {
      bindActiveGenerationToPendingUser(data);
      if (!isCurrentGeneration(data)) return;

      const rawText = data.content ?? '';
      const { emotion, displayMessage } = parseTaggedEmotion(rawText);
      const turnId = getTurnId(data) ?? undefined;
      addMessage('assistant', formatAssistantDisplayMessage(displayMessage, data.korean_content), turnId);
      useStore.getState().setPartialMessage('');
      useStore.getState().setEmotion(emotion);
    },
    [addMessage, bindActiveGenerationToPendingUser, getTurnId, isCurrentGeneration],
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
        maxTurns: Number(data.maxTurns ?? 1),
        delaySeconds: Number(data.delaySeconds ?? 0),
        nextFlushAtEpochMs: data.nextFlushAtEpochMs ?? null,
      });
    },
    [setEvaluationBatchStatus],
  );

  const getSupplementaryEventKey = useCallback((data: SocketMessage): string => {
    const generationId = getGenerationId(data) ?? data.turnId ?? 'none';
    const payloadKey = data.code ?? data.reason ?? data.content ?? JSON.stringify(data.suggestions ?? data.evaluation ?? data.correction ?? '');
    return `${data.type}:${generationId}:${payloadKey}`;
  }, [getGenerationId]);

  const handleSupplementaryHttpMessage = useCallback(
    (data: SocketMessage) => {
      const key = getSupplementaryEventKey(data);
      if (processedSupplementaryKeysRef.current.has(key)) return;
      processedSupplementaryKeysRef.current.add(key);

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
          break;
      }
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
    ],
  );

  const fetchSupplementaryTurnResults = useCallback(
    async (generationId?: string) => {
      const response = await fetch(getTurnResultsUrl(generationId), { cache: 'no-store' });
      if (!response.ok) return;

      const payload = (await response.json()) as TurnResultsResponse;
      payload.results?.forEach(handleSupplementaryHttpMessage);
      if (payload.evaluationBatchStatus) {
        handleEvaluationBatchStatus(payload.evaluationBatchStatus);
      }
    },
    [handleEvaluationBatchStatus, handleSupplementaryHttpMessage],
  );

  const scheduleSupplementaryPolling = useCallback(
    (generationId: string | null, attempts = 40) => {
      if (!generationId || typeof window === 'undefined') return;
      if (isReplayingSessionRef.current) return;

      const poll = (remainingAttempts: number) => {
        fetchSupplementaryTurnResults(generationId).catch((error) => {
          console.warn('Could not fetch turn results:', error);
        });
        if (remainingAttempts <= 1) return;

        const timeoutId = window.setTimeout(() => poll(remainingAttempts - 1), 2000);
        supplementaryPollTimeoutsRef.current.push(timeoutId);
      };

      poll(attempts);
    },
    [fetchSupplementaryTurnResults],
  );

  const handleSegmentStart = useCallback(
    (data: SocketMessage) => {
      if (!isCurrentGeneration(data)) return;
      if (!data.segment_id || !data.response_id) return;
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
    setConnecting(true);

    const ws = new WebSocket(getConfiguredWsUrl(role));

    ws.onopen = () => {
      isConnecting.current = false;
      setConnecting(false);
      setConnected(true);
      setSocket(ws);
      if (shouldStartRecording) {
        startRecording();
      }

      const currentVoice = useStore.getState().voice;
      ws.send(JSON.stringify({ type: 'set_voice', voice: currentVoice }));
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
            clearSupplementaryPolling();
            processedSupplementaryKeysRef.current.clear();
            clearMessages();
            activeGenerationIdRef.current = null;
            backendTurnIdToClientTurnIdRef.current.clear();
            seenEventSeqsRef.current.clear();
            eventSeqOrderRef.current = [];
            useStore.getState().setPartialMessage('');
            useStore.getState().setThinking(false);
            break;
          case 'session_replay_end':
            isReplayingSessionRef.current = false;
            fetchSupplementaryTurnResults().catch((error) => {
              console.warn('Could not restore replayed turn results:', error);
            });
            break;
          case 'kiosk_session_ready':
            break;
          case 'tts_segment_start':
            handleSegmentStart(data);
            break;
          case 'tts_viseme_timeline':
            handleSegmentTimeline(data);
            break;
          case 'tts_chunk':
            handleTtsChunk(data);
            break;
          case 'tts_segment_end':
            handleSegmentEnd(data);
            break;
          case 'tts_flush':
            if (!isCurrentGeneration(data)) break;
            flushActiveTts(data.response_id);
            break;
          case 'partial_user_request':
            break;
          case 'partial_assistant_answer':
            handlePartialAssistantAnswer(data);
            break;
          case 'final_user_request':
            activeGenerationIdRef.current = getGenerationId(data);
            const clientTurnId = buildClientTurnId(activeGenerationIdRef.current, data.eventSeq);
            if (activeGenerationIdRef.current && clientTurnId) {
              backendTurnIdToClientTurnIdRef.current.set(activeGenerationIdRef.current, clientTurnId);
            }
            setThinking(true);
            useStore.getState().setPartialMessage('');
            addMessage('user', sanitizeModelText(data.content ?? ''), clientTurnId);
            if (clientTurnId && abandonedEvaluationTurnIdsRef.current.has(clientTurnId)) {
              setTurnEvaluationSkipped(clientTurnId, 'mic_disconnected');
            } else if (clientTurnId && data.evaluation_policy === 'skip') {
              setTurnEvaluationSkipped(
                clientTurnId,
                data.evaluation_reason ?? 'policy_skip',
              );
            } else {
              queueLocalEvaluationBatchTurn(EVALUATION_BATCH_DELAY_SECONDS, EVALUATION_BATCH_MAX_TURNS);
            }
            scheduleSupplementaryPolling(activeGenerationIdRef.current);
            break;
          case 'final_assistant_answer':
            handleFinalAssistantAnswer(data);
            scheduleSupplementaryPolling(getGenerationId(data));
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
            console.info('STT provider status:', data.content);
            break;
          case 'stt_provider_error':
            console.error('STT provider error:', data.content);
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
      setConnecting(false);
      setConnected(false);
      setSocket(null);
      activeGenerationIdRef.current = null;
      discardPendingEvaluations();
      flushActiveTts();
      stopRecording();
    };

    ws.onerror = (error) => {
      console.error('Voice Socket Error:', error);
      isConnecting.current = false;
      setConnecting(false);
      setConnected(false);
      setSocket(null);
      activeGenerationIdRef.current = null;
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
    isCurrentGeneration,
    queueLocalEvaluationBatchTurn,
    scheduleSupplementaryPolling,
    setConnected,
    setConnecting,
    setSocket,
    setThinking,
    setTurnEvaluationSkipped,
    clearMessages,
    startRecording,
    stopRecording,
  ]);

  const disconnect = useCallback(() => {
    if (isDisconnecting.current) return;
    isDisconnecting.current = true;
    cleanupSocket();
    activeGenerationIdRef.current = null;
    clearSupplementaryPolling();
    discardPendingEvaluations();
    flushActiveTts();
    setConnected(false);
    setSocket(null);
    stopRecording();
    isDisconnecting.current = false;
  }, [cleanupSocket, clearSupplementaryPolling, discardPendingEvaluations, flushActiveTts, setConnected, setSocket, stopRecording]);

  const startListening = useCallback(() => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      void startRecording();
      return;
    }
    connect();
  }, [connect, startRecording]);

  const stopListening = useCallback(() => {
    void stopRecording();
  }, [stopRecording]);

  useEffect(() => {
    setOnDataAvailable((pcmData) => {
      if (socketRef.current?.readyState !== WebSocket.OPEN) return;

      const header = new ArrayBuffer(8);
      const view = new DataView(header);
      view.setUint32(0, Date.now(), false);
      view.setUint32(4, useStore.getState().isPlaying ? 1 : 0, false);

      const pcmBytes = new Uint8Array(pcmData.buffer, pcmData.byteOffset, pcmData.byteLength);
      const payload = new Uint8Array(header.byteLength + pcmBytes.length);
      payload.set(new Uint8Array(header), 0);
      payload.set(pcmBytes, 8);
      socketRef.current.send(payload);
    });
  }, [setOnDataAvailable]);

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

  const clearHistory = useCallback(() => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'clear_history' }));
    } else if (typeof window !== 'undefined') {
      const ws = new WebSocket(getConfiguredWsUrl('controller'));
      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'clear_history' }));
        window.setTimeout(() => ws.close(), 100);
      };
      ws.onerror = () => ws.close();
    }
    clearMessages();
    clearSupplementaryPolling();
    processedSupplementaryKeysRef.current.clear();
    abandonedEvaluationTurnIdsRef.current.clear();
    activeGenerationIdRef.current = null;
    useStore.getState().setPartialMessage('');
    addMessage('assistant', '(시스템) 대화 내용이 초기화되었습니다.');
  }, [addMessage, clearMessages, clearSupplementaryPolling]);

  return { connect, disconnect, startListening, stopListening, isConnected, isRecording, clearHistory };
}
