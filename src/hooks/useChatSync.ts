import { useEffect, useState } from 'react';
import { useStore } from '@/stores/useStore';
import { getChatSyncChannelName } from '@/lib/kioskIdentity';

function getBatchStatusSyncPayload() {
    const status = useStore.getState().evaluationBatchStatus;
    if (!status) return null;
    return {
        ...status,
        nextFlushAtEpochMs: status.sourceNextFlushAtEpochMs ?? status.nextFlushAtEpochMs ?? null,
    };
}

type ChatSyncState = {
    hasMainWindow: boolean;
};

export function useChatSync(isMainWindow: boolean) {
    const [hasMainWindow, setHasMainWindow] = useState(isMainWindow);

    useEffect(() => {
        const channel = new BroadcastChannel(getChatSyncChannelName());

        if (isMainWindow) {
            // Main window listens to useStore and broadcasts changes
            const unsubscribe = useStore.subscribe((state, prevState) => {
                // Broadcast messages if changed
                if (state.messages !== prevState.messages) {
                    channel.postMessage({ type: 'SYNC_MESSAGES', payload: state.messages, reason: 'update' });
                }
                if (state.partialMessage !== prevState.partialMessage) {
                    channel.postMessage({ type: 'SYNC_PARTIAL_MESSAGE', payload: state.partialMessage });
                }
                if (state.liveTranscript !== prevState.liveTranscript) {
                    channel.postMessage({ type: 'SYNC_LIVE_TRANSCRIPT', payload: state.liveTranscript });
                }
                if (state.isThinking !== prevState.isThinking) {
                    channel.postMessage({ type: 'SYNC_THINKING', payload: state.isThinking });
                }
                if (state.emotion !== prevState.emotion) {
                    channel.postMessage({ type: 'SYNC_EMOTION', payload: state.emotion });
                }
                if (state.evaluationBatchStatus !== prevState.evaluationBatchStatus) {
                    channel.postMessage({
                        type: 'SYNC_EVALUATION_BATCH_STATUS',
                        payload: getBatchStatusSyncPayload(),
                    });
                }
            });

            // Listen for messages from popout window
            channel.onmessage = (event) => {
                if (event.data.type === 'PING_MAIN_WINDOW') {
                    channel.postMessage({ type: 'MAIN_WINDOW_READY' });
                } else if (event.data.type === 'SEND_MESSAGE') {
                    const socket = useStore.getState().socket;
                    if (socket && socket.readyState === WebSocket.OPEN) {
                        socket.send(JSON.stringify({
                            type: 'user_text_message',
                            text: event.data.payload,
                            clientCommandId: event.data.clientCommandId,
                            interruptPolicy: 'hard',
                        }));
                    }
                } else if (event.data.type === 'REQUEST_INITIAL_STATE') {
                    // Send initial state to newly opened window
                    channel.postMessage({ type: 'SYNC_MESSAGES', payload: useStore.getState().messages, reason: 'initial' });
                    channel.postMessage({ type: 'SYNC_PARTIAL_MESSAGE', payload: useStore.getState().partialMessage });
                    channel.postMessage({ type: 'SYNC_LIVE_TRANSCRIPT', payload: useStore.getState().liveTranscript });
                    channel.postMessage({ type: 'SYNC_THINKING', payload: useStore.getState().isThinking });
                    channel.postMessage({ type: 'SYNC_EMOTION', payload: useStore.getState().emotion });
                    channel.postMessage({
                        type: 'SYNC_EVALUATION_BATCH_STATUS',
                        payload: getBatchStatusSyncPayload(),
                    });
                }
            };

            return () => {
                unsubscribe();
                channel.close();
            };
        } else {
            // Popout window listens to channel and updates its store
            channel.onmessage = (event) => {
                const { type, payload, reason } = event.data;
                if (type === 'MAIN_WINDOW_READY') {
                    setHasMainWindow(true);
                    return;
                }

                if (!type.startsWith('SYNC_')) {
                    return;
                }
                setHasMainWindow(true);

                if (type === 'SYNC_MESSAGES') {
                    if (
                        reason === 'initial'
                        && Array.isArray(payload)
                        && payload.length === 0
                        && useStore.getState().messages.length > 0
                    ) {
                        return;
                    }
                    useStore.getState().syncMessages(payload);
                } else if (type === 'SYNC_EVALUATION_BATCH_STATUS') {
                    if (payload) {
                        useStore.getState().setEvaluationBatchStatus(payload);
                    } else if (useStore.getState().getPendingEvaluationTurnIds().length === 0) {
                        useStore.getState().clearEvaluationBatchStatus();
                    }
                } else if (type === 'SYNC_LIVE_TRANSCRIPT') {
                    useStore.getState().setLiveTranscript(typeof payload === 'string' ? payload : '');
                } else if (useStore.getState().socket?.readyState === WebSocket.OPEN) {
                    // The viewer socket owns ephemeral streaming state. Durable
                    // message/evaluation state still merges monotonically above.
                    return;
                } else if (type === 'SYNC_PARTIAL_MESSAGE') {
                    useStore.setState({ partialMessage: payload });
                } else if (type === 'SYNC_THINKING') {
                    useStore.setState({ isThinking: payload });
                } else if (type === 'SYNC_EMOTION') {
                    useStore.setState({ emotion: payload });
                }
            };

            // Request initial state upon mounting
            channel.postMessage({ type: 'PING_MAIN_WINDOW' });
            channel.postMessage({ type: 'REQUEST_INITIAL_STATE' });

            return () => {
                channel.close();
            };
        }
    }, [isMainWindow]);

    return { hasMainWindow } satisfies ChatSyncState;
}
