'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useBrowserStt } from '@/hooks/useBrowserStt';
import { useBrowserTts } from '@/hooks/useBrowserTts';
import type { BrowserFinalTranscript } from '@/lib/stt';
import type { DifficultyId } from '@/lib/conversationDifficulties';
import type { TopicId } from '@/lib/conversationTopics';
import { parseSpokenConversationSelection } from './voiceTopicSelection';

export type VoiceTopicSelectionPhase =
  | 'idle' | 'preparing-difficulty' | 'difficulty' | 'switching-to-topic'
  | 'topic' | 'starting' | 'unavailable';

const DIFFICULTY_PROMPT = '대화 난이도를 선택해 주세요. 준비가 되면 바로 말씀해 주세요.';
const TOPIC_PROMPT = '좋아요. 이제 원하는 주제나 상황을 바로 말씀해 주세요.';
const INTERIM_STABILITY_MS = 250;

type Props = {
  enabled: boolean;
  onDifficultySelect: (difficultyId: DifficultyId) => void;
  onSelect: (topicId: TopicId, difficultyId: DifficultyId) => void;
};

type SttControls = {
  prepare: () => Promise<boolean>;
  startAndWaitUntilReady: (timeoutMs?: number) => Promise<boolean>;
  restartAndWaitUntilReady: (timeoutMs?: number) => Promise<boolean>;
  stop: () => Promise<void>;
};

export function useVoiceTopicSelection({ enabled, onDifficultySelect, onSelect }: Props) {
  const [phase, setPhase] = useState<VoiceTopicSelectionPhase>('idle');
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);
  const phaseRef = useRef<VoiceTopicSelectionPhase>('idle');
  const difficultyRef = useRef<DifficultyId | null>(null);
  const promptTextRef = useRef('');
  const activeRef = useRef(false);
  const completingRef = useRef(false);
  const generationRef = useRef(0);
  const interimTimerRef = useRef<number | null>(null);
  const sttControlsRef = useRef<SttControls | null>(null);
  const finalHandlerRef = useRef<(transcript: BrowserFinalTranscript) => void>(() => undefined);
  const interimHandlerRef = useRef<(transcript: string) => void>(() => undefined);
  const callbacksRef = useRef({ onDifficultySelect, onSelect });
  const { speak, cancel, isSpeaking } = useBrowserTts('topic-selector');

  useEffect(() => {
    callbacksRef.current = { onDifficultySelect, onSelect };
  }, [onDifficultySelect, onSelect]);

  const updatePhase = useCallback((next: VoiceTopicSelectionPhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const clearInterimTimer = useCallback(() => {
    if (interimTimerRef.current) window.clearTimeout(interimTimerRef.current);
    interimTimerRef.current = null;
  }, []);

  const failToTouch = useCallback((code?: string) => {
    activeRef.current = false;
    cancel();
    void sttControlsRef.current?.stop();
    setError(code === 'MICROPHONE_DENIED'
      ? '마이크 권한이 없어 음성 선택을 사용할 수 없어요. 화면을 터치해 선택해 주세요.'
      : '음성 선택을 사용할 수 없어요. 화면을 터치해 선택해 주세요.');
    updatePhase('unavailable');
  }, [cancel, updatePhase]);

  const stt = useBrowserStt({
    language: 'ko-KR',
    publishRecordingState: false,
    onFinalTranscript: (transcript) => finalHandlerRef.current(transcript),
    onInterimTranscript: (transcript) => interimHandlerRef.current(transcript),
    onReadyChange: () => undefined,
    onError: (code) => {
      if (!activeRef.current) return;
      if (['MICROPHONE_DENIED', 'MICROPHONE_UNAVAILABLE', 'BROWSER_STT_UNSUPPORTED'].includes(code)) {
        failToTouch(code);
      }
    },
    onUnavailable: () => undefined,
    onSpeechStarted: cancel,
    getPlaybackState: () => ({ isPlaying: isSpeaking, text: promptTextRef.current }),
  });

  useEffect(() => {
    sttControlsRef.current = {
      prepare: stt.prepare,
      startAndWaitUntilReady: stt.startAndWaitUntilReady,
      restartAndWaitUntilReady: stt.restartAndWaitUntilReady,
      stop: stt.stop,
    };
  }, [stt.prepare, stt.restartAndWaitUntilReady, stt.startAndWaitUntilReady, stt.stop]);

  const announce = useCallback((text: string) => {
    promptTextRef.current = text;
    void speak(text, 'ko-KR');
  }, [speak]);

  useEffect(() => {
    if (phase !== 'difficulty' && phase !== 'topic') return;
    const generation = generationRef.current;
    const timer = window.setTimeout(() => {
      if (!activeRef.current || generation !== generationRef.current) return;
      announce(phase === 'difficulty' ? DIFFICULTY_PROMPT : TOPIC_PROMPT);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [announce, phase]);

  const finish = useCallback(async (topicId: TopicId, difficultyId: DifficultyId) => {
    if (completingRef.current) return;
    completingRef.current = true;
    activeRef.current = false;
    generationRef.current += 1;
    clearInterimTimer();
    setInterim('');
    cancel();
    updatePhase('starting');
    await sttControlsRef.current?.stop();
    callbacksRef.current.onDifficultySelect(difficultyId);
    callbacksRef.current.onSelect(topicId, difficultyId);
  }, [cancel, clearInterimTimer, updatePhase]);

  const selectDifficulty = useCallback(async (difficultyId: DifficultyId) => {
    if (completingRef.current || phaseRef.current === 'switching-to-topic') return;
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    difficultyRef.current = difficultyId;
    callbacksRef.current.onDifficultySelect(difficultyId);
    clearInterimTimer();
    setInterim('');
    cancel();
    updatePhase('switching-to-topic');
    const ready = await sttControlsRef.current?.restartAndWaitUntilReady();
    if (!activeRef.current || generation !== generationRef.current) return;
    if (!ready) {
      failToTouch();
      return;
    }
    updatePhase('topic');
  }, [cancel, clearInterimTimer, failToTouch, updatePhase]);

  const handleTranscript = useCallback((text: string, final: boolean) => {
    if (!activeRef.current || completingRef.current) return;
    setInterim(text);
    const apply = () => {
      if (!activeRef.current || completingRef.current) return;
      const parsed = parseSpokenConversationSelection(text);
      if (phaseRef.current === 'difficulty') {
        if (parsed.difficultyId && parsed.topicId) {
          void finish(parsed.topicId, parsed.difficultyId);
        } else if (parsed.difficultyId) {
          void selectDifficulty(parsed.difficultyId);
        } else if (final) {
          announce('난이도를 잘 듣지 못했어요. 초급, 중급, 고급 중 하나를 말씀해 주세요.');
        }
      } else if (phaseRef.current === 'topic') {
        if (parsed.topicId && difficultyRef.current) {
          void finish(parsed.topicId, difficultyRef.current);
        } else if (final) {
          announce('주제를 잘 듣지 못했어요. 음식점, 공항, 여행처럼 원하는 주제를 말씀해 주세요.');
        }
      }
    };
    clearInterimTimer();
    if (final) apply();
    else interimTimerRef.current = window.setTimeout(apply, INTERIM_STABILITY_MS);
  }, [announce, clearInterimTimer, finish, selectDifficulty]);

  useEffect(() => {
    interimHandlerRef.current = (text) => handleTranscript(text, false);
    finalHandlerRef.current = (transcript) => handleTranscript(transcript.text.trim(), true);
  }, [handleTranscript]);

  const stop = useCallback(async () => {
    activeRef.current = false;
    completingRef.current = false;
    generationRef.current += 1;
    difficultyRef.current = null;
    promptTextRef.current = '';
    clearInterimTimer();
    setInterim('');
    cancel();
    updatePhase('idle');
    await sttControlsRef.current?.stop();
  }, [cancel, clearInterimTimer, updatePhase]);

  const selectTopicByTouch = useCallback((topicId: TopicId, difficultyId: DifficultyId) => {
    void finish(topicId, difficultyId);
  }, [finish]);

  const returnToDifficulty = useCallback(async () => {
    if (completingRef.current) return;
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    difficultyRef.current = null;
    clearInterimTimer();
    setInterim('');
    cancel();
    updatePhase('preparing-difficulty');
    const ready = await sttControlsRef.current?.restartAndWaitUntilReady();
    if (!activeRef.current || generation !== generationRef.current) return;
    if (ready) updatePhase('difficulty');
    else failToTouch();
  }, [cancel, clearInterimTimer, failToTouch, updatePhase]);

  useEffect(() => {
    if (!enabled) {
      activeRef.current = false;
      completingRef.current = false;
      generationRef.current += 1;
      difficultyRef.current = null;
      promptTextRef.current = '';
      clearInterimTimer();
      cancel();
      void sttControlsRef.current?.stop();
      return;
    }
    activeRef.current = true;
    completingRef.current = false;
    difficultyRef.current = null;
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    void (async () => {
      setError(null);
      setInterim('');
      updatePhase('preparing-difficulty');
      const prepared = await sttControlsRef.current?.prepare();
      if (!prepared || !activeRef.current || generation !== generationRef.current) {
        if (activeRef.current && generation === generationRef.current) failToTouch();
        return;
      }
      const ready = await sttControlsRef.current?.startAndWaitUntilReady();
      if (!activeRef.current || generation !== generationRef.current) return;
      if (ready) updatePhase('difficulty');
      else failToTouch();
    })();
    return () => {
      activeRef.current = false;
      generationRef.current += 1;
      clearInterimTimer();
      cancel();
      void sttControlsRef.current?.stop();
    };
  }, [cancel, clearInterimTimer, enabled, failToTouch, updatePhase]);

  return {
    phase, interim, error, isRecording: stt.isRecording, sttStatus: stt.status,
    selectDifficulty, selectTopicByTouch, returnToDifficulty, stop,
  };
}
