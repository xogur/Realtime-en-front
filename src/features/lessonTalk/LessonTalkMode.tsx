'use client';

import { useEffect, useRef } from 'react';

import { LessonTalkPanel } from './LessonTalkPanel';
import { useLessonTalk } from './useLessonTalk';

type Props = {
  kioskId: string;
  isConnected: boolean;
  sendLessonTalk: (message: Record<string, unknown>) => boolean;
  stopAvatarSpeech: () => void;
  setMicrophone?: (on: boolean) => void;
  onExit: () => void;
  onFreeTalk: (topicId: string, difficultyId: string) => void;
};

/**
 * Learning on the avatar screen: the avatar teaches by talking. Opening it starts a
 * lesson talk; leaving it (exit, finish or unmount) ends the talk and the microphone.
 * The avatar keeps its own look and voice (no override).
 */
export function LessonTalkMode({ kioskId, isConnected, sendLessonTalk, stopAvatarSpeech, setMicrophone, onExit, onFreeTalk }: Props) {
  const handlers = useRef({ onExit, onFreeTalk });
  useEffect(() => { handlers.current = { onExit, onFreeTalk }; }, [onExit, onFreeTalk]);
  const lesson = useLessonTalk({
    kioskId, isConnected, sendLessonTalk, stopAvatarSpeech, setMicrophone,
    onFinish: (next) => {
      if (next.kind === 'free_talk') handlers.current.onFreeTalk(next.topicId, next.difficultyId);
      else handlers.current.onExit();
    },
  });
  const lifecycle = useRef({ start: lesson.start, shutdown: lesson.shutdown });
  useEffect(() => { lifecycle.current = { start: lesson.start, shutdown: lesson.shutdown }; }, [lesson.start, lesson.shutdown]);

  // Start once the voice connection is up; end the talk when the mode closes.
  const started = useRef(false);
  useEffect(() => {
    if (!isConnected || started.current) return;
    started.current = true;
    lifecycle.current.start();
  }, [isConnected]);
  // A remount (React StrictMode runs effects twice in development) must start a fresh talk again:
  // otherwise the first talk is ended right away and the avatar waits forever.
  useEffect(() => () => {
    started.current = false;
    lifecycle.current.shutdown();
  }, []);

  return <LessonTalkPanel lesson={lesson} onExit={onExit} />;
}
