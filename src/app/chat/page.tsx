'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChatOverlay } from '@/components/ChatOverlay';
import { AssessmentPanel } from '@/components/AssessmentPanel';
import { useVoiceSocket } from '@/hooks/useVoiceSocket';
import { useChatSync } from '@/hooks/useChatSync';
import { getKioskIdFromLocation } from '@/lib/kioskIdentity';
import {
    publishTranslatorControl,
    subscribeTranslatorControl,
    TRANSLATOR_WINDOW_MESSAGE,
    type TranslatorWindowMessage,
} from '@/lib/translator';
import { ReservationIntroOverlay } from '@/features/reservationIntro/ReservationIntroOverlay';
import { GuideReplayOverlay } from '@/features/reservationIntro/GuideReplayOverlay';
import { useReservationIntro } from '@/features/reservationIntro/useReservationIntro';
import { ParticipantNameOverlay } from '@/features/reservationIntro/ParticipantNameOverlay';
import { useReservationFollowup } from '@/features/reservationFollowup/useReservationFollowup';
import { ReservationEndOverlay } from '@/features/reservationFollowup/ReservationEndOverlay';
import type { ReservationIntroCompletionReason } from '@/features/reservationIntro/types';

export default function ChatPopout() {
    const { connect, disconnect } = useVoiceSocket();
    useChatSync(false);
    const socketControlsRef = useRef({ connect, disconnect });
    const translatorChannelRef = useRef<BroadcastChannel | null>(null);
    const [isTranslatorOpen, setIsTranslatorOpen] = useState(false);
    const [guideReplayContext, setGuideReplayContext] = useState<string | null>(null);
    const reservationIntro = useReservationIntro('guide');
    const completeReservationIntro = reservationIntro.complete;
    const reservationFollowup = useReservationFollowup();

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

        const unsubscribe = subscribeTranslatorControl(
            getKioskIdFromLocation(),
            (message) => window.postMessage(message, window.location.origin),
        );

        return () => {
            unsubscribe();
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
        void publishTranslatorControl(message, getKioskIdFromLocation()).then((published) => {
            if (published) return;
            const rollback: TranslatorWindowMessage = {
                channel: TRANSLATOR_WINDOW_MESSAGE,
                action: 'close',
            };
            setIsTranslatorOpen(false);
            window.postMessage(rollback, window.location.origin);
            translatorChannelRef.current?.postMessage(rollback);
        });

        const opener = window.opener;
        if (opener && !opener.closed) {
            opener.postMessage(message, window.location.origin);
        }
    };

    const currentGuideReplayContext = reservationIntro.reservationSession?.eventId ?? 'no-reservation';
    const handleOpenGuideReplay = useCallback(
        () => setGuideReplayContext(currentGuideReplayContext),
        [currentGuideReplayContext],
    );
    const handleCloseGuideReplay = useCallback(() => setGuideReplayContext(null), []);
    const handleReservationIntroComplete = useCallback(async (
        reason: ReservationIntroCompletionReason,
    ) => {
        setGuideReplayContext(null);
        await completeReservationIntro(reason);
    }, [completeReservationIntro]);
    const guideReplayVisible = guideReplayContext === currentGuideReplayContext
        && !reservationIntro.active
        && !reservationIntro.needsNameCapture
        && !reservationFollowup.locked;

    return (
        <>
        <main
            className={`relative h-screen w-full overflow-hidden bg-[#e9dfd5] transition-[filter] duration-300 ${reservationFollowup.locked ? 'blur-md' : ''}`}
            inert={reservationIntro.active || reservationIntro.needsNameCapture || reservationFollowup.locked || guideReplayVisible ? true : undefined}
            aria-hidden={reservationIntro.active || reservationIntro.needsNameCapture || reservationFollowup.locked || guideReplayVisible ? true : undefined}
        >
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
                        onReplayGuide={handleOpenGuideReplay}
                    />
                </section>
            </div>
        </main>
        <ReservationIntroOverlay
            role="guide"
            active={reservationIntro.active}
            onComplete={handleReservationIntroComplete}
            onExitComplete={reservationIntro.finishIntroPresentation}
        />
        <GuideReplayOverlay
            active={guideReplayVisible}
            assetVersion={reservationIntro.reservationSession?.assetVersion ?? 'intro-v1'}
            onClose={handleCloseGuideReplay}
        />
        <ParticipantNameOverlay
            role="guide"
            active={reservationIntro.needsNameCapture}
            eventId={reservationIntro.reservationSession?.eventId}
            onConfirm={reservationIntro.confirmParticipantName}
            onSkip={reservationIntro.skipParticipantName}
            onWelcomeComplete={reservationIntro.finishParticipantWelcome}
        />
        <ReservationEndOverlay
            role="guide"
            session={reservationFollowup.session}
            endPending={reservationFollowup.endPending}
            resumePending={reservationFollowup.resumePending}
            resumeError={reservationFollowup.resumeError}
            onDismiss={reservationFollowup.dismissUsage}
        />
        </>
    );
}
