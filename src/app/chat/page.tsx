'use client';

import { useChatSync } from '@/hooks/useChatSync';
import { ChatOverlay } from '@/components/ChatOverlay';
import { AssessmentPanel } from '@/components/AssessmentPanel';

export default function ChatPopout() {
    useChatSync(false);

    return (
        <main className="relative h-screen w-full overflow-hidden" style={{
            backgroundImage: 'url("/background/chat_backgroud_back.png")',
            backgroundSize: 'cover',
            backgroundPosition: 'center'
        }}>
            <div className="grid h-full min-h-0 grid-cols-1 grid-rows-[minmax(0,1fr)_360px] lg:grid-cols-[minmax(360px,1fr)_minmax(640px,2fr)] lg:grid-rows-1 xl:grid-cols-[minmax(420px,1fr)_minmax(760px,2fr)]">
                <section className="min-h-0 min-w-0">
                    <ChatOverlay standalone={true} />
                </section>
                <section className="min-h-0 min-w-0">
                    <AssessmentPanel />
                </section>
            </div>
        </main>
    );
}
