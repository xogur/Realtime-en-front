// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { storyMinutes, StoryListeningView } from './StoryListeningView';

import { RELUCTANT_DRAGON } from './stories/reluctantDragon';

describe('story library', () => {
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

  const open = () => render(<StoryListeningView isOpen storyId="odyssey" onBack={vi.fn()} onClose={vi.fn()} />);

  it('opens on the library and lists the easier story first', () => {
    open();
    const starts = screen.getAllByRole('button', { name: /시작$/ });
    expect(starts.map((button) => button.getAttribute('aria-label'))).toEqual(['싸우기 싫은 용 시작', '오디세우스의 모험 시작']);
    expect(screen.queryByText(/목소리는 준비 중이에요/)).toBeNull();
  });

  it('opens the chosen story and returns to the library', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: '싸우기 싫은 용 시작' }));
    expect(screen.getByRole('heading', { name: '싸우기 싫은 용' })).toBeTruthy();
    expect(screen.getByText('듣기')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /다른 이야기/ }));
    expect(screen.getByRole('heading', { name: '어떤 이야기를 볼까요?' })).toBeTruthy();
  });

  it('offers recorded playback for the dragon and never turns sentences on a reading timer', () => {
    vi.useFakeTimers();
    open();
    fireEvent.click(screen.getByRole('button', { name: '싸우기 싫은 용 시작' }));
    fireEvent.click(screen.getByRole('button', { name: /이야기 시작하기/ }));
    expect(screen.getByText('11문장 중 1번째')).toBeTruthy();
    expect(screen.getByRole('button', { name: '재생' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '다음 문장 읽기' })).toBeNull();
    expect(screen.getByText(/다시 듣기/)).toBeTruthy();
  });

  it('shows the measured narration length rather than the earlier word-count estimate', () => {
    expect(storyMinutes(RELUCTANT_DRAGON)).toBe(9);
  });

  it('stays closed for an unknown story id', () => {
    const { container } = render(<StoryListeningView isOpen storyId="__proto__" onBack={vi.fn()} onClose={vi.fn()} />);
    expect(container.innerHTML).toBe('');
  });

  it('accepts the visible shipboard hero for promise and completes the word game', () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    const { container } = open();
    fireEvent.click(screen.getByRole('button', { name: '오디세우스의 모험 시작' }));
    fireEvent.click(screen.getByRole('button', { name: /이야기 시작하기/ }));
    fireEvent.click(screen.getByRole('button', { name: /2.*듣기 학습/ }));
    fireEvent.click(screen.getByRole('button', { name: /단어 찾기 놀이/ }));
    for (const id of ['island', 'hero', 'ship']) {
      fireEvent.click(container.querySelector(`[data-hotspot="${id}"]`)!);
      act(() => { vi.advanceTimersByTime(1100); });
    }
    expect(screen.getAllByText('promise')).toHaveLength(2);
    fireEvent.click(container.querySelector('[data-hotspot="ship"]')!);
    expect(screen.getByRole('status').textContent).toBe('다시 찾아보세요');
    const hero = container.querySelector('[data-hotspot="hero"]')!;
    fireEvent.click(hero);
    expect(screen.getByRole('status').textContent).toBe('정답! promise = 약속하다');
    act(() => { vi.advanceTimersByTime(1100); });
    expect(screen.getByText('단어 4개를 모두 찾았어요!')).toBeTruthy();
  });
});
