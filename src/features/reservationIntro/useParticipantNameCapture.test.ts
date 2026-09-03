// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useParticipantNameCapture } from './useParticipantNameCapture';

type SttOptions = {
  onFinalTranscript: (transcript: {
    text: string;
    speechEvidence: { version: 1; provider: 'browser'; finalSegments: string[] };
  }) => void;
  onReadyChange: (ready: boolean) => void;
};

const mocks = vi.hoisted(() => ({
  order: [] as string[],
  sttOptions: null as SttOptions | null,
  speak: vi.fn(async (text: string) => {
    mocks.order.push(`speak:${text}`);
    return true;
  }),
  cancel: vi.fn(),
  prepare: vi.fn(async () => {
    mocks.order.push('prepare');
    return true;
  }),
  start: vi.fn(async () => {
    mocks.order.push('start');
    mocks.sttOptions?.onReadyChange(true);
    return true;
  }),
  stop: vi.fn(async () => {
    mocks.order.push('stop');
  }),
}));

vi.mock('@/hooks/useBrowserTts', () => ({
  useBrowserTts: () => ({
    speak: mocks.speak,
    cancel: mocks.cancel,
    isSpeaking: false,
  }),
}));

vi.mock('@/hooks/useBrowserStt', () => ({
  useBrowserStt: (options: SttOptions) => {
    mocks.sttOptions = options;
    return {
      prepare: mocks.prepare,
      start: mocks.start,
      startAndWaitUntilReady: mocks.start,
      restartAndWaitUntilReady: mocks.start,
      stop: mocks.stop,
      isRecording: false,
      status: 'listening',
    };
  },
}));

const transcript = (text: string) => ({
  text,
  speechEvidence: { version: 1 as const, provider: 'browser' as const, finalSegments: [text] },
});

describe('useParticipantNameCapture', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.order.length = 0;
    mocks.sttOptions = null;
  });

  it('prepares the microphone and starts listening during TTS with no post-prompt gap', async () => {
    const onConfirm = vi.fn(async () => undefined);
    const { result } = renderHook(() => useParticipantNameCapture({
      enabled: true,
      eventId: 'cocoon:1:intro',
      onConfirm,
      onSkip: vi.fn(async () => undefined),
      onWelcomeComplete: vi.fn(),
    }));

    await waitFor(() => expect(mocks.start).toHaveBeenCalledOnce());
    const prepareIndex = mocks.order.indexOf('prepare');
    const promptIndex = mocks.order.findIndex((entry) => entry.startsWith('speak:안녕하세요.'));
    const startIndex = mocks.order.indexOf('start');
    expect(prepareIndex).toBeGreaterThanOrEqual(0);
    expect(promptIndex).toBeGreaterThan(prepareIndex);
    expect(startIndex).toBeGreaterThan(prepareIndex);
    expect(startIndex).toBeLessThan(promptIndex);
    expect(result.current.phase).toBe('listening');

    act(() => mocks.sttOptions?.onFinalTranscript(transcript('내 이름은 권태혁이라고 해')));
    await waitFor(() => expect(mocks.speak).toHaveBeenCalledWith(
      '권태혁님, 맞으신가요? 맞으면 맞다고, 다르면 다시 말하겠다고 말씀해 주세요.',
      'ko-KR',
    ));

    act(() => mocks.sttOptions?.onFinalTranscript(transcript('오케이, 그렇게 해줘')));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith('권태혁'));
    await waitFor(() => expect(mocks.speak).toHaveBeenCalledWith(
      '권태혁님, 환영합니다. 이제 영어 대화를 시작할게요.',
      'ko-KR',
    ));
  });

  it('asks again instead of reading an unrecognized sentence as a name', async () => {
    const onConfirm = vi.fn(async () => undefined);
    renderHook(() => useParticipantNameCapture({
      enabled: true,
      eventId: 'cocoon:sentence:intro',
      onConfirm,
      onSkip: vi.fn(async () => undefined),
      onWelcomeComplete: vi.fn(),
    }));

    await waitFor(() => expect(mocks.start).toHaveBeenCalledOnce());
    act(() => mocks.sttOptions?.onFinalTranscript(transcript('오늘 날씨가 정말 좋아요')));

    await waitFor(() => expect(mocks.speak).toHaveBeenCalledWith(
      '이름을 정확히 확인하지 못했어요. 이름이나 닉네임만 다시 한번 말씀해 주세요.',
      'ko-KR',
    ));
    expect(mocks.speak).not.toHaveBeenCalledWith(
      expect.stringContaining('오늘 날씨가 정말 좋아요님'),
      'ko-KR',
    );
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('extracts a name before a natural call-me-that explanation', async () => {
    renderHook(() => useParticipantNameCapture({
      enabled: true,
      eventId: 'cocoon:natural-name:intro',
      onConfirm: vi.fn(async () => undefined),
      onSkip: vi.fn(async () => undefined),
      onWelcomeComplete: vi.fn(),
    }));

    await waitFor(() => expect(mocks.start).toHaveBeenCalledOnce());
    act(() => mocks.sttOptions?.onFinalTranscript(transcript(
      '내 이름은 권태혁 이라고 하고, 아마 그렇게 불러주면 될 거 같아.',
    )));

    await waitFor(() => expect(mocks.speak).toHaveBeenCalledWith(
      '권태혁님, 맞으신가요? 맞으면 맞다고, 다르면 다시 말하겠다고 말씀해 주세요.',
      'ko-KR',
    ));
    expect(mocks.speak).not.toHaveBeenCalledWith(
      expect.stringContaining('불러주면 될 거 같아님'),
      'ko-KR',
    );
  });

  it('keeps keyboard name entry in the welcome phase until welcome TTS finishes', async () => {
    let finishWelcomeSpeech: ((played: boolean) => void) | undefined;
    mocks.speak.mockImplementation(async (text: string) => {
      mocks.order.push(`speak:${text}`);
      if (text.includes('환영합니다')) {
        return new Promise<boolean>((resolve) => {
          finishWelcomeSpeech = resolve;
        });
      }
      return true;
    });
    const onWelcomeComplete = vi.fn();
    const onConfirm = vi.fn(async () => undefined);
    const { result } = renderHook(() => useParticipantNameCapture({
      enabled: true,
      eventId: 'cocoon:keyboard:intro',
      onConfirm,
      onSkip: vi.fn(async () => undefined),
      onWelcomeComplete,
    }));

    await waitFor(() => expect(mocks.start).toHaveBeenCalledOnce());
    act(() => {
      void result.current.submitName('권태혁');
    });

    await waitFor(() => expect(result.current.phase).toBe('welcoming'));
    expect(onConfirm).toHaveBeenCalledWith('권태혁');
    expect(mocks.speak).toHaveBeenCalledWith(
      '권태혁님, 환영합니다. 이제 영어 대화를 시작할게요.',
      'ko-KR',
    );
    expect(onWelcomeComplete).not.toHaveBeenCalled();

    act(() => finishWelcomeSpeech?.(true));
    await waitFor(() => expect(result.current.phase).toBe('completed'));
    expect(onWelcomeComplete).not.toHaveBeenCalled();
    await waitFor(() => expect(onWelcomeComplete).toHaveBeenCalledOnce(), { timeout: 1_200 });
  });
});
