'use client';

import { useEffect, useRef, useState } from 'react';
import { ChatOverlay } from '@/components/ChatOverlay';
import { AssessmentPanel } from '@/components/AssessmentPanel';
import { useVoiceSocket } from '@/hooks/useVoiceSocket';
import { useChatSync } from '@/hooks/useChatSync';
import { TRANSLATOR_WINDOW_MESSAGE, type TranslatorWindowMessage } from '@/lib/translator';

export default function ChatPopout() {
    const { connect, disconnect } = useVoiceSocket();
    useChatSync(false);
    const socketControlsRef = useRef({ connect, disconnect });
    const translatorChannelRef = useRef<BroadcastChannel | null>(null);
    const [isTranslatorOpen, setIsTranslatorOpen] = useState(false);

    useEffect(() => {
        socketControlsRef.current = { connect, disconnect };
    }, [connect, disconnect]);

    useEffect(() => {
        socketControlsRef.current.connect({ role: 'viewer', startRecording: false });
        return () => socketControlsRef.current.disconnect();
    }, []);

    useEffect(() => {
        const handleTranslatorMessage = (event: MessageEvent) => {
            if (event.origin && event.origin !== window.location.origin) return;
            if (event.data?.channel !== TRANSLATOR_WINDOW_MESSAGE) return;
            setIsTranslatorOpen(event.data.action === 'open');
        };

        window.addEventListener('message', handleTranslatorMessage);

        if ('BroadcastChannel' in window) {
            const channel = new BroadcastChannel(TRANSLATOR_WINDOW_MESSAGE);
            channel.addEventListener('message', handleTranslatorMessage);
            translatorChannelRef.current = channel;
        }

        return () => {
            window.removeEventListener('message', handleTranslatorMessage);
            translatorChannelRef.current?.close();
            translatorChannelRef.current = null;
        };
    }, []);

    const handleOpenTranslator = () => {
        const message: TranslatorWindowMessage = {
            channel: TRANSLATOR_WINDOW_MESSAGE,
            action: 'open',
        };
        setIsTranslatorOpen(true);
        translatorChannelRef.current?.postMessage(message);

        const opener = window.opener;
        if (opener && !opener.closed) {
            opener.postMessage(message, window.location.origin);
        }
    };

    return (
        <main className="relative h-screen w-full overflow-hidden bg-[#e9dfd5]">
            <div
                aria-hidden="true"
                className="pointer-events-none absolute -inset-4 bg-cover bg-center blur-[10px] saturate-[0.86]"
                style={{ backgroundImage: 'url("/background/chat_backgroud_back.png")' }}
            />
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[#efe6dd]/30" />
            <div className="relative z-10 grid h-full min-h-0 grid-cols-1 grid-rows-[minmax(0,1fr)_360px] lg:grid-cols-[minmax(360px,1fr)_minmax(640px,2fr)] lg:grid-rows-1 xl:grid-cols-[minmax(420px,1fr)_minmax(760px,2fr)]">
                <section className="min-h-0 min-w-0">
                    <ChatOverlay standalone={true} />
                </section>
                <section className="min-h-0 min-w-0">
                    <AssessmentPanel
                        isTranslatorOpen={isTranslatorOpen}
                        onOpenTranslator={handleOpenTranslator}
                    />
                </section>
            </div>
        </main>
    );
}
