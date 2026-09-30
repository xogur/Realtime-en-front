// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useParticipantNameCapture } from './useParticipantNameCapture';

type SttOptions = {
  language: string;
  publishRecordingState: boolean;
  onInterimTranscript: (text: string) => void;
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
    mocks.speak.mockImplementation(async (text: string) => { mocks.order.push(`speak:${text}`); return true; });
    mocks.cancel.mockReset();
    mocks.order.length = 0;
    mocks.sttOptions = null;
  });

  it('ignores speech during TTS and accepts a direct correction after listening starts', async () => {
    let finishInitial!: (played: boolean) => void;
    mocks.speak.mockImplementation(async (text: string) => {
      if (text.startsWith('안녕하세요.')) return new Promise<boolean>((resolve) => { finishInitial = resolve; });
      return true;
    });
    mocks.cancel.mockImplementation(() => finishInitial?.(false));
    const onConfirm = vi.fn(async () => undefined);
    const { result } = renderHook(() => useParticipantNameCapture({
      enabled: true, eventId: 'cocoon:barge-in:intro', onConfirm,
      onSkip: vi.fn(async () => undefined), onWelcomeComplete: vi.fn(),
    }));
    await waitFor(() => expect(result.current.phase).toBe('prompting'));
    expect(mocks.start).not.toHaveBeenCalled();
    act(() => mocks.sttOptions?.onFinalTranscript(transcript('김민수입니다')));
    expect(result.current.candidate).toBe('');
    act(() => finishInitial(true));
    await waitFor(() => expect(result.current.phase).toBe('listening'));
    act(() => mocks.sttOptions?.onFinalTranscript(transcript('김민수입니다')));
    await waitFor(() => expect(result.current.phase).toBe('confirming'));
    expect(result.current.candidate).toBe('김민수');
    act(() => mocks.sttOptions?.onFinalTranscript(transcript('아니요, 김민서예요')));
    await waitFor(() => expect(result.current.candidate).toBe('김민서'));
    expect(result.current.attempts).toBe(0);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(mocks.speak).toHaveBeenLastCalledWith('김민서님인가요?', 'ko-KR');
  });

  it('prepares permission first and starts Korean browser recognition after TTS', async () => {
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
    expect(startIndex).toBeGreaterThan(promptIndex);
    expect(mocks.sttOptions).toMatchObject({ language: 'ko-KR', publishRecordingState: false });
    expect(result.current.phase).toBe('listening');

    act(() => mocks.sttOptions?.onFinalTranscript(transcript('내 이름은 권태혁이라고 해')));
    await waitFor(() => expect(mocks.speak).toHaveBeenCalledWith(
      '권태혁님인가요?',
      'ko-KR',
    ));

    await waitFor(() => expect(result.current.phase).toBe('confirming'));
    act(() => mocks.sttOptions?.onFinalTranscript(transcript('오케이, 그렇게 해줘')));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith('권태혁'));
    expect(result.current.recognizedSpeech.name).toBe('내 이름은 권태혁이라고 해');
    expect(result.current.recognizedSpeech.confirmation).toBe('오케이, 그렇게 해줘');
    await waitFor(() => expect(mocks.speak).toHaveBeenCalledWith(
      '권태혁님, 환영합니다. 이제 영어 대화를 시작할게요.',
      'ko-KR',
    ));
  });

  it('waits for the echo tail and never starts recognition after the overlay closes', async () => {
    vi.useFakeTimers();
    const { result, rerender, unmount } = renderHook(({ enabled }) => useParticipantNameCapture({
      enabled, eventId: 'cocoon:closed:intro', onConfirm: vi.fn(async () => undefined),
      onSkip: vi.fn(async () => undefined), onWelcomeComplete: vi.fn(),
    }), { initialProps: { enabled: true } });
    try {
      await act(async () => { await vi.advanceTimersByTimeAsync(249); });
      expect(result.current.phase).toBe('prompting');
      expect(mocks.start).not.toHaveBeenCalled();
      act(() => mocks.sttOptions?.onInterimTranscript('안내 에코'));
      expect(result.current.interim).toBe('');
      rerender({ enabled: false });
      await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
      expect(mocks.start).not.toHaveBeenCalled();
    } finally { unmount(); vi.useRealTimers(); }
  });

  it('stops confirmation TTS and listens for a replacement name without another prompt', async () => {
    let finishConfirmation!: (played: boolean) => void;
    mocks.speak.mockImplementation(async (text: string) => {
      if (text === '김민수님인가요?') return new Promise<boolean>((resolve) => { finishConfirmation = resolve; });
      return true;
    });
    mocks.cancel.mockImplementation(() => finishConfirmation?.(false));
    const { result } = renderHook(() => useParticipantNameCapture({
      enabled: true, eventId: 'cocoon:instant-retry:intro', onConfirm: vi.fn(async () => undefined),
      onSkip: vi.fn(async () => undefined), onWelcomeComplete: vi.fn(),
    }));
    await waitFor(() => expect(result.current.phase).toBe('listening'));
    act(() => mocks.sttOptions?.onFinalTranscript(transcript('김민수입니다')));
    await waitFor(() => expect(result.current.phase).toBe('prompting'));
    const promptCount = mocks.speak.mock.calls.length;
    const cancelCount = mocks.cancel.mock.calls.length;
    await act(async () => { await result.current.retry('immediate'); });
    expect(mocks.cancel.mock.calls.length).toBeGreaterThan(cancelCount);
    expect(mocks.speak).toHaveBeenCalledTimes(promptCount);
    expect(result.current.phase).toBe('listening');
    expect(result.current.candidate).toBe('');
    expect(result.current.recognizedSpeech).toEqual({ name: '', confirmation: '' });
    act(() => mocks.sttOptions?.onFinalTranscript(transcript('김민서입니다')));
    await waitFor(() => expect(result.current.candidate).toBe('김민서'));
    expect(mocks.speak).toHaveBeenLastCalledWith('김민서님인가요?', 'ko-KR');
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
      '이름만 다시 말씀해 주세요.',
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
      '권태혁님인가요?',
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
