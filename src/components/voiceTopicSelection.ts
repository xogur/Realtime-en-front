import type { DifficultyId } from '@/lib/conversationDifficulties';
import type { TopicId } from '@/lib/conversationTopics';
import type { ConversationMode } from './ModeSelector';

const DIFFICULTY_KEYWORDS: Record<DifficultyId, readonly string[]> = {
  beginner: ['초급', '기초', '입문', '쉬운', '쉽게', '쉬워', '쉬움', 'beginner', 'easy'],
  intermediate: ['중급', '중간', '보통', 'intermediate', 'medium'],
  advanced: ['고급', '상급', '어려운', '어렵게', '어려워', '어려움', 'advanced', 'hard'],
};

const TOPIC_KEYWORDS: Record<TopicId, readonly string[]> = {
  travel: ['여행', '관광', 'travel', 'trip'],
  restaurant: ['음식점', '식당', '레스토랑', '음식 주문', '주문 상황', '음식', 'restaurant'],
  airport: ['공항', '체크인', '비행기', '탑승', 'airport'],
  hobby: ['취미', 'hobby', 'hobbies'],
  school: ['학교', '학교생활', 'school'],
  family: ['가족', 'family'],
  daily: ['일상', '기타', '자유 대화', '자유대화', '프리 토킹', '프리토킹', '아무거나', 'free talk', 'daily'],
};

// Numbers follow the visible card order, including the roleplay section first.
export const DIFFICULTY_VOICE_ORDER: readonly DifficultyId[] = ['beginner', 'intermediate', 'advanced'];
export const TOPIC_VOICE_ORDER: readonly TopicId[] = ['restaurant', 'airport', 'travel', 'hobby', 'school', 'family', 'daily'];

function normalize(text: string) {
  return text
    .toLocaleLowerCase('ko-KR')
    .replace(/[.,!?~·…'"“”‘’()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findChoice<T extends string>(
  text: string,
  dictionary: Record<T, readonly string[]>,
): T | null {
  const compact = text.replace(/\s+/g, '');
  const matches = new Set<T>();
  for (const [value, keywords] of Object.entries(dictionary) as [T, readonly string[]][]) {
    for (const keyword of keywords) {
      if (/^[a-z ]+$/.test(keyword) && !new RegExp(`\\b${keyword.replace(/ /g, '\\s+')}\\b`).test(text)) continue;
      const term = keyword.replace(/\s+/g, '');
      let index = compact.indexOf(term);
      while (index >= 0) {
        const suffix = compact.slice(index + term.length);
        const negated = /^(?:단계|난이도|건|거|것|걸)?(?:은|는|이|가|으로|로)?(?:말고|아니|싫|안할|제외)/.test(suffix);
        const coveredByLongerKeyword = keywords.some((other) => {
          const longer = other.replace(/\s+/g, '');
          return longer.length > term.length && compact.startsWith(longer, index);
        });
        if (!negated && !coveredByLongerKeyword) matches.add(value);
        index = compact.indexOf(term, index + term.length);
      }
    }
  }
  // Listing alternatives is not a choice. Ask again instead of picking the last.
  return matches.size === 1 ? [...matches][0] : null;
}

function spokenNumber(text: string): number | null {
  if (/^[1-7]$/.test(text)) return Number(text);
  const match = text.replace(/\s+/g, '').match(/^(?:저는|저|그럼)?([1-7]|일|이|삼|사|오|육|칠|첫|두|세|네|다섯|여섯|일곱)(?:번째|번)(?:으로|로|이요|요)?(?:할게요|해주세요|선택할게요|선택)?$/);
  if (!match) return null;
  const numbers: Record<string, number> = { 일: 1, 이: 2, 삼: 3, 사: 4, 오: 5, 육: 6, 칠: 7, 첫: 1, 두: 2, 세: 3, 네: 4, 다섯: 5, 여섯: 6, 일곱: 7 };
  return numbers[match[1]] ?? Number(match[1]);
}

export function parseSpokenModeSelection(text: string): ConversationMode | null {
  const normalized = normalize(text);
  const number = spokenNumber(normalized);
  if (number) return number === 1 ? 'free_talk' : number === 2 ? 'learning' : number === 3 ? 'story' : null;
  return findChoice(normalized, {
    free_talk: ['프리토킹', '자유 대화', '자유롭게 대화', 'free talk', 'free talking'],
    learning: ['학습모드', '학습', 'learning mode', 'learning'],
    story: ['이야기 듣기', '이야기', '동화', '스토리', 'story'],
  });
}

export function parseSpokenConversationSelection(text: string, stage?: 'difficulty' | 'topic'): {
  difficultyId: DifficultyId | null;
  topicId: TopicId | null;
} {
  const normalized = normalize(text);
  const number = spokenNumber(normalized);
  return {
    difficultyId: stage === 'difficulty' && number ? DIFFICULTY_VOICE_ORDER[number - 1] ?? null : findChoice(normalized, DIFFICULTY_KEYWORDS),
    topicId: stage === 'topic' && number ? TOPIC_VOICE_ORDER[number - 1] ?? null : findChoice(normalized, TOPIC_KEYWORDS),
  };
}

export function parseDirectSpokenDifficultySelection(text: string): DifficultyId | null {
  const normalized = normalize(text);
  const candidates = [
    normalized,
    normalized.replace(/(?:으로|로|이요|요)$/u, '').trim(),
  ];
  for (const [difficultyId, keywords] of Object.entries(DIFFICULTY_KEYWORDS) as [
    DifficultyId,
    readonly string[],
  ][]) {
    if (candidates.some((candidate) => keywords.includes(candidate))) return difficultyId;
  }
  return null;
}
