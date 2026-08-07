// @vitest-environment jsdom

import { createElement } from 'react';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
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
    buildConversationReviewTurns,
    getBatchCountdown,
    getEvaluationReliabilityNotice,
    getPracticeMissionCandidates,
    getRepeatedErrorPatterns,
    paginateConversationReviewTurns,
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
        });
    });

    it('does not invent a repeated pattern from one tagged response', () => {
        expect(getRepeatedErrorPatterns([
            makeTurn('turn-1', ['article']),
            makeTurn('turn-2', []),
        ])).toEqual([]);
    });
});

describe('buildConversationReviewTurns', () => {
    it('pairs meaningful learner speech with the English AI response', () => {
        const messages: ChatMessage[] = [
            { role: 'assistant', content: 'What do you usually do after work?' },
            { role: 'user', content: 'I usually study English because I want to travel.' },
            { role: 'assistant', content: 'That is a great goal. Where would you like to travel?\n\n한국어 해석: 좋은 목표네요. 어디로 여행하고 싶나요?' },
            { role: 'user', content: '...' },
            { role: 'assistant', content: 'Take your time.' },
        ];

        expect(buildConversationReviewTurns(messages)).toEqual([
            expect.objectContaining({
                sequence: 1,
                prompt: 'What do you usually do after work?',
                learner: 'I usually study English because I want to travel.',
                assistant: 'That is a great goal. Where would you like to travel?',
            }),
        ]);
    });

    it('does not put evaluation or correction metadata into conversation history', () => {
        const evaluation: TurnEvaluation = {
            rubricVersion: 'speaking-v2',
            turnId: 'turn-1',
            provider: 'test',
            model: 'test',
            createdAt: '2026-08-03T00:00:00.000Z',
            scores: { overall: 72, grammar: 68, vocabulary: 73, relevance: 76, fluency: 70, interaction: 72 },
            evidence: { overall: '', grammar: '', vocabulary: '', relevance: '', fluency: '', interaction: '' },
            feedback: { summary: '', strength: '', improvement: '', nextPractice: '' },
            cefrEstimate: { level: 'A2', reason: '' },
            correction: {
                original: 'I go there yesterday.',
                suggested: 'I went there yesterday.',
                reason: '과거 시제를 사용합니다.',
            },
            capabilities: { pronunciation: 'not_available' },
            confidence: 'high',
            confidenceReasons: [],
        };

        const [turn] = buildConversationReviewTurns([
            { role: 'user', content: 'I go there yesterday.', evaluation },
            { role: 'assistant', content: 'What did you do there?' },
        ]);

        expect(turn).toEqual({
            sequence: 1,
            prompt: '',
            learner: 'I go there yesterday.',
            assistant: 'What did you do there?',
        });
    });

    it('extracts learning exchanges while excluding greetings, controls, and system notices', () => {
        const turns = buildConversationReviewTurns([
            { role: 'user', content: 'Hello!', evaluationStatus: 'pending' },
            { role: 'assistant', content: 'Hi! How are you?' },
            { role: 'user', content: 'Stop', evaluationStatus: 'skipped', evaluationSkipReason: 'conversation_control' },
            { role: 'assistant', content: '(시스템) 대화 내용이 초기화되었습니다.' },
            { role: 'user', content: 'Yes, I do.' },
            { role: 'assistant', content: 'Why do you enjoy it?' },
            { role: 'user', content: 'I enjoy it because it helps me relax after work.' },
            { role: 'assistant', content: 'That is a clear explanation.' },
        ]);

        expect(turns).toHaveLength(2);
        expect(turns.map((turn) => turn.learner)).toEqual([
            'Yes, I do.',
            'I enjoy it because it helps me relax after work.',
        ]);
        expect(turns[0].prompt).toBe('Hi! How are you?');
        expect(turns[0].assistant).toBe('Why do you enjoy it?');
    });

    it('keeps every meaningful exchange instead of sampling a long conversation', () => {
        const messages: ChatMessage[] = Array.from({ length: 24 }, (_, index) => (
            index % 2 === 0
                ? { role: 'user', content: `I am explaining meaningful answer number ${index / 2 + 1}.` }
                : { role: 'assistant', content: `Please tell me more about answer ${(index + 1) / 2}.` }
        ));

        expect(buildConversationReviewTurns(messages)).toHaveLength(12);
    });

    it('fills a page with additional short exchanges instead of stopping at eight', () => {
        const messages: ChatMessage[] = [
            { role: 'assistant', content: 'Tell me about your day.' },
            ...Array.from({ length: 30 }, (_, index) => (
                index % 2 === 0
                    ? { role: 'user' as const, content: `I am sharing useful answer number ${index / 2 + 1}.` }
                    : { role: 'assistant' as const, content: `Thanks for sharing answer ${(index + 1) / 2}.` }
            )),
        ];
        const turns = buildConversationReviewTurns(messages);
        const pages = paginateConversationReviewTurns(turns);

        expect(turns).toHaveLength(15);
        expect(pages[0].length).toBeGreaterThan(8);
        expect(pages.flat()).toEqual(turns);
    });
});

describe('conversation history print report', () => {
    it('prints only the plain conversation transcript from the conversation button', async () => {
        useStore.setState({
            messages: [
                { role: 'assistant', content: 'How do you usually spend your evening?' },
                { role: 'user', content: 'I usually read a book after dinner.' },
                { role: 'assistant', content: 'That sounds relaxing. What kind of books do you enjoy?\n\n한국어 해석: 편안해 보이네요. 어떤 책을 좋아하세요?' },
            ],
        });

        render(createElement(AssessmentPanel));
        fireEvent.click(screen.getByRole('button', { name: '대화 기록 출력' }));

        expect(screen.getByText('인쇄 중입니다')).toBeTruthy();
        expect(screen.getByText(/프린터로 이동해 주세요/)).toBeTruthy();
        await waitFor(() => expect(window.print).toHaveBeenCalledOnce());
        const reportHeading = screen.getByRole('heading', { name: '대화 내역' });
        const report = reportHeading.closest('.print-document') as HTMLElement;
        expect(report).toBeTruthy();
        expect(screen.getByText('I usually read a book after dinner.')).toBeTruthy();
        expect(screen.getByText('That sounds relaxing. What kind of books do you enjoy?')).toBeTruthy();
        expect(screen.queryByText('편안해 보이네요. 어떤 책을 좋아하세요?')).toBeNull();
        expect(within(report).queryByText(/자동 평가|세션 점수|CEFR|교정 없음|교수 조정/)).toBeNull();
        expect(screen.queryByRole('heading', { name: '영어 코치 리포트' })).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: '인쇄 안내 닫기' }));
        expect(screen.queryByText('인쇄 중입니다')).toBeNull();

        act(() => window.dispatchEvent(new Event('afterprint')));
        await waitFor(() => expect(screen.queryByRole('heading', { name: '대화 내역' })).toBeNull());
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
