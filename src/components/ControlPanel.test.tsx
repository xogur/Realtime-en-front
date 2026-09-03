// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ControlPanel } from './ControlPanel';
import { useStore } from '@/stores/useStore';

const { mockUseVoiceSocket } = vi.hoisted(() => ({ mockUseVoiceSocket: vi.fn() }));

vi.mock('@/hooks/useVoiceSocket', () => ({ useVoiceSocket: mockUseVoiceSocket }));

const controls = {
    connect: vi.fn(),
    disconnect: vi.fn(),
    startListening: vi.fn(),
    startConversation: vi.fn(),
    resumeConversation: vi.fn(),
    stopListening: vi.fn(),
    pauseConversationForUsageEnd: vi.fn(),
    clearHistory: vi.fn(),
    isConnected: true,
    isSttReady: true,
    isRecording: true,
    sttProvider: 'browser' as 'browser' | 'server',
};

describe('ControlPanel microphone toggle', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        Object.assign(controls, {
            isConnected: true,
            isSttReady: true,
            isRecording: true,
            sttProvider: 'browser',
        });
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

    it('stops only microphone capture while keeping the socket connected', () => {
        render(<ControlPanel onOpenSettings={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: 'Turn microphone off' }));
        expect(controls.stopListening).toHaveBeenCalledOnce();
        expect(controls.disconnect).not.toHaveBeenCalled();
    });

    it('opens difficulty selection before restarting microphone capture', () => {
        controls.isRecording = false;
        render(<ControlPanel onOpenSettings={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: 'Turn microphone on' }));
        expect(screen.getByRole('dialog', { name: '원하는 대화 스타일을 선택하세요' })).toBeTruthy();
        expect(controls.startListening).not.toHaveBeenCalled();
    });

    it('starts a conversation with the selected difficulty and topic', async () => {
        controls.isRecording = false;
        render(<ControlPanel onOpenSettings={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: 'Turn microphone on' }));
        fireEvent.click(screen.getByRole('button', { name: /^초급/ }));
        fireEvent.click(screen.getByRole('button', { name: /^여행/ }));
        await waitFor(() => expect(controls.startConversation).toHaveBeenCalledWith('travel', 'beginner'));
    });

    it('resumes the active segment at its original difficulty', () => {
        controls.isRecording = false;
        useStore.setState({
            learningSessionId: 'learning-1',
            activeSegmentId: 'segment-1',
            topicSegments: [{
                segmentId: 'segment-1', topicId: 'airport', label: '공항', mode: 'roleplay',
                aiRole: 'check-in staff', userRole: 'traveler', scenarioId: 'airport_documents',
                scenarioTitle: '탑승 수속', openingLine: 'May I see your passport?',
                difficultyId: 'intermediate', difficultyLabel: '중급', difficultyPolicyVersion: 1,
                sequence: 1, occurrence: 1, status: 'active', startedAt: '2026-08-08T00:00:00.000Z',
            }],
        });
        render(<ControlPanel onOpenSettings={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: 'Turn microphone on' }));
        fireEvent.click(screen.getByRole('button', { name: /공항 \/ 중급/ }));
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

    it('shows mic off before a microphone start fails', () => {
        controls.isRecording = false;
        controls.isSttReady = false;
        render(<ControlPanel onOpenSettings={vi.fn()} />);
        expect(screen.getByText('Mic off')).toBeTruthy();
    });

    it('shows STT unavailable after a microphone start error', () => {
        controls.isRecording = false;
        controls.isSttReady = false;
        useStore.setState({ conversationStartStatus: 'error', conversationStartError: 'No microphone.' });
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

    it('pauses microphone capture without disconnecting and resumes it after the translator closes', () => {
        const { rerender } = render(<ControlPanel onOpenSettings={vi.fn()} />);
        window.dispatchEvent(new MessageEvent('message', {
            origin: window.location.origin,
            data: { channel: 'realtime-en:translator', action: 'open' },
        }));
        expect(controls.stopListening).toHaveBeenCalledOnce();
        expect(controls.disconnect).not.toHaveBeenCalled();

        controls.isRecording = false;
        rerender(<ControlPanel onOpenSettings={vi.fn()} />);
        window.dispatchEvent(new MessageEvent('message', {
            origin: window.location.origin,
            data: { channel: 'realtime-en:translator', action: 'close' },
        }));
        expect(controls.startListening).toHaveBeenCalledOnce();
    });

    it('opens topic and difficulty selection once after the reservation introduction finishes', async () => {
        controls.isRecording = false;
        controls.isSttReady = false;
        const view = render(
            <ControlPanel onOpenSettings={vi.fn()} openTopicSelectorEventId={null} />,
        );

        view.rerender(
            <ControlPanel onOpenSettings={vi.fn()} openTopicSelectorEventId="cocoon:401:intro" />,
        );
        expect(screen.getByRole('dialog', { name: '원하는 대화 스타일을 선택하세요' })).toBeTruthy();
        expect(controls.startListening).not.toHaveBeenCalled();
        expect(controls.startConversation).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: /^초급/ }));
        fireEvent.click(screen.getByRole('button', { name: /^여행/ }));
        await waitFor(() => expect(controls.startConversation).toHaveBeenCalledWith('travel', 'beginner'));

        fireEvent.click(screen.getByRole('button', { name: '대화 선택 닫기' }));
        controls.startConversation.mockClear();
        view.rerender(
            <ControlPanel onOpenSettings={vi.fn()} openTopicSelectorEventId="cocoon:401:intro" />,
        );
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(controls.startConversation).not.toHaveBeenCalled();
    });

    it('does not turn the microphone on before the user chooses difficulty and topic', () => {
        render(
            <ControlPanel
                onOpenSettings={vi.fn()}
                openTopicSelectorEventId="cocoon:402:intro"
            />,
        );
        expect(controls.startListening).not.toHaveBeenCalled();
        expect(controls.startConversation).not.toHaveBeenCalled();
    });

    it('does not start a microphone that was already off before opening the translator', () => {
        controls.isRecording = false;
        render(<ControlPanel onOpenSettings={vi.fn()} />);

        for (const action of ['open', 'close'] as const) {
            window.dispatchEvent(new MessageEvent('message', {
                origin: window.location.origin,
                data: { channel: 'realtime-en:translator', action },
            }));
        }

        expect(controls.stopListening).not.toHaveBeenCalled();
        expect(controls.startListening).not.toHaveBeenCalled();
        expect(controls.disconnect).not.toHaveBeenCalled();
    });

    it('resumes through the BroadcastChannel close event used by the main translator window', () => {
        class TestBroadcastChannel {
            static latest: TestBroadcastChannel | null = null;
            private listeners = new Set<(event: MessageEvent) => void>();

            constructor(name: string) {
                void name;
                TestBroadcastChannel.latest = this;
            }

            addEventListener(_type: string, listener: (event: MessageEvent) => void) {
                this.listeners.add(listener);
            }

            removeEventListener(_type: string, listener: (event: MessageEvent) => void) {
                this.listeners.delete(listener);
            }

            close() {}

            emit(action: 'open' | 'close') {
                const event = new MessageEvent('message', {
                    data: { channel: 'realtime-en:translator', action },
                });
                this.listeners.forEach((listener) => listener(event));
            }
        }

        vi.stubGlobal('BroadcastChannel', TestBroadcastChannel);
        try {
            const { rerender } = render(<ControlPanel onOpenSettings={vi.fn()} />);
            TestBroadcastChannel.latest?.emit('open');
            expect(controls.stopListening).toHaveBeenCalledOnce();

            controls.isRecording = false;
            rerender(<ControlPanel onOpenSettings={vi.fn()} />);
            TestBroadcastChannel.latest?.emit('close');
            expect(controls.startListening).toHaveBeenCalledOnce();
            expect(controls.disconnect).not.toHaveBeenCalled();
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('keeps the conversation running when the dedicated end dialog is cancelled', () => {
        const onEndUsage = vi.fn();
        render(<ControlPanel onOpenSettings={vi.fn()} canEndUsage onEndUsage={onEndUsage} />);

        fireEvent.click(screen.getByRole('button', { name: '영어 프로그램 이용 종료' }));
        expect(screen.getByRole('dialog', { name: '이용을 종료할까요?' })).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: '계속 대화하기' }));

        expect(onEndUsage).not.toHaveBeenCalled();
        expect(controls.pauseConversationForUsageEnd).not.toHaveBeenCalled();
    });

    it('pauses microphone and TTS only after end is confirmed', () => {
        const onEndUsage = vi.fn(async () => undefined);
        render(<ControlPanel onOpenSettings={vi.fn()} canEndUsage onEndUsage={onEndUsage} />);
        fireEvent.click(screen.getByRole('button', { name: '영어 프로그램 이용 종료' }));
        fireEvent.click(screen.getByRole('button', { name: '이용 종료하기' }));

        expect(controls.pauseConversationForUsageEnd).toHaveBeenCalledTimes(1);
        expect(onEndUsage).toHaveBeenCalledTimes(1);
    });

    it('resumes the existing segment when usage is restored', () => {
        useStore.setState({
            activeSegmentId: 'segment-1',
            topicSegments: [{
                segmentId: 'segment-1', topicId: 'airport', label: '공항', mode: 'roleplay',
                aiRole: 'staff', userRole: 'traveler', scenarioId: 'airport_documents',
                scenarioTitle: '탑승 수속', openingLine: 'Passport?', difficultyId: 'intermediate',
                difficultyLabel: '중급', difficultyPolicyVersion: 1, sequence: 1, occurrence: 1,
                status: 'active', startedAt: '2026-08-08T00:00:00.000Z',
            }],
        });
        const view = render(<ControlPanel onOpenSettings={vi.fn()} resumeUsageSignal={0} />);
        view.rerender(<ControlPanel onOpenSettings={vi.fn()} resumeUsageSignal={1} />);

        expect(controls.resumeConversation).toHaveBeenCalledWith('segment-1');
        expect(controls.clearHistory).not.toHaveBeenCalled();
    });
});
