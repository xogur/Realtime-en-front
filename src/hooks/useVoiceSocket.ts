import { useCallback, useEffect, useRef } from 'react';
import { useStore, type TurnEvaluation } from '@/stores/useStore';
import { useAudioPlayer } from './useAudioPlayer';
import { useAudioRecorder } from './useAudioRecorder';
import type { Emotion, TtsAudioChunk, TtsVisemeTimeline } from '@/lib/lipsync/types';

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
};

type ConnectOptions = {
  startRecording?: boolean;
};

function getDefaultWsUrl(): string {
  if (typeof window === 'undefined') {
    return 'ws://localhost:18003/ws';
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.hostname}:18003/ws`;
}

function getConfiguredWsUrl(): string {
  const configuredUrl = process.env.NEXT_PUBLIC_WS_URL;
  let wsUrl = configuredUrl && configuredUrl.trim().length > 0 ? configuredUrl : getDefaultWsUrl();

  if (typeof window !== 'undefined' && window.location.protocol === 'https:' && wsUrl.startsWith('ws://')) {
    wsUrl = wsUrl.replace('ws://', 'wss://');
  }

  return wsUrl;
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

  const setConnecting = useStore((state) => state.setConnecting);
  const setConnected = useStore((state) => state.setConnected);
  const isConnected = useStore((state) => state.isConnected);
  const addMessage = useStore((state) => state.addMessage);
  const appendToLastAssistantMessage = useStore((state) => state.appendToLastAssistantMessage);
  const setLastAssistantSuggestions = useStore((state) => state.setLastAssistantSuggestions);
  const assignLatestPendingUserTurnId = useStore((state) => state.assignLatestPendingUserTurnId);
  const setTurnEvaluation = useStore((state) => state.setTurnEvaluation);
  const setTurnEvaluationUnavailable = useStore((state) => state.setTurnEvaluationUnavailable);
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
  const { startRecording, stopRecording, setOnDataAvailable } = useAudioRecorder();

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
    (data: SocketMessage): string | null => data.turnId ?? getGenerationId(data),
    [getGenerationId],
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
        assignLatestPendingUserTurnId(generationId);
      }
    },
    [assignLatestPendingUserTurnId, getGenerationId],
  );

  const handleTtsChunk = useCallback(
    (data: SocketMessage) => {
      bindActiveGenerationToPendingUser(data);
      if (!isCurrentGeneration(data)) return;

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
      addMessage('assistant', formatAssistantDisplayMessage(displayMessage, data.korean_content));
      useStore.getState().setPartialMessage('');
      useStore.getState().setEmotion(emotion);
    },
    [addMessage, bindActiveGenerationToPendingUser, isCurrentGeneration],
  );

  const handleAssistantTranslation = useCallback(
    (data: SocketMessage) => {
      if (!isCurrentGeneration(data)) return;

      const korean = sanitizeModelText(data.content ?? '');
      if (!korean) return;
      appendToLastAssistantMessage(`${KOREAN_INTERPRETATION_LABEL} ${korean}`);
    },
    [appendToLastAssistantMessage, isCurrentGeneration],
  );

  const handleAssistantReplySuggestions = useCallback(
    (data: SocketMessage) => {
      if (!isCurrentGeneration(data)) return;

      const suggestions = normalizeReplySuggestions(data);
      if (suggestions.length === 0) return;
      setLastAssistantSuggestions(suggestions);
    },
    [isCurrentGeneration, setLastAssistantSuggestions],
  );

  const handleTurnEvaluation = useCallback(
    (data: SocketMessage) => {
      const turnId = getTurnId(data);
      if (!turnId || !data.evaluation) return;
      setTurnEvaluation(turnId, data.evaluation);
    },
    [getTurnId, setTurnEvaluation],
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

    const shouldStartRecording = options?.startRecording ?? true;

    isConnecting.current = true;
    setConnecting(true);

    const ws = new WebSocket(getConfiguredWsUrl());

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

        switch (data.type) {
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
            setThinking(true);
            useStore.getState().setPartialMessage('');
            addMessage('user', sanitizeModelText(data.content ?? ''), activeGenerationIdRef.current ?? undefined);
            break;
          case 'final_assistant_answer':
            handleFinalAssistantAnswer(data);
            break;
          case 'assistant_translation':
            handleAssistantTranslation(data);
            break;
          case 'assistant_reply_suggestions':
            handleAssistantReplySuggestions(data);
            break;
          case 'turn_evaluation':
            handleTurnEvaluation(data);
            break;
          case 'turn_evaluation_error':
            handleTurnEvaluationError(data);
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
    };

    socketRef.current = ws;
  }, [
    addMessage,
    flushActiveTts,
    handleAssistantReplySuggestions,
    handleAssistantTranslation,
    handleFinalAssistantAnswer,
    handlePartialAssistantAnswer,
    handleSegmentEnd,
    handleSegmentStart,
    handleSegmentTimeline,
    handleTtsChunk,
    handleTurnEvaluation,
    handleTurnEvaluationError,
    getGenerationId,
    isCurrentGeneration,
    setConnected,
    setConnecting,
    setSocket,
    setThinking,
    startRecording,
    stopRecording,
  ]);

  const disconnect = useCallback(() => {
    if (isDisconnecting.current) return;
    isDisconnecting.current = true;
    cleanupSocket();
    activeGenerationIdRef.current = null;
    flushActiveTts();
    setConnected(false);
    setSocket(null);
    stopRecording();
    isDisconnecting.current = false;
  }, [cleanupSocket, flushActiveTts, setConnected, setSocket, stopRecording]);

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
    disconnect();
  }, [disconnect]);

  const clearHistory = useCallback(() => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'clear_history' }));
    }
    clearMessages();
    activeGenerationIdRef.current = null;
    useStore.getState().setPartialMessage('');
    addMessage('assistant', '(시스템) 대화 내용이 초기화되었습니다.');
  }, [addMessage, clearMessages]);

  return { connect, disconnect, isConnected, clearHistory };
}
