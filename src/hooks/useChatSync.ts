import { useEffect, useState } from 'react';
import { useStore } from '@/stores/useStore';

type ChatSyncState = {
    hasMainWindow: boolean;
};

export function useChatSync(isMainWindow: boolean) {
    const [hasMainWindow, setHasMainWindow] = useState(isMainWindow);

    useEffect(() => {
        const channel = new BroadcastChannel('uxroom_chat_sync');

        if (isMainWindow) {
            // Main window listens to useStore and broadcasts changes
            const unsubscribe = useStore.subscribe((state, prevState) => {
                // Broadcast messages if changed
                if (state.messages !== prevState.messages) {
                    channel.postMessage({ type: 'SYNC_MESSAGES', payload: state.messages });
                }
                if (state.partialMessage !== prevState.partialMessage) {
                    channel.postMessage({ type: 'SYNC_PARTIAL_MESSAGE', payload: state.partialMessage });
                }
                if (state.isThinking !== prevState.isThinking) {
                    channel.postMessage({ type: 'SYNC_THINKING', payload: state.isThinking });
                }
                if (state.emotion !== prevState.emotion) {
                    channel.postMessage({ type: 'SYNC_EMOTION', payload: state.emotion });
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
                            text: event.data.payload
                        }));
                    }
                } else if (event.data.type === 'REQUEST_INITIAL_STATE') {
                    // Send initial state to newly opened window
                    channel.postMessage({ type: 'SYNC_MESSAGES', payload: useStore.getState().messages });
                    channel.postMessage({ type: 'SYNC_PARTIAL_MESSAGE', payload: useStore.getState().partialMessage });
                    channel.postMessage({ type: 'SYNC_THINKING', payload: useStore.getState().isThinking });
                    channel.postMessage({ type: 'SYNC_EMOTION', payload: useStore.getState().emotion });
                }
            };

            return () => {
                unsubscribe();
                channel.close();
            };
        } else {
            // Popout window listens to channel and updates its store
            channel.onmessage = (event) => {
                const { type, payload } = event.data;
                if (type === 'MAIN_WINDOW_READY') {
                    setHasMainWindow(true);
                    return;
                }

                if (!type.startsWith('SYNC_')) {
                    return;
                }
                setHasMainWindow(true);

                if (type === 'SYNC_MESSAGES') {
                    useStore.getState().syncMessages(payload);
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
