'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const VOICE_LOAD_TIMEOUT_MS = 800;

function languageMatches(voice: SpeechSynthesisVoice, language: string): boolean {
  const requested = language.toLowerCase();
  const candidate = voice.lang.toLowerCase();
  return candidate === requested || candidate.startsWith(`${requested.split('-')[0]}-`);
}

function voiceScore(voice: SpeechSynthesisVoice, language: string): number {
  const name = voice.name.toLowerCase();
  const requested = language.toLowerCase();
  const exactLanguage = voice.lang.toLowerCase() === requested;
  let score = exactLanguage ? 100 : 50;

  // Chromium on Windows commonly exposes these higher-quality Korean voices.
  // Prefer natural/online voices, then well-known Korean system voices.
  if (name.includes('natural')) score += 80;
  if (/sunhi|injoo?n/.test(name)) score += 70;
  if (name.includes('google') && /korean|한국/.test(name)) score += 60;
  if (name.includes('heami')) score += 45;
  if (name.includes('microsoft') || name.includes('google')) score += 15;
  if (voice.default) score += 5;
  return score;
}

export function selectPreferredVoice(
  voices: SpeechSynthesisVoice[],
  language: string,
): SpeechSynthesisVoice | undefined {
  return voices
    .filter((voice) => languageMatches(voice, language))
    .sort((left, right) => voiceScore(right, language) - voiceScore(left, language))[0];
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

export function useBrowserTts() {
  const generationRef = useRef(0);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const cancel = useCallback(() => {
    generationRef.current += 1;
    if (typeof window !== 'undefined') window.speechSynthesis?.cancel();
    setIsSpeaking(false);
  }, []);

  const speak = useCallback(async (text: string, language = 'ko-KR'): Promise<boolean> => {
    if (
      typeof window === 'undefined'
      || !text.trim()
      || !('speechSynthesis' in window)
      || !('SpeechSynthesisUtterance' in window)
    ) return false;

    const generation = generationRef.current + 1;
    generationRef.current = generation;
    window.speechSynthesis.cancel();
    const voices = await loadVoices(window.speechSynthesis);
    if (generationRef.current !== generation) return false;
    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = language;
      utterance.rate = language.toLowerCase().startsWith('ko') ? 1 : 0.98;
      utterance.pitch = 1;
      const voice = selectPreferredVoice(voices, language);
      if (voice) utterance.voice = voice;
      const finish = (played: boolean) => {
        if (generationRef.current === generation) setIsSpeaking(false);
        resolve(played);
      };
      utterance.onend = () => finish(true);
      utterance.onerror = () => finish(false);
      setIsSpeaking(true);
      window.speechSynthesis.speak(utterance);
    });
  }, []);

  useEffect(() => cancel, [cancel]);
  return { speak, cancel, isSpeaking };
}
