'use client';

import { useChatSync } from '@/hooks/useChatSync';
import { ChatOverlay } from '@/components/ChatOverlay';

export default function ChatPopout() {
    useChatSync(false);

    return (
        <main className="w-full h-screen overflow-hidden relative" style={{
            backgroundImage: 'url("/background/chat_backgroud.png")',
            backgroundSize: 'cover',
            backgroundPosition: 'center'
        }}>
            <ChatOverlay standalone={true} />
        </main>
    );
}
