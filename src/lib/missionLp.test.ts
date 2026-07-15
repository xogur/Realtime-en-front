import { describe, expect, it } from 'vitest';
import { getBaseTurnLp, getCurrentMessageLp, getTurnLp, isMissionGamingAttempt, MISSION_GAMING_PENALTY_LP } from './missionLp';
import type { ChatMessage, TurnEvaluation } from '@/stores/useStore';

function evaluation(scores: Partial<TurnEvaluation['scores']>): TurnEvaluation {
    const mergedScores = {
        grammar: 70,
        vocabulary: 70,
        relevance: 70,
        fluency: 70,
        interaction: 70,
        overall: 70,
        ...scores,
    };

    return {
        rubricVersion: 'speaking-v2',
        turnId: 'turn-1',
        provider: 'test',
        model: 'test',
        createdAt: '2026-06-10T00:00:00.000Z',
        scores: mergedScores,
        evidence: {
            grammar: '',
            vocabulary: '',
            relevance: '',
            fluency: '',
            interaction: '',
            overall: '',
        },
        feedback: {
            summary: '',
            strength: '',
            improvement: '',
            nextPractice: '',
        },
        cefrEstimate: {
            level: 'A2',
            reason: '',
        },
        correction: {
            original: '',
            suggested: '',
            reason: '',
        },
        capabilities: {
            pronunciation: 'not_available',
        },
        confidence: 'high',
        confidenceReasons: [],
    };
}

function userMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
    return {
        id: 'turn-1',
        role: 'user',
        content: 'because',
        completedMissions: [
            {
                missionId: 'mission-because',
                title: 'Reason Builder',
                target: 'Use because.',
                rewardLp: 6,
                reason: 'Used because.',
            },
        ],
        ...overrides,
    };
}

describe('mission LP anti-gaming rules', () => {
    it('uses realtime correction LP before batch evaluation arrives', () => {
        const message = userMessage({
            completedMissions: undefined,
            correction: {
                turnId: 'turn-1',
                provider: 'test',
                model: 'test',
                createdAt: '2026-06-12T00:00:00.000Z',
                original: 'I like pizza.',
                suggested: '',
                reason: 'Natural answer.',
                provisionalScore: 85,
                provisionalLp: 6,
            },
        });

        expect(getCurrentMessageLp(message)).toBe(6);
    });

    it('replaces realtime LP with batch LP instead of double counting it', () => {
        const batchEvaluation = evaluation({ overall: 70, relevance: 70, interaction: 70 });
        const message = userMessage({
            completedMissions: undefined,
            evaluation: batchEvaluation,
            correction: {
                turnId: 'turn-1',
                provider: 'test',
                model: 'test',
                createdAt: '2026-06-12T00:00:00.000Z',
                original: 'I like pizza.',
                suggested: '',
                reason: 'Natural answer.',
                provisionalScore: 95,
                provisionalLp: 8,
            },
        });

        expect(getCurrentMessageLp(message)).toBe(getTurnLp({ message, evaluation: batchEvaluation }));
    });

    it('keeps deterministic mission rewards when a low-confidence batch evaluation replaces realtime LP', () => {
        const message = userMessage({
            evaluation: {
                ...evaluation({ overall: 90, relevance: 90, interaction: 90 }),
                confidence: 'low',
            },
            correction: {
                turnId: 'turn-1',
                provider: 'test',
                model: 'test',
                createdAt: '2026-06-12T00:00:00.000Z',
                original: 'I stayed home because it rained.',
                suggested: '',
                reason: 'Natural answer.',
                provisionalScore: 70,
                provisionalLp: 3,
            },
        });

        expect(getCurrentMessageLp(message)).toBe(9);
    });

    it('gives steady positive LP for a solid expanded answer', () => {
        const turn = {
            message: userMessage({
                content: 'I stayed home because it rained and I wanted to rest.',
                completedMissions: undefined,
            }),
            evaluation: evaluation({
                relevance: 70,
                interaction: 70,
                overall: 70,
            }),
        };

        expect(getBaseTurnLp(turn)).toBe(12);
        expect(getTurnLp(turn)).toBe(12);
    });

    it('forces a completed mission with off-topic evaluation to at least -8 LP', () => {
        const turn = {
            message: userMessage(),
            evaluation: evaluation({
                relevance: 10,
                interaction: 15,
                overall: 25,
            }),
        };

        expect(isMissionGamingAttempt(turn)).toBe(true);
        expect(getTurnLp(turn)).toBe(MISSION_GAMING_PENALTY_LP);
    });

    it('does not penalize a real mission completion with acceptable relevance', () => {
        const turn = {
            message: userMessage({
                content: 'I stayed home because it rained and I was tired.',
            }),
            evaluation: evaluation({
                relevance: 78,
                interaction: 72,
                overall: 76,
            }),
        };

        expect(isMissionGamingAttempt(turn)).toBe(false);
        expect(getTurnLp(turn)).toBeGreaterThan(0);
    });

    it('does not classify a low-quality non-mission answer as mission gaming', () => {
        const turn = {
            message: userMessage({
                content: 'No.',
                completedMissions: undefined,
            }),
            evaluation: evaluation({
                relevance: 20,
                interaction: 20,
                overall: 30,
            }),
        };

        expect(isMissionGamingAttempt(turn)).toBe(false);
        expect(getTurnLp(turn)).toBeLessThanOrEqual(MISSION_GAMING_PENALTY_LP);
    });
});
