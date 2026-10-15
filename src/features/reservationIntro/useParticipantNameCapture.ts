'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useBrowserTts } from '@/hooks/useBrowserTts';
import { useOnboardingStt } from '@/hooks/useOnboardingStt';
import type { ParticipantSkipReason } from './types';
import { classifyConfirmation, extractSpokenName } from './participantName';
import { preferredSpokenName, spokenNameCandidates } from './nameCandidates';

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

// Without speech, typing or touch for this long, start without a name so an
// absent or silent guest never keeps the program locked. The hard limit also
// ends an endless confirmation loop caused by background noise.
export const NAME_CAPTURE_IDLE_TIMEOUT_MS = 60_000;
export const NAME_CAPTURE_MAX_DURATION_MS = 180_000;
// Failed rounds (unrecognized speech or refused names) before the step is skipped.
export const NAME_CAPTURE_MAX_ATTEMPTS = 3;
const NAME_CAPTURE_SETTLED_PHASES: NameCapturePhase[] = ['submitting', 'welcoming', 'completed'];

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
  // Sound-alike spellings of what was heard (Crisper turns 하은 into 아은): shown as buttons.
  const [alternatives, setAlternatives] = useState<string[]>([]);
  const [activityTick, setActivityTick] = useState(0);
  const noteActivity = useCallback(() => setActivityTick((value) => value + 1), []);
  const modeRef = useRef<'name' | 'confirmation'>('name');
  const phaseRef = useRef<NameCapturePhase>('idle');
  const candidateRef = useRef('');
  // Every spelling heard or derived in this capture, best first, and the ones the guest refused.
  const poolRef = useRef<string[]>([]);
  const rejectedRef = useRef(new Set<string>());
  const proposedAlternativeRef = useRef(false);
  // Why the microphone could not be prepared, so the generic message does not replace it.
  const prepareErrorRef = useRef<string | null>(null);
  // Set once skip() exists: recognition that keeps failing moves on without a name.
  const autoSkipRef = useRef<(reason: ParticipantSkipReason) => Promise<void>>(async () => undefined);
  const disposedRef = useRef(false);
  const startedEventRef = useRef<string | null>(null);
  const promptTextRef = useRef('');
  const promptFinishedRef = useRef(false);
  const turnRef = useRef(0);
  const sttControlsRef = useRef<{
    prepare: () => Promise<boolean>;
    startAndWaitUntilReady: (timeoutMs?: number) => Promise<boolean>;
    pause: () => Promise<void>;
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

  const showAlternatives = useCallback((current: string) => {
    setAlternatives(poolRef.current.filter((name) => name !== current && !rejectedRef.current.has(name)).slice(0, 3));
  }, []);

  /**
   * Adds a newly heard name to the pool and returns the spelling to ask about. A spelling
   * that this and an earlier attempt both produced goes first, and a refused one is never
   * asked again: hearing "손아린" twice after "아니요" asks about "손하린" instead. A heard
   * spelling that cannot be a name ("관도현", "권세봉") is asked as its likely name.
   */
  const rememberHeard = useCallback((name: string) => {
    const preferred = preferredSpokenName(name);
    const fresh = [...new Set([preferred, ...spokenNameCandidates(name, 4)])];
    const previous = poolRef.current;
    const agreed = fresh.filter((candidate) => previous.includes(candidate));
    poolRef.current = [...new Set([...agreed, ...fresh, ...previous])].slice(0, 8);
    return poolRef.current.find((candidate) => !rejectedRef.current.has(candidate)) ?? null;
  }, []);

  // The kiosk's own Korean STT server (names never go to a browser cloud
  // service): one final transcript per utterance, no interim text.
  const stt = useOnboardingStt({
    language: 'ko',
    // A name answer only; "네/아니요" confirmations decode without a question.
    hint: () => (modeRef.current === 'name' ? 'name' : null),
    onFinalTranscript: (transcript) => {
      noteActivity();
      finalHandlerRef.current(transcript);
    },
    onReadyChange: () => undefined,
    onError: (code) => {
      if (code === 'MICROPHONE_DENIED') {
        setSuggestedSkipReason('microphone_denied');
        prepareErrorRef.current = '마이크 권한이 필요해요. 권한을 허용하거나 아래에서 이름을 입력해 주세요.';
        fail(prepareErrorRef.current);
      }
      else if (code === 'MICROPHONE_UNAVAILABLE') {
        prepareErrorRef.current = '마이크를 사용할 수 없어요. 연결 상태를 확인해 주세요.';
        fail(prepareErrorRef.current);
      }
      // A touch on "다시 시도" lets Chrome start sound and the microphone.
      else if (code === 'AUDIO_GESTURE_REQUIRED') {
        prepareErrorRef.current = '소리와 마이크를 켜려면 아래 "다시 시도"를 한 번 눌러 주세요.';
        fail(prepareErrorRef.current);
      }
      // The recognizer is down: the name step is skipped instead of waiting for a touch.
      else if (code === 'STT_UNAVAILABLE') void autoSkipRef.current('speech_unsupported');
      // STT_NO_RESULT / STT_BUSY: noise or a busy server; keep listening.
    },
    getPlaybackState: () => ({ isPlaying: isSpeaking, text: promptTextRef.current }),
  });
  useEffect(() => {
    sttControlsRef.current = {
      prepare: stt.prepare,
      startAndWaitUntilReady: stt.startAndWaitUntilReady,
      pause: stt.pause,
      stop: stt.stop,
    };
  }, [stt.prepare, stt.startAndWaitUntilReady, stt.pause, stt.stop]);

  const speakThenListen = useCallback(async (
    text: string,
    mode: 'name' | 'confirmation',
  ) => {
    const turn = turnRef.current + 1;
    turnRef.current = turn;
    promptFinishedRef.current = false;
    // Keep the microphone open across prompts; only listening stops.
    await sttControlsRef.current?.pause();
    if (disposedRef.current || turn !== turnRef.current) return;
    modeRef.current = mode;
    promptTextRef.current = text;
    setInterim('');
    setPhase('preparing');
    prepareErrorRef.current = null;
    const prepared = await sttControlsRef.current?.prepare();
    if (!prepared || disposedRef.current || turn !== turnRef.current) {
      if (!disposedRef.current && turn === turnRef.current) {
        fail(prepareErrorRef.current ?? '마이크를 준비하지 못했어요. 연결 상태를 확인하거나 아래에서 이름을 입력해 주세요.');
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
    await sttControlsRef.current?.pause();
    if (disposedRef.current || turn !== turnRef.current) return;
    const nextAttempts = reason === 'immediate' ? 0 : attempts + 1;
    setAttempts(nextAttempts);
    if (reason === 'immediate' && candidateRef.current) rejectedRef.current.add(candidateRef.current);
    setCandidate('');
    candidateRef.current = '';
    showAlternatives('');
    setError(null);
    setSuggestedSkipReason(null);
    if (reason === 'immediate') {
      setRecognizedSpeech({ name: '', confirmation: '' });
      await speakThenListen('', 'name');
      return;
    }
    if (nextAttempts >= NAME_CAPTURE_MAX_ATTEMPTS) {
      // Recognition keeps failing: move on without a name rather than loop.
      await autoSkipRef.current('retry_exhausted');
      return;
    }
    const offered = poolRef.current.some((name) => !rejectedRef.current.has(name));
    const prompt = offered
      ? '아래에서 맞는 이름을 누르거나, 이름만 다시 말씀해 주세요.'
      : reason === 'unrecognized'
        ? '이름만 다시 말씀해 주세요.'
        : '다시 말씀해 주세요.';
    await speakThenListen(prompt, 'name');
  }, [attempts, cancel, fail, showAlternatives, speakThenListen]);

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

  /** A touched sound-alike button is an explicit choice: save it without another question. */
  const chooseAlternative = useCallback((name: string) => {
    noteActivity();
    return submitName(name);
  }, [noteActivity, submitName]);

  useEffect(() => {
    finalHandlerRef.current = (transcript) => {
      if (!enabled || disposedRef.current || !promptFinishedRef.current) return;
      const turn = ++turnRef.current;
      promptFinishedRef.current = false;
      cancel();
      const stage = modeRef.current;
      setRecognizedSpeech((current) => ({ ...current, [stage]: transcript.text.trim() }));
      void (async () => {
        await sttControlsRef.current?.pause();
        if (disposedRef.current || turn !== turnRef.current) return;
        const text = transcript.text.trim();
        setInterim('');
        if (modeRef.current === 'name') {
          const extraction = extractSpokenName(text);
          if (!extraction) {
            await retry('unrecognized');
            return;
          }
          const normalized = rememberHeard(extraction.name);
          // Every spelling of this was already refused: ask again instead of repeating it.
          if (!normalized) {
            await retry('unrecognized');
            return;
          }
          proposedAlternativeRef.current = false;
          candidateRef.current = normalized;
          setCandidate(normalized);
          showAlternatives(normalized);
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
            rejectedRef.current.add(candidateRef.current);
            const corrected = rememberHeard(correction.name) ?? correction.name;
            candidateRef.current = corrected;
            setCandidate(corrected);
            showAlternatives(corrected);
            setRecognizedSpeech((current) => ({ ...current, name: text }));
            await speakThenListen(`${corrected}님인가요?`, 'confirmation');
          } else if (answer === 'no') {
            rejectedRef.current.add(candidateRef.current);
            const next = poolRef.current.find((name) => !rejectedRef.current.has(name));
            // One sound-alike guess by voice (top two held the name 91% of the time);
            // after that the guest picks from the buttons or says the name again.
            if (next && !proposedAlternativeRef.current) {
              proposedAlternativeRef.current = true;
              candidateRef.current = next;
              setCandidate(next);
              showAlternatives(next);
              await speakThenListen(`그럼 ${next}님인가요?`, 'confirmation');
            } else await retry();
          }
          else await speakThenListen('이 이름이 맞나요?', 'confirmation');
        }
      })();
    };
  }, [cancel, enabled, rememberHeard, retry, showAlternatives, speakThenListen, submitCandidate]);

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
    let begun = false;
    queueMicrotask(() => {
      if (cancelled) return;
      begun = true;
      setAttempts(0);
      poolRef.current = [];
      rejectedRef.current = new Set();
      proposedAlternativeRef.current = false;
      setAlternatives([]);
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
      // Cancelled before the prompt began (StrictMode remount): let the next run start it.
      if (!begun && startedEventRef.current === eventId) startedEventRef.current = null;
    };
  }, [cancel, enabled, eventId, speakThenListen]);

  const skipRef = useRef(skip);
  useEffect(() => {
    autoSkipRef.current = async (reason) => {
      if (disposedRef.current || NAME_CAPTURE_SETTLED_PHASES.includes(phaseRef.current)) return;
      setSuggestedSkipReason(reason);
      const turn = ++turnRef.current;
      promptFinishedRef.current = false;
      await sttControlsRef.current?.pause();
      await speak('괜찮아요. 이름 없이 시작할게요.', 'ko-KR');
      if (disposedRef.current || turn !== turnRef.current) return;
      await skip(reason);
    };
  }, [skip, speak]);
  useEffect(() => {
    skipRef.current = skip;
  }, [skip]);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  const settled = NAME_CAPTURE_SETTLED_PHASES.includes(phase);
  const captureActive = enabled && Boolean(eventId) && !settled;

  useEffect(() => {
    if (!captureActive) return;
    const timer = window.setTimeout(
      () => {
        if (!NAME_CAPTURE_SETTLED_PHASES.includes(phaseRef.current)) void skipRef.current('timeout');
      },
      NAME_CAPTURE_IDLE_TIMEOUT_MS,
    );
    return () => window.clearTimeout(timer);
  }, [activityTick, captureActive]);

  useEffect(() => {
    if (!enabled || !eventId) return;
    const timer = window.setTimeout(() => {
      if (!NAME_CAPTURE_SETTLED_PHASES.includes(phaseRef.current)) void skipRef.current('timeout');
    }, NAME_CAPTURE_MAX_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [enabled, eventId]);

  useEffect(() => {
    // A remount (React StrictMode in development) must revive the hook: staying disposed
    // left the name screen silent, with no prompt and no microphone.
    disposedRef.current = false;
    return () => {
      disposedRef.current = true;
      turnRef.current += 1;
      void sttControlsRef.current?.stop();
      cancel();
    };
  }, [cancel]);

  return {
    phase, candidate, interim, recognizedSpeech, error, attempts, suggestedSkipReason,
    alternatives,
    chooseAlternative,
    noteActivity,
    isRecording: stt.isRecording,
    sttStatus: stt.status,
    confirm: submitCandidate,
    submitName,
    retry,
    skip,
  };
}
