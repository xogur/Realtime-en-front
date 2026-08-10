// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ChatOverlay } from './ChatOverlay';
import { useStore } from '@/stores/useStore';

beforeEach(() => {
    useStore.setState({
        messages: [],
        showKoreanInterpretation: true,
        textScale: 1,
        socket: null,
        isThinking: false,
        partialMessage: '',
        liveTranscript: '',
    });
});

afterEach(cleanup);

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
