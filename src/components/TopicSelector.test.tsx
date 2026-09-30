// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TopicSelector } from './TopicSelector';

const mocks = vi.hoisted(() => ({
  selection: {
    phase: 'difficulty', interim: '', recognizedSpeech: { difficulty: '', topic: '' },
    error: null, isRecording: true, sttStatus: 'listening',
    selectDifficulty: vi.fn(), selectTopicByTouch: vi.fn(), returnToDifficulty: vi.fn(), stop: vi.fn(),
  },
}));
vi.mock('./useVoiceTopicSelection', () => ({ useVoiceTopicSelection: () => mocks.selection }));
describe('visible speech recognition', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(mocks.selection, { phase: 'difficulty', interim: '', isRecording: true, sttStatus: 'listening', error: null, recognizedSpeech: { difficulty: '', topic: '' } });
  });
  it('shows interim and final raw transcripts in a dedicated region', () => {
    Object.assign(mocks.selection, {
      interim: '공항으로', recognizedSpeech: { difficulty: '초급으로 할게요.', topic: '' },
    });
    render(<TopicSelector isOpen onSelect={vi.fn()} onClose={vi.fn()} />);
    const region = within(screen.getByRole('region', { name: '음성 인식 내용' }));
    expect(region.getByText('인식 중')).toBeTruthy();
    expect(region.getByText('“공항으로”')).toBeTruthy();
    expect(region.getByText('“초급으로 할게요.”')).toBeTruthy();
  });
  it('keeps both final results readable during the launch phase', () => {
    Object.assign(mocks.selection, {
      phase: 'starting', recognizedSpeech: { difficulty: '중간으로 해 주세요', topic: '공항이요' },
    });
    render(<TopicSelector isOpen onSelect={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText('“중간으로 해 주세요”')).toBeTruthy();
    expect(screen.getByText('“공항이요”')).toBeTruthy();
  });

  it('shows a prominent listening state and numbered touch cards', () => {
    render(<TopicSelector isOpen onSelect={vi.fn()} onClose={vi.fn()} />);
    const timing = screen.getByRole('status', { name: '말할 타이밍' });
    expect(timing.getAttribute('data-voice-state')).toBe('listening');
    expect(within(timing).getByText('지금 말씀하세요')).toBeTruthy();
    expect(screen.getByText('터치 선택')).toBeTruthy();
    const first = screen.getByRole('button', { name: /초급.*1번/ });
    fireEvent.click(first);
    expect(mocks.selection.selectDifficulty).toHaveBeenCalledWith('beginner');
  });

  it('does not signal a speaking turn during TTS and keeps touch available', () => {
    Object.assign(mocks.selection, { isRecording: false, sttStatus: 'prompting' });
    render(<TopicSelector isOpen onSelect={vi.fn()} onClose={vi.fn()} />);
    const timing = screen.getByRole('status', { name: '말할 타이밍' });
    expect(timing.getAttribute('data-voice-state')).toBe('prompting');
    expect(within(timing).getByText('안내 중')).toBeTruthy();
    expect(screen.queryByText('지금 말씀하세요')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /중급.*2번/ }));
    expect(mocks.selection.selectDifficulty).toHaveBeenCalledWith('intermediate');
  });
});
