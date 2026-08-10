// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TranslatorOverlay } from './TranslatorOverlay';

const mocks = vi.hoisted(() => ({
  start: vi.fn(async () => true),
  stop: vi.fn(async () => undefined),
  translateText: vi.fn(),
  sttOptions: null as null | {
    language?: string;
    onFinalTranscript: (transcript: {
      text: string;
      speechEvidence: { version: 1; provider: 'browser'; finalSegments: string[] };
    }) => void;
  },
}));

vi.mock('@/hooks/useBrowserStt', () => ({
  useBrowserStt: (options: typeof mocks.sttOptions) => {
    mocks.sttOptions = options;
    return { start: mocks.start, stop: mocks.stop, isRecording: false };
  },
}));

vi.mock('@/lib/translator', async () => {
  const actual = await vi.importActual<typeof import('@/lib/translator')>('@/lib/translator');
  return { ...actual, translateText: mocks.translateText };
});

describe('TranslatorOverlay', () => {
  const cancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sttOptions = null;
    mocks.translateText.mockResolvedValue({
      translated_text: 'Hello',
      source_language: 'ko',
      target_language: 'en',
      provider: 'argos',
    });
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: { cancel, getVoices: vi.fn(() => []), speak: vi.fn() },
    });
  });

  it('does not expose translation provider implementation details', () => {
    render(<TranslatorOverlay isOpen onClose={vi.fn()} />);

    expect(screen.queryByText(/Argos|CPU/i)).toBeNull();
  });

  it('translates typed Korean with the Argos API contract', async () => {
    render(<TranslatorOverlay isOpen onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('번역할 문장'), { target: { value: '안녕하세요' } });
    fireEvent.click(screen.getByRole('button', { name: '번역하기' }));

    await waitFor(() => expect(screen.getByText('Hello')).toBeTruthy());
    expect(mocks.translateText).toHaveBeenCalledWith(
      '안녕하세요',
      'ko',
      'en',
      expect.any(AbortSignal),
    );
  });

  it('uses the selected Web Speech language and auto-translates a final transcript', async () => {
    render(<TranslatorOverlay isOpen onClose={vi.fn()} />);
    expect(mocks.sttOptions?.language).toBe('ko-KR');

    act(() => mocks.sttOptions?.onFinalTranscript({
      text: '좋은 아침이에요',
      speechEvidence: { version: 1, provider: 'browser', finalSegments: ['좋은 아침이에요'] },
    }));

    await waitFor(() => expect(mocks.translateText).toHaveBeenCalledWith(
      '좋은 아침이에요',
      'ko',
      'en',
      expect.any(AbortSignal),
    ));
  });

  it('lets the user restore a question mark omitted by Web Speech and retranslates', async () => {
    render(<TranslatorOverlay isOpen onClose={vi.fn()} />);

    act(() => mocks.sttOptions?.onFinalTranscript({
      text: '너는 치킨을 좋아해',
      speechEvidence: { version: 1, provider: 'browser', finalSegments: ['너는 치킨을 좋아해'] },
    }));
    fireEvent.click(screen.getByRole('button', { name: '질문 ?' }));

    await waitFor(() => expect(mocks.translateText).toHaveBeenLastCalledWith(
      '너는 치킨을 좋아해?',
      'ko',
      'en',
      expect.any(AbortSignal),
    ));
    expect((screen.getByLabelText('번역할 문장') as HTMLTextAreaElement).value)
      .toBe('너는 치킨을 좋아해?');
  });

  it('automatically adds a question mark for an unambiguous Korean ending', async () => {
    render(<TranslatorOverlay isOpen onClose={vi.fn()} />);

    act(() => mocks.sttOptions?.onFinalTranscript({
      text: '치킨을 좋아합니까',
      speechEvidence: { version: 1, provider: 'browser', finalSegments: ['치킨을 좋아합니까'] },
    }));

    await waitFor(() => expect(mocks.translateText).toHaveBeenCalledWith(
      '치킨을 좋아합니까?',
      'ko',
      'en',
      expect.any(AbortSignal),
    ));
  });

  it('stops translator audio and recognition before closing', () => {
    const onClose = vi.fn();
    render(<TranslatorOverlay isOpen onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: '번역기 닫기' }));

    expect(mocks.stop).toHaveBeenCalled();
    expect(cancel).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
  });
});
