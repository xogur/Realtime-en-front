// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ControlPanel } from './ControlPanel';
import { useStore } from '@/stores/useStore';
import { useMissionLearningStore } from '@/features/missionLearning/store';
import { useGuidedLearningStore } from '@/features/missionLearning/guided/store';

const mocks = vi.hoisted(() => ({
  useVoiceSocket: vi.fn(),
  setMissionEntry: vi.fn(),
  lessonProps: null as null | { onExit: () => void; onFreeTalk: (topicId: string, difficultyId: string) => void; isConnected: boolean },
}));

vi.mock('@/hooks/useVoiceSocket', () => ({ useVoiceSocket: mocks.useVoiceSocket }));
// The guided lesson service is down: lesson talk does not need it.
vi.mock('@/features/missionLearning/useMissionLearningAvailability', () => ({ useMissionLearningAvailability: () => 'unavailable' }));
vi.mock('@/features/lessonTalk/config', () => ({ LESSON_TALK_ENABLED: true }));
vi.mock('@/features/lessonTalk/LessonTalkMode', () => ({
  LessonTalkMode: (props: NonNullable<typeof mocks.lessonProps>) => {
    mocks.lessonProps = props;
    return <div data-testid="lesson-talk" />;
  },
}));
vi.mock('@/features/storyListening/control', () => ({
  publishStoryControl: vi.fn(async () => true),
  createStoryViewPublisher: () => ({ publish: vi.fn(), reset: vi.fn() }),
  subscribeStoryControl: () => () => undefined,
}));
vi.mock('@/features/missionLearning/api', () => ({
  setMissionEntry: mocks.setMissionEntry,
  getMissionHome: vi.fn(async () => ({ entry: null, activeSession: null })),
}));

const controls = {
  startListening: vi.fn(), startConversation: vi.fn(), resumeConversation: vi.fn(), stopListening: vi.fn(),
  pauseConversationForUsageEnd: vi.fn(), clearHistory: vi.fn(), prepareForReservationIntro: vi.fn(),
  startLearningRoleplay: vi.fn(), startGuidedLearningVoice: vi.fn(() => true), syncGuidedCapture: vi.fn(),
  prepareGuidedMicrophone: vi.fn(), connect: vi.fn(), sendStoryCheck: vi.fn(() => true), sendLessonTalk: vi.fn(() => true),
  setStoryMicrophone: vi.fn(), stopAvatarSpeech: vi.fn(),
  isConnected: true, isSttReady: true, isRecording: false, sttProvider: 'browser' as const,
};

async function openLesson() {
  render(<ControlPanel onOpenSettings={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Turn microphone on' }));
  await act(async () => fireEvent.click(screen.getByRole('button', { name: /^학습모드/ })));
}

describe('ControlPanel lesson talk', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.lessonProps = null;
    useMissionLearningStore.setState({ entry: null, snapshot: null });
    useGuidedLearningStore.setState({ snapshot: null, error: null });
    useStore.setState({ isConnecting: false, topicSegments: [], activeSegmentId: null, conversationStartStatus: 'idle', conversationStartError: null });
    mocks.useVoiceSocket.mockReturnValue(controls);
  });

  it('opens the avatar lesson instead of the guide-screen lesson and hides the free-talk bar', async () => {
    await openLesson();
    expect(screen.getByTestId('lesson-talk')).toBeTruthy();
    expect(mocks.setMissionEntry).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Turn microphone on' })).toBeNull();
    expect(controls.pauseConversationForUsageEnd).toHaveBeenCalled();
  });

  it('returns to the mode choice on exit', async () => {
    await openLesson();
    await act(async () => mocks.lessonProps!.onExit());
    expect(screen.queryByTestId('lesson-talk')).toBeNull();
    expect(screen.getByRole('dialog', { name: '원하는 모드를 선택하세요' })).toBeTruthy();
  });

  it('starts free talk on the lesson topic after the lesson closed', async () => {
    await openLesson();
    await act(async () => mocks.lessonProps!.onFreeTalk('restaurant', 'beginner'));
    expect(screen.queryByTestId('lesson-talk')).toBeNull();
    await act(async () => new Promise((resolve) => setTimeout(resolve, 5)));
    expect(controls.startConversation).toHaveBeenCalledWith('restaurant', 'beginner');
  });

  it('falls back to the topic selector for an unknown free-talk topic', async () => {
    await openLesson();
    await act(async () => mocks.lessonProps!.onFreeTalk('space', 'beginner'));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 5)));
    expect(controls.startConversation).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: '원하는 대화 스타일을 선택하세요' })).toBeTruthy();
  });
});
