// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { selectDisplayedAvatarId, useStore } from '@/stores/useStore';
import { STORY_AVATAR_ID, StoryAvatarMode } from './StoryAvatarMode';

vi.mock('./useStoryAvatar', () => ({ useStoryAvatar: () => ({ shutdown: vi.fn() }) }));
vi.mock('./StoryAvatarPanel', () => ({ StoryAvatarPanel: () => null }));

describe('story presenter avatar', () => {
  afterEach(cleanup);

  it('shows the story presenter only while story mode is open and keeps the free-talk voice', () => {
    useStore.getState().setCurrentAvatar('Ryan');
    const voice = useStore.getState().voice;
    const view = render(<StoryAvatarMode kioskId="A04" isConnected sendStoryCheck={() => true} stopAvatarSpeech={vi.fn()} onExit={vi.fn()} />);

    expect(STORY_AVATAR_ID).toBe('Serena');
    expect(selectDisplayedAvatarId(useStore.getState())).toBe('Serena');
    expect(useStore.getState().currentAvatarId).toBe('Ryan');
    expect(useStore.getState().voice).toBe(voice);

    view.unmount();
    expect(selectDisplayedAvatarId(useStore.getState())).toBe('Ryan');
  });
});
