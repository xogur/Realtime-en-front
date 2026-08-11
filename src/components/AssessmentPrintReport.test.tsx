/** @vitest-environment jsdom */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ChatMessage, TurnEvaluation } from '@/stores/useStore';
import { AssessmentPrintReport } from './AssessmentPrintReport';

function correctedEvaluation(): TurnEvaluation {
  return {
    rubricVersion: 'speaking-v2',
    turnId: 'mixed-correction',
    provider: 'test',
    model: 'test',
    createdAt: '2026-08-11T00:00:00.000Z',
    scores: { grammar: 60, vocabulary: 70, relevance: 80, fluency: 65, interaction: 70, overall: 69 },
    evidence: { grammar: '', vocabulary: '', relevance: '', fluency: '', interaction: '', overall: '' },
    feedback: { summary: '', strength: '', improvement: '', nextPractice: '' },
    cefrEstimate: { level: 'A2', reason: '' },
    correction: {
      original: 'I go to the park yesterday.',
      suggested: 'I went to the park yesterday.',
      reason: '과거 경험에 맞게 동사 시제를 고쳤습니다.',
      category: 'grammar',
      contextFit: 'appropriate',
      reportEligible: true,
      reportPriority: 'medium',
      meaningPreserved: true,
      decision: 'confirmed_error',
      errorSpan: 'go',
      correctedSpan: 'went',
    },
    errorTags: ['verb_tense'],
    capabilities: { pronunciation: 'not_available' },
    confidence: 'high',
    confidenceReasons: [],
  };
}

describe('AssessmentPrintReport explanations', () => {
  it('shows compact contextual correction fields without the old repeated-error section', () => {
    const messages: ChatMessage[] = [
      { role: 'assistant', content: 'Where did you go yesterday?' },
      {
        id: 'turn-1',
        role: 'user',
        content: 'I go to the park yesterday.',
        evaluation: {
          rubricVersion: 'speaking-v2',
          turnId: 'turn-1',
          provider: 'test',
          model: 'test',
          createdAt: '2026-08-10T00:00:00.000Z',
          scores: { grammar: 60, vocabulary: 70, relevance: 80, fluency: 65, interaction: 70, overall: 69 },
          evidence: { grammar: '', vocabulary: '', relevance: '', fluency: '', interaction: '', overall: '' },
          feedback: { summary: '', strength: '', improvement: '', nextPractice: '' },
          cefrEstimate: { level: 'A2', reason: '' },
          correction: {
            original: 'I go to the park yesterday.',
            suggested: 'I went to the park yesterday.',
            reason: '과거 경험에 맞게 동사 시제를 고쳤습니다.',
            problem: 'yesterday가 있는데 현재형 go를 사용했습니다.',
            usageGuide: '끝난 일에는 go의 과거형 went를 사용합니다.',
            contextReason: '어제 어디에 갔는지 묻는 질문이므로 과거형이 필요합니다.',
            category: 'grammar',
            contextFit: 'appropriate',
            reportEligible: true,
            reportPriority: 'medium',
            meaningPreserved: true,
          },
          errorTags: ['verb_tense'],
          capabilities: { pronunciation: 'not_available' },
          confidence: 'high',
          confidenceReasons: [],
        },
      },
    ];

    render(<AssessmentPrintReport
      messages={messages}
      topicSegments={[]}
      assessableAnswerCount={2}
      reliableAnswerCount={2}
      metrics={[
        { key: 'grammar', label: '문법', value: 60 },
        { key: 'vocabulary', label: '어휘', value: 70 },
        { key: 'relevance', label: '문맥 이해도', value: 80 },
      ]}
      tier={{ label: 'Bronze', textColor: '#47301f', totalLp: 10, asset: <span>브론즈 배지</span> }}
      cefrLevel="A2"
      cefrReason="기본 문장으로 경험을 전달했습니다."
      strength="질문에 맞게 장소를 답했습니다."
      improvement="과거 시제를 연습하세요."
    />);

    expect(screen.queryByText('반복 오류 경향')).toBeNull();
    expect(screen.getAllByText('이번 대화에서 잘한 점과 보완할 점').length).toBeGreaterThan(0);
    expect(screen.getAllByText('잠정 강점').length).toBeGreaterThan(0);
    expect(screen.getAllByText('잠정 보완점').length).toBeGreaterThan(0);
    expect(screen.getAllByText('질문에 맞게 장소를 답했습니다.').length).toBeGreaterThan(0);
    expect(screen.getAllByText('과거 시제를 연습하세요.').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/yesterday가 있는데 현재형 go/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/끝난 일에는 go의 과거형 went/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/어제 어디에 갔는지 묻는 질문/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('내 답변').length).toBeGreaterThan(0);
    expect(screen.getAllByText('교정').length).toBeGreaterThan(0);
    expect(screen.getAllByText('기초 회화').length).toBeGreaterThan(0);
    expect(screen.queryByText(/CEFR/)).toBeNull();
    expect(screen.getAllByText('브론즈 배지').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('progressbar', { name: /문법: 성장 중/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('progressbar', { name: /어휘: 안정적/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('progressbar', { name: /문맥 이해도: 안정적/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('progressbar', { name: /문법: 성장 중/ })[0].getAttribute('aria-valuenow')).toBe('60');
    expect(screen.getAllByText('60점').length).toBeGreaterThan(0);
    expect(screen.getAllByText('70점').length).toBeGreaterThan(0);
    expect(screen.getAllByText('80점').length).toBeGreaterThan(0);
    expect(screen.queryByText('문장 완성도')).toBeNull();
    expect(screen.queryByText('상호작용')).toBeNull();
  });

  it('renders praise highlights instead of an empty report when there are no corrections', () => {
    const messages: ChatMessage[] = Array.from({ length: 15 }, (_, index) => ([
      { role: 'assistant' as const, content: `What do you think about topic ${index + 1}?` },
      {
        id: `good-turn-${index + 1}`,
        role: 'user' as const,
        content: `I explained my useful idea number ${index + 1} clearly.`,
      },
    ])).flat();

    const { container } = render(<AssessmentPrintReport
      messages={messages}
      topicSegments={[]}
      assessableAnswerCount={15}
      reliableAnswerCount={15}
      metrics={[]}
      tier={{ label: 'Bronze', textColor: '#47301f', totalLp: 10 }}
      cefrLevel="A2"
      cefrReason="자신의 생각을 영어로 꾸준히 표현했습니다."
      strength="끝까지 대화를 이어간 점이 좋았습니다."
      improvement="지금처럼 문장을 계속 확장해 보세요."
    />);

    expect(screen.getAllByText('대화 하이라이트').length).toBeGreaterThan(0);
    expect(screen.getAllByText('칭찬').length).toBeGreaterThan(0);
    expect(screen.getAllByText('AI 응답').length).toBeGreaterThan(0);
    expect(screen.getAllByText('내 답변').length).toBeGreaterThan(0);
    expect(screen.getAllByText('What do you think about topic 1?').length).toBeGreaterThan(0);
    expect(screen.getAllByText('I explained my useful idea number 1 clearly.').length).toBeGreaterThan(0);
    expect(screen.queryByText('연습 문장')).toBeNull();
    expect(container.querySelectorAll('.print-page .report-highlight')).toHaveLength(15);
    expect(screen.queryByText(/주요 교정이 필요한 표현을 확인하지 못했습니다/)).toBeNull();
  });

  it('renders real corrections and praise highlights together when corrections are below the target', () => {
    const messages: ChatMessage[] = [
      { role: 'assistant', content: 'Where did you go yesterday?' },
      {
        id: 'mixed-correction',
        role: 'user',
        content: 'I go to the park yesterday.',
        evaluation: correctedEvaluation(),
      },
      ...Array.from({ length: 12 }, (_, index) => ({
        id: `mixed-good-${index + 1}`,
        role: 'user' as const,
        content: `I explained my useful idea number ${index + 1} clearly.`,
      })),
    ];

    const { container } = render(<AssessmentPrintReport
      messages={messages}
      topicSegments={[]}
      assessableAnswerCount={13}
      reliableAnswerCount={13}
      metrics={[]}
      tier={{ label: 'Bronze', textColor: '#47301f', totalLp: 10 }}
      cefrLevel="A2"
      cefrReason="자신의 생각을 영어로 표현했습니다."
      strength="대화를 끝까지 이어갔습니다."
      improvement="과거 시제를 복습해 보세요."
    />);

    expect(screen.getAllByText('주요 교정 및 대화 하이라이트').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('.print-page .report-correction:not(.report-highlight)')).toHaveLength(1);
    expect(container.querySelectorAll('.print-page .report-highlight')).toHaveLength(12);
    expect(screen.getAllByText('I go to the park yesterday.').length).toBeGreaterThan(0);
    expect(screen.getAllByText('I went to the park yesterday.').length).toBeGreaterThan(0);
  });
});
