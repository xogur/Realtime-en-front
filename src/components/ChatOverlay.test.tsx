// @vitest-environment jsdom

import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ChatOverlay } from './ChatOverlay';
import { useStore, type TurnEvaluation } from '@/stores/useStore';

function evaluation(): TurnEvaluation {
    return {
        rubricVersion: 'test',
        turnId: 'turn-2',
        provider: 'test',
        model: 'test',
        createdAt: '2026-07-15T00:00:00.000Z',
        scores: { overall: 80, grammar: 80, vocabulary: 80, relevance: 80, fluency: 80, interaction: 80 },
        evidence: { overall: '', grammar: '', vocabulary: '', relevance: '', fluency: '', interaction: '' },
        feedback: { summary: '', strength: '', improvement: '', nextPractice: '' },
        cefrEstimate: { level: 'A2', reason: '' },
        correction: { original: 'Second answer.', suggested: 'Second answer.', reason: '' },
        capabilities: { pronunciation: 'not_available' },
        confidence: 'high',
        confidenceReasons: [],
    };
}

describe('ChatOverlay', () => {
    afterEach(() => {
        cleanup();
        useStore.getState().clearMessages();
    });

    it('keeps the complete visible transcript after a partial batch sync', () => {
        useStore.setState({
            messages: [
                { role: 'user', content: 'First answer.' },
                { role: 'assistant', content: 'First reply.' },
                { id: 'turn-2', role: 'user', content: 'Second answer.', evaluationStatus: 'pending' },
                { id: 'turn-2', role: 'assistant', content: 'Second reply.' },
            ],
        });
        const { container, getByText } = render(<ChatOverlay standalone />);

        act(() => {
            useStore.getState().syncMessages([{
                id: 'turn-2',
                role: 'user',
                content: 'Second answer.',
                evaluationStatus: 'ready',
                evaluation: evaluation(),
            }]);
        });

        expect(container.querySelectorAll('[data-chat-message]')).toHaveLength(4);
        expect(getByText('First answer.')).toBeTruthy();
        expect(getByText('First reply.')).toBeTruthy();
        expect(getByText('Second answer.')).toBeTruthy();
        expect(getByText('Second reply.')).toBeTruthy();
    });
});
