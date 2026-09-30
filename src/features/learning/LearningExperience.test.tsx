// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LearningExperience } from './LearningExperience';
import { useLearningStore } from './useLearningStore';

beforeEach(() => {
  useLearningStore.getState().reset();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ enabled: true }),
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('LearningExperience', () => {
  it('lets the controller start a catalog topic', () => {
    const onStart = vi.fn();
    render(<LearningExperience role="controller" open onStart={onStart} />);
    fireEvent.click(screen.getByRole('button', { name: /음식점/ }));
    expect(onStart).toHaveBeenCalledWith('restaurant');
  });

  it('keeps the viewer read-only', () => {
    useLearningStore.getState().setSnapshot({
      type: 'learning_state', lessonSessionId: 'lesson-1', revision: 1,
      status: 'ACTIVE', stage: 'EXPRESSION_INTRO',
      topic: { id: 'restaurant', labelKo: '음식점' }, unit: { id: 'r1', goalKo: '주문하기' },
      expressions: [{ id: 'e1', position: 1, required: true, status: 'PRACTICING', text: 'Can I get a coffee?', meaningKo: '커피 주세요', usageKo: '주문할 때', hintLevel: 'NONE', firstWord: 'Can' }],
      currentExpressionId: 'e1', allowedActions: ['CONTINUE', 'PLAY_MODEL'],
    });
    render(<LearningExperience role="viewer" />);
    expect(screen.getByText('Can I get a coffee?')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('fails the learning entry closed when the backend reports it disabled', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ enabled: false }),
    }));
    render(<LearningExperience role="controller" open />);

    await waitFor(() => expect(screen.getByRole('button', { name: /음식점/ }).hasAttribute('disabled')).toBe(true));
    expect(screen.getByRole('alert').textContent).toContain('학습 기록 저장소');
  });
});
