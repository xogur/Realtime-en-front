import { describe, expect, it } from 'vitest';
import type { TopicSegment } from '@/lib/conversationTopics';
import {
  ABSOLUTE_CORRECTION_MAX,
  buildReportContent,
  buildReportCorrections,
  buildReportHighlights,
  getReportSampleStatus,
  paginateReportCorrections,
  TARGET_CORRECTION_MAX,
  TARGET_CORRECTION_MIN,
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

  it('rejects explicit style-only and politeness upgrades', () => {
    const examples = [
      evaluation('thanks', 'Thank you for the menu.', { suggested: 'Thank you for the menu. It looks great.', category: 'naturalness' }),
      evaluation('water', 'I want some water, please.', { suggested: 'Could I have some water, please?', category: 'naturalness' }),
      evaluation('chicken', 'Can I have some chicken?', { suggested: 'Could I have some chicken, please?', category: 'naturalness' }),
      evaluation('choice', 'I want chicken.', { suggested: 'I would like the chicken.', category: 'grammar' }),
      evaluation('choice-please', 'I want chicken with mashed potatoes.', { suggested: 'I would like the chicken with mashed potatoes, please.', category: 'grammar' }),
      evaluation('table', "No, I don't have a table.", { suggested: "No, we don't have a table reserved.", category: 'grammar' }),
    ].map((item) => ({ ...item, errorTags: [] }));

    const messages = examples.flatMap((item) => [
      { role: 'assistant' as const, content: 'What would you like?' },
      { id: item.turnId, role: 'user' as const, content: item.correction.original, evaluation: item },
    ]);

    expect(buildReportCorrections(messages, [])).toEqual([]);
  });

  it('rejects a reportEligible correction that adds unstated meaning', () => {
    const item = evaluation('invented', 'That sounds good.', {
      suggested: "That sounds good. I'll have the chicken, please.",
      category: 'meaning_clarity',
      decision: 'confirmed_error',
    });

    expect(buildReportCorrections([
      { role: 'assistant', content: 'The chicken is popular.' },
      { id: 'invented', role: 'user', content: 'That sounds good.', evaluation: { ...item, errorTags: [] } },
    ], [])).toEqual([]);
  });

  it('keeps a confirmed error with an exact observable span', () => {
    const item = evaluation('exact', 'I go there yesterday.', {
      suggested: 'I went there yesterday.',
      decision: 'confirmed_error',
      issueCode: 'verb_tense',
      errorSpan: 'go',
      correctedSpan: 'went',
    });
    const [correction] = buildReportCorrections([
      { role: 'assistant', content: 'Where did you go yesterday?' },
      { id: 'exact', role: 'user', content: item.correction.original, evaluation: { ...item, errorTags: [] } },
    ], []);

    expect(correction.issueCode).toBe('verb_tense');
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

  it('falls back to the nearest assistant response when segment metadata is missing', () => {
    const answer = 'I go there yesterday.';
    const messages: ChatMessage[] = [
      { role: 'assistant', content: 'Where did you go yesterday?' },
      {
        id: 'answer-with-segment',
        role: 'user',
        content: answer,
        segmentId: 'segment-travel',
        evaluation: evaluation('answer-with-segment', answer, { suggested: 'I went there yesterday.' }),
      },
    ];

    const [correction] = buildReportCorrections(messages, [segment()]);

    expect(correction.assistantPrompt).toBe('Where did you go yesterday?');
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

describe('buildReportHighlights', () => {
  it('fills an empty correction report with 13 to 15 real conversation highlights', () => {
    const messages: ChatMessage[] = Array.from({ length: 16 }, (_, index) => ({
      id: `good-turn-${index + 1}`,
      role: 'user',
      content: `I shared a clear idea about topic number ${index + 1}.`,
    }));

    const highlights = buildReportHighlights(messages, []);

    expect(highlights).toHaveLength(TARGET_CORRECTION_MAX);
    expect(highlights.every((item) => item.original === item.suggested)).toBe(true);
    expect(highlights.every((item) => item.errorTags.includes('report_highlight'))).toBe(true);
    expect(new Set(highlights.map((item) => item.original))).toHaveLength(TARGET_CORRECTION_MAX);
  });

  it('uses available conversation sentences without inventing filler when fewer than 13 exist', () => {
    const messages: ChatMessage[] = Array.from({ length: 5 }, (_, index) => ({
      id: `short-turn-${index + 1}`,
      role: 'user',
      content: `This is my useful sentence number ${index + 1}.`,
    }));

    expect(buildReportHighlights(messages, [])).toHaveLength(5);
  });

  it('keeps highlights tied to learner answers instead of filling the report with assistant-only expressions', () => {
    const messages: ChatMessage[] = Array.from({ length: 10 }, (_, index) => ([
      { role: 'assistant' as const, content: `How would you answer practice question ${index + 1}?` },
      { id: `learner-${index + 1}`, role: 'user' as const, content: `My clear answer is number ${index + 1}.` },
    ])).flat();

    const highlights = buildReportHighlights(messages, []);

    expect(highlights).toHaveLength(10);
    expect(highlights.every((item) => item.errorTags.includes('learner_sentence'))).toBe(true);
    expect(highlights.every((item) => !item.errorTags.includes('conversation_expression'))).toBe(true);
    expect(highlights[0]).toMatchObject({
      assistantPrompt: 'How would you answer practice question 1?',
      original: 'My clear answer is number 1.',
    });
  });

  it('does not praise an assistant-only transcript when the learner never answered', () => {
    const messages: ChatMessage[] = Array.from({ length: 15 }, (_, index) => ({
      role: 'assistant',
      content: `This is assistant prompt number ${index + 1}.`,
    }));

    expect(buildReportHighlights(messages, [])).toEqual([]);
  });

  it('does not praise low-confidence, off-topic, or explicitly corrected learner sentences', () => {
    const lowConfidence = evaluation('low', 'I shared a clear idea.', { suggested: '' });
    const offTopic = evaluation('off-topic', 'I answered something unrelated.', {
      suggested: '',
      contextFit: 'off_topic',
    });
    const corrected = evaluation('corrected', 'I go yesterday.', {
      suggested: 'I went yesterday.',
      decision: 'confirmed_error',
    });
    const messages: ChatMessage[] = [
      { id: 'safe', role: 'user', content: 'I explained my plan clearly.' },
      { id: 'low', role: 'user', content: lowConfidence.correction.original, evaluation: { ...lowConfidence, confidence: 'low' } },
      { id: 'off-topic', role: 'user', content: offTopic.correction.original, evaluation: offTopic },
      { id: 'corrected', role: 'user', content: corrected.correction.original, evaluation: corrected },
    ];

    expect(buildReportHighlights(messages, []).map((item) => item.id)).toEqual(['highlight:safe']);
  });
});

describe('buildReportContent', () => {
  it('keeps real corrections and fills the remaining report with distinct conversation highlights', () => {
    const corrections = correctionMessages(3);
    const highlights: ChatMessage[] = Array.from({ length: 10 }, (_, index) => ({
      id: `good-${index + 1}`,
      role: 'user',
      content: `I explained useful idea number ${index + 1} clearly.`,
    }));

    const content = buildReportContent([...corrections, ...highlights], [segment()]);

    expect(content.corrections).toHaveLength(3);
    expect(content.highlights).toHaveLength(10);
    expect(content.items).toHaveLength(TARGET_CORRECTION_MIN);
    expect(new Set(content.items.map((item) => item.id)).size).toBe(content.items.length);
    expect(content.highlights.every((item) => !content.corrections.some(
      (correction) => correction.conversationIndex === item.conversationIndex,
    ))).toBe(true);
  });

  it('caps supplemented reports at the normal 15-item maximum', () => {
    const messages: ChatMessage[] = [
      ...correctionMessages(3),
      ...Array.from({ length: 20 }, (_, index) => ({
        id: `extra-good-${index + 1}`,
        role: 'user' as const,
        content: `I shared another useful idea number ${index + 1}.`,
      })),
    ];

    expect(buildReportContent(messages, [segment()]).items).toHaveLength(TARGET_CORRECTION_MAX);
  });

  it('does not add highlights when enough real corrections already exist', () => {
    const content = buildReportContent(correctionMessages(TARGET_CORRECTION_MIN), [segment()]);

    expect(content.corrections).toHaveLength(TARGET_CORRECTION_MIN);
    expect(content.highlights).toEqual([]);
    expect(content.items).toEqual(content.corrections);
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
