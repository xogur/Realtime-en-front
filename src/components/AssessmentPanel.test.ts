// @vitest-environment jsdom

import { createElement } from 'react';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { animateMock, stopMock } = vi.hoisted(() => {
    const stop = vi.fn();
    return {
        animateMock: vi.fn(() => ({ stop })),
        stopMock: stop,
    };
});

vi.mock('framer-motion', async () => {
    const actual = await vi.importActual<typeof import('framer-motion')>('framer-motion');
    const React = await import('react');
    return {
        ...actual,
        useAnimate: () => [React.useRef<HTMLElement | null>(null), animateMock],
    };
});

import {
    AssessmentPanel,
    CorrectionCoachCard,
    TierProgressBar,
    getBatchCountdown,
    getEvaluationReliabilityNotice,
    getPracticeMissionCandidates,
    getRepeatedErrorPatterns,
    shouldShowCoachContent,
    useCountdownClock,
} from './AssessmentPanel';
import { useStore, type ChatMessage, type TurnEvaluation } from '@/stores/useStore';

beforeEach(() => {
    animateMock.mockClear();
    stopMock.mockClear();
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
    Object.defineProperty(window, 'print', { configurable: true, value: vi.fn() });
    useStore.setState({ messages: [] });
});

afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

describe('batch evaluation countdown', () => {
    it('caps stale or cross-clock deadlines at 30 seconds', () => {
        expect(getBatchCountdown({
            pendingCount: 1,
            maxTurns: 4,
            delaySeconds: 30,
            nextFlushAtEpochMs: 1_086_000,
            receivedAtEpochMs: 1_000_000,
        }, 1_000_000)).toBe('30초');
    });

    it('ticks once per second while evaluation is pending', () => {
        vi.useFakeTimers();
        vi.setSystemTime(1_000_000);
        const { result } = renderHook(() => useCountdownClock(true));
        expect(result.current).toBe(1_000_000);

        act(() => {
            vi.advanceTimersByTime(1_000);
        });

        expect(result.current).toBe(1_001_000);
    });
});

describe('shouldShowCoachContent', () => {
    it('shows realtime correction before the first batch evaluation arrives', () => {
        expect(shouldShowCoachContent(0, true)).toBe(true);
    });

    it('keeps the empty state when neither correction nor evaluation exists', () => {
        expect(shouldShowCoachContent(0, false)).toBe(false);
    });

    it('shows evaluated content without a realtime correction', () => {
        expect(shouldShowCoachContent(1, false)).toBe(true);
    });
});

describe('getEvaluationReliabilityNotice', () => {
    it('marks low-confidence model fallback as a provisional evaluation', () => {
        expect(getEvaluationReliabilityNotice('low')).toBe('AI 응답이 불안정해 임시 기준으로 평가했습니다.');
    });

    it('does not warn for normal confidence', () => {
        expect(getEvaluationReliabilityNotice('high')).toBeNull();
    });
});

describe('getRepeatedErrorPatterns', () => {
    function makeTurn(
        id: string,
        errorTags: string[],
        confidence: TurnEvaluation['confidence'] = 'high',
    ) {
        const content = `Original ${id}`;
        const evaluation: TurnEvaluation = {
            rubricVersion: 'speaking-v2',
            turnId: id,
            provider: 'test',
            model: 'test',
            createdAt: '2026-07-26T00:00:00.000Z',
            scores: { overall: 70, grammar: 65, vocabulary: 70, relevance: 75, fluency: 68, interaction: 72 },
            evidence: { overall: '', grammar: '', vocabulary: '', relevance: '', fluency: '', interaction: '' },
            feedback: { summary: '', strength: '', improvement: '', nextPractice: '' },
            cefrEstimate: { level: 'A2', reason: '' },
            correction: { original: content, suggested: `Corrected ${id}`, reason: '교정 근거' },
            errorTags,
            capabilities: { pronunciation: 'not_available' },
            confidence,
            confidenceReasons: [],
        };
        return {
            message: { id, role: 'user' as const, content },
            evaluation,
        };
    }

    it('counts one occurrence per reliable turn and requires two turns', () => {
        const patterns = getRepeatedErrorPatterns([
            makeTurn('turn-1', ['verb_tense', 'verb_tense']),
            makeTurn('turn-2', ['verb_tense']),
            makeTurn('turn-3', ['preposition']),
            makeTurn('turn-low', ['verb_tense'], 'low'),
        ]);

        expect(patterns).toHaveLength(1);
        expect(patterns[0]).toMatchObject({
            code: 'verb_tense',
            label: '동사 시제',
            count: 2,
            total: 3,
            original: 'Original turn-1',
            suggested: 'Corrected turn-1',
            meaning: '말하는 시간과 동사의 형태가 서로 맞지 않았습니다.',
            advice: 'yesterday·last week처럼 끝난 일을 말할 때는 동사를 과거형으로 바꿉니다.',
        });
    });

    it('does not invent a repeated pattern from one tagged response', () => {
        expect(getRepeatedErrorPatterns([
            makeTurn('turn-1', ['article']),
            makeTurn('turn-2', []),
        ])).toEqual([]);
    });
});

describe('assessment print report', () => {
    it('offers only the result report and omits practice-plan sections', async () => {
        const content = 'I go there yesterday.';
        const evaluation: TurnEvaluation = {
            rubricVersion: 'speaking-v2',
            turnId: 'print-turn',
            provider: 'test',
            model: 'test',
            createdAt: '2026-08-10T00:00:00.000Z',
            scores: { overall: 70, grammar: 60, vocabulary: 70, relevance: 80, fluency: 70, interaction: 70 },
            evidence: { overall: '', grammar: '', vocabulary: '', relevance: '', fluency: '', interaction: '' },
            feedback: { summary: '', strength: '질문에 맞게 답했습니다.', improvement: '과거 시제를 연습하세요.', nextPractice: '제거 대상' },
            cefrEstimate: { level: 'A2', reason: '간단한 경험을 전달했습니다.' },
            correction: {
                original: content,
                suggested: 'I went there yesterday.',
                reason: 'yesterday에 맞춰 과거 시제를 사용합니다.',
                category: 'grammar',
                contextFit: 'appropriate',
                reportEligible: true,
                reportPriority: 'medium',
                meaningPreserved: true,
            },
            errorTags: ['verb_tense'],
            capabilities: { pronunciation: 'not_available' },
            confidence: 'high',
            confidenceReasons: [],
        };
        useStore.setState({
            messages: [
                { role: 'assistant', content: 'What did you do yesterday?' },
                { id: 'print-turn', role: 'user', content, evaluation },
            ],
        });

        render(createElement(AssessmentPanel));

        expect(screen.queryByRole('button', { name: '대화 기록 출력' })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: '평가 리포트 출력' }));
        expect(screen.getByRole('heading', { name: '영어 코치 리포트' })).toBeTruthy();
        expect(screen.queryByText('20분 원투원 진행 예시')).toBeNull();
        expect(screen.queryByText('7일 연습 계획')).toBeNull();
        expect(screen.queryByText('강사 메모')).toBeNull();
        await waitFor(() => expect(window.print).toHaveBeenCalledOnce());
    });
});

describe('getPracticeMissionCandidates', () => {
    it('ignores model-generated missions when evaluation confidence is low', () => {
        const message: ChatMessage = {
            id: 'turn-low',
            role: 'user',
            content: 'I like pizza because it tastes good.',
        };
        const evaluation: TurnEvaluation = {
            rubricVersion: 'speaking-v2',
            turnId: 'turn-low',
            provider: 'test',
            model: 'test',
            createdAt: '2026-07-15T00:00:00.000Z',
            scores: { overall: 70, grammar: 70, vocabulary: 70, relevance: 70, fluency: 70, interaction: 70 },
            evidence: { overall: '', grammar: '', vocabulary: '', relevance: '', fluency: '', interaction: '' },
            feedback: { summary: '', strength: '', improvement: '', nextPractice: '' },
            cefrEstimate: { level: 'A2', reason: '' },
            correction: { original: message.content, suggested: '', reason: '' },
            capabilities: { pronunciation: 'not_available' },
            confidence: 'low',
            confidenceReasons: ['fallback'],
            missionCandidates: [{
                id: 'untrusted-model-mission',
                sourceTurnId: 'turn-low',
                kind: 'connector',
                title: '모델 미션',
                target: 'because를 사용하세요.',
                successHint: '완료',
                rewardLp: 12,
                checks: [{ type: 'connector' }],
                createdAt: '2026-07-15T00:00:00.000Z',
            }],
        };

        const candidates = getPracticeMissionCandidates({ message, evaluation }, 'What food do you like?');

        expect(candidates.length).toBeGreaterThan(0);
        expect(candidates.some((mission) => mission.id === 'untrusted-model-mission')).toBe(false);
    });
});

describe('TierProgressBar', () => {
    it('keeps earned LP visibly filled and announces a positive delta', () => {
        render(createElement(TierProgressBar, {
            value: 39,
            highlight: true,
            missionBonus: 0,
            latestDelta: 12,
        }));

        const progress = screen.getByRole('progressbar', { name: '티어 LP 진행도' });
        expect(progress.getAttribute('aria-valuenow')).toBe('39');
        expect(screen.getByText('+12 LP')).toBeTruthy();
    });
});

describe('CorrectionCoachCard', () => {
    const baseProps = {
        sentence: 'I want more because it is useful for me.',
        reason: '문장을 자연스럽게 연결했습니다.',
        score: '62점',
        scoreClassName: 'bg-green-50 text-green-900',
        lp: 6,
        lpIsFinal: false,
    };

    it('keeps the correction content mounted while score and LP become final', () => {
        const view = render(createElement(CorrectionCoachCard, baseProps));
        const card = screen.getByText(baseProps.sentence).closest('section');

        view.rerender(createElement(CorrectionCoachCard, {
            ...baseProps,
            score: '68점',
            lp: 9,
            lpIsFinal: true,
        }));

        expect(screen.getByText(baseProps.sentence).closest('section')).toBe(card);
        expect(screen.getByText('68점')).toBeTruthy();
        expect(screen.getByText('평가 LP +9 LP')).toBeTruthy();
    });

    it('shows only the latest sentence after rapid correction updates', () => {
        const view = render(createElement(CorrectionCoachCard, baseProps));
        animateMock.mockClear();

        view.rerender(createElement(CorrectionCoachCard, {
            ...baseProps,
            sentence: 'I want something more useful for me.',
        }));
        view.rerender(createElement(CorrectionCoachCard, {
            ...baseProps,
            sentence: 'I want something that is more useful for me.',
        }));

        expect(screen.getByText('I want something that is more useful for me.')).toBeTruthy();
        expect(screen.queryByText(baseProps.sentence)).toBeNull();
        expect(animateMock).toHaveBeenCalledWith(
            '[data-correction-sentence]',
            expect.any(Object),
            expect.any(Object),
        );
        expect(animateMock).toHaveBeenCalledWith(
            '[data-correction-accent]',
            expect.any(Object),
            expect.any(Object),
        );
        expect(stopMock).toHaveBeenCalled();
    });

    it('separates sentence, score, and LP animation targets', () => {
        const view = render(createElement(CorrectionCoachCard, baseProps));
        animateMock.mockClear();

        view.rerender(createElement(CorrectionCoachCard, { ...baseProps, score: '64점' }));
        expect(animateMock).toHaveBeenCalledWith(
            '[data-correction-score]',
            expect.any(Object),
            expect.any(Object),
        );
        expect(animateMock).not.toHaveBeenCalledWith(
            expect.any(HTMLElement),
            expect.any(Object),
            expect.any(Object),
        );

        animateMock.mockClear();
        view.rerender(createElement(CorrectionCoachCard, { ...baseProps, lp: 8 }));
        expect(animateMock).toHaveBeenCalledWith(
            '[data-correction-lp]',
            expect.any(Object),
            expect.any(Object),
        );
    });

    it('updates content without decorative animation when reduced motion is enabled', async () => {
        window.matchMedia = vi.fn().mockImplementation((query: string) => ({
            matches: true,
            media: query,
            onchange: null,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            addListener: vi.fn(),
            removeListener: vi.fn(),
            dispatchEvent: vi.fn(),
        }));
        const view = render(createElement(CorrectionCoachCard, baseProps));
        await waitFor(() => expect(window.matchMedia).toHaveBeenCalled());
        animateMock.mockClear();

        view.rerender(createElement(CorrectionCoachCard, {
            ...baseProps,
            sentence: 'I want something more useful for me.',
        }));

        expect(screen.getByText('I want something more useful for me.')).toBeTruthy();
        expect(animateMock).not.toHaveBeenCalled();
    });
});
