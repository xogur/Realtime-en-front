// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { getChapterAudio } from '../storyAudio';
import { getStory, STORIES } from '.';
import { ODYSSEY } from './odyssey';

const entry = STORIES.odyssey;

describe('Odyssey story content', () => {
  it('has a scene for every chapter and unique ids', () => {
    const ids = ODYSSEY.chapters.map((chapter) => chapter.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(entry.scenes[id]).toBeTypeOf('function');
  });

  it.each(ODYSSEY.chapters.map((chapter) => [chapter.id, chapter] as const))('%s keeps beats, quiz and words consistent', (_id, chapter) => {
    const beats = chapter.sentences.map((sentence) => sentence.beat);
    expect(beats[0]).toBe(0);
    beats.slice(1).forEach((beat, i) => expect(beat - beats[i]).toBeGreaterThanOrEqual(0));
    expect(chapter.quiz.answer).toBeGreaterThanOrEqual(0);
    expect(chapter.quiz.answer).toBeLessThan(chapter.quiz.options.length);
    expect(chapter.sentences[chapter.quiz.evidence]).toBeDefined();
    for (const word of chapter.words) {
      expect(chapter.sentences.some((sentence) => new RegExp(`\\b${word.word}`, 'i').test(sentence.en))).toBe(true);
      expect(beats).toContain(word.beat);
    }
  });

  it.each(ODYSSEY.chapters.flatMap((chapter) => chapter.words.map((word) => [chapter.id, word.word, word] as const)))(
    '%s shows the %s hotspot at its study beat',
    (chapterId, _word, word) => {
      const Scene = entry.scenes[chapterId];
      const markup = renderToStaticMarkup(<Scene beat={word.beat} />);
      const doc = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`, 'image/svg+xml');
      const targets = [...doc.querySelectorAll(`[data-hotspot="${word.hotspot}"]`)];
      expect(targets.some((node) => {
        for (let el: Element | null = node; el; el = el.parentElement) {
          const style = el.getAttribute('style') ?? '';
          if (/opacity:\s*0(;|$)/.test(style) || /pointer-events:\s*none/.test(style) || el.getAttribute('pointer-events') === 'none') return false;
        }
        return true;
      })).toBe(true);
    },
  );

  it('has one hands-on moment per chapter whose target is visible before the story continues', () => {
    for (const chapter of ODYSSEY.chapters) {
      const moments = chapter.sentences.flatMap((sentence, index) => (sentence.action ? [{ sentence, index }] : []));
      expect(moments).toHaveLength(1);
      const [{ sentence, index }] = moments;
      expect(index).toBeGreaterThan(0);
      const Scene = entry.scenes[chapter.id];
      const markup = renderToStaticMarkup(<Scene beat={chapter.sentences[index - 1].beat} />);
      expect(markup).toContain(`data-hotspot="${sentence.action?.target}"`);
    }
  });

  it('defines a mood for every chapter beat', () => {
    for (const chapter of ODYSSEY.chapters) {
      for (const sentence of chapter.sentences) expect(entry.atmosphere[chapter.id](sentence.beat)).toBeTypeOf('object');
    }
  });

  it('fits a 5-10 minute session with two listening passes', () => {
    const readingMs = ODYSSEY.chapters
      .flatMap((chapter) => getChapterAudio('odyssey', chapter))
      .reduce((sum, clip) => sum + clip.durationMs, 0);
    const listeningMinutes = (readingMs * 2) / 60_000;
    expect(listeningMinutes).toBeGreaterThan(4);
    expect(listeningMinutes).toBeLessThan(9);
  });

  it('only resolves known story ids', () => {
    expect(getStory('odyssey')?.story.id).toBe('odyssey');
    expect(getStory('toString')).toBeNull();
    expect(getStory(null)).toBeNull();
  });
});
