import { useCallback, useEffect, useRef } from 'react';
import { useStore } from '@/stores/useStore';
import {
  assembleBrowserSpeechEvent,
  getConfiguredBrowserSttConfig,
  isLateBrowserFinal,
  isLikelyPlaybackEcho,
  mapBrowserSpeechError,
  reconcileBrowserFinalSegments,
  type BrowserFinalTranscript,
  type IndexedBrowserFinalSegment,
  type BrowserSpeechResultEvent,
} from '@/lib/stt';

type BrowserSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  processLocally?: boolean;
  unspokenPunctuation?: boolean;
  phrases?: unknown[];
  onstart: (() => void) | null;
  onspeechstart: (() => void) | null;
  onspeechend: (() => void) | null;
  onaudioend: (() => void) | null;
  onnomatch: (() => void) | null;
  onresult: ((event: BrowserSpeechResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  /**
   * Start recognition using the browser's configured microphone.
   *
   * Some Chromium builds expose an experimental `start(MediaStreamTrack)`
   * overload, but it is not consistently implemented and can reject a live
   * track with InvalidStateError. Keep the public shape compatible with the
   * standard Web Speech API and call the zero-argument form below.
   */
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
  onFinalTranscript: (transcript: BrowserFinalTranscript) => void;
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

type ExtendedEchoCancellationCapabilities = MediaTrackCapabilities & {
  echoCancellation?: Array<boolean | string>;
};

type ExtendedEchoCancellationSettings = MediaTrackSettings & {
  echoCancellation?: boolean | string;
};

function stopMediaStream(stream: MediaStream): void {
  stream.getTracks().forEach((track) => track.stop());
}

function supportsAllEchoCancellation(track: MediaStreamTrack): boolean {
  if (typeof track.getCapabilities !== 'function') return false;
  try {
    const capabilities = track.getCapabilities() as ExtendedEchoCancellationCapabilities;
    return Array.isArray(capabilities.echoCancellation)
      && capabilities.echoCancellation.includes('all');
  } catch {
    return false;
  }
}

async function configureEchoCancellation(track: MediaStreamTrack): Promise<'all' | 'standard' | 'off'> {
  if (CONFIG.aecMode === 'off') return 'off';
  if (CONFIG.aecMode === 'auto' && supportsAllEchoCancellation(track)) {
    try {
      await track.applyConstraints({
        echoCancellation: { exact: 'all' },
      } as unknown as MediaTrackConstraints);
      return 'all';
    } catch {
      // Some devices advertise the string mode but reject it at runtime.
    }
  }
  try {
    await track.applyConstraints({ echoCancellation: true });
  } catch {
    // getUserMedia already requested standard AEC; keep the live track as a fallback.
  }
  return 'standard';
}

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
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioTrackRef = useRef<MediaStreamTrack | null>(null);
  const audioTrackEndedHandlerRef = useRef<(() => void) | null>(null);
  const audioInputPromiseRef = useRef<Promise<MediaStreamTrack | null> | null>(null);
  const audioInputGenerationRef = useRef(0);
  const desiredRef = useRef(false);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restartAttemptRef = useRef(0);
  const utteranceRef = useRef<{ text: string; lastChangedAt: number } | null>(null);
  const finalPrefixRef = useRef('');
  const finalSegmentsRef = useRef<IndexedBrowserFinalSegment[]>([]);
  const lastCommitRef = useRef<{ text: string; at: number } | null>(null);
  const speechStartedRef = useRef(false);
  const startRecognitionRef = useRef<() => Promise<boolean>>(async () => false);
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

  const releaseAudioInput = useCallback(() => {
    audioInputGenerationRef.current += 1;
    const stream = mediaStreamRef.current;
    const track = audioTrackRef.current;
    const endedHandler = audioTrackEndedHandlerRef.current;
    mediaStreamRef.current = null;
    audioTrackRef.current = null;
    audioTrackEndedHandlerRef.current = null;
    audioInputPromiseRef.current = null;
    if (track && endedHandler) track.removeEventListener('ended', endedHandler);
    if (stream) stopMediaStream(stream);
    else track?.stop();
  }, []);

  const scheduleRestart = useCallback(() => {
    if (!desiredRef.current || restartTimerRef.current) return;
    const attempt = restartAttemptRef.current;
    if (attempt >= MAX_RESTART_ATTEMPTS) {
      desiredRef.current = false;
      releaseAudioInput();
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
      void startRecognitionRef.current();
    }, RESTART_DELAYS_MS[Math.min(attempt, RESTART_DELAYS_MS.length - 1)]);
  }, [releaseAudioInput, setRecording]);

  const ensureAudioTrack = useCallback(async (): Promise<MediaStreamTrack | null> => {
    const currentTrack = audioTrackRef.current;
    if (currentTrack?.readyState === 'live') return currentTrack;
    if (audioInputPromiseRef.current) return audioInputPromiseRef.current;
    if (!navigator.mediaDevices?.getUserMedia) {
      optionsRef.current.onError('MICROPHONE_UNAVAILABLE');
      return null;
    }

    const generation = audioInputGenerationRef.current;
    const acquisition = (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: CONFIG.aecMode === 'off' ? false : true,
            noiseSuppression: true,
            autoGainControl: CONFIG.autoGainControl,
            channelCount: 1,
          },
        });
        const track = stream.getAudioTracks()[0];
        if (!track) {
          stopMediaStream(stream);
          optionsRef.current.onError('MICROPHONE_UNAVAILABLE');
          return null;
        }
        if (!desiredRef.current || generation !== audioInputGenerationRef.current) {
          stopMediaStream(stream);
          return null;
        }

        const appliedAecMode = await configureEchoCancellation(track);
        if (!desiredRef.current || generation !== audioInputGenerationRef.current) {
          stopMediaStream(stream);
          return null;
        }

        const handleTrackEnded = () => {
          if (audioTrackRef.current !== track) return;
          releaseAudioInput();
          const recognition = recognitionRef.current;
          recognitionRef.current = null;
          if (recognition) {
            detachRecognition(recognition);
            try { recognition.abort(); } catch { /* already ended */ }
          }
          setRecording(false);
          optionsRef.current.onReadyChange(false);
          optionsRef.current.onError('MICROPHONE_UNAVAILABLE');
          if (desiredRef.current) scheduleRestart();
        };

        mediaStreamRef.current = stream;
        audioTrackRef.current = track;
        audioTrackEndedHandlerRef.current = handleTrackEnded;
        track.addEventListener('ended', handleTrackEnded);

        let settings: ExtendedEchoCancellationSettings = {};
        try {
          settings = track.getSettings() as ExtendedEchoCancellationSettings;
        } catch {
          // Diagnostics must never make an otherwise valid microphone unusable.
        }
        console.info('Browser STT audio input configured:', {
          aecMode: appliedAecMode,
          echoCancellation: settings.echoCancellation,
          noiseSuppression: settings.noiseSuppression,
          autoGainControl: settings.autoGainControl,
          channelCount: settings.channelCount,
          sampleRate: settings.sampleRate,
        });
        return track;
      } catch (error) {
        if (generation !== audioInputGenerationRef.current || !desiredRef.current) return null;
        const errorName = error instanceof DOMException ? error.name : '';
        const code = errorName === 'NotAllowedError' || errorName === 'SecurityError'
          ? 'MICROPHONE_DENIED'
          : 'MICROPHONE_UNAVAILABLE';
        optionsRef.current.onReadyChange(false);
        optionsRef.current.onError(code);
        return null;
      }
    })();

    audioInputPromiseRef.current = acquisition;
    try {
      return await acquisition;
    } finally {
      if (audioInputPromiseRef.current === acquisition) audioInputPromiseRef.current = null;
    }
  }, [releaseAudioInput, scheduleRestart, setRecording]);

  const commitTranscript = useCallback((recognition: BrowserSpeechRecognition, text: string) => {
    const transcript = text.replace(/\s+/g, ' ').trim();
    if (!transcript) return;
    const capturedSegments = finalSegmentsRef.current.map(({ transcript: segment }) => (
      segment.replace(/\s+/g, ' ').trim()
    )).filter(Boolean);
    const finalSegments = capturedSegments.join(' ') === transcript
      ? capturedSegments
      : [transcript];
    clearSilenceTimer();
    utteranceRef.current = null;
    finalPrefixRef.current = '';
    finalSegmentsRef.current = [];
    speechStartedRef.current = false;
    lastCommitRef.current = { text: transcript, at: Date.now() };
    optionsRef.current.onInterimTranscript('');
    optionsRef.current.onFinalTranscript({
      text: transcript,
      speechEvidence: {
        version: 1,
        provider: 'browser',
        finalSegments,
      },
    });
    try {
      (recognitionRef.current ?? recognition).stop();
    } catch {
      // The recognizer may already be ending; onend will recycle it.
    }
  }, [clearSilenceTimer]);

  const startRecognition = useCallback(async (): Promise<boolean> => {
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

    const audioTrack = await ensureAudioTrack();
    if (!audioTrack || audioTrack.readyState !== 'live' || !desiredRef.current) {
      if (desiredRef.current) scheduleRestart();
      return false;
    }
    if (recognitionRef.current) return true;

    const recognition = new Recognition();
    const finalResultIndexBase = finalSegmentsRef.current.reduce(
      (nextIndex, segment) => Math.max(nextIndex, segment.resultIndex + 1),
      0,
    );
    let restartIsFailure = false;
    recognition.lang = CONFIG.language;
    recognition.continuous = CONFIG.continuous;
    recognition.interimResults = CONFIG.interimResults;
    recognition.maxAlternatives = CONFIG.maxAlternatives;
    if ('processLocally' in recognition) recognition.processLocally = CONFIG.processLocally;
    if ('unspokenPunctuation' in recognition) {
      try {
        recognition.unspokenPunctuation = CONFIG.unspokenPunctuation;
      } catch {
        // Experimental browser properties may exist but reject assignment.
      }
    }
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
        finalSegmentsRef.current = [];
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
        finalSegmentsRef.current = [];
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
        finalSegmentsRef.current = reconcileBrowserFinalSegments(
          finalSegmentsRef.current,
          result.finalSegments.map((segment) => ({
            ...segment,
            resultIndex: finalResultIndexBase + segment.resultIndex,
          })),
        );
        finalPrefixRef.current = finalSegmentsRef.current
          .map(({ transcript }) => transcript)
          .join(' ');
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
        finalSegmentsRef.current = [];
        speechStartedRef.current = false;
        return;
      }
      if (code === 'MICROPHONE_DENIED' || code === 'MICROPHONE_UNAVAILABLE') {
        desiredRef.current = false;
        setRecording(false);
        recognitionRef.current = null;
        detachRecognition(recognition);
        try { recognition.abort(); } catch { /* already stopped */ }
        releaseAudioInput();
        optionsRef.current.onReadyChange(false);
        optionsRef.current.onError(code);
        optionsRef.current.onUnavailable();
        return;
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
        finalSegmentsRef.current = [];
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
      // Use the standard Web Speech API entry point. Passing the MediaStream
      // track uses Chromium's experimental overload, which currently throws
      // InvalidStateError even when getUserMedia returned a live audio track.
      recognition.start();
      return true;
    } catch (error) {
      console.warn('Browser STT recognition.start failed:', error);
      detachRecognition(recognition);
      recognitionRef.current = null;
      scheduleRestart();
      return false;
    }
  }, [
    clearSilenceTimer,
    commitTranscript,
    ensureAudioTrack,
    releaseAudioInput,
    scheduleRestart,
    setRecording,
  ]);

  useEffect(() => {
    startRecognitionRef.current = startRecognition;
  }, [startRecognition]);

  const start = useCallback(async (): Promise<boolean> => {
    desiredRef.current = true;
    restartAttemptRef.current = 0;
    const startGeneration = audioInputGenerationRef.current;
    const started = await startRecognitionRef.current();
    if (!started && startGeneration === audioInputGenerationRef.current) {
      desiredRef.current = false;
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
      releaseAudioInput();
    }
    return started;
  }, [releaseAudioInput]);

  const stop = useCallback(async (): Promise<void> => {
    desiredRef.current = false;
    setRecording(false);
    clearSilenceTimer();
    if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
    restartTimerRef.current = null;
    utteranceRef.current = null;
    finalPrefixRef.current = '';
    finalSegmentsRef.current = [];
    speechStartedRef.current = false;
    optionsRef.current.onInterimTranscript('');
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (recognition) {
      detachRecognition(recognition);
      try { recognition.abort(); } catch { /* already stopped */ }
    }
    releaseAudioInput();
  }, [clearSilenceTimer, releaseAudioInput, setRecording]);

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
    releaseAudioInput();
  }, [clearSilenceTimer, releaseAudioInput]);

  return { start, stop, isRecording };
}
