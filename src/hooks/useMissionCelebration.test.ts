// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getMissionCompletionEvents, useMissionCelebration } from './useMissionCelebration';
import type { ChatMessage, PracticeMission } from '@/stores/useStore';

function message(id: string, missionIds: string[]): ChatMessage {
    return {
        id,
        role: 'user',
        content: `answer ${id}`,
        completedMissions: missionIds.map((missionId, index) => ({
            missionId,
            title: `Mission ${index + 1}`,
            target: `Target ${index + 1}`,
            rewardLp: 5 + index,
            reason: 'Completed',
        })),
    };
}

function mission(id: string): PracticeMission {
    return {
        id,
        kind: 'vocabulary',
        title: id,
        target: id,
        successHint: id,
        rewardLp: 5,
        checks: [{ type: 'includesAny', value: [id] }],
        createdAt: '2026-06-12T00:00:00.000Z',
    };
}

describe('getMissionCompletionEvents', () => {
    it('groups missions completed by the same answer into one event', () => {
        const events = getMissionCompletionEvents([message('turn-1', ['a', 'b'])]);

        expect(events).toHaveLength(1);
        expect(events[0].cards.map((card) => card.missionId)).toEqual(['a', 'b']);
        expect(events[0].totalLp).toBe(11);
    });

    it('ignores messages without completed missions', () => {
        expect(getMissionCompletionEvents([{ role: 'user', content: 'hello' }])).toEqual([]);
    });
});

describe('useMissionCelebration', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        act(() => {
            vi.runOnlyPendingTimers();
        });
        vi.useRealTimers();
    });

    it('presents a completion once and ignores duplicate rerenders', () => {
        const onPresent = vi.fn();
        const props = {
            messages: [message('turn-1', ['mission-a'])],
            activeMissions: [mission('mission-b')],
            visibleMs: 1000,
            onPresent,
        };
        const { result, rerender } = renderHook((currentProps: typeof props) => useMissionCelebration(currentProps), {
            initialProps: props,
        });
        act(() => {
            vi.advanceTimersByTime(0);
        });

        expect(result.current.current?.id).toContain('turn-1');
        expect(onPresent).toHaveBeenCalledTimes(1);

        rerender(props);

        expect(onPresent).toHaveBeenCalledTimes(1);
    });

    it('queues different answer completions sequentially', () => {
        const onPresent = vi.fn();
        const { result, rerender } = renderHook((props: {
            messages: ChatMessage[];
            activeMissions: PracticeMission[];
            visibleMs: number;
            onPresent: typeof onPresent;
        }) => useMissionCelebration(props), {
            initialProps: {
                messages: [message('turn-1', ['mission-a'])],
                activeMissions: [mission('mission-b')],
                visibleMs: 1000,
                onPresent,
            },
        });
        act(() => {
            vi.advanceTimersByTime(0);
        });

        rerender({
            messages: [message('turn-1', ['mission-a']), message('turn-2', ['mission-b'])],
            activeMissions: [mission('mission-c')],
            visibleMs: 1000,
            onPresent,
        });

        expect(result.current.current?.cards[0].missionId).toBe('mission-a');
        expect(onPresent).toHaveBeenCalledTimes(1);

        act(() => {
            vi.advanceTimersByTime(1000);
        });
        act(() => {
            vi.advanceTimersByTime(0);
        });

        expect(result.current.current?.cards[0].missionId).toBe('mission-b');
        expect(onPresent).toHaveBeenCalledTimes(2);
    });

    it('clears active presentation after the visible timeout', () => {
        const { result } = renderHook(() => useMissionCelebration({
            messages: [message('turn-1', ['mission-a'])],
            activeMissions: [],
            visibleMs: 500,
        }));
        act(() => {
            vi.advanceTimersByTime(0);
        });

        expect(result.current.current).not.toBeNull();

        act(() => {
            vi.advanceTimersByTime(500);
        });

        expect(result.current.current).toBeNull();
    });

    it('cleans timers on unmount', () => {
        const clearSpy = vi.spyOn(window, 'clearTimeout');
        const { unmount } = renderHook(() => useMissionCelebration({
            messages: [message('turn-1', ['mission-a'])],
            activeMissions: [],
            visibleMs: 5000,
        }));
        act(() => {
            vi.advanceTimersByTime(0);
        });

        unmount();

        expect(clearSpy).toHaveBeenCalled();
        clearSpy.mockRestore();
    });
});
