// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStore } from '@/stores/useStore';
import { GuidedPracticeView } from './GuidedPracticeView';
import { GuidedRecapView } from './GuidedRecapView';
import { guidedFixture } from './fixtures';
import { useGuidedLearningStore } from './store';

describe('guided practice UI', () => {
  it.each([
    ['VOICE_NOT_READY', '마이크 또는 음성 연결을 준비하지 못했어요.'],
    ['NO_SPEECH', '말소리가 들리지 않았어요.'],
    ['NO_FINAL', '말씀을 끝까지 인식하지 못했어요.'],
  ] as const)('distinguishes recovery reason %s', (reason, message) => {
    const s = guidedFixture();
    s.guided = { ...s.guided!, recoveryReason: reason, inputState: 'LOCKED' };
    render(<GuidedPracticeView snapshot={s} busy={false} onCommand={vi.fn()} onPlay={vi.fn()} />);
    expect(screen.getByText(new RegExp(message))).toBeTruthy();
  });
  it('projects recap transition payloads and disables duplicate handoff actions', () => {
    const command = vi.fn();
    const s = guidedFixture({ stage: 'SUMMARY', allowedActions: ['REPLAY_LESSON', 'START_NEXT_LESSON', 'BEGIN_FREE_TALK'], recap: { observations: [], freeTalkAvailable: true, nextLessons: [{ id: 'request_intermediate', titleKo: '이유를 붙여 부탁하기' }] } });
    const { rerender } = render(<GuidedRecapView snapshot={s} busy={false} onCommand={command} />);
    fireEvent.click(screen.getByRole('button', { name: '다른 상황으로 한 번 더' }));
    fireEvent.click(screen.getByRole('button', { name: /다음 수업/ }));
    fireEvent.click(screen.getByRole('button', { name: '이 주제로 프리토킹' }));
    expect(command.mock.calls).toEqual([['REPLAY_LESSON'], ['START_NEXT_LESSON', { lessonId: 'request_intermediate' }], ['BEGIN_FREE_TALK']]);
    s.handoff = { id: 'grant', expiresAt: '2026-10-01T00:00:00Z', topicId: 'daily', difficultyId: 'beginner', openerId: 'request', status: 'STARTING' };
    rerender(<GuidedRecapView snapshot={s} busy={false} onCommand={command} />);
    expect((screen.getByRole('button', { name: '이 주제로 프리토킹' }) as HTMLButtonElement).disabled).toBe(true);
  });
  beforeEach(() => {
    useStore.setState({ isConnected: true, isRecording: true, isPlaying: false, liveTranscript: '' });
    useGuidedLearningStore.setState({ snapshot: guidedFixture(), partialTranscript: '', captureStatus: { sessionId: 'guided-one', nodeId: 'r1', attemptId: 'attempt-one', controllerEpoch: 2, captureEpoch: 4, status: 'LISTENING' } });
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); });
  it('shows current interim recognition and the controller status even when viewer mic is off', () => {
    const snapshot = guidedFixture();
    useStore.setState({ isRecording: false });
    useGuidedLearningStore.setState({ snapshot, partialTranscript: 'Can I have water', captureStatus: { sessionId: snapshot.sessionId, nodeId: 'r1', attemptId: 'attempt-one', controllerEpoch: 2, captureEpoch: 4, status: 'LISTENING' } });
    render(<GuidedPracticeView snapshot={snapshot} busy={false} onCommand={vi.fn()} onPlay={vi.fn()} />);
    expect(screen.getByLabelText('실시간 음성 인식').textContent).toContain('Can I have water');
    expect(screen.getByText('듣고 있어요. 내 말로 말해 보세요.')).toBeTruthy();
  });
  it('explains the resting DEMO and finished-attempt states instead of an endless wait', () => {
    const s = guidedFixture({ allowedActions: ['PLAY_MODEL', 'NEXT_NODE', 'ABANDON'] });
    s.guided = { ...s.guided!, phase: 'DEMO', inputState: 'LOCKED', display: { contentCues: [] }, choices: [] };
    const { rerender } = render(<GuidedPracticeView snapshot={s} busy={false} onCommand={vi.fn()} onPlay={vi.fn()} />);
    expect(screen.getByText('대화를 들어 보고, 준비되면 ‘내 말로 바꾸기’를 눌러 주세요.')).toBeTruthy();
    expect(screen.queryByText('잠시 기다려 주세요.')).toBeNull();
    s.guided = { ...s.guided, phase: 'GUIDED', outcome: { meaningStatus: 'MET', inputKind: 'SPEECH', recognitionStatus: 'CLEAR', supportExposure: 'FRAME' } };
    rerender(<GuidedPracticeView snapshot={s} busy={false} onCommand={vi.fn()} onPlay={vi.fn()} />);
    expect(screen.getByText('이번 시도를 확인했어요. ‘다음으로’를 눌러 계속해요.')).toBeTruthy();
  });
  it('selection sends only a command and never fabricates an achievement', () => {
    const command = vi.fn();
    render(<GuidedPracticeView snapshot={guidedFixture()} busy={false} onCommand={command} onPlay={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'tea' }));
    expect(command).toHaveBeenCalledWith('SELECT_CHOICE', { nodeId: 'r1', choiceId: 'tea' });
    expect(screen.queryByText('Can I have tea, please?')).toBeNull();
    expect(screen.queryByLabelText('이번 시도')).toBeNull();
  });
  it('keeps MODEL help out of transfer DOM and labels hinted/uncertain attempts honestly', () => {
    const s = guidedFixture();
    s.stage = 'ROLEPLAY'; s.guided = { ...s.guided!, phase: 'TRANSFER', supportVisible: 'NONE', supportExposure: 'CUE', display: { contentCues: ['towel'] }, choices: [],
      outcome: { meaningStatus: 'MET', inputKind: 'SPEECH', recognitionStatus: 'CLEAR', supportExposure: 'CUE', said: 'A towel, please.' } };
    const { rerender } = render(<GuidedPracticeView snapshot={s} busy={false} onCommand={vi.fn()} onPlay={vi.fn()} />);
    expect(screen.queryByText(/Can I have/)).toBeNull();
    expect(screen.getByText('힌트를 보고 말한 시도예요.')).toBeTruthy();
    s.guided.outcome!.recognitionStatus = 'UNCERTAIN';
    rerender(<GuidedPracticeView snapshot={s} busy={false} onCommand={vi.fn()} onPlay={vi.fn()} />);
    expect(screen.getByText('인식이 불확실해 수행을 확인하지 못했어요.')).toBeTruthy();
    expect(screen.queryByText('예문 없이 말한 시도예요.')).toBeNull();
  });
  it('shows bounded silent help at 8/15 seconds and suspends it on manual Stop', async () => {
    vi.useFakeTimers();
    render(<GuidedPracticeView snapshot={guidedFixture()} busy={false} onCommand={vi.fn()} onPlay={vi.fn()} />);
    await act(async () => vi.advanceTimersByTimeAsync(8000));
    expect(screen.getByText('막히면 도움 보기를 눌러 보세요.')).toBeTruthy();
    await act(async () => vi.advanceTimersByTimeAsync(7000));
    expect(screen.getByText(/천천히 해도 괜찮아요/)).toBeTruthy();
    act(() => useGuidedLearningStore.setState({ captureStatus: { ...useGuidedLearningStore.getState().captureStatus!, status: 'STOPPED' } }));
    expect(screen.queryByText(/천천히 해도 괜찮아요/)).toBeNull();
  });
  it('shows observed recap and does not offer an unimplemented free-talk grant', () => {
    const s = guidedFixture({ stage: 'SUMMARY', allowedActions: ['FINISH'], recap: { observations: [{ textKo: '도움받아 부탁했어요.', said: 'Water, please.' }], freeTalkAvailable: false, nextLessons: [] } });
    render(<GuidedRecapView snapshot={s} busy={false} onCommand={vi.fn()} />);
    expect(screen.getByText('도움받아 부탁했어요.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /프리토킹/ })).toBeNull();
  });
});
