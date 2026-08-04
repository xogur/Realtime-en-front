import { useCallback, useEffect, useRef, useState } from 'react';
import { getConfiguredSttProvider, type SttProviderName } from '@/lib/stt';
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
  onFinalTranscript: (transcript: string) => void;
  onInterimTranscript: (transcript: string) => void;
  onReadyChange: (ready: boolean) => void;
  onError: (code: string) => void;
  onSpeechStarted: () => void;
  getPlaybackState: () => { isPlaying: boolean; text: string };
};

const PROVIDER = getConfiguredSttProvider();

export function useSttAdapter(options: SttAdapterOptions): SttAdapter {
  const [provider, setProvider] = useState<SttProviderName>(PROVIDER);
  const providerRef = useRef<SttProviderName>(PROVIDER);
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

  const startServerStt = useCallback(async () => {
    selectProvider('server');
    const started = await startRecording();
    optionsRef.current.onReadyChange(started);
    if (!started) optionsRef.current.onError('MICROPHONE_UNAVAILABLE');
    return started;
  }, [selectProvider, startRecording]);

  const handleBrowserUnavailable = useCallback(() => {
    if (PROVIDER !== 'browser' || providerRef.current !== 'browser') return;
    void startServerStt();
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
    if (PROVIDER === 'server') return startServerStt();

    selectProvider('browser');
    const browserStarted = await startBrowserStt();
    if (browserStarted) return true;

    // Web Speech API availability varies by browser, policy, and kiosk setup.
    // Keep the original PCM/server path as an automatic runtime fallback.
    await stopBrowserStt();
    return startServerStt();
  }, [selectProvider, startBrowserStt, startServerStt, stopBrowserStt]);

  const stop = useCallback(async () => {
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
