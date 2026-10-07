// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ControlPanel } from './ControlPanel';
import { useStore } from '@/stores/useStore';
import type { MissionLearningAvailability } from '@/features/missionLearning/useMissionLearningAvailability';
import { useMissionLearningStore } from '@/features/missionLearning/store';
import type { MissionSnapshot } from '@/features/missionLearning/types';
import { useGuidedLearningStore } from '@/features/missionLearning/guided/store';
import { guidedFixture } from '@/features/missionLearning/guided/fixtures';

const mocks = vi.hoisted(() => ({
  useVoiceSocket: vi.fn(),
  availability: 'available' as MissionLearningAvailability,
  setMissionEntry: vi.fn(),
  getMissionHome: vi.fn(),
}));

vi.mock('@/hooks/useVoiceSocket', () => ({ useVoiceSocket: mocks.useVoiceSocket }));
vi.mock('@/features/missionLearning/useMissionLearningAvailability', () => ({
  useMissionLearningAvailability: () => mocks.availability,
}));
vi.mock('@/features/missionLearning/api', () => ({
  setMissionEntry: mocks.setMissionEntry,
  getMissionHome: mocks.getMissionHome,
}));

function roleplaySnapshot(stage: MissionSnapshot['stage'], voiceStarted = false): MissionSnapshot {
  return {
    type: 'learning_mission_state', sessionId: 'mission-1', kioskId: 'A04', missionId: 'cafe_order',
    variant: 'adult.intro', contentVersion: 'seed', stage, revision: stage === 'ROLEPLAY' ? 3 : 4,
    allowedActions: [], expressions: [], feedback: null, summary: null, endReason: null,
    mission: { titleKo: '', actionKo: '', goalKo: '', situationKo: '', openingLine: '', targetSeconds: 300, goalSlots: [] },
    roleplay: { elapsedSeconds: 0, targetSeconds: 300, hardCapSeconds: 480, remainingSeconds: 300,
      hardCapRemainingSeconds: 480, ended: stage !== 'ROLEPLAY', voiceStarted },
  };
}

const controls = {
  startListening: vi.fn(),
  startConversation: vi.fn(),
  resumeConversation: vi.fn(),
  stopListening: vi.fn(),
  pauseConversationForUsageEnd: vi.fn(),
  clearHistory: vi.fn(),
  prepareForReservationIntro: vi.fn(),
  startLearningRoleplay: vi.fn(),
  startGuidedLearningVoice: vi.fn(() => true),
  syncGuidedCapture: vi.fn(),
  connect: vi.fn(),
  isConnected: true,
  isSttReady: true,
  isRecording: false,
  sttProvider: 'browser' as const,
};

function openEntry() {
  render(<ControlPanel onOpenSettings={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Turn microphone on' }));
}

describe('ControlPanel mode selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.availability = 'available';
    mocks.setMissionEntry.mockResolvedValue(undefined);
    mocks.getMissionHome.mockResolvedValue({ entry: null, activeSession: null });
    controls.isConnected = true;
    useMissionLearningStore.setState({ entry: null, snapshot: null });
    useGuidedLearningStore.setState({ snapshot: null, error: null });
    useStore.setState({
      isConnecting: false,
      topicSegments: [],
      activeSegmentId: null,
      conversationStartStatus: 'idle',
      conversationStartError: null,
    });
    mocks.useVoiceSocket.mockReturnValue(controls);
  });

  it('asks for a mode before the free-talk selector', () => {
    openEntry();
    expect(screen.getByRole('dialog', { name: '원하는 모드를 선택하세요' })).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: '원하는 대화 스타일을 선택하세요' })).toBeNull();
  });

  it('closes an old mode prompt when another screen opens learning', async () => {
    openEntry();
    await act(async () => useMissionLearningStore.setState({ entry: { open: true, seq: 2, returnTo: null } }));
    expect(screen.queryByRole('dialog', { name: '원하는 모드를 선택하세요' })).toBeNull();
    await act(async () => new Promise(resolve => setTimeout(resolve, 10)));
    await act(async () => useMissionLearningStore.setState({ entry: { open: false, seq: 3, returnTo: null } }));
    expect(screen.queryByRole('dialog', { name: '원하는 모드를 선택하세요' })).toBeNull();
  });

  it('ignores a late entry event while a guided lesson is already active', () => {
    useGuidedLearningStore.setState({ snapshot: guidedFixture() });
    render(<ControlPanel onOpenSettings={vi.fn()} openTopicSelectorEventId="late-intro" />);
    expect(screen.queryByRole('dialog', { name: '원하는 모드를 선택하세요' })).toBeNull();
    expect(screen.queryByRole('dialog', { name: '원하는 대화 스타일을 선택하세요' })).toBeNull();
  });

  it('opens the existing free-talk selector for free talk', async () => {
    openEntry();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /^프리토킹/ })));
    expect(screen.queryByRole('dialog', { name: '원하는 모드를 선택하세요' })).toBeNull();
    expect(screen.getByRole('dialog', { name: '원하는 대화 스타일을 선택하세요' })).toBeTruthy();
    expect(controls.startConversation).not.toHaveBeenCalled();
  });

  it('hands learning mode to the guide screen without starting free talk', async () => {
    openEntry();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /^학습모드/ })));
    expect(mocks.setMissionEntry).toHaveBeenCalledWith(true);
    expect(screen.queryByRole('dialog', { name: '원하는 모드를 선택하세요' })).toBeNull();
    expect(screen.queryByRole('dialog', { name: '원하는 대화 스타일을 선택하세요' })).toBeNull();
    expect(controls.startConversation).not.toHaveBeenCalled();
    expect(controls.startListening).not.toHaveBeenCalled();
  });

  it('connects the avatar screen when learning mode is chosen while offline', async () => {
    controls.isConnected = false;
    openEntry();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /^학습모드/ })));
    expect(controls.connect).toHaveBeenCalledWith({ role: 'controller', startRecording: false });
  });

  it('reconnects after a reload when a mission is in progress', async () => {
    controls.isConnected = false;
    mocks.getMissionHome.mockResolvedValue({ entry: { open: true, returnTo: null, seq: 2 }, activeSession: null });
    render(<ControlPanel onOpenSettings={vi.fn()} />);
    await waitFor(() => expect(controls.connect).toHaveBeenCalledWith({ role: 'controller', startRecording: false }));
  });

  it('shows the mode choice again when opening learning mode fails', async () => {
    mocks.setMissionEntry.mockRejectedValueOnce(new Error('offline'));
    openEntry();
    fireEvent.click(screen.getByRole('button', { name: /^학습모드/ }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('dialog', { name: '원하는 모드를 선택하세요' })).toBeTruthy();
  });

  it('reopens the mode choice when the guide screen asks for it, ignoring the replayed state', async () => {
    render(<ControlPanel onOpenSettings={vi.fn()} />);
    act(() => useMissionLearningStore.getState().setEntry({ open: false, returnTo: 'mode', seq: 3 }));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(screen.queryByRole('dialog', { name: '원하는 모드를 선택하세요' })).toBeNull();
    act(() => useMissionLearningStore.getState().setEntry({ open: true, returnTo: null, seq: 4 }));
    act(() => useMissionLearningStore.getState().setEntry({ open: false, returnTo: 'mode', seq: 5 }));
    expect(await screen.findByRole('dialog', { name: '원하는 모드를 선택하세요' })).toBeTruthy();
  });

  it('starts the voiced roleplay once and closes the mic when it ends', async () => {
    render(<ControlPanel onOpenSettings={vi.fn()} />);
    act(() => useMissionLearningStore.getState().pushSnapshot(roleplaySnapshot('ROLEPLAY')));
    await waitFor(() => expect(controls.startLearningRoleplay).toHaveBeenCalledWith('mission-1'));
    act(() => useMissionLearningStore.getState().pushSnapshot({ ...roleplaySnapshot('ROLEPLAY', true), revision: 4 }));
    expect(controls.startLearningRoleplay).toHaveBeenCalledTimes(1);
    act(() => useMissionLearningStore.getState().pushSnapshot({ ...roleplaySnapshot('FEEDBACK', true), revision: 5 }));
    await waitFor(() => expect(controls.stopListening).toHaveBeenCalled());
  });

  it.each(['checking', 'unavailable'] as const)('keeps learning mode disabled while %s', async (availability) => {
    mocks.availability = availability;
    openEntry();
    const learning = screen.getByRole('button', { name: /^학습모드/ }) as HTMLButtonElement;
    expect(learning.disabled).toBe(true);
    fireEvent.click(learning);
    expect(mocks.setMissionEntry).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /^프리토킹/ })));
    expect(screen.getByRole('dialog', { name: '원하는 대화 스타일을 선택하세요' })).toBeTruthy();
  });

  it('skips mode selection when the build disables learning mode', () => {
    mocks.availability = 'disabled';
    openEntry();
    expect(screen.queryByRole('dialog', { name: '원하는 모드를 선택하세요' })).toBeNull();
    expect(screen.getByRole('dialog', { name: '원하는 대화 스타일을 선택하세요' })).toBeTruthy();
  });
});
