'use client';

import { useEffect, useState } from 'react';

import { fetchMissionLearningHome } from './api';
import { MISSION_LEARNING_ENABLED } from './config';

export type MissionLearningAvailability = 'disabled' | 'checking' | 'available' | 'unavailable';

/** `disabled` means the build hides the mode entirely; free talk opens directly. */
export function useMissionLearningAvailability(retryKey = 0): MissionLearningAvailability {
  const [availability, setAvailability] = useState<MissionLearningAvailability>(
    MISSION_LEARNING_ENABLED ? 'checking' : 'disabled',
  );

  useEffect(() => {
    if (!MISSION_LEARNING_ENABLED) return;
    let controller: AbortController | null = null;
    let needsRecovery = false;
    const check = () => {
      controller?.abort();
      const request = new AbortController();
      controller = request;
      setAvailability('checking');
      fetchMissionLearningHome(request.signal)
        .then((home) => {
          if (!request.signal.aborted) {
            needsRecovery = !home?.enabled;
            setAvailability(needsRecovery ? 'unavailable' : 'available');
          }
        })
        .catch(() => {
          if (!request.signal.aborted) { needsRecovery = true; setAvailability('unavailable'); }
        });
    };
    const recover = () => { if (needsRecovery) { needsRecovery = false; check(); } };
    const visible = () => { if (document.visibilityState === 'visible') recover(); };
    check();
    window.addEventListener('focus', recover);
    window.addEventListener('online', recover);
    document.addEventListener('visibilitychange', visible);
    return () => {
      controller?.abort();
      window.removeEventListener('focus', recover);
      window.removeEventListener('online', recover);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [retryKey]);

  return availability;
}
