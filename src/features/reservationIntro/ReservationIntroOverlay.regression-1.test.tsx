// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ReservationIntroOverlay } from './ReservationIntroOverlay';
import type { ActiveReservationIntro } from './types';

// Regression: ISSUE-001 — the guide skip interaction was not covered or visibly pending
// Found by /qa on 2026-08-30
// Report: .gstack/qa-reports/qa-report-localhost-2026-08-30.md
const guideActive: ActiveReservationIntro = {
  event: {
    eventId: 'cocoon:359:intro',
    reservationId: 359,
    kioskId: 'A02',
    status: 'ready',
    presenceRequired: true,
    presenceDetectedAt: '2026-08-30T05:00:00.000Z',
    eligibleAt: '2026-08-30T05:00:00.000Z',
    startedAt: '2026-08-30T05:00:04.000Z',
    serverNow: '2026-08-30T05:00:10.000Z',
    endAt: '2026-08-30T05:30:00.000Z',
    assetVersion: 'intro-v1',
    brandDurationMs: 5_600,
    guideDurationMs: 20_700,
    maxDurationMs: 40_000,
    activePollMs: 250,
  },
  phase: 'guide',
  elapsedMs: 6_000,
};

describe('ReservationIntroOverlay guide skip regression', () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows skip only on the guide screen during the guide phase', () => {
    const { rerender } = render(
      <ReservationIntroOverlay role="guide" active={guideActive} onComplete={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: '건너뛰기' })).not.toBeNull();

    rerender(
      <ReservationIntroOverlay
        role="guide"
        active={{ ...guideActive, phase: 'brand', elapsedMs: 1_000 }}
        onComplete={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: '건너뛰기' })).toBeNull();

    rerender(
      <ReservationIntroOverlay role="avatar" active={guideActive} onComplete={vi.fn()} />,
    );
    expect(screen.queryByRole('button', { name: '건너뛰기' })).toBeNull();
  });

  it('submits skipped once and exposes a pending state while completion is in flight', async () => {
    let resolveCompletion!: () => void;
    const onComplete = vi.fn(() => new Promise<void>((resolve) => {
      resolveCompletion = resolve;
    }));
    render(
      <ReservationIntroOverlay role="guide" active={guideActive} onComplete={onComplete} />,
    );

    const button = screen.getByRole('button', { name: '건너뛰기' });
    fireEvent.click(button);
    fireEvent.click(button);

    expect(onComplete).toHaveBeenCalledOnce();
    expect(onComplete).toHaveBeenCalledWith('skipped');
    expect((screen.getByRole('button', { name: '건너뛰는 중...' }) as HTMLButtonElement).disabled).toBe(true);

    resolveCompletion();
    await waitFor(() => {
      expect((screen.getByRole('button', { name: '건너뛰기' }) as HTMLButtonElement).disabled).toBe(false);
    });
  });

  it('allows retry when the completion callback rejects', async () => {
    const onComplete = vi.fn().mockRejectedValueOnce(new Error('temporary failure'));
    render(
      <ReservationIntroOverlay role="guide" active={guideActive} onComplete={onComplete} />,
    );

    fireEvent.click(screen.getByRole('button', { name: '건너뛰기' }));

    await waitFor(() => {
      expect((screen.getByRole('button', { name: '건너뛰기' }) as HTMLButtonElement).disabled).toBe(false);
    });
    expect(onComplete).toHaveBeenCalledOnce();
  });
});
