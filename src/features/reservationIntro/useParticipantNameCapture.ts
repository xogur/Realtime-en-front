'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useBrowserStt } from '@/hooks/useBrowserStt';
import { useBrowserTts } from '@/hooks/useBrowserTts';
import type { BrowserFinalTranscript } from '@/lib/stt';
import type { ParticipantSkipReason } from './types';
import { classifyConfirmation, extractSpokenName } from './participantName';

export type NameCapturePhase =
  | 'idle' | 'preparing' | 'prompting' | 'listening' | 'candidate' | 'confirming'
  | 'submitting' | 'welcoming' | 'completed' | 'error';

type Props = {
  enabled: boolean;
  eventId?: string;
  onConfirm: (name: string) => Promise<unknown>;
  onSkip: (reason: ParticipantSkipReason) => Promise<unknown>;
  onWelcomeComplete: () => void;
};

const delay = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

export function useParticipantNameCapture({
  enabled,
  eventId,
  onConfirm,
  onSkip,
  onWelcomeComplete,
}: Props) {
  const [phase, setPhase] = useState<NameCapturePhase>('idle');
  const [candidate, setCandidate] = useState('');
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [suggestedSkipReason, setSuggestedSkipReason] = useState<ParticipantSkipReason | null>(null);
  const modeRef = useRef<'name' | 'confirmation'>('name');
  const candidateRef = useRef('');
  const disposedRef = useRef(false);
  const startedEventRef = useRef<string | null>(null);
  const promptTextRef = useRef('');
  const promptFinishedRef = useRef(false);
  const turnRef = useRef(0);
  const sttControlsRef = useRef<{
    prepare: () => Promise<boolean>;
    startAndWaitUntilReady: (timeoutMs?: number) => Promise<boolean>;
    stop: () => Promise<void>;
  } | null>(null);
  const finalHandlerRef = useRef<(transcript: BrowserFinalTranscript) => void>(() => undefined);
  const actionRef = useRef({ onConfirm, onSkip, onWelcomeComplete });
  const { speak, cancel, isSpeaking } = useBrowserTts('participant-name');

  useEffect(() => {
    actionRef.current = { onConfirm, onSkip, onWelcomeComplete };
  }, [onConfirm, onSkip, onWelcomeComplete]);

  const fail = useCallback((message: string) => {
    setError(message);
    setPhase('error');
  }, []);

  const stt = useBrowserStt({
    language: 'ko-KR',
    publishRecordingState: false,
    onFinalTranscript: (transcript) => finalHandlerRef.current(transcript),
    onInterimTranscript: setInterim,
    onReadyChange: (ready) => {
      // The recognizer is intentionally started while the prompt is playing so
      // there is no dead air after TTS. Keep the visual prompt state until the
      // utterance ends, then switch to the explicit speaking-turn state.
      if (ready && promptFinishedRef.current) {
        setPhase(modeRef.current === 'name' ? 'listening' : 'confirming');
      }
    },
    onError: (code) => {
      if (code === 'MICROPHONE_DENIED') {
        setSuggestedSkipReason('microphone_denied');
        fail('마이크 권한이 필요해요. 권한을 허용하거나 아래에서 이름을 입력해 주세요.');
      } else if (code === 'BROWSER_STT_UNSUPPORTED') {
        setSuggestedSkipReason('speech_unsupported');
        fail('이 브라우저에서는 음성 이름 입력을 사용할 수 없어요.');
      }
      else if (code === 'MICROPHONE_UNAVAILABLE') fail('마이크를 사용할 수 없어요. 연결 상태를 확인해 주세요.');
    },
    onUnavailable: () => undefined,
    onSpeechStarted: cancel,
    getPlaybackState: () => ({ isPlaying: isSpeaking, text: promptTextRef.current }),
  });
  useEffect(() => {
    sttControlsRef.current = {
      prepare: stt.prepare,
      startAndWaitUntilReady: stt.startAndWaitUntilReady,
      stop: stt.stop,
    };
  }, [stt.prepare, stt.startAndWaitUntilReady, stt.stop]);

  const speakThenListen = useCallback(async (
    text: string,
    mode: 'name' | 'confirmation',
  ) => {
    const turn = turnRef.current + 1;
    turnRef.current = turn;
    await sttControlsRef.current?.stop();
    if (disposedRef.current || turn !== turnRef.current) return;
    modeRef.current = mode;
    promptTextRef.current = text;
    setInterim('');
    setPhase('preparing');
    const prepared = await sttControlsRef.current?.prepare();
    if (!prepared || disposedRef.current || turn !== turnRef.current) {
      if (!disposedRef.current) {
        fail('마이크를 준비하지 못했어요. 연결 상태를 확인하거나 아래에서 이름을 입력해 주세요.');
      }
      return;
    }
    promptFinishedRef.current = false;
    setPhase('prompting');
    // Wait for the recognizer's real `onstart`, then play the prompt while the
    // microphone stays open. Users can answer during TTS without a startup gap.
    const started = await sttControlsRef.current?.startAndWaitUntilReady();
    if (!started || disposedRef.current || turn !== turnRef.current) {
      if (!disposedRef.current && turn === turnRef.current) {
        fail('음성 인식을 시작하지 못했어요. 다시 시도하거나 이름 없이 시작해 주세요.');
      }
      return;
    }
    setPhase(mode === 'name' ? 'listening' : 'confirming');
    await speak(text, 'ko-KR');
    promptFinishedRef.current = true;
    if (disposedRef.current || turn !== turnRef.current) return;
    setPhase(modeRef.current === 'name' ? 'listening' : 'confirming');
  }, [fail, speak]);

  const retry = useCallback(async (reason: 'generic' | 'unrecognized' = 'generic') => {
    const nextAttempts = attempts + 1;
    setAttempts(nextAttempts);
    setCandidate('');
    candidateRef.current = '';
    setError(null);
    setSuggestedSkipReason(null);
    if (nextAttempts >= 3) {
      setSuggestedSkipReason('retry_exhausted');
      fail('이름을 정확히 확인하지 못했어요. 다시 시도하거나 이름 없이 시작해 주세요.');
      return;
    }
    const prompt = reason === 'unrecognized'
      ? '이름을 정확히 확인하지 못했어요. 이름이나 닉네임만 다시 한번 말씀해 주세요.'
      : '잘 듣지 못했어요. 이름이나 닉네임을 다시 말씀해 주세요.';
    await speakThenListen(prompt, 'name');
  }, [attempts, fail, speakThenListen]);

  const submitName = useCallback(async (providedName?: string) => {
    const name = providedName?.trim() || candidateRef.current;
    if (!name) return false;
    candidateRef.current = name;
    const turn = turnRef.current + 1;
    turnRef.current = turn;
    setCandidate(name);
    await sttControlsRef.current?.stop();
    cancel();
    setPhase('submitting');
    try {
      await actionRef.current.onConfirm(name);
      if (disposedRef.current || turn !== turnRef.current) return false;
      setPhase('welcoming');
      await speak(`${name}님, 환영합니다. 이제 영어 대화를 시작할게요.`, 'ko-KR');
      if (disposedRef.current || turn !== turnRef.current) return false;
      setPhase('completed');
      await delay(900);
      if (!disposedRef.current) actionRef.current.onWelcomeComplete();
      return true;
    } catch {
      fail('이름을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.');
      return false;
    }
  }, [cancel, fail, speak]);

  const submitCandidate = useCallback(
    () => submitName(),
    [submitName],
  );

  useEffect(() => {
    finalHandlerRef.current = (transcript) => {
      void (async () => {
        await sttControlsRef.current?.stop();
        const text = transcript.text.trim();
        setInterim('');
        if (modeRef.current === 'name') {
          const extraction = extractSpokenName(text);
          if (!extraction) {
            await retry('unrecognized');
            return;
          }
          const normalized = extraction.name;
          candidateRef.current = normalized;
          setCandidate(normalized);
          setPhase('candidate');
          await speakThenListen(
            `${normalized}님, 맞으신가요? 맞으면 맞다고, 다르면 다시 말하겠다고 말씀해 주세요.`,
            'confirmation',
          );
          return;
        }
        const answer = classifyConfirmation(text);
        if (answer === 'yes') await submitCandidate();
        else if (answer === 'no') await retry();
        else await speakThenListen('잘 듣지 못했어요. 맞으면 맞다고, 다르면 다시 말하겠다고 말씀해 주세요.', 'confirmation');
      })();
    };
  }, [retry, speakThenListen, submitCandidate]);

  const skip = useCallback(async (reason: ParticipantSkipReason = 'user_skipped') => {
    turnRef.current += 1;
    await sttControlsRef.current?.stop();
    cancel();
    setPhase('submitting');
    try {
      await actionRef.current.onSkip(reason);
      setPhase('completed');
    } catch {
      fail('이름 없이 시작하지 못했어요. 잠시 후 다시 눌러 주세요.');
    }
  }, [cancel, fail]);

  useEffect(() => {
    if (!enabled || !eventId) {
      turnRef.current += 1;
      startedEventRef.current = null;
      promptFinishedRef.current = false;
      void sttControlsRef.current?.stop();
      cancel();
      return;
    }
    if (startedEventRef.current === eventId) return;
    startedEventRef.current = eventId;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setAttempts(0);
      setCandidate('');
      setError(null);
      setSuggestedSkipReason(null);
      void speakThenListen(
        '안녕하세요. 제가 뭐라고 불러드리면 될까요? 지금 이름이나 닉네임을 말씀해 주세요.',
        'name',
      );
    });
    return () => {
      cancelled = true;
    };
  }, [cancel, enabled, eventId, speakThenListen]);

  useEffect(() => () => {
    disposedRef.current = true;
    turnRef.current += 1;
    void sttControlsRef.current?.stop();
    cancel();
  }, [cancel]);

  return {
    phase, candidate, interim, error, attempts, suggestedSkipReason,
    isRecording: stt.isRecording,
    confirm: submitCandidate,
    submitName,
    retry,
    skip,
  };
}
