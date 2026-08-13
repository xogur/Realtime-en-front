import type { ChatMessage, TurnEvaluation } from '@/stores/useStore';

type EvidenceMetricKey = 'grammar' | 'vocabulary' | 'relevance';

export type ReportMetric = {
  key: string;
  label: string;
  value: number;
};

export type ReportFindingEvidenceItem = {
  quote: string;
  reason: string;
};

export type ReportFindingEvidence = {
  explanation: string;
  items: ReportFindingEvidenceItem[];
};

export type ReportFindingEvidenceSummary = {
  strength: ReportFindingEvidence;
  improvement: ReportFindingEvidence;
};

const EVIDENCE_METRIC_KEYS = new Set<EvidenceMetricKey>(['grammar', 'vocabulary', 'relevance']);

function isEvidenceMetricKey(key: string): key is EvidenceMetricKey {
  return EVIDENCE_METRIC_KEYS.has(key as EvidenceMetricKey);
}

function clean(value: string | null | undefined): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function reliableUserMessages(messages: ChatMessage[]): Array<ChatMessage & { evaluation: TurnEvaluation }> {
  return messages.filter((message): message is ChatMessage & { evaluation: TurnEvaluation } => (
    message.role === 'user'
    && Boolean(message.evaluation)
    && message.evaluation?.confidence.toLowerCase() !== 'low'
    && clean(message.content).length > 0
  ));
}

function rankedEvidenceItems(
  messages: Array<ChatMessage & { evaluation: TurnEvaluation }>,
  metric: ReportMetric,
  direction: 'highest' | 'lowest',
): ReportFindingEvidenceItem[] {
  if (!isEvidenceMetricKey(metric.key)) return [];
  const metricKey = metric.key;

  return [...messages]
    .sort((left, right) => {
      const difference = left.evaluation.scores[metricKey] - right.evaluation.scores[metricKey];
      return direction === 'highest' ? -difference : difference;
    })
    .slice(0, 2)
    .map((message) => {
      const evaluation = message.evaluation;
      const score = Math.round(evaluation.scores[metricKey]);
      const reason = direction === 'highest'
        ? clean(evaluation.evidence[metricKey]) || clean(evaluation.feedback.strength)
        : clean(evaluation.evidence[metricKey])
          || clean(evaluation.correction.reason)
          || clean(evaluation.feedback.improvement);

      return {
        quote: clean(message.content),
        reason: reason || `${metric.label} 항목에서 ${score}점으로 평가된 답변입니다.`,
      };
    });
}

function metricExplanation(metrics: ReportMetric[], metric: ReportMetric, direction: 'highest' | 'lowest', sampleCount: number): string {
  const sameScoreLabels = metrics
    .filter((candidate) => Math.round(candidate.value) === Math.round(metric.value))
    .map((candidate) => candidate.label);
  const position = direction === 'highest' ? '가장 높아 강점으로 선정했습니다' : '가장 낮아 우선 보완점으로 선정했습니다';
  const tieLabel = sameScoreLabels.length > 1 ? '공동으로 ' : '';
  return `${sampleCount}개 신뢰 응답에서 ${sameScoreLabels.join('·')} 평균이 ${Math.round(metric.value)}점으로 ${tieLabel}${position}.`;
}

export function buildReportFindingEvidence(
  messages: ChatMessage[],
  metrics: ReportMetric[],
): ReportFindingEvidenceSummary {
  const reliableMessages = reliableUserMessages(messages);
  const supportedMetrics = metrics.filter((metric) => isEvidenceMetricKey(metric.key) && Number.isFinite(metric.value));

  if (supportedMetrics.length === 0 || reliableMessages.length === 0) {
    return {
      strength: {
        explanation: '신뢰할 수 있는 항목별 평가가 충분하지 않아 강점 근거를 확정하지 않았습니다.',
        items: [],
      },
      improvement: {
        explanation: '반복된 약점으로 판단할 평가 근거가 충분하지 않아 다음 대화에서 더 관찰합니다.',
        items: [],
      },
    };
  }

  const strongest = [...supportedMetrics].sort((left, right) => right.value - left.value)[0];
  const weakest = [...supportedMetrics].sort((left, right) => left.value - right.value)[0];

  return {
    strength: {
      explanation: metricExplanation(supportedMetrics, strongest, 'highest', reliableMessages.length),
      items: rankedEvidenceItems(reliableMessages, strongest, 'highest'),
    },
    improvement: {
      explanation: metricExplanation(supportedMetrics, weakest, 'lowest', reliableMessages.length),
      items: rankedEvidenceItems(reliableMessages, weakest, 'lowest'),
    },
  };
}
