// @vitest-environment jsdom
import { StrictMode } from 'react';
import { act, configure, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  NAME_CAPTURE_IDLE_TIMEOUT_MS,
  NAME_CAPTURE_MAX_DURATION_MS,
  useParticipantNameCapture,
} from './useParticipantNameCapture';

type SttOptions = {
  language: string;
  onFinalTranscript: (transcript: { text: string }) => void;
  onReadyChange: (ready: boolean) => void;
  onError: (code: string) => void;
  hint?: () => string | null;
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
  pause: vi.fn(async () => {
    mocks.order.push('pause');
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

const browserStt = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useBrowserStt', () => ({ useBrowserStt: browserStt }));
vi.mock('@/hooks/useOnboardingStt', () => ({
  useOnboardingStt: (options: SttOptions) => {
    mocks.sttOptions = options;
    return {
      prepare: mocks.prepare,
      start: mocks.start,
      startAndWaitUntilReady: mocks.start,
      restartAndWaitUntilReady: mocks.start,
      pause: mocks.pause,
      stop: mocks.stop,
      isRecording: false,
      status: 'listening',
    };
  },
}));

const transcript = (text: string) => ({ text });
// Multi-round voice flows chain several awaited steps; the full parallel suite is slower.
configure({ asyncUtilTimeout: 4000 });

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

  it('still prompts and listens after a StrictMode remount, including when enabled later', async () => {
    // Next dev mounts, unmounts and remounts every component once: the unmount must not
    // leave the hook permanently disposed (the name screen stayed silent without a mic).
    const props = { enabled: false, eventId: null as string | null, onConfirm: vi.fn(async () => undefined),
      onSkip: vi.fn(async () => undefined), onWelcomeComplete: vi.fn() };
    const { result, rerender } = renderHook((current) => useParticipantNameCapture(current),
      { initialProps: props, wrapper: StrictMode });
    rerender({ ...props, enabled: true, eventId: 'cocoon:strict:intro' });
    await waitFor(() => expect(mocks.start).toHaveBeenCalledOnce());
    expect(mocks.order).toContain('prepare');
    expect(mocks.speak).toHaveBeenCalledWith('안녕하세요. 이름이나 닉네임을 말씀해 주세요.', 'ko-KR');
    await waitFor(() => expect(result.current.phase).toBe('listening'));
  });

  it('starts once after a StrictMode remount when the event is already known at mount', async () => {
    const { result } = renderHook(() => useParticipantNameCapture({
      enabled: true, eventId: 'cocoon:strict-reload:intro', onConfirm: vi.fn(async () => undefined),
      onSkip: vi.fn(async () => undefined), onWelcomeComplete: vi.fn(),
    }), { wrapper: StrictMode });
    await waitFor(() => expect(result.current.phase).toBe('listening'));
    expect(mocks.speak).toHaveBeenCalledOnce();
    expect(mocks.start).toHaveBeenCalledOnce();
  });

  it('offers sound-alike names, guesses one by voice after "아니요", then lets the guest touch one', async () => {
    const onConfirm = vi.fn(async () => undefined);
    const { result } = renderHook(() => useParticipantNameCapture({
      enabled: true, eventId: 'cocoon:alike:intro', onConfirm,
      onSkip: vi.fn(async () => undefined), onWelcomeComplete: vi.fn(),
    }));
    await waitFor(() => expect(result.current.phase).toBe('listening'));
    // The name answer gets the name question as STT context; the yes/no reply does not.
    expect(mocks.sttOptions?.hint?.()).toBe('name');
    act(() => mocks.sttOptions?.onFinalTranscript(transcript('이소연입니다')));
    await waitFor(() => expect(result.current.phase).toBe('confirming'));
    expect(mocks.sttOptions?.hint?.()).toBeNull();
    expect(result.current.candidate).toBe('이소연');
    expect(result.current.alternatives).toContain('이서연');

    const listened = mocks.start.mock.calls.length;
    act(() => mocks.sttOptions?.onFinalTranscript(transcript('아니요')));
    await waitFor(() => expect(mocks.start.mock.calls.length).toBeGreaterThan(listened));
    const guessed = result.current.candidate;
    expect(guessed).not.toBe('이소연');
    expect(mocks.speak).toHaveBeenLastCalledWith(`그럼 ${guessed}님인가요?`, 'ko-KR');

    act(() => mocks.sttOptions?.onFinalTranscript(transcript('아니')));
    await waitFor(() => expect(mocks.speak).toHaveBeenLastCalledWith('아래에서 맞는 이름을 누르거나, 이름만 다시 말씀해 주세요.', 'ko-KR'));
    await waitFor(() => expect(result.current.phase).toBe('listening'));
    expect(result.current.alternatives.length).toBeGreaterThan(0);
    expect(result.current.alternatives).not.toContain('이소연');
    expect(result.current.alternatives).not.toContain(guessed);

    const pick = result.current.alternatives[0];
    await act(async () => { await result.current.chooseAlternative(pick); });
    expect(onConfirm).toHaveBeenCalledWith(pick);
  });

  it('never asks about a refused spelling again when the same name is heard twice', async () => {
    const { result } = renderHook(() => useParticipantNameCapture({
      enabled: true, eventId: 'cocoon:twice:intro', onConfirm: vi.fn(async () => undefined),
      onSkip: vi.fn(async () => undefined), onWelcomeComplete: vi.fn(),
    }));
    await waitFor(() => expect(result.current.phase).toBe('listening'));
    act(() => mocks.sttOptions?.onFinalTranscript(transcript('정아은')));
    await waitFor(() => expect(result.current.phase).toBe('confirming'));
    let listened = mocks.start.mock.calls.length;
    act(() => mocks.sttOptions?.onFinalTranscript(transcript('아니요')));
    await waitFor(() => expect(mocks.start.mock.calls.length).toBeGreaterThan(listened));
    expect(result.current.candidate).toBe('정하은');
    listened = mocks.start.mock.calls.length;
    act(() => mocks.sttOptions?.onFinalTranscript(transcript('아니요')));
    await waitFor(() => expect(mocks.start.mock.calls.length).toBeGreaterThan(listened));
    await waitFor(() => expect(result.current.phase).toBe('listening'));
    listened = mocks.start.mock.calls.length;
    act(() => mocks.sttOptions?.onFinalTranscript(transcript('정아은')));
    await waitFor(() => expect(mocks.start.mock.calls.length).toBeGreaterThan(listened));
    // Both spellings were refused: no third question about them, the guest is asked again.
    await waitFor(() => expect(result.current.phase).toBe('listening'));
    expect(mocks.speak).not.toHaveBeenLastCalledWith('정아은님인가요?', 'ko-KR');
    expect(mocks.speak).toHaveBeenLastCalledWith('이름만 다시 말씀해 주세요.', 'ko-KR');
  });

  it('asks for one touch when Chrome blocks sound and the microphone, and continues after it', async () => {
    mocks.prepare.mockImplementationOnce(async () => {
      mocks.sttOptions?.onError('AUDIO_GESTURE_REQUIRED');
      return false;
    });
    const { result } = renderHook(() => useParticipantNameCapture({
      enabled: true, eventId: 'cocoon:gesture:intro', onConfirm: vi.fn(async () => undefined),
      onSkip: vi.fn(async () => undefined), onWelcomeComplete: vi.fn(),
    }));
    await waitFor(() => expect(result.current.phase).toBe('error'));
    expect(result.current.error).toContain('다시 시도');
    expect(mocks.speak).not.toHaveBeenCalled();
    await act(async () => { await result.current.retry('immediate'); });
    await waitFor(() => expect(result.current.phase).toBe('listening'));
  });

  it('skips the name step after three failed rounds instead of asking forever', async () => {
    const onSkip = vi.fn(async () => undefined);
    const { result } = renderHook(() => useParticipantNameCapture({
      enabled: true, eventId: 'cocoon:skip:intro', onConfirm: vi.fn(async () => undefined),
      onSkip, onWelcomeComplete: vi.fn(),
    }));
    for (let round = 0; round < 3; round += 1) {
      await waitFor(() => expect(mocks.speak).toHaveBeenCalledTimes(round + 1));
      await waitFor(() => expect(result.current.phase).toBe('listening'));
      act(() => mocks.sttOptions?.onFinalTranscript(transcript('그러니까 음 잘 모르겠어요 진짜')));
    }
    await waitFor(() => expect(onSkip).toHaveBeenCalledWith('retry_exhausted'));
    expect(mocks.speak).toHaveBeenCalledWith('괜찮아요. 이름 없이 시작할게요.', 'ko-KR');
  });

  it('skips the name step when the recognizer is unavailable', async () => {
    const onSkip = vi.fn(async () => undefined);
    const { result } = renderHook(() => useParticipantNameCapture({
      enabled: true, eventId: 'cocoon:down:intro', onConfirm: vi.fn(async () => undefined),
      onSkip, onWelcomeComplete: vi.fn(),
    }));
    await waitFor(() => expect(result.current.phase).toBe('listening'));
    act(() => mocks.sttOptions?.onError('STT_UNAVAILABLE'));
    await waitFor(() => expect(onSkip).toHaveBeenCalledWith('speech_unsupported'));
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
    expect(mocks.sttOptions).toMatchObject({ language: 'ko' });
    expect(browserStt).not.toHaveBeenCalled();
    // The phase follows the awaited start; under a parallel full run it lands a tick later.
    await waitFor(() => expect(result.current.phase).toBe('listening'));

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

  it('starts without a name after a minute without speech, typing or touch', async () => {
    vi.useFakeTimers();
    const onSkip = vi.fn(async () => undefined);
    const { result, unmount } = renderHook(() => useParticipantNameCapture({
      enabled: true, eventId: 'cocoon:idle:intro', onConfirm: vi.fn(async () => undefined),
      onSkip, onWelcomeComplete: vi.fn(),
    }));
    try {
      await act(async () => { await vi.advanceTimersByTimeAsync(NAME_CAPTURE_IDLE_TIMEOUT_MS - 1_000); });
      act(() => result.current.noteActivity());
      await act(async () => { await vi.advanceTimersByTimeAsync(NAME_CAPTURE_IDLE_TIMEOUT_MS - 1_000); });
      expect(onSkip).not.toHaveBeenCalled();
      await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
      expect(onSkip).toHaveBeenCalledOnce();
      expect(onSkip).toHaveBeenCalledWith('timeout');
    } finally { unmount(); vi.useRealTimers(); }
  });

  it('stops an endless capture loop at the hard limit even with continuous activity', async () => {
    vi.useFakeTimers();
    const onSkip = vi.fn(async () => undefined);
    const { result, unmount } = renderHook(() => useParticipantNameCapture({
      enabled: true, eventId: 'cocoon:noise:intro', onConfirm: vi.fn(async () => undefined),
      onSkip, onWelcomeComplete: vi.fn(),
    }));
    try {
      for (let elapsed = 0; elapsed < NAME_CAPTURE_MAX_DURATION_MS - 30_000; elapsed += 30_000) {
        await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
        act(() => result.current.noteActivity());
      }
      expect(onSkip).not.toHaveBeenCalled();
      await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
      expect(onSkip).toHaveBeenCalledWith('timeout');
    } finally { unmount(); vi.useRealTimers(); }
  });

  it('does not time out after the name was confirmed', async () => {
    vi.useFakeTimers();
    const onSkip = vi.fn(async () => undefined);
    const { result, unmount } = renderHook(() => useParticipantNameCapture({
      enabled: true, eventId: 'cocoon:typed:intro', onConfirm: vi.fn(async () => undefined),
      onSkip, onWelcomeComplete: vi.fn(),
    }));
    try {
      await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
      let saved: Promise<boolean> | undefined;
      act(() => { saved = result.current.submitName('김민수'); });
      await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
      expect(result.current.phase).toBe('completed');
      await act(async () => { await vi.advanceTimersByTimeAsync(NAME_CAPTURE_MAX_DURATION_MS); });
      await expect(saved).resolves.toBe(true);
      expect(onSkip).not.toHaveBeenCalled();
    } finally { unmount(); vi.useRealTimers(); }
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
      act(() => mocks.sttOptions?.onFinalTranscript(transcript('안내 에코')));
      expect(result.current.recognizedSpeech).toEqual({ name: '', confirmation: '' });
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

  it('keeps listening after an empty or busy STT result, but skips when the STT server fails', async () => {
    const { result } = renderHook(() => useParticipantNameCapture({
      enabled: true, eventId: 'cocoon:stt-errors:intro', onConfirm: vi.fn(async () => undefined),
      onSkip: vi.fn(async () => undefined), onWelcomeComplete: vi.fn(),
    }));
    await waitFor(() => expect(result.current.phase).toBe('listening'));
    act(() => { mocks.sttOptions?.onError('STT_NO_RESULT'); mocks.sttOptions?.onError('STT_BUSY'); });
    expect(result.current.phase).toBe('listening');
    expect(result.current.error).toBeNull();
    // A recognizer that is down skips the name step instead of waiting for a touch.
    act(() => mocks.sttOptions?.onError('STT_UNAVAILABLE'));
    await waitFor(() => expect(result.current.phase).toBe('completed'));
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
