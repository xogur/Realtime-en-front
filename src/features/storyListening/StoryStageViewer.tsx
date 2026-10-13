'use client';

import type { StoryView } from './control';
import { StoryStage } from './StoryStage';
import { getStory } from './stories';

import './story.css';

/*
 * Guide screen (/chat) during a story: only the animated scene, following the
 * avatar's narration sentence by sentence. Nothing here is interactive; the
 * avatar screen owns every control.
 */

const NO_MOOD = () => ({});

export function StoryStageViewer({ storyId, view }: { storyId: string | null; view: StoryView | null }) {
  const entry = getStory(storyId);
  if (!entry || !view || view.phase === 'picker') {
    return (
      <div role="presentation" className="fixed inset-0 z-[60] flex select-none items-center justify-center bg-[#1b1410] text-center text-white">
        <div>
          <p className="text-4xl font-black">이야기 듣기</p>
          <p className="mt-3 text-xl font-bold text-white/70">AI 선생님 화면에서 이야기를 골라요</p>
        </div>
      </div>
    );
  }
  const { story, scenes, atmosphere } = entry;
  const chapter = story.chapters[Math.min(view.chapterIndex, story.chapters.length - 1)];
  const sentence = chapter.sentences[Math.min(view.sentenceIndex, chapter.sentences.length - 1)];
  const Scene = scenes[chapter.id] ?? scenes[story.chapters[0].id];
  const mood = atmosphere[chapter.id] ?? NO_MOOD;
  const label = view.phase === 'checking' ? 'AI 선생님과 이야기 확인 중'
    : view.phase === 'paused' ? '잠깐 멈춤'
      : view.phase === 'recap' ? '이야기 끝' : null;

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[60] select-none bg-[#1b1410]">
      <StoryStage key={`${story.id}-${chapter.id}`} Scene={Scene} beat={sentence.beat} atmosphere={mood(sentence.beat)}
        bubble={view.phase === 'listening' ? sentence.bubble : undefined} label={`${story.titleKo} ${chapter.titleKo} 장면`} intro>
        <div className="absolute left-6 top-6 rounded-full bg-black/45 px-5 py-2 text-xl font-black text-white">
          {story.titleKo} · {view.chapterIndex + 1}장 {chapter.titleKo}
        </div>
        {label ? (
          <div className="absolute inset-x-0 bottom-10 flex justify-center">
            <span className="rounded-full bg-black/55 px-6 py-3 text-2xl font-black text-white">{label}</span>
          </div>
        ) : null}
      </StoryStage>
    </div>
  );
}
