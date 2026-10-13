import odysseyManifest from './audioManifest.json';
import dragonManifest from './dragonAudioManifest.json';
import gulliverManifest from './gulliverAudioManifest.json';
import type { Story, StoryChapter } from './types';

export type StoryAudioClip = { src: string; text: string; durationMs: number };
type Manifest = { storyId: string; chapters: Record<string, { clips: readonly StoryAudioClip[] }> };

// Chapter ids are only unique within a story, so recordings are looked up per story.
const MANIFESTS: Record<string, Manifest> = { odyssey: odysseyManifest, 'reluctant-dragon': dragonManifest, gulliver: gulliverManifest };

/** Only reviewed local content can select a static recording. */
export function getChapterAudio(storyId: string, chapter: StoryChapter): readonly StoryAudioClip[] {
  const manifest = Object.hasOwn(MANIFESTS, storyId) ? MANIFESTS[storyId] : null;
  if (!manifest || manifest.storyId !== storyId) return [];
  const entry = Object.hasOwn(manifest.chapters, chapter.id) ? manifest.chapters[chapter.id] : null;
  if (!entry || entry.clips.length !== chapter.sentences.length
    || entry.clips.some((clip, i) => clip.text !== chapter.sentences[i].en)) return [];
  return entry.clips;
}

const NARRATION_WORDS_PER_MINUTE = 147;

/** Narration length: measured clips when recorded, otherwise words at the measured narration pace. */
export function storyMinutes(story: Story) {
  if (story.narration === 'recorded') {
    const ms = story.chapters.flatMap((chapter) => getChapterAudio(story.id, chapter)).reduce((sum, clip) => sum + clip.durationMs, 0);
    if (ms > 0) return Math.max(1, Math.round(ms / 60_000));
  }
  const words = story.chapters.flatMap((chapter) => chapter.sentences).reduce((sum, item) => sum + item.en.split(/\s+/).length, 0);
  return Math.max(1, Math.round(words / NARRATION_WORDS_PER_MINUTE));
}
