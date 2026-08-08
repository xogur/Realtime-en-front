// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ControlPanel } from './ControlPanel';
import { useStore } from '@/stores/useStore';

const { mockUseVoiceSocket } = vi.hoisted(() => ({
    mockUseVoiceSocket: vi.fn(),
}));

vi.mock('@/hooks/useVoiceSocket', () => ({
    useVoiceSocket: mockUseVoiceSocket,
}));

const controls = {
    connect: vi.fn(),
    disconnect: vi.fn(),
    startListening: vi.fn(),
    startConversation: vi.fn(),
    resumeConversation: vi.fn(),
    stopListening: vi.fn(),
    clearHistory: vi.fn(),
    isConnected: true,
    isSttReady: true,
    isRecording: true,
    sttProvider: 'browser' as 'browser' | 'server',
};

describe('ControlPanel microphone toggle', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        controls.isConnected = true;
        controls.isSttReady = true;
        controls.isRecording = true;
        controls.sttProvider = 'browser';
        useStore.setState({
            isConnecting: false,
            learningSessionId: null,
            topicSegments: [],
            activeSegmentId: null,
            conversationStartStatus: 'idle',
            conversationStartError: null,
        });
        mockUseVoiceSocket.mockReturnValue(controls);
    });

    it('stops only microphone capture while keeping the conversation socket connected', () => {
        render(<ControlPanel onOpenSettings={vi.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: 'Turn microphone off' }));

        expect(controls.stopListening).toHaveBeenCalledOnce();
        expect(controls.disconnect).not.toHaveBeenCalled();
    });

    it('opens topic selection before restarting microphone capture', () => {
        controls.isRecording = false;
        render(<ControlPanel onOpenSettings={vi.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: 'Turn microphone on' }));

        expect(screen.getByRole('dialog', { name: '무슨 주제로 대화할까요?' })).toBeTruthy();
        expect(controls.startListening).not.toHaveBeenCalled();
        expect(controls.connect).not.toHaveBeenCalled();
    });

    it('starts the selected topic conversation', () => {
        controls.isRecording = false;
        render(<ControlPanel onOpenSettings={vi.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: 'Turn microphone on' }));
        fireEvent.click(screen.getByRole('button', { name: /^여행/ }));

        expect(controls.startConversation).toHaveBeenCalledWith('travel');
    });

    it('resumes the active segment without creating a new topic segment', () => {
        controls.isRecording = false;
        useStore.setState({
            learningSessionId: 'learning-1',
            activeSegmentId: 'segment-1',
            topicSegments: [{
                segmentId: 'segment-1',
                topicId: 'airport',
                label: '공항',
                mode: 'roleplay',
                aiRole: 'check-in staff',
                userRole: 'traveler',
                scenarioId: 'airport_documents',
                scenarioTitle: '탑승 수속',
                openingLine: 'Good morning. May I see your passport and ticket, please?',
                sequence: 1,
                occurrence: 1,
                status: 'active',
                startedAt: '2026-08-08T00:00:00.000Z',
            }],
        });
        render(<ControlPanel onOpenSettings={vi.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: 'Turn microphone on' }));
        fireEvent.click(screen.getByRole('button', { name: /공항 이어서 대화/ }));

        expect(controls.resumeConversation).toHaveBeenCalledWith('segment-1');
        expect(controls.startConversation).not.toHaveBeenCalled();
    });

    it('does not show a provider until STT reports ready', () => {
        controls.isSttReady = false;
        useStore.setState({ isConnecting: true });
        render(<ControlPanel onOpenSettings={vi.fn()} />);

        expect(screen.getByText('Preparing STT')).toBeTruthy();
        expect(screen.queryByText('Web Speech')).toBeNull();
    });

    it('shows mic off instead of STT unavailable before a microphone start fails', () => {
        controls.isRecording = false;
        controls.isSttReady = false;
        render(<ControlPanel onOpenSettings={vi.fn()} />);

        expect(screen.getByText('Mic off')).toBeTruthy();
        expect(screen.queryByText('STT unavailable')).toBeNull();
    });

    it('shows STT unavailable after a microphone start error', () => {
        controls.isRecording = false;
        controls.isSttReady = false;
        useStore.setState({
            conversationStartStatus: 'error',
            conversationStartError: '마이크 입력 장치를 찾지 못했습니다.',
        });
        render(<ControlPanel onOpenSettings={vi.fn()} />);

        expect(screen.getByText('STT unavailable')).toBeTruthy();
    });

    it('shows the active STT provider', () => {
        const { rerender } = render(<ControlPanel onOpenSettings={vi.fn()} />);
        expect(screen.getByText('Web Speech')).toBeTruthy();

        controls.sttProvider = 'server';
        rerender(<ControlPanel onOpenSettings={vi.fn()} />);
        expect(screen.getByText('Server STT')).toBeTruthy();
    });
});
