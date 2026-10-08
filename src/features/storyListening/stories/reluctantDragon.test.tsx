// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { getChapterAudio } from '../storyAudio';
import { getStory, STORIES } from '.';
import { RELUCTANT_DRAGON } from './reluctantDragon';

const entry = STORIES['reluctant-dragon'];
const chapters = RELUCTANT_DRAGON.chapters;
const MEASURED_WORDS_PER_MINUTE = 147;

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

describe('The Reluctant Dragon story content', () => {
  it('is registered for the library with scenes for every chapter', () => {
    expect(getStory('reluctant-dragon')?.story).toBe(RELUCTANT_DRAGON);
    const ids = chapters.map((chapter) => chapter.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(entry.scenes[id]).toBeTypeOf('function');
    expect(entry.scenes[RELUCTANT_DRAGON.cover.chapterId]).toBeTypeOf('function');
  });

  it('uses its own reviewed recordings for every sentence', () => {
    expect(RELUCTANT_DRAGON.narration).toBe('recorded');
    for (const chapter of chapters) {
      const clips = getChapterAudio(RELUCTANT_DRAGON.id, chapter);
      expect(clips).toHaveLength(chapter.sentences.length);
      expect(clips.map(clip => clip.text)).toEqual(chapter.sentences.map(sentence => sentence.en));
      expect(clips.every(clip => clip.src.startsWith('/story-audio/reluctant-dragon/'))).toBe(true);
    }
  });

  it('has about ten minutes of narration in short sentences', () => {
    const all = chapters.flatMap((chapter) => chapter.sentences);
    const total = all.reduce((sum, sentence) => sum + words(sentence.en), 0);
    const minutes = total / MEASURED_WORDS_PER_MINUTE;
    expect(minutes).toBeGreaterThan(9);
    expect(minutes).toBeLessThan(11.5);
    for (const sentence of all) {
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

  it('has one or two hands-on moments per chapter whose targets are visible before the story continues', () => {
    for (const chapter of chapters) {
      const moments = chapter.sentences.flatMap((sentence, index) => (sentence.action ? [{ sentence, index }] : []));
      expect(moments.length).toBeGreaterThanOrEqual(1);
      expect(moments.length).toBeLessThanOrEqual(2);
      for (const { sentence, index } of moments) {
        expect(index).toBeGreaterThan(0);
        expect(visibleHotspot(chapter.id, chapter.sentences[index - 1].beat, sentence.action?.target ?? '')).toBe(true);
      }
    }
  });

  it('mixes every kind of moment and gives feeling choices one fitting answer', () => {
    const actions = chapters.flatMap((chapter) => chapter.sentences.flatMap((sentence) => (sentence.action ? [sentence.action] : [])));
    expect(new Set(actions.map((action) => action.kind))).toEqual(new Set(['tap', 'hold', 'rub', 'feel']));
    for (const action of actions.filter((item) => item.kind === 'feel')) {
      expect(action.choices?.length).toBeGreaterThanOrEqual(2);
      expect(action.choices?.[action.answer ?? -1]).toBeDefined();
      expect(new Set(action.choices?.map((choice) => choice.en)).size).toBe(action.choices?.length);
    }
  });

  it('renders every beat and defines its mood', () => {
    for (const chapter of chapters) {
      const Scene = entry.scenes[chapter.id];
      for (const sentence of chapter.sentences) {
        expect(() => renderToStaticMarkup(<svg><Scene beat={sentence.beat} bubble={sentence.bubble} /></svg>)).not.toThrow();
        expect(entry.atmosphere[chapter.id](sentence.beat)).toBeTypeOf('object');
      }
    }
  });
});
