import { TIMELINE_LOOKAHEAD_MS } from './constants';
import type { LipSyncMode, ScheduledTtsSegment, TimelineResolution } from './types';

function resolveSegmentCurrentTime(segment: ScheduledTtsSegment, contextTime: number) {
  if (segment.audioStartContextTime === undefined) {
    return null;
  }
  return (contextTime - segment.audioStartContextTime) * 1000;
}

export function resolveTimelineFrame(
  segments: Record<string, ScheduledTtsSegment>,
  contextTime: number | null,
): TimelineResolution {
  if (contextTime === null) {
    return {
      event: null,
      lookaheadEvent: null,
      segment: null,
      mode: 'heuristic',
      currentTimeMs: 0,
    };
  }

  const orderedSegments = Object.values(segments)
    .filter((segment) => segment.audioStartContextTime !== undefined)
    .sort((left, right) => (left.audioStartContextTime ?? 0) - (right.audioStartContextTime ?? 0));

  for (const segment of orderedSegments) {
    const currentTimeMs = resolveSegmentCurrentTime(segment, contextTime);
    if (currentTimeMs === null) continue;

    const endTimeMs =
      segment.audioEndContextTime !== undefined
        ? (segment.audioEndContextTime - (segment.audioStartContextTime ?? segment.audioEndContextTime)) * 1000
        : segment.timeline?.durationMs;

    if (endTimeMs !== undefined && currentTimeMs > endTimeMs + TIMELINE_LOOKAHEAD_MS) {
      continue;
    }

    const events = segment.timeline?.events ?? [];
    const event = events.find((item) => currentTimeMs >= item.startMs && currentTimeMs < item.endMs) ?? null;
    const lookaheadEvent =
      events.find(
        (item) =>
          currentTimeMs + TIMELINE_LOOKAHEAD_MS >= item.startMs &&
          currentTimeMs + TIMELINE_LOOKAHEAD_MS < item.endMs,
      ) ?? null;

    const mode: LipSyncMode = event ? 'timeline' : segment.timeline ? 'timeline' : 'heuristic';

    return {
      event,
      lookaheadEvent,
      segment,
      mode,
      currentTimeMs,
    };
  }

  return {
    event: null,
    lookaheadEvent: null,
    segment: null,
    mode: 'heuristic',
    currentTimeMs: 0,
  };
}
