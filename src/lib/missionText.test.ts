import { describe, expect, it } from 'vitest';
import {
  countExplicitSentences,
  countMissionSentences,
  countQualifiedSttSegments,
} from './missionText';
import type { SpeechEvidenceV1 } from './stt';

const evidence = (finalSegments: string[]): SpeechEvidenceV1 => ({
  version: 1,
  provider: 'browser',
  finalSegments,
});

describe('mission sentence counting', () => {
  it('counts punctuation, line breaks, and full-width punctuation', () => {
    expect(countExplicitSentences('I like it. It is useful.')).toBe(2);
    expect(countExplicitSentences('I like it\nIt is useful')).toBe(2);
    expect(countExplicitSentences('I like it。It is useful！')).toBe(2);
  });

  it('uses two qualified final STT segments without changing the transcript', () => {
    const text = 'I like money works they made me very fresh';
    expect(countMissionSentences(text, evidence([
      'I like money works',
      'they made me very fresh',
    ]))).toEqual({ count: 2, source: 'stt_segments' });
  });

  it('keeps a single unpunctuated final segment as one sentence', () => {
    const text = 'I like morning walks they make me feel fresh';
    expect(countMissionSentences(text, evidence([text]))).toEqual({ count: 1, source: 'none' });
  });

  it('merges a continuation segment into the preceding thought', () => {
    const text = 'I stayed home because it rained';
    expect(countQualifiedSttSegments(text, evidence([
      'I stayed home',
      'because it rained',
    ]))).toBe(1);
  });

  it('merges after an unfinished prior segment', () => {
    const text = 'I want to visit the museum';
    expect(countQualifiedSttSegments(text, evidence(['I want to', 'visit the museum']))).toBe(1);
  });

  it('rejects filler and one-word fragments', () => {
    const text = 'Um I like this cafe';
    expect(countQualifiedSttSegments(text, evidence(['Um', 'I like this cafe']))).toBe(1);
  });

  it.each([
    [['I would like', 'some coffee please'], 'I would like some coffee please'],
    [['My favorite food', 'is pasta'], 'My favorite food is pasta'],
    [['I went home', 'after work'], 'I went home after work'],
    [['um yeah', 'I like this cafe'], 'um yeah I like this cafe'],
  ])('does not mistake ordinary recognition chunks for two clauses', (segments, text) => {
    expect(countQualifiedSttSegments(text, evidence(segments))).toBe(1);
  });

  it.each([
    [['I think', 'it is useful'], 'I think it is useful'],
    [['I know', 'it was expensive'], 'I know it was expensive'],
    [['I like', 'coffee tastes good'], 'I like coffee tastes good'],
  ])('merges a reporting verb with its following complement', (segments, text) => {
    expect(countQualifiedSttSegments(text, evidence(segments))).toBe(1);
  });

  it.each([
    [["I'm tired", "She's happy"], "I'm tired She's happy"],
    [['I bought coffee', 'She smiled at me'], 'I bought coffee She smiled at me'],
    [['He speaks English', 'She likes tea'], 'He speaks English She likes tea'],
  ])('accepts common contractions and verb inflections in two clauses', (segments, text) => {
    expect(countQualifiedSttSegments(text, evidence(segments))).toBe(2);
  });

  it.each([
    [['I got coffee', 'She ran home'], 'I got coffee She ran home'],
    [['I found it', 'He left early'], 'I found it He left early'],
    [["John's tired", "Mary's ready"], "John's tired Mary's ready"],
  ])('accepts common irregular verbs and name contractions', (segments, text) => {
    expect(countQualifiedSttSegments(text, evidence(segments))).toBe(2);
  });

  it.each([
    [['I like tea', "John's coffee shop"], "I like tea John's coffee shop"],
    [['I saw', "my friend's new car"], "I saw my friend's new car"],
  ])('does not treat possessive noun phrases as clauses', (segments, text) => {
    expect(countQualifiedSttSegments(text, evidence(segments))).toBe(1);
  });

  it.each([
    [['I thought', 'it was useful'], 'I thought it was useful'],
    [['She said', 'it was ready'], 'She said it was ready'],
    [['I realized', 'the shop was closed'], 'I realized the shop was closed'],
    [['I wanted', 'it to work'], 'I wanted it to work'],
  ])('merges inflected reporting verbs with their complements', (segments, text) => {
    expect(countQualifiedSttSegments(text, evidence(segments))).toBe(1);
  });

  it('ignores evidence whose joined segments do not match the final transcript', () => {
    expect(countMissionSentences(
      'I like this cafe',
      evidence(['I like this cafe', 'The coffee is good']),
    )).toEqual({ count: 1, source: 'none' });
  });

  it('can disable the STT segment fallback with a feature flag input', () => {
    const text = 'I like this cafe the coffee is good';
    expect(countMissionSentences(
      text,
      evidence(['I like this cafe', 'the coffee is good']),
      false,
    )).toEqual({ count: 1, source: 'none' });
  });
});
