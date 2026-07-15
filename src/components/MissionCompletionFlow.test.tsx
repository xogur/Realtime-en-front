// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AssessmentPanel } from './AssessmentPanel';
import { ChatOverlay } from './ChatOverlay';
import { useStore, type PracticeMission, type TurnEvaluation } from '@/stores/useStore';

const mission: PracticeMission = {
    id: 'mission-because',
    kind: 'connector',
    title: '이유 연결하기',
    target: 'because를 사용해 이유를 말해보세요.',
    successHint: 'because로 이유를 자연스럽게 연결했습니다.',
    rewardLp: 7,
    checks: [{ type: 'connector' }],
    createdAt: '2026-07-15T00:00:00.000Z',
};

function replacementMission(id: string, token: string): PracticeMission {
    return {
        id,
        kind: 'vocabulary',
        title: `Mission ${id}`,
        target: `Use ${token}`,
        successHint: `Used ${token}`,
        rewardLp: 5,
        checks: [{ type: 'includesAny', value: [token] }],
        createdAt: '2026-07-15T00:00:00.000Z',
    };
}

const batchEvaluation: TurnEvaluation = {
    rubricVersion: 'speaking-v2',
    turnId: 'turn-1',
    provider: 'test',
    model: 'test',
    createdAt: '2026-07-15T00:00:05.000Z',
    scores: { overall: 80, grammar: 80, vocabulary: 80, relevance: 80, fluency: 80, interaction: 80 },
    evidence: { overall: '', grammar: '', vocabulary: '', relevance: '', fluency: '', interaction: '' },
    feedback: { summary: '', strength: '', improvement: '', nextPractice: '' },
    cefrEstimate: { level: 'A2', reason: '' },
    correction: { original: 'I study English because I want to travel.', suggested: '', reason: '' },
    capabilities: { pronunciation: 'not_available' },
    confidence: 'high',
    confidenceReasons: [],
};

describe('mission completion UI flow', () => {
    beforeEach(() => {
        window.matchMedia = vi.fn().mockImplementation((query: string) => ({
            matches: false,
            media: query,
            onchange: null,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            addListener: vi.fn(),
            removeListener: vi.fn(),
            dispatchEvent: vi.fn(),
        }));
        useStore.getState().clearMessages();
        useStore.getState().setActiveMissions([mission]);
    });

    afterEach(() => {
        cleanup();
        useStore.getState().clearMessages();
    });

    it('keeps the assistant visible while mission and LP feedback are presented', async () => {
        render(
            <div>
                <ChatOverlay standalone />
                <AssessmentPanel />
            </div>,
        );

        act(() => {
            useStore.getState().addMessage('user', 'I study English because I want to travel.', 'turn-1');
            useStore.getState().addMessage('assistant', 'That is a clear reason. Where do you want to travel?', 'turn-1');
        });

        expect(screen.getByText('That is a clear reason. Where do you want to travel?')).toBeTruthy();
        expect(useStore.getState().messages[0].completedMissions?.map((item) => item.missionId)).toEqual(['mission-because']);
        expect((await screen.findByTestId('mission-panel-completion')).textContent).toContain('MISSION CLEAR');
        expect(screen.getByText('미션 1개 완료')).toBeTruthy();

        const progress = screen.getByRole('progressbar', { name: '티어 LP 진행도' });
        expect(progress.getAttribute('aria-valuenow')).toBe('7');
        expect(screen.getByTestId('tier-progress-fill').getAttribute('style')).toContain('width: 7%');

        act(() => {
            useStore.getState().setTurnEvaluation('turn-1', batchEvaluation);
        });

        expect(screen.getByText('That is a clear reason. Where do you want to travel?')).toBeTruthy();
        expect(progress.getAttribute('aria-valuenow')).toBe('24');
        expect(screen.getByTestId('tier-progress-fill').getAttribute('style')).toContain('width: 24%');
    });

    it('mounts a queued replacement as a new animated mission card', async () => {
        const completed = replacementMission('mission-alpha', 'alpha');
        const second = replacementMission('mission-beta', 'beta');
        const third = replacementMission('mission-gamma', 'gamma');
        const queued = replacementMission('mission-delta', 'delta');
        useStore.setState({
            activeMissions: [completed, second, third],
            missionQueue: [queued],
        });

        render(<AssessmentPanel />);

        expect(document.querySelector('[data-mission-id="mission-alpha"]')).toBeTruthy();

        act(() => {
            useStore.getState().addMessage('user', 'I used alpha naturally.', 'turn-animation');
        });

        await waitFor(() => {
            const replacement = document.querySelector('[data-mission-id="mission-delta"]');
            expect(replacement).toBeTruthy();
            expect(replacement?.getAttribute('data-mission-entering')).toBe('true');
        });
    });
});
