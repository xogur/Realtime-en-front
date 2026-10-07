import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getConfiguredSttProvider,
  MICROPHONE_START_TIMEOUT_MS,
  type BrowserFinalTranscript,
  type SttProviderName,
} from '@/lib/stt';
import { useAudioRecorder } from './useAudioRecorder';
import { useBrowserStt } from './useBrowserStt';

export type SttAdapter = {
  provider: SttProviderName;
  prepare: (input?: MediaStream) => Promise<boolean>;
  start: (options?: { requiredAudio?: boolean }) => Promise<boolean | void>;
  stop: (options?: { keepPrepared?: boolean }) => Promise<void>;
  isRecording: boolean;
};

type SttAdapterOptions = {
  onUtteranceAborted?: (reason: 'NO_SPEECH' | 'NO_FINAL' | 'VOICE_NOT_READY') => void;
  onAudioData: (pcm: Int16Array) => void;
  onFinalTranscript: (transcript: BrowserFinalTranscript) => void;
  onInterimTranscript: (transcript: string) => void;
  onReadyChange: (ready: boolean) => void;
  onError: (code: string) => void;
  onSpeechStarted: () => void;
  getPlaybackState: () => { isPlaying: boolean; text: string };
};

const PROVIDER = getConfiguredSttProvider();
const BROWSER_STT_START_TIMEOUT_MS = 5_000;

export function useSttAdapter(options: SttAdapterOptions): SttAdapter {
  const [provider, setProvider] = useState<SttProviderName>(PROVIDER);
  const providerRef = useRef<SttProviderName>(PROVIDER);
  const desiredRef = useRef(false);
  const operationGenerationRef = useRef(0);
  const optionsRef = useRef(options);
  const {
    startRecording,
    prepareRecording,
    pauseRecording,
    stopRecording,
    setOnDataAvailable,
    isRecording: isServerRecording,
  } = useAudioRecorder();

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  useEffect(() => {
    setOnDataAvailable(options.onAudioData);
  }, [options.onAudioData, setOnDataAvailable]);

  const selectProvider = useCallback((nextProvider: SttProviderName) => {
    providerRef.current = nextProvider;
    setProvider(nextProvider);
  }, []);

  const startServerStt = useCallback(async (generation = operationGenerationRef.current) => {
    if (!desiredRef.current || generation !== operationGenerationRef.current) return false;
    selectProvider('server');
    let timer: ReturnType<typeof setTimeout> | undefined;
    const started = await Promise.race([startRecording(), new Promise<false>(resolve => {
      timer = setTimeout(() => {
        if (desiredRef.current && generation === operationGenerationRef.current) {
          desiredRef.current = false; operationGenerationRef.current += 1;
          optionsRef.current.onReadyChange(false);
          optionsRef.current.onError('MICROPHONE_START_TIMEOUT');
          void stopRecording();
        }
        resolve(false);
      }, MICROPHONE_START_TIMEOUT_MS);
    })]).finally(() => { if (timer) clearTimeout(timer); });
    if (!desiredRef.current || generation !== operationGenerationRef.current) {
      return false;
    }
    optionsRef.current.onReadyChange(started);
    if (!started) optionsRef.current.onError('MICROPHONE_UNAVAILABLE');
    return started;
  }, [selectProvider, startRecording, stopRecording]);

  const handleBrowserUnavailable = useCallback(() => {
    if (
      PROVIDER !== 'browser'
      || providerRef.current !== 'browser'
      || !desiredRef.current
    ) return;

    // Prefer browser STT, but retain the server recorder as a runtime
    // fallback for browsers without Web Speech or denied microphone access.
    void startServerStt(operationGenerationRef.current);
  }, [startServerStt]);

  const {
    start: startBrowserStt,
    stop: stopBrowserStt,
    isRecording: isBrowserRecording,
  } = useBrowserStt({
    ...options,
    onUnavailable: handleBrowserUnavailable,
  });

  const startInput = useCallback(async (startOptions?: { requiredAudio?: boolean }) => {
    desiredRef.current = true;
    const generation = operationGenerationRef.current + 1;
    operationGenerationRef.current = generation;
    if (startOptions?.requiredAudio) {
      if (providerRef.current === 'browser') await stopBrowserStt();
      return startServerStt(generation);
    }
    if (PROVIDER === 'server') return startServerStt(generation);

    selectProvider('browser');
    // A blocked microphone permission prompt can leave getUserMedia pending
    // forever in kiosk/embedded browsers. Bound the browser attempt so the
    // existing server fallback remains reachable instead of leaving the UI in
    // "Preparing STT" indefinitely.
    let browserStartTimer: ReturnType<typeof setTimeout> | null = null;
    const browserStarted = await Promise.race([
      startBrowserStt().catch(() => false),
      new Promise<false>((resolve) => {
        browserStartTimer = setTimeout(() => resolve(false), BROWSER_STT_START_TIMEOUT_MS);
      }),
    ]);
    if (browserStartTimer) clearTimeout(browserStartTimer);
    if (!desiredRef.current || generation !== operationGenerationRef.current) return false;
    if (browserStarted) return true;

    await stopBrowserStt();
    if (!desiredRef.current || generation !== operationGenerationRef.current) return false;
    return startServerStt(generation);
  }, [selectProvider, startBrowserStt, startServerStt, stopBrowserStt]);

  const start = useCallback(async (startOptions?: { requiredAudio?: boolean }) => {
    const pending = startInput(startOptions);
    const generation = operationGenerationRef.current;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([pending, new Promise<false>(resolve => {
        timer = setTimeout(() => {
          if (operationGenerationRef.current === generation) {
            desiredRef.current = false;
            operationGenerationRef.current += 1;
            optionsRef.current.onReadyChange(false);
            optionsRef.current.onError('MICROPHONE_START_TIMEOUT');
            // stop invalidates the recorder's operation immediately. Its existing
            // cleanup promise remains the barrier for every subsequent start.
            void (providerRef.current === 'browser' ? stopBrowserStt() : stopRecording());
          }
          resolve(false);
        }, MICROPHONE_START_TIMEOUT_MS);
      })]);
    } finally { if (timer) clearTimeout(timer); }
  }, [startInput, stopBrowserStt, stopRecording]);

  const prepare = useCallback(async (input?: MediaStream) => {
    // Browser recognition has its own device lifecycle. Warm only the server
    // PCM path, without advertising readiness or sending capture state.
    if (providerRef.current !== 'server') {
      input?.getTracks().forEach(track => track.stop());
      return false;
    }
    return prepareRecording(input);
  }, [prepareRecording]);

  const stop = useCallback(async (stopOptions?: { keepPrepared?: boolean }) => {
    desiredRef.current = false;
    operationGenerationRef.current += 1;
    if (providerRef.current === 'browser') return stopBrowserStt();
    if (stopOptions?.keepPrepared) return pauseRecording();
    return stopRecording();
  }, [pauseRecording, stopBrowserStt, stopRecording]);

  return {
    provider,
    prepare,
    start,
    stop,
    isRecording: provider === 'browser' ? isBrowserRecording : isServerRecording,
  };
}
