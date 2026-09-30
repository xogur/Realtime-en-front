import { afterEach, describe, expect, it } from 'vitest';
import { getLearningHomeApiUrl } from './api';

afterEach(() => {
  delete process.env.NEXT_PUBLIC_WS_URL;
});

describe('learning API URL', () => {
  it('reuses the configured backend origin without adding configuration', () => {
    process.env.NEXT_PUBLIC_WS_URL = 'wss://voice.example.com/ws?kioskId=A02';
    expect(getLearningHomeApiUrl()).toBe('https://voice.example.com/api/learning/home');
    expect(getLearningHomeApiUrl('A 02')).toBe('https://voice.example.com/api/kiosks/A%2002/learning/home');
  });
});
