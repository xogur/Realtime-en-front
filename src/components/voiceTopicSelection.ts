import type { DifficultyId } from '@/lib/conversationDifficulties';
import type { TopicId } from '@/lib/conversationTopics';

const DIFFICULTY_KEYWORDS: Record<DifficultyId, readonly string[]> = {
  beginner: ['초급', '기초', '입문', '쉬운 단계', '쉬운 거', '쉬운 걸로', '쉬운걸로'],
  intermediate: ['중급', '중간 단계', '보통 단계', '보통으로'],
  advanced: ['고급', '상급', '어려운 단계', '어려운 거', '어려운걸로'],
};

const TOPIC_KEYWORDS: Record<TopicId, readonly string[]> = {
  travel: ['여행'],
  restaurant: ['음식점', '식당', '레스토랑', '음식 주문', '주문 상황'],
  airport: ['공항', '체크인', '비행기'],
  hobby: ['취미'],
  school: ['학교'],
  family: ['가족'],
  daily: ['일상', '기타', '자유 대화', '자유대화', '프리 토킹', '프리토킹', '아무거나'],
};

function normalize(text: string) {
  return text
    .toLocaleLowerCase('ko-KR')
    .replace(/[.,!?~·…'"“”‘’()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findLastMatch<T extends string>(
  text: string,
  dictionary: Record<T, readonly string[]>,
): T | null {
  let match: { value: T; index: number } | null = null;
  for (const [value, keywords] of Object.entries(dictionary) as [T, readonly string[]][]) {
    for (const keyword of keywords) {
      const index = text.lastIndexOf(keyword);
      if (index >= 0 && (!match || index > match.index)) match = { value, index };
    }
  }
  return match?.value ?? null;
}

export function parseSpokenConversationSelection(text: string): {
  difficultyId: DifficultyId | null;
  topicId: TopicId | null;
} {
  const normalized = normalize(text);
  return {
    difficultyId: findLastMatch(normalized, DIFFICULTY_KEYWORDS),
    topicId: findLastMatch(normalized, TOPIC_KEYWORDS),
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
