// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GuidedLearningEntry } from './GuidedLearningEntry';
import { guidedFixture } from './fixtures';
import { useGuidedLearningStore } from './store';
import type { GuidedHome, GuidedSnapshot } from './types';
import { GuidedApiError } from './api';

const api = vi.hoisted(() => ({ getGuidedHome: vi.fn(), getGuidedSession: vi.fn(), saveGuidedProfile: vi.fn(), sendGuidedCommand: vi.fn(), startGuidedLesson: vi.fn() }));
const audio = vi.hoisted(() => ({ speak: vi.fn<(...args: unknown[]) => Promise<boolean>>(async () => false), cancel: vi.fn(), cancelAndWait: vi.fn(async () => true), reconcileIdle: vi.fn(), isPlaying: false, error: null }));
vi.mock('./api', async importOriginal => ({ ...await importOriginal<typeof import('./api')>(), ...api }));
vi.mock('../useMissionGuideAudio', () => ({ useMissionGuideAudio: () => audio }));

function phase(name: NonNullable<GuidedSnapshot['guided']>['phase'], revision: number): GuidedSnapshot {
  const s = guidedFixture({ revision, stage: ['DEMO', 'REHEARSE'].includes(name) ? 'PREP' : name === 'RECAP' ? 'SUMMARY' : 'ROLEPLAY', allowedActions: ['NEXT_NODE', 'ABANDON'] });
  s.guided = { ...s.guided!, phase: name, nodeId: name.toLowerCase(), attemptId: `attempt-${revision}`, display: { contentCues: [] }, choices: [] };
  if (name === 'DEMO') {
    s.allowedActions.push('PLAY_MODEL'); s.guided.audioId = 'd1'; s.guided.supportVisible = 'MODEL';
    s.guided.display.demo = [{ speaker: '직원', text: 'What would you like?', meaningKo: '무엇을 드릴까요?' }, { speaker: '나', text: 'Water, please.', meaningKo: '물을 주세요.' }];
  }
  // Existing manual transport tests do not simulate the controller voice ACK.
  s.guided.voiceStarted = false;
  if (name === 'TRANSFER') { s.guided.supportVisible = 'NONE'; s.guided.supportExposure = 'NONE'; }
  if (name === 'RECAP') { s.allowedActions = ['FINISH']; s.recap = { observations: [{ textKo: '새 장면에서 예문 없이 부탁했어요.', said: 'A towel, please.' }], freeTalkAvailable: false, nextLessons: [] }; }
  return s;
}

describe('guided lesson entry orchestration', () => {
  it('filters situations by free-talk topic and starts only the chosen lesson', async () => {
    api.getGuidedHome.mockResolvedValue({ contractVersion: 2, contentVersion: 'topics', levels: [], profile: { level: 'beginner', revision: 1 }, activeSessionId: null,
      lessons: [
        { id: 'request_beginner', titleKo: '기본 요청 연습', level: 'beginner' },
        { id: 'restaurant_order_beginner', titleKo: '음식 주문하고 추가 요청하기', canDoKo: '먹고 싶은 음식을 공손하게 주문해요.', level: 'beginner', topicId: 'restaurant' },
        { id: 'airport_boarding_beginner', titleKo: '탑승구 찾기', level: 'beginner', topicId: 'airport' },
        { id: 'restaurant_order_advanced', titleKo: '고급 주문 협의', level: 'advanced', topicId: 'restaurant' },
      ] });
    api.startGuidedLesson.mockResolvedValue(guidedFixture({ stage: 'BRIEF', guided: null }));
    render(<GuidedLearningEntry onBack={vi.fn()} onClose={vi.fn()} />);
    await screen.findByRole('button', { name: /기본 요청 연습/ });
    fireEvent.click(screen.getByRole('button', { name: '음식점' }));
    expect(screen.getByText('먹고 싶은 음식을 공손하게 주문해요.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /기본 요청 연습|탑승구 찾기|고급 주문 협의/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /음식 주문하고 추가 요청하기/ }));
    await waitFor(() => expect(api.startGuidedLesson).toHaveBeenCalledWith('restaurant_order_beginner'));
  });
  it('keeps a topic handoff connected and closes the lesson after completion', async () => {
    const current = phase('RECAP', 5);
    current.allowedActions = ['BEGIN_FREE_TALK', 'ABANDON'];
    current.recap!.freeTalkAvailable = true;
    const prepared: GuidedSnapshot = { ...current, revision: 6,
      handoff: { id: 'restaurant-grant', expiresAt: '2026-10-07T06:00:00Z', topicId: 'restaurant', openerId: 'restaurant-order', difficultyId: 'beginner', status: 'PREPARED' } };
    useGuidedLearningStore.setState({ snapshot: current });
    api.getGuidedHome.mockResolvedValue({ contractVersion: 2, contentVersion: 'v2', levels: [], profile: { level: 'beginner', revision: 1 }, lessons: [], activeSessionId: current.sessionId });
    api.getGuidedSession.mockResolvedValue(current);
    api.sendGuidedCommand.mockResolvedValue(prepared);
    const onClose = vi.fn();
    render(<GuidedLearningEntry onBack={vi.fn()} onClose={onClose} />);
    fireEvent.click(await screen.findByRole('button', { name: '이 주제로 프리토킹' }));
    await waitFor(() => expect(useGuidedLearningStore.getState().snapshot?.handoff?.status).toBe('PREPARED'));
    expect(useGuidedLearningStore.getState().error).toBeNull();
    act(() => { useGuidedLearningStore.getState().pushSnapshot({ ...prepared, revision: 7, stage: 'COMPLETED', guided: null, allowedActions: [], handoff: { ...prepared.handoff!, status: 'COMPLETE' } }); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
  it('accepts replay after confirming the old terminal session when HTTP precedes its push', async () => {
    const current = phase('RECAP', 5); current.allowedActions = ['REPLAY_LESSON'];
    const next = guidedFixture({ sessionId: 'replay-new', stage: 'BRIEF', guided: null });
    useGuidedLearningStore.setState({ snapshot: current });
    api.getGuidedHome.mockResolvedValue({ contractVersion: 2, contentVersion: 'v2', levels: [], profile: { level: 'beginner', revision: 1 }, lessons: [], activeSessionId: current.sessionId });
    api.getGuidedSession.mockResolvedValueOnce(current).mockResolvedValue({ ...current, stage: 'COMPLETED', guided: null, revision: 6 });
    api.sendGuidedCommand.mockResolvedValue(next);
    render(<GuidedLearningEntry onBack={vi.fn()} onClose={vi.fn()} />);
    await screen.findByRole('button', { name: '다른 상황으로 한 번 더' });
    await act(async () => undefined);
    fireEvent.click(screen.getByRole('button', { name: '다른 상황으로 한 번 더' }));
    await waitFor(() => expect(useGuidedLearningStore.getState().snapshot?.sessionId).toBe('replay-new'));
    expect(useGuidedLearningStore.getState().retiredSessions).toContain(current.sessionId);
  });
  beforeEach(() => { vi.clearAllMocks(); api.sendGuidedCommand.mockReset(); audio.isPlaying = false; audio.speak.mockReset().mockResolvedValue(false); audio.cancelAndWait.mockReset().mockResolvedValue(true); useGuidedLearningStore.setState({ snapshot: null, error: null, retiredSessions: [] }); });
  afterEach(cleanup);
  it.each(['same', 'replaced', 'twice'])('bounds automatic playback revision recovery for %s scope', async boundary => {
    const demo = phase('DEMO', 2); demo.guided!.voiceStarted = true;
    useGuidedLearningStore.setState({ snapshot: demo });
    api.getGuidedHome.mockResolvedValue({ contractVersion: 2, contentVersion: 'v2', levels: [], profile: { level: 'beginner', revision: 1 }, lessons: [], activeSessionId: demo.sessionId });
    api.getGuidedSession.mockResolvedValue(demo);
    const refreshed = { ...demo, revision: 3, guided: { ...demo.guided!, attemptId: boundary === 'replaced' ? 'replacement' : demo.guided!.attemptId } };
    api.sendGuidedCommand.mockRejectedValueOnce(new GuidedApiError('new revision', 'REVISION_CONFLICT', refreshed));
    if (boundary === 'twice') api.sendGuidedCommand.mockRejectedValueOnce(new GuidedApiError('still changing', 'REVISION_CONFLICT', { ...refreshed, revision: 4 }));
    else api.sendGuidedCommand.mockResolvedValueOnce({ ...refreshed, revision: 4, guided: { ...refreshed.guided!, attemptId: 'playing' } });
    render(<GuidedLearningEntry onBack={vi.fn()} onClose={vi.fn()} />);
    if (boundary === 'same') {
      await waitFor(() => expect(audio.speak).toHaveBeenCalledOnce());
      expect(api.sendGuidedCommand).toHaveBeenNthCalledWith(2, expect.objectContaining({ revision: 3 }), 'PLAY_MODEL', expect.anything());
    } else {
      await screen.findByRole('alert');
      expect(audio.speak).not.toHaveBeenCalled();
    }
    expect(api.sendGuidedCommand).toHaveBeenCalledTimes(boundary === 'replaced' ? 1 : 2);
  });
  it('automatically plays the demo once after voice readiness, then rehearses after successful release', async () => {
    const brief = guidedFixture({ stage: 'BRIEF', guided: null, revision: 1, allowedActions: ['START_PREP', 'ABANDON'] });
    useGuidedLearningStore.setState({ snapshot: brief });
    api.getGuidedHome.mockResolvedValue({ contractVersion: 2, contentVersion: 'v2', levels: [], profile: { level: 'beginner', revision: 1 }, lessons: [], activeSessionId: brief.sessionId });
    api.getGuidedSession.mockResolvedValue(brief);
    const demo = phase('DEMO', 2);
    const playing = phase('DEMO', 4); playing.guided!.voiceStarted = true;
    const rehearse = phase('REHEARSE', 6); rehearse.guided!.voiceStarted = true;
    const model = { ...rehearse, revision: 7, guided: { ...rehearse.guided!, attemptId: 'model-ready', display: { modelEn: 'Water, please.', contentCues: [] }, supportVisible: 'MODEL' as const } };
    rehearse.allowedActions = ['PLAY_MODEL', 'ABANDON']; rehearse.guided!.audioId = 'rehearse';
    model.allowedActions = rehearse.allowedActions;
    api.sendGuidedCommand.mockResolvedValueOnce(demo).mockResolvedValueOnce(playing).mockResolvedValueOnce(rehearse).mockResolvedValueOnce(model);
    let finish!: (success: boolean) => void;
    audio.speak.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    render(<GuidedLearningEntry onBack={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: '보고 연습하기' }));
    await screen.findByText('What would you like?');
    expect(audio.speak).not.toHaveBeenCalled();
    act(() => { useGuidedLearningStore.getState().pushSnapshot({ ...demo, revision: 3, guided: { ...demo.guided!, voiceStarted: true } }); });
    await waitFor(() => expect(audio.speak).toHaveBeenCalledOnce());
    expect(api.sendGuidedCommand.mock.calls.map(call => call[1])).toEqual(['START_PREP', 'PLAY_MODEL']);
    act(() => { useGuidedLearningStore.getState().pushSnapshot({ ...playing, revision: 5 }); });
    expect(audio.speak).toHaveBeenCalledOnce();
    await act(async () => finish(true));
    await waitFor(() => expect(api.sendGuidedCommand.mock.calls.map(call => call[1])).toEqual(['START_PREP', 'PLAY_MODEL', 'NEXT_NODE', 'PLAY_MODEL']));
    expect(audio.speak).toHaveBeenLastCalledWith('Water, please.');
  });

  it.each(['failed', 'replaced', 'unmounted'])('does not advance a demo when playback is %s', async boundary => {
    const demo = phase('DEMO', 2); demo.guided!.voiceStarted = true;
    useGuidedLearningStore.setState({ snapshot: demo });
    api.getGuidedHome.mockResolvedValue({ contractVersion: 2, contentVersion: 'v2', levels: [], profile: { level: 'beginner', revision: 1 }, lessons: [], activeSessionId: demo.sessionId });
    api.getGuidedSession.mockResolvedValue(demo);
    const playing = { ...demo, revision: 3, guided: { ...demo.guided!, attemptId: 'playing-demo' } };
    api.sendGuidedCommand.mockResolvedValue(playing);
    let finish!: (success: boolean) => void;
    audio.speak.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const view = render(<GuidedLearningEntry onBack={vi.fn()} onClose={vi.fn()} />);
    await waitFor(() => expect(audio.speak).toHaveBeenCalledOnce());
    if (boundary === 'replaced') act(() => { useGuidedLearningStore.getState().pushSnapshot({ ...playing, revision: 4, guided: { ...playing.guided!, attemptId: 'replacement' } }); });
    if (boundary === 'unmounted') view.unmount();
    await act(async () => finish(boundary !== 'failed'));
    expect(api.sendGuidedCommand.mock.calls.map(call => call[1])).toEqual(['PLAY_MODEL']);
  });
  it('keeps Stop/Exit available during playback and waits release before Retry', async () => {
    const current = guidedFixture({ allowedActions: ['RETRY_NODE', 'ABANDON'] });
    current.guided!.voiceStarted = false;
    audio.isPlaying = true;
    useGuidedLearningStore.setState({ snapshot: current });
    api.getGuidedHome.mockResolvedValue({ contractVersion: 2, contentVersion: 'v2', levels: [], profile: { level: 'beginner', revision: 1 }, lessons: [], activeSessionId: current.sessionId });
    api.getGuidedSession.mockResolvedValue(current);
    api.sendGuidedCommand.mockResolvedValue({ ...current, revision: 4 });
    let release!: (accepted: boolean) => void;
    audio.cancelAndWait.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    render(<GuidedLearningEntry onBack={vi.fn()} onClose={vi.fn()} />);
    expect(await screen.findByRole('button', { name: '듣기 멈추기' })).toBeTruthy();
    expect((screen.getByRole('button', { name: '나가기' }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(await screen.findByRole('button', { name: '다시 말해보기' }));
    await act(async () => undefined);
    expect(api.sendGuidedCommand).not.toHaveBeenCalled();
    api.getGuidedSession.mockResolvedValue({ ...current, revision: 3 });
    await act(async () => release(true));
    await waitFor(() => expect(api.sendGuidedCommand).toHaveBeenCalledWith(expect.objectContaining({ revision: 3 }), 'RETRY_NODE', { nodeId: 'r1' }));
  });
  it.each(['release', 'refresh', 'role-start'])('does not apply the old Retry to an attempt replaced during %s', async boundary => {
    const current = guidedFixture({ allowedActions: ['RETRY_NODE', 'ABANDON'] });
    current.guided!.voiceStarted = false;
    const next = guidedFixture({ revision: 4, allowedActions: ['RETRY_NODE', 'ABANDON'] });
    next.guided!.attemptId = boundary === 'role-start' ? current.guided!.attemptId : 'replacement'; next.guided!.audioOwner = 'ROLE';
    useGuidedLearningStore.setState({ snapshot: current });
    api.getGuidedHome.mockResolvedValue({ contractVersion: 2, contentVersion: 'v2', levels: [], profile: { level: 'beginner', revision: 1 }, lessons: [], activeSessionId: current.sessionId });
    api.getGuidedSession.mockResolvedValue(current);
    let release!: (accepted: boolean) => void;
    audio.cancelAndWait.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    render(<GuidedLearningEntry onBack={vi.fn()} onClose={vi.fn()} />);
    await screen.findByRole('button', { name: '다시 말해보기' });
    await act(async () => undefined);
    fireEvent.click(screen.getByRole('button', { name: '다시 말해보기' }));
    if (boundary === 'release') act(() => { useGuidedLearningStore.getState().pushSnapshot(next); });
    else api.getGuidedSession.mockResolvedValue(next);
    await act(async () => release(true));
    expect(api.sendGuidedCommand).not.toHaveBeenCalled();
    expect(screen.getByText('수업 상황이 바뀌었어요. 현재 화면에서 다시 눌러 주세요.')).toBeTruthy();
  });
  it('completes the five-phase beginner flow through server commands and authorized model projection', async () => {
    const home: GuidedHome = { contractVersion: 2, contentVersion: 'guided-v2-draft-1', levels: [{ id: 'beginner', labelKo: '초급', available: true }, { id: 'intermediate', labelKo: '중급', available: false }, { id: 'advanced', labelKo: '고급', available: false }], profile: null, lessons: [{ id: 'request_beginner', titleKo: '원하는 것 부탁하기', level: 'beginner' }], activeSessionId: null };
    api.getGuidedHome.mockResolvedValue(home);
    api.saveGuidedProfile.mockImplementation(async () => { api.getGuidedHome.mockResolvedValue({ ...home, profile: { level: 'beginner', revision: 1 } }); });
    const brief = guidedFixture({ stage: 'BRIEF', guided: null, revision: 1, allowedActions: ['START_PREP', 'SKIP_PREP', 'ABANDON'] });
    api.startGuidedLesson.mockResolvedValue(brief);
    const close = vi.fn();
    render(<GuidedLearningEntry onBack={vi.fn()} onClose={close} />);
    fireEvent.click(await screen.findByRole('button', { name: '초급 문장을 함께 만들어요' }));
    fireEvent.click(await screen.findByRole('button', { name: '원하는 것 부탁하기' }));
    await screen.findByRole('button', { name: '보고 연습하기' });
    expect(api.saveGuidedProfile).toHaveBeenCalledWith('beginner', 0);
    api.sendGuidedCommand.mockResolvedValueOnce(phase('DEMO', 2));
    fireEvent.click(screen.getByRole('button', { name: '보고 연습하기' }));
    await screen.findByText('What would you like?');
    api.sendGuidedCommand.mockResolvedValueOnce(phase('DEMO', 3));
    fireEvent.click(screen.getByRole('button', { name: '다시 듣기' }));
    await waitFor(() => expect(audio.speak).toHaveBeenCalledWith([{ text: 'What would you like?', language: 'en-US', voice: 0 }, { text: 'Water, please.', language: 'en-US', voice: 1 }]));
    expect(api.sendGuidedCommand).toHaveBeenLastCalledWith(expect.anything(), 'PLAY_MODEL', { nodeId: 'demo', audioId: 'd1' });
    api.sendGuidedCommand.mockResolvedValueOnce(phase('REHEARSE', 4));
    fireEvent.click(screen.getByRole('button', { name: '내 말로 바꾸기' }));
    await screen.findByRole('button', { name: '준비됐어요' });
    api.sendGuidedCommand.mockResolvedValueOnce(phase('GUIDED', 5));
    fireEvent.click(screen.getByRole('button', { name: '준비됐어요' }));
    await waitFor(() => expect(document.querySelector('[aria-current="step"]')?.textContent).toContain('가이드 대화'));
    api.sendGuidedCommand.mockResolvedValueOnce(phase('TRANSFER', 6));
    fireEvent.click(screen.getByRole('button', { name: '다음으로' }));
    await waitFor(() => expect(document.querySelector('[aria-current="step"]')?.textContent).toContain('새 상황 도전'));
    expect(screen.queryByText('Water, please.')).toBeNull();
    api.sendGuidedCommand.mockResolvedValueOnce(phase('RECAP', 7));
    fireEvent.click(screen.getByRole('button', { name: '다음으로' }));
    await screen.findByText('새 장면에서 예문 없이 부탁했어요.');
    api.sendGuidedCommand.mockResolvedValueOnce(guidedFixture({ stage: 'COMPLETED', guided: null, revision: 8, allowedActions: [] }));
    fireEvent.click(screen.getByRole('button', { name: '여기까지' }));
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
  });
  it('recovers an expired local session using authoritative empty home', async () => {
    useGuidedLearningStore.setState({ snapshot: guidedFixture() });
    api.getGuidedHome.mockResolvedValue({ contractVersion: 2, contentVersion: 'v2', levels: [], profile: null, lessons: [], activeSessionId: null });
    render(<GuidedLearningEntry onBack={vi.fn()} onClose={vi.fn()} />);
    await act(async () => undefined);
    expect(useGuidedLearningStore.getState().snapshot).toBeNull();
    expect(screen.queryByText('Can I have ___, please?')).toBeNull();
  });
  it('hides stale lesson controls and audio after an invalid pushed contract', async () => {
    const current = phase('DEMO', 2);
    useGuidedLearningStore.setState({ snapshot: current });
    api.getGuidedHome.mockResolvedValue({ contractVersion: 2, contentVersion: 'v2', levels: [], profile: { level: 'beginner', revision: 1 }, lessons: [], activeSessionId: current.sessionId });
    api.getGuidedSession.mockResolvedValue(current);
    render(<GuidedLearningEntry onBack={vi.fn()} onClose={vi.fn()} />);
    await screen.findByText('What would you like?');
    await act(async () => undefined);
    act(() => { useGuidedLearningStore.getState().pushSnapshot({ ...current, contractVersion: 3 }); });
    expect(screen.queryByRole('button', { name: '다시 듣기' })).toBeNull();
    expect(screen.queryByRole('button', { name: '내 말로 바꾸기' })).toBeNull();
    expect(screen.queryByText('What would you like?')).toBeNull();
    expect(screen.getByRole('button', { name: '다시 연결' })).toBeTruthy();
    expect(api.sendGuidedCommand).not.toHaveBeenCalled();
    expect(audio.speak).not.toHaveBeenCalled();
  });
});
