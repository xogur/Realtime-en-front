import { describe, expect, it } from 'vitest';

import { relistenLabel, withObjectParticle } from './StoryAvatarPanel';

describe('story title object particle', () => {
  it('uses 을 after a final consonant and 를 otherwise', () => {
    expect(withObjectParticle('죄와 벌')).toBe('죄와 벌을');
    expect(withObjectParticle('걸리버 여행기: 소인국')).toBe('걸리버 여행기: 소인국을');
    expect(withObjectParticle('오디세이아')).toBe('오디세이아를');
    expect(withObjectParticle('Odyssey')).toBe('Odyssey를');
  });
});

describe('relisten button label', () => {
  it('names the help picked for hearing the chapter again', () => {
    expect(relistenLabel({ speed: 'normal', english: false, korean: false })).toBe('그대로 다시 듣기');
    expect(relistenLabel({ speed: 'slow', english: false, korean: true })).toBe('다시 듣기 (천천히 · 한국어 해석)');
    expect(relistenLabel({ speed: 'normal', english: true, korean: false })).toBe('다시 듣기 (영어 자막)');
  });
});
