import type { ComponentType } from 'react';

import { DRAGON_ATMOSPHERE, DRAGON_SCENES } from '../scenes/dragonScenes';
import { ODYSSEY_ATMOSPHERE, ODYSSEY_SCENES, type Atmosphere, type SceneProps } from '../scenes/odysseyScenes';
import type { Story } from '../types';
import { ODYSSEY } from './odyssey';
import { RELUCTANT_DRAGON } from './reluctantDragon';

export type StoryEntry = {
  story: Story;
  scenes: Record<string, ComponentType<SceneProps>>;
  atmosphere: Record<string, (beat: number) => Atmosphere>;
};

/** Library order: the easier story comes first. */
export const STORIES: Record<string, StoryEntry> = {
  'reluctant-dragon': { story: RELUCTANT_DRAGON, scenes: DRAGON_SCENES, atmosphere: DRAGON_ATMOSPHERE },
  odyssey: { story: ODYSSEY, scenes: ODYSSEY_SCENES, atmosphere: ODYSSEY_ATMOSPHERE },
};

/** The avatar window opens the story library with this id; the learner picks a story there. */
export const DEFAULT_STORY_ID = 'odyssey';

export function getStory(storyId: string | null | undefined): StoryEntry | null {
  return storyId && Object.hasOwn(STORIES, storyId) ? STORIES[storyId] : null;
}
