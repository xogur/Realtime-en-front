// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GuidedPracticeView } from './GuidedPracticeView';
import { guidedFixture } from './fixtures';
import { parseGuidedSnapshot } from './types';

afterEach(cleanup);

describe('guided task and condition copy', () => {
  it('keeps the task as the heading and conditions in their own card', () => {
    const snapshot = guidedFixture();
    Object.assign(snapshot.guided!, { intentKo: '상대의 조건을 인정하고 계획 제안하기. 내 말로 말해 보세요.',
      conditionsKo: '수량 2개, 예산 8 이내. 차 3, 주스 4.' });
    render(<GuidedPracticeView snapshot={snapshot} busy={false} onCommand={vi.fn()} onPlay={vi.fn()} />);
    expect(screen.getByRole('heading', { name: snapshot.guided!.intentKo })).toBeTruthy();
    expect(screen.getByLabelText('상황 조건').textContent).toContain('수량 2개');
  });

  it('labels skip and end according to their actual actions', () => {
    const command = vi.fn();
    const snapshot = guidedFixture({ allowedActions: ['SKIP_NODE', 'END_LESSON'] });
    render(<GuidedPracticeView snapshot={snapshot} busy={false} onCommand={command} onPlay={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '이 문장 건너뛰기' }));
    fireEvent.click(screen.getByRole('button', { name: '여기까지' }));
    expect(command.mock.calls).toEqual([['SKIP_NODE', { nodeId: 'r1' }], ['END_LESSON']]);
  });

  it('rejects malformed conditions and accepts older snapshots without them', () => {
    const snapshot = guidedFixture();
    expect(parseGuidedSnapshot(snapshot)).not.toBeNull();
    Object.assign(snapshot.guided!, { conditionsKo: { unsafe: true } });
    expect(parseGuidedSnapshot(snapshot)).toBeNull();
  });
});
