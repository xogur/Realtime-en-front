import { beforeEach, describe, expect, it } from 'vitest';
import { useStore, type PracticeMission, type TurnEvaluation } from './useStore';

function mission(overrides: Partial<PracticeMission> = {}): PracticeMission {
    return {
        id: 'mission-because',
        kind: 'connector',
        title: 'Reason Builder',
        target: 'Use because in your next answer.',
        successHint: 'A connector made the answer more complete.',
        rewardLp: 6,
        checks: [{ type: 'includesAny', value: ['because'] }],
        createdAt: '2026-06-10T00:00:00.000Z',
        ...overrides,
    };
}

function resetStore() {
    useStore.getState().clearMessages();
}

function evaluation(overrides: Partial<TurnEvaluation> = {}): TurnEvaluation {
    return {
        rubricVersion: 'speaking-v2',
        turnId: 'turn-ready',
        provider: 'test',
        model: 'test',
        createdAt: '2026-06-11T00:00:00.000Z',
        scores: { overall: 80, grammar: 80, vocabulary: 80, relevance: 80, fluency: 80, interaction: 80 },
        feedback: { summary: 'Clear answer', strength: 'Clear answer', improvement: 'Add detail', nextPractice: 'Add a reason' },
        correction: { original: 'Yes, I do.', suggested: 'Yes, I do.', reason: 'No correction needed' },
        evidence: { grammar: '', vocabulary: '', relevance: '', fluency: '', interaction: '', overall: 'Clear and relevant' },
        cefrEstimate: { level: 'A2', reason: 'Short clear answer' },
        capabilities: { pronunciation: 'not_available' },
        confidence: 'high',
        confidenceReasons: [],
        ...overrides,
    };
}

describe('mission completion store rules', () => {
    beforeEach(() => {
        resetStore();
    });

    it('records a completed active mission once and removes it from active missions', () => {
        useStore.getState().setActiveMissions([mission()]);

        useStore.getState().addMessage('user', 'I stayed home because it rained.', 'turn-1');

        const state = useStore.getState();
        expect(state.messages[0].completedMissions).toHaveLength(1);
        expect(state.messages[0].completedMissions?.[0].missionId).toBe('mission-because');
        expect(state.activeMissions).toHaveLength(0);
    });

    it('does not duplicate completion when the same user message id updates', () => {
        useStore.getState().setActiveMissions([mission()]);

        useStore.getState().addMessage('user', 'I stayed home because it rained.', 'turn-1');
        useStore.getState().addMessage('user', 'I stayed home because it rained a lot.', 'turn-1');

        const completed = useStore.getState().messages[0].completedMissions ?? [];
        expect(completed).toHaveLength(1);
        expect(completed.map((item) => item.missionId)).toEqual(['mission-because']);
    });

    it('does not complete a mission introduced after the matching past utterance', () => {
        useStore.getState().addMessage('user', 'I stayed home because it rained.', 'turn-1');
        useStore.getState().addMissionCandidates([mission()]);

        const state = useStore.getState();
        expect(state.messages[0].completedMissions).toBeUndefined();
        expect(state.activeMissions).toHaveLength(1);
        expect(state.activeMissions[0].activatedAfterMessageKey).toBe('id:turn-1');
    });

    it.each([
        ['minWords', [{ type: 'minWords', min: 8 }], 'I really enjoy walking around the park after dinner.', 'I enjoy the park.'],
        ['includesAny', [{ type: 'includesAny', value: ['in my opinion', 'I think'] }], 'In my opinion, this option is better.', 'This option is better.'],
        ['sentenceCount', [{ type: 'sentenceCount', min: 2 }], 'I like this cafe. The coffee is excellent.', 'I like this cafe very much.'],
        ['question', [{ type: 'question' }], 'What do you usually do on weekends?', 'I usually rest on weekends.'],
        ['pastTense', [{ type: 'pastTense' }], 'I visited my friend yesterday.', 'I visit my friend every week.'],
        ['futureTense', [{ type: 'futureTense' }], 'I am going to study tonight.', 'I study every night.'],
        ['presentPerfect', [{ type: 'presentPerfect' }], 'I have tried that restaurant.', 'I tried that restaurant yesterday.'],
        ['connector', [{ type: 'connector' }], 'I stayed home because it was raining.', 'I stayed home during the rain.'],
        ['politeRequest', [{ type: 'politeRequest' }], 'Could you explain that again?', 'Explain that again.'],
    ] as const)('accepts a valid %s answer and rejects a non-matching answer', (_name, checks, matchingText, nonMatchingText) => {
        const candidate = mission({
            id: `mission-${_name}`,
            kind: _name === 'pastTense' || _name === 'futureTense' || _name === 'presentPerfect'
                ? 'tense'
                : _name === 'minWords' || _name === 'sentenceCount'
                    ? 'length'
                    : _name === 'question'
                        ? 'question'
                        : _name === 'connector'
                            ? 'connector'
                            : _name === 'politeRequest'
                                ? 'interaction'
                                : 'vocabulary',
            title: `Test ${_name}`,
            target: `Complete ${_name}`,
            checks: [...checks],
        });

        useStore.getState().setActiveMissions([candidate]);
        useStore.getState().addMessage('user', nonMatchingText, `miss-${_name}`);
        expect(useStore.getState().messages[0].completedMissions).toBeUndefined();
        expect(useStore.getState().activeMissions).toHaveLength(1);

        useStore.getState().addMessage('user', matchingText, `match-${_name}`);
        expect(useStore.getState().messages[1].completedMissions?.map((item) => item.missionId)).toEqual([candidate.id]);
        expect(useStore.getState().activeMissions).toHaveLength(0);
    });

    it('refills a completed slot without auto-completing the queued mission from the same utterance', () => {
        useStore.getState().setActiveMissions([
            mission(),
            mission({
                id: 'mission-long',
                kind: 'length',
                title: 'Longer Turn',
                target: 'Answer with at least ten English words.',
                successHint: 'The answer was long enough.',
                rewardLp: 5,
                checks: [{ type: 'minWords', min: 10 }],
            }),
            mission({
                id: 'mission-question',
                kind: 'question',
                title: 'Keep Talking',
                target: 'Ask one question.',
                successHint: 'A question kept the conversation moving.',
                rewardLp: 7,
                checks: [{ type: 'question' }],
            }),
        ]);
        useStore.getState().addMissionCandidates([
            mission({
                id: 'mission-future',
                kind: 'tense',
                title: 'Future Plan',
                target: 'Use will in your next answer.',
                successHint: 'A future expression was used.',
                rewardLp: 6,
                checks: [{ type: 'includesAny', value: ['will'] }],
            }),
        ]);

        useStore.getState().addMessage('user', 'I will go because it is important today.', 'turn-1');

        const state = useStore.getState();
        expect(state.messages[0].completedMissions?.map((item) => item.missionId)).toEqual(['mission-because']);
        expect(state.activeMissions.map((item) => item.id)).toContain('mission-future');
        expect(state.activeMissions.find((item) => item.id === 'mission-future')?.activatedAfterMessageKey).toBe('id:turn-1');
    });
});

describe('turn evaluation policy state', () => {
    beforeEach(() => {
        resetStore();
    });

    it('marks a policy-skipped turn without treating it as unavailable', () => {
        useStore.getState().addMessage('user', 'fsfs', 'turn-noise');
        useStore.getState().setTurnEvaluationSkipped('turn-noise', 'no_linguistic_signal');

        const message = useStore.getState().messages[0];
        expect(message.evaluationStatus).toBe('skipped');
        expect(message.evaluationSkipReason).toBe('no_linguistic_signal');
        expect(message.evaluationErrorCode).toBeUndefined();
    });

    it('binds a skipped turn id to the latest pending user message when the message has no id yet', () => {
        useStore.getState().addMessage('user', 'fsfs');
        useStore.getState().setTurnEvaluationSkipped('turn-noise', 'no_linguistic_signal');

        const message = useStore.getState().messages[0];
        expect(message.id).toBe('turn-noise');
        expect(message.evaluationStatus).toBe('skipped');
        expect(message.evaluationSkipReason).toBe('no_linguistic_signal');
    });

    it('does not overwrite a completed evaluation with a late skip event', () => {
        useStore.getState().addMessage('user', 'Yes, I do.', 'turn-ready');
        useStore.getState().setTurnEvaluation('turn-ready', {
            rubricVersion: 'speaking-v2',
            turnId: 'turn-ready',
            provider: 'test',
            model: 'test',
            createdAt: '2026-06-11T00:00:00.000Z',
            scores: { overall: 80, grammar: 80, vocabulary: 80, relevance: 80, fluency: 80, interaction: 80 },
            feedback: { summary: 'Clear answer', strength: 'Clear answer', improvement: 'Add detail', nextPractice: 'Add a reason' },
            correction: { original: 'Yes, I do.', suggested: 'Yes, I do.', reason: 'No correction needed' },
            evidence: { grammar: '', vocabulary: '', relevance: '', fluency: '', interaction: '', overall: 'Clear and relevant' },
            cefrEstimate: { level: 'A2', reason: 'Short clear answer' },
            capabilities: { pronunciation: 'not_available' },
            confidence: 'high',
            confidenceReasons: [],
        });

        useStore.getState().setTurnEvaluationSkipped('turn-ready', 'generation_aborted');

        expect(useStore.getState().messages[0].evaluationStatus).toBe('ready');
    });

    it('stores normalized evaluation batch status for the UI countdown', () => {
        useStore.getState().setEvaluationBatchStatus({
            pendingCount: 2.8,
            maxTurns: 4.2,
            delaySeconds: 60,
            nextFlushAtEpochMs: 1800000000000,
        });

        const status = useStore.getState().evaluationBatchStatus;
        expect(status?.pendingCount).toBe(2);
        expect(status?.maxTurns).toBe(4);
        expect(status?.delaySeconds).toBe(60);
        expect(status?.nextFlushAtEpochMs).toBe(1800000000000);
        expect(status?.receivedAtEpochMs).toBeGreaterThan(0);
    });

    it('clears evaluation batch status with messages', () => {
        useStore.getState().setEvaluationBatchStatus({
            pendingCount: 1,
            maxTurns: 4,
            delaySeconds: 60,
            nextFlushAtEpochMs: 1800000000000,
        });

        useStore.getState().clearMessages();

        expect(useStore.getState().evaluationBatchStatus).toBeNull();
    });

    it('starts a local evaluation countdown before the server queue status arrives', () => {
        useStore.getState().queueLocalEvaluationBatchTurn(30, 4);
        useStore.getState().queueLocalEvaluationBatchTurn(30, 4);

        const status = useStore.getState().evaluationBatchStatus;
        expect(status?.pendingCount).toBe(2);
        expect(status?.maxTurns).toBe(4);
        expect(status?.delaySeconds).toBe(30);
        expect((status?.nextFlushAtEpochMs ?? 0) - status!.receivedAtEpochMs).toBeLessThanOrEqual(30000);
    });
});

describe('turn correction state', () => {
    beforeEach(() => {
        resetStore();
    });

    it('stores realtime correction independently from batch evaluation', () => {
        useStore.getState().addMessage('user', 'I go school yesterday.', 'turn-corrected');
        useStore.getState().setTurnCorrection('turn-corrected', {
            turnId: 'turn-corrected',
            provider: 'ollama',
            model: 'gemma4:12b',
            createdAt: '2026-06-12T00:00:00.000Z',
            original: 'I go school yesterday.',
            suggested: 'I went to school yesterday.',
            reason: '과거 시제 went와 전치사 to가 필요합니다.',
        });

        let message = useStore.getState().messages[0];
        expect(message.correctionStatus).toBe('ready');
        expect(message.evaluationStatus).toBe('pending');
        expect(message.correction?.suggested).toBe('I went to school yesterday.');

        useStore.getState().setTurnEvaluation('turn-corrected', evaluation({
            turnId: 'turn-corrected',
            correction: {
                original: 'I go school yesterday.',
                suggested: 'I went to school yesterday.',
                reason: 'Batch reason',
            },
        }));

        message = useStore.getState().messages[0];
        expect(message.correctionStatus).toBe('ready');
        expect(message.evaluationStatus).toBe('ready');
        expect(message.correction?.reason).toContain('과거 시제');
        expect(message.evaluation?.correction.reason).toBe('Batch reason');
    });

    it('marks correction skipped for policy-skipped noise without marking evaluation unavailable', () => {
        useStore.getState().addMessage('user', 'fsfs', 'turn-noise');
        useStore.getState().setTurnCorrectionSkipped('turn-noise', 'no_linguistic_signal');

        const message = useStore.getState().messages[0];
        expect(message.correctionStatus).toBe('skipped');
        expect(message.correctionSkipReason).toBe('no_linguistic_signal');
        expect(message.evaluationStatus).toBe('pending');
    });
});
