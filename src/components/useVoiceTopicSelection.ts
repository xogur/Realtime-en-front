'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useBrowserStt } from '@/hooks/useBrowserStt';
import { useBrowserTts } from '@/hooks/useBrowserTts';
import type { DifficultyId } from '@/lib/conversationDifficulties';
import type { TopicId } from '@/lib/conversationTopics';
import { parseSpokenConversationSelection } from './voiceTopicSelection';

export type VoiceTopicSelectionPhase =
  | 'idle' | 'preparing-difficulty' | 'difficulty' | 'switching-to-topic'
  | 'topic' | 'starting' | 'unavailable';

const DIFFICULTY_PROMPT = '안내가 끝나면 초급, 중급, 고급 또는 화면의 번호를 말씀해 주세요. 터치로도 선택할 수 있어요.';
const TOPIC_PROMPT = '안내가 끝나면 화면의 주제 이름이나 번호를 말씀해 주세요. 터치로도 선택할 수 있어요.';

type Props = {
  enabled: boolean;
  onDifficultySelect: (difficultyId: DifficultyId) => void;
  onSelect: (topicId: TopicId, difficultyId: DifficultyId) => void;
};

type SttControls = {
  prepare: () => Promise<boolean>;
  startAndWaitUntilReady: (timeoutMs?: number) => Promise<boolean>;
  stop: () => Promise<void>;
};

export function useVoiceTopicSelection({ enabled, onDifficultySelect, onSelect }: Props) {
  const [phase, setPhase] = useState<VoiceTopicSelectionPhase>('idle');
  const [interim, setInterim] = useState('');
  const [recognizedSpeech, setRecognizedSpeech] = useState({ difficulty: '', topic: '' });
  const [error, setError] = useState<string | null>(null);
  const [promptStatus, setPromptStatus] = useState<'preparing' | 'prompting' | 'starting' | null>('preparing');
  const acceptingRef = useRef(false);
  const phaseRef = useRef<VoiceTopicSelectionPhase>('idle');
  const difficultyRef = useRef<DifficultyId | null>(null);
  const promptTextRef = useRef('');
  const activeRef = useRef(false);
  const completingRef = useRef(false);
  const generationRef = useRef(0);
  const sttControlsRef = useRef<SttControls | null>(null);
  const finalHandlerRef = useRef<(transcript: { text: string }) => void>(() => undefined);
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

  const failToTouch = useCallback((code?: string) => {
    activeRef.current = false;
    acceptingRef.current = false;
    generationRef.current += 1;
    setPromptStatus(null);
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
      if (['MICROPHONE_DENIED', 'MICROPHONE_UNAVAILABLE', 'BROWSER_STT_UNSUPPORTED', 'STT_UNAVAILABLE'].includes(code)) {
        failToTouch(code);
      }
    },
    onUnavailable: () => { if (activeRef.current) failToTouch(); },
    onSpeechStarted: () => undefined,
    getPlaybackState: () => ({ isPlaying: isSpeaking, text: promptTextRef.current }),
  });

  useEffect(() => {
    sttControlsRef.current = {
      prepare: stt.prepare,
      startAndWaitUntilReady: stt.startAndWaitUntilReady,
      stop: stt.stop,
    };
  }, [stt.prepare, stt.startAndWaitUntilReady, stt.stop]);

  const announce = useCallback(async (text: string) => {
    const generation = ++generationRef.current;
    const current = () => activeRef.current && generation === generationRef.current;
    acceptingRef.current = false;
    setInterim('');
    setPromptStatus('preparing');
    promptTextRef.current = text;
    cancel();
    await sttControlsRef.current?.stop();
    if (!current()) return;
    // Acquiring microphone permission does not start SpeechRecognition.
    const prepared = await sttControlsRef.current?.prepare();
    if (!current()) return;
    if (!prepared) { failToTouch(); return; }
    setPromptStatus('prompting');
    await speak(text, 'ko-KR');
    if (!current()) return;
    // Let the speaker's short acoustic tail finish before enabling recognition.
    await new Promise((resolve) => window.setTimeout(resolve, 250));
    if (!current()) return;
    setPromptStatus('starting');
    const ready = await sttControlsRef.current?.startAndWaitUntilReady();
    if (!current()) return;
    if (!ready) { failToTouch(); return; }
    acceptingRef.current = true;
    setPromptStatus(null);
  }, [cancel, failToTouch, speak]);

  useEffect(() => {
    if (phase !== 'difficulty' && phase !== 'topic') return;
    const generation = generationRef.current;
    const timer = window.setTimeout(() => {
      if (!activeRef.current || generation !== generationRef.current) return;
      void announce(phase === 'difficulty' ? DIFFICULTY_PROMPT : TOPIC_PROMPT);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [announce, phase]);

  const finish = useCallback(async (topicId: TopicId, difficultyId: DifficultyId, showRecognition = false) => {
    if (completingRef.current) return;
    completingRef.current = true;
    activeRef.current = false;
    acceptingRef.current = false;
    generationRef.current += 1;
    const generation = generationRef.current;
    setInterim('');
    cancel();
    updatePhase('starting');
    await sttControlsRef.current?.stop();
    // Leave the raw result visible before the conversation hides this dialog.
    if (showRecognition) await new Promise((resolve) => window.setTimeout(resolve, 1200));
    if (generation !== generationRef.current) return;
    callbacksRef.current.onDifficultySelect(difficultyId);
    callbacksRef.current.onSelect(topicId, difficultyId);
  }, [cancel, updatePhase]);

  const selectDifficulty = useCallback(async (difficultyId: DifficultyId) => {
    if (completingRef.current || phaseRef.current === 'switching-to-topic') return;
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    difficultyRef.current = difficultyId;
    callbacksRef.current.onDifficultySelect(difficultyId);
    acceptingRef.current = false;
    setInterim('');
    cancel();
    updatePhase('switching-to-topic');
    await sttControlsRef.current?.stop();
    if (!activeRef.current || generation !== generationRef.current) return;
    updatePhase('topic');
  }, [cancel, updatePhase]);

  const handleTranscript = useCallback((text: string, final: boolean) => {
    if (!activeRef.current || completingRef.current || !acceptingRef.current) return;
    setInterim(text);
    const apply = () => {
      if (!activeRef.current || completingRef.current) return;
      const stage = phaseRef.current;
      const parsed = parseSpokenConversationSelection(text, stage === 'topic' ? 'topic' : 'difficulty');
      if (final && (stage === 'difficulty' || stage === 'topic')) {
        setRecognizedSpeech((current) => ({
          ...current, [stage]: text,
          ...(stage === 'difficulty' && parsed.topicId ? { topic: text } : {}),
        }));
      }
      if (phaseRef.current === 'difficulty') {
        if (parsed.difficultyId && parsed.topicId) {
          void finish(parsed.topicId, parsed.difficultyId, true);
        } else if (parsed.difficultyId) {
          void selectDifficulty(parsed.difficultyId);
        } else if (final) {
          void announce('난이도를 잘 듣지 못했어요. 안내가 끝나면 초급, 중급, 고급 중 하나를 말씀해 주세요.');
        }
      } else if (phaseRef.current === 'topic') {
        if (parsed.topicId && difficultyRef.current) {
          void finish(parsed.topicId, difficultyRef.current, true);
        } else if (final) {
          void announce('주제를 잘 듣지 못했어요. 안내가 끝나면 음식점, 공항, 여행처럼 원하는 주제를 말씀해 주세요.');
        }
      }
    };
    if (final) apply();
    // Interim text is display-only. Never commit before the utterance ends.
  }, [announce, finish, selectDifficulty]);

  useEffect(() => {
    interimHandlerRef.current = (text) => handleTranscript(text, false);
    finalHandlerRef.current = (transcript) => handleTranscript(transcript.text.trim(), true);
  }, [handleTranscript]);

  const stop = useCallback(async () => {
    activeRef.current = false;
    acceptingRef.current = false;
    completingRef.current = false;
    generationRef.current += 1;
    difficultyRef.current = null;
    promptTextRef.current = '';
    setInterim('');
    setRecognizedSpeech({ difficulty: '', topic: '' });
    cancel();
    updatePhase('idle');
    await sttControlsRef.current?.stop();
  }, [cancel, updatePhase]);

  const selectTopicByTouch = useCallback((topicId: TopicId, difficultyId: DifficultyId) => {
    void finish(topicId, difficultyId);
  }, [finish]);

  const returnToDifficulty = useCallback(async () => {
    if (completingRef.current) return;
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    difficultyRef.current = null;
    acceptingRef.current = false;
    setInterim('');
    cancel();
    updatePhase('preparing-difficulty');
    await sttControlsRef.current?.stop();
    if (!activeRef.current || generation !== generationRef.current) return;
    updatePhase('difficulty');
  }, [cancel, updatePhase]);

  useEffect(() => {
    if (!enabled) {
      activeRef.current = false;
      acceptingRef.current = false;
      completingRef.current = false;
      generationRef.current += 1;
      difficultyRef.current = null;
      promptTextRef.current = '';
      cancel();
      void sttControlsRef.current?.stop();
      return;
    }
    activeRef.current = true;
    acceptingRef.current = false;
    completingRef.current = false;
    difficultyRef.current = null;
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    setError(null);
    setInterim('');
    setRecognizedSpeech({ difficulty: '', topic: '' });
    setPromptStatus('preparing');
    updatePhase('preparing-difficulty');
    const timer = window.setTimeout(() => {
      if (activeRef.current && generation === generationRef.current) updatePhase('difficulty');
    }, 0);
    return () => {
      activeRef.current = false;
      acceptingRef.current = false;
      generationRef.current += 1;
      window.clearTimeout(timer);
      cancel();
      void sttControlsRef.current?.stop();
    };
  }, [cancel, enabled, updatePhase]);

  return {
    phase, interim, recognizedSpeech, error,
    isRecording: stt.isRecording && promptStatus === null && activeRef.current,
    sttStatus: promptStatus ?? stt.status,
    selectDifficulty, selectTopicByTouch, returnToDifficulty, stop,
  };
}
