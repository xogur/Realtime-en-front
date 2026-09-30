'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { floatTo16BitPCM } from '@/lib/audioUtils';
import { OnboardingUtterance } from '@/lib/onboardingAudio';
import { isLikelyPlaybackEcho } from '@/lib/stt';
import { getBrowserTtsPlaybackState } from './useBrowserTts';

type Options = {
  allowDuringPlayback?: boolean;
  onFinalTranscript: (transcript: { text: string }) => void;
  onInterimTranscript: (text: string) => void;
  onReadyChange: (ready: boolean) => void;
  onError: (code: string) => void;
  getPlaybackState: () => { isPlaying: boolean; text: string };
};

/** Isolated Korean capture: never starts the English conversation socket. */
export function useOnboardingStt(options: Options) {
  const opts = useRef(options);
  opts.current = options;
  const generation = useRef(0);
  const desired = useRef(false);
  const resources = useRef<{ stream: MediaStream; context: AudioContext; source: MediaStreamAudioSourceNode; worklet: AudioWorkletNode } | null>(null);
  const preparing = useRef<Promise<boolean> | null>(null);
  const request = useRef<AbortController | null>(null);
  const utterance = useRef(new OnboardingUtterance());
  const processing = useRef(false);
  const quietUntil = useRef(0);
  const playbackTexts = useRef(new Set<string>());
  const recentPlayback = useRef({ text: '', until: 0 });
  const [isRecording, setRecording] = useState(false);
  const [status, setStatus] = useState('idle');

  const stop = useCallback(async () => {
    generation.current += 1;
    desired.current = false;
    preparing.current = null;
    request.current?.abort();
    request.current = null;
    processing.current = false;
    utterance.current.reset();
    playbackTexts.current.clear();
    recentPlayback.current = { text: '', until: 0 };
    const current = resources.current;
    resources.current = null;
    if (current) {
      current.worklet.port.onmessage = null;
      current.worklet.disconnect();
      current.source.disconnect();
      current.stream.getTracks().forEach((track) => track.stop());
      await current.context.close().catch(() => undefined);
    }
    setRecording(false);
    setStatus('idle');
    opts.current.onReadyChange(false);
  }, []);

  const submit = useCallback(async (audio: Float32Array, epoch: number) => {
    // Snapshot at capture time: TTS may finish before inference returns.
    const prompts = [...playbackTexts.current];
    playbackTexts.current.clear();
    processing.current = true;
    setRecording(false);
    setStatus('transcribing');
    const abort = new AbortController();
    request.current = abort;
    const timer = window.setTimeout(() => abort.abort(), 22_000);
    try {
      const pcm = floatTo16BitPCM(audio);
      const response = await fetch('/api/onboarding-stt', {
        method: 'POST', headers: { 'Content-Type': 'application/octet-stream' },
        body: pcm.buffer as ArrayBuffer, signal: abort.signal,
      });
      if (!response.ok) throw new Error('STT_UNAVAILABLE');
      const result = await response.json();
      if (epoch !== generation.current || !desired.current) return;
      const text = String(result.text ?? '').trim();
      if (opts.current.allowDuringPlayback && prompts.some((prompt) => {
        const compact = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
        const heard = compact(text);
        // Also reject short echoed names that the general echo matcher skips.
        return (heard.length >= 2 && compact(prompt).includes(heard))
          || isLikelyPlaybackEcho(text, prompt);
      })) return;
      if (text) opts.current.onFinalTranscript({ text });
      else opts.current.onError('STT_NO_RESULT');
    } catch {
      if (epoch === generation.current && desired.current) opts.current.onError('STT_UNAVAILABLE');
    } finally {
      window.clearTimeout(timer);
      if (epoch === generation.current) {
        processing.current = false;
        request.current = null;
        utterance.current.reset();
        if (desired.current) { setRecording(true); setStatus('listening'); }
      }
    }
  }, []);

  const prepare = useCallback((): Promise<boolean> => {
    if (resources.current) return Promise.resolve(true);
    if (preparing.current) return preparing.current;
    const epoch = generation.current;
    setStatus('preparing');
    const operation = (async () => {
      let stream: MediaStream | null = null;
      let context: AudioContext | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: {
          channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true,
        } });
        if (epoch !== generation.current) { stream.getTracks().forEach((track) => track.stop()); return false; }
        context = new AudioContext({ sampleRate: 16000 });
        // Web Audio resamples the microphone to this context's sample rate.
        if (context.sampleRate !== 16000) throw new Error('Unsupported sample rate');
        await context.resume();
        await context.audioWorklet.addModule('/audio-processor.js');
        if (epoch !== generation.current) {
          stream.getTracks().forEach((track) => track.stop());
          await context.close();
          return false;
        }
        const source = context.createMediaStreamSource(stream);
        const worklet = new AudioWorkletNode(context, 'my-audio-processor');
        worklet.port.onmessage = (event: MessageEvent<Float32Array>) => {
          if (epoch !== generation.current || !desired.current || processing.current) return;
          const globalPlayback = getBrowserTtsPlaybackState();
          const localPlayback = opts.current.getPlaybackState();
          if (globalPlayback.state !== 'idle' || localPlayback.isPlaying) {
            quietUntil.current = Date.now() + 350;
            recentPlayback.current = {
              text: globalPlayback.text || localPlayback.text, until: quietUntil.current,
            };
          }
          if (opts.current.allowDuringPlayback && Date.now() < recentPlayback.current.until) {
            if (recentPlayback.current.text) playbackTexts.current.add(recentPlayback.current.text);
          }
          // Default remains half-duplex; name capture opts into AEC + echo filtering.
          if (!opts.current.allowDuringPlayback && Date.now() < quietUntil.current) {
            utterance.current.reset();
            setRecording(false);
            setStatus('prompting');
            return;
          }
          setRecording(true);
          setStatus('listening');
          const audio = utterance.current.push(new Float32Array(event.data));
          if (audio) void submit(audio, epoch);
        };
        source.connect(worklet);
        worklet.connect(context.destination); // Worklet outputs silence, never microphone monitoring.
        resources.current = { stream, context, source, worklet };
        stream.getTracks().forEach((track) => { track.onended = () => {
          if (epoch === generation.current) { void stop(); opts.current.onError('MICROPHONE_UNAVAILABLE'); }
        }; });
        return true;
      } catch (error) {
        stream?.getTracks().forEach((track) => track.stop());
        await context?.close().catch(() => undefined);
        if (epoch === generation.current) {
          opts.current.onError(error instanceof DOMException && error.name === 'NotAllowedError'
            ? 'MICROPHONE_DENIED' : 'MICROPHONE_UNAVAILABLE');
        }
        return false;
      } finally {
        if (epoch === generation.current) preparing.current = null;
      }
    })();
    preparing.current = operation;
    return operation;
  }, [stop, submit]);

  const start = useCallback(async () => {
    const epoch = generation.current;
    if (!await prepare() || epoch !== generation.current) return false;
    desired.current = true;
    utterance.current.reset();
    setRecording(true);
    setStatus('listening');
    opts.current.onReadyChange(true);
    return true;
  }, [prepare]);
  const restart = useCallback(async () => { await stop(); return start(); }, [start, stop]);
  useEffect(() => () => { void stop(); }, [stop]);
  return { prepare, startAndWaitUntilReady: start, restartAndWaitUntilReady: restart, stop, isRecording, status };
}
