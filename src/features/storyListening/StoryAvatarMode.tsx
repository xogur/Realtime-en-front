'use client';

import { useEffect, useRef } from 'react';

import { useStore } from '@/stores/useStore';
import { StoryAvatarPanel } from './StoryAvatarPanel';
import { useStoryAvatar } from './useStoryAvatar';

/** Story presenter: a warm, calm female voice and avatar, matched by the backend's story TTS speaker. */
export const STORY_AVATAR_ID = 'Serena';

type Props = {
  kioskId: string;
  isConnected: boolean;
  sendStoryCheck: (message: Record<string, unknown>) => boolean;
  stopAvatarSpeech: () => void;
  setStoryMicrophone?: (on: boolean) => void;
  onExit: () => void;
};

/** Story listening on the avatar screen; leaving it (exit or unmount) stops narration, questions and the microphone. */
export function StoryAvatarMode({ kioskId, isConnected, sendStoryCheck, stopAvatarSpeech, setStoryMicrophone, onExit }: Props) {
  const avatar = useStoryAvatar({ kioskId, isConnected, sendStoryCheck, stopAvatarSpeech, setStoryMicrophone });
  const shutdownRef = useRef(avatar.shutdown);
  useEffect(() => { shutdownRef.current = avatar.shutdown; }, [avatar.shutdown]);
  useEffect(() => () => shutdownRef.current(), []);
  useEffect(() => {
    const { setAvatarOverride } = useStore.getState();
    setAvatarOverride(STORY_AVATAR_ID);
    return () => setAvatarOverride(null);
  }, []);

  return <StoryAvatarPanel avatar={avatar} onExit={onExit} />;
}
