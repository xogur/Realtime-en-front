// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  publish: vi.fn(async () => true),
  subscribe: vi.fn(),
  remoteHandler: null as null | ((message: { channel: string; action: 'open' | 'close' }) => void),
}));

vi.mock('@/hooks/useVoiceSocket', () => ({
  useVoiceSocket: () => ({ connect: mocks.connect, disconnect: mocks.disconnect }),
}));
vi.mock('@/hooks/useChatSync', () => ({ useChatSync: vi.fn() }));
vi.mock('@/components/ChatOverlay', () => ({ ChatOverlay: () => <div>Chat</div> }));
vi.mock('@/components/AssessmentPanel', () => ({
  AssessmentPanel: ({ isTranslatorOpen, onOpenTranslator }: {
    isTranslatorOpen: boolean;
    onOpenTranslator: () => void;
  }) => (
    <button onClick={onOpenTranslator} type="button">
      {isTranslatorOpen ? 'translator-open' : 'translator-closed'}
    </button>
  ),
}));
vi.mock('@/lib/translator', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/translator')>();
  return {
    ...actual,
    publishTranslatorControl: mocks.publish,
    subscribeTranslatorControl: vi.fn((_kioskId, handler) => {
      mocks.remoteHandler = handler;
      return vi.fn();
    }),
  };
});

import ChatPopout from './page';

describe('chat translator cross-profile flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.remoteHandler = null;
    window.history.replaceState({}, '', '/chat?kioskId=A02');
  });

  it('publishes open for A02 and restores the button after remote close', async () => {
    render(<ChatPopout />);
    expect(mocks.connect).toHaveBeenCalledWith({ role: 'viewer', startRecording: false });

    fireEvent.click(screen.getByRole('button', { name: 'translator-closed' }));
    expect(mocks.publish).toHaveBeenCalledWith(expect.objectContaining({ action: 'open' }), 'A02');
    expect(screen.getByRole('button', { name: 'translator-open' })).toBeTruthy();

    act(() => mocks.remoteHandler?.({ channel: 'realtime-en:translator', action: 'close' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'translator-closed' })).toBeTruthy();
    });
  });

  it('rolls back the local open state when cross-profile delivery fails', async () => {
    mocks.publish.mockResolvedValueOnce(false);
    render(<ChatPopout />);

    fireEvent.click(screen.getByRole('button', { name: 'translator-closed' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'translator-closed' })).toBeTruthy();
    });
  });
});
