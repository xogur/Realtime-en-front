export const CONVERSATION_TOPICS = [
  { id: 'travel', label: '여행', description: '여행 경험에 관해 대화해요', modeLabel: '자유 대화' },
  { id: 'restaurant', label: '음식점', description: '직원과 손님 상황극', modeLabel: '역할극' },
  { id: 'airport', label: '공항', description: '체크인 직원과 여행객 상황극', modeLabel: '역할극' },
  { id: 'hobby', label: '취미', description: '좋아하는 취미를 이야기해요', modeLabel: '자유 대화' },
  { id: 'school', label: '학교', description: '학교생활과 과목에 관해 대화해요', modeLabel: '자유 대화' },
  { id: 'family', label: '가족', description: '가족을 영어로 소개해요', modeLabel: '자유 대화' },
  { id: 'daily', label: '일상(기타)', description: '주제 없이 자유롭게 대화해요', modeLabel: '프리토킹' },
] as const;

export type TopicId = typeof CONVERSATION_TOPICS[number]['id'];

export type TopicSegment = {
  segmentId: string;
  topicId: TopicId;
  label: string;
  mode: 'guided_conversation' | 'roleplay' | 'free_talk';
  aiRole: string;
  userRole: string;
  sequence: number;
  occurrence: number;
  status: 'active' | 'paused' | 'ended' | 'failed';
  startedAt: string;
  endedAt?: string;
};

export function isTopicId(value: unknown): value is TopicId {
  return CONVERSATION_TOPICS.some((topic) => topic.id === value);
}

export function getConversationTopic(topicId?: TopicId | null) {
  return CONVERSATION_TOPICS.find((topic) => topic.id === topicId);
}
