import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getChapterAudio } from './storyAudio';
import { ODYSSEY } from './stories/odyssey';
import manifest from './audioManifest.json';
import dragonManifest from './dragonAudioManifest.json';
import { RELUCTANT_DRAGON } from './stories/reluctantDragon';

describe.each([[ODYSSEY, manifest], [RELUCTANT_DRAGON, dragonManifest]] as const)('recorded $0.id audio', (story, recording) => {
  it.each(story.chapters)('$id has an intact recording for every authored sentence', chapter => {
    const clips = getChapterAudio(story.id, chapter);
    expect(clips).toHaveLength(chapter.sentences.length);
    const entry = (recording.chapters as Record<string, typeof manifest.chapters.ithaca>)[chapter.id];
    let previous = 0;
    for (const [i, clip] of entry.clips.entries()) {
      expect(clip.text).toBe(chapter.sentences[i].en);
      expect(clip.startSeconds).toBe(previous);
      expect(clip.endSeconds).toBeGreaterThan(clip.startSeconds);
      const data = readFileSync(new URL(`../../..${clip.src.replace('/story-audio/', '/public/story-audio/')}`, import.meta.url));
      expect(data.subarray(0, 4).toString()).toBe('RIFF');
      expect(data.subarray(8, 12).toString()).toBe('WAVE');
      expect(createHash('sha256').update(data).digest('hex')).toBe(clip.sha256);
      expect(Math.abs((data.length - 44) / 48 - clip.durationMs)).toBeLessThanOrEqual(1);
      previous = clip.endSeconds;
    }
    expect(previous).toBe(entry.durationSeconds);
  });
  it('rejects unknown chapters and outdated transcript mappings', () => {
    expect(getChapterAudio('odyssey', { ...ODYSSEY.chapters[0], id: '__proto__' })).toEqual([]);
    const chapter = ODYSSEY.chapters[0];
    expect(getChapterAudio('odyssey', { ...chapter, sentences: [{ ...chapter.sentences[0], en: 'Changed' }, ...chapter.sentences.slice(1)] })).toEqual([]);
  });
  it('looks recordings up per story, so another story never borrows Odyssey clips', () => {
    expect(getChapterAudio('reluctant-dragon', ODYSSEY.chapters[0])).toEqual([]);
    expect(getChapterAudio('hasOwnProperty', ODYSSEY.chapters[0])).toEqual([]);
  });
});
