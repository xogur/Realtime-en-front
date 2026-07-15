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

describe('replayed assistant result state', () => {
    beforeEach(() => {
        resetStore();
    });

    it('restores translation on the matching assistant turn without duplication', () => {
        useStore.getState().addMessage('assistant', 'First answer.', 'turn-1');
        useStore.getState().addMessage('assistant', 'Second answer.', 'turn-2');

        useStore.getState().appendToAssistantMessage('turn-1', '한국어 해석: 첫 답변입니다.');
        useStore.getState().appendToAssistantMessage('turn-1', '한국어 해석: 첫 답변입니다.');

        const [first, second] = useStore.getState().messages;
        expect(first.content).toBe('First answer.\n\n한국어 해석: 첫 답변입니다.');
        expect(second.content).toBe('Second answer.');
    });

    it('restores suggestions on the matching assistant turn', () => {
        useStore.getState().addMessage('assistant', 'First answer.', 'turn-1');
        useStore.getState().addMessage('assistant', 'Second answer.', 'turn-2');

        useStore.getState().setAssistantSuggestions('turn-1', ['Yes, I do.']);

        const [first, second] = useStore.getState().messages;
        expect(first.suggestions).toEqual(['Yes, I do.']);
        expect(second.suggestions).toBeUndefined();
    });
});

describe('mission completion store rules', () => {
    beforeEach(() => {
        resetStore();
    });

    it('completes and rewards a text-matched mission immediately', () => {
        useStore.getState().setActiveMissions([mission()]);

        useStore.getState().addMessage('user', 'I stayed home because it rained.', 'turn-1');

        const state = useStore.getState();
        expect(state.messages[0].pendingMissionCompletions).toBeUndefined();
        expect(state.messages[0].completedMissions?.[0].missionId).toBe('mission-because');
        expect(state.activeMissions).toHaveLength(0);
    });

    it('keeps an immediately completed mission after evaluation arrives', () => {
        useStore.getState().setActiveMissions([mission()]);
        useStore.getState().addMessage('user', 'I stayed home because it rained.', 'turn-ready');

        useStore.getState().setTurnEvaluation('turn-ready', evaluation());

        const state = useStore.getState();
        expect(state.messages[0].pendingMissionCompletions).toBeUndefined();
        expect(state.messages[0].completedMissions?.[0].missionId).toBe('mission-because');
        expect(state.activeMissions).toHaveLength(0);
    });

    it('does not make immediate mission success depend on batch relevance scoring', () => {
        useStore.getState().setActiveMissions([mission()]);
        useStore.getState().addMessage('user', 'because', 'turn-ready');

        useStore.getState().setTurnEvaluation('turn-ready', evaluation({
            scores: { overall: 35, grammar: 60, vocabulary: 50, relevance: 20, fluency: 45, interaction: 25 },
        }));

        const state = useStore.getState();
        expect(state.messages[0].pendingMissionCompletions).toBeUndefined();
        expect(state.messages[0].completedMissions?.[0].missionId).toBe('mission-because');
        expect(state.activeMissions).toHaveLength(0);
    });

    it('keeps immediate mission success when batch evaluation confidence is low', () => {
        useStore.getState().setActiveMissions([mission()]);
        useStore.getState().addMessage('user', 'I stayed home because it rained.', 'turn-ready');

        useStore.getState().setTurnEvaluation('turn-ready', evaluation({ confidence: 'low' }));

        const state = useStore.getState();
        expect(state.messages[0].completedMissions?.[0].missionId).toBe('mission-because');
        expect(state.activeMissions).toHaveLength(0);
    });

    it('keeps immediate mission success when batch confidence value is unknown', () => {
        useStore.getState().setActiveMissions([mission()]);
        useStore.getState().addMessage('user', 'I stayed home because it rained.', 'turn-ready');

        useStore.getState().setTurnEvaluation('turn-ready', evaluation({ confidence: 'uncertain' }));

        const state = useStore.getState();
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

    it('keeps reconnect turns separate when backend generation ids repeat with new event sequences', () => {
        useStore.getState().addMessage('user', 'Hi!', '1:event-1225');
        useStore.getState().addMessage('user', 'Hello!', '1:event-1348');

        expect(useStore.getState().messages.map((message) => message.content)).toEqual(['Hi!', 'Hello!']);
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
        ['it depends', '상황에 따라 답이 달라진다고 말할 때 사용합니다.', 'It depends on the weather.'],
        ['if', '조건을 붙여서 더 정확하게 말하고 싶을 때 사용합니다.', 'If I have time, I will practice more.'],
        ['used to', '지금은 아니지만 예전에 자주 했던 일을 말할 때 사용합니다.', 'I used to play soccer after school.'],
    ])('adds natural guidance for %s expression missions', (expression, usageContext, exampleSentence) => {
        useStore.getState().addMissionCandidates([
            mission({
                id: `mission-${expression}`,
                kind: 'grammar',
                title: 'Expression practice',
                target: `Use ${expression}.`,
                checks: [{ type: 'includesAny', value: [expression] }],
            }),
        ]);

        const [activeMission] = useStore.getState().activeMissions;
        expect(activeMission.target).toBe(`답변에 ${expression}를 자연스럽게 사용해보세요.`);
        expect(activeMission.usageContext).toBe(usageContext);
        expect(activeMission.exampleSentence).toBe(exampleSentence);
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
        useStore.getState().setTurnEvaluation('turn-1', evaluation({ turnId: 'turn-1' }));

        const state = useStore.getState();
        expect(state.messages[0].completedMissions?.map((item) => item.missionId)).toEqual(['mission-because']);
        expect(state.activeMissions.map((item) => item.id)).toContain('mission-future');
        expect(state.activeMissions.find((item) => item.id === 'mission-future')?.activatedAfterMessageKey).toBe('id:turn-1');
    });

    it('preserves active, queued, and completed mission progress through a same-session replay', () => {
        useStore.getState().setActiveMissions([
            mission(),
            mission({
                id: 'mission-long',
                kind: 'length',
                title: 'Longer Turn',
                target: 'Answer with at least ten English words.',
                checks: [{ type: 'minWords', min: 10 }],
            }),
            mission({
                id: 'mission-question',
                kind: 'question',
                title: 'Keep Talking',
                target: 'Ask one question.',
                checks: [{ type: 'question' }],
            }),
        ]);
        useStore.getState().addMissionCandidates([
            mission({
                id: 'mission-future',
                kind: 'tense',
                title: 'Future Plan',
                target: 'Use will in your next answer.',
                checks: [{ type: 'futureTense' }],
            }),
            mission({
                id: 'mission-polite',
                kind: 'interaction',
                title: 'Polite Request',
                target: 'Use could you in your next answer.',
                checks: [{ type: 'politeRequest' }],
            }),
        ]);
        useStore.getState().addMessage('user', 'I stayed home because it rained.', 'turn-replay');
        useStore.getState().setTurnEvaluation('turn-replay', evaluation({ turnId: 'turn-replay' }));

        const beforeReplay = useStore.getState();
        const activeIds = beforeReplay.activeMissions.map((item) => item.id);
        const queuedIds = beforeReplay.missionQueue.map((item) => item.id);
        const completed = beforeReplay.messages[0].completedMissions;
        expect(queuedIds).not.toEqual([]);

        useStore.getState().beginSessionReplay();
        expect(useStore.getState().messages).toEqual([]);
        expect(useStore.getState().activeMissions.map((item) => item.id)).toEqual(activeIds);
        expect(useStore.getState().missionQueue.map((item) => item.id)).toEqual(queuedIds);

        useStore.getState().addMessage('user', 'I stayed home because it rained.', 'turn-replay');
        useStore.getState().finishSessionReplay();

        const restored = useStore.getState();
        expect(restored.messages[0].completedMissions).toEqual(completed);
        expect(restored.activeMissions.map((item) => item.id)).toEqual(activeIds);
        expect(restored.missionQueue.map((item) => item.id)).toEqual(queuedIds);

        useStore.getState().addMissionCandidates([mission()]);
        expect([
            ...useStore.getState().activeMissions,
            ...useStore.getState().missionQueue,
        ].some((item) => item.id === 'mission-because')).toBe(false);
    });

    it('clears preserved mission progress when the replay represents an empty new session', () => {
        useStore.getState().setActiveMissions([mission()]);

        useStore.getState().beginSessionReplay();
        useStore.getState().finishSessionReplay();

        expect(useStore.getState().activeMissions).toEqual([]);
        expect(useStore.getState().missionQueue).toEqual([]);
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
        useStore.getState().setTurnEvaluation('turn-ready', evaluation());

        useStore.getState().setTurnEvaluationSkipped('turn-ready', 'generation_aborted');

        expect(useStore.getState().messages[0].evaluationStatus).toBe('ready');
    });

    it('marks all pending evaluations skipped when the mic session is stopped', () => {
        useStore.getState().addMessage('user', 'First answer.', 'turn-1');
        useStore.getState().addMessage('assistant', 'Thanks.');
        useStore.getState().addMessage('user', 'Second answer.', 'turn-2');
        useStore.getState().setEvaluationBatchStatus({
            pendingCount: 2,
            maxTurns: 4,
            delaySeconds: 30,
            nextFlushAtEpochMs: 1800000000000,
        });

        expect(useStore.getState().getPendingEvaluationTurnIds()).toEqual(['turn-1', 'turn-2']);

        useStore.getState().skipPendingTurnEvaluations('mic_disconnected');

        const state = useStore.getState();
        expect(state.messages.filter((message) => message.role === 'user').map((message) => message.evaluationStatus))
            .toEqual(['skipped', 'skipped']);
        expect(state.messages[0].evaluationSkipReason).toBe('mic_disconnected');
        expect(state.evaluationBatchStatus).toBeNull();
    });

    it('does not overwrite a skipped evaluation with a late evaluation result', () => {
        useStore.getState().addMessage('user', 'Yes, I do.', 'turn-skipped');
        useStore.getState().setTurnEvaluationSkipped('turn-skipped', 'mic_disconnected');

        useStore.getState().setTurnEvaluation('turn-skipped', evaluation({ turnId: 'turn-skipped' }));

        const message = useStore.getState().messages[0];
        expect(message.evaluationStatus).toBe('skipped');
        expect(message.evaluation).toBeUndefined();
    });

    it('stores normalized evaluation batch status for the UI countdown', () => {
        const receivedAtEpochMs = Date.now();
        useStore.getState().setEvaluationBatchStatus({
            pendingCount: 2.8,
            maxTurns: 4.2,
            delaySeconds: 30,
            nextFlushAtEpochMs: 1800000000000,
            serverEpochMs: 1799999970000,
        });

        const status = useStore.getState().evaluationBatchStatus;
        expect(status?.pendingCount).toBe(2);
        expect(status?.maxTurns).toBe(4);
        expect(status?.delaySeconds).toBe(30);
        expect(status?.nextFlushAtEpochMs).toBeGreaterThanOrEqual(receivedAtEpochMs + 30000);
        expect(status?.nextFlushAtEpochMs).toBeLessThanOrEqual(Date.now() + 30000);
        expect(status?.receivedAtEpochMs).toBeGreaterThanOrEqual(receivedAtEpochMs);
    });

    it('does not reset the local countdown when polling returns the same server deadline', () => {
        const serverStatus = {
            pendingCount: 1,
            maxTurns: 4,
            delaySeconds: 30,
            nextFlushAtEpochMs: 1800000000000,
            serverEpochMs: 1799999970000,
        };
        useStore.getState().setEvaluationBatchStatus(serverStatus);
        const firstDeadline = useStore.getState().evaluationBatchStatus?.nextFlushAtEpochMs;

        useStore.getState().setEvaluationBatchStatus(serverStatus);

        expect(useStore.getState().evaluationBatchStatus?.nextFlushAtEpochMs).toBe(firstDeadline);
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
