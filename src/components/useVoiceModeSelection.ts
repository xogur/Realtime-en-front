'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useBrowserTts } from '@/hooks/useBrowserTts';
import { useOnboardingStt } from '@/hooks/useOnboardingStt';
import type { ConversationMode } from './ModeSelector';
import { parseSpokenModeSelection } from './voiceTopicSelection';

const MODE_PROMPT = '안내가 끝나면 프리토킹, 학습모드, 이야기 듣기 중에서 말씀해 주세요. 1번, 2번, 3번이나 터치로도 선택할 수 있어요.';
const PROMPT_PREPARATION_TIMEOUT_MS = 5000;
// Misheard answers before voice gives way to touch instead of asking again.
export const VOICE_SELECTION_MAX_MISSES = 3;

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
  const missesRef = useRef(0);
  const callbacksRef = useRef({ onSelect, learningReady });
  const sttRef = useRef<{
    prepare: () => Promise<boolean>;
    takeAudioInput: () => Promise<MediaStream | null>;
    startAndWaitUntilReady: () => Promise<boolean>;
    pause: () => Promise<void>;
    stop: () => Promise<void>;
  } | null>(null);
  const transcriptRef = useRef<(text: string) => void>(() => undefined);
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
      : code === 'VOICE_MISSES'
        ? '음성을 잘 알아듣지 못했어요. 화면을 터치해 선택해 주세요.'
        : '음성 선택을 사용할 수 없어요. 화면을 터치해 선택해 주세요.');
  }, [cancel]);

  // The kiosk's own Korean STT server: one final transcript per utterance, no
  // interim text. An empty or busy result keeps listening.
  const stt = useOnboardingStt({
    language: 'ko',
    hint: () => 'mode',
    onFinalTranscript: ({ text }) => transcriptRef.current(text),
    onReadyChange: () => undefined,
    onError: (code) => {
      if (activeRef.current && ['MICROPHONE_DENIED', 'MICROPHONE_UNAVAILABLE', 'STT_UNAVAILABLE'].includes(code)) failToTouch(code);
    },
    getPlaybackState: () => ({ isPlaying: isSpeaking, text: promptRef.current }),
  });
  useEffect(() => {
    sttRef.current = { prepare: stt.prepare, takeAudioInput: stt.takeAudioInput, startAndWaitUntilReady: stt.startAndWaitUntilReady, pause: stt.pause, stop: stt.stop };
  }, [stt.prepare, stt.takeAudioInput, stt.startAndWaitUntilReady, stt.pause, stt.stop]);

  const announce = useCallback(async (text: string) => {
    const generation = ++generationRef.current;
    const current = () => activeRef.current && generation === generationRef.current;
    acceptingRef.current = false;
    promptRef.current = text;
    setStatus('preparing');
    cancel();
    // Keep the microphone open across re-prompts; only listening stops.
    await sttRef.current?.pause();
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
    // Transfer the already-open device to learning before stopping capture.
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
    transcriptRef.current = (text) => {
      if (!activeRef.current || !acceptingRef.current || completingRef.current) return;
      setInterim(text);
      const mode = parseSpokenModeSelection(text);
      if (mode && (mode !== 'learning' || callbacksRef.current.learningReady)) void select(mode);
      else if (!mode && ++missesRef.current >= VOICE_SELECTION_MAX_MISSES) failToTouch('VOICE_MISSES');
      else void announce(mode === 'learning'
        ? '지금은 학습모드를 사용할 수 없어요. 프리토킹이나 이야기 듣기를 말씀하거나 화면을 터치해 주세요.'
        : '모드를 잘 듣지 못했어요. 프리토킹, 학습모드, 이야기 듣기 중 하나를 말씀해 주세요.');
    };
  }, [announce, failToTouch, select]);

  useEffect(() => {
    activeRef.current = enabled;
    acceptingRef.current = false;
    completingRef.current = false;
    missesRef.current = 0;
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
