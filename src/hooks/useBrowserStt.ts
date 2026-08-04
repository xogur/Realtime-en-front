import { useCallback, useEffect, useRef } from 'react';
import { useStore } from '@/stores/useStore';
import {
  assembleBrowserSpeechEvent,
  getConfiguredBrowserSttConfig,
  isLateBrowserFinal,
  isLikelyPlaybackEcho,
  mapBrowserSpeechError,
  type BrowserSpeechResultEvent,
} from '@/lib/stt';

type BrowserSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  processLocally?: boolean;
  phrases?: unknown[];
  onstart: (() => void) | null;
  onspeechstart: (() => void) | null;
  onspeechend: (() => void) | null;
  onaudioend: (() => void) | null;
  onnomatch: (() => void) | null;
  onresult: ((event: BrowserSpeechResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type BrowserSpeechWindow = Window & {
  SpeechRecognition?: new () => BrowserSpeechRecognition;
  webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
  SpeechRecognitionPhrase?: new (phrase: string, boost: number) => unknown;
};

type BrowserSttOptions = {
  onFinalTranscript: (transcript: string) => void;
  onInterimTranscript: (transcript: string) => void;
  onReadyChange: (ready: boolean) => void;
  onError: (code: string) => void;
  onUnavailable: () => void;
  onSpeechStarted: () => void;
  getPlaybackState: () => { isPlaying: boolean; text: string };
};

const CONFIG = getConfiguredBrowserSttConfig();
const RESTART_DELAYS_MS = [50, 150, 500, 1_000];
const MAX_RESTART_ATTEMPTS = 10;

function detachRecognition(recognition: BrowserSpeechRecognition): void {
  recognition.onstart = null;
  recognition.onspeechstart = null;
  recognition.onspeechend = null;
  recognition.onaudioend = null;
  recognition.onnomatch = null;
  recognition.onresult = null;
  recognition.onerror = null;
  recognition.onend = null;
}

export function useBrowserStt(options: BrowserSttOptions) {
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const desiredRef = useRef(false);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restartAttemptRef = useRef(0);
  const utteranceRef = useRef<{ text: string; lastChangedAt: number } | null>(null);
  const finalPrefixRef = useRef('');
  const lastCommitRef = useRef<{ text: string; at: number } | null>(null);
  const speechStartedRef = useRef(false);
  const startRecognitionRef = useRef<() => boolean>(() => false);
  const optionsRef = useRef(options);
  const isRecording = useStore((state) => state.isRecording);
  const setRecording = useStore((state) => state.setRecording);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = null;
  }, []);

  const scheduleRestart = useCallback(() => {
    if (!desiredRef.current || restartTimerRef.current) return;
    const attempt = restartAttemptRef.current;
    if (attempt >= MAX_RESTART_ATTEMPTS) {
      desiredRef.current = false;
      setRecording(false);
      optionsRef.current.onReadyChange(false);
      optionsRef.current.onError('STT_UNAVAILABLE');
      optionsRef.current.onUnavailable();
      return;
    }
    restartAttemptRef.current += 1;
    restartTimerRef.current = setTimeout(() => {
      restartTimerRef.current = null;
      if (!desiredRef.current || recognitionRef.current) return;
      startRecognitionRef.current();
    }, RESTART_DELAYS_MS[Math.min(attempt, RESTART_DELAYS_MS.length - 1)]);
  }, [setRecording]);

  const commitTranscript = useCallback((recognition: BrowserSpeechRecognition, text: string) => {
    const transcript = text.replace(/\s+/g, ' ').trim();
    if (!transcript) return;
    clearSilenceTimer();
    utteranceRef.current = null;
    finalPrefixRef.current = '';
    speechStartedRef.current = false;
    lastCommitRef.current = { text: transcript, at: Date.now() };
    optionsRef.current.onInterimTranscript('');
    optionsRef.current.onFinalTranscript(transcript);
    try {
      (recognitionRef.current ?? recognition).stop();
    } catch {
      // The recognizer may already be ending; onend will recycle it.
    }
  }, [clearSilenceTimer]);

  const startRecognition = useCallback((): boolean => {
    if (recognitionRef.current) return true;
    const speechWindow = window as BrowserSpeechWindow;
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      desiredRef.current = false;
      setRecording(false);
      optionsRef.current.onReadyChange(false);
      optionsRef.current.onError('BROWSER_STT_UNSUPPORTED');
      return false;
    }

    const recognition = new Recognition();
    let restartIsFailure = false;
    recognition.lang = CONFIG.language;
    recognition.continuous = CONFIG.continuous;
    recognition.interimResults = CONFIG.interimResults;
    recognition.maxAlternatives = CONFIG.maxAlternatives;
    if ('processLocally' in recognition) recognition.processLocally = CONFIG.processLocally;
    if (CONFIG.phrases.length && 'phrases' in recognition && speechWindow.SpeechRecognitionPhrase) {
      recognition.phrases = CONFIG.phrases.map(
        (phrase) => new speechWindow.SpeechRecognitionPhrase!(phrase, 5),
      );
    }

    recognitionRef.current = recognition;
    recognition.onstart = () => {
      if (recognitionRef.current !== recognition) return;
      setRecording(true);
      optionsRef.current.onReadyChange(true);
    };
    recognition.onspeechstart = () => {
      if (recognitionRef.current !== recognition) return;
      clearSilenceTimer();
      const pendingUtterance = utteranceRef.current;
      utteranceRef.current = pendingUtterance
        ? { ...pendingUtterance, lastChangedAt: Date.now() }
        : { text: '', lastChangedAt: Date.now() };
      if (!pendingUtterance) {
        finalPrefixRef.current = '';
        speechStartedRef.current = false;
        optionsRef.current.onInterimTranscript('');
      }
    };
    recognition.onspeechend = () => undefined;
    recognition.onaudioend = () => undefined;
    recognition.onnomatch = () => undefined;
    recognition.onresult = (event) => {
      if (recognitionRef.current !== recognition || !desiredRef.current) return;
      const result = assembleBrowserSpeechEvent(event);
      const finalText = result.finals.join(' ').trim();
      const heard = (result.interim || finalText).trim();
      if (!heard) return;

      const playback = optionsRef.current.getPlaybackState();
      const playbackEcho = playback.isPlaying
        && Boolean(playback.text)
        && isLikelyPlaybackEcho(heard, playback.text);
      if (playbackEcho) {
        clearSilenceTimer();
        utteranceRef.current = null;
        finalPrefixRef.current = '';
        speechStartedRef.current = false;
        optionsRef.current.onInterimTranscript('');
        if (finalText) {
          try { recognition.stop(); } catch { /* onend will recycle */ }
        }
        return;
      }

      restartAttemptRef.current = 0;
      if (!speechStartedRef.current) {
        speechStartedRef.current = true;
        optionsRef.current.onSpeechStarted();
      }

      if (finalText) {
        const lastCommit = lastCommitRef.current;
        if (lastCommit && isLateBrowserFinal(
          lastCommit.text,
          finalText,
          lastCommit.at,
          Date.now(),
        )) {
          return;
        }
        const normalizedFinal = finalText.replace(/\s+/g, ' ').trim();
        const prefix = finalPrefixRef.current;
        if (!prefix) {
          finalPrefixRef.current = normalizedFinal;
        } else if (normalizedFinal.includes(prefix)) {
          finalPrefixRef.current = normalizedFinal;
        } else if (!prefix.includes(normalizedFinal)) {
          finalPrefixRef.current = `${prefix} ${normalizedFinal}`.trim();
        }
        const pendingText = finalPrefixRef.current;
        optionsRef.current.onInterimTranscript(pendingText);
        utteranceRef.current = { text: pendingText, lastChangedAt: Date.now() };
        clearSilenceTimer();
        silenceTimerRef.current = setTimeout(() => {
          silenceTimerRef.current = null;
          const utterance = utteranceRef.current;
          if (!utterance || Date.now() - utterance.lastChangedAt < CONFIG.silenceMs) return;
          commitTranscript(recognition, utterance.text);
        }, CONFIG.silenceMs);
        return;
      }

      const normalizedInterim = result.interim.replace(/\s+/g, ' ').trim();
      if (!normalizedInterim) return;
      const pendingText = [finalPrefixRef.current, normalizedInterim].filter(Boolean).join(' ');
      optionsRef.current.onInterimTranscript(pendingText);
      const current = utteranceRef.current;
      utteranceRef.current = {
        text: pendingText,
        lastChangedAt: current?.text === pendingText
          ? current.lastChangedAt
          : Date.now(),
      };
      clearSilenceTimer();
      const remaining = Math.max(
        0,
        utteranceRef.current.lastChangedAt + CONFIG.silenceMs - Date.now(),
      );
      silenceTimerRef.current = setTimeout(() => {
        silenceTimerRef.current = null;
        const utterance = utteranceRef.current;
        if (!utterance || Date.now() - utterance.lastChangedAt < CONFIG.silenceMs) return;
        commitTranscript(recognition, utterance.text);
      }, remaining);
    };
    recognition.onerror = (event) => {
      if (recognitionRef.current !== recognition) return;
      const code = mapBrowserSpeechError(event.error);
      if (!code) return;
      restartIsFailure = code === 'STT_UNAVAILABLE';
      optionsRef.current.onInterimTranscript('');
      if (code === 'STT_NO_RESULT') {
        clearSilenceTimer();
        utteranceRef.current = null;
        finalPrefixRef.current = '';
        speechStartedRef.current = false;
        return;
      }
      if (code === 'MICROPHONE_DENIED' || code === 'MICROPHONE_UNAVAILABLE') {
        desiredRef.current = false;
        setRecording(false);
      }
      optionsRef.current.onReadyChange(false);
      optionsRef.current.onError(code);
    };
    recognition.onend = () => {
      if (recognitionRef.current !== recognition) return;
      const hasPendingTranscript = Boolean(utteranceRef.current?.text);
      if (!hasPendingTranscript) clearSilenceTimer();
      detachRecognition(recognition);
      recognitionRef.current = null;
      if (!hasPendingTranscript) {
        utteranceRef.current = null;
        finalPrefixRef.current = '';
        speechStartedRef.current = false;
        optionsRef.current.onInterimTranscript('');
      }
      if (desiredRef.current) {
        // Chrome periodically ends a healthy recognizer (including after no-speech).
        // Only service/runtime failures should consume the fallback retry budget.
        if (!restartIsFailure) restartAttemptRef.current = 0;
        scheduleRestart();
        return;
      }
      setRecording(false);
    };

    try {
      recognition.start();
      return true;
    } catch {
      detachRecognition(recognition);
      recognitionRef.current = null;
      scheduleRestart();
      return false;
    }
  }, [clearSilenceTimer, commitTranscript, scheduleRestart, setRecording]);

  useEffect(() => {
    startRecognitionRef.current = startRecognition;
  }, [startRecognition]);

  const start = useCallback(async (): Promise<boolean> => {
    desiredRef.current = true;
    restartAttemptRef.current = 0;
    return startRecognitionRef.current();
  }, []);

  const stop = useCallback(async (): Promise<void> => {
    desiredRef.current = false;
    setRecording(false);
    clearSilenceTimer();
    if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
    restartTimerRef.current = null;
    utteranceRef.current = null;
    finalPrefixRef.current = '';
    speechStartedRef.current = false;
    optionsRef.current.onInterimTranscript('');
    const recognition = recognitionRef.current;
    if (!recognition) {
      return;
    }
    try {
      recognition.stop();
    } catch {
      detachRecognition(recognition);
      recognitionRef.current = null;
      try { recognition.abort(); } catch { /* already stopped */ }
      setRecording(false);
    }
  }, [clearSilenceTimer, setRecording]);

  useEffect(() => () => {
    desiredRef.current = false;
    clearSilenceTimer();
    if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (recognition) {
      detachRecognition(recognition);
      try { recognition.abort(); } catch { /* already stopped */ }
    }
  }, [clearSilenceTimer]);

  return { start, stop, isRecording };
}
