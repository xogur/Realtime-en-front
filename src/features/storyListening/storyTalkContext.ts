import { getStory } from './stories';
import type { StoryPosition } from './control';

/*
 * What the avatar may know when the learner pauses a story to talk about it:
 * earlier chapters only as a short Korean recap, and the current chapter's
 * script only up to the sentence that has been heard. Bounded so a long story
 * cannot crowd out the conversation itself; the server applies the same caps.
 */

export const STORY_TALK_LIMITS = {
  recapChars: 900,
  sentences: 40,
  words: 20,
  textChars: 240,
} as const;

export type StoryTalkContext = {
  storyId: string;
  title: string;
  titleKo: string;
  summaryKo: string;
  /** Earlier chapters, oldest first; the oldest lose their recap first when over budget. */
  previous: { title: string; titleKo: string; recapKo: string }[];
  chapter: {
    number: number;
    title: string;
    titleKo: string;
    /** Heard sentences only. */
    sentences: { en: string; ko: string }[];
    words: { word: string; ko: string }[];
    /** False while the learner is still in the middle of the chapter. */
    complete: boolean;
  };
};

function clip(text: string, max: number = STORY_TALK_LIMITS.textChars) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function buildStoryTalkContext(position: StoryPosition): StoryTalkContext | null {
  const entry = getStory(position.storyId);
  if (!entry) return null;
  const { story } = entry;
  const chapter = story.chapters[position.chapterIndex];
  if (!chapter) return null;
  const heardThrough = Math.min(position.heardThrough, chapter.sentences.length - 1);

  let budget: number = STORY_TALK_LIMITS.recapChars;
  const previous = story.chapters.slice(0, position.chapterIndex).reverse().map((item) => {
    const recap = item.sentences.map((sentence) => sentence.ko).join(' ');
    const recapKo = recap.length <= budget ? recap : '';
    budget -= recapKo.length;
    return { title: clip(item.title), titleKo: clip(item.titleKo), recapKo };
  }).reverse();

  const heard = chapter.sentences.slice(0, Math.max(0, heardThrough + 1));
  const heardText = heard.map((sentence) => sentence.en.toLowerCase()).join(' ');
  return {
    storyId: story.id,
    title: clip(story.title),
    titleKo: clip(story.titleKo),
    summaryKo: clip(story.summaryKo),
    previous,
    chapter: {
      number: position.chapterIndex + 1,
      title: clip(chapter.title),
      titleKo: clip(chapter.titleKo),
      sentences: heard.slice(-STORY_TALK_LIMITS.sentences).map((sentence) => ({ en: clip(sentence.en), ko: clip(sentence.ko) })),
      // Only key words the learner has already heard, so the talk does not spoil the rest of the chapter.
      words: chapter.words.filter((word) => heardText.includes(word.word.toLowerCase())).slice(0, STORY_TALK_LIMITS.words)
        .map((word) => ({ word: clip(word.word, 60), ko: clip(word.ko, 60) })),
      complete: heardThrough >= chapter.sentences.length - 1,
    },
  };
}
