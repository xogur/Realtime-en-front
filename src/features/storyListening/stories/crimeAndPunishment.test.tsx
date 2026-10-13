// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { getChapterAudio, storyMinutes } from '../storyAudio';
import { getStory, STORIES } from '.';
import { CRIME_AND_PUNISHMENT } from './crimeAndPunishment';

const entry = STORIES['crime-and-punishment'];
const chapters = CRIME_AND_PUNISHMENT.chapters;

/** True when a hotspot with this id is drawn and none of its ancestors hides it. */
function visibleHotspot(chapterId: string, beat: number, id: string) {
  const Scene = entry.scenes[chapterId];
  const markup = renderToStaticMarkup(<svg xmlns="http://www.w3.org/2000/svg"><Scene beat={beat} /></svg>);
  const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
  return [...doc.querySelectorAll(`[data-hotspot="${id}"]`)].some((node) => {
    for (let el: Element | null = node; el; el = el.parentElement) {
      const style = el.getAttribute('style') ?? '';
      if (/opacity:\s*0(;|$)/.test(style) || /pointer-events:\s*none/.test(style) || el.getAttribute('pointer-events') === 'none') return false;
    }
    return true;
  });
}

const words = (text: string) => text.split(/\s+/).filter(Boolean).length;

describe('Crime and Punishment story content', () => {
  it('is registered last in the library with scenes for every chapter', () => {
    expect(getStory('crime-and-punishment')?.story).toBe(CRIME_AND_PUNISHMENT);
    expect(Object.keys(STORIES).at(-1)).toBe('crime-and-punishment');
    const ids = chapters.map((chapter) => chapter.id);
    expect(ids).toHaveLength(10);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(entry.scenes[id]).toBeTypeOf('function');
    expect(entry.scenes[CRIME_AND_PUNISHMENT.cover.chapterId]).toBeTypeOf('function');
  });

  it('uses its own recordings for every sentence', () => {
    expect(CRIME_AND_PUNISHMENT.narration).toBe('recorded');
    for (const chapter of chapters) {
      const clips = getChapterAudio(CRIME_AND_PUNISHMENT.id, chapter);
      expect(clips).toHaveLength(chapter.sentences.length);
      expect(clips.map((clip) => clip.text)).toEqual(chapter.sentences.map((sentence) => sentence.en));
      expect(clips.every((clip) => clip.src.startsWith('/story-audio/crime-and-punishment/'))).toBe(true);
    }
  });

  it('runs about ten minutes in short sentences', () => {
    expect(storyMinutes(CRIME_AND_PUNISHMENT)).toBeGreaterThanOrEqual(9);
    expect(storyMinutes(CRIME_AND_PUNISHMENT)).toBeLessThanOrEqual(11);
    for (const sentence of chapters.flatMap((chapter) => chapter.sentences)) {
      expect(words(sentence.en)).toBeLessThanOrEqual(20);
      expect(sentence.ko.length).toBeGreaterThan(0);
    }
  });

  it.each(chapters.map((chapter) => [chapter.id, chapter] as const))('%s keeps beats, quiz and words consistent', (_id, chapter) => {
    const beats = chapter.sentences.map((sentence) => sentence.beat);
    expect(beats[0]).toBe(0);
    beats.slice(1).forEach((beat, i) => expect(beat - beats[i]).toBeGreaterThanOrEqual(0));
    expect(chapter.quiz.answer).toBeGreaterThanOrEqual(0);
    expect(chapter.quiz.answer).toBeLessThan(chapter.quiz.options.length);
    expect(chapter.sentences[chapter.quiz.evidence]).toBeDefined();
    expect(chapter.words).toHaveLength(4);
    for (const word of chapter.words) {
      expect(chapter.sentences.some((sentence) => new RegExp(`\\b${word.word}`, 'i').test(sentence.en))).toBe(true);
      expect(beats).toContain(word.beat);
    }
  });

  it.each(chapters.flatMap((chapter) => chapter.words.map((word) => [chapter.id, word.word, word] as const)))(
    '%s shows the %s hotspot at its study beat',
    (chapterId, _word, word) => {
      expect(visibleHotspot(chapterId, word.beat, word.hotspot ?? '')).toBe(true);
    },
  );

  it('renders every beat with its bubble and defines its mood', () => {
    for (const chapter of chapters) {
      const Scene = entry.scenes[chapter.id];
      for (const sentence of chapter.sentences) {
        expect(() => renderToStaticMarkup(<svg><Scene beat={sentence.beat} bubble={sentence.bubble} /></svg>)).not.toThrow();
        expect(entry.atmosphere[chapter.id](sentence.beat)).toBeTypeOf('object');
      }
    }
  });
});
