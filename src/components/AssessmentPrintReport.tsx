'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { TopicSegment } from '@/lib/conversationTopics';
import { buildLearningFocusAreas, type LearningFocusArea } from '@/lib/learningFocusAreas';
import {
  buildReportContent,
  getReportSampleStatus,
  paginateReportCorrections,
  type ReportCorrectionItem,
} from '@/lib/reportCorrections';
import { packMeasuredCorrections } from '@/lib/reportPagination';
import { getFriendlySpeakingLevel, getMetricPresentation } from '@/lib/assessmentPresentation';
import {
  buildReportFindingEvidence,
  type ReportFindingEvidence,
  type ReportFindingEvidenceSummary,
} from '@/lib/reportFindingEvidence';
import type { ChatMessage } from '@/stores/useStore';

type Metric = { key: string; label: string; value: number };
type PrintLayoutMode = 'paginated' | 'natural';

type AssessmentPrintReportProps = {
  messages: ChatMessage[];
  topicSegments: TopicSegment[];
  assessableAnswerCount: number;
  reliableAnswerCount: number;
  metrics: Metric[];
  tier: { label: string; textColor: string; totalLp: number; asset?: ReactNode };
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
  reliableAnswerCount,
}: {
  reportDate: string;
  sampleLabel: string;
  assessableAnswerCount: number;
  reliableAnswerCount: number;
}) {
  return (
    <header className="report-main-header flex items-end justify-between border-b-2 border-[#183c2c] pb-2">
      <div>
        <p className="text-[9px] font-bold text-[#526057]">영어 말하기 평가</p>
        <h1 className="mt-0.5 text-[22px] font-black tracking-tight text-[#17251f]">영어 코치 리포트</h1>
      </div>
      <dl className="grid grid-cols-[auto_auto] gap-x-2 gap-y-0.5 text-right text-[8px] leading-tight text-[#625e58]">
        <dt>평가 기준</dt><dd className="font-bold text-[#273a31]">{sampleLabel}</dd>
        <dt>신뢰 응답</dt><dd className="font-mono font-bold text-[#273a31]">{reliableAnswerCount} / {assessableAnswerCount}개</dd>
        <dt>작성일</dt><dd className="font-mono font-bold text-[#273a31]">{reportDate}</dd>
      </dl>
    </header>
  );
}

function LearningFocusSection({
  areas,
  assessableAnswerCount,
  isHighlightReport,
  strength,
  improvement,
  findingEvidence,
}: {
  areas: LearningFocusArea[];
  assessableAnswerCount: number;
  isHighlightReport: boolean;
  strength: string;
  improvement: string;
  findingEvidence: ReportFindingEvidenceSummary;
}) {
  const isProvisional = assessableAnswerCount < 4;
  return (
    <section className="report-focus-section mt-3">
      <div className="flex items-baseline justify-between border-b border-[#183c2c]/30 pb-1">
        <h2 className="text-[13px] font-black text-[#17251f]">이번 대화에서 잘한 점과 보완할 점</h2>
        <p className="text-[8px] font-semibold text-[#625e58]">신뢰 응답의 점수와 반복 근거를 함께 분석</p>
      </div>
      <div className="grid grid-cols-2 gap-4 py-2">
        <article className="border-l-2 border-[#2f6f4f] bg-[#f2f7f3] px-2.5 py-2">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-[10px] font-black text-[#2f6f4f]">{isProvisional ? '잠정 강점' : '강점'}</h3>
            <p className="text-[7.5px] font-bold text-[#526057]">계속 유지해 보세요</p>
          </div>
          <p className="mt-1 text-[9.5px] font-black leading-[1.4] text-[#273a31]">{strength}</p>
          <p className="mt-1 text-[8.5px] font-semibold leading-[1.35] text-[#526057]">
            {isHighlightReport
              ? '이번 대화에서 잘한 문장과 다시 활용하기 좋은 표현을 아래에 모았습니다.'
              : '안정적으로 사용한 방식은 다음 대화에서도 같은 흐름으로 이어가면 좋습니다.'}
          </p>
          <FindingEvidenceBlock finding={findingEvidence.strength} tone="strength" />
        </article>

        <article className="border-l-2 border-[#b77f1e] bg-[#fff8ea] px-2.5 py-2">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-[10px] font-black text-[#8a5a12]">{isProvisional ? '잠정 보완점' : '보완할 점'}</h3>
            <p className="text-[7.5px] font-bold text-[#765c2d]">다음 연습의 우선순위</p>
          </div>
          <p className="mt-1 text-[9.5px] font-black leading-[1.4] text-[#3f382e]">{improvement}</p>
          <FindingEvidenceBlock finding={findingEvidence.improvement} tone="improvement" />
          {areas.length > 0 ? (
            <div className="mt-1.5 space-y-1.5">
              {areas.map((area) => (
                <div key={area.id} className="border-t border-[#b77f1e]/20 pt-1.5 first:border-t-0 first:pt-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-[8.5px] font-black text-[#6f501c]">{area.label}</p>
                    <p className="shrink-0 text-[7.5px] font-bold text-[#765c2d]">{area.statusLabel}</p>
                  </div>
                  <p className="mt-0.5 text-[8px] font-semibold leading-[1.3] text-[#5e5549]">{area.explanation}</p>
                  {area.evidence.length > 0 && (
                    <ul className="mt-1 space-y-0.5 border-l border-[#b77f1e]/30 pl-1.5 text-[7.5px] font-semibold leading-[1.3] text-[#5e5549]">
                      {area.evidence.map((evidence) => <li key={evidence}>• {evidence}</li>)}
                    </ul>
                  )}
                  {area.correctionNumbers.length > 0 && (
                    <p className="mt-0.5 text-[7.5px] font-black text-[#8a5a12]">
                      관련 교정 {area.correctionNumbers.map((number) => `#${String(number).padStart(2, '0')}`).join(', ')}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-1 text-[8.5px] font-semibold leading-[1.35] text-[#765c2d]">
              {isProvisional
                ? '대화 표본이 적어 약점으로 단정하지 않고 다음 대화에서 더 관찰합니다.'
                : '같은 문제가 여러 답변에서 반복되지는 않았습니다. 가장 낮은 역량부터 가볍게 연습해 보세요.'}
            </p>
          )}
        </article>
      </div>
    </section>
  );
}

function FindingEvidenceBlock({
  finding,
  tone,
}: {
  finding: ReportFindingEvidence;
  tone: 'strength' | 'improvement';
}) {
  const colors = tone === 'strength'
    ? { border: 'border-[#2f6f4f]/25', title: 'text-[#2f6f4f]', body: 'text-[#526057]' }
    : { border: 'border-[#b77f1e]/30', title: 'text-[#8a5a12]', body: 'text-[#665b49]' };

  return (
    <div
      className={`report-finding-evidence mt-1.5 border-t pt-1.5 ${colors.border}`}
      aria-label={`${tone === 'strength' ? '강점' : '보완점'} 판단 근거`}
    >
      <p className={`text-[7.5px] font-black ${colors.title}`}>판단 근거</p>
      <p className={`mt-0.5 text-[7.5px] font-semibold leading-[1.3] ${colors.body}`}>{finding.explanation}</p>
      {finding.items.length > 0 && (
        <ol className="mt-1 space-y-1">
          {finding.items.map((item, index) => (
            <li key={`${item.quote}-${index}`} className={`border-l pl-1.5 ${colors.border}`}>
              <p className="text-[7.5px] font-black leading-[1.3] text-[#343d38]">“{item.quote}”</p>
              <p className={`mt-0.5 text-[7px] font-semibold leading-[1.3] ${colors.body}`}>{item.reason}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function ReportSummary({
  reportDate,
  sampleStatus,
  assessableAnswerCount,
  reliableAnswerCount,
  metrics,
  tier,
  cefrLevel,
  cefrReason,
  strength,
  improvement,
  focusAreas,
  isHighlightReport,
  findingEvidence,
}: {
  reportDate: string;
  sampleStatus: ReturnType<typeof getReportSampleStatus>;
  assessableAnswerCount: number;
  reliableAnswerCount: number;
  metrics: Metric[];
  tier: AssessmentPrintReportProps['tier'];
  cefrLevel: string;
  cefrReason: string;
  strength: string;
  improvement: string;
  focusAreas: LearningFocusArea[];
  isHighlightReport: boolean;
  findingEvidence: ReportFindingEvidenceSummary;
}) {
  const levelPrefix = assessableAnswerCount <= 7 ? '예상' : '현재';
  const speakingLevel = getFriendlySpeakingLevel(cefrLevel);
  return (
    <div className="report-summary">
      <ReportHeader
        reportDate={reportDate}
        sampleLabel={sampleStatus.label}
        assessableAnswerCount={assessableAnswerCount}
        reliableAnswerCount={reliableAnswerCount}
      />
      {sampleStatus.notice && (
        <p className="mt-2 border-l-2 border-[#b77f1e] bg-[#fff8ea] px-2 py-1.5 text-[8.5px] font-bold leading-[1.35] text-[#654d24]">
          {sampleStatus.notice}
        </p>
      )}

      <section className="mt-2 grid grid-cols-[112px_1fr] border-y border-[#183c2c]/30 py-2">
        <div className="flex items-center gap-2 border-r border-[#183c2c]/15 pr-3">
          {tier.asset ? <div className="report-tier-asset shrink-0">{tier.asset}</div> : null}
          <div className="min-w-0">
            <p className="text-[8px] font-bold text-[#625e58]">현재 티어</p>
            <p className="mt-0.5 whitespace-nowrap text-[10px] font-black" style={{ color: tier.textColor }}>{tier.label}</p>
            <p className="mt-0.5 text-[8px] font-bold text-[#625e58]">총 {tier.totalLp} LP</p>
          </div>
        </div>
        <div className="pl-3">
          <p className="text-[8px] font-bold text-[#625e58]">{levelPrefix} 말하기 수준</p>
          <p className="mt-0.5 text-[15px] font-black leading-none text-[#17251f]">{speakingLevel.label}</p>
          <p className="mt-1 text-[8.5px] font-bold leading-[1.35] text-[#3f4541]">{speakingLevel.description}</p>
          <p className="mt-1 text-[8px] font-semibold leading-[1.35] text-[#625e58]">{cefrReason || '현재 응답을 바탕으로 말하기 수준을 살펴봤습니다.'}</p>
        </div>
      </section>

      <section className="border-b border-[#183c2c]/30 py-2" aria-label="핵심 역량">
        <div className="mb-1.5 flex items-center justify-between">
          <h2 className="text-[11px] font-black text-[#17251f]">핵심 역량</h2>
          <p className="text-[7.5px] font-semibold text-[#625e58]">세션 전체 신뢰 응답 평균</p>
        </div>
        <div className="grid gap-1.5">
          {metrics.map((metric) => {
            const presentation = getMetricPresentation(metric.value);
            const displayValue = Math.round(Math.max(0, Math.min(100, metric.value)));
            return (
              <div key={metric.key} className="grid min-w-0 grid-cols-[78px_minmax(0,1fr)_48px] items-center gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[8.5px] font-black text-[#273a31]">{metric.label}</p>
                  <p className="mt-0.5 text-[7.5px] font-bold text-[#526057]">{presentation.label}</p>
                </div>
                <div
                  className="relative h-2 border-b border-[#183c2c]/25"
                  role="progressbar"
                  aria-label={`${metric.label}: ${presentation.label}, ${displayValue}점`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={displayValue}
                >
                  <span className="absolute bottom-0 left-0 block h-1.5 bg-[#2f6f4f]" style={{ width: `${displayValue}%` }} />
                </div>
                <p className="text-right font-mono text-[13px] font-black tabular-nums text-[#183c2c]">{displayValue}점</p>
              </div>
            );
          })}
        </div>
      </section>

      <LearningFocusSection
        areas={focusAreas}
        assessableAnswerCount={assessableAnswerCount}
        isHighlightReport={isHighlightReport}
        strength={strength}
        improvement={improvement}
        findingEvidence={findingEvidence}
      />
    </div>
  );
}

function CorrectionsHeader({
  start,
  end,
  total,
  compact = false,
  contentKind = 'corrections',
}: {
  start: number;
  end: number;
  total: number;
  compact?: boolean;
  contentKind?: 'corrections' | 'highlights' | 'mixed';
}) {
  const title = contentKind === 'mixed'
    ? '학습 문장 모음'
    : contentKind === 'highlights'
      ? '대화 하이라이트'
      : '주요 대화 교정';
  const description = contentKind === 'mixed'
    ? '확정 교정, 참고할 표현 제안, 다시 활용할 주요 발화를 구분해 모았습니다.'
    : contentKind === 'highlights'
      ? '잘한 문장과 다음 대화에서도 활용하기 좋은 표현을 모았습니다.'
      : '질문과 답변의 문맥을 확인한 핵심 표현만 선정했습니다.';
  return (
    <header className={`report-corrections-header flex items-end justify-between border-b-2 border-[#183c2c] ${compact ? 'pb-1.5' : 'mt-3 pb-1.5'}`}>
      <div>
        <h2 className={`${compact ? 'text-[15px]' : 'text-[13px]'} font-black tracking-tight text-[#17251f]`}>{title}</h2>
        {!compact && <p className="mt-0.5 text-[8px] font-semibold text-[#625e58]">{description}</p>}
      </div>
      <p className="font-mono text-[8px] font-bold text-[#526057]">
        {total > 0 ? `${String(start).padStart(2, '0')}-${String(end).padStart(2, '0')} / 총 ${total}개` : contentKind === 'highlights' ? '하이라이트 없음' : '교정 없음'}
      </p>
    </header>
  );
}

function correctionExplanations(correction: ReportCorrectionItem) {
  const rawProblem = correction.problem.trim();
  const problem = rawProblem && !/^[a-z][a-z0-9_ ,-]*$/i.test(rawProblem)
    ? rawProblem
    : correction.reason.trim();
  const context = correction.contextReason.trim();
  const usage = correction.usageGuide.trim();
  const normalize = (value: string) => value.replace(/\s+/g, ' ').toLowerCase();
  return {
    problem,
    context: normalize(context) === normalize(problem) ? '' : context,
    usage: [problem, context].some((value) => normalize(value) === normalize(usage)) ? '' : usage,
  };
}

function CorrectionRow({ correction, sequence }: { correction: ReportCorrectionItem; sequence: number }) {
  const isHighlight = correction.kind === 'key_utterance';
  if (isHighlight) {
    return (
      <article className="report-correction report-highlight border-t border-[#183c2c]/22 pt-1.5 first:border-t-0">
        <div className="grid grid-cols-[26px_minmax(0,1fr)_auto] items-baseline gap-2">
          <span className="font-mono text-[11px] font-black text-[#2f6f4f]">{String(sequence).padStart(2, '0')}</span>
          <p className="truncate text-[8px] font-black text-[#273a31]">{correction.topic} / {correction.difficulty}</p>
          <p className="text-[8px] font-black text-[#2f6f4f]">{correction.categoryLabel}</p>
        </div>
        {correction.assistantPrompt && (
          <div className="mt-1 grid grid-cols-[42px_minmax(0,1fr)] gap-2">
            <p className="text-[8px] font-black text-[#625e58]">AI 응답</p>
            <p className="text-[9px] font-semibold leading-[1.35] text-[#333a36]">{correction.assistantPrompt}</p>
          </div>
        )}
        <div className="mt-1 grid grid-cols-[42px_minmax(0,1fr)] gap-2">
          <p className="text-[8px] font-black text-[#2f6f4f]">내 답변</p>
          <p className="text-[9px] font-black leading-[1.35] text-[#183c2c]">{correction.original}</p>
        </div>
        <div className="mt-1.5 ml-[50px] grid grid-cols-[34px_minmax(0,1fr)] gap-2 bg-[#f2f7f3] px-2 py-1.5">
          <p className="text-[8px] font-black text-[#2f6f4f]">칭찬</p>
          <p className="text-[8.5px] font-bold leading-[1.35] text-[#36473d]">{correction.reason}</p>
        </div>
      </article>
    );
  }

  if (correction.kind === 'teacher_review') {
    return (
      <article className="report-correction report-teacher-review border-t border-[#183c2c]/22 pt-1.5 first:border-t-0">
        <div className="grid grid-cols-[26px_minmax(0,1fr)_auto] items-baseline gap-2">
          <span className="font-mono text-[11px] font-black text-[#8a5a12]">{String(sequence).padStart(2, '0')}</span>
          <p className="truncate text-[8px] font-black text-[#273a31]">{correction.topic} / {correction.difficulty}</p>
          <p className="text-[8px] font-black text-[#8a5a12]">표현 참고</p>
        </div>
        {correction.assistantPrompt && (
          <div className="mt-1 grid grid-cols-[42px_minmax(0,1fr)] gap-2">
            <p className="text-[8px] font-black text-[#625e58]">AI 질문</p>
            <p className="text-[9px] font-semibold leading-[1.35] text-[#333a36]">{correction.assistantPrompt}</p>
          </div>
        )}
        <div className="mt-1 grid grid-cols-[42px_minmax(0,1fr)] gap-2">
          <p className="text-[8px] font-black text-[#8a5a12]">학습자</p>
          <p className="text-[9px] font-black leading-[1.35] text-[#3f382e]">{correction.original}</p>
        </div>
        <div className="mt-1.5 ml-[50px] bg-[#fff8ea] px-2 py-1.5">
          {correction.suggested && (
            <div className="grid grid-cols-[54px_minmax(0,1fr)] gap-2">
              <p className="text-[8px] font-black text-[#8a5a12]">표현 제안</p>
              <p className="text-[8.5px] font-bold leading-[1.35] text-[#4d4435]">{correction.suggested}</p>
            </div>
          )}
          <p className="mt-1 text-[8px] font-semibold leading-[1.35] text-[#665b49]">
            {correction.reason} 상황과 의도에 따라 달라질 수 있는 참고 표현입니다.
          </p>
        </div>
      </article>
    );
  }

  const explanations = correctionExplanations(correction);
  const compactComparison = correction.original.length + correction.suggested.length <= 190;
  return (
    <article className="report-correction border-t border-[#183c2c]/22 pt-1.5 first:border-t-0">
      <div className="grid grid-cols-[26px_minmax(0,1fr)_auto] items-baseline gap-2">
        <span className="font-mono text-[11px] font-black text-[#2f6f4f]">{String(sequence).padStart(2, '0')}</span>
        <p className="truncate text-[8px] font-black text-[#273a31]">{correction.topic} / {correction.difficulty}</p>
        <p className="text-[8px] font-black text-[#2f6f4f]">{correction.categoryLabel}</p>
      </div>

      {correction.assistantPrompt && (
        <div className="mt-1 grid grid-cols-[42px_minmax(0,1fr)] gap-2">
          <p className="text-[8px] font-black text-[#625e58]">AI 응답</p>
          <p className="text-[9px] font-semibold leading-[1.35] text-[#333a36]">{correction.assistantPrompt}</p>
        </div>
      )}

      <div className={`mt-1 grid ${compactComparison ? 'grid-cols-2' : 'grid-cols-1'} gap-x-3 gap-y-1 pl-[50px]`}>
        <div className="grid grid-cols-[34px_minmax(0,1fr)] gap-1.5">
          <p className="text-[8px] font-black text-[#8b5543]">내 답변</p>
          <p className="text-[9px] font-bold leading-[1.35] text-[#4c413b]">{correction.original}</p>
        </div>
        <div className="grid grid-cols-[26px_minmax(0,1fr)] gap-1.5 border-l-2 border-[#2f6f4f] pl-2">
          <p className="text-[8px] font-black text-[#2f6f4f]">교정</p>
          <p className="text-[9px] font-black leading-[1.35] text-[#183c2c]">{correction.suggested}</p>
        </div>
      </div>

      <div className="mt-1.5 ml-[50px] grid grid-cols-[28px_minmax(0,1fr)] gap-x-2 gap-y-0.5 bg-[#f7f8f5] px-2 py-1.5">
        <p className="text-[8px] font-black text-[#8a5a12]">문제</p>
        <p className="text-[8.5px] font-semibold leading-[1.35] text-[#494b47]">{explanations.problem}</p>
        {explanations.context && <><p className="text-[8px] font-black text-[#625e58]">문맥</p><p className="text-[8.5px] font-semibold leading-[1.35] text-[#494b47]">{explanations.context}</p></>}
        {explanations.usage && <><p className="text-[8px] font-black text-[#2f6f4f]">사용</p><p className="text-[8.5px] font-bold leading-[1.35] text-[#36473d]">{explanations.usage}</p></>}
      </div>
    </article>
  );
}

export function AssessmentPrintReport({
  messages,
  topicSegments,
  assessableAnswerCount,
  reliableAnswerCount,
  metrics,
  tier,
  cefrLevel,
  cefrReason,
  strength,
  improvement,
  onLayoutReady,
}: AssessmentPrintReportProps) {
  const reportContent = useMemo(() => buildReportContent(messages, topicSegments), [messages, topicSegments]);
  const correctionItems = reportContent.corrections;
  const corrections = reportContent.items;
  const isHighlightReport = correctionItems.length === 0
    && reportContent.reviewItems.length === 0
    && reportContent.keyUtterances.length > 0;
  const contentKind = reportContent.reviewItems.length > 0
    || (correctionItems.length > 0 && reportContent.keyUtterances.length > 0)
    ? 'mixed'
    : isHighlightReport
      ? 'highlights'
      : 'corrections';
  const focusAreas = useMemo(() => buildLearningFocusAreas(messages, correctionItems), [messages, correctionItems]);
  const findingEvidence = useMemo(() => buildReportFindingEvidence(messages, metrics), [messages, metrics]);
  const fallbackPages = useMemo(() => paginateReportCorrections(corrections, 720).map((page) => page.map((item) => item.id)), [corrections]);
  const [pageIds, setPageIds] = useState<string[][]>(() => fallbackPages.length > 0 ? fallbackPages : [[]]);
  const [layoutReady, setLayoutReady] = useState(false);
  const [layoutMode, setLayoutMode] = useState<PrintLayoutMode>('paginated');
  const [measurementReady, setMeasurementReady] = useState(false);
  const measurementSummaryRef = useRef<HTMLDivElement>(null);
  const measurementPageRef = useRef<HTMLDivElement>(null);
  const measurementHeaderRef = useRef<HTMLDivElement>(null);
  const measurementFooterRef = useRef<HTMLDivElement>(null);
  const measurementItemRefs = useRef(new Map<string, HTMLElement>());
  const renderedPageRefs = useRef(new Map<number, HTMLElement>());
  const verificationPassRef = useRef(0);
  const layoutNotifiedRef = useRef(false);
  const layoutRevisionRef = useRef(0);
  const reportDate = useMemo(() => new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date()), []);
  const sampleStatus = getReportSampleStatus(reliableAnswerCount);
  const correctionById = useMemo(() => new Map(corrections.map((item) => [item.id, item])), [corrections]);
  const resolvedPageIds = useMemo(() => {
    const flattened = pageIds.flat();
    const matchesCurrentItems = flattened.length === corrections.length
      && flattened.every((id) => correctionById.has(id));
    return matchesCurrentItems ? pageIds : (fallbackPages.length > 0 ? fallbackPages : [[]]);
  }, [correctionById, corrections.length, fallbackPages, pageIds]);

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
        setLayoutReady(false);
        setLayoutMode('natural');
        setPageIds(fallbackPages.length > 0 ? fallbackPages : [[]]);
        setMeasurementReady(true);
        return;
      }

      const firstCapacity = usableHeight - summaryHeight - repeatedHeaderHeight - footerHeight - 18;
      const followingCapacity = usableHeight - repeatedHeaderHeight - footerHeight - 18;
      const nextPages = packMeasuredCorrections(measurements, firstCapacity, followingCapacity, 7);
      verificationPassRef.current = 0;
      setLayoutReady(false);
      setLayoutMode('paginated');
      setPageIds((current) => (
        JSON.stringify(current) === JSON.stringify(nextPages) ? current : nextPages
      ));
      setMeasurementReady(true);
    };
    const scheduleMeasure = () => {
      layoutRevisionRef.current += 1;
      setMeasurementReady(false);
      setLayoutReady(false);
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(measure);
    };

    scheduleMeasure();
    if (document.fonts?.ready) void document.fonts.ready.then(scheduleMeasure);
    else scheduleMeasure();
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
  }, [corrections, fallbackPages, findingEvidence, focusAreas]);

  useLayoutEffect(() => {
    let cancelled = false;
    const frame = window.requestAnimationFrame(() => {
      if (cancelled || !measurementReady) return;
      if (layoutMode === 'natural') {
        setLayoutReady(true);
        return;
      }

      const overflowingPageIndex = resolvedPageIds.findIndex((_, pageIndex) => {
        const page = renderedPageRefs.current.get(pageIndex);
        return Boolean(page && page.scrollHeight > page.clientHeight + 1);
      });
      if (overflowingPageIndex < 0) {
        setLayoutReady(true);
        return;
      }

      const overflowingItems = resolvedPageIds[overflowingPageIndex] ?? [];
      const canMoveWholeItem = overflowingItems.length > 0
        && (overflowingPageIndex === 0 || overflowingItems.length > 1);
      verificationPassRef.current += 1;
      const verificationLimit = corrections.length + resolvedPageIds.length + 2;
      if (!canMoveWholeItem || verificationPassRef.current > verificationLimit) {
        setLayoutMode('natural');
        setLayoutReady(false);
        return;
      }

      const nextPages = resolvedPageIds.map((page) => [...page]);
      const movedId = nextPages[overflowingPageIndex].pop();
      if (!movedId) {
        setLayoutMode('natural');
        setLayoutReady(false);
        return;
      }
      if (!nextPages[overflowingPageIndex + 1]) nextPages.push([]);
      nextPages[overflowingPageIndex + 1].unshift(movedId);
      setLayoutReady(false);
      setPageIds(nextPages.filter((page, index) => page.length > 0 || index === 0));
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [corrections.length, layoutMode, measurementReady, resolvedPageIds]);

  useEffect(() => {
    if (!layoutReady || !onLayoutReady) return;
    if (layoutNotifiedRef.current) return;
    const scheduledRevision = layoutRevisionRef.current;
    const frame = window.requestAnimationFrame(() => {
      if (
        layoutNotifiedRef.current
        || layoutRevisionRef.current !== scheduledRevision
      ) return;
      layoutNotifiedRef.current = true;
      onLayoutReady();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [layoutReady, onLayoutReady]);

  const totalPages = Math.max(1, resolvedPageIds.length);
  const pageCorrections = resolvedPageIds.map((ids) => ids
    .map((id) => correctionById.get(id))
    .filter((item): item is ReportCorrectionItem => Boolean(item)));

  return (
    <section
      className={`print-document assessment-print-document bg-white text-[#17251f] ${layoutMode === 'natural' ? 'print-document--natural' : 'print-document--paginated'}`}
      data-layout-ready={layoutReady ? 'true' : 'false'}
      data-layout-mode={layoutMode}
    >
      <div className="report-measurement" aria-hidden="true">
        <div ref={measurementPageRef} className="report-usable-height" />
        <div ref={measurementSummaryRef}>
          <ReportSummary
            reportDate={reportDate}
            sampleStatus={sampleStatus}
            assessableAnswerCount={assessableAnswerCount}
            reliableAnswerCount={reliableAnswerCount}
            metrics={metrics}
            tier={tier}
            cefrLevel={cefrLevel}
            cefrReason={cefrReason}
            strength={strength}
            improvement={improvement}
            focusAreas={focusAreas}
            isHighlightReport={isHighlightReport}
            findingEvidence={findingEvidence}
          />
        </div>
        <div ref={measurementHeaderRef}><CorrectionsHeader start={1} end={corrections.length} total={corrections.length} contentKind={contentKind} /></div>
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
              ref={(node) => {
                if (node) renderedPageRefs.current.set(pageIndex, node);
                else renderedPageRefs.current.delete(pageIndex);
              }}
              data-report-page={pageIndex + 1}
              className={`print-page flex flex-col ${pageIndex < totalPages - 1 ? 'break-after-page' : ''}`}
            >
              <div className="flex-1">
                {isFirstPage && (
                  <ReportSummary
                    reportDate={reportDate}
                    sampleStatus={sampleStatus}
                    assessableAnswerCount={assessableAnswerCount}
                    reliableAnswerCount={reliableAnswerCount}
                    metrics={metrics}
                    tier={tier}
                    cefrLevel={cefrLevel}
                    cefrReason={cefrReason}
                    strength={strength}
                    improvement={improvement}
                    focusAreas={focusAreas}
                    isHighlightReport={isHighlightReport}
                    findingEvidence={findingEvidence}
                  />
                )}
                {(!isFirstPage || items.length > 0 || corrections.length === 0) && (
                  <CorrectionsHeader
                    start={firstSequence}
                    end={lastSequence}
                    total={corrections.length}
                    compact={!isFirstPage}
                    contentKind={contentKind}
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
