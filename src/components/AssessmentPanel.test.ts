// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
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

import { CorrectionCoachCard, getEvaluationReliabilityNotice, shouldShowCoachContent } from './AssessmentPanel';

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
});

afterEach(() => cleanup());

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
