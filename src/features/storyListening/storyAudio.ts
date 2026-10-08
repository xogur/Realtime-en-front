import odysseyManifest from './audioManifest.json';
import dragonManifest from './dragonAudioManifest.json';
import type { StoryChapter } from './types';

export type StoryAudioClip = { src: string; text: string; durationMs: number };
type Manifest = { storyId: string; chapters: Record<string, { clips: readonly StoryAudioClip[] }> };

// Chapter ids are only unique within a story, so recordings are looked up per story.
const MANIFESTS: Record<string, Manifest> = { odyssey: odysseyManifest, 'reluctant-dragon': dragonManifest };

/** Only reviewed local content can select a static recording. */
export function getChapterAudio(storyId: string, chapter: StoryChapter): readonly StoryAudioClip[] {
  const manifest = Object.hasOwn(MANIFESTS, storyId) ? MANIFESTS[storyId] : null;
  if (!manifest || manifest.storyId !== storyId) return [];
  const entry = Object.hasOwn(manifest.chapters, chapter.id) ? manifest.chapters[chapter.id] : null;
  if (!entry || entry.clips.length !== chapter.sentences.length
    || entry.clips.some((clip, i) => clip.text !== chapter.sentences[i].en)) return [];
  return entry.clips;
}
