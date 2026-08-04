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
        useStore.setState({ isConnecting: false });
        mockUseVoiceSocket.mockReturnValue(controls);
    });

    it('stops only microphone capture while keeping the conversation socket connected', () => {
        render(<ControlPanel onOpenSettings={vi.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: 'Turn microphone off' }));

        expect(controls.stopListening).toHaveBeenCalledOnce();
        expect(controls.disconnect).not.toHaveBeenCalled();
    });

    it('restarts microphone capture on the existing conversation socket', () => {
        controls.isRecording = false;
        render(<ControlPanel onOpenSettings={vi.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: 'Turn microphone on' }));

        expect(controls.startListening).toHaveBeenCalledOnce();
        expect(controls.connect).not.toHaveBeenCalled();
    });

    it('does not show a provider until STT reports ready', () => {
        controls.isSttReady = false;
        useStore.setState({ isConnecting: true });
        render(<ControlPanel onOpenSettings={vi.fn()} />);

        expect(screen.getByText('Preparing STT')).toBeTruthy();
        expect(screen.queryByText('Web Speech')).toBeNull();
    });

    it('shows the active STT provider', () => {
        const { rerender } = render(<ControlPanel onOpenSettings={vi.fn()} />);
        expect(screen.getByText('Web Speech')).toBeTruthy();

        controls.sttProvider = 'server';
        rerender(<ControlPanel onOpenSettings={vi.fn()} />);
        expect(screen.getByText('Server STT')).toBeTruthy();
    });
});
