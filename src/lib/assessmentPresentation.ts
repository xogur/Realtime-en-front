import type { TurnEvaluation } from '@/stores/useStore';

export type CoreAssessmentMetricKey = 'grammar' | 'vocabulary' | 'relevance';

export const CORE_ASSESSMENT_METRICS: ReadonlyArray<{
  key: CoreAssessmentMetricKey;
  label: string;
}> = [
  { key: 'grammar', label: '문장 정확성' },
  { key: 'vocabulary', label: '어휘 선택' },
  { key: 'relevance', label: '질문·문맥 대응' },
];

export type SessionReportSummary = {
  reliableTurnCount: number;
  cefrLevel: string;
  cefrReason: string;
  strength: string;
  improvement: string;
  metricAverages: Array<{ key: CoreAssessmentMetricKey; label: string; value: number }>;
};

const CEFR_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;

export function getSessionReportSummary(evaluations: TurnEvaluation[]): SessionReportSummary {
  const reliable = evaluations.filter((evaluation) => evaluation.confidence.toLowerCase() !== 'low');
  const metricAverages = CORE_ASSESSMENT_METRICS.map(({ key, label }) => ({
    key,
    label,
    value: reliable.length > 0
      ? Math.round(reliable.reduce((sum, evaluation) => sum + evaluation.scores[key], 0) / reliable.length)
      : 0,
  }));
  const strongest = [...metricAverages].sort((left, right) => right.value - left.value)[0];
  const weakest = [...metricAverages].sort((left, right) => left.value - right.value)[0];
  const orderedLevels = reliable
    .map((evaluation) => evaluation.cefrEstimate.level.toUpperCase())
    .filter((level): level is typeof CEFR_ORDER[number] => CEFR_ORDER.includes(level as typeof CEFR_ORDER[number]))
    .sort((left, right) => CEFR_ORDER.indexOf(left) - CEFR_ORDER.indexOf(right));
  const cefrLevel = reliable.length <= 3 || orderedLevels.length === 0
    ? '--'
    : orderedLevels[Math.floor((orderedLevels.length - 1) / 2)];
  return {
    reliableTurnCount: reliable.length,
    cefrLevel,
    cefrReason: reliable.length <= 3
      ? '답변이 1-3개라 수준을 단정하지 않고 관찰 중입니다.'
      : `${reliable.length}개 신뢰 응답의 중앙 수준과 일관성을 기준으로 추정했습니다.`,
    strength: strongest
      ? `${strongest.label}이 세션 평균 ${strongest.value}점으로 가장 안정적입니다.`
      : '평가 가능한 답변이 없습니다.',
    improvement: weakest
      ? `${weakest.label}은 세션 평균 ${weakest.value}점입니다. 아래 실제 교정 사례부터 확인하세요.`
      : '평가 가능한 답변이 없습니다.',
    metricAverages,
  };
}

export type FriendlySpeakingLevel = {
  label: string;
  description: string;
};

const FRIENDLY_LEVELS: Record<string, FriendlySpeakingLevel> = {
  A1: {
    label: '회화 첫걸음',
    description: '익숙한 단어와 짧은 문장으로 기본적인 뜻을 전하는 단계예요.',
  },
  A2: {
    label: '기초 회화',
    description: '익숙한 일상 주제에서 간단한 질문과 답변을 이어가는 단계예요.',
  },
  B1: {
    label: '일상 대화',
    description: '경험과 생각을 문장으로 연결해 일상 대화를 이어가는 단계예요.',
  },
  B2: {
    label: '자연스러운 대화',
    description: '다양한 주제에서 이유와 세부 내용을 비교적 자연스럽게 설명하는 단계예요.',
  },
  C1: {
    label: '능숙한 대화',
    description: '복잡한 생각도 상황에 맞는 표현으로 유연하고 정확하게 전달하는 단계예요.',
  },
  C2: {
    label: '매우 능숙한 대화',
    description: '미묘한 의미와 말투까지 조절하며 자유롭게 대화하는 단계예요.',
  },
};

export function getFriendlySpeakingLevel(level: string | null | undefined): FriendlySpeakingLevel {
  const normalized = String(level ?? '').trim().toUpperCase();
  return FRIENDLY_LEVELS[normalized] ?? {
    label: '분석 중',
    description: '대화를 조금 더 이어가면 현재 말하기 수준을 안내해 드려요.',
  };
}

export type MetricPresentation = {
  label: string;
  description: string;
  activeSegments: number;
};

export function getMetricPresentation(value: number): MetricPresentation {
  const score = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
  const activeSegments = score <= 0 ? 0 : Math.min(5, Math.ceil(score / 20));

  if (score >= 85) {
    return { label: '매우 안정적', description: '여러 답변에서 강점이 꾸준히 보여요.', activeSegments };
  }
  if (score >= 70) {
    return { label: '안정적', description: '대체로 잘 사용하고 있어요.', activeSegments };
  }
  if (score >= 55) {
    return { label: '성장 중', description: '조금만 더 연습하면 안정적으로 사용할 수 있어요.', activeSegments };
  }
  if (score >= 40) {
    return { label: '기초 다지는 중', description: '핵심 표현을 반복해서 익히면 좋아요.', activeSegments };
  }
  return { label: '연습 시작', description: '짧고 분명한 문장부터 차근차근 연습해 보세요.', activeSegments };
}
