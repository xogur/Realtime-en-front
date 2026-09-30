// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ParticipantNameOverlay } from './ParticipantNameOverlay';

const mocks = vi.hoisted(() => ({
  capture: {
    phase: 'listening',
    candidate: '',
    interim: '',
    recognizedSpeech: { name: '', confirmation: '' },
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
      recognizedSpeech: { name: '', confirmation: '' },
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

  it('allows immediate voice correction even while the name confirmation TTS is playing', () => {
    Object.assign(mocks.capture, { phase: 'prompting', candidate: '김민수', isRecording: false });
    render(<ParticipantNameOverlay {...props} />);
    fireEvent.click(screen.getByRole('button', { name: '이름 수정' }));
    expect(mocks.capture.retry).toHaveBeenCalledWith('immediate');
    expect(mocks.capture.submitName).not.toHaveBeenCalled();
  });

  it('retries voice capture without another spoken prompt', () => {
    render(<ParticipantNameOverlay {...props} />);
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(mocks.capture.retry).toHaveBeenCalledWith('immediate');
  });

  it('shows the raw name and confirmation transcripts, not just the parsed name', () => {
    Object.assign(mocks.capture, {
      phase: 'confirming', candidate: '민수',
      recognizedSpeech: { name: '제 이름은 민수입니다.', confirmation: '네 맞아요.' },
    });
    render(<ParticipantNameOverlay {...props} />);
    expect(screen.getByRole('region', { name: '음성 인식 내용' })).toBeTruthy();
    expect(screen.getByText('“제 이름은 민수입니다.”')).toBeTruthy();
    expect(screen.getByText('“네 맞아요.”')).toBeTruthy();
  });

  it('transitions from listening through recognition and confirmation without crashing', async () => {
    const { rerender } = render(<ParticipantNameOverlay {...props} />);
    for (const phase of ['candidate', 'preparing', 'confirming', 'submitting', 'welcoming', 'completed']) {
      Object.assign(mocks.capture, { phase, candidate: '테스트', isRecording: phase === 'confirming' });
      rerender(<ParticipantNameOverlay {...props} />);
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 400)); });
      expect(screen.getByRole('dialog')).toBeTruthy();
    }
  });

  it('survives translation wrapping the recording label before a name is recognized', () => {
    const { rerender } = render(<ParticipantNameOverlay {...props} />);
    const label = screen.getByText('마이크가 열렸습니다');
    // Browser translators replace React-owned text nodes with wrapper elements.
    const text = [...label.childNodes].find((node) => node.nodeType === Node.TEXT_NODE)!;
    const translated = document.createElement('font');
    translated.textContent = text.textContent;
    label.replaceChild(translated, text);
    Object.assign(mocks.capture, { phase: 'candidate', candidate: '테스트', isRecording: false });
    rerender(<ParticipantNameOverlay {...props} />);
    expect(screen.getByRole('dialog')).toBeTruthy();
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
