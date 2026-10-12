'use client';

import type { StoryChapter, StorySentence } from './types';

export type ListeningHelp = 0 | 1 | 2 | 3 | 4;
export const nextHelp = (level: ListeningHelp): ListeningHelp => Math.min(4, level + 1) as ListeningHelp;
export const helpTarget = (chapter: StoryChapter, sentence: StorySentence) =>
  chapter.words.find(word => word.beat === sentence.beat)?.hotspot ?? null;
const COMMON_WORDS = new Set('the and but for with that this they their them said was were had have has not his her she you your our from into out one then very can could would will when what who how why did does too now just all after before again there here much some its him are'.split(' '));
export function listeningKeywords(chapter: StoryChapter, sentence: StorySentence): string[] {
  const tokens = sentence.en.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) ?? [];
  const authored = tokens.filter(token => chapter.words.some(word => token.toLowerCase().startsWith(word.word.toLowerCase())));
  return [...new Set(authored.length ? authored : tokens.filter(token => token.length >= 3 && !COMMON_WORDS.has(token.toLowerCase())))].slice(0, 3);
}

export function ListeningHints({ chapter, sentence, level, onChange, onReplay, replayLabel = '한 번 더 듣기', showControls = true }: {
  chapter: StoryChapter; sentence: StorySentence; level: ListeningHelp;
  onChange: (level: ListeningHelp) => void; onReplay: () => void; replayLabel?: string;
  showControls?: boolean;
}) {
  const keywords = listeningKeywords(chapter, sentence);
  return (
    <div className="mt-4 rounded-2xl border-2 border-[#e3d3bd] bg-[#fffaf2] p-4">
      <p className="text-base font-black text-[#5a3d22]">{level === 0 ? '처음엔 귀로 들어봐요' : '이 부분만 도움받아요'}</p>
      <p className="mt-1 text-sm font-semibold leading-6 text-[#8a6a4a]">
        {level === 0 ? '모든 단어를 몰라도 괜찮아요. 어떤 이야기인지 떠올려 봐요.'
          : level === 1 ? '그림 속 인물과 행동을 살펴보고 다시 들어봐요.'
            : level === 2 ? '이 단어가 들리는지 귀 기울여 봐요.'
              : level === 3 ? '영어 문장과 소리를 연결해 봐요.' : '뜻을 확인했으면 글을 숨기고 다시 들어봐요.'}
      </p>
      {level === 2 ? <p lang="en" className="mt-3 text-xl font-black text-[#b15d18]">{keywords.join(' · ')}</p> : null}
      {level >= 3 ? <p lang="en" className="mt-3 text-lg font-bold leading-7 text-[#3d2a18]">{sentence.en}</p> : null}
      {level >= 4 ? <p className="mt-2 text-base font-semibold leading-7 text-[#8a6a4a]">{sentence.ko}</p> : null}
      {showControls ? <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={onReplay} className="min-h-11 rounded-xl border-2 border-[#c9ae8b] bg-white px-3 font-bold text-[#5a3d22] focus-visible:outline-2">{replayLabel}</button>
        {level < 4 ? <button type="button" onClick={() => onChange(nextHelp(level))} className="min-h-11 rounded-xl border-2 border-[#2a1b12] bg-[#ffe2a6] px-3 font-black focus-visible:outline-2">{level === 3 ? '뜻 확인' : '힌트 주세요'}</button> : null}
        {level > 0 ? <button type="button" onClick={() => onChange(0)} className="min-h-11 rounded-xl px-3 font-bold text-[#8a6a4a] underline underline-offset-4 focus-visible:outline-2">도움 숨기기</button> : null}
      </div> : null}
    </div>
  );
}
