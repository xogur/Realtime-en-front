// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStore } from '@/stores/useStore';
import { GuidedPracticeView } from './GuidedPracticeView';
import { GuidedRecapView } from './GuidedRecapView';
import { guidedFixture } from './fixtures';
import { useGuidedLearningStore } from './store';

describe('guided practice UI', () => {
  it('shows the authored Korean question translation without revealing the model', () => {
    const s = guidedFixture();
    s.guided = { ...s.guided!, promptEn: 'What do you like?', promptKo: '무엇을 좋아하나요?', supportVisible: 'NONE', display: { contentCues: [] } };
    render(<GuidedPracticeView snapshot={s} busy={false} onCommand={vi.fn()} onPlay={vi.fn()} />);
    expect(screen.getByText('What do you like?')).toBeTruthy();
    expect(screen.getByText('무엇을 좋아하나요?').getAttribute('lang')).toBe('ko');
    expect(screen.queryByText('I like music.')).toBeNull();
  });
  it('keeps scenario conditions visible separately from the short task heading', () => {
    const s = guidedFixture();
    s.guided = { ...s.guided!, intentKo: '함께할 계획 제안하기. 총 60분. cooking 20분, walking 30분.', supportVisible: 'NONE', display: { contentCues: [] } };
    render(<GuidedPracticeView snapshot={s} busy={false} onCommand={vi.fn()} onPlay={vi.fn()} />);
    expect(screen.getByRole('heading', { name: '함께할 계획 제안하기' })).toBeTruthy();
    expect(screen.getByLabelText('상황 조건').textContent).toBe('총 60분. cooking 20분, walking 30분.');
  });
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
  it.each([
    ['NONE', 'CUE', '힌트 보기 · 1/3'],
    ['CUE', 'FRAME', '문장 틀 보기 · 2/3'],
    ['FRAME', 'MODEL', '전체 예문 보기 · 3/3'],
  ] as const)('reveals the next support from %s through either hint control', (visible, next, label) => {
    const s = guidedFixture();
    s.guided = { ...s.guided!, supportVisible: visible };
    const command = vi.fn();
    const play = vi.fn();
    const { rerender } = render(<GuidedPracticeView snapshot={s} busy={false} onCommand={command} onPlay={play} />);
    const controls = screen.getAllByRole('button', { name: label });
    expect(controls).toHaveLength(2);
    controls.forEach(control => fireEvent.click(control));
    expect(command.mock.calls).toEqual(Array.from({ length: 2 }, () => ['SHOW_SUPPORT', { nodeId: 'r1', support: next }]));
    expect(play).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('이번 시도')).toBeNull();
    // Only the authoritative snapshot advances the hint; pending requests stay blocked.
    rerender(<GuidedPracticeView snapshot={s} busy onCommand={command} onPlay={play} />);
    screen.getAllByRole('button', { name: label }).forEach(control => fireEvent.click(control));
    expect(command).toHaveBeenCalledTimes(2);
  });
  it('stops at the full model, follows the next node, and honors unavailable support', () => {
    const command = vi.fn();
    const s = guidedFixture();
    s.guided = { ...s.guided!, supportVisible: 'MODEL', display: { modelEn: 'Can I have water, please?', contentCues: [] } };
    const { rerender } = render(<GuidedPracticeView snapshot={s} busy={false} onCommand={command} onPlay={vi.fn()} />);
    expect(screen.getByText('Can I have water, please?')).toBeTruthy();
    const complete = screen.getByRole('button', { name: '전체 예문 공개 · 3/3' });
    expect((complete as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(complete);
    expect(command).not.toHaveBeenCalled();
    s.guided = { ...s.guided, nodeId: 'g2', supportVisible: 'NONE', display: { contentCues: [] } };
    rerender(<GuidedPracticeView snapshot={s} busy={false} onCommand={command} onPlay={vi.fn()} />);
    fireEvent.click(screen.getAllByRole('button', { name: '힌트 보기 · 1/3' })[0]);
    expect(command).toHaveBeenLastCalledWith('SHOW_SUPPORT', { nodeId: 'g2', support: 'CUE' });
    rerender(<GuidedPracticeView snapshot={{ ...s, allowedActions: [] }} busy={false} onCommand={command} onPlay={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /힌트 보기/ })).toBeNull();
  });
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
  it('keeps hints available immediately and suspends idle reassurance on manual Stop', async () => {
    vi.useFakeTimers();
    render(<GuidedPracticeView snapshot={guidedFixture()} busy={false} onCommand={vi.fn()} onPlay={vi.fn()} />);
    expect(screen.getByText('막히면 여기를 눌러 보세요.')).toBeTruthy();
    await act(async () => vi.advanceTimersByTimeAsync(15000));
    expect(screen.getByText(/천천히 해도 괜찮아요/)).toBeTruthy();
    act(() => useGuidedLearningStore.setState({ captureStatus: { ...useGuidedLearningStore.getState().captureStatus!, status: 'STOPPED' } }));
    expect(screen.queryByText(/천천히 해도 괜찮아요/)).toBeNull();
    expect(screen.getByText('막히면 여기를 눌러 보세요.')).toBeTruthy();
  });
  it('shows observed recap and does not offer an unimplemented free-talk grant', () => {
    const s = guidedFixture({ stage: 'SUMMARY', allowedActions: ['FINISH'], recap: { observations: [{ textKo: '도움받아 부탁했어요.', said: 'Water, please.' }], freeTalkAvailable: false, nextLessons: [] } });
    render(<GuidedRecapView snapshot={s} busy={false} onCommand={vi.fn()} />);
    expect(screen.getByText('도움받아 부탁했어요.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /프리토킹/ })).toBeNull();
  });
});
