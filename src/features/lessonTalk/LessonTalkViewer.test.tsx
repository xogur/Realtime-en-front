// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { LessonTalkViewer } from './LessonTalkViewer';

const VIEW = { phase: 'lesson' as const, titleKo: '원하는 것 부탁하기', topicId: 'daily', turnIndex: 1, turnTotal: 5,
  lineEn: 'Anything else?', lineKo: '다른 것도 필요하신가요?', expressionEn: 'Can I have ___, please?' };

describe('LessonTalkViewer (/chat mirror)', () => {
  it('shows the current line and has no interactive element', () => {
    const { container } = render(<LessonTalkViewer view={VIEW} />);
    expect(screen.getByText('Anything else?')).toBeTruthy();
    expect(screen.getByText('다른 것도 필요하신가요?')).toBeTruthy();
    expect(container.querySelectorAll('button, a, input, select, textarea, [tabindex]').length).toBe(0);
    expect(container.firstElementChild?.className).toContain('pointer-events-none');
  });

  it('waits for the avatar screen before a lesson starts', () => {
    render(<LessonTalkViewer view={null} />);
    expect(screen.getByText('AI 선생님 화면에서 수업이 진행돼요')).toBeTruthy();
  });
});
