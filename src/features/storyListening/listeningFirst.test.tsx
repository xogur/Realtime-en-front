// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { StoryListeningView } from './StoryListeningView';
import { ODYSSEY } from './stories/odyssey';
import { STORIES } from './stories';
import { listeningKeywords } from './ListeningHints';

class SpeechAudio extends EventTarget {
  static all: SpeechAudio[] = [];
  currentTime = 0; duration = 4; playbackRate = 1; preservesPitch = true; preload = ''; paused = true;
  play = vi.fn(async () => { this.paused = false; });
  pause = vi.fn(() => { this.paused = true; });
  load = vi.fn(); removeAttribute = vi.fn();
  constructor(public src: string) { super(); SpeechAudio.all.push(this); }
  finish() { this.paused = true; this.dispatchEvent(new Event('ended')); }
}
beforeEach(() => { vi.useFakeTimers(); SpeechAudio.all = []; vi.stubGlobal('Audio', SpeechAudio); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
const open = () => {
  render(<StoryListeningView isOpen storyId="odyssey" onBack={vi.fn()} onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: '오디세우스의 모험 시작' }));
  fireEvent.click(screen.getByRole('button', { name: /이야기 시작하기/ }));
};
it('starts without transcript and reveals help only for the current sentence', async () => {
  open();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '바로 시작' })); });
  const line = ODYSSEY.chapters[0].sentences[0];
  expect(screen.queryByText(line.en)).toBeNull();
  expect(screen.queryByText(line.ko)).toBeNull();
  for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole('button', { name: '힌트 주세요' }));
  expect(screen.getByText(line.en)).toBeTruthy();
  expect(screen.queryByText(line.ko)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '뜻 확인' }));
  expect(screen.getByText(line.ko)).toBeTruthy();
  await act(async () => { SpeechAudio.all.at(-1)!.finish(); });
  expect(screen.queryByText(ODYSSEY.chapters[0].sentences[1].en)).toBeNull();
});
it('checks meaning before vocabulary without revealing the answer after a miss', async () => {
  open();
  fireEvent.click(screen.getByRole('button', { name: /^2.*내용 확인/ }));
  fireEvent.click(screen.getByRole('button', { name: /새 집을 찾으려고/ }));
  expect(screen.queryByText(ODYSSEY.chapters[0].quiz.explainKo)).toBeNull();
  expect(screen.queryByText(ODYSSEY.chapters[0].sentences[3].en)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '힌트 주세요' }));
  fireEvent.click(screen.getByRole('button', { name: '다시 듣기', exact: true }));
  fireEvent.click(screen.getAllByRole('button', { name: /학습으로 돌아가기/ })[0]);
  expect(screen.getByText('이 부분만 도움받아요')).toBeTruthy();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '해당 부분 다시 듣기' })); });
  expect(SpeechAudio.all.at(-1)!.src).toContain('/s04.wav');
  await act(async () => { SpeechAudio.all.at(-1)!.finish(); });
  expect(SpeechAudio.all.at(-1)!.paused).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: /트로이 전쟁에 참가하려고/ }));
  fireEvent.click(screen.getByRole('button', { name: /다음: 단어 복습/ }));
  fireEvent.click(screen.getByRole('button', { name: /건너뛰기/ }));
  expect(screen.getByText('글 없이 다시 들어요')).toBeTruthy();
  expect(screen.queryByText(ODYSSEY.chapters[0].sentences[3].en)).toBeNull();
});
it('keeps authored Korean choices aligned and every keyword present in the recording transcript', () => {
  for (const { story } of Object.values(STORIES)) for (const chapter of story.chapters) {
    expect(chapter.quiz.optionsKo).toHaveLength(chapter.quiz.options.length);
    expect(chapter.quiz.optionsKo.every(option => option.trim().length > 0)).toBe(true);
    for (const sentence of chapter.sentences) for (const keyword of listeningKeywords(chapter, sentence)) {
      expect(sentence.en).toContain(keyword);
    }
  }
});
