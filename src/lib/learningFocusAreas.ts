import type { ReportCorrectionItem } from '@/lib/reportCorrections';
import type { ChatMessage, TurnEvaluation } from '@/stores/useStore';

export type LearningFocusAreaId =
  | 'sentence_accuracy'
  | 'vocabulary_use'
  | 'context_response'
  | 'sentence_flow'
  | 'interaction';

export type LearningFocusArea = {
  id: LearningFocusAreaId;
  label: string;
  description: string;
  statusLabel: '관찰 필요' | '우선 보완';
  averageScore: number;
  sampleCount: number;
  evidenceCount: number;
  explanation: string;
  evidence: string[];
  correctionNumbers: number[];
};

type MetricKey = keyof Pick<
  TurnEvaluation['scores'],
  'grammar' | 'vocabulary' | 'relevance' | 'fluency' | 'interaction'
>;

type FocusDefinition = {
  id: LearningFocusAreaId;
  label: string;
  description: string;
  metric: MetricKey;
  metricLabel: string;
  tags: Set<string>;
  correctionCategories: Set<ReportCorrectionItem['category']>;
};

const DEFINITIONS: FocusDefinition[] = [
  {
    id: 'sentence_accuracy',
    label: '문장 정확성',
    description: '시제, 관사, 전치사와 문장 구조를 정확한 형태로 만드는 능력입니다.',
    metric: 'grammar',
    metricLabel: '문법',
    tags: new Set(['article', 'verb_tense', 'subject_verb_agreement', 'preposition', 'plural', 'pronoun']),
    correctionCategories: new Set(['grammar']),
  },
  {
    id: 'vocabulary_use',
    label: '어휘 선택과 활용',
    description: '문맥에 맞는 단어와 자연스러운 단어 조합을 선택하는 능력입니다.',
    metric: 'vocabulary',
    metricLabel: '어휘',
    tags: new Set(['word_choice']),
    correctionCategories: new Set(['vocabulary']),
  },
  {
    id: 'context_response',
    label: '질문 이해와 문맥 대응',
    description: '질문의 핵심을 파악하고 앞선 대화와 의도에 맞춰 답하는 능력입니다.',
    metric: 'relevance',
    metricLabel: '응답 적합도',
    tags: new Set(),
    correctionCategories: new Set(['comprehension', 'meaning_clarity']),
  },
  {
    id: 'sentence_flow',
    label: '문장 구성과 흐름',
    description: '주어와 동사를 갖춘 문장을 만들고 생각을 자연스럽게 연결하는 능력입니다.',
    metric: 'fluency',
    metricLabel: '문장 완성도',
    tags: new Set(['sentence_fragment', 'word_order', 'connector']),
    correctionCategories: new Set(['naturalness']),
  },
  {
    id: 'interaction',
    label: '대화 이어가기',
    description: '답변을 적절히 확장하고 상대와 대화를 이어 가는 능력입니다.',
    metric: 'interaction',
    metricLabel: '상호작용',
    tags: new Set(),
    correctionCategories: new Set(),
  },
];

function cleanEvidence(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function getReliableMessages(messages: ChatMessage[]): Array<ChatMessage & { evaluation: TurnEvaluation }> {
  return messages.filter((message): message is ChatMessage & { evaluation: TurnEvaluation } => (
    message.role === 'user'
    && Boolean(message.evaluation)
    && message.evaluation?.confidence.toLowerCase() !== 'low'
  ));
}

function correctionMatches(definition: FocusDefinition, correction: ReportCorrectionItem): boolean {
  if (definition.correctionCategories.has(correction.category)) return true;
  if (definition.id !== 'context_response') return false;
  const evaluationContext = correction.contextReason.toLowerCase();
  return correction.category === 'meaning_clarity'
    || /질문|문맥|의도|핵심/.test(evaluationContext);
}

export function buildLearningFocusAreas(
  messages: ChatMessage[],
  corrections: ReportCorrectionItem[],
): LearningFocusArea[] {
  const reliableMessages = getReliableMessages(messages);
  const sampleCount = reliableMessages.length;
  if (sampleCount < 4) return [];

  const correctionNumberById = new Map(corrections.map((item, index) => [item.id, index + 1]));

  return DEFINITIONS.map((definition) => {
    const scores = reliableMessages.map((message) => message.evaluation.scores[definition.metric]);
    const averageScore = Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
    const evidenceTurnIds = new Set<string>();
    const evidence: string[] = [];

    reliableMessages.forEach((message) => {
      const evaluation = message.evaluation;
      const turnId = message.id ?? evaluation.turnId;
      const hasTag = (evaluation.errorTags ?? []).some((tag) => definition.tags.has(tag));
      const matchingCorrection = corrections.find((correction) => (
        correction.id === turnId && correctionMatches(definition, correction)
      ));
      const contextMismatch = definition.id === 'context_response'
        && (evaluation.correction.contextFit === 'partial' || evaluation.correction.contextFit === 'off_topic');
      const lowMetricWithReason = evaluation.scores[definition.metric] <= 65
        && Boolean(cleanEvidence(evaluation.evidence[definition.metric]));

      if (hasTag || matchingCorrection || contextMismatch || lowMetricWithReason) {
        evidenceTurnIds.add(turnId);
      }

      const metricEvidence = cleanEvidence(evaluation.evidence[definition.metric]);
      if ((hasTag || contextMismatch || lowMetricWithReason) && metricEvidence && evidence.length < 2) {
        evidence.push(metricEvidence);
      }
      if (matchingCorrection && evidence.length < 2) {
        evidence.push(`“${matchingCorrection.original}”을 “${matchingCorrection.suggested}”로 교정했습니다.`);
      }
    });

    const correctionNumbers = corrections
      .filter((correction) => correctionMatches(definition, correction))
      .map((correction) => correctionNumberById.get(correction.id))
      .filter((value): value is number => typeof value === 'number');
    const evidenceCount = evidenceTurnIds.size;
    const qualifies = evidenceCount >= 2 && (averageScore < 72 || correctionNumbers.length >= 2);
    const severity = Math.max(0, 72 - averageScore) + evidenceCount * 3 + correctionNumbers.length * 2;

    return {
      definition,
      averageScore,
      evidenceCount,
      evidence: Array.from(new Set(evidence)).slice(0, 2),
      correctionNumbers: Array.from(new Set(correctionNumbers)),
      qualifies,
      severity,
    };
  })
    .filter((candidate) => candidate.qualifies)
    .sort((left, right) => right.severity - left.severity || left.averageScore - right.averageScore)
    .slice(0, 2)
    .map(({ definition, averageScore, evidenceCount, evidence, correctionNumbers }) => ({
      id: definition.id,
      label: definition.label,
      description: definition.description,
      statusLabel: sampleCount >= 8 ? '우선 보완' : '관찰 필요',
      averageScore,
      sampleCount,
      evidenceCount,
      explanation: `${sampleCount}개 신뢰 응답의 ${definition.metricLabel} 평균은 ${averageScore}점이며, 관련 신호가 ${evidenceCount}개 응답에서 확인되었습니다.`,
      evidence,
      correctionNumbers,
    }));
}
