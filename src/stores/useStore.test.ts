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

    it('upserts the same assistant turn received from socket and window sync', () => {
        useStore.getState().addMessage('assistant', 'Streaming answer.', 'turn-1');
        useStore.getState().setAssistantSuggestions('turn-1', ['Tell me more.']);
        useStore.getState().addMessage('assistant', 'Final answer.', 'turn-1');

        expect(useStore.getState().messages).toHaveLength(1);
        expect(useStore.getState().messages[0]).toMatchObject({
            id: 'turn-1',
            content: 'Final answer.',
            suggestions: ['Tell me more.'],
        });
    });

    it('keeps richer viewer evaluation state when a stale window sync arrives', () => {
        useStore.getState().addMessage('user', 'Yes, I can speak English.', 'turn-1');
        useStore.getState().setTurnCorrection('turn-1', {
            turnId: 'turn-1',
            provider: 'test',
            model: 'test',
            createdAt: '2026-07-15T00:00:00.000Z',
            original: 'Yes, I can speak English.',
            suggested: 'Yes, I can speak English.',
            reason: 'Natural.',
            provisionalScore: 88,
            provisionalLp: 7,
        });
        useStore.getState().setTurnEvaluation('turn-1', evaluation({ turnId: 'turn-1' }));

        useStore.getState().syncMessages([{
            id: 'turn-1',
            role: 'user',
            content: 'Yes, I can speak English.',
            correctionStatus: 'pending',
            evaluationStatus: 'pending',
        }]);

        expect(useStore.getState().messages[0]).toMatchObject({
            correctionStatus: 'ready',
            evaluationStatus: 'ready',
            correction: { provisionalLp: 7 },
            evaluation: { turnId: 'turn-1' },
        });
    });

    it('normalizes a legacy nested evaluation id to the canonical session turn id', () => {
        useStore.getState().addMessage('user', 'Where is Gate 5?', '10:2');

        useStore.getState().setTurnEvaluation('10:2', evaluation({
            turnId: '2',
            correction: {
                original: 'Where is Gate 5?',
                suggested: 'Where is Gate 5?',
                reason: 'No correction needed',
            },
            missionCandidates: [mission({
                id: 'mission-session-turn',
                sourceTurnId: '2',
            })],
        }));

        const message = useStore.getState().messages[0];
        expect(message.id).toBe('10:2');
        expect(message.evaluation?.turnId).toBe('10:2');
        expect(message.evaluation?.missionCandidates?.[0].sourceTurnId).toBe('10:2');
    });

    it('normalizes a legacy nested correction id to the canonical session turn id', () => {
        useStore.getState().addMessage('user', 'It is over there.', '10:3');

        useStore.getState().setTurnCorrection('10:3', {
            turnId: '3',
            provider: 'test',
            model: 'test',
            createdAt: '2026-08-12T00:00:00.000Z',
            original: 'It is over there.',
            suggested: 'It is over there.',
            reason: 'No correction needed',
            provisionalScore: 90,
            provisionalLp: 8,
        });

        expect(useStore.getState().messages[0].correction?.turnId).toBe('10:3');
    });

    it('adopts replayed speech evidence and re-evaluates sentence missions', () => {
        const candidate = mission({
            id: 'mission-synced-browser-segments',
            kind: 'length',
            title: 'Two sentences',
            target: 'Speak at least two sentences.',
            checks: [{ type: 'sentenceCount', min: 2 }],
        });
        const text = 'I like morning walks they make me feel fresh';
        useStore.getState().setActiveMissions([candidate]);

        useStore.getState().syncMessages([{
            id: 'turn-synced-evidence',
            role: 'user',
            content: text,
            speechEvidence: {
                version: 1,
                provider: 'browser',
                finalSegments: ['I like morning walks', 'they make me feel fresh'],
            },
        }]);

        expect(useStore.getState().messages[0].completedMissions?.map((item) => item.missionId))
            .toEqual([candidate.id]);
    });

    it('preserves local speech evidence when a replay update omits it', () => {
        const text = 'I like morning walks they make me feel fresh';
        const speechEvidence = {
            version: 1 as const,
            provider: 'browser' as const,
            finalSegments: ['I like morning walks', 'they make me feel fresh'],
        };
        useStore.setState({ activeMissions: [], missionQueue: [] });
        useStore.getState().addMessage('user', text, 'turn-local-evidence', speechEvidence);

        useStore.getState().syncMessages([{
            id: 'turn-local-evidence',
            role: 'user',
            content: text,
        }]);

        expect(useStore.getState().messages[0].speechEvidence).toEqual(speechEvidence);
    });

    it('keeps authoritative replay content and evidence as one versioned pair', () => {
        const candidate = mission({
            id: 'mission-authoritative-replay-evidence',
            kind: 'length',
            title: 'Two sentences',
            target: 'Speak at least two sentences.',
            checks: [{ type: 'sentenceCount', min: 2 }],
        });
        useStore.getState().setActiveMissions([candidate]);
        useStore.getState().addMessage(
            'user',
            'I like morning walks they make me feel fresh with extra stale partial words',
            'turn-authoritative-replay-evidence',
        );

        useStore.getState().syncMessages([{
            id: 'turn-authoritative-replay-evidence',
            role: 'user',
            content: 'I like morning walks they make me feel fresh',
            speechEvidence: {
                version: 1,
                provider: 'browser',
                finalSegments: ['I like morning walks', 'they make me feel fresh'],
            },
        }]);

        expect(useStore.getState().messages[0]).toMatchObject({
            content: 'I like morning walks they make me feel fresh',
            completedMissions: [{ missionId: candidate.id }],
        });
    });

    it('clears stale error metadata when window sync supplies a ready evaluation', () => {
        useStore.setState({
            messages: [{
                id: 'turn-1',
                role: 'user',
                content: 'Recovered answer.',
                evaluationStatus: 'unavailable',
                evaluationErrorCode: 'stale_replay',
            }],
        });

        useStore.getState().syncMessages([{
            id: 'turn-1',
            role: 'user',
            content: 'Recovered answer.',
            evaluationStatus: 'ready',
            evaluation: evaluation({ turnId: 'turn-1' }),
        }]);

        expect(useStore.getState().messages[0]).toMatchObject({
            evaluationStatus: 'ready',
            evaluation: { turnId: 'turn-1' },
        });
        expect(useStore.getState().messages[0].evaluationErrorCode).toBeUndefined();
    });

    it('never removes viewer socket history when a stale main-window update arrives', () => {
        useStore.setState({
            messages: [
                { role: 'user', content: 'First local answer.' },
                { role: 'assistant', content: 'First local reply.' },
                { id: 'turn-2', role: 'user', content: 'Second local answer.', evaluationStatus: 'pending' },
                { id: 'turn-2', role: 'assistant', content: 'Second local reply.' },
            ],
        });

        useStore.getState().syncMessages([
            { id: 'turn-2', role: 'user', content: 'Second local answer.', evaluationStatus: 'ready', evaluation: evaluation({ turnId: 'turn-2' }) },
            { id: 'turn-2', role: 'assistant', content: 'Second local reply.' },
        ]);

        expect(useStore.getState().messages.map((message) => message.content)).toEqual([
            'First local answer.',
            'First local reply.',
            'Second local answer.',
            'Second local reply.',
        ]);
        expect(useStore.getState().messages[2].evaluationStatus).toBe('ready');
    });

    it('preserves mission completion and LP source data across a stale batch sync', () => {
        const completion = {
            missionId: 'mission-because',
            title: 'Reason Builder',
            target: 'Use because.',
            rewardLp: 6,
            reason: 'Completed',
        };
        useStore.setState({
            messages: [{
                id: 'turn-1',
                role: 'user',
                content: 'I stayed home because it rained.',
                completedMissions: [completion],
                correctionStatus: 'ready',
                evaluationStatus: 'pending',
            }],
        });

        useStore.getState().syncMessages([{
            id: 'turn-1',
            role: 'user',
            content: 'I stayed home because it rained.',
            correctionStatus: 'pending',
            evaluationStatus: 'ready',
            evaluation: evaluation({ turnId: 'turn-1' }),
        }]);

        expect(useStore.getState().messages[0]).toMatchObject({
            completedMissions: [completion],
            evaluationStatus: 'ready',
            evaluation: { turnId: 'turn-1' },
        });
    });
});

describe('topic conversation state', () => {
    beforeEach(() => {
        resetStore();
    });

    it('stores topic metadata on conversation messages', () => {
        useStore.getState().addMessage('assistant', 'Where did you travel?', 'turn-opening', undefined, {
            learningSessionId: 'learning-1',
            segmentId: 'segment-1',
            topicId: 'travel',
            createdAt: '2026-08-08T00:00:00.000Z',
            isOpening: true,
        });

        expect(useStore.getState().messages[0]).toMatchObject({
            segmentId: 'segment-1',
            topicId: 'travel',
            isOpening: true,
        });
    });

    it('keeps repeated topics as separate ordered segments until clear', () => {
        useStore.getState().setConversationState('learning-1', [], null);
        const base = {
            topicId: 'travel' as const,
            label: '여행',
            mode: 'guided_conversation' as const,
            aiRole: 'conversation partner',
            userRole: 'learner',
            scenarioId: 'travel_best_trip',
            scenarioTitle: '최고의 여행',
            openingLine: 'What is the best trip you have ever taken?',
            status: 'active' as const,
            startedAt: '2026-08-08T00:00:00.000Z',
        };
        useStore.getState().upsertTopicSegment({
            ...base,
            segmentId: 'segment-1',
            sequence: 1,
            occurrence: 1,
        });
        useStore.getState().upsertTopicSegment({
            ...base,
            segmentId: 'segment-2',
            sequence: 2,
            occurrence: 2,
        });

        expect(useStore.getState().topicSegments.map((segment) => segment.segmentId)).toEqual([
            'segment-1',
            'segment-2',
        ]);
        expect(useStore.getState().activeSegmentId).toBe('segment-2');

        useStore.getState().clearMessages();
        expect(useStore.getState().topicSegments).toEqual([]);
        expect(useStore.getState().learningSessionId).toBeNull();
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

    it('rebuilds mission completions from later replayed messages when evaluation candidates arrive late', () => {
        useStore.getState().setActiveMissions([]);
        useStore.getState().beginSessionReplay();
        useStore.getState().addMessage('user', 'I prefer tea.', '4:1');
        useStore.getState().addMessage('assistant', 'Why?', '4:1');
        useStore.getState().addMessage('user', 'I agree because tea helps me relax.', '4:2');

        useStore.getState().addMissionCandidates([mission({
            id: 'mission-replayed-because',
            sourceTurnId: '1',
        })]);

        expect(useStore.getState().messages[2].completedMissions).toMatchObject([{
            missionId: 'mission-replayed-because',
        }]);
        expect(useStore.getState().activeMissions).toEqual([]);
        useStore.getState().finishSessionReplay();
    });

    it('does not retroactively complete a live mission candidate before it is shown', () => {
        useStore.getState().addMessage('user', 'I prefer tea.', '5:1');
        useStore.getState().addMessage('user', 'I agree because tea helps me relax.', '5:2');

        useStore.getState().addMissionCandidates([mission({
            id: 'mission-live-because',
            sourceTurnId: '5:1',
        })]);

        expect(useStore.getState().messages[1].completedMissions).toBeUndefined();
        expect(useStore.getState().activeMissions.map((item) => item.id)).toContain('mission-live-because');
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
        [['I think', 'in my opinion'], '자신의 생각이나 의견임을 분명히 밝힐 때 사용합니다.', 'In my opinion, this option is better.'],
        [['I prefer', 'I would rather'], '두 선택지 중 더 좋아하거나 원하는 것을 말할 때 사용합니다.', 'I would rather stay home tonight.'],
        [['usually', 'often', 'sometimes'], '어떤 행동을 얼마나 자주 하는지 말할 때 사용합니다.', 'I usually go for a walk after dinner.'],
        [['first', 'then', 'finally'], '여러 행동이나 생각을 순서대로 설명할 때 사용합니다.', 'First, I stretch, then I start running.'],
        [['also', 'in addition'], '앞에서 말한 내용에 관련 정보를 하나 더 덧붙일 때 사용합니다.', 'The class is useful, and it is also fun.'],
        [['maybe', 'perhaps', 'probably'], '확실하지 않은 예상이나 가능성을 조심스럽게 말할 때 사용합니다.', 'Maybe I will visit my parents this weekend.'],
        [['I agree', 'that is true'], '상대의 의견에 동의한다는 뜻을 분명히 전할 때 사용합니다.', 'I agree that exercise is important.'],
        [['I do not agree', 'I see it differently'], '상대와 다른 의견을 정중하게 말할 때 사용합니다.', 'I see it differently because cost matters to me.'],
        [['more than', 'less than'], '수량, 시간, 정도가 어떤 기준보다 많거나 적다고 비교할 때 사용합니다.', 'My commute takes more than thirty minutes.'],
        [['such as'], '앞에서 말한 범주에 구체적인 예를 덧붙일 때 사용합니다.', 'I enjoy outdoor activities such as hiking and cycling.'],
        [['however', 'on the other hand'], '앞 내용과 대조되는 생각이나 다른 관점을 이어 말할 때 사용합니다.', 'I like the price. However, the room is too small.'],
        [['it depends'], '상황이나 조건에 따라 답이 달라진다고 말할 때 사용합니다.', 'It depends on the weather.'],
        [['if'], '어떤 조건에서 일이 일어나는지 더 정확하게 말할 때 사용합니다.', 'If I have time, I will practice more.'],
        [['used to'], '지금은 아니지만 예전에 반복했던 행동이나 상태를 말할 때 사용합니다.', 'I used to play soccer after school.'],
        [['I mean', 'in other words'], '방금 한 말을 더 쉽게 풀거나 정확한 뜻으로 다시 설명할 때 사용합니다.', 'The trip was exhausting. I mean, we walked all day.'],
        [['sounds good', 'that makes sense'], '상대의 제안에 긍정적으로 반응하거나 설명을 이해했다고 말할 때 사용합니다.', 'That makes sense. Thanks for explaining it.'],
        [['actually', 'in fact'], '예상과 다른 사실을 바로잡거나 중요한 사실을 강조할 때 사용합니다.', 'Actually, I have already seen that movie.'],
    ])('adds natural guidance for %s expression missions', (expressions, usageContext, exampleSentence) => {
        const expression = expressions.join(', ');
        useStore.getState().addMissionCandidates([
            mission({
                id: `mission-${expression}`,
                kind: 'grammar',
                title: 'Expression practice',
                target: `Use ${expression}.`,
                usageContext: '이 표현을 답변 안에 자연스럽게 넣을 때 사용합니다.',
                exampleSentence: `I can use "${expressions[0]}" to make my answer clearer.`,
                checks: [{ type: 'includesAny', value: expressions }],
            }),
        ]);

        const [activeMission] = useStore.getState().activeMissions;
        expect(activeMission.target).toBe(expressions.length === 1
            ? `답변에 ${expression}를 자연스럽게 사용해보세요.`
            : `답변에 ${expression} 중 하나를 자연스럽게 사용해보세요.`);
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

    it('counts STT sentence boundaries expressed as line breaks or full-width punctuation', () => {
        const candidate = mission({
            id: 'mission-spoken-two-sentences',
            kind: 'length',
            title: 'Two sentences',
            target: 'Speak at least two sentences.',
            checks: [{ type: 'sentenceCount', min: 2 }],
        });

        useStore.getState().setActiveMissions([candidate]);
        useStore.getState().addMessage('user', 'I like morning walks\nThey make me feel fresh', 'turn-line-break');

        expect(useStore.getState().messages[0].completedMissions?.map((item) => item.missionId)).toEqual([candidate.id]);
        expect(useStore.getState().activeMissions).toEqual([]);
    });

    it('completes a two-sentence mission from matching browser final segments', () => {
        const candidate = mission({
            id: 'mission-browser-segments',
            kind: 'length',
            title: 'Two sentences',
            target: 'Speak at least two sentences.',
            checks: [{ type: 'sentenceCount', min: 2 }],
        });
        const text = 'I like money works they made me very fresh';

        useStore.getState().setActiveMissions([candidate]);
        useStore.getState().addMessage('user', text, 'turn-browser-segments', {
            version: 1,
            provider: 'browser',
            finalSegments: ['I like money works', 'they made me very fresh'],
        });

        expect(useStore.getState().messages[0].completedMissions?.map((item) => item.missionId))
            .toEqual([candidate.id]);
    });

    it('does not complete from one unpunctuated browser final segment', () => {
        const candidate = mission({
            id: 'mission-one-browser-segment',
            kind: 'length',
            title: 'Two sentences',
            target: 'Speak at least two sentences.',
            checks: [{ type: 'sentenceCount', min: 2 }],
        });
        const text = 'I like morning walks they make me feel fresh';

        useStore.getState().setActiveMissions([candidate]);
        useStore.getState().addMessage('user', text, 'turn-one-browser-segment', {
            version: 1,
            provider: 'browser',
            finalSegments: [text],
        });

        expect(useStore.getState().messages[0].completedMissions).toBeUndefined();
        expect(useStore.getState().activeMissions).toHaveLength(1);
    });

    it('rechecks the same finalized turn when browser segment evidence arrives', () => {
        const candidate = mission({
            id: 'mission-late-browser-segments',
            kind: 'length',
            title: 'Two sentences',
            target: 'Speak at least two sentences.',
            checks: [{ type: 'sentenceCount', min: 2 }],
        });
        const text = 'I like morning walks they make me feel fresh';

        useStore.getState().setActiveMissions([candidate]);
        useStore.getState().addMessage('user', text, 'turn-late-browser-segments');
        useStore.getState().addMessage('user', text, 'turn-late-browser-segments', {
            version: 1,
            provider: 'browser',
            finalSegments: ['I like morning walks', 'they make me feel fresh'],
        });

        expect(useStore.getState().messages).toHaveLength(1);
        expect(useStore.getState().messages[0].completedMissions?.map((item) => item.missionId))
            .toEqual([candidate.id]);
    });

    it('rechecks a finalized STT turn when its authoritative text replaces an earlier partial transcript', () => {
        const candidate = mission({
            id: 'mission-finalized-two-sentences',
            kind: 'length',
            title: 'Two sentences',
            target: 'Speak at least two sentences.',
            checks: [{ type: 'sentenceCount', min: 2 }],
        });

        useStore.getState().setActiveMissions([candidate]);
        useStore.getState().addMessage('user', 'I like morning walks', 'turn-authoritative');
        useStore.getState().addMessage('user', 'I like morning walks。They make me feel fresh！', 'turn-authoritative');

        expect(useStore.getState().messages[0].completedMissions?.map((item) => item.missionId)).toEqual([candidate.id]);
        expect(useStore.getState().activeMissions).toEqual([]);
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

    it('does not show duplicate missions that use the same success rule', () => {
        useStore.getState().addMissionCandidates([
            mission({
                id: 'connector-one',
                target: 'Use because to explain your answer.',
                checks: [{ type: 'connector' }],
            }),
            mission({
                id: 'connector-two',
                target: 'Add because, so, but, or for example.',
                checks: [{ type: 'connector' }],
            }),
        ]);

        expect(useStore.getState().activeMissions.map((item) => item.id)).toEqual(['connector-one']);
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
        expect(useStore.getState().messages.map((message) => message.content)).toEqual([
            'I stayed home because it rained.',
        ]);
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
        useStore.getState().addMessage('user', 'Old conversation.', 'old-turn');

        useStore.getState().beginSessionReplay();
        expect(useStore.getState().messages).toHaveLength(1);
        useStore.getState().finishSessionReplay();

        expect(useStore.getState().messages).toEqual([]);
        expect(useStore.getState().activeMissions).toEqual([]);
        expect(useStore.getState().missionQueue).toEqual([]);
    });

    it('keeps conversation visible until a reconnect replay is complete', () => {
        useStore.getState().addMessage('user', 'Visible throughout replay.', 'turn-1');
        useStore.getState().addMessage('assistant', 'Still visible.', 'turn-1');

        useStore.getState().beginSessionReplay();

        expect(useStore.getState().messages.map((message) => message.content)).toEqual([
            'Visible throughout replay.',
            'Still visible.',
        ]);

        useStore.getState().addMessage('user', 'Visible throughout replay.', 'turn-1');
        useStore.getState().addMessage('assistant', 'Still visible.', 'turn-1');
        useStore.getState().finishSessionReplay();

        expect(useStore.getState().messages.map((message) => message.content)).toEqual([
            'Visible throughout replay.',
            'Still visible.',
        ]);
    });

    it('marks only replayed ghost evaluations unavailable after an authoritative empty batch', () => {
        useStore.getState().addMessage('user', 'Current live answer.', 'live-turn');
        useStore.getState().beginSessionReplay();
        useStore.getState().addMessage('user', 'Old replayed answer.', '6:event-100');
        useStore.getState().addMessage('user', 'Evaluated replayed answer.', '7:6');
        useStore.getState().setTurnEvaluation('7:6', evaluation({ turnId: '7:6' }));

        useStore.getState().reconcileSessionReplayPendingEvaluations();

        const [live, stale, evaluated] = useStore.getState().messages;
        expect(live.evaluationStatus).toBe('pending');
        expect(stale).toMatchObject({
            evaluationStatus: 'unavailable',
            evaluationErrorCode: 'stale_replay',
        });
        expect(evaluated).toMatchObject({
            evaluationStatus: 'ready',
            evaluation: { turnId: '7:6' },
        });
    });

    it('does not reconcile a live turn that arrives after replay ended', () => {
        useStore.getState().beginSessionReplay();
        useStore.getState().addMessage('user', 'Old replayed answer.', '6:event-100');
        const replayedKeys = [...useStore.getState().sessionReplayMessageKeys];
        useStore.getState().finishSessionReplay();
        useStore.getState().addMessage('user', 'New live answer.', '8:1');

        useStore.getState().reconcileSessionReplayPendingEvaluations(replayedKeys);

        expect(useStore.getState().messages[0]).toMatchObject({
            id: '6:event-100',
            evaluationStatus: 'unavailable',
            evaluationErrorCode: 'stale_replay',
        });
        expect(useStore.getState().messages[1]).toMatchObject({
            id: '8:1',
            evaluationStatus: 'pending',
        });
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

    it('lets an authoritative late evaluation recover a stale replay placeholder', () => {
        useStore.getState().addMessage('user', 'Recovered answer.', '9:1');
        useStore.getState().setTurnEvaluationUnavailable('9:1', 'stale_replay');

        useStore.getState().setTurnEvaluation('9:1', evaluation({ turnId: '9:1' }));

        const message = useStore.getState().messages[0];
        expect(message.evaluationStatus).toBe('ready');
        expect(message.evaluation).toMatchObject({ turnId: '9:1' });
        expect(message.evaluationErrorCode).toBeUndefined();
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

    it('rejects older batch snapshots by session epoch and revision', () => {
        const base = {
            pendingCount: 1,
            inFlightCount: 0,
            phase: 'queued' as const,
            maxTurns: 4,
            delaySeconds: 30,
            nextFlushAtEpochMs: 1800000000000,
            serverEpochMs: 1799999970000,
            sessionEpoch: 3,
            revision: 4,
        };
        useStore.getState().setEvaluationBatchStatus(base);

        useStore.getState().setEvaluationBatchStatus({
            ...base,
            pendingCount: 0,
            phase: 'idle',
            revision: 3,
        });
        useStore.getState().setEvaluationBatchStatus({
            ...base,
            pendingCount: 0,
            phase: 'idle',
            sessionEpoch: 2,
            revision: 99,
        });

        expect(useStore.getState().evaluationBatchStatus).toMatchObject({
            pendingCount: 1,
            phase: 'queued',
            sessionEpoch: 3,
            revision: 4,
        });

        useStore.getState().setEvaluationBatchStatus({
            ...base,
            pendingCount: 0,
            phase: 'idle',
            revision: 5,
        });
        expect(useStore.getState().evaluationBatchStatus).toMatchObject({
            pendingCount: 0,
            phase: 'idle',
            revision: 5,
        });
    });

    it('protects an optimistic queued turn from an older idle REST snapshot', () => {
        useStore.getState().setEvaluationBatchStatus({
            pendingCount: 0,
            inFlightCount: 0,
            phase: 'idle',
            maxTurns: 4,
            delaySeconds: 30,
            nextFlushAtEpochMs: null,
            sessionEpoch: 7,
            revision: 2,
        });

        useStore.getState().queueLocalEvaluationBatchTurn(30, 4, 7);
        useStore.getState().setEvaluationBatchStatus({
            pendingCount: 0,
            inFlightCount: 0,
            phase: 'idle',
            maxTurns: 4,
            delaySeconds: 30,
            nextFlushAtEpochMs: null,
            sessionEpoch: 7,
            revision: 2,
        });

        expect(useStore.getState().evaluationBatchStatus).toMatchObject({
            pendingCount: 1,
            phase: 'queued',
            sessionEpoch: 7,
            revision: 2,
            optimistic: true,
        });

        useStore.getState().setEvaluationBatchStatus({
            pendingCount: 1,
            inFlightCount: 0,
            phase: 'queued',
            maxTurns: 4,
            delaySeconds: 30,
            nextFlushAtEpochMs: 1800000000000,
            sessionEpoch: 7,
            revision: 3,
        });
        expect(useStore.getState().evaluationBatchStatus).toMatchObject({
            pendingCount: 1,
            phase: 'queued',
            revision: 3,
            optimistic: false,
        });
    });

    it('does not let an unversioned legacy snapshot replace versioned batch state', () => {
        useStore.getState().setEvaluationBatchStatus({
            pendingCount: 1,
            inFlightCount: 1,
            phase: 'evaluating',
            maxTurns: 4,
            delaySeconds: 30,
            nextFlushAtEpochMs: null,
            sessionEpoch: 9,
            revision: 6,
        });

        useStore.getState().setEvaluationBatchStatus({
            pendingCount: 0,
            phase: 'idle',
            maxTurns: 4,
            delaySeconds: 30,
            nextFlushAtEpochMs: null,
        });

        expect(useStore.getState().evaluationBatchStatus).toMatchObject({
            pendingCount: 1,
            inFlightCount: 1,
            phase: 'evaluating',
            sessionEpoch: 9,
            revision: 6,
        });
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
