import { describe, expect, it } from 'vitest';
import {
  CORE_ASSESSMENT_METRICS,
  getFriendlySpeakingLevel,
  getMetricPresentation,
  getSessionReportSummary,
} from './assessmentPresentation';
import type { TurnEvaluation } from '@/stores/useStore';

describe('assessment presentation', () => {
  it('exposes only the three learner-facing metrics', () => {
    expect(CORE_ASSESSMENT_METRICS.map((metric) => metric.label)).toEqual([
      '문장 정확성',
      '어휘 선택',
      '질문·문맥 대응',
    ]);
  });

  it('maps CEFR codes to plain Korean speaking levels', () => {
    expect(getFriendlySpeakingLevel('A2').label).toBe('기초 회화');
    expect(getFriendlySpeakingLevel('B1').label).toBe('일상 대화');
    expect(getFriendlySpeakingLevel('C1').label).toBe('능숙한 대화');
    expect(getFriendlySpeakingLevel('--').label).toBe('분석 중');
  });

  it('turns a score into a five-segment qualitative presentation', () => {
    expect(getMetricPresentation(76)).toMatchObject({ label: '안정적', activeSegments: 4 });
    expect(getMetricPresentation(54)).toMatchObject({ label: '기초 다지는 중', activeSegments: 3 });
    expect(getMetricPresentation(0)).toMatchObject({ label: '연습 시작', activeSegments: 0 });
  });
});

function evaluation(id: string, level: string, grammar: number, confidence = 'high'): TurnEvaluation {
  return {
    rubricVersion: 'speaking-v2', turnId: id, provider: 'test', model: 'test', createdAt: '',
    scores: { grammar, vocabulary: 75, relevance: 80, fluency: 70, interaction: 70, overall: 74 },
    evidence: { grammar: '시제 사용을 확인했습니다.', vocabulary: '', relevance: '질문에 맞게 답했습니다.', fluency: '', interaction: '', overall: '' },
    feedback: { summary: '', strength: '', improvement: '', nextPractice: '' },
    cefrEstimate: { level, reason: '' }, correction: { original: '', suggested: '', reason: '' },
    capabilities: { pronunciation: 'not_available' }, confidence, confidenceReasons: [],
  };
}

describe('session report summary', () => {
  it('does not declare a CEFR level from three or fewer reliable answers', () => {
    const summary = getSessionReportSummary([evaluation('1', 'A2', 60), evaluation('2', 'B1', 70)]);
    expect(summary.cefrLevel).toBe('--');
    expect(summary.cefrReason).toContain('관찰 중');
  });

  it('uses the whole reliable session and excludes low-confidence turns', () => {
    const summary = getSessionReportSummary([
      evaluation('1', 'A2', 50), evaluation('2', 'A2', 60), evaluation('3', 'B1', 70),
      evaluation('4', 'B1', 80), evaluation('noise', 'C2', 100, 'low'),
    ]);
    expect(summary.reliableTurnCount).toBe(4);
    expect(summary.cefrLevel).toBe('A2');
    expect(summary.metricAverages.find((metric) => metric.key === 'grammar')?.value).toBe(65);
  });
});
