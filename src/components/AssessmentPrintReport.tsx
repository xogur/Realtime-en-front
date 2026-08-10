'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { TopicSegment } from '@/lib/conversationTopics';
import { buildLearningFocusAreas, type LearningFocusArea } from '@/lib/learningFocusAreas';
import {
  buildReportCorrections,
  getReportSampleStatus,
  paginateReportCorrections,
  type ReportCorrectionItem,
} from '@/lib/reportCorrections';
import { packMeasuredCorrections } from '@/lib/reportPagination';
import type { ChatMessage } from '@/stores/useStore';

type Metric = { key: string; label: string; value: number };

type AssessmentPrintReportProps = {
  messages: ChatMessage[];
  topicSegments: TopicSegment[];
  assessableAnswerCount: number;
  sessionScore: number | null;
  metrics: Metric[];
  tier: { label: string; textColor: string; totalLp: number };
  cefrLevel: string;
  cefrReason: string;
  strength: string;
  improvement: string;
  onLayoutReady?: () => void;
};

function PageFooter({ page, total }: { page: number; total: number }) {
  return (
    <footer className="report-page-footer mt-auto flex justify-between border-t border-[#183c2c]/20 pt-1.5 text-[8px] font-semibold text-[#625e58]">
      <span>자동평가 결과는 영어 학습을 돕는 참고자료입니다.</span>
      <span className="font-mono">{page} / {total}</span>
    </footer>
  );
}

function ReportHeader({
  reportDate,
  sampleLabel,
  assessableAnswerCount,
}: {
  reportDate: string;
  sampleLabel: string;
  assessableAnswerCount: number;
}) {
  return (
    <header className="report-main-header flex items-end justify-between border-b-2 border-[#183c2c] pb-2">
      <div>
        <p className="text-[9px] font-bold text-[#526057]">영어 말하기 평가</p>
        <h1 className="mt-0.5 text-[22px] font-black tracking-tight text-[#17251f]">영어 코치 리포트</h1>
      </div>
      <dl className="grid grid-cols-[auto_auto] gap-x-2 gap-y-0.5 text-right text-[8px] leading-tight text-[#625e58]">
        <dt>평가 기준</dt><dd className="font-bold text-[#273a31]">{sampleLabel}</dd>
        <dt>응답</dt><dd className="font-mono font-bold text-[#273a31]">{assessableAnswerCount}개</dd>
        <dt>작성일</dt><dd className="font-mono font-bold text-[#273a31]">{reportDate}</dd>
      </dl>
    </header>
  );
}

function LearningFocusSection({
  areas,
  assessableAnswerCount,
  improvement,
}: {
  areas: LearningFocusArea[];
  assessableAnswerCount: number;
  improvement: string;
}) {
  return (
    <section className="report-focus-section mt-3">
      <div className="flex items-baseline justify-between border-b border-[#183c2c]/30 pb-1">
        <h2 className="text-[13px] font-black text-[#17251f]">이번 대화의 집중 학습 영역</h2>
        <p className="text-[8px] font-semibold text-[#625e58]">반복 신호와 영역별 점수를 함께 분석</p>
      </div>
      {areas.length > 0 ? (
        <div className={`grid ${areas.length > 1 ? 'grid-cols-2' : 'grid-cols-1'} gap-x-4`}>
          {areas.map((area) => (
            <article key={area.id} className="py-2">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-[11px] font-black text-[#183c2c]">{area.label}</h3>
                <p className="shrink-0 text-[8px] font-black text-[#8a5a12]">{area.statusLabel}</p>
              </div>
              <p className="mt-0.5 text-[9px] font-semibold leading-[1.35] text-[#474a46]">{area.description}</p>
              <p className="mt-1 text-[8.5px] font-bold leading-[1.35] text-[#273a31]">{area.explanation}</p>
              {area.evidence[0] && (
                <p className="mt-1 border-l-2 border-[#2f6f4f] pl-1.5 text-[8.5px] font-semibold leading-[1.35] text-[#55514c]">
                  근거: {area.evidence[0]}
                </p>
              )}
              {area.correctionNumbers.length > 0 && (
                <p className="mt-1 text-[8px] font-bold text-[#2f6f4f]">
                  관련 교정 {area.correctionNumbers.map((number) => `#${String(number).padStart(2, '0')}`).join(', ')}
                </p>
              )}
            </article>
          ))}
        </div>
      ) : (
        <p className="py-2 text-[9px] font-semibold leading-[1.4] text-[#55514c]">
          {assessableAnswerCount < 4
            ? '대화 표본이 적어 집중 학습 영역을 단정하지 않았습니다. 아래 주요 교정만 복습해 주세요.'
            : `두 번 이상 뚜렷하게 확인된 집중 영역은 없습니다. 현재 개선 포인트: ${improvement}`}
        </p>
      )}
    </section>
  );
}

function ReportSummary({
  reportDate,
  sampleStatus,
  assessableAnswerCount,
  sessionScore,
  metrics,
  tier,
  cefrLevel,
  cefrReason,
  strength,
  improvement,
  focusAreas,
}: {
  reportDate: string;
  sampleStatus: ReturnType<typeof getReportSampleStatus>;
  assessableAnswerCount: number;
  sessionScore: number | null;
  metrics: Metric[];
  tier: AssessmentPrintReportProps['tier'];
  cefrLevel: string;
  cefrReason: string;
  strength: string;
  improvement: string;
  focusAreas: LearningFocusArea[];
}) {
  const levelPrefix = assessableAnswerCount <= 7 ? '예상' : '현재';
  return (
    <div className="report-summary">
      <ReportHeader
        reportDate={reportDate}
        sampleLabel={sampleStatus.label}
        assessableAnswerCount={assessableAnswerCount}
      />
      {sampleStatus.notice && (
        <p className="mt-2 border-l-2 border-[#b77f1e] bg-[#fff8ea] px-2 py-1.5 text-[8.5px] font-bold leading-[1.35] text-[#654d24]">
          {sampleStatus.notice}
        </p>
      )}

      <section className="mt-3 grid grid-cols-[0.8fr_0.8fr_1.2fr] border-y border-[#183c2c]/30 py-2">
        <div className="border-r border-[#183c2c]/15 pr-3">
          <p className="text-[8px] font-bold text-[#625e58]">종합 점수</p>
          <p className="mt-0.5 font-mono text-[24px] font-black leading-none text-[#183c2c]">{sessionScore ?? '--'}</p>
          <p className="mt-1 text-[8px] font-bold text-[#625e58]">100점 기준</p>
        </div>
        <div className="border-r border-[#183c2c]/15 px-3">
          <p className="text-[8px] font-bold text-[#625e58]">{levelPrefix} 수준</p>
          <p className="mt-0.5 text-[18px] font-black leading-none text-[#17251f]">CEFR {cefrLevel || '--'}</p>
          <p className="mt-1 text-[8px] font-bold" style={{ color: tier.textColor }}>{tier.label} · {tier.totalLp} LP</p>
        </div>
        <div className="pl-3">
          <p className="text-[8px] font-bold text-[#625e58]">수준 판단 근거</p>
          <p className="mt-1 text-[9px] font-semibold leading-[1.4] text-[#3f4541]">{cefrReason || '현재 응답을 바탕으로 수준을 추정했습니다.'}</p>
        </div>
      </section>

      <section className="grid grid-cols-5 border-b border-[#183c2c]/30 py-1.5">
        {metrics.map((metric) => (
          <div key={metric.key} className="flex items-baseline justify-center gap-1 border-r border-[#183c2c]/10 px-1 last:border-r-0">
            <span className="text-[8px] font-bold text-[#625e58]">{metric.label}</span>
            <span className="font-mono text-[11px] font-black text-[#17251f]">{metric.value}</span>
          </div>
        ))}
      </section>

      <section className="mt-2 grid grid-cols-[72px_1fr] border-l-2 border-[#2f6f4f] bg-[#f2f7f3] px-2 py-1.5">
        <h2 className="text-[9px] font-black text-[#2f6f4f]">{assessableAnswerCount <= 7 ? '관찰된 강점' : '강점'}</h2>
        <p className="text-[9px] font-bold leading-[1.4] text-[#2d3e34]">{strength}</p>
      </section>

      <LearningFocusSection
        areas={focusAreas}
        assessableAnswerCount={assessableAnswerCount}
        improvement={improvement}
      />
    </div>
  );
}

function CorrectionsHeader({
  start,
  end,
  total,
  compact = false,
}: {
  start: number;
  end: number;
  total: number;
  compact?: boolean;
}) {
  return (
    <header className={`report-corrections-header flex items-end justify-between border-b-2 border-[#183c2c] ${compact ? 'pb-1.5' : 'mt-3 pb-1.5'}`}>
      <div>
        <h2 className={`${compact ? 'text-[15px]' : 'text-[13px]'} font-black tracking-tight text-[#17251f]`}>주요 대화 교정</h2>
        {!compact && <p className="mt-0.5 text-[8px] font-semibold text-[#625e58]">질문과 답변의 문맥을 확인한 핵심 표현만 선정했습니다.</p>}
      </div>
      <p className="font-mono text-[8px] font-bold text-[#526057]">
        {total > 0 ? `${String(start).padStart(2, '0')}-${String(end).padStart(2, '0')} / 총 ${total}개` : '교정 없음'}
      </p>
    </header>
  );
}

function uniqueExplanations(correction: ReportCorrectionItem): string[] {
  const normalized = new Set<string>();
  return [correction.reason, correction.problem, correction.contextReason]
    .map((value) => value.trim())
    .filter((value) => {
      const key = value.replace(/\s+/g, ' ').toLowerCase();
      if (!key || normalized.has(key)) return false;
      normalized.add(key);
      return true;
    });
}

function CorrectionRow({ correction, sequence }: { correction: ReportCorrectionItem; sequence: number }) {
  const explanations = uniqueExplanations(correction);
  const compactComparison = correction.original.length + correction.suggested.length <= 190;
  return (
    <article className="report-correction border-t border-[#183c2c]/22 pt-1.5 first:border-t-0">
      <div className="grid grid-cols-[26px_minmax(0,1fr)_auto] items-baseline gap-2">
        <span className="font-mono text-[11px] font-black text-[#2f6f4f]">{String(sequence).padStart(2, '0')}</span>
        <p className="truncate text-[8px] font-black text-[#273a31]">{correction.topic} / {correction.difficulty}</p>
        <p className="text-[8px] font-black text-[#2f6f4f]">{correction.categoryLabel}</p>
      </div>

      {correction.assistantPrompt && (
        <div className="mt-1 grid grid-cols-[26px_minmax(0,1fr)] gap-2">
          <p className="text-[8px] font-black text-[#625e58]">Q</p>
          <p className="text-[9px] font-semibold leading-[1.35] text-[#333a36]">{correction.assistantPrompt}</p>
        </div>
      )}

      <div className={`mt-1 grid ${compactComparison ? 'grid-cols-2' : 'grid-cols-1'} gap-x-3 gap-y-1 pl-[34px]`}>
        <div className="grid grid-cols-[34px_minmax(0,1fr)] gap-1.5">
          <p className="text-[8px] font-black text-[#8b5543]">내 답변</p>
          <p className="text-[9px] font-bold leading-[1.35] text-[#4c413b]">{correction.original}</p>
        </div>
        <div className="grid grid-cols-[26px_minmax(0,1fr)] gap-1.5 border-l-2 border-[#2f6f4f] pl-2">
          <p className="text-[8px] font-black text-[#2f6f4f]">교정</p>
          <p className="text-[9px] font-black leading-[1.35] text-[#183c2c]">{correction.suggested}</p>
        </div>
      </div>

      <div className="mt-1.5 ml-[34px] grid grid-cols-[26px_minmax(0,1fr)] gap-x-2 gap-y-0.5 bg-[#f7f8f5] px-2 py-1.5">
        <p className="text-[8px] font-black text-[#8a5a12]">왜</p>
        <div className="space-y-0.5">
          {explanations.map((explanation) => (
            <p key={explanation} className="text-[8.5px] font-semibold leading-[1.35] text-[#494b47]">{explanation}</p>
          ))}
        </div>
        {correction.usageGuide && (
          <>
            <p className="text-[8px] font-black text-[#2f6f4f]">규칙</p>
            <p className="text-[8.5px] font-bold leading-[1.35] text-[#36473d]">{correction.usageGuide}</p>
          </>
        )}
      </div>
    </article>
  );
}

export function AssessmentPrintReport({
  messages,
  topicSegments,
  assessableAnswerCount,
  sessionScore,
  metrics,
  tier,
  cefrLevel,
  cefrReason,
  strength,
  improvement,
  onLayoutReady,
}: AssessmentPrintReportProps) {
  const corrections = useMemo(() => buildReportCorrections(messages, topicSegments), [messages, topicSegments]);
  const focusAreas = useMemo(() => buildLearningFocusAreas(messages, corrections), [messages, corrections]);
  const fallbackPages = useMemo(() => paginateReportCorrections(corrections, 720).map((page) => page.map((item) => item.id)), [corrections]);
  const [pageIds, setPageIds] = useState<string[][]>(() => fallbackPages.length > 0 ? fallbackPages : [[]]);
  const [layoutReady, setLayoutReady] = useState(false);
  const measurementSummaryRef = useRef<HTMLDivElement>(null);
  const measurementPageRef = useRef<HTMLDivElement>(null);
  const measurementHeaderRef = useRef<HTMLDivElement>(null);
  const measurementFooterRef = useRef<HTMLDivElement>(null);
  const measurementItemRefs = useRef(new Map<string, HTMLElement>());
  const reportDate = useMemo(() => new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date()), []);
  const sampleStatus = getReportSampleStatus(assessableAnswerCount);
  const correctionById = useMemo(() => new Map(corrections.map((item) => [item.id, item])), [corrections]);

  useLayoutEffect(() => {
    let cancelled = false;
    let frame = 0;
    const measure = () => {
      if (cancelled) return;
      const usableHeight = measurementPageRef.current?.getBoundingClientRect().height ?? 0;
      const summaryHeight = measurementSummaryRef.current?.getBoundingClientRect().height ?? 0;
      const repeatedHeaderHeight = measurementHeaderRef.current?.getBoundingClientRect().height ?? 0;
      const footerHeight = measurementFooterRef.current?.getBoundingClientRect().height ?? 0;
      const measurements = corrections.map((correction) => ({
        id: correction.id,
        height: measurementItemRefs.current.get(correction.id)?.getBoundingClientRect().height ?? 0,
      }));

      if (usableHeight <= 0 || measurements.some((measurement) => measurement.height <= 0)) {
        setPageIds(fallbackPages.length > 0 ? fallbackPages : [[]]);
        return;
      }

      const firstCapacity = usableHeight - summaryHeight - repeatedHeaderHeight - footerHeight - 18;
      const followingCapacity = usableHeight - repeatedHeaderHeight - footerHeight - 18;
      const nextPages = packMeasuredCorrections(measurements, firstCapacity, followingCapacity, 7);
      setPageIds((current) => (
        JSON.stringify(current) === JSON.stringify(nextPages) ? current : nextPages
      ));
    };
    const scheduleMeasure = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(measure);
    };

    scheduleMeasure();
    const markReady = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        measure();
        if (!cancelled) setLayoutReady(true);
      });
    };
    if (document.fonts?.ready) void document.fonts.ready.then(markReady);
    else markReady();
    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(scheduleMeasure);
    [
      measurementPageRef.current,
      measurementSummaryRef.current,
      measurementHeaderRef.current,
      measurementFooterRef.current,
      ...measurementItemRefs.current.values(),
    ].forEach((element) => {
      if (element) resizeObserver?.observe(element);
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
    };
  }, [corrections, fallbackPages, focusAreas]);

  useEffect(() => {
    if (!layoutReady || !onLayoutReady) return;
    const frame = window.requestAnimationFrame(onLayoutReady);
    return () => window.cancelAnimationFrame(frame);
  }, [layoutReady, onLayoutReady, pageIds]);

  const totalPages = Math.max(1, pageIds.length);
  const pageCorrections = pageIds.map((ids) => ids
    .map((id) => correctionById.get(id))
    .filter((item): item is ReportCorrectionItem => Boolean(item)));

  return (
    <section className="print-document assessment-print-document bg-white text-[#17251f]">
      <div className="report-measurement" aria-hidden="true">
        <div ref={measurementPageRef} className="report-usable-height" />
        <div ref={measurementSummaryRef}>
          <ReportSummary
            reportDate={reportDate}
            sampleStatus={sampleStatus}
            assessableAnswerCount={assessableAnswerCount}
            sessionScore={sessionScore}
            metrics={metrics}
            tier={tier}
            cefrLevel={cefrLevel}
            cefrReason={cefrReason}
            strength={strength}
            improvement={improvement}
            focusAreas={focusAreas}
          />
        </div>
        <div ref={measurementHeaderRef}><CorrectionsHeader start={1} end={corrections.length} total={corrections.length} /></div>
        <div ref={measurementFooterRef}><PageFooter page={1} total={1} /></div>
        <div className="report-correction-list">
          {corrections.map((correction, index) => (
            <div
              key={correction.id}
              ref={(node) => {
                if (node) measurementItemRefs.current.set(correction.id, node);
                else measurementItemRefs.current.delete(correction.id);
              }}
            >
              <CorrectionRow correction={correction} sequence={index + 1} />
            </div>
          ))}
        </div>
      </div>

      <div className="mx-auto">
        {pageCorrections.map((items, pageIndex) => {
          const isFirstPage = pageIndex === 0;
          const firstSequence = items.length > 0 ? corrections.findIndex((item) => item.id === items[0].id) + 1 : 0;
          const lastSequence = items.length > 0 ? corrections.findIndex((item) => item.id === items[items.length - 1].id) + 1 : 0;
          return (
            <article
              key={`report-page-${pageIndex + 1}`}
              className={`print-page flex flex-col ${pageIndex < totalPages - 1 ? 'break-after-page' : ''}`}
            >
              <div className="flex-1">
                {isFirstPage && (
                  <ReportSummary
                    reportDate={reportDate}
                    sampleStatus={sampleStatus}
                    assessableAnswerCount={assessableAnswerCount}
                    sessionScore={sessionScore}
                    metrics={metrics}
                    tier={tier}
                    cefrLevel={cefrLevel}
                    cefrReason={cefrReason}
                    strength={strength}
                    improvement={improvement}
                    focusAreas={focusAreas}
                  />
                )}
                {(!isFirstPage || items.length > 0 || corrections.length === 0) && (
                  <CorrectionsHeader
                    start={firstSequence}
                    end={lastSequence}
                    total={corrections.length}
                    compact={!isFirstPage}
                  />
                )}
                {corrections.length === 0 && (
                  <p className="py-4 text-[9px] font-semibold text-[#55514c]">이번 대화에서는 주요 교정이 필요한 표현이 확인되지 않았습니다.</p>
                )}
                <section className="report-correction-list mt-1.5 space-y-1.5">
                  {items.map((correction) => (
                    <CorrectionRow
                      key={correction.id}
                      correction={correction}
                      sequence={corrections.findIndex((item) => item.id === correction.id) + 1}
                    />
                  ))}
                </section>
              </div>
              <PageFooter page={pageIndex + 1} total={totalPages} />
            </article>
          );
        })}
      </div>
    </section>
  );
}
