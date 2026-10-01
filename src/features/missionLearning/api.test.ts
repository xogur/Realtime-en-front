import { afterEach, describe, expect, it, vi } from 'vitest';

import { assessPronunciation, getKioskMissionLearningUrl, getMissionLearningHomeApiUrl, parseMissionLearningHome } from './api';
import { resolveMissionLearningEnabled } from './config';

describe('mission learning config', () => {
  it('stays hidden unless explicitly true', () => {
    expect(resolveMissionLearningEnabled({})).toBe(false);
    expect(resolveMissionLearningEnabled({ NEXT_PUBLIC_MISSION_LEARNING_ENABLED: 'false' })).toBe(false);
    expect(resolveMissionLearningEnabled({ NEXT_PUBLIC_MISSION_LEARNING_ENABLED: '1' })).toBe(false);
    expect(resolveMissionLearningEnabled({ NEXT_PUBLIC_MISSION_LEARNING_ENABLED: ' TRUE ' })).toBe(true);
  });
});

describe('mission learning home api', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('derives the HTTP endpoint from the websocket origin', () => {
    vi.stubEnv('NEXT_PUBLIC_WS_URL', 'wss://voice.example.com/ws?kioskId=A01');
    expect(getMissionLearningHomeApiUrl()).toBe('https://voice.example.com/api/mission-learning/home');
    vi.stubEnv('NEXT_PUBLIC_WS_URL', 'ws://localhost:18013/ws');
    expect(getMissionLearningHomeApiUrl()).toBe('http://localhost:18013/api/mission-learning/home');
  });

  it('accepts only the expected response shape', () => {
    expect(parseMissionLearningHome({ enabled: true, contractVersion: 1, missions: [] }))
      .toEqual({ enabled: true, contractVersion: 1 });
    expect(parseMissionLearningHome({ enabled: 'true', contractVersion: 1 })).toBeNull();
    expect(parseMissionLearningHome({ enabled: true })).toBeNull();
    expect(parseMissionLearningHome(null)).toBeNull();
  });
});

describe('pronunciation upload', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('keeps the expression id as a query, not an encoded part of the path', () => {
    vi.stubEnv('NEXT_PUBLIC_WS_URL', 'ws://localhost:18013/ws');
    expect(getKioskMissionLearningUrl('/sessions/s1/pronunciation?expressionId=please_short', 'A04'))
      .toBe('http://localhost:18013/api/kiosks/A04/mission-learning/sessions/s1/pronunciation?expressionId=please_short');
  });

  it('posts the WAV with its own content type', async () => {
    vi.stubEnv('NEXT_PUBLIC_WS_URL', 'ws://localhost:18013/ws');
    const snapshot = { type: 'learning_mission_state', sessionId: 's1', revision: 9, stage: 'SUMMARY', allowedActions: [] };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      result: { status: 'OK', band: 'GREAT', labelKo: '아주 좋아요!', messageKo: '' }, snapshot,
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const wav = new Blob(['x'], { type: 'audio/wav' });
    const { result } = await assessPronunciation('s1', 'please_short', wav);
    expect(result.band).toBe('GREAT');
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/sessions/s1/pronunciation?expressionId=please_short');
    expect(init.headers).toEqual({ 'Content-Type': 'audio/wav' });
    expect(init.body).toBe(wav);
  });
});
