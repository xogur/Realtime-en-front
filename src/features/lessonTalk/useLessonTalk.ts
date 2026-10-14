'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useStore } from '@/stores/useStore';

import { createLessonViewPublisher, type LessonViewPhase } from './control';
import { isFillerOnly, silenceMs, useLessonTalkStore, type LessonAnswer, type LessonTurn } from './lessonTalk';

/*
 * The avatar runs the lesson as a conversation. The server decides every line and
 * what to wait for; this hook only plays its part: show the turn, wait until the
 * avatar has finished speaking (server speech_done and drained audio), then arm the
 * server microphone for one answer, and send that answer (speech, touch, silence or
 * a help request). The avatar's voice and the learner's microphone never overlap.
 */

export type LessonStatus = 'starting' | 'speaking' | 'listening' | 'hearing' | 'thinking' | 'ending' | 'error';

/** If the server never reports the end of the avatar's lines, continue once the audio is quiet. */
const SPEECH_DONE_FALLBACK_MS = 30_000;
/** Speech that has started gets this long to reach a final transcript. */
const HEARING_MS = 25_000;
const START_TIMEOUT_MS = 15_000;
/** Judging is bounded at 4 s on the server; the reply lines follow. */
const THINKING_TIMEOUT_MS = 20_000;
const NON_FATAL_FAILURES = new Set(['busy', 'stale_prompt', 'stale_talk']);
/** A turn whose audio never starts (its talk was lost on the server) moves on after this. */
const NO_AUDIO_FALLBACK_MS = 10_000;
/** A lost talk restarts by itself at most once in this window; after that the learner presses retry. */
const AUTO_RESTART_WINDOW_MS = 60_000;

type Options = {
  kioskId: string;
  isConnected: boolean;
  /** Sends one lesson_talk_* message; false when the socket is not open. */
  sendLessonTalk: (message: Record<string, unknown>) => boolean;
  /** Stops the avatar's current line at once (pause/exit). */
  stopAvatarSpeech: () => void;
  /** Keeps the server microphone open; the server only takes an armed answer. */
  setMicrophone?: (on: boolean) => void;
  /** The lesson ended: free talk on a topic, or back to the mode choice. */
  onFinish: (next: { kind: 'free_talk'; topicId: string; difficultyId: string } | { kind: 'exit' }) => void;
};

function newTalkId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `talk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function key(turn: { talkId: string; seq: number }) {
  return `${turn.talkId}:${turn.seq}`;
}

export function useLessonTalk({ kioskId, isConnected, sendLessonTalk, stopAvatarSpeech, setMicrophone, onFinish }: Options) {
  const [talkId, setTalkId] = useState<string | null>(null);
  const [status, setStatus] = useState<LessonStatus>('starting');
  const [paused, setPaused] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [heard, setHeard] = useState('');
  /** The last answer sent, shown back so a recognition slip is visible. */
  const [answered, setAnswered] = useState('');
  const turn = useLessonTalkStore((state) => state.turn);
  const currentTurn = turn && turn.talkId === talkId ? turn : null;

  const live = useRef({ talkId, status, paused });
  const setLive = useCallback((patch: Partial<typeof live.current>) => {
    live.current = { ...live.current, ...patch };
  }, []);
  useEffect(() => { live.current = { talkId, status, paused }; }, [paused, status, talkId]);
  const handled = useRef<{ turn: string | null; failure: unknown; finished: string | null }>({ turn: null, failure: null, finished: null });
  const armedRef = useRef<{ key: string; since: number } | null>(null);
  const answeredRef = useRef<string | null>(null);
  const fallbackRef = useRef<{ key: string | null; timer: number | null }>({ key: null, timer: null });
  const noAudioRef = useRef<number | null>(null);
  /** The turn whose audio has started playing. */
  const audioSeenRef = useRef<string | null>(null);
  const restartRef = useRef<() => void>(() => undefined);
  const lastRestartRef = useRef(0);
  const finishRef = useRef(onFinish);
  useEffect(() => { finishRef.current = onFinish; }, [onFinish]);
  // Level and topic of the last lesson, so "다시 시도" does not ask them again.
  const resumeRef = useRef<{ level?: string; topicId?: string }>({});

  const disarm = useCallback(() => {
    if (armedRef.current) sendLessonTalk({ type: 'lesson_talk_listen_stop' });
    armedRef.current = null;
  }, [sendLessonTalk]);

  const send = useCallback((answer: LessonAnswer) => {
    const active = useLessonTalkStore.getState().turn;
    if (!active || active.talkId !== live.current.talkId || active.end) return;
    const scope = key(active);
    if (answeredRef.current === scope) return;
    answeredRef.current = scope;
    disarm();
    setLive({ status: 'thinking' });
    setStatus('thinking');
    if (answer.kind === 'speech') setAnswered(answer.text);
    if (!sendLessonTalk({ type: 'lesson_talk_answer', talkId: active.talkId, seq: active.seq, ...answer })) {
      setLive({ status: 'error' });
      setStatus('error');
      setNotice('AI 선생님과 연결이 잠깐 끊겼어요. 다시 시도해 주세요.');
    }
  }, [disarm, sendLessonTalk, setLive]);

  const arm = useCallback((active: LessonTurn) => {
    const scope = key(active);
    armedRef.current = { key: scope, since: Date.now() };
    setHeard('');
    setLive({ status: 'listening' });
    setStatus('listening');
    if (!sendLessonTalk({ type: 'lesson_talk_listen', talkId: active.talkId, seq: active.seq })) {
      armedRef.current = null;
      setLive({ status: 'error' });
      setStatus('error');
      setNotice('AI 선생님과 연결이 잠깐 끊겼어요. 다시 시도해 주세요.');
    }
  }, [sendLessonTalk, setLive]);

  /** Moves on once the avatar's lines are over: generated in full and drained, or quiet past the fallback. */
  const advance = useCallback(() => {
    const { talkId: id, status: current, paused: isPaused } = live.current;
    if (isPaused || !id || useStore.getState().isPlaying) return;
    if (current !== 'speaking' && current !== 'ending') return;
    const { turn: active, speechDone } = useLessonTalkStore.getState();
    if (!active || active.talkId !== id) return;
    const scope = key(active);
    const done = (speechDone && key(speechDone) === scope) || fallbackRef.current.key === scope;
    if (!done) return;
    if (active.end) {
      if (handled.current.finished === scope) return;
      handled.current.finished = scope;
      const freeTalk = active.end.freeTalk;
      finishRef.current(active.end.next === 'FREE_TALK' && freeTalk
        ? { kind: 'free_talk', topicId: freeTalk.topicId, difficultyId: freeTalk.difficultyId }
        : { kind: 'exit' });
      return;
    }
    if (active.expect.kind === 'none') return;
    arm(active);
  }, [arm]);

  const armFallback = useCallback((scope: string) => {
    if (fallbackRef.current.timer !== null) window.clearTimeout(fallbackRef.current.timer);
    if (noAudioRef.current !== null) window.clearTimeout(noAudioRef.current);
    const moveOn = () => {
      if (fallbackRef.current.timer !== null) window.clearTimeout(fallbackRef.current.timer);
      fallbackRef.current = { key: scope, timer: null };
      advance();
    };
    fallbackRef.current = { key: null, timer: window.setTimeout(moveOn, SPEECH_DONE_FALLBACK_MS) };
    // No sound at all: the server is not speaking this turn (a lost talk answers the next listen with stale_talk).
    noAudioRef.current = window.setTimeout(() => {
      noAudioRef.current = null;
      const { speechDone } = useLessonTalkStore.getState();
      if (audioSeenRef.current !== scope && !(speechDone && key(speechDone) === scope)) moveOn();
    }, NO_AUDIO_FALLBACK_MS);
  }, [advance]);

  // Server messages: a new turn, the end of its speech, what was heard, a failure.
  useEffect(() => useLessonTalkStore.subscribe((state, previous) => {
    const id = live.current.talkId;
    if (!id) return;
    const active = state.turn;
    if (active && active.talkId === id && handled.current.turn !== key(active)) {
      handled.current.turn = key(active);
      armedRef.current = null;
      answeredRef.current = null;
      setNotice(null);
      setHeard('');
      const next: LessonStatus = active.end ? 'ending' : 'speaking';
      setLive({ status: next });
      setStatus(next);
      if (active.progress) resumeRef.current = { level: active.progress.level, topicId: active.progress.topicId };
      armFallback(key(active));
    }
    const transcript = state.transcript;
    const armed = armedRef.current;
    if (transcript && transcript !== previous.transcript && armed && `${transcript.talkId}:${transcript.seq}` === armed.key
      && transcript.at >= armed.since) {
      if (!transcript.final) {
        setHeard(transcript.text);
        if (transcript.text && live.current.status === 'listening') {
          setLive({ status: 'hearing' });
          setStatus('hearing');
        }
      } else if (!transcript.text || isFillerOnly(transcript.text)) {
        // The server disarmed on this final; listen again for the real answer.
        const current = state.turn;
        if (current && key(current) === armed.key) arm(current);
      } else {
        armedRef.current = null;
        setHeard(transcript.text);
        send({ kind: 'speech', text: transcript.text });
      }
    }
    const failure = state.failure;
    if (failure && failure !== handled.current.failure && (failure.talkId === null || failure.talkId === id)) {
      handled.current.failure = failure;
      if (failure.code === 'stale_talk' && failure.talkId === id) {
        // The server no longer has this talk (it ended or was lost with the connection).
        disarm();
        restartRef.current();
      } else if (!NON_FATAL_FAILURES.has(failure.code)) {
        disarm();
        setLive({ status: 'error' });
        setStatus('error');
        setNotice(failure.content);
      }
    }
    advance();
  }), [advance, arm, armFallback, disarm, send, setLive]);

  // The avatar's audio draining is the other half of "the line is over".
  useEffect(() => useStore.subscribe((state, previous) => {
    if (!previous.isPlaying && state.isPlaying) {
      const active = useLessonTalkStore.getState().turn;
      if (active && active.talkId === live.current.talkId) audioSeenRef.current = key(active);
    }
    if (previous.isPlaying && !state.isPlaying) advance();
  }), [advance]);

  useEffect(() => () => {
    if (fallbackRef.current.timer !== null) window.clearTimeout(fallbackRef.current.timer);
    if (noAudioRef.current !== null) window.clearTimeout(noAudioRef.current);
  }, []);

  // The server microphone stays open for the lesson (reopening it can take seconds).
  const microphone = Boolean(talkId) && !paused && isConnected && status !== 'error' && status !== 'ending';
  useEffect(() => {
    if (!setMicrophone || !microphone) return;
    setMicrophone(true);
    return () => setMicrophone(false);
  }, [microphone, setMicrophone]);

  // No first word for a while: the server helps (re-ask, hint, choices). Started speech gets longer.
  useEffect(() => {
    if (paused || (status !== 'listening' && status !== 'hearing')) return;
    const timer = window.setTimeout(() => send({ kind: 'silence' }),
      status === 'hearing' ? HEARING_MS : silenceMs(useLessonTalkStore.getState().turn));
    return () => window.clearTimeout(timer);
  }, [paused, send, status]);

  // A server that never answers must not leave the learner waiting.
  useEffect(() => {
    if (paused || (status !== 'starting' && status !== 'thinking')) return;
    const timer = window.setTimeout(() => {
      disarm();
      setLive({ status: 'error' });
      setStatus('error');
      setNotice('AI 선생님이 대답하지 않아요. 다시 시도해 주세요.');
    }, status === 'starting' ? START_TIMEOUT_MS : THINKING_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [disarm, paused, setLive, status]);

  const offline = Boolean(talkId) && !isConnected;
  // The server ends a talk when its connection drops, so a reconnect starts it again.
  const wasOffline = useRef(false);
  useEffect(() => {
    if (offline) {
      armedRef.current = null;
      wasOffline.current = true;
    } else if (wasOffline.current) {
      wasOffline.current = false;
      // A paused talk restarts on resume instead (the server answers that resume with stale_talk).
      if (live.current.talkId && !live.current.paused) restartRef.current();
    }
  }, [offline]);

  // --- view mirror (/chat) --------------------------------------------------------

  const publisher = useMemo(() => createLessonViewPublisher(kioskId), [kioskId]);
  useEffect(() => {
    if (!currentTurn) return;
    const roleLine = [...currentTurn.lines].reverse().find((line) => line.lang === 'en' && line.role !== 'coach');
    const phase: LessonViewPhase = paused ? 'paused' : currentTurn.stage === 'next' || currentTurn.end ? 'recap'
      : currentTurn.stage === 'level' || currentTurn.stage === 'topic' ? 'setup' : 'lesson';
    publisher.publish({
      phase, titleKo: currentTurn.progress?.titleKo ?? '', topicId: currentTurn.progress?.topicId ?? '',
      turnIndex: currentTurn.progress?.turnIndex ?? 0, turnTotal: currentTurn.progress?.turnTotal ?? 0,
      lineEn: (currentTurn.display?.en ?? roleLine?.text ?? '').slice(0, 300),
      lineKo: (currentTurn.display?.ko ?? roleLine?.subtitleKo ?? '').slice(0, 300),
      expressionEn: (currentTurn.progress?.expressionEn ?? '').slice(0, 200),
    });
  }, [currentTurn, paused, publisher]);

  // --- controls -------------------------------------------------------------------

  const start = useCallback((preset: { level?: string; topicId?: string } = {}) => {
    const id = newTalkId();
    useLessonTalkStore.getState().clear();
    handled.current = { turn: null, failure: null, finished: null };
    armedRef.current = null;
    answeredRef.current = null;
    setLive({ talkId: id, status: 'starting', paused: false });
    setTalkId(id);
    setPaused(false);
    setNotice(null);
    setStatus('starting');
    setHeard('');
    setAnswered('');
    // The touch that opened the lesson also unlocks audio playback.
    const context = useStore.getState().audioAnalyser?.context as AudioContext | undefined;
    if (context?.state === 'suspended') void context.resume().catch(() => undefined);
    if (!sendLessonTalk({ type: 'lesson_talk_start', talkId: id, ...preset })) {
      setLive({ status: 'error' });
      setStatus('error');
      setNotice('AI 선생님과 연결되지 않았어요. 다시 시도해 주세요.');
    }
  }, [sendLessonTalk, setLive]);

  const retry = useCallback(() => start(resumeRef.current), [start]);

  /** Starts a lost talk again at the same level and topic, once a minute; otherwise asks for retry. */
  const recover = useCallback(() => {
    if (Date.now() - lastRestartRef.current < AUTO_RESTART_WINDOW_MS) {
      disarm();
      setLive({ status: 'error' });
      setStatus('error');
      setNotice('AI 선생님과 연결이 끊겼어요. 다시 시도해 주세요.');
      return;
    }
    lastRestartRef.current = Date.now();
    start(resumeRef.current);
  }, [disarm, setLive, start]);
  useEffect(() => { restartRef.current = recover; }, [recover]);

  const togglePause = useCallback(() => {
    const id = live.current.talkId;
    if (!id || status === 'error') return;
    if (!paused) {
      setLive({ paused: true });
      setPaused(true);
      disarm();
      stopAvatarSpeech();
      sendLessonTalk({ type: 'lesson_talk_pause', talkId: id });
      return;
    }
    setLive({ paused: false, status: 'starting' });
    setPaused(false);
    setStatus('starting');
    sendLessonTalk({ type: 'lesson_talk_resume', talkId: id });
  }, [disarm, paused, sendLessonTalk, setLive, status, stopAvatarSpeech]);

  // A touch never collides with the microphone, so choices and help work while the avatar still speaks.
  const interrupt = useCallback((answer: LessonAnswer) => {
    if (live.current.status === 'speaking') stopAvatarSpeech();
    send(answer);
  }, [send, stopAvatarSpeech]);
  const choose = useCallback((choiceId: string) => interrupt({ kind: 'touch', choiceId }), [interrupt]);
  const help = useCallback(() => interrupt({ kind: 'help' }), [interrupt]);

  const shutdown = useCallback(() => {
    if (fallbackRef.current.timer !== null) window.clearTimeout(fallbackRef.current.timer);
    disarm();
    stopAvatarSpeech();
    if (live.current.talkId) sendLessonTalk({ type: 'lesson_talk_end' });
    setLive({ talkId: null });
    useLessonTalkStore.getState().clear();
    publisher.close();
  }, [disarm, publisher, sendLessonTalk, setLive, stopAvatarSpeech]);

  const shownStatus: LessonStatus = offline ? 'error' : status;
  return {
    talkId, turn: currentTurn, status: shownStatus, paused, heard, answered,
    notice: offline ? 'AI 선생님과 연결이 끊겼어요. 다시 연결되면 다시 시도해 주세요.' : notice,
    canAnswer: (status === 'speaking' || status === 'listening' || status === 'hearing') && !paused && !offline
      && Boolean(currentTurn && !currentTurn.end),
    start, retry, togglePause, choose, help, shutdown,
  };
}
