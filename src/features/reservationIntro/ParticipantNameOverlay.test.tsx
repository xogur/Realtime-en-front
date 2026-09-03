// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ParticipantNameOverlay } from './ParticipantNameOverlay';

const mocks = vi.hoisted(() => ({
  capture: {
    phase: 'listening',
    candidate: '',
    interim: '',
    error: null as string | null,
    attempts: 0,
    suggestedSkipReason: null,
    isRecording: true,
    confirm: vi.fn(async () => undefined),
    submitName: vi.fn(async () => undefined),
    retry: vi.fn(async () => undefined),
    skip: vi.fn(async () => undefined),
  },
}));

vi.mock('./useParticipantNameCapture', () => ({
  useParticipantNameCapture: () => mocks.capture,
}));

describe('ParticipantNameOverlay', () => {
  const props = {
    role: 'avatar' as const,
    active: true,
    eventId: 'cocoon:1:intro',
    onConfirm: vi.fn(async () => undefined),
    onSkip: vi.fn(async () => undefined),
    onWelcomeComplete: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(mocks.capture, {
      phase: 'listening',
      candidate: '',
      interim: '',
      error: null,
      isRecording: true,
    });
  });

  it('shows a modal over a blurred view and clearly marks the speaking turn', () => {
    render(<ParticipantNameOverlay {...props} />);

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByRole('heading', { name: '지금 말씀하세요' })).toBeTruthy();
    expect(screen.getByText('마이크가 열렸습니다')).toBeTruthy();
    expect(screen.getByText('이름이나 편하게 사용할 닉네임을 말해 주세요.')).toBeTruthy();
  });

  it('offers explicit confirmation after recognizing a name', () => {
    Object.assign(mocks.capture, {
      phase: 'confirming',
      candidate: '권태혁',
      isRecording: true,
    });
    render(<ParticipantNameOverlay {...props} />);

    fireEvent.click(screen.getByRole('button', { name: '이 이름으로 확정' }));
    expect(mocks.capture.confirm).toHaveBeenCalledOnce();
  });

  it('shows the welcome state before revealing the English program', () => {
    Object.assign(mocks.capture, {
      phase: 'welcoming',
      candidate: '권태혁',
      isRecording: false,
    });
    render(<ParticipantNameOverlay {...props} />);

    expect(screen.getByRole('heading', { name: '권태혁님, 환영합니다' })).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('routes keyboard input through the same welcome sequence as voice input', () => {
    render(<ParticipantNameOverlay {...props} />);

    fireEvent.change(screen.getByLabelText('키보드로 이름 입력'), {
      target: { value: '권태혁' },
    });
    fireEvent.click(screen.getByRole('button', { name: '입력 완료' }));

    expect(mocks.capture.submitName).toHaveBeenCalledWith('권태혁');
    expect(props.onConfirm).not.toHaveBeenCalled();
  });
});
