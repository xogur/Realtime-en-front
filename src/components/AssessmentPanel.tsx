'use client';

import { Activity, AlertCircle, CheckCircle2, Clock, Printer, TrendingDown, TrendingUp } from 'lucide-react';
import { useMemo } from 'react';
import { useStore, type ChatMessage, type TurnEvaluation } from '@/stores/useStore';

type EvaluatedTurn = {
    message: ChatMessage;
    evaluation: TurnEvaluation;
};

type MetricKey = 'grammar' | 'vocabulary' | 'relevance' | 'fluency';

const METRICS: Array<{ key: MetricKey; label: string }> = [
    { key: 'grammar', label: 'Grammar' },
    { key: 'vocabulary', label: 'Words' },
    { key: 'relevance', label: 'Context' },
    { key: 'fluency', label: 'Fluency' },
];

function clampScore(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(100, Math.round(value)));
}

function average(values: number[]): number {
    if (values.length === 0) return 0;
    return clampScore(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function calculateWeightedSessionScore(turns: EvaluatedTurn[]): number | null {
    if (turns.length === 0) return null;

    const recentTurns = turns.slice(-8);
    let weightedTotal = 0;
    let totalWeight = 0;

    recentTurns.forEach((turn, index) => {
        const recencyWeight = index + 1;
        const { overall, relevance } = turn.evaluation.scores;
        const contextAdjusted = overall * 0.75 + relevance * 0.25;
        weightedTotal += contextAdjusted * recencyWeight;
        totalWeight += recencyWeight;
    });

    return clampScore(weightedTotal / totalWeight);
}

function getScoreTone(score: number | null): string {
    if (score === null) return 'No score yet';
    if (score >= 85) return 'Strong';
    if (score >= 70) return 'Good';
    if (score >= 50) return 'Building';
    return 'Needs focus';
}

function getLatestFocus(evaluation: TurnEvaluation): string {
    const { correction, feedback } = evaluation;
    return correction.suggested || feedback.improvement || feedback.nextPractice || feedback.summary;
}

function formatReportDate(value: Date): string {
    return new Intl.DateTimeFormat('en', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    }).format(value);
}

function MetricBar({ label, value }: { label: string; value: number }) {
    return (
        <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-semibold text-[#483c2d]">
                <span>{label}</span>
                <span>{value}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[#483c2d]/10">
                <div
                    className="h-full rounded-full bg-[#6b5a4a] transition-all duration-500"
                    style={{ width: `${clampScore(value)}%` }}
                />
            </div>
        </div>
    );
}

function PrintMetric({ label, value }: { label: string; value: number }) {
    return (
        <div className="rounded-md border border-[#dfd0c2] bg-white p-3">
            <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-normal text-[#6b5a4a]">
                <span>{label}</span>
                <span>{value}</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#eadfd4]">
                <div className="h-full rounded-full bg-[#6b5a4a]" style={{ width: `${clampScore(value)}%` }} />
            </div>
        </div>
    );
}

function PrintReport({
    turns,
    latestTurn,
    sessionScore,
    metricAverages,
    generatedAt,
}: {
    turns: EvaluatedTurn[];
    latestTurn: EvaluatedTurn | null;
    sessionScore: number | null;
    metricAverages: Array<{ key: MetricKey; label: string; value: number }>;
    generatedAt: Date;
}) {
    const recentTurns = turns.slice(-8).reverse();

    return (
        <section className="print-document hidden bg-white text-[#2f261e]">
            <div className="bg-white">
                <header className="border-b-4 border-[#6b5a4a] pb-5">
                    <p className="text-xs font-bold uppercase tracking-normal text-[#8a6f5a]">English Speaking Evaluation</p>
                    <div className="mt-2 flex items-end justify-between gap-6">
                        <div>
                            <h1 className="text-3xl font-black tracking-normal text-[#2f261e]">English Coach Report</h1>
                            <p className="mt-1 text-sm font-medium text-[#6b5a4a]">Generated {formatReportDate(generatedAt)}</p>
                        </div>
                        <div className="rounded-lg bg-[#6b5a4a] px-5 py-4 text-right text-white">
                            <p className="text-xs font-bold uppercase tracking-normal text-white/75">Current score</p>
                            <p className="text-4xl font-black leading-none">{sessionScore ?? '--'}</p>
                            <p className="text-xs font-bold text-white/80">/ 100</p>
                        </div>
                    </div>
                </header>

                <section className="mt-6 grid grid-cols-4 gap-3">
                    {metricAverages.map((metric) => (
                        <PrintMetric key={metric.key} label={metric.label} value={metric.value} />
                    ))}
                </section>

                {latestTurn && (
                    <section className="mt-6 rounded-lg border border-[#dfd0c2] bg-[#f4ece4] p-5">
                        <p className="text-xs font-bold uppercase tracking-normal text-[#8a6f5a]">Latest feedback</p>
                        <p className="mt-2 text-lg font-bold leading-snug text-[#2f261e]">
                            {getLatestFocus(latestTurn.evaluation)}
                        </p>
                        {latestTurn.evaluation.feedback.strength && (
                            <p className="mt-3 text-sm leading-relaxed text-[#5b4939]">
                                <span className="font-bold">Strength:</span> {latestTurn.evaluation.feedback.strength}
                            </p>
                        )}
                        {latestTurn.evaluation.feedback.improvement && (
                            <p className="mt-2 text-sm leading-relaxed text-[#5b4939]">
                                <span className="font-bold">Focus:</span> {latestTurn.evaluation.feedback.improvement}
                            </p>
                        )}
                    </section>
                )}

                <section className="mt-6">
                    <div className="flex items-center justify-between border-b border-[#dfd0c2] pb-2">
                        <h2 className="text-lg font-black text-[#2f261e]">Recent Turns</h2>
                        <p className="text-xs font-semibold text-[#6b5a4a]">{turns.length} scored turn{turns.length === 1 ? '' : 's'}</p>
                    </div>

                    <div className="mt-3 space-y-3">
                        {recentTurns.map((turn, index) => (
                            <article key={`${turn.evaluation.turnId}-${index}`} className="break-inside-avoid rounded-lg border border-[#dfd0c2] bg-white p-4">
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <p className="text-xs font-bold uppercase tracking-normal text-[#8a6f5a]">Learner answer</p>
                                        <p className="mt-1 text-sm font-semibold leading-snug text-[#2f261e]">{turn.message.content}</p>
                                    </div>
                                    <div className="rounded-full bg-[#483c2d] px-3 py-1 text-sm font-black text-white">
                                        {turn.evaluation.scores.overall}
                                    </div>
                                </div>
                                <p className="mt-3 text-sm leading-relaxed text-[#5b4939]">{turn.evaluation.feedback.summary}</p>
                                {turn.evaluation.correction.suggested && (
                                    <p className="mt-2 rounded-md bg-[#edf5ed] px-3 py-2 text-sm leading-relaxed text-[#334d35]">
                                        <span className="font-bold">Suggested:</span> {turn.evaluation.correction.suggested}
                                    </p>
                                )}
                            </article>
                        ))}
                    </div>
                </section>
            </div>
        </section>
    );
}

function StatusLine({ pendingCount, unavailableCount }: { pendingCount: number; unavailableCount: number }) {
    if (pendingCount > 0) {
        return (
            <div className="flex items-center gap-2 rounded-md bg-[#fff7e8] px-3 py-2 text-xs font-medium text-[#6b5a4a]">
                <Clock className="h-4 w-4" />
                <span>Evaluating {pendingCount} turn{pendingCount > 1 ? 's' : ''}...</span>
            </div>
        );
    }

    if (unavailableCount > 0) {
        return (
            <div className="flex items-center gap-2 rounded-md bg-[#f7ece8] px-3 py-2 text-xs font-medium text-[#7a4b3a]">
                <AlertCircle className="h-4 w-4" />
                <span>{unavailableCount} turn{unavailableCount > 1 ? 's' : ''} could not be scored.</span>
            </div>
        );
    }

    return (
        <div className="flex items-center gap-2 rounded-md bg-[#edf5ed] px-3 py-2 text-xs font-medium text-[#496348]">
            <CheckCircle2 className="h-4 w-4" />
            <span>Coach is ready.</span>
        </div>
    );
}

export function AssessmentPanel() {
    const messages = useStore((state) => state.messages);

    const assessment = useMemo(() => {
        const userMessages = messages.filter((message) => message.role === 'user');
        const turns: EvaluatedTurn[] = userMessages
            .filter((message): message is ChatMessage & { evaluation: TurnEvaluation } => Boolean(message.evaluation))
            .map((message) => ({ message, evaluation: message.evaluation }));
        const latestTurn = turns[turns.length - 1] ?? null;
        const previousTurn = turns[turns.length - 2] ?? null;
        const sessionScore = calculateWeightedSessionScore(turns);
        const trend = latestTurn && previousTurn
            ? latestTurn.evaluation.scores.overall - previousTurn.evaluation.scores.overall
            : 0;
        const metricAverages = METRICS.map(({ key, label }) => ({
            key,
            label,
            value: average(turns.map((turn) => turn.evaluation.scores[key])),
        }));

        return {
            turns,
            latestTurn,
            sessionScore,
            trend,
            metricAverages,
            pendingCount: userMessages.filter((message) => message.evaluationStatus === 'pending').length,
            unavailableCount: userMessages.filter((message) => message.evaluationStatus === 'unavailable').length,
        };
    }, [messages]);

    const { turns, latestTurn, sessionScore, trend, metricAverages, pendingCount, unavailableCount } = assessment;
    const generatedAt = latestTurn?.evaluation.createdAt ? new Date(latestTurn.evaluation.createdAt) : new Date();
    const trendIcon = trend < 0 ? TrendingDown : TrendingUp;
    const TrendIcon = trendIcon;

    return (
        <aside className="flex h-full min-h-0 flex-col border-t border-[#483c2d]/10 bg-[#f4ece4]/75 backdrop-blur-xl print:border-0 print:bg-white lg:border-l lg:border-t-0">
            <PrintReport
                turns={turns}
                latestTurn={latestTurn}
                sessionScore={sessionScore}
                metricAverages={metricAverages}
                generatedAt={generatedAt}
            />

            <div className="flex items-center justify-between border-b border-[#483c2d]/10 px-5 py-4 print:hidden">
                <div className="flex items-center gap-2">
                    <Activity className="h-5 w-5 text-[#6b5a4a]" />
                    <h2 className="font-bold tracking-tight text-[#483c2d]">English Coach</h2>
                </div>
                <button
                    type="button"
                    onClick={() => window.print()}
                    disabled={turns.length === 0}
                    className="rounded-full p-2 text-[#6b5a4a] transition-colors hover:bg-[#483c2d]/10 focus:outline-none focus:ring-2 focus:ring-[#6b5a4a]/30 disabled:cursor-not-allowed disabled:opacity-40"
                    title={turns.length === 0 ? 'No evaluation to print' : 'Print evaluation'}
                    aria-label="Print evaluation"
                >
                    <Printer className="h-4 w-4" />
                </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-5 print:hidden">
                <StatusLine pendingCount={pendingCount} unavailableCount={unavailableCount} />

                <section className="rounded-lg border border-white/50 bg-white/65 p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-normal text-[#6b5a4a]/70">Current score</p>
                            <div className="mt-1 flex items-end gap-2">
                                <span className="text-5xl font-bold leading-none text-[#483c2d]">
                                    {sessionScore ?? '--'}
                                </span>
                                <span className="pb-1 text-sm font-semibold text-[#6b5a4a]/70">/ 100</span>
                            </div>
                        </div>
                        <div className="text-right">
                            <p className="rounded-full bg-[#483c2d]/10 px-3 py-1 text-xs font-bold text-[#483c2d]">
                                {getScoreTone(sessionScore)}
                            </p>
                            {turns.length > 1 && (
                                <div className={`mt-2 flex items-center justify-end gap-1 text-xs font-semibold ${trend < 0 ? 'text-[#9a4b36]' : 'text-[#3d6f4a]'}`}>
                                    <TrendIcon className="h-4 w-4" />
                                    <span>{trend > 0 ? '+' : ''}{trend}</span>
                                </div>
                            )}
                        </div>
                    </div>
                    <p className="mt-3 text-xs leading-relaxed text-[#6b5a4a]">
                        Recent turns count more. Context mistakes lower this score faster than small grammar slips.
                    </p>
                </section>

                {turns.length === 0 ? (
                    <section className="rounded-lg border border-dashed border-[#483c2d]/20 bg-white/45 p-4 text-sm leading-relaxed text-[#6b5a4a]">
                        Speak or type in English. Your score, weak points, and next practice target will appear here after each response.
                    </section>
                ) : (
                    <>
                        <section className="rounded-lg border border-white/50 bg-white/65 p-4 shadow-sm">
                            <h3 className="mb-3 text-sm font-bold text-[#483c2d]">Skill breakdown</h3>
                            <div className="space-y-3">
                                {metricAverages.map((metric) => (
                                    <MetricBar key={metric.key} label={metric.label} value={metric.value} />
                                ))}
                            </div>
                        </section>

                        {latestTurn && (
                            <section className="rounded-lg border border-white/50 bg-white/65 p-4 shadow-sm">
                                <p className="text-xs font-semibold uppercase tracking-normal text-[#6b5a4a]/70">Latest feedback</p>
                                <blockquote className="mt-2 border-l-2 border-[#6b5a4a]/30 pl-3 text-sm font-semibold leading-relaxed text-[#483c2d]">
                                    {getLatestFocus(latestTurn.evaluation)}
                                </blockquote>
                                {latestTurn.evaluation.feedback.strength && (
                                    <p className="mt-3 text-xs leading-relaxed text-[#6b5a4a]">
                                        Strength: {latestTurn.evaluation.feedback.strength}
                                    </p>
                                )}
                            </section>
                        )}

                        <section className="rounded-lg border border-white/50 bg-white/65 p-4 shadow-sm">
                            <h3 className="mb-3 text-sm font-bold text-[#483c2d]">Recent turns</h3>
                            <div className="space-y-2">
                                {turns.slice(-5).reverse().map((turn, index) => (
                                    <div key={`${turn.evaluation.turnId}-${index}`} className="rounded-md bg-[#fdf8f4]/80 p-3">
                                        <div className="flex items-center justify-between gap-3">
                                            <p className="line-clamp-1 text-xs font-semibold text-[#483c2d]">
                                                {turn.message.content}
                                            </p>
                                            <span className="shrink-0 rounded-full bg-[#483c2d]/10 px-2 py-0.5 text-xs font-bold text-[#483c2d]">
                                                {turn.evaluation.scores.overall}
                                            </span>
                                        </div>
                                        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[#6b5a4a]">
                                            {turn.evaluation.feedback.summary}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </section>
                    </>
                )}
            </div>
        </aside>
    );
}
