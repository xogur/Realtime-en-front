'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, MessageCircle, Play } from 'lucide-react';

import { useStore } from '@/stores/useStore';

import { publishStoryTalk, type StoryTalk } from './control';
import { buildStoryTalkContext, type StoryTalkContext } from './storyTalkContext';
import { getStory } from './stories';
import { StoryTalkPanel } from './StoryTalkPanel';

/** The guide window must stop the story within this time, or the request is withdrawn. */
const PAUSE_TIMEOUT_MS = 6_000;

type StoryTalkAvatarProps = {
  kioskId: string;
  talk: StoryTalk | null;
  onTalkChange: (talk: StoryTalk | null) => void;
  /** Returns the talk id the server tags this talk's messages with. */
  startTalk: (context: StoryTalkContext) => string;
  /** Microphone on/off during the talk. */
  listen: () => void;
  mute: () => void;
  /** Owner stops the avatar conversation when a talk leaves the active phase. */
  /** Set when the avatar could not open the talk (socket or microphone). */
  talkError: string | null;
};

const primary = 'inline-flex min-h-14 items-center justify-center gap-2 rounded-full bg-[#2f4a3a] px-7 py-3 text-lg font-black text-white shadow-lg transition hover:bg-[#3b5a47] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2f4a3a] focus-visible:ring-offset-2 disabled:opacity-60';
const secondary = 'inline-flex min-h-14 items-center justify-center gap-2 rounded-full border border-zinc-300 bg-white px-7 py-3 text-lg font-black text-zinc-700 transition hover:bg-zinc-50 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2';

function describe(talk: StoryTalk) {
  const position = talk.position;
  const story = getStory(position?.storyId)?.story;
  if (!position || !story) return null;
  const chapter = story.chapters[position.chapterIndex];
  if (!chapter) return null;
  const heard = position.heardThrough < 0 ? '아직 듣기 전' : `${position.heardThrough + 1}번째 문장까지 들었어요`;
  return `${story.titleKo} · ${position.chapterIndex + 1}장 · ${heard}`;
}

/**
 * Avatar side of the story talk. While a story plays on the guide screen the
 * avatar waits behind a paused cover; touching it stops the story, asks once,
 * then talks. Story audio and the avatar never run together.
 */
export function StoryTalkAvatar({ kioskId, talk, onTalkChange, startTalk, listen, mute, talkError }: StoryTalkAvatarProps) {
  const [notice, setNotice] = useState<string | null>(null);
  // Only this talk's messages are shown; earlier talks and free talk stay out of the panel.
  const [talkId, setTalkId] = useState<string | null>(null);

  const withdraw = useCallback((requestId: string, message: string | null) => {
    onTalkChange(null);
    setNotice(message);
    void publishStoryTalk({ phase: 'off', requestId }, kioskId);
  }, [kioskId, onTalkChange]);

  const request = useCallback(async () => {
    const requestId = crypto.randomUUID();
    setNotice(null);
    onTalkChange({ phase: 'requested', requestId, position: null });
    if (!await publishStoryTalk({ phase: 'requested', requestId }, kioskId)) {
      onTalkChange(null);
      setNotice('이야기 화면과 연결하지 못했어요. 잠시 후 다시 눌러 주세요.');
    }
  }, [kioskId, onTalkChange]);

  const requestedId = talk?.phase === 'requested' ? talk.requestId : null;
  useEffect(() => {
    if (!requestedId) return;
    const timer = window.setTimeout(() => withdraw(requestedId, '이야기 화면이 응답하지 않아요. 잠시 후 다시 눌러 주세요.'), PAUSE_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [requestedId, withdraw]);

  const confirm = useCallback(async () => {
    if (talk?.phase !== 'paused') return;
    const context = talk.position ? buildStoryTalkContext(talk.position) : null;
    if (!context) {
      withdraw(talk.requestId, null);
      return;
    }
    if (!await publishStoryTalk({ phase: 'active', requestId: talk.requestId }, kioskId)) {
      onTalkChange(null);
      setNotice('이야기 화면과 연결이 끊겼어요. 다시 눌러 주세요.');
      return;
    }
    onTalkChange({ ...talk, phase: 'active' });
    setTalkId(startTalk(context));
  }, [kioskId, onTalkChange, startTalk, talk, withdraw]);

  // Leaving the active talk stops the avatar in the owner's onTalkChange.
  const finish = useCallback(() => {
    if (talk) withdraw(talk.requestId, null);
  }, [talk, withdraw]);

  if (talk?.phase === 'active') {
    return (
      <StoryTalkPanel
        where={describe(talk)}
        talkId={talkId}
        error={talkError}
        onListen={listen}
        onMute={mute}
        onRetry={() => {
          // Once the avatar has answered, only the microphone needs another try.
          const { isConnected, messages } = useStore.getState();
          if (isConnected && messages.some((message) => message.storyTalkId === talkId)) {
            listen();
            return;
          }
          const context = talk.position ? buildStoryTalkContext(talk.position) : null;
          if (context) setTalkId(startTalk(context));
        }}
        onFinish={finish}
      />
    );
  }

  const where = talk?.phase === 'paused' ? describe(talk) : null;
  return (
    <>
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-zinc-950/45 backdrop-blur-[3px]">
        <div className="flex flex-col items-center px-6 text-center">
          <button
            type="button"
            onClick={() => void request()}
            disabled={talk !== null}
            aria-label="이야기를 멈추고 AI 선생님과 이야기하기"
            className="flex h-36 w-36 items-center justify-center rounded-full border-4 border-white/80 bg-white/20 text-white shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-md transition hover:bg-white/30 active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white disabled:cursor-wait"
          >
            {talk?.phase === 'requested'
              ? <Loader2 className="h-16 w-16 animate-spin" aria-hidden />
              : <Play className="ml-2 h-20 w-20" aria-hidden />}
          </button>
          <p className="mt-6 text-3xl font-black text-white [text-shadow:0_2px_12px_rgba(0,0,0,0.5)]">
            {talk?.phase === 'requested' ? '이야기를 잠깐 멈추는 중…' : '지금은 이야기를 듣는 중이에요'}
          </p>
          <p className="mt-2 text-lg font-bold text-white/85 [text-shadow:0_2px_10px_rgba(0,0,0,0.5)]">
            궁금한 게 생기면 눌러서 AI 선생님과 이야기해요
          </p>
          {notice ? <p role="status" className="mt-4 rounded-2xl bg-white/90 px-4 py-2 text-base font-bold text-amber-800">{notice}</p> : null}
        </div>
      </div>
      {talk?.phase === 'paused' && typeof document !== 'undefined' ? createPortal(
        <div className="fixed inset-0 z-[2147483000] flex items-center justify-center bg-zinc-950/55 p-6 backdrop-blur-sm">
          <section role="dialog" aria-modal="true" aria-labelledby="story-talk-title"
            className="w-full max-w-lg rounded-[2rem] border border-white/70 bg-[#fbf8f4] p-8 text-center shadow-[0_30px_110px_rgba(24,24,27,0.4)]">
            {talk.position ? (
              <>
                <h2 id="story-talk-title" className="text-3xl font-black text-zinc-900">AI 선생님과 이야기할까요?</h2>
                <p className="mt-3 text-base font-semibold leading-7 text-zinc-600">
                  이야기를 잠깐 멈췄어요. 어려운 문장, 단어, 발음을 물어볼 수 있어요.
                </p>
                {where ? <p className="mt-3 rounded-2xl bg-white px-4 py-2 text-sm font-bold text-zinc-500">{where}</p> : null}
                <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-center">
                  <button type="button" className={secondary} onClick={() => withdraw(talk.requestId, null)}>계속 듣기</button>
                  <button type="button" className={primary} onClick={() => void confirm()} autoFocus>
                    <MessageCircle className="h-5 w-5" aria-hidden />이야기하기
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 id="story-talk-title" className="text-3xl font-black text-zinc-900">먼저 이야기를 골라 주세요</h2>
                <p className="mt-3 text-base font-semibold leading-7 text-zinc-600">이야기를 시작한 뒤에 궁금한 것을 물어볼 수 있어요.</p>
                <div className="mt-8 flex justify-center">
                  <button type="button" className={primary} onClick={() => withdraw(talk.requestId, null)} autoFocus>확인</button>
                </div>
              </>
            )}
          </section>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
