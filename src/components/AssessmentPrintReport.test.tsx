/** @vitest-environment jsdom */

import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

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
    expect(screen.getAllByLabelText('강점 판단 근거')[0].textContent).toContain('문맥 이해도 평균이 80점');
    expect(screen.getAllByLabelText('강점 판단 근거')[0].textContent).toContain('I go to the park yesterday.');
    expect(screen.getAllByLabelText('보완점 판단 근거')[0].textContent).toContain('문법 평균이 60점');
    expect(screen.getAllByLabelText('보완점 판단 근거')[0].textContent).toContain('과거 경험에 맞게 동사 시제를 고쳤습니다.');
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

    expect(screen.getAllByText('학습 문장 모음').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('.print-page .report-correction:not(.report-highlight)')).toHaveLength(1);
    expect(container.querySelectorAll('.print-page .report-highlight')).toHaveLength(12);
    expect(screen.getAllByText('I go to the park yesterday.').length).toBeGreaterThan(0);
    expect(screen.getAllByText('I went to the park yesterday.').length).toBeGreaterThan(0);
  });

  it('renders all 20 confirmed corrections without dropping numbered rows', () => {
    const messages: ChatMessage[] = Array.from({ length: 20 }, (_, index) => {
      const base = correctedEvaluation();
      const original = `I go to park number ${index + 1} yesterday.`;
      return {
        id: `print-turn-${index + 1}`,
        role: 'user',
        content: original,
        evaluation: {
          ...base,
          turnId: `print-turn-${index + 1}`,
          correction: {
            ...base.correction,
            original,
            suggested: `I went to park number ${index + 1} yesterday.`,
            errorSpan: 'go',
            correctedSpan: 'went',
          },
        },
      };
    });

    const { container } = render(<AssessmentPrintReport
      messages={messages}
      topicSegments={[]}
      assessableAnswerCount={20}
      reliableAnswerCount={20}
      metrics={[]}
      tier={{ label: 'Bronze', textColor: '#47301f', totalLp: 10 }}
      cefrLevel="A2"
      cefrReason="충분한 대화 표본입니다."
      strength="대화를 이어갔습니다."
      improvement="과거 시제를 복습해 보세요."
    />);

    const rows = container.querySelectorAll('.print-page .report-correction');
    expect(rows).toHaveLength(20);
    expect(rows[0]?.textContent).toContain('01');
    expect(rows[19]?.textContent).toContain('20');
    expect(rows[19]?.textContent).toContain('I went to park number 20 yesterday.');
  });

  it('labels uncertain automatic suggestions as neutral reference expressions', () => {
    const base = correctedEvaluation();
    const messages: ChatMessage[] = [{
      id: 'review-turn',
      role: 'user',
      content: 'I favorite comedy.',
      evaluation: {
        ...base,
        turnId: 'review-turn',
        correction: {
          ...base.correction,
          original: 'I favorite comedy.',
          suggested: '',
          decision: 'transcript_uncertain',
          contextFit: 'unknown',
          reportEligible: false,
          reportPriority: 'none',
        },
      },
      correction: {
        turnId: 'review-turn',
        provider: 'test',
        model: 'test',
        createdAt: '2026-08-12T00:00:00.000Z',
        original: 'I favorite comedy.',
        suggested: 'My favorite is comedy.',
        reason: 'favorite 앞에 소유격을 사용합니다.',
      },
    }];

    const { container } = render(<AssessmentPrintReport
      messages={messages}
      topicSegments={[]}
      assessableAnswerCount={1}
      reliableAnswerCount={1}
      metrics={[]}
      tier={{ label: 'Bronze', textColor: '#47301f', totalLp: 10 }}
      cefrLevel="A2"
      cefrReason="짧은 표본입니다."
      strength="대화에 참여했습니다."
      improvement="문맥에 맞는 표현을 비교해 보세요."
    />);

    expect(container.querySelectorAll('.print-page .report-teacher-review')).toHaveLength(1);
    expect(screen.getAllByText('표현 참고').length).toBeGreaterThan(0);
    expect(screen.getAllByText('My favorite is comedy.').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/상황과 의도에 따라 달라질 수 있는 참고 표현입니다/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/교수자/)).toBeNull();
  });

  it('keeps a row visible when a pending review is promoted after layout readiness', async () => {
    const onLayoutReady = vi.fn();
    const pending: ChatMessage[] = [{
      id: 'late-turn',
      role: 'user',
      content: 'I go yesterday.',
      evaluationStatus: 'pending',
      correction: {
        turnId: 'late-turn',
        provider: 'test',
        model: 'test',
        createdAt: '2026-08-12T00:00:00.000Z',
        original: 'I go yesterday.',
        suggested: 'I went yesterday.',
        reason: '과거 시제 후보입니다.',
      },
    }];
    const commonProps = {
      topicSegments: [],
      assessableAnswerCount: 1,
      reliableAnswerCount: 1,
      metrics: [],
      tier: { label: 'Bronze', textColor: '#47301f', totalLp: 10 },
      cefrLevel: 'A2',
      cefrReason: '짧은 표본입니다.',
      strength: '대화에 참여했습니다.',
      improvement: '과거 시제를 복습해 보세요.',
      onLayoutReady,
    };
    const { container, rerender } = render(
      <AssessmentPrintReport messages={pending} {...commonProps} />,
    );

    await waitFor(() => expect(onLayoutReady).toHaveBeenCalledTimes(1));
    const finalEvaluation = correctedEvaluation();
    rerender(<AssessmentPrintReport
      messages={[{
        ...pending[0],
        evaluationStatus: 'ready',
        evaluation: {
          ...finalEvaluation,
          turnId: 'late-turn',
          correction: {
            ...finalEvaluation.correction,
            original: 'I go yesterday.',
            suggested: 'I went yesterday.',
          },
        },
      }]}
      {...commonProps}
    />);

    await waitFor(() => {
      expect(container.querySelectorAll('.print-page .report-correction')).toHaveLength(1);
      expect(container.querySelector('.print-page .report-correction')?.textContent).toContain('I went yesterday.');
    });
    expect(container.querySelectorAll('.print-page .report-teacher-review')).toHaveLength(0);
    expect(onLayoutReady).toHaveBeenCalledTimes(1);
  });

  it('re-packs seven corrections from actual page overflow before reporting print readiness', async () => {
    const resizeNotification = { current: null as (() => void) | null };
    class TestResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        resizeNotification.current = () => callback([], this as unknown as ResizeObserver);
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', TestResizeObserver);
    const rect = (height: number): DOMRect => ({
      bottom: height,
      height,
      left: 0,
      right: 760,
      top: 0,
      width: 760,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function measuredRect(this: HTMLElement) {
      if (this.classList.contains('report-usable-height')) return rect(1000);
      if (this.closest('.report-measurement')) {
        if (this.querySelector(':scope > .report-summary')) return rect(200);
        if (this.querySelector(':scope > .report-corrections-header')) return rect(50);
        if (this.querySelector(':scope > .report-page-footer')) return rect(30);
        if (this.querySelector(':scope > .report-correction')) return rect(260);
      }
      return rect(10);
    });
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function clientHeight(this: HTMLElement) {
      return this.classList.contains('print-page') ? 1000 : 0;
    });
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function scrollHeight(this: HTMLElement) {
      if (!this.classList.contains('print-page')) return 0;
      const pageNumber = Number(this.getAttribute('data-report-page') ?? '1');
      const itemCount = this.querySelectorAll('.report-correction').length;
      const safeItemCount = pageNumber === 1 ? 1 : 2;
      return itemCount > safeItemCount ? 1100 : 900;
    });

    const messages: ChatMessage[] = Array.from({ length: 7 }, (_, index) => {
      const number = index + 1;
      const evaluation = correctedEvaluation();
      return [
        { role: 'assistant' as const, content: `Question ${number}` },
        {
          id: `print-turn-${number}`,
          role: 'user' as const,
          content: `Original answer ${number}`,
          evaluation: {
            ...evaluation,
            turnId: `print-turn-${number}`,
            correction: {
              ...evaluation.correction,
              original: `Original answer ${number}`,
              suggested: `Suggested answer ${number}`,
              usageGuide: number === 2
                ? 'LONG-CORRECTION-02-LAST-SENTENCE must remain visible in the printed report.'
                : `Usage guide ${number}`,
            },
          },
        },
      ];
    }).flat();
    const onLayoutReady = vi.fn();

    const { container } = render(<AssessmentPrintReport
      messages={messages}
      topicSegments={[]}
      assessableAnswerCount={7}
      reliableAnswerCount={7}
      metrics={[]}
      tier={{ label: 'Bronze', textColor: '#47301f', totalLp: 10 }}
      cefrLevel="A2"
      cefrReason="The learner can answer familiar questions."
      strength="The learner keeps the conversation moving."
      improvement="Practice accurate sentence forms."
      onLayoutReady={onLayoutReady}
    />);

    await waitFor(() => {
      expect(container.querySelector('.print-document')?.getAttribute('data-layout-ready')).toBe('true');
    });

    const report = container.querySelector('.print-document');
    expect(report?.getAttribute('data-layout-mode')).toBe('paginated');
    const pages = [...container.querySelectorAll<HTMLElement>('.print-page')];
    expect(pages[0].querySelectorAll('.report-correction')).toHaveLength(1);
    expect(pages.every((page, index) => page.querySelectorAll('.report-correction').length <= (index === 0 ? 1 : 2))).toBe(true);

    const printedRows = [...container.querySelectorAll<HTMLElement>('.print-page .report-correction')];
    expect(printedRows).toHaveLength(7);
    expect(printedRows.map((row) => row.querySelector('span')?.textContent)).toEqual([
      '01', '02', '03', '04', '05', '06', '07',
    ]);
    expect(container.querySelector('.print-page')?.parentElement?.textContent).toContain(
      'LONG-CORRECTION-02-LAST-SENTENCE must remain visible in the printed report.',
    );
    await waitFor(() => expect(onLayoutReady).toHaveBeenCalledTimes(1));
    resizeNotification.current?.();
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
    expect(onLayoutReady).toHaveBeenCalledTimes(1);
  });

  it('falls back to unclipped natural flow when one correction is taller than a page', async () => {
    const rect = (height: number): DOMRect => ({
      bottom: height,
      height,
      left: 0,
      right: 760,
      top: 0,
      width: 760,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function measuredRect(this: HTMLElement) {
      if (this.classList.contains('report-usable-height')) return rect(1000);
      if (this.closest('.report-measurement')) {
        if (this.querySelector(':scope > .report-summary')) return rect(200);
        if (this.querySelector(':scope > .report-corrections-header')) return rect(50);
        if (this.querySelector(':scope > .report-page-footer')) return rect(30);
        if (this.querySelector(':scope > .report-correction')) return rect(1200);
      }
      return rect(10);
    });
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function clientHeight(this: HTMLElement) {
      return this.classList.contains('print-page') ? 1000 : 0;
    });
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function scrollHeight(this: HTMLElement) {
      if (!this.classList.contains('print-page')) return 0;
      return this.querySelector('.report-correction') ? 1400 : 900;
    });

    const evaluation = correctedEvaluation();
    const finalSentence = 'OVERSIZED-02-FINAL-SENTENCE remains available to the browser paginator.';
    const messages: ChatMessage[] = [
      { role: 'assistant', content: 'Tell me about yesterday.' },
      {
        id: 'oversized-turn',
        role: 'user',
        content: 'I go to the park yesterday.',
        evaluation: {
          ...evaluation,
          correction: { ...evaluation.correction, usageGuide: finalSentence },
        },
      },
    ];
    const onLayoutReady = vi.fn();

    const { container } = render(<AssessmentPrintReport
      messages={messages}
      topicSegments={[]}
      assessableAnswerCount={1}
      reliableAnswerCount={1}
      metrics={[]}
      tier={{ label: 'Bronze', textColor: '#47301f', totalLp: 10 }}
      cefrLevel="A2"
      cefrReason="A short sample."
      strength="A clear attempt."
      improvement="Practice past tense."
      onLayoutReady={onLayoutReady}
    />);

    await waitFor(() => {
      expect(container.querySelector('.print-document')?.getAttribute('data-layout-mode')).toBe('natural');
      expect(container.querySelector('.print-document')?.getAttribute('data-layout-ready')).toBe('true');
    });
    expect(container.querySelectorAll('.print-page .report-correction')).toHaveLength(1);
    expect(container.querySelector('.print-page .report-correction')?.textContent).toContain(finalSentence);
    await waitFor(() => expect(onLayoutReady).toHaveBeenCalledTimes(1));
  });
});
