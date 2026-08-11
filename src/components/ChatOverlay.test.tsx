// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ChatOverlay } from './ChatOverlay';
import { useStore } from '@/stores/useStore';

beforeEach(() => {
    useStore.setState({
        messages: [],
        showKoreanInterpretation: true,
        showReplySuggestions: true,
        textScale: 1,
        socket: null,
        isThinking: false,
        partialMessage: '',
        liveTranscript: '',
    });
});

afterEach(cleanup);

describe('ChatOverlay reply suggestion toggle', () => {
    it('defaults reply suggestions to ON', () => {
        expect(useStore.getInitialState().showReplySuggestions).toBe(true);
    });

    it('hides and restores existing suggestions without deleting message data', () => {
        useStore.setState({
            messages: [{
                role: 'assistant',
                content: 'Would you like anything else?',
                suggestions: ['No, thank you.'],
            }],
        });
        render(<ChatOverlay standalone />);

        expect(screen.getByRole('button', { name: 'No, thank you.' })).toBeTruthy();
        fireEvent.click(screen.getByRole('switch', { name: '추천 문장 켜짐' }));

        expect(screen.queryByRole('button', { name: 'No, thank you.' })).toBeNull();
        expect(useStore.getState().messages[0].suggestions).toEqual(['No, thank you.']);
        expect(screen.getByRole('switch', { name: '추천 문장 꺼짐' }).textContent).toContain('OFF');

        fireEvent.click(screen.getByRole('switch', { name: '추천 문장 꺼짐' }));
        expect(screen.getByRole('button', { name: 'No, thank you.' })).toBeTruthy();
    });
});

describe('ChatOverlay interpretation toggle', () => {
    it('defaults Korean interpretation to ON', () => {
        expect(useStore.getInitialState().showKoreanInterpretation).toBe(true);
    });

    it('shows an explicit ON/OFF state and toggles Korean interpretation', () => {
        render(<ChatOverlay standalone />);

        const enabledToggle = screen.getByRole('switch', { name: '한국어 해석 켜짐' });
        expect(enabledToggle.getAttribute('aria-checked')).toBe('true');
        expect(enabledToggle.textContent).toContain('해석');
        expect(enabledToggle.textContent).toContain('ON');
        expect(screen.getByTestId('korean-interpretation-thumb').className).toContain('left-0.5');
        expect(screen.getByTestId('korean-interpretation-thumb').className).toContain('translate-x-4');

        fireEvent.click(enabledToggle);

        const disabledToggle = screen.getByRole('switch', { name: '한국어 해석 꺼짐' });
        expect(disabledToggle.getAttribute('aria-checked')).toBe('false');
        expect(disabledToggle.textContent).toContain('OFF');
        expect(screen.getByTestId('korean-interpretation-thumb').className).toContain('translate-x-0');
        expect(useStore.getState().showKoreanInterpretation).toBe(false);
    });
});
