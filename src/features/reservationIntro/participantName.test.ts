import { describe, expect, it } from 'vitest';
import {
  classifyConfirmation,
  CONFIRMATION_KEYWORDS,
  CORRECTION_KEYWORDS,
  extractSpokenName,
  isPlausibleSpokenName,
  normalizeSpokenName,
} from './participantName';

describe('participant name speech parsing', () => {
  it('removes common Korean introductions and endings', () => {
    expect(normalizeSpokenName('제 이름은 김민수입니다.')).toBe('김민수');
    expect(normalizeSpokenName('닉네임은   Sunny 라고 해요')).toBe('Sunny');
    expect(normalizeSpokenName('저는 지수예요')).toBe('지수');
    expect(normalizeSpokenName('내 이름은 권태혁이라고 해')).toBe('권태혁');
    expect(normalizeSpokenName('저를 태혁이라고 불러 주세요')).toBe('태혁');
    expect(normalizeSpokenName('권태혁이라고 합니다')).toBe('권태혁');
    expect(normalizeSpokenName('저는 지수야')).toBe('지수');
    expect(normalizeSpokenName('마야')).toBe('마야');
  });

  it('accepts human names but rejects unsafe or mistaken transcripts', () => {
    expect(isPlausibleSpokenName('Mary Jane')).toBe(true);
    expect(isPlausibleSpokenName("Anne-Marie")).toBe(true);
    expect(isPlausibleSpokenName('김민수123')).toBe(false);
    expect(isPlausibleSpokenName('<script>')).toBe(false);
    expect(isPlausibleSpokenName('😊')).toBe(false);
  });

  it.each([
    ['권태혁', '권태혁'],
    ['권태혁이라고', '권태혁'],
    ['권태혁이라고 해', '권태혁'],
    ['권태혁이라고 해줘', '권태혁'],
    ['권태혁이라고 불러줘', '권태혁'],
    ['권태혁이라고 불러줘요', '권태혁'],
    ['권태혁으로 불러줘', '권태혁'],
    ['권태혁입니다', '권태혁'],
    ['권태혁이에요', '권태혁'],
    ['지수예요', '지수'],
    ['권태혁이요', '권태혁'],
    ['나는 권태혁이야', '권태혁'],
    ['내 이름은 권태혁', '권태혁'],
    ['그냥 태혁이라고 불러', '태혁'],
    ['태혁이라고 부르면 돼', '태혁'],
    ['내 이름 말이야, 권태혁이야', '권태혁'],
    ['내 이름은 권태혁 이라고 하고, 아마 그렇게 불러주면 될 거 같아.', '권태혁'],
    ['제 이름은 김민수라고 하고 그렇게 불러주시면 될 것 같아요', '김민수'],
    ['나는 태혁이라고 하고 그냥 그렇게 불러주면 돼', '태혁'],
    ['권태혁이라고 하고 아마 그렇게 불러주면 될 거 같아', '권태혁'],
    ['저를 태혁이라고 불러 주세요', '태혁'],
    ['마야', '마야'],
    ['Mary Jane', 'Mary Jane'],
  ])('extracts only the name from %s', (spoken, expected) => {
    expect(extractSpokenName(spoken)?.name).toBe(expected);
  });

  it.each([
    '오늘 날씨가 정말 좋아요',
    '그냥 편하게 불러주세요',
    '잘 못 들었어요 다시 말할게요',
    '내 이름은 권태혁이라고 하고 오늘 날씨가 좋아',
  ])('rejects a sentence that is not a name: %s', (spoken) => {
    expect(extractSpokenName(spoken)).toBeNull();
  });

  it('classifies varied natural confirmation and correction phrases', () => {
    expect(classifyConfirmation('네.')).toBe('yes');
    expect(classifyConfirmation('맞아요')).toBe('yes');
    expect(classifyConfirmation('오케이, 그렇게 해줘')).toBe('yes');
    expect(classifyConfirmation('응 맞아')).toBe('yes');
    expect(classifyConfirmation('알겠습니다')).toBe('yes');
    expect(classifyConfirmation('아니요')).toBe('no');
    expect(classifyConfirmation('그거 아니야')).toBe('no');
    expect(classifyConfirmation('아닌데요 다시 말할게')).toBe('no');
    expect(classifyConfirmation('수정해줘')).toBe('no');
    expect(classifyConfirmation('김민수')).toBe('unknown');
    expect(classifyConfirmation('이름은 김민수예요')).toBe('no');
  });

  it('recognizes every supported confirmation and correction keyword', () => {
    for (const keyword of CONFIRMATION_KEYWORDS) {
      expect(classifyConfirmation(keyword), `confirmation: ${keyword}`).toBe('yes');
    }
    for (const keyword of CORRECTION_KEYWORDS) {
      expect(classifyConfirmation(keyword), `correction: ${keyword}`).toBe('no');
    }
  });

  it('gives correction phrases priority over confirmations', () => {
    expect(classifyConfirmation('아니고 권태혁이 맞아')).toBe('no');
    expect(classifyConfirmation('내 이름은 김민수라고 해')).toBe('no');
  });
});
