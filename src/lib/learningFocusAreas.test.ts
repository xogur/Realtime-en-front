import { describe, expect, it } from 'vitest';
import { buildLearningFocusAreas } from './learningFocusAreas';
import type { ReportCorrectionItem } from './reportCorrections';
import type { ChatMessage, TurnEvaluation } from '@/stores/useStore';

function evaluation(
  id: string,
  overrides: Partial<TurnEvaluation> = {},
): TurnEvaluation {
  return {
    rubricVersion: 'speaking-v2',
    turnId: id,
    provider: 'test',
    model: 'test',
    createdAt: '2026-08-10T00:00:00.000Z',
    scores: { grammar: 76, vocabulary: 76, relevance: 76, fluency: 76, interaction: 76, overall: 76 },
    evidence: { grammar: '', vocabulary: '', relevance: '', fluency: '', interaction: '', overall: '' },
    feedback: { summary: '', strength: '', improvement: '', nextPractice: '' },
    cefrEstimate: { level: 'A2', reason: '' },
    correction: { original: `Original ${id}`, suggested: `Suggested ${id}`, reason: '' },
    errorTags: [],
    capabilities: { pronunciation: 'not_available' },
    confidence: 'high',
    confidenceReasons: [],
    ...overrides,
  };
}

function message(id: string, overrides: Partial<TurnEvaluation> = {}): ChatMessage {
  return { id, role: 'user', content: `Original ${id}`, evaluation: evaluation(id, overrides) };
}

function correction(id: string, category: ReportCorrectionItem['category']): ReportCorrectionItem {
  const errorTags = category === 'grammar' ? ['verb_tense'] : category === 'vocabulary' ? ['word_choice'] : [];
  return {
    id,
    conversationIndex: 0,
    topic: '여행',
    difficulty: '중급',
    category,
    categoryLabel: '문법',
    assistantPrompt: 'What did you do?',
    original: `Original ${id}`,
    suggested: `Suggested ${id}`,
    reason: '교정 이유',
    problem: '',
    usageGuide: '',
    contextReason: category === 'comprehension' || category === 'meaning_clarity' ? '질문의 핵심 조건에 맞추기 위한 교정입니다.' : '',
    priority: 'high',
    score: 80,
    issueKey: id,
    issueCode: category === 'comprehension' ? 'question_misunderstanding' : errorTags[0] ?? category,
    errorTags,
  };
}

describe('buildLearningFocusAreas', () => {
  it('does not diagnose a weakness from fewer than four answers', () => {
    const messages = [
      message('1', { scores: { ...evaluation('1').scores, vocabulary: 30 }, errorTags: ['word_choice'] }),
      message('2', { scores: { ...evaluation('2').scores, vocabulary: 30 }, errorTags: ['word_choice'] }),
      message('3', { scores: { ...evaluation('3').scores, vocabulary: 30 }, errorTags: ['word_choice'] }),
    ];
    expect(buildLearningFocusAreas(messages, [correction('1', 'vocabulary'), correction('2', 'vocabulary')])).toEqual([]);
  });

  it('does not diagnose a weakness from one occurrence', () => {
    const messages = Array.from({ length: 8 }, (_, index) => message(String(index + 1), index === 0 ? {
      scores: { ...evaluation('one').scores, vocabulary: 45 },
      evidence: { ...evaluation('one').evidence, vocabulary: '단어 선택이 문맥과 맞지 않았습니다.' },
      errorTags: ['word_choice'],
    } : {}));
    expect(buildLearningFocusAreas(messages, [correction('1', 'vocabulary')])).toEqual([]);
  });

  it('does not turn rejected raw error tags into a repeated weakness', () => {
    const messages = Array.from({ length: 8 }, (_, index) => message(String(index + 1), index < 5 ? {
      scores: { ...evaluation('tagged').scores, grammar: 55 },
      errorTags: ['verb_tense'],
      evidence: { ...evaluation('tagged').evidence, grammar: '모델이 남긴 원시 태그입니다.' },
    } : {}));

    expect(buildLearningFocusAreas(messages, [])).toEqual([]);
  });

  it('maps repeated vocabulary evidence and correction numbers to one clear area', () => {
    const messages = Array.from({ length: 8 }, (_, index) => message(String(index + 1), index < 2 ? {
      scores: { ...evaluation('vocab').scores, vocabulary: 55 },
      evidence: { ...evaluation('vocab').evidence, vocabulary: '비슷한 뜻의 단어를 현재 상황과 다르게 사용했습니다.' },
      errorTags: ['word_choice'],
    } : { scores: { ...evaluation('normal').scores, vocabulary: 70 } }));
    const areas = buildLearningFocusAreas(messages, [correction('1', 'vocabulary'), correction('2', 'vocabulary')]);

    expect(areas[0]).toMatchObject({
      id: 'vocabulary_use',
      label: '어휘 선택과 활용',
      statusLabel: '근거 있음',
      sampleCount: 8,
      evidenceCount: 2,
      correctionNumbers: [1, 2],
    });
    expect(areas[0].explanation).toContain('어휘 평균');
  });

  it('uses a cautious context label instead of claiming comprehension is weak', () => {
    const messages = Array.from({ length: 5 }, (_, index) => message(String(index + 1), index < 2 ? {
      scores: { ...evaluation('context').scores, relevance: 52 },
      evidence: { ...evaluation('context').evidence, relevance: '질문의 핵심 조건과 다른 내용을 답했습니다.' },
      correction: {
        ...evaluation('context').correction,
        category: 'comprehension',
        contextFit: 'partial',
      },
    } : { scores: { ...evaluation('normal').scores, relevance: 69 } }));
    const areas = buildLearningFocusAreas(messages, [correction('1', 'comprehension'), correction('2', 'comprehension')]);

    expect(areas[0]).toMatchObject({
      id: 'context_response',
      label: '질문 이해와 문맥 대응',
      statusLabel: '잠정 관찰',
    });
  });

  it('excludes low-confidence answers from the sample and evidence count', () => {
    const messages = [
      ...Array.from({ length: 4 }, (_, index) => message(String(index + 1), index < 2 ? {
        scores: { ...evaluation('grammar').scores, grammar: 55 },
        evidence: { ...evaluation('grammar').evidence, grammar: '시제가 맞지 않았습니다.' },
        errorTags: ['verb_tense'],
      } : { scores: { ...evaluation('normal').scores, grammar: 68 } })),
      message('low', {
        confidence: 'low',
        scores: { ...evaluation('low').scores, grammar: 0 },
        evidence: { ...evaluation('low').evidence, grammar: '신뢰할 수 없는 근거' },
        errorTags: ['verb_tense'],
      }),
    ];
    const areas = buildLearningFocusAreas(messages, [correction('1', 'grammar'), correction('2', 'grammar')]);
    expect(areas[0]).toMatchObject({ sampleCount: 4, evidenceCount: 2 });
    expect(areas[0].evidence.join(' ')).not.toContain('신뢰할 수 없는 근거');
  });
});
