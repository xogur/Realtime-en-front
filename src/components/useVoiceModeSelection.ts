'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useBrowserStt } from '@/hooks/useBrowserStt';
import { useBrowserTts } from '@/hooks/useBrowserTts';
import type { ConversationMode } from './ModeSelector';
import { parseSpokenModeSelection } from './voiceTopicSelection';

const MODE_PROMPT = '안내가 끝나면 프리토킹 또는 학습모드라고 말씀해 주세요. 1번, 2번이나 터치로도 선택할 수 있어요.';
const PROMPT_PREPARATION_TIMEOUT_MS = 5000;

type Props = {
  enabled: boolean;
  learningReady: boolean;
  onSelect: (mode: ConversationMode, preparedInput?: MediaStream) => void;
};

export function useVoiceModeSelection({ enabled, learningReady, onSelect }: Props) {
  const [status, setStatus] = useState<'preparing' | 'prompting' | 'listening' | 'unavailable' | 'selected'>('preparing');
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);
  const activeRef = useRef(false);
  const acceptingRef = useRef(false);
  const completingRef = useRef(false);
  const generationRef = useRef(0);
  const promptRef = useRef('');
  const callbacksRef = useRef({ onSelect, learningReady });
  const sttRef = useRef<{
    prepare: () => Promise<boolean>;
    takeAudioInput: () => Promise<MediaStream | null>;
    startAndWaitUntilReady: () => Promise<boolean>;
    stop: () => Promise<void>;
  } | null>(null);
  const transcriptRef = useRef<(text: string, final: boolean) => void>(() => undefined);
  const { speak, cancel, isSpeaking } = useBrowserTts('mode-selector');

  useEffect(() => { callbacksRef.current = { onSelect, learningReady }; }, [onSelect, learningReady]);

  const failToTouch = useCallback((code?: string) => {
    activeRef.current = false;
    acceptingRef.current = false;
    generationRef.current += 1;
    cancel();
    void sttRef.current?.stop();
    setStatus('unavailable');
    setError(code === 'MICROPHONE_DENIED'
      ? '마이크 권한이 없어 음성 선택을 사용할 수 없어요. 화면을 터치해 선택해 주세요.'
      : '음성 선택을 사용할 수 없어요. 화면을 터치해 선택해 주세요.');
  }, [cancel]);

  const stt = useBrowserStt({
    language: 'ko-KR',
    publishRecordingState: false,
    onFinalTranscript: ({ text }) => transcriptRef.current(text, true),
    onInterimTranscript: (text) => transcriptRef.current(text, false),
    onReadyChange: () => undefined,
    onError: (code) => {
      if (activeRef.current && ['MICROPHONE_DENIED', 'MICROPHONE_UNAVAILABLE', 'BROWSER_STT_UNSUPPORTED', 'STT_UNAVAILABLE'].includes(code)) failToTouch(code);
    },
    onUnavailable: () => { if (activeRef.current) failToTouch(); },
    onSpeechStarted: () => undefined,
    getPlaybackState: () => ({ isPlaying: isSpeaking, text: promptRef.current }),
  });
  useEffect(() => {
    sttRef.current = { prepare: stt.prepare, takeAudioInput: stt.takeAudioInput, startAndWaitUntilReady: stt.startAndWaitUntilReady, stop: stt.stop };
  }, [stt.prepare, stt.takeAudioInput, stt.startAndWaitUntilReady, stt.stop]);

  const announce = useCallback(async (text: string) => {
    const generation = ++generationRef.current;
    const current = () => activeRef.current && generation === generationRef.current;
    acceptingRef.current = false;
    promptRef.current = text;
    setStatus('preparing');
    cancel();
    await sttRef.current?.stop();
    if (!current()) return;
    // Mode guidance is only useful at entry. A slow device reopen must not
    // turn into an announcement after the user has moved on with touch.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const prepared = await Promise.race([
      sttRef.current?.prepare(),
      new Promise<false>(resolve => { timer = setTimeout(() => resolve(false), PROMPT_PREPARATION_TIMEOUT_MS); }),
    ]).finally(() => { if (timer) clearTimeout(timer); });
    if (!current()) return;
    if (!prepared) { failToTouch(); return; }
    setStatus('prompting');
    const spoken = await speak(text, 'ko-KR');
    if (!current()) return;
    if (!spoken) { failToTouch(); return; }
    await new Promise((resolve) => window.setTimeout(resolve, 250));
    if (!current()) return;
    const ready = await sttRef.current?.startAndWaitUntilReady();
    if (!current()) return;
    if (!ready) { failToTouch(); return; }
    acceptingRef.current = true;
    setStatus('listening');
  }, [cancel, failToTouch, speak]);

  const select = useCallback(async (mode: ConversationMode) => {
    if (completingRef.current || (mode === 'learning' && !callbacksRef.current.learningReady)) return;
    completingRef.current = true;
    activeRef.current = false;
    acceptingRef.current = false;
    const generation = ++generationRef.current;
    cancel();
    setStatus('selected');
    // Transfer the already-open device to learning before stopping recognition.
    // Closing and reopening it here can cost several seconds on physical kiosks.
    const input = mode === 'learning' ? await sttRef.current?.takeAudioInput() : null;
    if (generation !== generationRef.current) {
      input?.getTracks().forEach(track => track.stop());
      return;
    }
    await sttRef.current?.stop();
    if (generation === generationRef.current) {
      if (input) callbacksRef.current.onSelect(mode, input);
      else callbacksRef.current.onSelect(mode);
    } else input?.getTracks().forEach(track => track.stop());
  }, [cancel]);

  useEffect(() => {
    transcriptRef.current = (text, final) => {
      if (!activeRef.current || !acceptingRef.current || completingRef.current) return;
      setInterim(text);
      if (!final) return;
      const mode = parseSpokenModeSelection(text);
      if (mode && (mode !== 'learning' || callbacksRef.current.learningReady)) void select(mode);
      else void announce(mode === 'learning'
        ? '지금은 학습모드를 사용할 수 없어요. 프리토킹을 말씀하거나 화면을 터치해 주세요.'
        : '모드를 잘 듣지 못했어요. 프리토킹 또는 학습모드 중 하나를 말씀해 주세요.');
    };
  }, [announce, select]);

  useEffect(() => {
    activeRef.current = enabled;
    acceptingRef.current = false;
    completingRef.current = false;
    generationRef.current += 1;
    if (!enabled) return;
    const timer = window.setTimeout(() => {
      setError(null);
      setInterim('');
      void announce(MODE_PROMPT);
    }, 0);
    return () => {
      activeRef.current = false;
      acceptingRef.current = false;
      generationRef.current += 1;
      window.clearTimeout(timer);
      cancel();
      void sttRef.current?.stop();
    };
  }, [announce, cancel, enabled]);

  return { status, interim, error, select };
}
