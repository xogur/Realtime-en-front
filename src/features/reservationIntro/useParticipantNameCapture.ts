'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useBrowserStt } from '@/hooks/useBrowserStt';
import { useBrowserTts } from '@/hooks/useBrowserTts';
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
  const [recognizedSpeech, setRecognizedSpeech] = useState({ name: '', confirmation: '' });
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
  const finalHandlerRef = useRef<(transcript: { text: string }) => void>(() => undefined);
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
    onInterimTranscript: (text) => { if (promptFinishedRef.current) setInterim(text); },
    onReadyChange: () => undefined,
    onSpeechStarted: () => undefined,
    onUnavailable: () => {
      promptFinishedRef.current = false;
      fail('브라우저 음성 인식을 사용할 수 없어요. 다시 시도하거나 아래에서 이름을 입력해 주세요.');
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
      else if (code === 'STT_UNAVAILABLE') fail('음성 인식 서버에 연결하지 못했어요. 다시 시도하거나 이름을 입력해 주세요.');
      else if (code === 'STT_NO_RESULT') fail('이름을 잘 듣지 못했어요. 다시 시도하거나 이름을 입력해 주세요.');
    },
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
    promptFinishedRef.current = false;
    await sttControlsRef.current?.stop();
    if (disposedRef.current || turn !== turnRef.current) return;
    modeRef.current = mode;
    promptTextRef.current = text;
    setInterim('');
    setPhase('preparing');
    const prepared = await sttControlsRef.current?.prepare();
    if (!prepared || disposedRef.current || turn !== turnRef.current) {
      if (!disposedRef.current && turn === turnRef.current) {
        fail('마이크를 준비하지 못했어요. 연결 상태를 확인하거나 아래에서 이름을 입력해 주세요.');
      }
      return;
    }
    promptFinishedRef.current = false;
    setPhase(text ? 'prompting' : 'preparing');
    // Permission preparation does not start recognition. Listen only after TTS.
    if (text) await speak(text, 'ko-KR');
    if (disposedRef.current || turn !== turnRef.current) return;
    await delay(250);
    if (disposedRef.current || turn !== turnRef.current) return;
    const started = await sttControlsRef.current?.startAndWaitUntilReady();
    if (!started || disposedRef.current || turn !== turnRef.current) {
      if (!disposedRef.current && turn === turnRef.current) {
        fail('음성 인식을 시작하지 못했어요. 다시 시도하거나 이름 없이 시작해 주세요.');
      }
      return;
    }
    promptFinishedRef.current = true;
    setPhase(modeRef.current === 'name' ? 'listening' : 'confirming');
  }, [fail, speak]);

  const retry = useCallback(async (reason: 'generic' | 'unrecognized' | 'immediate' = 'generic') => {
    const turn = ++turnRef.current;
    promptFinishedRef.current = false;
    setPhase('preparing');
    cancel();
    await sttControlsRef.current?.stop();
    if (disposedRef.current || turn !== turnRef.current) return;
    const nextAttempts = reason === 'immediate' ? 0 : attempts + 1;
    setAttempts(nextAttempts);
    setCandidate('');
    candidateRef.current = '';
    setError(null);
    setSuggestedSkipReason(null);
    if (reason === 'immediate') {
      setRecognizedSpeech({ name: '', confirmation: '' });
      await speakThenListen('', 'name');
      return;
    }
    if (nextAttempts >= 3) {
      setSuggestedSkipReason('retry_exhausted');
      fail('이름을 정확히 확인하지 못했어요. 다시 시도하거나 이름 없이 시작해 주세요.');
      return;
    }
    const prompt = reason === 'unrecognized'
      ? '이름만 다시 말씀해 주세요.'
      : '다시 말씀해 주세요.';
    await speakThenListen(prompt, 'name');
  }, [attempts, cancel, fail, speakThenListen]);

  const submitName = useCallback(async (providedName?: string) => {
    const name = providedName?.trim() || candidateRef.current;
    if (!name) return false;
    candidateRef.current = name;
    const turn = turnRef.current + 1;
    turnRef.current = turn;
    promptFinishedRef.current = false;
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
      if (!enabled || disposedRef.current || !promptFinishedRef.current) return;
      const turn = ++turnRef.current;
      promptFinishedRef.current = false;
      cancel();
      const stage = modeRef.current;
      setRecognizedSpeech((current) => ({ ...current, [stage]: transcript.text.trim() }));
      void (async () => {
        await sttControlsRef.current?.stop();
        if (disposedRef.current || turn !== turnRef.current) return;
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
            `${normalized}님인가요?`,
            'confirmation',
          );
          return;
        }
        const answer = classifyConfirmation(text);
        if (answer === 'yes') await submitCandidate();
        else {
          const correctionText = text.replace(/^(?:아니요|아니에요|아닙니다|아뇨|아니)[,\s]+/, '').trim();
          const correction = extractSpokenName(correctionText);
          // Explicit restatements can replace the candidate in one utterance.
          // Do not interpret arbitrary acknowledgements as a new bare name.
          if (correction?.confidence === 'high') {
            candidateRef.current = correction.name;
            setCandidate(correction.name);
            setRecognizedSpeech((current) => ({ ...current, name: text }));
            await speakThenListen(`${correction.name}님인가요?`, 'confirmation');
          } else if (answer === 'no') await retry();
          else await speakThenListen('이 이름이 맞나요?', 'confirmation');
        }
      })();
    };
  }, [cancel, enabled, retry, speakThenListen, submitCandidate]);

  const skip = useCallback(async (reason: ParticipantSkipReason = 'user_skipped') => {
    promptFinishedRef.current = false;
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
      setRecognizedSpeech({ name: '', confirmation: '' });
      setError(null);
      setSuggestedSkipReason(null);
      void speakThenListen(
        '안녕하세요. 이름이나 닉네임을 말씀해 주세요.',
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
    phase, candidate, interim, recognizedSpeech, error, attempts, suggestedSkipReason,
    isRecording: stt.isRecording,
    sttStatus: stt.status,
    confirm: submitCandidate,
    submitName,
    retry,
    skip,
  };
}
