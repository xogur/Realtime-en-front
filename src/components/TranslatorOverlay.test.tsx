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
  const speak = vi.fn();

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
      value: { cancel, getVoices: vi.fn(() => []), speak },
    });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      configurable: true,
      value: class TestSpeechSynthesisUtterance {
        lang = '';
        rate = 1;
        voice: SpeechSynthesisVoice | null = null;
        onend: (() => void) | null = null;
        onerror: (() => void) | null = null;

        constructor(public text: string) {}
      },
    });
  });

  it('does not expose translation provider implementation details', () => {
    render(<TranslatorOverlay isOpen onClose={vi.fn()} />);

    expect(screen.queryByText(/Argos|CPU/i)).toBeNull();
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).maxLength).toBe(160);
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

  it('does not send an oversized Web Speech final to the backend', async () => {
    render(<TranslatorOverlay isOpen onClose={vi.fn()} />);
    const oversizedTranscript = 'a'.repeat(161);

    act(() => mocks.sttOptions?.onFinalTranscript({
      text: oversizedTranscript,
      speechEvidence: { version: 1, provider: 'browser', finalSegments: [oversizedTranscript] },
    }));

    expect(mocks.translateText).not.toHaveBeenCalled();
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toHaveLength(160);
    expect((await screen.findByRole('alert')).textContent).toContain('160');
  });

  it('an oversized Web Speech final cancels a pending older translation', async () => {
    let resolveFirst: ((value: {
      translated_text: string;
      source_language: 'ko';
      target_language: 'en';
      provider: 'ollama';
    }) => void) | undefined;
    mocks.translateText.mockImplementationOnce(() => new Promise((resolve) => {
      resolveFirst = resolve;
    }));
    render(<TranslatorOverlay isOpen onClose={vi.fn()} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '안녕하세요' } });
    fireEvent.click(screen.getByRole('button', { name: '번역하기' }));

    const oversizedTranscript = 'a'.repeat(161);
    act(() => mocks.sttOptions?.onFinalTranscript({
      text: oversizedTranscript,
      speechEvidence: { version: 1, provider: 'browser', finalSegments: [oversizedTranscript] },
    }));
    await act(async () => {
      resolveFirst?.({
        translated_text: 'stale result',
        source_language: 'ko',
        target_language: 'en',
        provider: 'ollama',
      });
    });

    expect(screen.queryByText('stale result')).toBeNull();
    expect((await screen.findByRole('alert')).textContent).toContain('160');
  });

  it('editing the source cancels a pending translation and hides its stale result', async () => {
    let resolveFirst: ((value: {
      translated_text: string;
      source_language: 'ko';
      target_language: 'en';
      provider: 'ollama';
    }) => void) | undefined;
    mocks.translateText.mockImplementationOnce(() => new Promise((resolve) => {
      resolveFirst = resolve;
    }));
    render(<TranslatorOverlay isOpen onClose={vi.fn()} />);
    const source = screen.getByRole('textbox');
    fireEvent.change(source, { target: { value: '안녕하세요' } });
    fireEvent.click(screen.getByRole('button', { name: '번역하기' }));

    fireEvent.change(source, { target: { value: '다른 문장' } });
    await act(async () => {
      resolveFirst?.({
        translated_text: 'stale result',
        source_language: 'ko',
        target_language: 'en',
        provider: 'ollama',
      });
    });

    expect(screen.queryByText('stale result')).toBeNull();
    expect((source as HTMLTextAreaElement).value).toBe('다른 문장');
  });

  it('clears the source, result, provider, and focuses the source without changing direction', async () => {
    mocks.translateText.mockResolvedValueOnce({
      translated_text: 'Hello',
      source_language: 'ko',
      target_language: 'en',
      provider: 'papago',
    });
    render(<TranslatorOverlay isOpen onClose={vi.fn()} />);
    const source = screen.getByRole('textbox');
    fireEvent.change(source, { target: { value: '안녕하세요' } });
    fireEvent.click(screen.getByRole('button', { name: '번역하기' }));
    await screen.findByText('Hello');
    expect(screen.getByRole('link', { name: '파파고 번역' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '입력과 번역 결과 모두 지우기' }));

    expect((source as HTMLTextAreaElement).value).toBe('');
    expect(screen.queryByText('Hello')).toBeNull();
    expect(screen.queryByRole('link', { name: '파파고 번역' })).toBeNull();
    expect(document.activeElement).toBe(source);
    expect(screen.getByText('한국어')).toBeTruthy();
    expect(screen.getByText('English')).toBeTruthy();
  });

  it('preserves the selected translation direction after clear', async () => {
    render(<TranslatorOverlay isOpen onClose={vi.fn()} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '안녕하세요' } });
    fireEvent.click(screen.getByRole('button', { name: '번역하기' }));
    await screen.findByText('Hello');
    fireEvent.click(screen.getByRole('button', { name: '번역 방향 바꾸기' }));

    fireEvent.click(screen.getByRole('button', { name: '입력과 번역 결과 모두 지우기' }));

    expect((screen.getByRole('textbox') as HTMLTextAreaElement).placeholder).toBe('Type or speak an English sentence.');
  });

  it('cancels a pending translation and never restores its result after clear', async () => {
    let resolveFirst: ((value: {
      translated_text: string;
      source_language: 'ko';
      target_language: 'en';
      provider: 'ollama';
    }) => void) | undefined;
    mocks.translateText.mockImplementationOnce(() => new Promise((resolve) => {
      resolveFirst = resolve;
    }));
    render(<TranslatorOverlay isOpen onClose={vi.fn()} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '안녕하세요' } });
    fireEvent.click(screen.getByRole('button', { name: '번역하기' }));

    fireEvent.click(screen.getByRole('button', { name: '입력과 번역 결과 모두 지우기' }));
    await act(async () => {
      resolveFirst?.({
        translated_text: 'stale result',
        source_language: 'ko',
        target_language: 'en',
        provider: 'ollama',
      });
    });

    expect(screen.queryByText('stale result')).toBeNull();
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('');
  });

  it('stops recognition and ignores a late STT final after clear', () => {
    render(<TranslatorOverlay isOpen onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '음성으로 입력' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '입력 중' } });
    const clear = screen.getByRole('button', { name: '입력과 번역 결과 모두 지우기' });

    fireEvent.click(clear);
    act(() => mocks.sttOptions?.onFinalTranscript({
      text: '늦게 도착한 문장',
      speechEvidence: { version: 1, provider: 'browser', finalSegments: ['늦게 도착한 문장'] },
    }));

    expect(mocks.stop).toHaveBeenCalled();
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('');
    expect(mocks.translateText).not.toHaveBeenCalled();
  });

  it('explains replacement behavior and keeps clear disabled when nothing is active', () => {
    render(<TranslatorOverlay isOpen onClose={vi.fn()} />);

    expect(screen.getByText('새로 입력하면 이전 번역 결과가 지워집니다. 음성 입력은 현재 입력 문장을 교체합니다.')).toBeTruthy();
    expect((screen.getByRole('button', { name: '입력과 번역 결과 모두 지우기' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('ignores a cancelled TTS error callback after clear', async () => {
    render(<TranslatorOverlay isOpen onClose={vi.fn()} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '안녕하세요' } });
    fireEvent.click(screen.getByRole('button', { name: '번역하기' }));
    await screen.findByText('Hello');
    fireEvent.click(screen.getByRole('button', { name: '문장 들어보기' }));
    await waitFor(() => expect(speak).toHaveBeenCalledOnce());
    const utterance = speak.mock.calls[0][0] as SpeechSynthesisUtterance;

    fireEvent.click(screen.getByRole('button', { name: '입력과 번역 결과 모두 지우기' }));
    act(() => utterance.onerror?.(new Event('error') as SpeechSynthesisErrorEvent));

    expect(screen.queryByRole('alert')).toBeNull();
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

  it('stops translator recognition before closing without cancelling unrelated audio', () => {
    const onClose = vi.fn();
    render(<TranslatorOverlay isOpen onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: '번역기 닫기' }));

    expect(mocks.stop).toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('shows the required Papago attribution only for a Papago result', async () => {
    mocks.translateText.mockResolvedValueOnce({
      translated_text: 'Hello',
      source_language: 'ko',
      target_language: 'en',
      provider: 'papago',
      fallback_reason: 'deepl_quota_exceeded',
    });
    render(<TranslatorOverlay isOpen onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('번역할 문장'), { target: { value: '안녕하세요' } });
    fireEvent.click(screen.getByRole('button', { name: '번역하기' }));

    const attribution = await screen.findByRole('link', { name: '파파고 번역' });
    expect(attribution.getAttribute('href')).toBe('https://papago.naver.com/');
  });

  it('starts translator STT without globally cancelling unrelated audio', () => {
    render(<TranslatorOverlay isOpen onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: '음성으로 입력' }));

    expect(cancel).not.toHaveBeenCalled();
    expect(mocks.start).toHaveBeenCalledOnce();
  });

  it('fully stops translator STT before playing a translated sentence', async () => {
    render(<TranslatorOverlay isOpen onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('번역할 문장'), { target: { value: '안녕하세요' } });
    fireEvent.click(screen.getByRole('button', { name: '번역하기' }));
    await screen.findByText('Hello');

    fireEvent.click(screen.getByRole('button', { name: '문장 들어보기' }));

    await waitFor(() => expect(speak).toHaveBeenCalledOnce());
    expect(mocks.stop).toHaveBeenCalled();
    expect(mocks.stop.mock.invocationCallOrder.at(-1))
      .toBeLessThan(speak.mock.invocationCallOrder[0]);
  });

  it('does not start delayed sentence playback after the translator closes', async () => {
    let finishStopping: (() => void) | undefined;
    mocks.stop.mockImplementationOnce(() => new Promise<undefined>((resolve) => {
      finishStopping = () => resolve(undefined);
    }));
    const onClose = vi.fn();
    render(<TranslatorOverlay isOpen onClose={onClose} />);
    fireEvent.change(screen.getByLabelText('번역할 문장'), { target: { value: '안녕하세요' } });
    fireEvent.click(screen.getByRole('button', { name: '번역하기' }));
    await screen.findByText('Hello');

    fireEvent.click(screen.getByRole('button', { name: '문장 들어보기' }));
    fireEvent.click(screen.getByRole('button', { name: '번역기 닫기' }));
    finishStopping?.();

    await act(async () => undefined);
    expect(speak).not.toHaveBeenCalled();
  });
});
