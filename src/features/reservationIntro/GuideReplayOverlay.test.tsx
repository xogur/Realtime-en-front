// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GuideReplayOverlay } from './GuideReplayOverlay';

describe('GuideReplayOverlay', () => {
  beforeEach(() => {
    Object.defineProperty(HTMLMediaElement.prototype, 'play', {
      configurable: true,
      value: vi.fn().mockResolvedValue(undefined),
    });
  });

  it('plays only the guide video from the selected asset version', () => {
    const { container } = render(
      <GuideReplayOverlay active assetVersion="intro-v1" onClose={vi.fn()} />,
    );

    const video = container.querySelector('video');
    expect(video?.getAttribute('src')).toBe('/experience/intro-v1/guide-intro.webm');
    expect(container.querySelector('[src$="brand-bumper.webm"]')).toBeNull();
    expect(screen.getByRole('button', { name: '건너뛰기' })).toBeTruthy();
  });

  it('closes when the user skips or the guide finishes', () => {
    const onClose = vi.fn();
    const { container } = render(
      <GuideReplayOverlay active assetVersion="intro-v1" onClose={onClose} />,
    );

    fireEvent.click(screen.getByRole('button', { name: '건너뛰기' }));
    fireEvent.ended(container.querySelector('video')!);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('renders nothing while closed', () => {
    render(<GuideReplayOverlay active={false} assetVersion="intro-v1" onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog', { name: '가이드 영상' })).toBeNull();
  });
});
