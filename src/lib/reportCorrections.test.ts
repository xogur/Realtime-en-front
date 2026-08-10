import { describe, expect, it } from 'vitest';
import type { TopicSegment } from '@/lib/conversationTopics';
import {
  ABSOLUTE_CORRECTION_MAX,
  buildReportCorrections,
  getReportSampleStatus,
  paginateReportCorrections,
  TARGET_CORRECTION_MAX,
} from '@/lib/reportCorrections';
import type { ChatMessage, TurnEvaluation } from '@/stores/useStore';

function evaluation(
  id: string,
  original: string,
  options: Partial<TurnEvaluation['correction']> = {},
): TurnEvaluation {
  return {
    rubricVersion: 'speaking-v2',
    turnId: id,
    provider: 'test',
    model: 'test',
    createdAt: '2026-08-10T00:00:00.000Z',
    scores: { grammar: 70, vocabulary: 70, relevance: 70, fluency: 70, interaction: 70, overall: 70 },
    evidence: { grammar: '', vocabulary: '', relevance: '', fluency: '', interaction: '', overall: '' },
    feedback: { summary: '', strength: '', improvement: '', nextPractice: '' },
    cefrEstimate: { level: 'A2', reason: '' },
    correction: {
      original,
      suggested: `${original} corrected`,
      reason: '문맥에 맞게 고쳤습니다.',
      category: 'grammar',
      contextFit: 'appropriate',
      reportEligible: true,
      reportPriority: 'medium',
      meaningPreserved: true,
      ...options,
    },
    errorTags: ['verb_tense'],
    capabilities: { pronunciation: 'not_available' },
    confidence: 'high',
    confidenceReasons: [],
  };
}

function segment(segmentId = 'segment-travel'): TopicSegment {
  return {
    segmentId,
    topicId: 'travel',
    label: '여행',
    mode: 'guided_conversation',
    aiRole: 'guide',
    userRole: 'traveler',
    scenarioId: 'travel-test',
    scenarioTitle: '여행 대화',
    openingLine: 'Where did you go?',
    difficultyId: 'intermediate',
    difficultyLabel: '중급',
    sequence: 1,
    occurrence: 1,
    status: 'active',
    startedAt: '2026-08-10T00:00:00.000Z',
  };
}

function correctionMessages(
  count: number,
  options: Partial<TurnEvaluation['correction']> = {},
): ChatMessage[] {
  return Array.from({ length: count }, (_, index) => {
    const id = `turn-${String(index + 1).padStart(2, '0')}`;
    const original = `I go to place number ${index + 1} yesterday.`;
    return {
      id,
      role: 'user' as const,
      content: original,
      segmentId: 'segment-travel',
      evaluation: evaluation(id, original, {
        suggested: `I went to place number ${index + 1} yesterday.`,
        ...options,
      }),
    };
  });
}

describe('buildReportCorrections', () => {
  it('does not treat a natural short direct answer as a legacy correction candidate', () => {
    const answer = 'Yes, I do.';
    const legacy = evaluation('short', answer, {
      suggested: 'Yes, I do, because I enjoy it very much.',
      category: undefined,
      contextFit: undefined,
      reportEligible: undefined,
      reportPriority: undefined,
      meaningPreserved: undefined,
    });

    expect(buildReportCorrections([
      { role: 'assistant', content: 'Do you enjoy reading?' },
      { id: 'short', role: 'user', content: answer, evaluation: legacy },
    ], [])).toEqual([]);
  });

  it('keeps a short answer when it has a real contextual grammar error', () => {
    const answer = 'I goes.';
    const corrections = buildReportCorrections([
      { role: 'assistant', content: 'Who goes there?' },
      { id: 'grammar', role: 'user', content: answer, evaluation: evaluation('grammar', answer, { suggested: 'I go.' }) },
    ], []);

    expect(corrections).toHaveLength(1);
    expect(corrections[0].suggested).toBe('I go.');
  });

  it('uses the previous assistant question from the same topic segment', () => {
    const answer = 'I go there yesterday.';
    const messages: ChatMessage[] = [
      { role: 'assistant', content: 'Where did you travel?', segmentId: 'segment-travel' },
      { role: 'assistant', content: 'What food do you like?', segmentId: 'segment-food' },
      { id: 'travel-answer', role: 'user', content: answer, segmentId: 'segment-travel', evaluation: evaluation('travel-answer', answer, { suggested: 'I went there yesterday.' }) },
    ];

    const [correction] = buildReportCorrections(messages, [segment()]);

    expect(correction).toMatchObject({
      assistantPrompt: 'Where did you travel?',
      topic: '여행',
      difficulty: '중급',
    });
  });

  it('keeps structured learner-friendly explanations for the printed report', () => {
    const answer = 'I go there yesterday.';
    const [correction] = buildReportCorrections([
      { role: 'assistant', content: 'Where did you go yesterday?' },
      {
        id: 'explained',
        role: 'user',
        content: answer,
        evaluation: evaluation('explained', answer, {
          suggested: 'I went there yesterday.',
          reason: '과거 경험에 맞게 동사 시제를 고쳤습니다.',
          problem: 'yesterday가 있는데 현재형 go를 사용했습니다.',
          usageGuide: '끝난 일에는 go의 과거형 went를 사용합니다.',
          contextReason: '어제 어디에 갔는지 묻는 질문이므로 과거형이 필요합니다.',
        }),
      },
    ], []);

    expect(correction).toMatchObject({
      problem: 'yesterday가 있는데 현재형 go를 사용했습니다.',
      usageGuide: '끝난 일에는 go의 과거형 went를 사용합니다.',
      contextReason: '어제 어디에 갔는지 묻는 질문이므로 과거형이 필요합니다.',
    });
  });

  it('prints every meaningful item when fewer than the target are available', () => {
    expect(buildReportCorrections(correctionMessages(8), [segment()])).toHaveLength(8);
    expect(buildReportCorrections(correctionMessages(13), [segment()])).toHaveLength(13);
  });

  it('normally selects 15 items but allows critical items up to 20', () => {
    const normal = buildReportCorrections(correctionMessages(25), [segment()]);
    const critical = buildReportCorrections(correctionMessages(25, {
      category: 'meaning_clarity',
      reportPriority: 'high',
    }), [segment()]);

    expect(normal).toHaveLength(TARGET_CORRECTION_MAX);
    expect(critical).toHaveLength(ABSOLUTE_CORRECTION_MAX);
  });

  it('returns selected corrections in conversation order', () => {
    const messages = correctionMessages(18, { category: 'meaning_clarity', reportPriority: 'high' });
    const corrections = buildReportCorrections(messages, [segment()]);

    expect(corrections.map((item) => item.conversationIndex)).toEqual(
      [...corrections.map((item) => item.conversationIndex)].sort((left, right) => left - right),
    );
  });
});

describe('short conversation report status', () => {
  it('marks one to three answers provisional and four to seven limited', () => {
    expect(getReportSampleStatus(2).kind).toBe('provisional');
    expect(getReportSampleStatus(5).kind).toBe('limited');
    expect(getReportSampleStatus(8).kind).toBe('standard');
  });
});

describe('paginateReportCorrections', () => {
  it('keeps every correction while creating dynamic pages', () => {
    const corrections = buildReportCorrections(correctionMessages(20, {
      category: 'comprehension',
      reportPriority: 'high',
    }), [segment()]);
    const pages = paginateReportCorrections(corrections, 500);

    expect(pages.length).toBeGreaterThan(1);
    expect(pages.flat()).toEqual(corrections);
  });
});
