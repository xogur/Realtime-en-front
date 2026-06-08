import { useCallback, useEffect, useRef } from 'react';
import { useStore } from '@/stores/useStore';
import { int16ToFloat32 } from '@/lib/audioUtils';
import { DEFAULT_SAMPLE_RATE } from '@/lib/lipsync/constants';
import type { TtsAudioChunk } from '@/lib/lipsync/types';

interface DecodedChunk {
  float32: Float32Array;
  sampleRate: number;
}

function decodeBase64Pcm(base64Data: string, sampleRate?: number): DecodedChunk {
  const binaryString = window.atob(base64Data);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const int16 = new Int16Array(bytes.buffer);
  return {
    float32: int16ToFloat32(int16),
    sampleRate: sampleRate ?? DEFAULT_SAMPLE_RATE,
  };
}

interface AudioPlayerOptions {
  onPlaybackIdle?: () => void;
}

export function useAudioPlayer(options: AudioPlayerOptions = {}) {
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const startTimeRef = useRef(0);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const onPlaybackIdleRef = useRef(options.onPlaybackIdle);

  const setPlaying = useStore((state) => state.setPlaying);
  const setAudioAnalyser = useStore((state) => state.setAudioAnalyser);
  const upsertTtsSegment = useStore((state) => state.upsertTtsSegment);
  const clearTtsSegments = useStore((state) => state.clearTtsSegments);

  useEffect(() => {
    onPlaybackIdleRef.current = options.onPlaybackIdle;
  }, [options.onPlaybackIdle]);

  useEffect(() => {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) {
      return undefined;
    }

    const ctx = new AudioContextClass();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.minDecibels = -85;
    analyser.maxDecibels = -15;
    analyser.smoothingTimeConstant = 0.45;
    analyser.connect(ctx.destination);

    audioContextRef.current = ctx;
    analyserRef.current = analyser;
    setAudioAnalyser(analyser);

    return () => {
      ctx.close();
      setAudioAnalyser(null);
    };
  }, [setAudioAnalyser]);

  const playPcmChunk = useCallback(
    (chunk: TtsAudioChunk) => {
      const ctx = audioContextRef.current;
      if (!ctx) return;

      const { float32, sampleRate } = decodeBase64Pcm(chunk.content, chunk.sampleRate);
      const buffer = ctx.createBuffer(1, float32.length, sampleRate);
      const channelData = new Float32Array(float32);
      buffer.copyToChannel(channelData, 0);

      const source = ctx.createBufferSource();
      source.buffer = buffer;

      if (analyserRef.current) {
        source.connect(analyserRef.current);
      } else {
        source.connect(ctx.destination);
      }

      const now = ctx.currentTime;
      let scheduledTime = startTimeRef.current;
      if (scheduledTime < now) {
        scheduledTime = now + 0.02;
      }

      source.start(scheduledTime);
      const scheduledEndTime = scheduledTime + buffer.duration;
      startTimeRef.current = scheduledEndTime;
      activeSourcesRef.current.push(source);
      setPlaying(true);

      if (chunk.segmentId && chunk.responseId) {
        upsertTtsSegment({
          sampleRate,
          responseId: chunk.responseId,
          segmentId: chunk.segmentId,
          audioStartContextTime: scheduledTime,
          audioEndContextTime: scheduledEndTime,
        });
      }

      if (ctx.state === 'suspended') {
        void ctx.resume();
      }

      source.onended = () => {
        activeSourcesRef.current = activeSourcesRef.current.filter((activeSource) => activeSource !== source);
        if (chunk.segmentId && chunk.responseId) {
          upsertTtsSegment({
            responseId: chunk.responseId,
            segmentId: chunk.segmentId,
            sampleRate,
            audioEndContextTime: Math.max(scheduledEndTime, ctx.currentTime),
          });
        }
        if (activeSourcesRef.current.length === 0) {
          setPlaying(false);
          onPlaybackIdleRef.current?.();
        }
      };
    },
    [setPlaying, upsertTtsSegment],
  );

  const clearQueue = useCallback(
    (responseId?: string) => {
      activeSourcesRef.current.forEach((source) => {
        try {
          source.onended = null;
          source.stop();
        } catch {
          // Intentionally ignored for already-stopped sources.
        }
      });
      activeSourcesRef.current = [];
      startTimeRef.current = 0;
      clearTtsSegments(responseId);
      setPlaying(false);
    },
    [clearTtsSegments, setPlaying],
  );

  return {
    playPcmChunk,
    clearQueue,
    getAudioContext: () => audioContextRef.current,
  };
}
