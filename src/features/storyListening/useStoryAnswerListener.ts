'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { isFillerOnly } from '@/lib/koreanFillers';

import { useStoryCheckStore } from './storyCheck';

export { isFillerOnly };

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
  /**
   * Answers come only from the kiosk's server STT. Without it the listener
   * reports unavailable (touch still answers); browser recognition would send
   * the child's voice to an outside service.
   */
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

  const finish = useCallback(() => {
    activeRef.current = false;
    armedRef.current = null;
    setState('idle');
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

  const listen = useCallback(async () => {
    if (activeRef.current) return;
    activeRef.current = true;
    setHeard('');
    const prompt = useStoryCheckStore.getState().prompt;
    setState('listening');
    if (!callbacks.current.server || !prompt || !arm(prompt.checkId, prompt.seq)) {
      finish();
      callbacks.current.onUnavailable();
    }
  }, [arm, finish]);

  const stop = useCallback(() => {
    if (!activeRef.current) return;
    if (armedRef.current) callbacks.current.server?.disarm();
    finish();
  }, [finish]);

  const forget = useCallback(() => setAnswer(''), []);

  return { state, heard, answer, listen, stop, forget };
}
