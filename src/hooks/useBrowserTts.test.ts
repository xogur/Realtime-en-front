// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { selectPreferredVoice, useBrowserTts } from './useBrowserTts';

function voice(name: string, lang: string, isDefault = false): SpeechSynthesisVoice {
  return {
    default: isDefault,
    lang,
    localService: true,
    name,
    voiceURI: name,
  } as SpeechSynthesisVoice;
}

describe('selectPreferredVoice', () => {
  it('prefers a natural Korean voice over the first installed Korean voice', () => {
    const installed = [
      voice('Basic Korean', 'ko-KR', true),
      voice('Microsoft SunHi Online (Natural)', 'ko-KR'),
      voice('English Natural', 'en-US'),
    ];

    expect(selectPreferredVoice(installed, 'ko-KR')?.name)
      .toBe('Microsoft SunHi Online (Natural)');
  });

  it('falls back to an available Korean system voice', () => {
    const installed = [
      voice('English Voice', 'en-US'),
      voice('Microsoft Heami Desktop', 'ko-KR'),
    ];

    expect(selectPreferredVoice(installed, 'ko-KR')?.name)
      .toBe('Microsoft Heami Desktop');
  });
});

describe('useBrowserTts', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('queues speech immediately when the browser voice list is still loading', () => {
    class MockUtterance {
      lang = '';
      rate = 1;
      pitch = 1;
      voice: SpeechSynthesisVoice | null = null;
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;

      constructor(public text: string) {}
    }

    const synthesis = {
      cancel: vi.fn(),
      speak: vi.fn(),
      getVoices: vi.fn(() => []),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal('speechSynthesis', synthesis);
    vi.stubGlobal('SpeechSynthesisUtterance', MockUtterance);

    const { result } = renderHook(() => useBrowserTts());
    act(() => {
      void result.current.speak('난이도를 선택해 주세요.', 'ko-KR');
    });

    expect(synthesis.speak).toHaveBeenCalledOnce();
    expect(synthesis.speak.mock.calls[0]?.[0]).toMatchObject({
      text: '난이도를 선택해 주세요.',
      lang: 'ko-KR',
    });
  });

  it('does not let one owner cancel another owner speech and resolves owned cancellation', async () => {
    class MockUtterance {
      lang = '';
      rate = 1;
      pitch = 1;
      voice: SpeechSynthesisVoice | null = null;
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(public text: string) {}
    }
    const synthesis = {
      cancel: vi.fn(), speak: vi.fn(), getVoices: vi.fn(() => []),
      addEventListener: vi.fn(), removeEventListener: vi.fn(),
    };
    vi.stubGlobal('speechSynthesis', synthesis);
    vi.stubGlobal('SpeechSynthesisUtterance', MockUtterance);
    const participant = renderHook(() => useBrowserTts('participant-name'));
    const selector = renderHook(() => useBrowserTts('topic-selector'));
    let playback: Promise<boolean> | undefined;

    act(() => { playback = participant.result.current.speak('환영합니다.', 'ko-KR'); });
    act(() => selector.result.current.cancel());
    expect(synthesis.cancel).not.toHaveBeenCalled();

    act(() => participant.result.current.cancel());
    await expect(playback).resolves.toBe(false);
    expect(synthesis.cancel).toHaveBeenCalledOnce();
  });
});
