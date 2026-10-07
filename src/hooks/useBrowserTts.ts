'use client';

import { useCallback, useEffect, useState } from 'react';

const VOICE_LOAD_TIMEOUT_MS = 800;
export type BrowserTtsOwner = 'participant-name' | 'topic-selector' | 'mode-selector' | 'translator' | 'mission-learning' | 'default';
export type BrowserTtsPlaybackState = 'idle' | 'queued' | 'speaking';

type ActiveSpeech = {
  owner: BrowserTtsOwner;
  text: string;
  state: Exclude<BrowserTtsPlaybackState, 'idle'>;
  utterance: SpeechSynthesisUtterance;
  settle: (result: boolean) => void;
};

let activeSpeech: ActiveSpeech | null = null;
let pendingSpeechOwner: BrowserTtsOwner | null = null;
let speechGeneration = 0;
const listeners = new Set<() => void>();

function emitChange() { listeners.forEach((listener) => listener()); }

function languageMatches(voice: SpeechSynthesisVoice, language: string): boolean {
  const requested = language.toLowerCase();
  const candidate = voice.lang.toLowerCase();
  return candidate === requested || candidate.startsWith(`${requested.split('-')[0]}-`);
}

function voiceScore(voice: SpeechSynthesisVoice, language: string): number {
  const name = voice.name.toLowerCase();
  const requested = language.toLowerCase();
  let score = voice.lang.toLowerCase() === requested ? 100 : 50;
  if (name.includes('natural')) score += 80;
  if (/sunhi|injoo?n/.test(name)) score += 70;
  if (name.includes('google') && /korean|한국/.test(name)) score += 60;
  if (name.includes('heami')) score += 45;
  if (name.includes('microsoft') || name.includes('google')) score += 15;
  if (voice.default) score += 5;
  return score;
}

export function selectPreferredVoice(voices: SpeechSynthesisVoice[], language: string) {
  return voices
    .filter((voice) => languageMatches(voice, language))
    .sort((left, right) => voiceScore(right, language) - voiceScore(left, language))[0];
}

const MALE_VOICE = /\b(guy|david|mark|andrew|brian|christopher|eric|roger|steffan|davis|tony|jason|ryan|george|james|daniel|thomas|liam|male)\b/i;
const FEMALE_VOICE = /\b(aria|jenny|zira|michelle|ana|emma|ava|sonia|libby|susan|hazel|samantha|karen|moira|natasha|clara|female)\b/i;
const voiceGender = (voice: SpeechSynthesisVoice) => MALE_VOICE.test(voice.name) ? 'male' : FEMALE_VOICE.test(voice.name) ? 'female' : null;

/**
 * Picks a voice for one speaker of a dialogue. Variant 0 is the preferred voice;
 * variant 1 prefers an opposite-gender voice, then any other voice, so two
 * speakers stay distinguishable. A pitch shift is the last resort.
 */
export function selectSpeakerVoice(voices: SpeechSynthesisVoice[], language: string, variant: number) {
  const ranked = voices
    .filter((voice) => languageMatches(voice, language))
    .sort((left, right) => voiceScore(right, language) - voiceScore(left, language));
  const primary = ranked[0];
  if (!primary || variant <= 0) return { voice: primary, pitch: 1 };
  const gender = voiceGender(primary);
  const contrast = gender && ranked.find((voice) => voiceGender(voice) && voiceGender(voice) !== gender);
  const alternate = contrast || ranked.find((voice) => voice.name !== primary.name);
  return alternate ? { voice: alternate, pitch: 1 } : { voice: primary, pitch: 0.82 };
}

async function loadVoices(synthesis: SpeechSynthesis): Promise<SpeechSynthesisVoice[]> {
  const current = synthesis.getVoices();
  if (current.length > 0) return current;
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      synthesis.removeEventListener?.('voiceschanged', handleVoicesChanged);
      window.clearTimeout(timeout);
      resolve(synthesis.getVoices());
    };
    const handleVoicesChanged = () => finish();
    const timeout = window.setTimeout(finish, VOICE_LOAD_TIMEOUT_MS);
    synthesis.addEventListener?.('voiceschanged', handleVoicesChanged);
  });
}

function settleActive(result: boolean) {
  const current = activeSpeech;
  if (!current) return;
  activeSpeech = null;
  current.settle(result);
  emitChange();
}

function cancelOwnedSpeech(owner: BrowserTtsOwner) {
  if (pendingSpeechOwner === owner) { speechGeneration += 1; pendingSpeechOwner = null; }
  if (!activeSpeech || activeSpeech.owner !== owner) return;
  window.speechSynthesis?.cancel();
  settleActive(false);
}

async function speakOwned(owner: BrowserTtsOwner, text: string, language: string, rate?: number, requireVoice = false, voiceVariant = 0) {
  if (typeof window === 'undefined' || !text.trim()
    || !('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) return false;
  const generation = ++speechGeneration;
  pendingSpeechOwner = owner;

  if (activeSpeech) {
    window.speechSynthesis.cancel();
    settleActive(false);
  }
  const voices = requireVoice ? await loadVoices(window.speechSynthesis) : window.speechSynthesis.getVoices();
  if (generation !== speechGeneration) return false;
  pendingSpeechOwner = null;
  if (requireVoice && !selectPreferredVoice(voices, language)) return false;
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const settle = (result: boolean) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language;
    utterance.rate = rate !== undefined && Number.isFinite(rate)
      ? Math.min(10, Math.max(0.1, rate))
      : language.toLowerCase().startsWith('ko') ? 1 : 0.98;
    const { voice, pitch } = selectSpeakerVoice(voices, language, voiceVariant);
    utterance.pitch = pitch;
    if (voice) utterance.voice = voice;
    utterance.onstart = () => {
      if (activeSpeech?.utterance !== utterance) return;
      activeSpeech.state = 'speaking';
      emitChange();
    };
    utterance.onend = () => activeSpeech?.utterance === utterance
      ? settleActive(true) : settle(false);
    utterance.onerror = () => activeSpeech?.utterance === utterance
      ? settleActive(false) : settle(false);
    activeSpeech = { owner, text, state: 'queued', utterance, settle };
    emitChange();
    window.speechSynthesis.speak(utterance);
  });
}

export function getBrowserTtsPlaybackState() {
  return {
    owner: activeSpeech?.owner ?? null,
    text: activeSpeech?.text ?? '',
    state: activeSpeech?.state ?? 'idle' as BrowserTtsPlaybackState,
    isPlaying: activeSpeech?.state === 'speaking',
  };
}

export function useBrowserTts(owner: BrowserTtsOwner = 'default') {
  const [, forceRender] = useState(0);
  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      void loadVoices(window.speechSynthesis);
    }
    const listener = () => forceRender((value) => value + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      cancelOwnedSpeech(owner);
    };
  }, [owner]);

  const cancel = useCallback(() => cancelOwnedSpeech(owner), [owner]);
  const speak = useCallback(
    (text: string, language = 'ko-KR', rate?: number, requireVoice = false, voiceVariant = 0) => speakOwned(owner, text, language, rate, requireVoice, voiceVariant),
    [owner],
  );
  const playback = getBrowserTtsPlaybackState();
  return {
    speak,
    cancel,
    isSpeaking: playback.owner === owner && playback.state === 'speaking',
    playbackState: playback.owner === owner ? playback.state : 'idle' as BrowserTtsPlaybackState,
  };
}
