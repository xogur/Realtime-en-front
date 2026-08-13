import type { TopicSegment } from '@/lib/conversationTopics';
import type { ChatMessage, TurnEvaluation } from '@/stores/useStore';

export const TARGET_CORRECTION_MIN = 13;
export const TARGET_CORRECTION_MAX = 15;
export const ABSOLUTE_CORRECTION_MAX = 20;

export type ReportCorrectionCategory = NonNullable<TurnEvaluation['correction']['category']>;
export type ReportItemKind = 'confirmed_correction' | 'teacher_review' | 'key_utterance';

export type ReportCorrectionItem = {
  kind: ReportItemKind;
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
  issueCode: string;
  errorTags: string[];
};

export type ReportSampleStatus = {
  kind: 'unavailable' | 'provisional' | 'limited' | 'standard';
  label: string;
  notice: string | null;
};

export type ReportContent = {
  corrections: ReportCorrectionItem[];
  reviewItems: ReportCorrectionItem[];
  keyUtterances: ReportCorrectionItem[];
  highlights: ReportCorrectionItem[];
  items: ReportCorrectionItem[];
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
  return originalWords.every((word, index) => suggestedWords[index] === word);
}

function wordsOnly(text: string): string {
  return normalizeText(text).replace(/[^a-z0-9']+/g, ' ').trim();
}

function isPunctuationOrCaseOnly(original: string, suggested: string): boolean {
  const originalWords = wordsOnly(original);
  return Boolean(originalWords && originalWords === wordsOnly(suggested));
}

function isOptionalPolitenessRewrite(original: string, suggested: string): boolean {
  const source = wordsOnly(original).replace(/ please$/, '');
  const target = wordsOnly(suggested).replace(/ please$/, '');
  const sourceRequest = source.match(/^(?:can i have|i want) (.+)$/);
  const targetRequest = target.match(/^could i have (.+)$/);
  if (sourceRequest?.[1] && sourceRequest[1] === targetRequest?.[1]) return true;
  const sourcePreference = source.match(/^i want (.+)$/)?.[1]?.replace(/^(?:a|an|the) /, '');
  const targetPreference = target.match(/^i would like (.+)$/)?.[1]?.replace(/^(?:a|an|the) /, '');
  if (sourcePreference && sourcePreference === targetPreference) return true;
  return source === "no i don't have a table"
    && /^(?:no )?(?:i|we) don't have (?:a |the )?table reserved$/.test(target);
}

function hasExactObservableSpan(evaluation: TurnEvaluation, original: string): boolean {
  const { decision, errorSpan, correctedSpan } = evaluation.correction;
  return decision === 'confirmed_error'
    && Boolean(errorSpan?.trim())
    && Boolean(correctedSpan?.trim())
    && normalizeText(original).includes(normalizeText(errorSpan ?? ''));
}

function findAssistantPrompt(messages: ChatMessage[], userIndex: number): string {
  const userMessage = messages[userIndex];
  const findPreviousAssistant = (requireSameSegment: boolean): string => {
    for (let index = userIndex - 1; index >= 0; index -= 1) {
      const candidate = messages[index];
      if (candidate.role !== 'assistant') continue;
      if (requireSameSegment && candidate.segmentId !== userMessage.segmentId) continue;
      if (!candidate.content.trim() || candidate.content.startsWith('(시스템)')) continue;
      return cleanAssistantPrompt(candidate.content);
    }
    return '';
  };

  if (userMessage.segmentId) {
    const sameSegmentPrompt = findPreviousAssistant(true);
    if (sameSegmentPrompt) return sameSegmentPrompt;
  }
  return findPreviousAssistant(false);
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

  const category = categoryFromEvaluation(evaluation);
  const hasObservableError = (evaluation.errorTags?.length ?? 0) > 0;
  if (correction.decision && correction.decision !== 'confirmed_error') return false;
  if (isPunctuationOrCaseOnly(original, suggested)) return false;
  if (isLengthOnlyExpansion(original, suggested)) return false;
  if (isOptionalPolitenessRewrite(original, suggested)) return false;
  if (
    isNaturalDirectAnswer(original)
    && category !== 'comprehension'
    && category !== 'meaning_clarity'
  ) return false;
  if (
    ['grammar', 'vocabulary', 'naturalness'].includes(category)
    && !hasObservableError
    && !hasExactObservableSpan(evaluation, original)
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
      kind: 'confirmed_correction',
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
      issueCode: evaluation.correction.issueCode?.trim()
        || evaluation.errorTags?.[0]
        || `${category}:${normalizeText(evaluation.correction.reason).slice(0, 80)}`,
      errorTags: [...(evaluation.errorTags ?? [])],
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

  const selected = ranked.slice(0, ABSOLUTE_CORRECTION_MAX);

  return selected.sort((left, right) => left.conversationIndex - right.conversationIndex);
}

export function buildReportHighlights(
  messages: ChatMessage[],
  segments: TopicSegment[],
  excludedConversationIndexes: ReadonlySet<number> = new Set(),
): ReportCorrectionItem[] {
  const seen = new Set<string>();
  const candidates: ReportCorrectionItem[] = [];

  messages.forEach((message, conversationIndex) => {
    if (message.role !== 'user') return;
    if (excludedConversationIndexes.has(conversationIndex)) return;
    if (message.content.trim().startsWith('(시스템)')) return;
    if (
      message.evaluationSkipReason
      && NON_CONTENT_REASONS.has(message.evaluationSkipReason)
    ) return;

    if (message.evaluation) {
      const { confidence, correction } = message.evaluation;
      const original = correction.original.trim() || message.content.trim();
      const hasExplicitCorrection = Boolean(correction.suggested.trim())
        && normalizeText(original) !== normalizeText(correction.suggested);
      if (confidence.toLowerCase() === 'low') return;
      if (correction.contextFit === 'off_topic') return;
      if (
        correction.decision === 'confirmed_error'
        || correction.decision === 'transcript_uncertain'
        || hasExplicitCorrection
      ) return;
    }

    const sentence = message.content.trim();
    const normalized = normalizeText(sentence);
    const wordCount = sentence.match(/[a-z]+(?:'[a-z]+)?/gi)?.length ?? 0;
    if (!normalized || !/[a-z]/i.test(sentence) || wordCount < 1 || seen.has(normalized)) return;
    seen.add(normalized);

    const segment = resolveSegment(message, segments);
    const evaluationStrength = message.evaluation?.feedback.strength?.trim();
    const praise = evaluationStrength
      || '질문에 맞춰 자신의 생각을 영어로 표현했습니다. 끝까지 문장을 완성한 점이 좋아요!';
    const evaluationScore = Math.round((message.evaluation?.scores.overall ?? 0) / 10);

    candidates.push({
      kind: 'key_utterance',
      id: `highlight:${message.id ?? conversationIndex}`,
      conversationIndex,
      topic: segment?.label ?? '일반 대화',
      difficulty: segment?.difficultyLabel ?? '정보 없음',
      category: 'meaning_clarity',
      categoryLabel: '잘한 답변',
      assistantPrompt: findAssistantPrompt(messages, conversationIndex),
      original: sentence,
      suggested: sentence,
      reason: praise,
      problem: '',
      usageGuide: '',
      contextReason: '',
      priority: 'low',
      score: 100 + Math.min(wordCount, 20) + evaluationScore,
      issueKey: `highlight:${normalized.slice(0, 80)}`,
      issueCode: 'report_highlight',
      errorTags: ['report_highlight', 'learner_sentence'],
    });
  });

  return candidates
    .sort((left, right) => right.score - left.score || left.conversationIndex - right.conversationIndex)
    .slice(0, TARGET_CORRECTION_MAX)
    .sort((left, right) => left.conversationIndex - right.conversationIndex);
}

export function buildReportTeacherReviews(
  messages: ChatMessage[],
  segments: TopicSegment[],
  excludedConversationIndexes: ReadonlySet<number> = new Set(),
): ReportCorrectionItem[] {
  const seen = new Set<string>();
  const candidates: ReportCorrectionItem[] = [];

  messages.forEach((message, conversationIndex) => {
    if (message.role !== 'user' || excludedConversationIndexes.has(conversationIndex)) return;
    if (message.evaluationSkipReason && NON_CONTENT_REASONS.has(message.evaluationSkipReason)) return;
    const evaluation = message.evaluation;
    if (evaluation && isEligible(message, evaluation)) return;

    const original = evaluation?.correction.original.trim()
      || message.correction?.original.trim()
      || message.content.trim();
    const normalized = normalizeText(original);
    if (!normalized || !/[a-z]/i.test(original) || seen.has(normalized)) return;

    const evaluatedSuggestion = evaluation?.correction.suggested.trim() ?? '';
    const realtimeSuggestion = message.correction?.suggested.trim() ?? '';
    const suggested = [evaluatedSuggestion, realtimeSuggestion].find(
      (candidate) => candidate && normalizeText(candidate) !== normalized,
    ) ?? '';
    const decision = evaluation?.correction.decision;
    const reviewWorthy = evaluation
      ? decision === 'not_an_error'
        ? false
        : decision === 'confirmed_error'
        || decision === 'transcript_uncertain'
        || decision === 'optional_upgrade'
        || evaluation.correction.contextFit === 'unknown'
      : Boolean(suggested);
    if (!reviewWorthy) return;
    seen.add(normalized);

    const segment = resolveSegment(message, segments);
    const category = evaluation ? categoryFromEvaluation(evaluation) : 'naturalness';
    const reason = evaluation?.correction.reason.trim()
      || message.correction?.reason.trim()
      || '문맥과 의도에 따라 다른 표현도 가능해 참고용으로 정리한 문장입니다.';
    const score = 70
      + (decision === 'confirmed_error' ? 20 : 0)
      + (suggested ? 8 : 0)
      + (evaluation?.correction.contextFit === 'unknown' ? 4 : 0);

    candidates.push({
      kind: 'teacher_review',
      id: `review:${message.id ?? evaluation?.turnId ?? message.correction?.turnId ?? conversationIndex}`,
      conversationIndex,
      topic: segment?.label ?? '일반 대화',
      difficulty: segment?.difficultyLabel ?? '정보 없음',
      category,
      categoryLabel: '표현 참고',
      assistantPrompt: findAssistantPrompt(messages, conversationIndex),
      original,
      suggested,
      reason,
      problem: evaluation?.correction.problem?.trim() ?? '',
      usageGuide: evaluation?.correction.usageGuide?.trim() ?? '',
      contextReason: evaluation?.correction.contextReason?.trim() ?? '',
      priority: 'low',
      score,
      issueKey: `review:${evaluation?.correction.issueCode || normalized.slice(0, 80)}`,
      issueCode: evaluation?.correction.issueCode?.trim() || 'teacher_review',
      errorTags: ['teacher_review'],
    });
  });

  return candidates.sort(
    (left, right) => right.score - left.score || left.conversationIndex - right.conversationIndex,
  );
}

export function buildReportContent(
  messages: ChatMessage[],
  segments: TopicSegment[],
): ReportContent {
  const corrections = buildReportCorrections(messages, segments);
  const excludedConversationIndexes = new Set(
    corrections.map((correction) => correction.conversationIndex),
  );
  const availableReviews = buildReportTeacherReviews(
    messages,
    segments,
    excludedConversationIndexes,
  );
  availableReviews.forEach((item) => excludedConversationIndexes.add(item.conversationIndex));
  const availableHighlights = buildReportHighlights(messages, segments, excludedConversationIndexes);
  const availableCount = corrections.length + availableReviews.length + availableHighlights.length;
  const desiredCount = corrections.length > TARGET_CORRECTION_MAX
    ? Math.min(corrections.length, ABSOLUTE_CORRECTION_MAX)
    : availableCount <= 12
      ? availableCount
      : Math.min(TARGET_CORRECTION_MAX, availableCount);
  const remainingAfterCorrections = Math.max(0, desiredCount - corrections.length);
  const reviewItems = availableReviews.slice(0, remainingAfterCorrections);
  const remainingAfterReviews = Math.max(0, remainingAfterCorrections - reviewItems.length);
  const keyUtterances = availableHighlights.slice(0, remainingAfterReviews);
  const highlights = [...reviewItems, ...keyUtterances];

  return {
    corrections,
    reviewItems,
    keyUtterances,
    highlights,
    items: [...corrections, ...highlights]
      .sort((left, right) => left.conversationIndex - right.conversationIndex),
  };
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
