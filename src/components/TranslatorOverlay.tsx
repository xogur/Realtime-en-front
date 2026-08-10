'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRightLeft, Headphones, Languages, Loader2, Mic, MicOff, X } from 'lucide-react';

import { useBrowserStt } from '@/hooks/useBrowserStt';
import {
  applySentenceType,
  normalizeSpeechTranscript,
  translateText,
  type TranslationLanguage,
  type TranslationSentenceType,
} from '@/lib/translator';


type TranslatorOverlayProps = {
  isOpen: boolean;
  onClose: () => void;
};

const LANGUAGE_LABELS: Record<TranslationLanguage, string> = {
  ko: '한국어',
  en: 'English',
};

const SPEECH_LANGUAGE: Record<TranslationLanguage, string> = {
  ko: 'ko-KR',
  en: 'en-US',
};

const STT_ERROR_MESSAGES: Record<string, string> = {
  BROWSER_STT_UNSUPPORTED: '이 브라우저는 음성 인식을 지원하지 않습니다. Chrome 또는 Edge를 사용해 주세요.',
  MICROPHONE_DENIED: '마이크 권한이 차단되었습니다. 브라우저 설정에서 권한을 허용해 주세요.',
  MICROPHONE_UNAVAILABLE: '사용 가능한 마이크를 찾지 못했습니다.',
  STT_NO_RESULT: '음성을 인식하지 못했습니다. 다시 말해 주세요.',
  STT_UNAVAILABLE: '음성 인식 서비스를 사용할 수 없습니다.',
};

export function TranslatorOverlay({ isOpen, onClose }: TranslatorOverlayProps) {
  const [sourceLanguage, setSourceLanguage] = useState<TranslationLanguage>('ko');
  const targetLanguage: TranslationLanguage = sourceLanguage === 'ko' ? 'en' : 'ko';
  const [sourceText, setSourceText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [interimText, setInterimText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [sentenceType, setSentenceType] = useState<TranslationSentenceType>('original');
  const [showSentenceTypeControls, setShowSentenceTypeControls] = useState(false);
  const requestControllerRef = useRef<AbortController | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  const runTranslation = useCallback(async (rawText: string) => {
    const text = rawText.trim();
    if (!text) return;

    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    setIsTranslating(true);
    setError(null);
    try {
      const result = await translateText(text, sourceLanguage, targetLanguage, controller.signal);
      if (!controller.signal.aborted) setTranslatedText(result.translated_text);
    } catch (translationError) {
      if (controller.signal.aborted) return;
      setTranslatedText('');
      setError(translationError instanceof Error
        ? translationError.message
        : '번역 중 오류가 발생했습니다.');
    } finally {
      if (requestControllerRef.current === controller) {
        requestControllerRef.current = null;
        setIsTranslating(false);
      }
    }
  }, [sourceLanguage, targetLanguage]);

  const { start: startStt, stop: stopStt, isRecording } = useBrowserStt({
    language: SPEECH_LANGUAGE[sourceLanguage],
    onFinalTranscript: (transcript) => {
      const normalized = normalizeSpeechTranscript(transcript.text, sourceLanguage);
      setInterimText('');
      setSourceText(normalized.text);
      setSentenceType(normalized.sentenceType);
      setShowSentenceTypeControls(true);
      void runTranslation(normalized.text);
    },
    onInterimTranscript: setInterimText,
    onReadyChange: () => undefined,
    onError: (code) => setError(STT_ERROR_MESSAGES[code] ?? '음성 인식 중 오류가 발생했습니다.'),
    onUnavailable: () => undefined,
    onSpeechStarted: () => {
      window.speechSynthesis?.cancel();
      setIsSpeaking(false);
    },
    getPlaybackState: () => ({ isPlaying: isSpeaking, text: translatedText }),
  });

  const stopTranslatorActivity = useCallback(() => {
    requestControllerRef.current?.abort();
    requestControllerRef.current = null;
    void stopStt();
    window.speechSynthesis?.cancel();
    setIsSpeaking(false);
    setInterimText('');
    setIsTranslating(false);
  }, [stopStt]);

  const handleClose = useCallback(() => {
    stopTranslatorActivity();
    onClose();
  }, [onClose, stopTranslatorActivity]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      stopTranslatorActivity();
    };
  }, [handleClose, isOpen, stopTranslatorActivity]);

  const handleSwap = () => {
    stopTranslatorActivity();
    setSourceLanguage(targetLanguage);
    setSourceText(translatedText);
    setTranslatedText(sourceText);
    setSentenceType('original');
    setShowSentenceTypeControls(false);
    setError(null);
  };

  const handleSentenceType = (nextSentenceType: TranslationSentenceType) => {
    const nextText = applySentenceType(sourceText, nextSentenceType);
    setSentenceType(nextSentenceType);
    setSourceText(nextText);
    void runTranslation(nextText);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    void runTranslation(sourceText);
  };

  const handleToggleMic = () => {
    setError(null);
    if (isRecording) {
      void stopStt();
    } else {
      setInterimText('');
      void startStt();
    }
  };

  const handleSpeak = () => {
    if (
      !translatedText.trim()
      || !('speechSynthesis' in window)
      || !('SpeechSynthesisUtterance' in window)
    ) {
      setError('이 브라우저에서는 문장 듣기를 사용할 수 없습니다.');
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(translatedText);
    utterance.lang = SPEECH_LANGUAGE[targetLanguage];
    const matchingVoice = window.speechSynthesis.getVoices().find(
      (voice) => voice.lang.toLowerCase().startsWith(targetLanguage),
    );
    if (matchingVoice) utterance.voice = matchingVoice;
    utterance.rate = 0.95;
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => {
      setIsSpeaking(false);
      setError('문장을 재생하지 못했습니다.');
    };
    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/70 p-4 backdrop-blur-xl sm:p-8">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="translator-title"
        className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-[2rem] border border-white/40 bg-[#f8f3ed] shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-zinc-900/10 px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <span className="rounded-2xl bg-blue-600 p-3 text-white"><Languages aria-hidden="true" /></span>
            <div>
              <h2 id="translator-title" className="text-xl font-black text-zinc-900 sm:text-2xl">한영 번역기</h2>
              <p className="text-base font-medium text-zinc-500">번역기를 닫으면 영어 회화를 다시 사용할 수 있습니다.</p>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={handleClose}
            className="rounded-full p-3 text-zinc-600 transition hover:bg-zinc-900/10 hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            aria-label="번역기 닫기"
          >
            <X className="h-7 w-7" />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-8">
          <div className="mb-5 flex items-center justify-center gap-4">
            <span className="min-w-24 rounded-full bg-zinc-900 px-5 py-2 text-center font-extrabold text-white">
              {LANGUAGE_LABELS[sourceLanguage]}
            </span>
            <button
              type="button"
              onClick={handleSwap}
              className="rounded-full border border-zinc-300 bg-white p-3 text-blue-700 shadow-sm transition hover:-rotate-180 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              aria-label="번역 방향 바꾸기"
            >
              <ArrowRightLeft />
            </button>
            <span className="min-w-24 rounded-full bg-blue-600 px-5 py-2 text-center font-extrabold text-white">
              {LANGUAGE_LABELS[targetLanguage]}
            </span>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <div className="flex min-h-64 flex-col rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <label htmlFor="translator-source" className="font-extrabold text-zinc-800">번역할 문장</label>
                <span className="text-xs font-semibold text-zinc-400">{sourceText.length}/2000</span>
              </div>
              <textarea
                id="translator-source"
                value={sourceText}
                onChange={(event) => {
                  setSourceText(event.target.value);
                  setSentenceType('original');
                  setShowSentenceTypeControls(false);
                }}
                maxLength={2000}
                placeholder={sourceLanguage === 'ko' ? '번역할 한국어를 입력하거나 말해 보세요.' : 'Type or speak an English sentence.'}
                className="min-h-40 flex-1 resize-none rounded-lg bg-transparent text-xl font-semibold leading-relaxed text-zinc-900 outline-none placeholder:text-zinc-300 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-4"
              />
              {interimText && <p className="mb-3 rounded-xl bg-blue-50 px-3 py-2 text-base font-semibold text-blue-700">듣는 중: {interimText}</p>}
              {showSentenceTypeControls && (
                <fieldset className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                  <legend className="px-1 text-sm font-extrabold text-amber-900">음성의 문장 유형을 확인해 주세요</legend>
                  <p className="mb-2 text-xs font-semibold text-amber-800">의문문 억양이 빠졌다면 ‘질문 ?’을 누르면 즉시 다시 번역합니다.</p>
                  <div className="flex flex-wrap gap-2">
                    {([
                      ['original', '문장 그대로'],
                      ['question', '질문 ?'],
                      ['exclamation', '감탄 !'],
                    ] as const).map(([type, label]) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => handleSentenceType(type)}
                        aria-pressed={sentenceType === type}
                        className={`rounded-full border px-3 py-2 text-sm font-extrabold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 ${sentenceType === type ? 'border-amber-700 bg-amber-700 text-white' : 'border-amber-300 bg-white text-amber-900 hover:bg-amber-100'}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </fieldset>
              )}
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleToggleMic}
                  className={`inline-flex items-center gap-2 rounded-full px-5 py-3 font-extrabold text-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${isRecording ? 'bg-red-500 hover:bg-red-600 focus-visible:ring-red-500' : 'bg-zinc-800 hover:bg-zinc-700 focus-visible:ring-zinc-700'}`}
                  aria-label={isRecording ? '음성 입력 중지' : '음성으로 입력'}
                >
                  {isRecording ? <MicOff /> : <Mic />}
                  {isRecording ? '듣기 중지' : '음성 입력'}
                </button>
                <button
                  type="submit"
                  disabled={!sourceText.trim() || isTranslating}
                  className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-6 py-3 font-extrabold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
                >
                  {isTranslating && <Loader2 className="animate-spin" />}
                  {isTranslating ? '번역 중' : '번역하기'}
                </button>
              </div>
            </div>

            <div className="flex min-h-64 flex-col rounded-3xl border border-blue-100 bg-blue-50/70 p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-extrabold text-zinc-800">번역 결과</h3>
              </div>
              <div aria-live="polite" className="min-h-40 flex-1 whitespace-pre-wrap text-xl font-semibold leading-relaxed text-zinc-900">
                {translatedText || <span className="text-zinc-300">번역 결과가 여기에 표시됩니다.</span>}
              </div>
              <button
                type="button"
                onClick={handleSpeak}
                disabled={!translatedText.trim()}
                className="mt-3 inline-flex w-fit items-center gap-2 rounded-full border border-blue-200 bg-white px-5 py-3 font-extrabold text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                <Headphones />
                {isSpeaking ? '재생 중' : '문장 들어보기'}
              </button>
            </div>
          </div>

          {error && <p role="alert" className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 font-bold text-red-700">{error}</p>}
        </form>
      </section>
    </div>
  );
}
