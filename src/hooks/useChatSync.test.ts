// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStore, type TurnEvaluation } from '@/stores/useStore';
import { useChatSync } from './useChatSync';

function evaluation(turnId: string): TurnEvaluation {
    return {
        rubricVersion: 'speaking-v2',
        turnId,
        provider: 'test',
        model: 'test',
        createdAt: '2026-07-15T00:00:00.000Z',
        scores: { overall: 82, grammar: 80, vocabulary: 81, relevance: 84, fluency: 79, interaction: 83 },
        feedback: { summary: 'Clear answer', strength: 'Relevant', improvement: 'Add detail', nextPractice: 'Give an example' },
        correction: { original: 'Yes, I can.', suggested: 'Yes, I can.', reason: 'Natural.' },
        evidence: { grammar: '', vocabulary: '', relevance: '', fluency: '', interaction: '', overall: 'Clear.' },
        cefrEstimate: { level: 'A2', reason: 'Clear short answer.' },
        capabilities: { pronunciation: 'not_available' },
        confidence: 'high',
        confidenceReasons: [],
    };
}

class MockBroadcastChannel {
    static instances: MockBroadcastChannel[] = [];

    onmessage: ((event: MessageEvent) => void) | null = null;
    posted: unknown[] = [];

    constructor(public readonly name: string) {
        MockBroadcastChannel.instances.push(this);
    }

    postMessage(message: unknown) {
        this.posted.push(message);
    }

    close() {}

    emit(data: unknown) {
        this.onmessage?.({ data } as MessageEvent);
    }
}

describe('useChatSync', () => {
    beforeEach(() => {
        MockBroadcastChannel.instances = [];
        vi.stubGlobal('BroadcastChannel', MockBroadcastChannel);
        useStore.getState().clearMessages();
        useStore.setState({ socket: null, showReplySuggestions: true });
    });

    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
        useStore.getState().clearMessages();
        useStore.setState({ socket: null });
    });

    it('restores conversation messages sent by the main window', () => {
        renderHook(() => useChatSync(false));
        const channel = MockBroadcastChannel.instances[0];

        expect(channel.name).toBe('uxroom_chat_sync:A01');
        expect(channel.posted).toContainEqual({ type: 'REQUEST_INITIAL_STATE' });

        act(() => {
            channel.emit({
                type: 'SYNC_MESSAGES',
                payload: [
                    { role: 'user', content: 'Hello again.', id: 'turn-1', evaluationStatus: 'pending' },
                    { role: 'assistant', content: 'Welcome back.', id: 'turn-1' },
                ],
            });
        });

        expect(useStore.getState().messages.map((message) => message.content)).toEqual([
            'Hello again.',
            'Welcome back.',
        ]);
    });

    it('does not erase viewer-replayed messages with a late empty initial sync', () => {
        useStore.getState().addMessage('user', 'Recovered from the viewer socket.', 'turn-1');
        renderHook(() => useChatSync(false));
        const channel = MockBroadcastChannel.instances[0];

        act(() => {
            channel.emit({ type: 'SYNC_MESSAGES', payload: [], reason: 'initial' });
        });

        expect(useStore.getState().messages.map((message) => message.content)).toEqual([
            'Recovered from the viewer socket.',
        ]);
    });

    it('does not let stale main-window state clear a live viewer stream', () => {
        const openSocket = { readyState: 1 } as WebSocket;
        useStore.setState({
            socket: openSocket,
            partialMessage: 'The live answer is already streaming.',
            isThinking: false,
        });
        renderHook(() => useChatSync(false));
        const channel = MockBroadcastChannel.instances[0];

        act(() => {
            channel.emit({ type: 'SYNC_PARTIAL_MESSAGE', payload: '' });
            channel.emit({ type: 'SYNC_THINKING', payload: true });
        });

        expect(useStore.getState().partialMessage).toBe('The live answer is already streaming.');
        expect(useStore.getState().isThinking).toBe(false);
    });

    it('syncs the controller interim transcript into the chat window', () => {
        useStore.setState({ socket: { readyState: WebSocket.OPEN } as WebSocket });
        renderHook(() => useChatSync(false));
        const channel = MockBroadcastChannel.instances[0];

        act(() => {
            channel.emit({ type: 'SYNC_LIVE_TRANSCRIPT', payload: 'I would like to' });
        });

        expect(useStore.getState().liveTranscript).toBe('I would like to');
    });

    it('broadcasts interim transcript changes from the controller', () => {
        renderHook(() => useChatSync(true));
        const channel = MockBroadcastChannel.instances[0];

        act(() => useStore.getState().setLiveTranscript('Can you help'));

        expect(channel.posted).toContainEqual({
            type: 'SYNC_LIVE_TRANSCRIPT',
            payload: 'Can you help',
        });
    });

    it('broadcasts reply suggestion visibility changes from the main window', () => {
        renderHook(() => useChatSync(true));
        const channel = MockBroadcastChannel.instances[0];

        act(() => useStore.getState().setShowReplySuggestions(false));

        expect(channel.posted).toContainEqual({
            type: 'SYNC_REPLY_SUGGESTIONS_VISIBILITY',
            payload: false,
        });
    });

    it('applies reply suggestion visibility from the main window even with a viewer socket', () => {
        useStore.setState({ socket: { readyState: WebSocket.OPEN } as WebSocket });
        renderHook(() => useChatSync(false));
        const channel = MockBroadcastChannel.instances[0];

        act(() => {
            channel.emit({ type: 'SYNC_REPLY_SUGGESTIONS_VISIBILITY', payload: false });
        });

        expect(useStore.getState().showReplySuggestions).toBe(false);
    });

    it('merges richer evaluated messages from the main window while the viewer socket is open', () => {
        const openSocket = { readyState: WebSocket.OPEN } as WebSocket;
        useStore.setState({ socket: openSocket });
        useStore.getState().addMessage('user', 'Yes, I can.', '7:6');
        renderHook(() => useChatSync(false));
        const channel = MockBroadcastChannel.instances[0];

        act(() => {
            channel.emit({
                type: 'SYNC_MESSAGES',
                reason: 'update',
                payload: [{
                    id: '7:6',
                    role: 'user',
                    content: 'Yes, I can.',
                    evaluationStatus: 'ready',
                    evaluation: evaluation('7:6'),
                    completedMissions: [{
                        missionId: 'mission-can',
                        title: 'Can mission',
                        target: 'Use can.',
                        rewardLp: 6,
                        reason: 'Completed.',
                    }],
                }],
            });
        });

        expect(useStore.getState().messages[0]).toMatchObject({
            evaluationStatus: 'ready',
            evaluation: { turnId: '7:6' },
            completedMissions: [{ missionId: 'mission-can' }],
        });
    });

    it('syncs durable batch status while the viewer socket owns ephemeral stream state', () => {
        useStore.setState({ socket: { readyState: WebSocket.OPEN } as WebSocket });
        renderHook(() => useChatSync(false));
        const channel = MockBroadcastChannel.instances[0];

        act(() => {
            channel.emit({
                type: 'SYNC_EVALUATION_BATCH_STATUS',
                payload: {
                    pendingCount: 2,
                    maxTurns: 4,
                    delaySeconds: 30,
                    nextFlushAtEpochMs: null,
                    serverEpochMs: null,
                },
            });
        });

        expect(useStore.getState().evaluationBatchStatus).toMatchObject({
            pendingCount: 2,
            maxTurns: 4,
        });
    });
});
