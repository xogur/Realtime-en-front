export const CONVERSATION_DIFFICULTIES = [
  {
    id: 'beginner',
    label: '초급',
    description: '짧고 쉬운 문장으로 천천히, 또박또박 말해요.',
  },
  {
    id: 'intermediate',
    label: '중급',
    description: '자연스러운 표현을 사용하고 조금 여유 있게 대화해요.',
  },
  {
    id: 'advanced',
    label: '고급',
    description: '실제 대화처럼 자연스러운 속도와 다양한 표현을 사용해요.',
  },
] as const;

export type DifficultyId = typeof CONVERSATION_DIFFICULTIES[number]['id'];

export function isDifficultyId(value: unknown): value is DifficultyId {
  return CONVERSATION_DIFFICULTIES.some((difficulty) => difficulty.id === value);
}

export function getConversationDifficulty(difficultyId?: DifficultyId | null) {
  return CONVERSATION_DIFFICULTIES.find((difficulty) => difficulty.id === difficultyId);
}
