// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StoryStageViewer } from './StoryStageViewer';

describe('guide screen story viewer', () => {
  it('shows the scene of the narrated sentence with nothing to press', () => {
    const { container } = render(
      <StoryStageViewer storyId="reluctant-dragon" view={{ phase: 'listening', chapterIndex: 1, sentenceIndex: 3 }} />,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.getAttribute('aria-hidden')).toBe('true');
    expect(root.className).toContain('pointer-events-none');
    expect(container.querySelectorAll('button, a, input, [role="button"], [tabindex]:not([tabindex="-1"])')).toHaveLength(0);
    expect(container.textContent).toContain('2장');
  });

  it('labels the check and paused states without controls', () => {
    const { rerender, container } = render(
      <StoryStageViewer storyId="odyssey" view={{ phase: 'checking', chapterIndex: 0, sentenceIndex: 4 }} />,
    );
    expect(container.textContent).toContain('AI 선생님과 이야기 확인 중');
    rerender(<StoryStageViewer storyId="odyssey" view={{ phase: 'paused', chapterIndex: 0, sentenceIndex: 99 }} />);
    expect(container.textContent).toContain('잠깐 멈춤');
    expect(container.querySelectorAll('button')).toHaveLength(0);
  });

  it('waits for the avatar screen before a story is picked or for an unknown story', () => {
    const { rerender } = render(<StoryStageViewer storyId={null} view={{ phase: 'picker', chapterIndex: 0, sentenceIndex: 0 }} />);
    expect(screen.getByText('AI 선생님 화면에서 이야기를 골라요')).toBeTruthy();
    rerender(<StoryStageViewer storyId="missing" view={{ phase: 'listening', chapterIndex: 0, sentenceIndex: 0 }} />);
    expect(screen.getByText('AI 선생님 화면에서 이야기를 골라요')).toBeTruthy();
  });
});
