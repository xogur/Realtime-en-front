// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ReservationIntroOverlay } from './ReservationIntroOverlay';
import { shouldShowParticipantNameOverlay } from './useReservationIntro';
import type { ActiveReservationIntro, ReservationIntroEvent } from './types';

const active: ActiveReservationIntro = {
  event: {
    eventId: 'cocoon:250:intro',
    reservationId: 250,
    kioskId: 'A02',
    status: 'ready',
    presenceRequired: true,
    presenceDetectedAt: '2026-08-21T05:00:00.000Z',
    eligibleAt: '2026-08-21T05:00:00.000Z',
    startedAt: '2026-08-21T05:00:04.000Z',
    serverNow: '2026-08-21T05:00:04.000Z',
    endAt: '2026-08-21T05:30:00.000Z',
    assetVersion: 'intro-v1',
    brandDurationMs: 5_600,
    guideDurationMs: 20_700,
    maxDurationMs: 40_000,
    activePollMs: 250,
  },
  phase: 'guide',
  elapsedMs: 6_000,
};

describe('ReservationIntroOverlay', () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  });

  it('does not reveal name capture until the intro presentation has fully exited', () => {
    const completedSession: ReservationIntroEvent = {
      ...active.event,
      status: 'completed',
      participant: {
        captureRequired: true,
        status: 'required',
        source: null,
      },
    };

    expect(shouldShowParticipantNameOverlay(completedSession, null, true)).toBe(false);
    expect(shouldShowParticipantNameOverlay(completedSession, null, false)).toBe(true);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('keeps the logo video mounted and pauses it on its final frame', () => {
    render(
      <ReservationIntroOverlay role="avatar" active={active} onComplete={vi.fn()} />,
    );

    const overlay = screen.getByRole('dialog');
    const video = overlay.querySelector('video');
    expect(video).not.toBeNull();
    expect(video?.getAttribute('src')).toContain('/brand-bumper.webm');
    expect(video?.dataset.playbackState).toBe('held');
    expect(overlay.querySelector('img')).toBeNull();
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
  });

  it('fills the viewport and renders the guide video edge to edge', () => {
    render(
      <ReservationIntroOverlay role="guide" active={active} onComplete={vi.fn()} />,
    );

    const overlay = screen.getByRole('dialog');
    const video = overlay.querySelector('video');
    expect(overlay.className).toContain('h-[100dvh]');
    expect(overlay.className).toContain('w-[100dvw]');
    expect(video?.className).toContain('object-cover');
    expect(video?.autoplay).toBe(true);
  });

  it('starts the muted logo animation automatically', () => {
    const { rerender } = render(
      <ReservationIntroOverlay
        role="avatar"
        active={{ ...active, phase: 'brand', elapsedMs: 0 }}
        onComplete={vi.fn()}
      />,
    );

    const video = screen.getByRole('dialog').querySelector('video');
    expect(video?.autoplay).toBe(true);
    expect(video?.muted).toBe(true);

    Object.defineProperty(video, 'duration', { value: 5.6, configurable: true });
    Object.defineProperty(video, 'readyState', { value: 4, configurable: true });
    video!.currentTime = 1;
    rerender(
      <ReservationIntroOverlay
        role="avatar"
        active={{ ...active, phase: 'brand', elapsedMs: 3_000 }}
        onComplete={vi.fn()}
      />,
    );
    expect(video?.currentTime).toBe(1);
  });

  it('continues the guide muted instead of asking for a touch when sound autoplay is blocked', async () => {
    vi.mocked(HTMLMediaElement.prototype.play)
      .mockRejectedValueOnce(new DOMException('blocked', 'NotAllowedError'))
      .mockResolvedValue(undefined);

    render(
      <ReservationIntroOverlay role="guide" active={active} onComplete={vi.fn()} />,
    );

    const video = screen.getByRole('dialog').querySelector('video');
    fireEvent.loadedMetadata(video!);
    await waitFor(() => expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2));
    expect(video?.muted).toBe(true);
    expect(screen.queryByRole('button', { name: '눌러서 가이드 시작' })).toBeNull();
  });

  it('fades the intro out before revealing the English program', async () => {
    const onExitComplete = vi.fn();
    const { rerender } = render(
      <ReservationIntroOverlay
        role="avatar"
        active={active}
        onComplete={vi.fn()}
        onExitComplete={onExitComplete}
      />,
    );

    rerender(
      <ReservationIntroOverlay
        role="avatar"
        active={null}
        onComplete={vi.fn()}
        onExitComplete={onExitComplete}
      />,
    );

    expect(screen.queryByRole('dialog')).not.toBeNull();
    expect(screen.getByRole('dialog').dataset.exitDurationMs).toBe('800');
    expect(onExitComplete).not.toHaveBeenCalled();

    await waitFor(
      () => expect(screen.queryByRole('dialog')).toBeNull(),
      { timeout: 1_500 },
    );
    expect(onExitComplete).toHaveBeenCalledOnce();
  });
});
