'use client';

import { useEffect } from 'react';
import { useChatSync } from '@/hooks/useChatSync';
import { useVoiceSocket } from '@/hooks/useVoiceSocket';
import { ChatOverlay } from '@/components/ChatOverlay';
import { AssessmentPanel } from '@/components/AssessmentPanel';

export default function ChatPopout() {
    const { hasMainWindow } = useChatSync(false);
    const { connect, disconnect } = useVoiceSocket();

    useEffect(() => {
        if (hasMainWindow) {
            disconnect();
            return undefined;
        }

        const fallbackTimer = window.setTimeout(() => {
            connect({ startRecording: false });
        }, 800);

        return () => {
            window.clearTimeout(fallbackTimer);
        };
    }, [connect, disconnect, hasMainWindow]);

    useEffect(() => () => disconnect(), [disconnect]);

    return (
        <main className="relative h-screen w-full overflow-hidden" style={{
            backgroundImage: 'url("/background/chat_backgroud_back.png")',
            backgroundSize: 'cover',
            backgroundPosition: 'center'
        }}>
            <div className="grid h-full min-h-0 grid-cols-1 grid-rows-[minmax(0,1fr)_320px] lg:grid-cols-[minmax(0,1fr)_380px] lg:grid-rows-1 xl:grid-cols-[minmax(0,1fr)_420px]">
                <section className="min-h-0">
                    <ChatOverlay standalone={true} />
                </section>
                <section className="min-h-0">
                    <AssessmentPanel />
                </section>
            </div>
        </main>
    );
}
