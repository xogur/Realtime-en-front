import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getConfiguredSttProvider,
  type BrowserFinalTranscript,
  type SttProviderName,
} from '@/lib/stt';
import { useAudioRecorder } from './useAudioRecorder';
import { useBrowserStt } from './useBrowserStt';

export type SttAdapter = {
  provider: SttProviderName;
  start: () => Promise<boolean | void>;
  stop: () => Promise<void>;
  isRecording: boolean;
};

type SttAdapterOptions = {
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
    const started = await startRecording();
    if (!desiredRef.current || generation !== operationGenerationRef.current) {
      if (started) await stopRecording();
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

  const start = useCallback(async () => {
    desiredRef.current = true;
    const generation = operationGenerationRef.current + 1;
    operationGenerationRef.current = generation;
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

  const stop = useCallback(async () => {
    desiredRef.current = false;
    operationGenerationRef.current += 1;
    if (providerRef.current === 'browser') return stopBrowserStt();
    return stopRecording();
  }, [stopBrowserStt, stopRecording]);

  return {
    provider,
    start,
    stop,
    isRecording: provider === 'browser' ? isBrowserRecording : isServerRecording,
  };
}
