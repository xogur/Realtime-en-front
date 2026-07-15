// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ControlPanel } from './ControlPanel';

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
    isRecording: true,
};

describe('ControlPanel microphone toggle', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        controls.isConnected = true;
        controls.isRecording = true;
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
});
