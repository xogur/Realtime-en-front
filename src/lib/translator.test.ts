import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  applySentenceType,
  isTranslatorWindowMessage,
  normalizeSpeechTranscript,
  resolveTranslatorApiUrl,
  translateText,
} from './translator';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('resolveTranslatorApiUrl', () => {
  it('prefers an explicit backend HTTP URL', () => {
    expect(resolveTranslatorApiUrl({
      apiUrl: 'http://localhost:18003/',
      wsUrl: 'ws://ignored.example/ws',
    })).toBe('http://localhost:18003/api/translate');
  });

  it('derives the endpoint from the configured websocket backend', () => {
    expect(resolveTranslatorApiUrl({
      wsUrl: 'wss://example.com:18003/ws?role=controller',
    })).toBe('https://example.com:18003/api/translate');
  });

  it('falls back to the current origin', () => {
    expect(resolveTranslatorApiUrl({
      locationOrigin: 'http://localhost:3000',
    })).toBe('http://localhost:3000/api/translate');
  });
});

describe('speech transcript punctuation', () => {
  it('infers unambiguous Korean and English questions', () => {
    expect(normalizeSpeechTranscript('어디에 가십니까', 'ko')).toEqual({
      text: '어디에 가십니까?', sentenceType: 'question', inferred: true,
    });
    expect(normalizeSpeechTranscript('Do you like chicken', 'en').text)
      .toBe('Do you like chicken?');
  });

  it('keeps ambiguous Korean endings editable instead of guessing', () => {
    expect(normalizeSpeechTranscript('너는 치킨을 좋아해', 'ko')).toEqual({
      text: '너는 치킨을 좋아해', sentenceType: 'original', inferred: false,
    });
    expect(applySentenceType('너는 치킨을 좋아해', 'question'))
      .toBe('너는 치킨을 좋아해?');
  });

  it('converts spoken punctuation words', () => {
    expect(normalizeSpeechTranscript('너는 치킨을 좋아해 물음표', 'ko')).toEqual({
      text: '너는 치킨을 좋아해?', sentenceType: 'question', inferred: true,
    });
  });
});

describe('translator window messages', () => {
  it('accepts only translator open and close messages', () => {
    expect(isTranslatorWindowMessage({ channel: 'realtime-en:translator', action: 'open' })).toBe(true);
    expect(isTranslatorWindowMessage({ channel: 'realtime-en:translator', action: 'delete' })).toBe(false);
  });
});

describe('translateText', () => {
  it('sends the language pair and validates the response contract', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      translated_text: 'Hello',
      source_language: 'ko',
      target_language: 'en',
      provider: 'argos',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(translateText('안녕하세요', 'ko', 'en')).resolves.toMatchObject({
      translated_text: 'Hello',
      provider: 'argos',
    });
    expect(fetchMock).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        text: '안녕하세요',
        source_language: 'ko',
        target_language: 'en',
      }),
    }));
  });

  it('rejects a response for a different language pair', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      translated_text: '안녕하세요',
      source_language: 'en',
      target_language: 'ko',
      provider: 'argos',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

    await expect(translateText('안녕하세요', 'ko', 'en'))
      .rejects.toThrow('올바르지 않은 응답');
  });
});
