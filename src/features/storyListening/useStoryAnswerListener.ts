'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useBrowserStt } from '@/hooks/useBrowserStt';
import { useStore } from '@/stores/useStore';

import { useStoryCheckStore } from './storyCheck';

/** Korean answers to the avatar's story questions; never sent to the free-talk pipeline. */
export const STORY_ANSWER_LANGUAGE = 'ko-KR';

/** Thinking sounds; a pause after "음…" must not send that as the answer. */
const FILLERS = new Set(['음', '음음', '으음', '흠', '어', '어어', '아', '그', '저', '저기', '그러니까', '그니까', '뭐지', '뭐더라', '있잖아', '응']);

export function isFillerOnly(text: string): boolean {
  const words = text.normalize('NFKC').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  return words.length > 0 && words.every((word) => FILLERS.has(word));
}

function compact(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

/** The tail of the avatar's own line picked up by the microphone. */
export function isAvatarEcho(text: string, avatarLine: string): boolean {
  const heard = compact(text);
  return heard.length >= 3 && compact(avatarLine).includes(heard);
}

/** Server speech recognition (the kiosk's Whisper, in Korean) for one armed answer at a time. */
export type ServerAnswerStt = {
  /** Arms the server for this prompt; false when the socket is closed. */
  arm: (checkId: string, seq: number) => boolean;
  disarm: () => void;
};

export type AnswerListenerState = 'idle' | 'starting' | 'listening' | 'hearing';

type Options = {
  /** One final Korean utterance (interim results never count as an answer). */
  onAnswer: (text: string) => void;
  /** The microphone or recognition is unavailable. */
  onUnavailable: () => void;
  /** The avatar's own line, so a playback echo is not taken as the learner's answer. */
  avatarLine: () => string;
  /** When given, answers come from the server STT; the browser recognizer is the fallback. */
  server?: ServerAnswerStt;
};

export function useStoryAnswerListener({ onAnswer, onUnavailable, avatarLine, server }: Options) {
  const [state, setState] = useState<AnswerListenerState>('idle');
  const [heard, setHeard] = useState('');
  /** The final text last sent as the answer, shown back so a recognition slip is visible. */
  const [answer, setAnswer] = useState('');
  const activeRef = useRef(false);
  const callbacks = useRef({ onAnswer, onUnavailable, avatarLine, server });
  useEffect(() => { callbacks.current = { onAnswer, onUnavailable, avatarLine, server }; }, [avatarLine, onAnswer, onUnavailable, server]);
  /** The prompt the server is armed for, and since when (older transcripts are ignored). */
  const armedRef = useRef<{ checkId: string; seq: number; since: number } | null>(null);

  const sttRef = useRef<{ stop: () => Promise<void> } | null>(null);
  const finish = useCallback(() => {
    activeRef.current = false;
    armedRef.current = null;
    setState('idle');
    if (!callbacks.current.server) void sttRef.current?.stop();
  }, []);

  const arm = useCallback((checkId: string, seq: number) => {
    armedRef.current = { checkId, seq, since: Date.now() };
    return callbacks.current.server?.arm(checkId, seq) ?? false;
  }, []);

  // Server STT results for the armed prompt.
  useEffect(() => useStoryCheckStore.subscribe((store, previous) => {
    const transcript = store.transcript;
    const armed = armedRef.current;
    if (!transcript || transcript === previous.transcript || !activeRef.current || !armed) return;
    if (transcript.checkId !== armed.checkId || transcript.seq !== armed.seq || transcript.at < armed.since) return;
    if (!transcript.final) {
      setHeard(transcript.text);
      if (transcript.text) setState('hearing');
      return;
    }
    const text = transcript.text;
    if (!text || isFillerOnly(text) || isAvatarEcho(text, callbacks.current.avatarLine())) {
      // Keep listening for the real answer; the server disarmed itself on this final.
      setHeard('');
      setState('listening');
      if (!arm(armed.checkId, armed.seq)) {
        finish();
        callbacks.current.onUnavailable();
      }
      return;
    }
    setHeard(text);
    setAnswer(text);
    finish();
    callbacks.current.onAnswer(text);
  }), [arm, finish]);

  const stt = useBrowserStt(useMemo(() => ({
    language: STORY_ANSWER_LANGUAGE,
    publishRecordingState: false,
    onFinalTranscript: (transcript) => {
      if (!activeRef.current) return;
      const text = transcript.text.trim();
      if (!text) return;
      if (isFillerOnly(text)) {
        // Keep listening for the real answer.
        setHeard('');
        setState('listening');
        return;
      }
      setHeard(text);
      setAnswer(text);
      finish();
      callbacks.current.onAnswer(text);
    },
    onInterimTranscript: (text) => {
      if (!activeRef.current) return;
      setHeard(text);
      if (text) setState('hearing');
    },
    onReadyChange: (ready) => {
      if (ready && activeRef.current) setState((current) => (current === 'hearing' ? current : 'listening'));
    },
    onError: () => {
      if (!activeRef.current) return;
      finish();
      callbacks.current.onUnavailable();
    },
    onUnavailable: () => {
      if (!activeRef.current) return;
      finish();
      callbacks.current.onUnavailable();
    },
    onSpeechStarted: () => {
      if (activeRef.current) setState('hearing');
    },
    getPlaybackState: () => ({ isPlaying: useStore.getState().isPlaying, text: callbacks.current.avatarLine() }),
  }), [finish]));
  useEffect(() => { sttRef.current = stt; }, [stt]);

  const listen = useCallback(async () => {
    if (activeRef.current) return;
    activeRef.current = true;
    setHeard('');
    if (callbacks.current.server) {
      const prompt = useStoryCheckStore.getState().prompt;
      setState('listening');
      if (!prompt || !arm(prompt.checkId, prompt.seq)) {
        finish();
        callbacks.current.onUnavailable();
      }
      return;
    }
    setState('starting');
    const started = await stt.startAndWaitUntilReady();
    if (!activeRef.current) return;
    if (!started) {
      finish();
      callbacks.current.onUnavailable();
    }
  }, [arm, finish, stt]);

  const stop = useCallback(() => {
    if (!activeRef.current) return;
    if (armedRef.current) callbacks.current.server?.disarm();
    finish();
  }, [finish]);

  const forget = useCallback(() => setAnswer(''), []);

  return { state, heard, answer, listen, stop, forget };
}
