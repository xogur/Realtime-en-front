'use client';

import { useEffect, useState } from 'react';

import { fetchMissionLearningHome } from './api';
import { MISSION_LEARNING_ENABLED } from './config';

export type MissionLearningAvailability = 'disabled' | 'checking' | 'available' | 'unavailable';

/** `disabled` means the build hides the mode entirely; free talk opens directly. */
export function useMissionLearningAvailability(): MissionLearningAvailability {
  const [availability, setAvailability] = useState<MissionLearningAvailability>(
    MISSION_LEARNING_ENABLED ? 'checking' : 'disabled',
  );

  useEffect(() => {
    if (!MISSION_LEARNING_ENABLED) return;
    const controller = new AbortController();
    fetchMissionLearningHome(controller.signal)
      .then((home) => {
        if (!controller.signal.aborted) setAvailability(home?.enabled ? 'available' : 'unavailable');
      })
      .catch(() => {
        if (!controller.signal.aborted) setAvailability('unavailable');
      });
    return () => controller.abort();
  }, []);

  return availability;
}
