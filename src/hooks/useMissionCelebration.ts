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
    activeMissions,
    visibleMs = 1800,
    onPresent,
}: UseMissionCelebrationOptions) {
    const events = useMemo(() => getMissionCompletionEvents(messages), [messages]);
    const seenIds = useRef<Set<string>>(new Set());
    const pendingQueue = useRef<MissionCelebrationPresentation[]>([]);
    const timeoutRef = useRef<number | null>(null);
    const enteringTimeoutRef = useRef<number | null>(null);
    const startTimeoutRef = useRef<number | null>(null);
    const previousActiveMissionIds = useRef<Set<string> | null>(null);
    const [current, setCurrent] = useState<MissionCelebrationPresentation | null>(null);
    const [completedMissionIds, setCompletedMissionIds] = useState<Set<string>>(() => new Set());
    const [enteringMissionIds, setEnteringMissionIds] = useState<Set<string>>(() => new Set());
    const activeMissionIds = useMemo(() => new Set(activeMissions.map((mission) => mission.id)), [activeMissions]);

    useEffect(() => {
        const previous = previousActiveMissionIds.current;
        previousActiveMissionIds.current = activeMissionIds;
        if (!previous) return;

        const nextEntering = new Set<string>();
        activeMissionIds.forEach((id) => {
            if (!previous.has(id)) nextEntering.add(id);
        });
        if (nextEntering.size === 0) return;

        if (enteringTimeoutRef.current !== null) window.clearTimeout(enteringTimeoutRef.current);
        enteringTimeoutRef.current = window.setTimeout(() => {
            setEnteringMissionIds(nextEntering);
            enteringTimeoutRef.current = window.setTimeout(() => {
                setEnteringMissionIds(new Set());
                enteringTimeoutRef.current = null;
            }, 900);
        }, 0);
    }, [activeMissionIds]);

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

        if (!current && pendingQueue.current.length > 0) {
            const next = pendingQueue.current.shift() ?? null;
            if (next) {
                if (startTimeoutRef.current !== null) window.clearTimeout(startTimeoutRef.current);
                startTimeoutRef.current = window.setTimeout(() => {
                    startTimeoutRef.current = null;
                    setCurrent(next);
                    setCompletedMissionIds(new Set(next.cards.map((card) => card.missionId)));
                    onPresent?.(next);
                }, 0);
            }
        }
    }, [current, events, onPresent]);

    useEffect(() => {
        if (!current) return;
        timeoutRef.current = window.setTimeout(() => {
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
        if (enteringTimeoutRef.current !== null) window.clearTimeout(enteringTimeoutRef.current);
        if (startTimeoutRef.current !== null) window.clearTimeout(startTimeoutRef.current);
        pendingQueue.current = [];
    }, []);

    return {
        current,
        completedMissionIds,
        enteringMissionIds,
    };
}
