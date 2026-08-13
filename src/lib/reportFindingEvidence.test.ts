import { describe, expect, it } from 'vitest';
import type { ChatMessage, TurnEvaluation } from '@/stores/useStore';
import { buildReportFindingEvidence } from './reportFindingEvidence';

function evaluatedMessage(
  id: string,
  content: string,
  scores: TurnEvaluation['scores'],
  evidence: Partial<TurnEvaluation['evidence']> = {},
  confidence = 'high',
): ChatMessage {
  return {
    id,
    role: 'user',
    content,
    evaluation: {
      rubricVersion: 'speaking-v2',
      turnId: id,
      provider: 'test',
      model: 'test',
      createdAt: '2026-08-11T00:00:00.000Z',
      scores,
      evidence: { grammar: '', vocabulary: '', relevance: '', fluency: '', interaction: '', overall: '', ...evidence },
      feedback: { summary: '', strength: '', improvement: '', nextPractice: '' },
      cefrEstimate: { level: 'A2', reason: '' },
      correction: { original: content, suggested: content, reason: '교정 이유' },
      capabilities: { pronunciation: 'not_available' },
      confidence,
      confidenceReasons: [],
    },
  };
}

describe('buildReportFindingEvidence', () => {
  it('grounds the strongest and weakest metrics in actual reliable user answers', () => {
    const messages: ChatMessage[] = [
      { role: 'assistant', content: 'How was your trip?' },
      evaluatedMessage(
        'best',
        'I enjoyed the quiet beach because it was relaxing.',
        { grammar: 94, vocabulary: 86, relevance: 90, fluency: 88, interaction: 82, overall: 88 },
        { grammar: '과거 시제와 접속사를 정확하게 사용했습니다.' },
      ),
      evaluatedMessage(
        'weak',
        'I go there yesterday.',
        { grammar: 45, vocabulary: 82, relevance: 84, fluency: 60, interaction: 70, overall: 68 },
        { grammar: 'yesterday에 맞는 과거 시제가 필요합니다.' },
      ),
      evaluatedMessage(
        'low-confidence',
        'This transcript is uncertain.',
        { grammar: 100, vocabulary: 10, relevance: 10, fluency: 10, interaction: 10, overall: 10 },
        { grammar: '사용하면 안 되는 근거' },
        'low',
      ),
    ];

    const result = buildReportFindingEvidence(messages, [
      { key: 'grammar', label: '문장 정확성', value: 70 },
      { key: 'vocabulary', label: '어휘 선택', value: 84 },
      { key: 'relevance', label: '문맥 대응', value: 87 },
    ]);

    expect(result.strength.explanation).toContain('문맥 대응 평균이 87점');
    expect(result.strength.items.map((item) => item.quote)).toContain('I enjoyed the quiet beach because it was relaxing.');
    expect(result.improvement.explanation).toContain('문장 정확성 평균이 70점');
    expect(result.improvement.items[0]).toEqual({
      quote: 'I go there yesterday.',
      reason: 'yesterday에 맞는 과거 시제가 필요합니다.',
    });
    expect(JSON.stringify(result)).not.toContain('This transcript is uncertain.');
  });

  it('states that the evidence is insufficient instead of inventing examples', () => {
    const result = buildReportFindingEvidence(
      [{ role: 'user', content: 'I like coffee.' }],
      [{ key: 'grammar', label: '문장 정확성', value: 90 }],
    );

    expect(result.strength.items).toEqual([]);
    expect(result.strength.explanation).toContain('충분하지 않아');
    expect(result.improvement.items).toEqual([]);
  });
});
