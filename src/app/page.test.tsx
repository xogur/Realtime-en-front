// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  publish: vi.fn(async () => true),
  remoteHandler: null as null | ((message: { channel: string; action: 'open' | 'close' }) => void),
}));

vi.mock('@/hooks/useChatSync', () => ({ useChatSync: vi.fn() }));
vi.mock('@/components/Visualizer', () => ({ Visualizer: () => <div>Visualizer</div> }));
vi.mock('@/components/ControlPanel', () => ({ ControlPanel: () => <div>Controls</div> }));
vi.mock('@/components/SettingsModal', () => ({ SettingsModal: () => <div>Settings</div> }));
vi.mock('@/components/ChatOverlay', () => ({ ChatOverlay: () => <div>Chat</div> }));
vi.mock('@/components/CopyrightAttribution', () => ({ CopyrightAttribution: () => null }));
vi.mock('@/components/TranslatorOverlay', () => ({
  TranslatorOverlay: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => (
    isOpen ? <button onClick={onClose} type="button">close-translator</button> : null
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

import Home from './page';

describe('main translator cross-profile flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.remoteHandler = null;
    window.history.replaceState({}, '', '/?kioskId=A02&dualScreen=1');
  });

  it('opens from the remote A02 command and publishes close back to chat', async () => {
    render(<Home />);
    expect(screen.queryByRole('button', { name: 'close-translator' })).toBeNull();

    act(() => mocks.remoteHandler?.({ channel: 'realtime-en:translator', action: 'open' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'close-translator' })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole('button', { name: 'close-translator' }));

    expect(mocks.publish).toHaveBeenCalledWith(expect.objectContaining({ action: 'close' }), 'A02');
    expect(screen.queryByRole('button', { name: 'close-translator' })).toBeNull();
  });

  it('reopens the local overlay when cross-profile close delivery fails', async () => {
    mocks.publish.mockResolvedValueOnce(false);
    render(<Home />);
    act(() => mocks.remoteHandler?.({ channel: 'realtime-en:translator', action: 'open' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'close-translator' })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: 'close-translator' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'close-translator' })).toBeTruthy();
    });
  });
});
