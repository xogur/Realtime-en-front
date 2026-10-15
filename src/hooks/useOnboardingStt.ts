'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { floatTo16BitPCM } from '@/lib/audioUtils';
import { OnboardingUtterance } from '@/lib/onboardingAudio';
import type { OnboardingSttHint } from '@/lib/onboardingSttHints';
import { isLikelyPlaybackEcho } from '@/lib/stt';
import { getBrowserTtsPlaybackState } from './useBrowserTts';

type Options = {
  allowDuringPlayback?: boolean;
  /** Read per utterance; the kiosk's Crisper server has a Korean and an English endpoint. */
  language?: 'ko' | 'en';
  /**
   * Read when an utterance is captured: the Korean step it answers. The server gives
   * Crisper that step's question as context; null for yes/no and free answers.
   */
  hint?: () => OnboardingSttHint | null;
  onFinalTranscript: (transcript: { text: string }) => void;
  /** Never called: the server returns one final transcript per utterance. */
  onInterimTranscript?: (text: string) => void;
  onReadyChange: (ready: boolean) => void;
  /**
   * MICROPHONE_DENIED / MICROPHONE_UNAVAILABLE / AUDIO_GESTURE_REQUIRED (the page needs one
   * touch before Chrome plays or records audio) stop capture. STT_UNAVAILABLE,
   * STT_BUSY and STT_NO_RESULT are per utterance; listening continues.
   */
  onError: (code: string) => void;
  getPlaybackState: () => { isPlaying: boolean; text: string };
};

export type OnboardingSttStatus = 'idle' | 'preparing' | 'prompting' | 'listening' | 'transcribing';

const REQUEST_TIMEOUT_MS = 22_000;
// Without a touch (and without the kiosk launcher's autoplay flag) Chrome never starts an
// AudioContext: resume() waits forever. Give up quickly and ask for a touch instead.
const AUDIO_START_TIMEOUT_MS = 2_500;
const BUSY_RETRY_DELAY_MS = 400;

class SttBusyError extends Error {}
class AudioGestureRequiredError extends Error {}

/**
 * Isolated short-reply capture on the kiosk's own STT server (no browser
 * recognition, so audio never leaves the kiosk): never starts the English
 * conversation socket.
 */
export function useOnboardingStt(options: Options) {
  const opts = useRef(options);
  opts.current = options;
  const generation = useRef(0);
  // A new prompt or turn: a transcript requested before it is stale.
  const turn = useRef(0);
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
  const [status, setStatus] = useState<OnboardingSttStatus>('idle');

  const stop = useCallback(async () => {
    generation.current += 1;
    turn.current += 1;
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

  /**
   * Stops listening but keeps the microphone open for the next prompt. Reopening a
   * physical kiosk microphone took 10-20 s and restarted its echo/gain adaptation, so
   * a re-prompt lost the child's first words. stop() releases the device.
   */
  const pause = useCallback(async () => {
    turn.current += 1;
    desired.current = false;
    request.current?.abort();
    request.current = null;
    processing.current = false;
    utterance.current.reset();
    playbackTexts.current.clear();
    recentPlayback.current = { text: '', until: 0 };
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
    let timer = 0;
    const turnAtCapture = turn.current;
    const stale = () => epoch !== generation.current || turnAtCapture !== turn.current || !desired.current;
    try {
      const pcm = floatTo16BitPCM(audio);
      const language = opts.current.language ?? 'ko';
      const hint = language === 'ko' ? opts.current.hint?.() ?? null : null;
      const query = `language=${language}${hint ? `&hint=${hint}` : ''}`;
      let text = '';
      // One retry for an empty result or a busy server (the STT executor is
      // shared with the conversation), never after stop() or a new turn.
      for (let attempt = 0; attempt < 2; attempt += 1) {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => abort.abort(), REQUEST_TIMEOUT_MS);
        const response = await fetch(`/api/onboarding-stt?${query}`, {
          method: 'POST', headers: { 'Content-Type': 'application/octet-stream' },
          body: pcm.buffer as ArrayBuffer, signal: abort.signal,
        });
        if (stale()) return;
        if (response.status === 429) {
          if (attempt) throw new SttBusyError();
          await new Promise((resolve) => window.setTimeout(resolve, BUSY_RETRY_DELAY_MS));
          if (stale()) return;
          continue;
        }
        if (!response.ok) throw new Error('STT_UNAVAILABLE');
        const result = await response.json();
        if (stale()) return;
        text = String(result.text ?? '').trim();
        if (text) break;
      }
      if (opts.current.allowDuringPlayback && prompts.some((prompt) => {
        const compact = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
        const heard = compact(text);
        // Also reject short echoed names that the general echo matcher skips.
        return (heard.length >= 2 && compact(prompt).includes(heard))
          || isLikelyPlaybackEcho(text, prompt);
      })) return;
      if (text) opts.current.onFinalTranscript({ text });
      else opts.current.onError('STT_NO_RESULT');
    } catch (error) {
      if (!stale()) opts.current.onError(error instanceof SttBusyError ? 'STT_BUSY' : 'STT_UNAVAILABLE');
    } finally {
      window.clearTimeout(timer);
      if (epoch === generation.current && request.current === abort) {
        processing.current = false;
        request.current = null;
        // The pre-roll primed during transcription keeps a reply that starts right now.
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
        const running = context.resume().then(() => true);
        const started = await Promise.race([running, new Promise<boolean>((resolve) => {
          window.setTimeout(() => resolve(false), AUDIO_START_TIMEOUT_MS);
        })]);
        if (!started || context.state !== 'running') throw new AudioGestureRequiredError();
        await context.audioWorklet.addModule('/audio-processor.js');
        if (epoch !== generation.current) {
          stream.getTracks().forEach((track) => track.stop());
          await context.close();
          return false;
        }
        const source = context.createMediaStreamSource(stream);
        const worklet = new AudioWorkletNode(context, 'my-audio-processor');
        worklet.port.onmessage = (event: MessageEvent<Float32Array>) => {
          if (epoch !== generation.current) return;
          const globalPlayback = getBrowserTtsPlaybackState();
          const localPlayback = opts.current.getPlaybackState();
          if (globalPlayback.state !== 'idle' || localPlayback.isPlaying) {
            quietUntil.current = Date.now() + 350;
            recentPlayback.current = {
              text: globalPlayback.text || localPlayback.text, until: quietUntil.current,
            };
          }
          if (!desired.current || processing.current) {
            // Not listening: keep the room's pre-roll and noise level current, never the
            // prompt's own voice or its echo tail.
            if (Date.now() < quietUntil.current) utterance.current.reset();
            else utterance.current.prime(new Float32Array(event.data));
            return;
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
          setStatus('idle');
          opts.current.onError(error instanceof AudioGestureRequiredError ? 'AUDIO_GESTURE_REQUIRED'
            : error instanceof DOMException && error.name === 'NotAllowedError'
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
    // pause()/stop() already cleared speech; keep the pre-roll primed since the prompt.
    if (!desired.current) turn.current += 1;
    desired.current = true;
    setRecording(true);
    setStatus('listening');
    opts.current.onReadyChange(true);
    return true;
  }, [prepare]);
  const restart = useCallback(async () => { await stop(); return start(); }, [start, stop]);

  /**
   * Hands the open microphone to the next recorder instead of closing it:
   * reopening a physical kiosk microphone took 10-20 s. Capture stops here;
   * the caller owns (and must stop) the returned stream.
   */
  const takeAudioInput = useCallback(async (): Promise<MediaStream | null> => {
    const epoch = generation.current;
    const pending = preparing.current;
    // A quick touch can beat the initial permission/device result. Let that
    // acquisition finish instead of stopping and immediately reopening.
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (pending) {
      await Promise.race([pending, new Promise((resolve) => { timer = setTimeout(resolve, 1500); })]);
      if (timer) clearTimeout(timer);
    }
    const current = resources.current;
    if (epoch !== generation.current || !current) return null;
    resources.current = null;
    current.worklet.port.onmessage = null;
    current.worklet.disconnect();
    current.source.disconnect();
    current.stream.getTracks().forEach((track) => { track.onended = null; });
    await stop();
    await current.context.close().catch(() => undefined);
    return current.stream;
  }, [stop]);

  useEffect(() => () => { void stop(); }, [stop]);
  return { prepare, takeAudioInput, startAndWaitUntilReady: start, restartAndWaitUntilReady: restart, pause, stop, isRecording, status };
}
