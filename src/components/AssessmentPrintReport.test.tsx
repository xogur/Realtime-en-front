/** @vitest-environment jsdom */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '@/stores/useStore';
import { AssessmentPrintReport } from './AssessmentPrintReport';

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
      sessionScore={69}
      metrics={[]}
      tier={{ label: 'Bronze', textColor: '#000', totalLp: 10 }}
      cefrLevel="A2"
      cefrReason="기본 문장으로 경험을 전달했습니다."
      strength="질문에 맞게 장소를 답했습니다."
      improvement="과거 시제를 연습하세요."
    />);

    expect(screen.queryByText('반복 오류 경향')).toBeNull();
    expect(screen.getAllByText('이번 대화의 집중 학습 영역').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/yesterday가 있는데 현재형 go/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/끝난 일에는 go의 과거형 went/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/어제 어디에 갔는지 묻는 질문/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('내 답변').length).toBeGreaterThan(0);
    expect(screen.getAllByText('교정').length).toBeGreaterThan(0);
  });
});
