import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChatMessage, MissionCompletion, PracticeMission } from '@/stores/useStore';

export type MissionCelebrationCard = {
    missionId: string;
    title: string;
    target: string;
    rewardLp: number;
};

export type MissionCelebrationPresentation = {
    id: string;
    cards: MissionCelebrationCard[];
    totalLp: number;
};

type UseMissionCelebrationOptions = {
    messages: ChatMessage[];
    activeMissions: PracticeMission[];
    visibleMs?: number;
    onPresent?: (presentation: MissionCelebrationPresentation) => void;
};

type MissionCompletionEvent = MissionCelebrationPresentation & {
    index: number;
};

function getMessageKey(message: ChatMessage, index: number): string {
    return message.id ? `id:${message.id}` : `index:${index}:${message.content}`;
}

function createEvent(message: ChatMessage, index: number): MissionCompletionEvent | null {
    const completions = message.completedMissions ?? [];
    if (message.role !== 'user' || completions.length === 0) return null;

    const cards = completions.map((completion: MissionCompletion) => ({
        missionId: completion.missionId,
        title: completion.title,
        target: completion.target,
        rewardLp: completion.rewardLp,
    }));
    const totalLp = cards.reduce((sum, card) => sum + card.rewardLp, 0);
    const id = `${getMessageKey(message, index)}:${cards.map((card) => card.missionId).join('|')}:${totalLp}`;

    return { id, index, cards, totalLp };
}

export function getMissionCompletionEvents(messages: ChatMessage[]): MissionCompletionEvent[] {
    return messages
        .map((message, index) => createEvent(message, index))
        .filter((event): event is MissionCompletionEvent => Boolean(event));
}

export function useMissionCelebration({
    messages,
    visibleMs = 1800,
    onPresent,
}: UseMissionCelebrationOptions) {
    const events = useMemo(() => getMissionCompletionEvents(messages), [messages]);
    const seenIds = useRef<Set<string>>(new Set());
    const pendingQueue = useRef<MissionCelebrationPresentation[]>([]);
    const onPresentRef = useRef(onPresent);
    const timeoutRef = useRef<number | null>(null);
    const startTimeoutRef = useRef<number | null>(null);
    const [current, setCurrent] = useState<MissionCelebrationPresentation | null>(null);
    const [completedMissionIds, setCompletedMissionIds] = useState<Set<string>>(() => new Set());
    const [presentedEventIds, setPresentedEventIds] = useState<Set<string>>(() => new Set());
    const hasUnpresentedEvents = events.some((event) => !presentedEventIds.has(event.id));

    useEffect(() => {
        onPresentRef.current = onPresent;
    }, [onPresent]);

    const present = (next: MissionCelebrationPresentation) => {
        setPresentedEventIds((previous) => new Set(previous).add(next.id));
        setCurrent(next);
        setCompletedMissionIds(new Set(next.cards.map((card) => card.missionId)));
        onPresentRef.current?.(next);
    };

    useEffect(() => {
        events.forEach((event) => {
            if (seenIds.current.has(event.id)) return;
            seenIds.current.add(event.id);
            pendingQueue.current.push({
                id: event.id,
                cards: event.cards,
                totalLp: event.totalLp,
            });
        });

        if (!current && pendingQueue.current.length > 0 && startTimeoutRef.current === null) {
            startTimeoutRef.current = window.setTimeout(() => {
                startTimeoutRef.current = null;
                const next = pendingQueue.current.shift() ?? null;
                if (next) {
                    present(next);
                }
            }, 0);
        }
    }, [current, events, onPresent]);

    useEffect(() => {
        if (!current) return;
        timeoutRef.current = window.setTimeout(() => {
            timeoutRef.current = null;
            const next = pendingQueue.current.shift() ?? null;
            if (next) {
                present(next);
                return;
            }
            setCurrent(null);
            setCompletedMissionIds(new Set());
        }, visibleMs);

        return () => {
            if (timeoutRef.current !== null) {
                window.clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
            }
        };
    }, [current, visibleMs]);

    useEffect(() => () => {
        if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
        if (startTimeoutRef.current !== null) window.clearTimeout(startTimeoutRef.current);
        pendingQueue.current = [];
    }, []);

    return {
        current,
        completedMissionIds,
        isTransitionPending: Boolean(current || hasUnpresentedEvents),
    };
}
