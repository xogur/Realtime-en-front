import { describe, expect, it } from 'vitest';

import { withObjectParticle } from './StoryAvatarPanel';

describe('story title object particle', () => {
  it('uses 을 after a final consonant and 를 otherwise', () => {
    expect(withObjectParticle('죄와 벌')).toBe('죄와 벌을');
    expect(withObjectParticle('걸리버 여행기: 소인국')).toBe('걸리버 여행기: 소인국을');
    expect(withObjectParticle('오디세이아')).toBe('오디세이아를');
    expect(withObjectParticle('Odyssey')).toBe('Odyssey를');
  });
});
