'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useStore } from '@/stores/useStore';

import { createStoryViewPublisher, type StoryViewPhase } from './control';
import { connectNarrationToAvatar } from './narrationAudio';
import { getStory } from './stories';
import { getChapterAudio } from './storyAudio';
import { listenSupport, matchSpokenChoice, nextListen, useStoryCheckStore, type ListenSupport, type StoryCheckAnswer } from './storyCheck';
import { useSentencePlayer } from './useSentencePlayer';
import { useStoryAnswerListener } from './useStoryAnswerListener';

/*
 * The avatar owns the story: it narrates each chapter (recorded clips routed
 * through its lip-sync graph), then hands over to the server's comprehension
 * check and follows its decision. Narration, the avatar's questions and the
 * learner's microphone never overlap. The guide window only mirrors the view.
 *
 * Server messages and the avatar's audio state are external stores, so the
 * check reacts to them in subscriptions rather than in render effects.
 */

export type StoryAvatarPhase = 'picker' | 'listening' | 'checking' | 'recap';
export type CheckStatus = 'starting' | 'speaking' | 'listening' | 'hearing' | 'thinking' | 'choices' | 'deciding' | 'passed' | 'error';

/** If the server never reports the end of the avatar's line, continue anyway once the audio is quiet. */
const SPEECH_DONE_FALLBACK_MS = 15_000;
/** A short beat after the avatar's verdict so the story does not start on top of it. */
export const DECISION_PAUSE_MS = 1_500;
/** A passed chapter offers "다음 장 / 다시 듣기"; nobody choosing moves on, so the kiosk never waits forever. */
export const PASSED_AUTO_NEXT_MS = 10_000;
/** No final answer after this long counts as "잘 모르겠어" (the server then offers choices). */
const SILENCE_MS = 15_000;
const HEARING_MS = 25_000;
/** Waiting for the server's first question, or for the next one after an answer (model scoring is bounded at 6s). */
const START_TIMEOUT_MS = 12_000;
const THINKING_TIMEOUT_MS = 20_000;
const NON_FATAL_FAILURES = new Set(['busy', 'stale_prompt', 'stale_check']);
const OFFLINE_NOTICE = 'AI 선생님과 연결이 끊겼어요. 다시 시도해 주세요.';

type Options = {
  kioskId: string;
  isConnected: boolean;
  /** Sends one story_check_* message; false when the socket is not open. */
  sendStoryCheck: (message: Record<string, unknown>) => boolean;
  /** Stops the avatar's current line at once (pause/exit). */
  stopAvatarSpeech: () => void;
  /** Opens the server microphone for the quiz; answers then come from the server STT (Korean). */
  setStoryMicrophone?: (on: boolean) => void;
};

function newCheckId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `check-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function useStoryAvatar({ kioskId, isConnected, sendStoryCheck, stopAvatarSpeech, setStoryMicrophone }: Options) {
  const [storyId, setStoryId] = useState<string | null>(null);
  const [phase, setPhase] = useState<StoryAvatarPhase>('picker');
  const [chapterIndex, setChapterIndex] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [paused, setPaused] = useState(false);
  const [run, setRun] = useState(0);
  const [checkId, setCheckId] = useState<string | null>(null);
  const [checkStatus, setCheckStatus] = useState<CheckStatus>('starting');
  const [notice, setNotice] = useState<string | null>(null);
  /** Seconds left before a passed chapter moves on by itself (shown as a countdown). */
  const [passedLeft, setPassedLeft] = useState(PASSED_AUTO_NEXT_MS / 1000);
  /** A spoken reply on the choices screen that matched no choice. */
  const [choiceMiss, setChoiceMiss] = useState<string | null>(null);
  /** A passed learner hearing the chapter again with the help they picked; it skips the quiz. */
  const [review, setReview] = useState<ListenSupport | null>(null);
  /** The help picked on the passed card (kept for the next chapters). */
  const [reviewChoice, setReviewChoice] = useState<ListenSupport>({ speed: 'normal', english: false, korean: false });

  const live = useRef({ phase, paused, checkId, checkStatus });
  useEffect(() => { live.current = { phase, paused, checkId, checkStatus }; }, [checkId, checkStatus, paused, phase]);
  const answeredSeqRef = useRef<number | null>(null);
  const handledRef = useRef<{ prompt: string | null; decision: string | null; failure: unknown; applied: string | null }>(
    { prompt: null, decision: null, failure: null, applied: null },
  );
  const fallbackRef = useRef<{ key: string | null; timer: number | null }>({ key: null, timer: null });
  const decisionTimerRef = useRef<number | null>(null);
  const cancelDecisionPause = useCallback(() => {
    if (decisionTimerRef.current !== null) window.clearTimeout(decisionTimerRef.current);
    decisionTimerRef.current = null;
  }, []);

  const entry = getStory(storyId);
  const story = entry?.story ?? null;
  const chapter = story?.chapters[chapterIndex] ?? null;
  const lines = useMemo(() => chapter?.sentences.map((sentence) => sentence.en) ?? [], [chapter]);
  const clips = useMemo(() => (story && chapter ? getChapterAudio(story.id, chapter) : []), [chapter, story]);
  const support = review ?? listenSupport(attempt);
  const player = useSentencePlayer(lines, support.speed, undefined, clips, false, connectNarrationToAvatar);

  const prompt = useStoryCheckStore((state) => state.prompt);
  const decision = useStoryCheckStore((state) => state.decision);
  const currentPrompt = prompt && prompt.checkId === checkId ? prompt : null;
  const currentDecision = decision && decision.checkId === checkId ? decision : null;

  const sendAnswer = useCallback((answer: StoryCheckAnswer) => {
    const active = useStoryCheckStore.getState().prompt;
    if (!active || active.checkId !== live.current.checkId || answeredSeqRef.current === active.seq) return;
    answeredSeqRef.current = active.seq;
    setCheckStatus('thinking');
    if (!sendStoryCheck({ type: 'story_check_answer', checkId: active.checkId, seq: active.seq, ...answer })) {
      setCheckStatus('error');
      setNotice('연결이 잠깐 끊겼어요. 다시 시도해 주세요.');
    }
  }, [sendStoryCheck]);

  const serverStt = useMemo(() => (setStoryMicrophone ? {
    arm: (id: string, seq: number) => sendStoryCheck({ type: 'story_check_listen', checkId: id, seq }),
    disarm: () => { sendStoryCheck({ type: 'story_check_listen_stop' }); },
  } : undefined), [sendStoryCheck, setStoryMicrophone]);

  // On the choices screen the microphone stays open: "2번" or "양이요" picks like a touch.
  const onChoices = () => live.current.checkStatus === 'choices';
  const listener = useStoryAnswerListener({
    onAnswer: (text) => {
      if (!onChoices()) {
        sendAnswer({ kind: 'speech', text });
        return;
      }
      const choices = useStoryCheckStore.getState().prompt?.choicesKo ?? [];
      const index = matchSpokenChoice(text, choices);
      if (index === null) {
        setChoiceMiss(text);
        relistenRef.current();
        return;
      }
      setChoiceMiss(null);
      sendAnswer({ kind: 'touch', choiceIndex: index });
    },
    // Touch still works, so a lost microphone must not answer the choices for the learner.
    onUnavailable: () => { if (!onChoices()) sendAnswer({ kind: 'unavailable' }); },
    avatarLine: () => useStoryCheckStore.getState().prompt?.speechKo ?? '',
    server: serverStt,
  });
  const { listen, stop: stopListener, forget: forgetAnswer } = listener;
  const relistenRef = useRef<() => void>(() => {});
  useEffect(() => {
    // A beat after the recognizer stopped, so the restart does not race its shutdown.
    relistenRef.current = () => window.setTimeout(() => {
      if (live.current.checkStatus === 'choices' && !live.current.paused) void listen();
    }, 300);
  }, [listen]);

  // --- narration ---------------------------------------------------------------

  const listenKey = storyId && phase === 'listening' ? `${storyId}:${chapterIndex}:${attempt}:${run}` : null;
  useEffect(() => {
    if (!listenKey) return;
    player.jump(0, true);
    // Only a new chapter, attempt or run restarts the narration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listenKey]);

  useEffect(() => {
    if (phase !== 'listening') return;
    useStore.getState().setPlaying(player.playing);
    return () => useStore.getState().setPlaying(false);
  }, [phase, player.playing]);

  const beginListen = useCallback((nextChapter: number, nextAttempt: number, nextReview: ListenSupport | null = null) => {
    setReview(nextReview);
    setCheckId(null);
    useStoryCheckStore.getState().clear();
    setPaused(false);
    setChapterIndex(nextChapter);
    setAttempt(nextAttempt);
    setPhase('listening');
    setRun((value) => value + 1);
  }, []);

  // --- check -------------------------------------------------------------------

  const startCheck = useCallback(() => {
    if (!story || !chapter) return;
    const id = newCheckId();
    live.current = { ...live.current, checkId: id };
    setCheckId(id);
    answeredSeqRef.current = null;
    useStoryCheckStore.getState().clear();
    setNotice(null);
    setCheckStatus('starting');
    if (!sendStoryCheck({ type: 'story_check_start', checkId: id, storyId: story.id, chapterId: chapter.id, attempt })) {
      setCheckStatus('error');
      setNotice('AI 선생님과 연결되지 않았어요. 다시 시도해 주세요.');
    }
  }, [attempt, chapter, sendStoryCheck, story]);

  // `finished` is still true from the previous chapter until the new narration starts, so it only
  // counts once this listen has been seen unfinished.
  const armedListenRef = useRef<string | null>(null);
  useEffect(() => {
    if (listenKey && !player.finished) armedListenRef.current = listenKey;
  }, [listenKey, player.finished]);

  useEffect(() => {
    if (phase !== 'listening' || !player.finished || !listenKey || armedListenRef.current !== listenKey) return;
    const timer = window.setTimeout(() => {
      setPhase('checking');
      if (review) {
        // A review after a pass returns to the passed card instead of another quiz.
        live.current = { ...live.current, phase: 'checking', checkStatus: 'passed' };
        setCheckStatus('passed');
        setPassedLeft(PASSED_AUTO_NEXT_MS / 1000);
        return;
      }
      startCheck();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [listenKey, phase, player.finished, review, startCheck]);

  const goNext = useCallback(() => {
    if (!story) return;
    if (chapterIndex + 1 >= story.chapters.length) {
      setCheckId(null);
      useStoryCheckStore.getState().clear();
      setPhase('recap');
      return;
    }
    beginListen(chapterIndex + 1, 0);
  }, [beginListen, chapterIndex, story]);

  const applyDecision = useCallback(() => {
    const active = useStoryCheckStore.getState().decision;
    if (!active || active.checkId !== live.current.checkId) return;
    const key = `${active.checkId}:${active.seq}`;
    if (handledRef.current.applied === key) return;
    handledRef.current.applied = key;
    const next = nextListen(active.decision);
    // Slower narration and subtitles are support for a learner who missed the chapter. A learner
    // who passed chooses: the next chapter, or this one again at the same level.
    if (active.decision === 'NEXT' && story && chapterIndex + 1 < story.chapters.length) {
      live.current = { ...live.current, checkStatus: 'passed' };
      setPassedLeft(PASSED_AUTO_NEXT_MS / 1000);
      setCheckStatus('passed');
      return;
    }
    if (next.advance) goNext();
    else beginListen(chapterIndex, next.attempt);
  }, [beginListen, chapterIndex, goNext, story]);

  /**
   * Moves the check on once the avatar's line is over: generated in full (server
   * story_check_speech_done) and drained (no audio playing), or quiet past the fallback.
   */
  const advance = useCallback(() => {
    const { phase: currentPhase, paused: isPaused, checkId: id, checkStatus: status } = live.current;
    if (currentPhase !== 'checking' || isPaused || useStore.getState().isPlaying) return;
    const { prompt: active, decision: decided, speechDone } = useStoryCheckStore.getState();
    const spokenOrQuiet = (target: { checkId: string; seq: number }) => {
      const key = `${target.checkId}:${target.seq}`;
      return (speechDone?.checkId === target.checkId && speechDone.seq === target.seq) || fallbackRef.current.key === key;
    };
    if (status === 'deciding' && decided && decided.checkId === id && spokenOrQuiet(decided)) {
      if (decisionTimerRef.current === null) {
        decisionTimerRef.current = window.setTimeout(() => {
          decisionTimerRef.current = null;
          if (!live.current.paused) applyDecision();
        }, DECISION_PAUSE_MS);
      }
      return;
    }
    if (status === 'speaking' && active && active.checkId === id && spokenOrQuiet(active)) {
      if (active.kind === 'choices') {
        live.current = { ...live.current, checkStatus: 'choices' };
        setCheckStatus('choices');
        setChoiceMiss(null);
        void listen();
        return;
      }
      live.current = { ...live.current, checkStatus: 'listening' };
      setCheckStatus('listening');
      void listen();
    }
  }, [applyDecision, listen]);

  const armFallback = useCallback((key: string) => {
    if (fallbackRef.current.timer !== null) window.clearTimeout(fallbackRef.current.timer);
    fallbackRef.current = { key: null, timer: window.setTimeout(() => {
      fallbackRef.current = { key, timer: null };
      advance();
    }, SPEECH_DONE_FALLBACK_MS) };
  }, [advance]);

  // Server messages: a new prompt, a decision, a failure.
  useEffect(() => useStoryCheckStore.subscribe((state) => {
    const { phase: currentPhase, checkId: id } = live.current;
    if (currentPhase !== 'checking' || !id) return;
    const handled = handledRef.current;
    if (state.prompt && state.prompt.checkId === id && handled.prompt !== `${id}:${state.prompt.seq}`) {
      handled.prompt = `${id}:${state.prompt.seq}`;
      stopListener();
      // The choices keep showing what was heard for the question they replace.
      if (state.prompt.kind !== 'choices') forgetAnswer();
      answeredSeqRef.current = null;
      setNotice(null);
      live.current = { ...live.current, checkStatus: 'speaking' };
      setCheckStatus('speaking');
      armFallback(handled.prompt);
    }
    if (state.decision && state.decision.checkId === id && handled.decision !== `${id}:${state.decision.seq}`) {
      handled.decision = `${id}:${state.decision.seq}`;
      stopListener();
      live.current = { ...live.current, checkStatus: 'deciding' };
      setCheckStatus('deciding');
      armFallback(handled.decision);
    }
    if (state.failure && state.failure !== handled.failure && (state.failure.checkId === null || state.failure.checkId === id)) {
      handled.failure = state.failure;
      if (!(NON_FATAL_FAILURES.has(state.failure.code) && state.prompt?.checkId === id)) {
        stopListener();
        live.current = { ...live.current, checkStatus: 'error' };
        setCheckStatus('error');
        setNotice(state.failure.content);
      }
    }
    advance();
  }), [advance, armFallback, forgetAnswer, stopListener]);

  // The avatar's audio draining is the other half of "the line is over".
  useEffect(() => useStore.subscribe((state, previous) => {
    if (previous.isPlaying && !state.isPlaying) advance();
  }), [advance]);

  useEffect(() => () => {
    if (fallbackRef.current.timer !== null) window.clearTimeout(fallbackRef.current.timer);
    cancelDecisionPause();
  }, [cancelDecisionPause]);

  // The server microphone stays open for the whole quiz (reopening it can take seconds);
  // the server only takes speech as an answer while it is armed for a prompt.
  const quizMicrophone = phase === 'checking' && !paused && isConnected && checkStatus !== 'passed';
  useEffect(() => {
    if (!setStoryMicrophone || !quizMicrophone) return;
    setStoryMicrophone(true);
    return () => setStoryMicrophone(false);
  }, [quizMicrophone, setStoryMicrophone]);

  const offline = phase === 'checking' && !isConnected;
  useEffect(() => {
    if (offline) stopListener();
  }, [offline, stopListener]);
  const shownStatus: CheckStatus = offline ? 'error'
    : checkStatus === 'listening' && listener.state === 'hearing' ? 'hearing' : checkStatus;

  // Silence counts as "잘 모르겠어"; speech that has started gets longer.
  useEffect(() => {
    if (paused || (shownStatus !== 'listening' && shownStatus !== 'hearing')) return;
    const timer = window.setTimeout(() => {
      stopListener();
      sendAnswer({ kind: 'unknown' });
    }, shownStatus === 'hearing' ? HEARING_MS : SILENCE_MS);
    return () => window.clearTimeout(timer);
  }, [paused, sendAnswer, shownStatus, stopListener]);

  // A server that never answers (older backend, stalled scoring) must not leave the learner waiting.
  useEffect(() => {
    if (paused || (shownStatus !== 'starting' && shownStatus !== 'thinking')) return;
    const timer = window.setTimeout(() => {
      stopListener();
      live.current = { ...live.current, checkStatus: 'error' };
      setCheckStatus('error');
      setNotice('AI 선생님이 대답하지 않아요. 다시 시도하거나 다음으로 넘어가요.');
    }, shownStatus === 'starting' ? START_TIMEOUT_MS : THINKING_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [paused, shownStatus, stopListener]);

  // --- view mirror ---------------------------------------------------------------

  const publisher = useMemo(() => createStoryViewPublisher(kioskId), [kioskId]);
  const viewPhase: StoryViewPhase = !storyId ? 'picker' : paused ? 'paused' : phase;
  const sentenceIndex = phase === 'listening' ? player.index : Math.max(0, lines.length - 1);
  useEffect(() => {
    if (!storyId) return;
    publisher.publish(storyId, { phase: viewPhase, chapterIndex, sentenceIndex });
  }, [chapterIndex, publisher, sentenceIndex, storyId, viewPhase]);

  // --- controls ------------------------------------------------------------------

  const pick = useCallback((id: string) => {
    if (!getStory(id)) return;
    // The touch that picks the story also unlocks audio for the narration.
    const context = useStore.getState().audioAnalyser?.context as AudioContext | undefined;
    if (context?.state === 'suspended') void context.resume().catch(() => undefined);
    publisher.reset();
    setStoryId(id);
    beginListen(0, 0);
  }, [beginListen, publisher]);

  const togglePause = useCallback(() => {
    if (phase === 'listening') {
      if (paused || player.blocked || player.error) {
        setPaused(false);
        player.play();
      } else {
        setPaused(true);
        player.pause();
      }
      return;
    }
    if (phase !== 'checking') return;
    if (!paused) {
      live.current = { ...live.current, paused: true };
      setPaused(true);
      cancelDecisionPause();
      stopListener();
      stopAvatarSpeech();
      if (checkId && checkStatus !== 'deciding' && checkStatus !== 'passed') sendStoryCheck({ type: 'story_check_pause', checkId });
      return;
    }
    live.current = { ...live.current, paused: false };
    setPaused(false);
    if (checkStatus === 'deciding') {
      applyDecision();
      return;
    }
    if (checkStatus === 'passed') return;
    if (checkId && checkStatus !== 'error') {
      setCheckStatus('starting');
      sendStoryCheck({ type: 'story_check_resume', checkId });
    }
  }, [applyDecision, cancelDecisionPause, checkId, checkStatus, paused, phase, player, sendStoryCheck, stopAvatarSpeech, stopListener]);

  /** Replays the current sentence (0) or the one before it (-1) while the chapter is narrated. */
  const replaySentence = useCallback((offset: 0 | -1) => {
    if (phase !== 'listening') return;
    setPaused(false);
    player.jump(player.index + offset, true);
  }, [phase, player]);

  /** Moves the narration by a few seconds (across sentences) while the chapter is narrated. */
  const seekNarration = useCallback((seconds: number) => {
    if (phase !== 'listening') return;
    setPaused(false);
    player.seekBy(seconds);
  }, [phase, player]);

  const answerUnknown = useCallback(() => {
    stopListener();
    forgetAnswer();
    sendAnswer({ kind: 'unknown' });
  }, [forgetAnswer, sendAnswer, stopListener]);

  const choose = useCallback((choiceIndex: number) => {
    stopListener();
    setChoiceMiss(null);
    forgetAnswer();
    sendAnswer({ kind: 'touch', choiceIndex });
  }, [forgetAnswer, sendAnswer, stopListener]);

  const retryCheck = useCallback(() => {
    setPaused(false);
    startCheck();
  }, [startCheck]);

  const leaveCheck = useCallback(() => {
    cancelDecisionPause();
    if (checkId) sendStoryCheck({ type: 'story_check_cancel', checkId });
    goNext();
  }, [cancelDecisionPause, checkId, goNext, sendStoryCheck]);

  const shutdown = useCallback(() => {
    cancelDecisionPause();
    stopListener();
    stopAvatarSpeech();
    player.jump(0, false);
    setCheckId(null);
    useStoryCheckStore.getState().clear();
    sendStoryCheck({ type: 'story_check_end' });
  }, [cancelDecisionPause, player, sendStoryCheck, stopAvatarSpeech, stopListener]);

  const backToLibrary = useCallback(() => {
    shutdown();
    publisher.reset();
    setStoryId(null);
    setPhase('picker');
    setPaused(false);
  }, [publisher, shutdown]);

  const restart = useCallback(() => beginListen(0, 0), [beginListen]);

  /** Passed card: turns one kind of help on or off; choosing restarts the countdown. */
  const toggleReview = useCallback((key: 'slow' | 'english' | 'korean') => {
    if (checkStatus !== 'passed') return;
    setReviewChoice((current) => (key === 'slow'
      ? { ...current, speed: current.speed === 'slow' ? 'normal' : 'slow' }
      : { ...current, [key]: !current[key] }));
    setPassedLeft(PASSED_AUTO_NEXT_MS / 1000);
  }, [checkStatus]);

  /** Only after a pass: hear the same chapter again with the picked help, then choose again. */
  const listenAgain = useCallback(() => {
    if (checkStatus !== 'passed') return;
    beginListen(chapterIndex, attempt, reviewChoice);
  }, [attempt, beginListen, chapterIndex, checkStatus, reviewChoice]);

  useEffect(() => {
    if (phase !== 'checking' || checkStatus !== 'passed' || paused) return;
    // Ticks once a second; a pause keeps the seconds left and resuming continues from there.
    const timer = window.setInterval(() => setPassedLeft((left) => Math.max(0, left - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [checkStatus, paused, phase]);

  useEffect(() => {
    if (phase !== 'checking' || checkStatus !== 'passed' || paused || passedLeft > 0) return;
    const timer = window.setTimeout(goNext, 0);
    return () => window.clearTimeout(timer);
  }, [checkStatus, goNext, passedLeft, paused, phase]);

  useEffect(() => () => {
    useStore.getState().setPlaying(false);
  }, []);

  return {
    story, chapter, chapterIndex, attempt, phase, paused, support,
    sentence: chapter?.sentences[player.index] ?? null,
    player,
    check: {
      status: shownStatus, prompt: currentPrompt, decision: currentDecision, heard: listener.heard, answered: listener.answer, choiceMiss,
      choiceListening: checkStatus === 'choices' && listener.state !== 'idle',
      notice: offline ? OFFLINE_NOTICE : notice,
    },
    pick, togglePause, replaySentence, seekNarration, answerUnknown, choose, retryCheck, leaveCheck, shutdown, backToLibrary, restart, goNext, listenAgain, passedLeft,
    reviewChoice, toggleReview,
  };
}
