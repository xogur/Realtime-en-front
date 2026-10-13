import type { ComponentType } from 'react';

import { CRIME_ATMOSPHERE, CRIME_SCENES } from '../scenes/crimeScenes';
import { DRAGON_ATMOSPHERE, DRAGON_SCENES } from '../scenes/dragonScenes';
import { GULLIVER_ATMOSPHERE, GULLIVER_SCENES } from '../scenes/gulliverScenes';
import { ODYSSEY_ATMOSPHERE, ODYSSEY_SCENES, type Atmosphere, type SceneProps } from '../scenes/odysseyScenes';
import type { Story } from '../types';
import { CRIME_AND_PUNISHMENT } from './crimeAndPunishment';
import { GULLIVER } from './gulliver';
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
  gulliver: { story: GULLIVER, scenes: GULLIVER_SCENES, atmosphere: GULLIVER_ATMOSPHERE },
  odyssey: { story: ODYSSEY, scenes: ODYSSEY_SCENES, atmosphere: ODYSSEY_ATMOSPHERE },
  'crime-and-punishment': { story: CRIME_AND_PUNISHMENT, scenes: CRIME_SCENES, atmosphere: CRIME_ATMOSPHERE },
};

export function getStory(storyId: string | null | undefined): StoryEntry | null {
  return storyId && Object.hasOwn(STORIES, storyId) ? STORIES[storyId] : null;
}
