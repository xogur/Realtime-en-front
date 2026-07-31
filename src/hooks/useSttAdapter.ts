import { useCallback, useEffect } from 'react';
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
  onReadyChange: (ready: boolean) => void;
  onError: (code: string) => void;
  onSpeechStarted: () => void;
  getPlaybackState: () => { isPlaying: boolean; text: string };
};

const PROVIDER = getConfiguredSttProvider();

export function useSttAdapter(options: SttAdapterOptions): SttAdapter {
  const {
    startRecording,
    stopRecording,
    setOnDataAvailable,
    isRecording: isServerRecording,
  } = useAudioRecorder();
  const {
    start: startBrowserStt,
    stop: stopBrowserStt,
    isRecording: isBrowserRecording,
  } = useBrowserStt(options);

  useEffect(() => {
    setOnDataAvailable(options.onAudioData);
  }, [options.onAudioData, setOnDataAvailable]);

  const start = useCallback(async () => {
    if (PROVIDER === 'browser') return startBrowserStt();
    return startRecording();
  }, [startBrowserStt, startRecording]);

  const stop = useCallback(async () => {
    if (PROVIDER === 'browser') return stopBrowserStt();
    return stopRecording();
  }, [stopBrowserStt, stopRecording]);

  return {
    provider: PROVIDER,
    start,
    stop,
    isRecording: PROVIDER === 'browser' ? isBrowserRecording : isServerRecording,
  };
}
