// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TURN } from './fixtures';
import { parseLessonTurn } from './lessonTalk';
import { LessonTalkPanel } from './LessonTalkPanel';

function lessonWith(display: Record<string, unknown>, expect: Record<string, unknown> = TURN.expect) {
  const turn = parseLessonTurn({ ...TURN, expect, display });
  return {
    turn, status: 'listening', paused: false, heard: '', answered: '', notice: null, canAnswer: true, talkId: TURN.talkId,
    start: vi.fn(), retry: vi.fn(), togglePause: vi.fn(), choose: vi.fn(), help: vi.fn(), shutdown: vi.fn(),
  } as unknown as Parameters<typeof LessonTalkPanel>[0]['lesson'];
}

describe('LessonTalkPanel', () => {
  it('tells a beginner what to say, with the expression, how to use it and the words', () => {
    render(<LessonTalkPanel onExit={vi.fn()} lesson={lessonWith({
      en: 'What do you need?', ko: '무엇이 필요하세요?', guideKo: '필요한 걸 공손하게 부탁해 봐.',
      frame: 'Can I have ___, please?', howKo: '끝에 please를 붙이면 공손해져.',
      words: [{ en: 'soup', ko: '수프' }, { en: 'pasta', ko: '파스타' }],
    })} />);
    expect(screen.getByText('이렇게 말해 봐요')).toBeTruthy();
    expect(screen.getByText('필요한 걸 공손하게 부탁해 봐.')).toBeTruthy();
    expect(screen.getByText('Can I have ___, please?')).toBeTruthy();
    expect(screen.getByText('끝에 please를 붙이면 공손해져.')).toBeTruthy();
    expect(screen.getByRole('list', { name: '쓸 수 있는 단어' }).textContent).toBe('soup수프pasta파스타');
  });

  it('marks the avatar line and the learner answer apart so the question is not read back', () => {
    render(<LessonTalkPanel onExit={vi.fn()} lesson={lessonWith({
      en: 'Front desk. How can I help you?', guideKo: '방에 있는 물건이 고장 났다고 말해 봐.',
      frame: "The ___ in my room isn't working.", words: [{ en: 'TV', ko: '텔레비전' }, { en: 'light', ko: '전등' }],
    })} />);
    expect(screen.getByText('AI 선생님이 하는 말')).toBeTruthy();
    expect(screen.getByText('내 대답 · 위 말에 이렇게 대답해요')).toBeTruthy();
  });

  it('shows only the sentence to repeat when the avatar models it', () => {
    render(<LessonTalkPanel onExit={vi.fn()} lesson={lessonWith({
      en: 'What do you need?', guideKo: '필요한 걸 공손하게 부탁해 봐.', model: 'Can I have soup, please?',
      words: [{ en: 'soup', ko: '수프' }],
    })} />);
    expect(screen.getByText('Can I have soup, please?')).toBeTruthy();
    expect(screen.queryByText('이렇게 말해 봐요')).toBeNull();
    expect(screen.queryByText('내 대답 · 위 말에 이렇게 대답해요')).toBeNull();
  });
});
