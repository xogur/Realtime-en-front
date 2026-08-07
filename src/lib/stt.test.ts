import { describe, expect, it } from 'vitest';
import {
  assembleBrowserSpeechEvent,
  buildBrowserPartialTranscriptMessage,
  buildBrowserTranscriptMessage,
  getBrowserSttConfig,
  isLateBrowserFinal,
  isLikelyPlaybackEcho,
  mapBrowserSpeechError,
  reconcileBrowserFinalSegments,
  resolveSttProvider,
} from './stt';

describe('STT provider selection', () => {
  it('uses server STT by default while preserving browser aliases', () => {
    expect(resolveSttProvider()).toBe('server');
    expect(resolveSttProvider('browser')).toBe('browser');
    expect(resolveSttProvider('web-speech')).toBe('browser');
    expect(resolveSttProvider('webspeech')).toBe('browser');
    expect(resolveSttProvider('server')).toBe('server');
    expect(resolveSttProvider('backend')).toBe('server');
    expect(resolveSttProvider('realtimestt')).toBe('server');
    expect(resolveSttProvider('unknown')).toBe('server');
  });
});

describe('browser STT configuration', () => {
  it('uses English defaults matching the center browser recognizer behavior', () => {
    expect(getBrowserSttConfig({})).toEqual({
      language: 'en-US',
      continuous: true,
      interimResults: true,
      maxAlternatives: 1,
      processLocally: false,
      unspokenPunctuation: true,
      aecMode: 'auto',
      autoGainControl: true,
      phrases: [],
      silenceMs: 1_500,
    });
  });

  it('bounds configurable browser recognition options', () => {
    expect(getBrowserSttConfig({
      NEXT_PUBLIC_BROWSER_STT_LANGUAGE: ' en-GB ',
      NEXT_PUBLIC_BROWSER_STT_CONTINUOUS: 'false',
      NEXT_PUBLIC_BROWSER_STT_INTERIM_RESULTS: 'false',
      NEXT_PUBLIC_BROWSER_STT_MAX_ALTERNATIVES: '99',
      NEXT_PUBLIC_BROWSER_STT_PROCESS_LOCALLY: 'true',
      NEXT_PUBLIC_BROWSER_STT_UNSPOKEN_PUNCTUATION: 'false',
      NEXT_PUBLIC_BROWSER_STT_AEC_MODE: 'standard',
      NEXT_PUBLIC_BROWSER_STT_AUTO_GAIN_CONTROL: 'false',
      NEXT_PUBLIC_BROWSER_STT_PHRASES: 'schedule, itinerary, schedule',
      NEXT_PUBLIC_BROWSER_STT_SILENCE_MS: '9999',
    })).toEqual({
      language: 'en-GB',
      continuous: false,
      interimResults: false,
      maxAlternatives: 5,
      processLocally: true,
      unspokenPunctuation: false,
      aecMode: 'standard',
      autoGainControl: false,
      phrases: ['schedule', 'itinerary'],
      silenceMs: 1_500,
    });
  });
});

describe('browser speech events', () => {
  it('separates changed final and interim results', () => {
    expect(assembleBrowserSpeechEvent({
      resultIndex: 1,
      results: [
        { 0: { transcript: 'old' }, isFinal: true, length: 1 },
        { 0: { transcript: ' hello ' }, isFinal: true, length: 1 },
        { 0: { transcript: ' how are you ' }, isFinal: false, length: 1 },
      ],
    })).toEqual({
      finals: ['hello'],
      finalSegments: [{ resultIndex: 1, transcript: 'hello' }],
      interim: 'how are you',
    });
  });

  it('maps browser errors to stable application codes', () => {
    expect(mapBrowserSpeechError('not-allowed')).toBe('MICROPHONE_DENIED');
    expect(mapBrowserSpeechError('audio-capture')).toBe('MICROPHONE_UNAVAILABLE');
    expect(mapBrowserSpeechError('no-speech')).toBe('STT_NO_RESULT');
    expect(mapBrowserSpeechError('network')).toBe('STT_UNAVAILABLE');
    expect(mapBrowserSpeechError('aborted')).toBeNull();
  });

  it('filters substantial playback echo and late duplicate finals', () => {
    expect(isLikelyPlaybackEcho(
      'What would you like to practice today?',
      'What would you like to practice today?',
    )).toBe(true);
    expect(isLikelyPlaybackEcho('yes', 'Would you like to practice ordering food?')).toBe(false);
    expect(isLateBrowserFinal('I would like coffee', 'I would like coffee.', 1_000, 2_000)).toBe(true);
  });

  it('uses the existing backend text-message contract', () => {
    expect(JSON.parse(buildBrowserTranscriptMessage({
      text: '  Hello there.  ',
      speechEvidence: {
        version: 1,
        provider: 'browser',
        finalSegments: ['Hello there.'],
      },
    }))).toEqual({
      type: 'user_text_message',
      text: 'Hello there.',
      speechEvidence: {
        version: 1,
        provider: 'browser',
        finalSegments: ['Hello there.'],
      },
    });
  });

  it('appends distinct final recognition segments', () => {
    expect(reconcileBrowserFinalSegments(
      [{ resultIndex: 0, transcript: 'I like morning walks' }],
      [{ resultIndex: 1, transcript: 'They make me feel fresh' }],
    )).toEqual([
      { resultIndex: 0, transcript: 'I like morning walks' },
      { resultIndex: 1, transcript: 'They make me feel fresh' },
    ]);
  });

  it('preserves multiple final results delivered in one recognition event', () => {
    expect(reconcileBrowserFinalSegments([], [
      { resultIndex: 0, transcript: 'I like morning walks' },
      { resultIndex: 1, transcript: 'They make me feel fresh' },
    ])).toEqual([
      { resultIndex: 0, transcript: 'I like morning walks' },
      { resultIndex: 1, transcript: 'They make me feel fresh' },
    ]);
  });

  it('replaces earlier segments when the recognizer returns one cumulative final', () => {
    expect(reconcileBrowserFinalSegments(
      [{ resultIndex: 0, transcript: 'I like morning walks' }],
      [{ resultIndex: 0, transcript: 'I like morning walks They make me feel fresh today' }],
    )).toEqual([{
      resultIndex: 0,
      transcript: 'I like morning walks They make me feel fresh today',
    }]);
  });

  it('preserves repeated and overlapping finals at distinct result indexes', () => {
    expect(reconcileBrowserFinalSegments(
      [{ resultIndex: 0, transcript: 'I like it' }],
      [
        { resultIndex: 1, transcript: 'I like it' },
        { resultIndex: 2, transcript: 'I like it more' },
      ],
    )).toEqual([
      { resultIndex: 0, transcript: 'I like it' },
      { resultIndex: 1, transcript: 'I like it' },
      { resultIndex: 2, transcript: 'I like it more' },
    ]);
  });

  it('builds the cross-profile browser interim transcript contract', () => {
    expect(JSON.parse(buildBrowserPartialTranscriptMessage('I would like to'))).toEqual({
      type: 'browser_partial_transcript',
      content: 'I would like to',
    });
  });
});
