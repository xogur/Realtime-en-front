// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PresenceTouchFallback } from './PresenceTouchFallback';
import { presenceDetectorStartRetryDelayMs } from './usePresenceDetector';

vi.mock('@mediapipe/tasks-vision', () => ({ FilesetResolver: {}, ObjectDetector: {} }));

afterEach(() => cleanup());

describe('PresenceTouchFallback', () => {
  it('renders nothing until the fallback is offered', () => {
    render(<PresenceTouchFallback visible={false} onStart={vi.fn(async () => true)} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('starts the reservation from a touch', async () => {
    const onStart = vi.fn(async () => true);
    render(<PresenceTouchFallback visible onStart={onStart} />);

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /눌러서 시작하기/ })); });

    expect(onStart).toHaveBeenCalledOnce();
  });

  it('lets the visitor try again after a failed start', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const onStart = vi.fn(async () => { throw new Error('offline'); });
    render(<PresenceTouchFallback visible onStart={onStart} />);

    await act(async () => { fireEvent.click(screen.getByRole('button')); });

    expect(screen.getByRole('button', { name: /다시 눌러 시작하기/ })).not.toBeNull();
  });
});

describe('presence detector start retry', () => {
  it('retries a failed camera start with a bounded backoff', () => {
    expect(presenceDetectorStartRetryDelayMs(1)).toBe(3_000);
    expect(presenceDetectorStartRetryDelayMs(2)).toBe(6_000);
    expect(presenceDetectorStartRetryDelayMs(4)).toBe(24_000);
    expect(presenceDetectorStartRetryDelayMs(5)).toBe(30_000);
    expect(presenceDetectorStartRetryDelayMs(50)).toBe(30_000);
  });
});
