import type { TopicSegment } from '@/lib/conversationTopics';
import type { ChatMessage, TurnEvaluation } from '@/stores/useStore';

export const TARGET_CORRECTION_MIN = 13;
export const TARGET_CORRECTION_MAX = 15;
export const ABSOLUTE_CORRECTION_MAX = 20;

export type ReportCorrectionCategory = NonNullable<TurnEvaluation['correction']['category']>;

export type ReportCorrectionItem = {
  id: string;
  conversationIndex: number;
  topic: string;
  difficulty: string;
  category: ReportCorrectionCategory;
  categoryLabel: string;
  assistantPrompt: string;
  original: string;
  suggested: string;
  reason: string;
  problem: string;
  usageGuide: string;
  contextReason: string;
  priority: NonNullable<TurnEvaluation['correction']['reportPriority']>;
  score: number;
  issueKey: string;
};

export type ReportSampleStatus = {
  kind: 'unavailable' | 'provisional' | 'limited' | 'standard';
  label: string;
  notice: string | null;
};

const CATEGORY_LABELS: Record<ReportCorrectionCategory, string> = {
  grammar: '문법',
  vocabulary: '어휘',
  naturalness: '자연스러운 표현',
  meaning_clarity: '의미 전달',
  comprehension: '질문 이해',
};

const CATEGORY_SCORES: Record<ReportCorrectionCategory, number> = {
  grammar: 15,
  vocabulary: 18,
  naturalness: 10,
  meaning_clarity: 22,
  comprehension: 25,
};

const PRIORITY_SCORES = { high: 60, medium: 40, low: 20, none: 0 } as const;
const NON_CONTENT_REASONS = new Set([
  'empty_input',
  'near_empty_input',
  'no_linguistic_signal',
  'non_speech_source',
  'conversation_control',
  'non_english_speech',
]);

function normalizeText(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

function cleanAssistantPrompt(text: string): string {
  return text.split(/\n\n(?:한국어 해석|Korean):/i)[0]?.trim() ?? text.trim();
}

function categoryFromEvaluation(evaluation: TurnEvaluation): ReportCorrectionCategory {
  const category = evaluation.correction.category;
  if (category && category in CATEGORY_LABELS) return category;
  const tags = evaluation.errorTags ?? [];
  if (tags.includes('word_choice')) return 'vocabulary';
  return 'grammar';
}

function isNaturalDirectAnswer(text: string): boolean {
  const normalized = normalizeText(text).replace(/[,;.!?]+/g, '').replace(/\s+/g, ' ').trim();
  return /^(yes|no|maybe|sure|of course|yes i do|no i don't|yes it is|no it isn't|yes i am|no i'm not)$/.test(normalized);
}

function isLengthOnlyExpansion(original: string, suggested: string): boolean {
  const originalWords = normalizeText(original).match(/[a-z']+/g) ?? [];
  const suggestedWords = normalizeText(suggested).match(/[a-z']+/g) ?? [];
  if (originalWords.length === 0 || suggestedWords.length <= originalWords.length) return false;
  let cursor = 0;
  suggestedWords.forEach((word) => {
    if (word === originalWords[cursor]) cursor += 1;
  });
  return cursor === originalWords.length;
}

function findAssistantPrompt(messages: ChatMessage[], userIndex: number): string {
  const userMessage = messages[userIndex];
  for (let index = userIndex - 1; index >= 0; index -= 1) {
    const candidate = messages[index];
    if (candidate.role !== 'assistant') continue;
    if (userMessage.segmentId && candidate.segmentId !== userMessage.segmentId) continue;
    if (!candidate.content.trim() || candidate.content.startsWith('(시스템)')) continue;
    return cleanAssistantPrompt(candidate.content);
  }
  return '';
}

function resolveSegment(message: ChatMessage, segments: TopicSegment[]): TopicSegment | undefined {
  if (!message.segmentId) return undefined;
  return segments.find((segment) => segment.segmentId === message.segmentId);
}

function isEligible(message: ChatMessage, evaluation: TurnEvaluation): boolean {
  const correction = evaluation.correction;
  const original = correction.original.trim() || message.content.trim();
  const suggested = correction.suggested.trim();
  if (!suggested || normalizeText(original) === normalizeText(suggested)) return false;
  if (evaluation.confidence.toLowerCase() === 'low') return false;
  if (message.evaluationSkipReason && NON_CONTENT_REASONS.has(message.evaluationSkipReason)) return false;
  if (correction.reportEligible === false || correction.meaningPreserved === false) return false;
  if (correction.reportPriority === 'none') return false;
  if (correction.contextFit === 'off_topic' || correction.contextFit === 'unknown') return false;

  const hasExplicitReportDecision = typeof correction.reportEligible === 'boolean';
  const category = categoryFromEvaluation(evaluation);
  const hasObservableError = (evaluation.errorTags?.length ?? 0) > 0;
  if (
    isNaturalDirectAnswer(original)
    && category !== 'comprehension'
    && category !== 'meaning_clarity'
  ) return false;
  if (
    (!hasExplicitReportDecision || category === 'naturalness')
    && !hasObservableError
    && isLengthOnlyExpansion(original, suggested)
  ) return false;
  return true;
}

function repeatedErrorCounts(messages: ChatMessage[]): Map<string, number> {
  const counts = new Map<string, number>();
  messages.forEach((message) => {
    if (message.role !== 'user' || !message.evaluation) return;
    new Set(message.evaluation.errorTags ?? []).forEach((tag) => {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    });
  });
  return counts;
}

export function buildReportCorrections(
  messages: ChatMessage[],
  segments: TopicSegment[],
): ReportCorrectionItem[] {
  const tagCounts = repeatedErrorCounts(messages);
  const candidates: ReportCorrectionItem[] = [];
  const exactCorrections = new Set<string>();

  messages.forEach((message, conversationIndex) => {
    if (message.role !== 'user' || !message.evaluation) return;
    const evaluation = message.evaluation;
    if (!isEligible(message, evaluation)) return;

    const original = evaluation.correction.original.trim() || message.content.trim();
    const suggested = evaluation.correction.suggested.trim();
    const exactKey = `${normalizeText(original)}=>${normalizeText(suggested)}`;
    if (exactCorrections.has(exactKey)) return;
    exactCorrections.add(exactKey);

    const category = categoryFromEvaluation(evaluation);
    const priority = evaluation.correction.reportPriority
      && evaluation.correction.reportPriority !== 'none'
      ? evaluation.correction.reportPriority
      : 'medium';
    const hasRepeatedError = (evaluation.errorTags ?? []).some((tag) => (tagCounts.get(tag) ?? 0) >= 2);
    const segment = resolveSegment(message, segments);
    const partialAnswerBonus = evaluation.correction.contextFit === 'partial' ? 10 : 0;
    const score = PRIORITY_SCORES[priority]
      + CATEGORY_SCORES[category]
      + partialAnswerBonus
      + (hasRepeatedError ? 8 : 0);

    candidates.push({
      id: message.id ?? evaluation.turnId,
      conversationIndex,
      topic: segment?.label ?? '일반 대화',
      difficulty: segment?.difficultyLabel ?? '정보 없음',
      category,
      categoryLabel: CATEGORY_LABELS[category],
      assistantPrompt: findAssistantPrompt(messages, conversationIndex),
      original,
      suggested,
      reason: evaluation.correction.reason.trim() || evaluation.correction.contextReason?.trim() || '문맥에 맞는 표현으로 다듬었습니다.',
      problem: evaluation.correction.problem?.trim() ?? '',
      usageGuide: evaluation.correction.usageGuide?.trim() ?? '',
      contextReason: evaluation.correction.contextReason?.trim() ?? '',
      priority,
      score,
      issueKey: `${category}:${normalizeText(evaluation.correction.reason).slice(0, 80)}`,
    });
  });

  const remaining = [...candidates];
  const ranked: ReportCorrectionItem[] = [];
  const topicCounts = new Map<string, number>();
  const categoryCounts = new Map<ReportCorrectionCategory, number>();
  const issueCounts = new Map<string, number>();

  while (remaining.length > 0) {
    remaining.sort((left, right) => {
      const leftTopicPenalty = Math.max(0, (topicCounts.get(left.topic) ?? 0) - 3) * 8;
      const rightTopicPenalty = Math.max(0, (topicCounts.get(right.topic) ?? 0) - 3) * 8;
      const leftCategoryPenalty = (categoryCounts.get(left.category) ?? 0) * 2;
      const rightCategoryPenalty = (categoryCounts.get(right.category) ?? 0) * 2;
      const leftIssuePenalty = Math.max(0, (issueCounts.get(left.issueKey) ?? 0) - 1) * 6;
      const rightIssuePenalty = Math.max(0, (issueCounts.get(right.issueKey) ?? 0) - 1) * 6;
      return (right.score - rightTopicPenalty - rightCategoryPenalty - rightIssuePenalty)
        - (left.score - leftTopicPenalty - leftCategoryPenalty - leftIssuePenalty)
        || left.conversationIndex - right.conversationIndex;
    });
    const selected = remaining.shift();
    if (!selected) break;
    ranked.push(selected);
    topicCounts.set(selected.topic, (topicCounts.get(selected.topic) ?? 0) + 1);
    categoryCounts.set(selected.category, (categoryCounts.get(selected.category) ?? 0) + 1);
    issueCounts.set(selected.issueKey, (issueCounts.get(selected.issueKey) ?? 0) + 1);
  }

  const selected = ranked.slice(0, TARGET_CORRECTION_MAX);
  for (const candidate of ranked.slice(TARGET_CORRECTION_MAX)) {
    if (selected.length >= ABSOLUTE_CORRECTION_MAX) break;
    const isCriticalExtra = candidate.priority === 'high'
      || candidate.category === 'comprehension'
      || candidate.category === 'meaning_clarity';
    if (isCriticalExtra) selected.push(candidate);
  }

  return selected.sort((left, right) => left.conversationIndex - right.conversationIndex);
}

export function getReportSampleStatus(assessableAnswerCount: number): ReportSampleStatus {
  if (assessableAnswerCount <= 0) {
    return { kind: 'unavailable', label: '평가 불가', notice: '평가 가능한 사용자 답변이 없습니다.' };
  }
  if (assessableAnswerCount <= 3) {
    return { kind: 'provisional', label: '임시 결과', notice: '대화 표본이 적어 현재 수준과 강점·약점은 잠정적인 결과입니다.' };
  }
  if (assessableAnswerCount <= 7) {
    return { kind: 'limited', label: '제한된 대화 기반 결과', notice: '대화 표본이 제한적이므로 수준과 경향은 추가 대화에서 달라질 수 있습니다.' };
  }
  return { kind: 'standard', label: '대화 기반 결과', notice: null };
}

function estimateLines(text: string, charactersPerLine: number): number {
  return Math.max(1, Math.ceil(text.trim().length / charactersPerLine));
}

function estimateCorrectionHeight(item: ReportCorrectionItem): number {
  return 92
    + estimateLines(item.assistantPrompt, 82) * 12
    + estimateLines(item.original, 48) * 14
    + estimateLines(item.suggested, 48) * 14
    + estimateLines(item.reason, 72) * 12
    + (item.problem ? estimateLines(item.problem, 68) * 12 + 18 : 0)
    + (item.usageGuide ? estimateLines(item.usageGuide, 68) * 12 + 18 : 0)
    + (item.contextReason ? estimateLines(item.contextReason, 68) * 12 + 18 : 0);
}

export function paginateReportCorrections(
  corrections: ReportCorrectionItem[],
  pageCapacity = 900,
): ReportCorrectionItem[][] {
  const pages: ReportCorrectionItem[][] = [];
  let page: ReportCorrectionItem[] = [];
  let used = 0;
  corrections.forEach((correction) => {
    const height = estimateCorrectionHeight(correction);
    if (page.length > 0 && used + height > pageCapacity) {
      pages.push(page);
      page = [];
      used = 0;
    }
    page.push(correction);
    used += height;
  });
  if (page.length > 0) pages.push(page);
  return pages;
}
