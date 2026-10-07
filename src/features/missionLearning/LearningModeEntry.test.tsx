// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LearningModeEntry } from './LearningModeEntry';
import { useStore } from '@/stores/useStore';
import { useMissionLearningStore } from './store';
import { acceptSnapshot } from './useMissionLearning';
import { MissionLearningApiError, type MissionLearningHomeDetail, type MissionSnapshot } from './types';

const api = vi.hoisted(() => ({
  getMissionHome: vi.fn(),
  putMissionProfile: vi.fn(),
  startMission: vi.fn(),
  sendMissionCommand: vi.fn(),
  getMissionSession: vi.fn(),
  assessPronunciation: vi.fn(),
}));
vi.mock('./api', () => api);
vi.mock('./guided/GuidedLearningEntry', () => ({ GuidedLearningEntry: () => <div>가이드형 영어 학습 v2</div> }));
const recorder = vi.hoisted(() => ({ startReadAloudRecording: vi.fn() }));
vi.mock('./readAloudRecorder', () => recorder);
const speak = vi.hoisted(() => vi.fn());
const cancel = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useBrowserTts', () => ({ useBrowserTts: () => ({ speak, cancel }) }));

function snapshot(stage: MissionSnapshot['stage'], revision: number, extra: Partial<MissionSnapshot> = {}): MissionSnapshot {
  const allowed: Record<string, MissionSnapshot['allowedActions']> = {
    BRIEF: ['START_PREP', 'SKIP_PREP', 'ABANDON'],
    PREP: ['PLAY_EXPRESSION', 'DONE_PREP', 'ABANDON'],
    ROLEPLAY: ['SHOW_HELP_CARD', 'END_ROLEPLAY', 'ABANDON'],
    FEEDBACK: ['CONTINUE', 'ABANDON'],
    SUMMARY: ['START_NEXT_MISSION', 'FINISH'],
  };
  return {
    type: 'learning_mission_state', sessionId: 's1', kioskId: 'A01', missionId: 'cafe_order', variant: 'adult.intro',
    contentVersion: 'seed', stage, revision, allowedActions: allowed[stage] ?? [],
    mission: {
      titleKo: '카페에서 원하는 음료 주문하기', actionKo: '음료를 주문해 보세요.', goalKo: '부탁할 수 있어요.',
      situationKo: '카페 카운터 앞이에요.', openingLine: 'Hi! What would you like?', targetSeconds: 300,
      goalSlots: [{ id: 'drink', labelKo: '음료 말하기', done: false }],
    },
    expressions: stage === 'ROLEPLAY'
      ? [{ id: 'to_go_please', usage: 'NONE', helpStep: 0, revealed: [] }]
      : [{ id: 'to_go_please', usage: 'NONE', helpStep: 0, text: 'To go, please.', meaningKo: '포장해 주세요.', usageKo: '포장할 때' }],
    roleplay: stage === 'ROLEPLAY'
      ? { elapsedSeconds: 0, targetSeconds: 300, hardCapSeconds: 480, remainingSeconds: 300, hardCapRemainingSeconds: 480, ended: false, voiceStarted: true, turns: 0, maxTurns: 10 }
      : null,
    transcript: stage === 'ROLEPLAY' ? [{ role: 'avatar', text: 'Hi! What would you like?' }] : [],
    feedback: null, summary: null, endReason: null,
    ...extra,
  };
}

const homeWithoutProfile: MissionLearningHomeDetail = {
  enabled: true, contractVersion: 1, contentVersion: 'seed',
  profileOptions: { ageBands: ['child', 'adult'], levels: ['intro', 'basic'] },
  profile: null, missions: [], recommendedMissionId: null, activeSession: null,
};
const homeWithProfile: MissionLearningHomeDetail = {
  ...homeWithoutProfile,
  profile: { ageBand: 'adult', level: 'intro', revision: 1 },
  missions: [{ id: 'cafe_order', courseOrder: 2, titleKo: '카페에서 원하는 음료 주문하기', actionKo: '주문해 보세요.', goalKo: '', targetSeconds: 300, completed: false }],
  recommendedMissionId: 'cafe_order',
};

describe('acceptSnapshot', () => {
  it('ignores an older revision of the same session but accepts a new session', () => {
    const current = snapshot('PREP', 3);
    expect(acceptSnapshot(current, snapshot('BRIEF', 2))).toBe(current);
    const other = { ...snapshot('BRIEF', 1), sessionId: 's2' };
    expect(acceptSnapshot(current, other)).toBe(other);
  });
});

describe('LearningModeEntry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useMissionLearningStore.setState({ entry: null, snapshot: null });
  });

  it('uses v2 only when the server capability allows it', async () => {
    api.getMissionHome.mockResolvedValue({ ...homeWithoutProfile, capabilities: { guidedV2: true } });
    render(<LearningModeEntry isOpen onBack={vi.fn()} onClose={vi.fn()} />);
    expect(await screen.findByText('가이드형 영어 학습 v2')).toBeTruthy();
    expect(screen.queryByText('초등학생')).toBeNull();
  });

  it('follows snapshots pushed from the server and returns to the list when the session ends', async () => {
    api.getMissionHome.mockResolvedValue({ ...homeWithProfile, activeSession: snapshot('ROLEPLAY', 4) });
    render(<LearningModeEntry isOpen onBack={vi.fn()} onClose={vi.fn()} />);
    expect(await screen.findByText('Hi! What would you like?')).toBeTruthy();
    act(() => useMissionLearningStore.getState().pushSnapshot(snapshot('ROLEPLAY', 5, {
      transcript: [{ role: 'avatar', text: 'Hi! What would you like?' }, { role: 'learner', text: 'Iced latte, please.' }],
    })));
    expect(screen.getByText('Iced latte, please.')).toBeTruthy();
    api.getMissionHome.mockResolvedValue(homeWithProfile);
    act(() => useMissionLearningStore.getState().pushSnapshot(snapshot('ABANDONED', 6)));
    expect(await screen.findByRole('dialog', { name: '오늘의 Mission 고르기' })).toBeTruthy();
  });

  it('walks from profile selection to the summary', async () => {
    api.getMissionHome.mockResolvedValueOnce(homeWithoutProfile).mockResolvedValue(homeWithProfile);
    api.putMissionProfile.mockResolvedValue(homeWithProfile.profile);
    api.startMission.mockResolvedValue(snapshot('BRIEF', 1));
    render(<LearningModeEntry isOpen onBack={vi.fn()} onClose={vi.fn()} />);

    fireEvent.click(await screen.findByRole('button', { name: /성인/ }));
    fireEvent.click(screen.getByRole('button', { name: /입문/ }));
    fireEvent.click(screen.getByRole('button', { name: '미션 보러 가기' }));
    expect(api.putMissionProfile).toHaveBeenCalledWith('adult', 'intro');

    fireEvent.click(await screen.findByRole('button', { name: /카페에서 원하는 음료 주문하기, 추천 미션/ }));
    expect(api.startMission).toHaveBeenCalledWith('cafe_order');
    expect(await screen.findByRole('dialog', { name: '오늘의 Mission' })).toBeTruthy();
    expect(screen.getByText('약 5분')).toBeTruthy();

    api.sendMissionCommand.mockResolvedValueOnce(snapshot('PREP', 2));
    fireEvent.click(screen.getByRole('button', { name: /표현 먼저 연습하기/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'To go, please. 듣기' }));
    await waitFor(() => expect(speak).toHaveBeenCalledWith('To go, please.', 'en-US', undefined));
    await waitFor(() => expect(api.sendMissionCommand).toHaveBeenLastCalledWith(
      expect.objectContaining({ revision: 2 }), 'PLAY_EXPRESSION', { expressionId: 'to_go_please' },
    ));
  });

  it('reveals help cards step by step during the roleplay and ends it', async () => {
    api.getMissionHome.mockResolvedValue({ ...homeWithProfile, activeSession: snapshot('ROLEPLAY', 4) });
    render(<LearningModeEntry isOpen onBack={vi.fn()} onClose={vi.fn()} />);
    expect(await screen.findByText('Hi! What would you like?')).toBeTruthy();
    expect(screen.getByRole('timer', { name: '남은 대화 시간' }).textContent).toContain('5:00');
    expect(screen.queryByText('To go, please.')).toBeNull();

    api.sendMissionCommand.mockResolvedValueOnce(snapshot('ROLEPLAY', 5, {
      expressions: [{ id: 'to_go_please', usage: 'NONE', helpStep: 1, revealed: ['MEANING'], meaningKo: '포장해 주세요.' }],
    }));
    fireEvent.click(screen.getByRole('button', { name: /뜻 보기/ }));
    expect(await screen.findByText('포장해 주세요.')).toBeTruthy();
    expect(screen.getByRole('button', { name: /첫 단어 보기/ })).toBeTruthy();

    api.sendMissionCommand.mockResolvedValueOnce(snapshot('FEEDBACK', 6, {
      feedback: {
        rubricVersion: 'mission-v1', status: 'READY', missionCompleted: false,
        slots: [{ id: 'drink', labelKo: '음료 말하기', done: false }],
        items: [
          { key: 'pronunciation', labelKo: '발음', band: 'HELD', reasonKo: '발음 분석은 준비 중이에요.' },
          { key: 'vocabulary', labelKo: '어휘', band: 'GREAT', reasonKo: '알맞은 단어를 썼어요.', evidence: 'Iced latte, please.' },
        ],
        highlights: ['도움 없이 말한 표현: To go, please.'], nextPracticeKo: '다음에는 도움 없이 말해 보세요: Can you say that again?',
      },
    }));
    fireEvent.click(screen.getByRole('button', { name: '대화 마치기' }));
    expect(await screen.findByRole('dialog', { name: '오늘의 미션 피드백' })).toBeTruthy();
    expect(screen.getByText('도움 없이 말한 표현: To go, please.')).toBeTruthy();
    expect(screen.getByText('다음에는 도움 없이 말해 보세요: Can you say that again?')).toBeTruthy();
    expect(screen.getByText('상세 피드백 보기')).toBeTruthy();
    expect(screen.getByText('평가 보류')).toBeTruthy();
    expect(screen.getByText('내가 한 말: “Iced latte, please.”')).toBeTruthy();
  });

  it('shows the facts right away while the detailed feedback is still being made', async () => {
    api.getMissionHome.mockResolvedValue({
      ...homeWithProfile,
      activeSession: snapshot('FEEDBACK', 7, {
        allowedActions: ['ABANDON'],
        feedback: {
          rubricVersion: 'mission-v1', status: 'PENDING', missionCompleted: true,
          slots: [{ id: 'drink', labelKo: '음료 말하기', done: true }],
          items: [], highlights: ['오늘의 목표를 모두 해냈어요.'], nextPracticeKo: null,
        },
      }),
    });
    render(<LearningModeEntry isOpen onBack={vi.fn()} onClose={vi.fn()} />);
    expect(await screen.findByText('오늘의 목표를 모두 해냈어요.')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('상세 피드백을 만들고 있어요');
    expect((screen.getByRole('button', { name: /오늘 배운 표현 보기/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText('상세 피드백 보기')).toBeNull();
  });

  it('shows the summary with usage status and the next mission', async () => {
    api.getMissionHome.mockResolvedValue({
      ...homeWithProfile,
      activeSession: snapshot('SUMMARY', 8, {
        summary: {
          expressions: [
            { id: 'to_go_please', text: 'To go, please.', meaningKo: '포장해 주세요.', usage: 'LISTENED', usageKo: '예시를 들어봤어요' },
            { id: 'please_short', text: 'Orange juice, please.', meaningKo: '오렌지 주스 주세요.', usage: 'INDEPENDENT', usageKo: '도움 없이 사용했어요', said: 'Iced americano, please.' },
          ],
          nextMission: { id: 'ask_info', titleKo: '여행지에서 길 묻기', reasonKo: '지난번에 연습한 ‘짧게 부탁하기’를 다른 상황에서 다시 써 봐요.' },
        },
      }),
    });
    render(<LearningModeEntry isOpen onBack={vi.fn()} onClose={vi.fn()} />);
    expect(await screen.findByText('오늘 당신이 배운 표현 2개')).toBeTruthy();
    expect(screen.getByText('이번에는: 예시를 들어봤어요')).toBeTruthy();
    expect(screen.getByText('내가 한 말: “Iced americano, please.”')).toBeTruthy();
    expect(screen.getByRole('button', { name: '다음 미션: 여행지에서 길 묻기' })).toBeTruthy();
    expect(screen.getByText('지난번에 연습한 ‘짧게 부탁하기’를 다른 상황에서 다시 써 봐요.')).toBeTruthy();
  });

  it('greets a returning learner and explains the recommended mission', async () => {
    api.getMissionHome.mockResolvedValue({
      ...homeWithProfile,
      recommendation: { missionId: 'cafe_order', kind: 'REVIEW', reasonKo: '지난번에 연습한 ‘짧게 부탁하기’를 다른 상황에서 다시 써 봐요.' },
      revisitKo: '지난번에는 “Orange juice, please.”를 도움 없이 말했어요. 오늘은 다른 상황에서도 써 볼까요?',
    });
    render(<LearningModeEntry isOpen onBack={vi.fn()} onClose={vi.fn()} />);
    expect(await screen.findByText(/지난번에는 “Orange juice, please.”를 도움 없이 말했어요/)).toBeTruthy();
    expect(screen.getByText('지난번에 연습한 ‘짧게 부탁하기’를 다른 상황에서 다시 써 봐요.')).toBeTruthy();
    expect(screen.getByRole('button', { name: /추천 미션/ })).toBeTruthy();
  });

  it('shows what the learner is saying live during the roleplay', async () => {
    api.getMissionHome.mockResolvedValue({ ...homeWithProfile, activeSession: snapshot('ROLEPLAY', 4) });
    useStore.setState({ liveTranscript: 'Iced ameri' });
    render(<LearningModeEntry isOpen onBack={vi.fn()} onClose={vi.fn()} />);
    expect(await screen.findByText('Iced ameri')).toBeTruthy();
    expect(screen.getByText('Hi! What would you like?')).toBeTruthy();
    act(() => useStore.setState({ liveTranscript: '' }));
    expect(screen.queryByText('Iced ameri')).toBeNull();
  });

  it('shows authored options for the current unclear question and removes them after it is answered', async () => {
    api.getMissionHome.mockResolvedValue({ ...homeWithProfile, activeSession: snapshot('ROLEPLAY', 4, {
      roleplay: { ...snapshot('ROLEPLAY', 4).roleplay!, clarificationHelp: {
        slotId: 'temperature', askLine: 'Hot or iced?', answers: ['Hot', 'Iced'],
      } },
    }) });
    render(<LearningModeEntry isOpen onBack={vi.fn()} onClose={vi.fn()} />);
    expect(await screen.findByText('Hot or iced?')).toBeTruthy();
    expect(screen.getByRole('list', { name: '지금 질문의 답변 예시' }).textContent).toBe('HotIced');
    expect(speak).not.toHaveBeenCalled();
    act(() => useMissionLearningStore.getState().pushSnapshot(snapshot('ROLEPLAY', 5)));
    expect(screen.queryByRole('list', { name: '지금 질문의 답변 예시' })).toBeNull();
  });

  it('lets the learner read an expression aloud and shows an encouraging band', async () => {
    const summary = {
      expressions: [{ id: 'to_go_please', text: 'To go, please.', meaningKo: '포장해 주세요.', usage: 'INDEPENDENT' as const,
        usageKo: '도움 없이 사용했어요', pronunciation: null }],
      nextMission: null, pronunciationPractice: true,
    };
    api.getMissionHome.mockResolvedValue({ ...homeWithProfile, activeSession: snapshot('SUMMARY', 8, { summary }) });
    let finish: (value: { wav: Blob; playback: Blob }) => void = () => undefined;
    const stop = vi.fn(() => finish({ wav: new Blob(['w'], { type: 'audio/wav' }), playback: new Blob(['p']) }));
    recorder.startReadAloudRecording.mockResolvedValue({
      finished: new Promise((resolve) => { finish = resolve; }), stop, cancel: vi.fn(),
    });
    const graded = snapshot('SUMMARY', 9, { summary: { ...summary,
      expressions: [{ ...summary.expressions[0], pronunciation: { band: 'GREAT' as const, labelKo: '아주 좋아요!' } }] } });
    api.assessPronunciation.mockResolvedValue({
      result: { status: 'OK', band: 'GREAT', labelKo: '아주 좋아요!', messageKo: '또렷하게 잘 들렸어요.' }, snapshot: graded,
    });
    URL.createObjectURL = vi.fn(() => 'blob:me');
    URL.revokeObjectURL = vi.fn();
    render(<LearningModeEntry isOpen onBack={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: /따라 읽기/ }));
    fireEvent.click(await screen.findByRole('button', { name: /다 말했어요/ }));
    expect(await screen.findByText('또렷하게 잘 들렸어요.')).toBeTruthy();
    expect(api.assessPronunciation).toHaveBeenCalledWith('s1', 'to_go_please', expect.any(Blob));
    expect(screen.getByRole('button', { name: '내 녹음 듣기' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /다시 읽기/ })).toBeTruthy();
    expect(screen.queryByText(/점/)).toBeNull();
  });

  it('asks to record again when the microphone is unavailable', async () => {
    api.getMissionHome.mockResolvedValue({ ...homeWithProfile, activeSession: snapshot('SUMMARY', 8, { summary: {
      expressions: [{ id: 'to_go_please', text: 'To go, please.', meaningKo: '포장해 주세요.', usage: 'LISTENED', usageKo: '예시를 들어봤어요' }],
      nextMission: null, pronunciationPractice: true } }) });
    recorder.startReadAloudRecording.mockRejectedValue(new Error('NotAllowedError'));
    render(<LearningModeEntry isOpen onBack={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: /따라 읽기/ }));
    expect(await screen.findByText(/마이크를 사용할 수 없어요/)).toBeTruthy();
  });

  it('hides read-aloud when the server has no pronunciation engine', async () => {
    api.getMissionHome.mockResolvedValue({ ...homeWithProfile, activeSession: snapshot('SUMMARY', 8, { summary: {
      expressions: [{ id: 'to_go_please', text: 'To go, please.', meaningKo: '포장해 주세요.', usage: 'LISTENED', usageKo: '예시를 들어봤어요' }],
      nextMission: null } }) });
    render(<LearningModeEntry isOpen onBack={vi.fn()} onClose={vi.fn()} />);
    expect(await screen.findByText('To go, please.', { exact: false })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /따라 읽기/ })).toBeNull();
  });

  it('shows no revisit line for a first visit', async () => {
    api.getMissionHome.mockResolvedValue({ ...homeWithProfile, recommendation: null, revisitKo: null });
    render(<LearningModeEntry isOpen onBack={vi.fn()} onClose={vi.fn()} />);
    expect(await screen.findByText('카페에서 원하는 음료 주문하기')).toBeTruthy();
    expect(screen.queryByText(/지난번/)).toBeNull();
  });

  it('applies the server snapshot returned with a rejected command', async () => {
    api.getMissionHome.mockResolvedValue({ ...homeWithProfile, activeSession: snapshot('BRIEF', 1) });
    api.sendMissionCommand.mockRejectedValueOnce(
      new MissionLearningApiError('STALE_REVISION', '화면이 최신 상태가 아니에요. 다시 불러왔어요.', 409, snapshot('PREP', 2)),
    );
    render(<LearningModeEntry isOpen onBack={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: /바로 미션 시작/ }));
    expect(await screen.findByRole('dialog', { name: '말할 표현 준비하기' })).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('최신 상태');
  });

  it('shows a retry path when the backend is unavailable', async () => {
    api.getMissionHome.mockRejectedValue(new MissionLearningApiError('NETWORK_ERROR', '서버에 연결하지 못했어요.', 0));
    render(<LearningModeEntry isOpen onBack={vi.fn()} onClose={vi.fn()} />);
    expect((await screen.findByRole('alert')).textContent).toContain('서버에 연결하지 못했어요');
    expect(screen.getByRole('button', { name: /다시 시도/ })).toBeTruthy();
  });
});
