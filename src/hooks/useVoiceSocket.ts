import { useCallback, useEffect, useRef } from 'react';
import { useStore } from '@/stores/useStore';
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

type SocketMessage = {
  type: string;
  content?: string;
  response_id?: string;
  segment_id?: string;
  sample_rate?: number;
  seq?: number;
  text?: string;
  emotion?: string;
  timeline?: TtsVisemeTimeline;
  reason?: string;
};

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

export function useVoiceSocket() {
  const socketRef = useRef<WebSocket | null>(null);
  const isConnecting = useRef(false);
  const isDisconnecting = useRef(false);

  const setConnecting = useStore((state) => state.setConnecting);
  const setConnected = useStore((state) => state.setConnected);
  const isConnected = useStore((state) => state.isConnected);
  const addMessage = useStore((state) => state.addMessage);
  const setThinking = useStore((state) => state.setThinking);
  const setSocket = useStore((state) => state.setSocket);
  const upsertTtsSegment = useStore((state) => state.upsertTtsSegment);
  const patchTtsSegment = useStore((state) => state.patchTtsSegment);
  const clearTtsSegments = useStore((state) => state.clearTtsSegments);
  const setLipSyncMode = useStore((state) => state.setLipSyncMode);
  const clearMessages = useStore((state) => state.clearMessages);

  const { playPcmChunk, clearQueue } = useAudioPlayer();
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

  const handleTtsChunk = useCallback(
    (data: SocketMessage) => {
      const chunk: TtsAudioChunk = {
        content: data.content ?? '',
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
    [playPcmChunk],
  );

  const handlePartialAssistantAnswer = useCallback(
    (data: SocketMessage) => {
      const rawText = data.content ?? '';
      const { emotion, displayMessage } = parseTaggedEmotion(rawText);
      useStore.getState().setThinking(false);
      useStore.getState().setEmotion(emotion);
      useStore.getState().setPartialMessage(displayMessage);
    },
    [],
  );

  const handleFinalAssistantAnswer = useCallback(
    (data: SocketMessage) => {
      const rawText = data.content ?? '';
      const { emotion, displayMessage } = parseTaggedEmotion(rawText);
      addMessage('assistant', displayMessage);
      useStore.getState().setPartialMessage('');
      useStore.getState().setEmotion(emotion);
    },
    [addMessage],
  );

  const handleSegmentStart = useCallback(
    (data: SocketMessage) => {
      if (!data.segment_id || !data.response_id) return;
      upsertTtsSegment({
        responseId: data.response_id,
        segmentId: data.segment_id,
        sampleRate: data.sample_rate ?? 48000,
        text: data.text,
        emotion: data.emotion ? EMOTION_TAG_MAP[data.emotion] ?? 'neutral' : undefined,
      });
    },
    [upsertTtsSegment],
  );

  const handleSegmentTimeline = useCallback(
    (data: SocketMessage) => {
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
    [patchTtsSegment, setLipSyncMode],
  );

  const handleSegmentEnd = useCallback(
    (data: SocketMessage) => {
      if (!data.segment_id) return;
      patchTtsSegment(data.segment_id, {});
    },
    [patchTtsSegment],
  );

  const connect = useCallback(() => {
    if (isConnecting.current || isDisconnecting.current) return;
    if (socketRef.current?.readyState === WebSocket.OPEN) return;

    isConnecting.current = true;
    setConnecting(true);

    let wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://uxroom.asuscomm.com:18002/ws';
    if (typeof window !== 'undefined' && window.location.protocol === 'https:' && wsUrl.startsWith('ws://')) {
      wsUrl = wsUrl.replace('ws://', 'wss://');
    }

    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      isConnecting.current = false;
      setConnecting(false);
      setConnected(true);
      setSocket(ws);
      startRecording();

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
            flushActiveTts(data.response_id);
            break;
          case 'partial_user_request':
            break;
          case 'partial_assistant_answer':
            handlePartialAssistantAnswer(data);
            break;
          case 'final_user_request':
            setThinking(true);
            addMessage('user', sanitizeModelText(data.content ?? ''));
            break;
          case 'final_assistant_answer':
            handleFinalAssistantAnswer(data);
            break;
          case 'stop_tts':
          case 'tts_interruption':
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
      flushActiveTts();
      stopRecording();
    };

    ws.onerror = (error) => {
      console.error('Voice Socket Error:', error);
      isConnecting.current = false;
      setConnecting(false);
      setConnected(false);
      setSocket(null);
    };

    socketRef.current = ws;
  }, [
    addMessage,
    flushActiveTts,
    handleFinalAssistantAnswer,
    handlePartialAssistantAnswer,
    handleSegmentEnd,
    handleSegmentStart,
    handleSegmentTimeline,
    handleTtsChunk,
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
    useStore.getState().setPartialMessage('');
    addMessage('assistant', '(시스템) 대화 내용이 초기화되었습니다.');
  }, [addMessage, clearMessages]);

  return { connect, disconnect, isConnected, clearHistory };
}
