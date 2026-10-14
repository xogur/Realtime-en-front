'use client';

import type { LessonView } from './control';
import { TOPIC_LABELS } from './LessonTalkPanel';

/*
 * Guide screen (/chat) during a lesson talk: a read-only mirror of what the avatar
 * is teaching. Nothing here is interactive and the lesson never depends on it.
 */

export function LessonTalkViewer({ view }: { view: LessonView | null }) {
  const topic = view?.topicId ? TOPIC_LABELS[view.topicId] ?? '' : '';
  const status = !view ? null
    : view.phase === 'paused' ? '잠깐 멈춤'
      : view.phase === 'setup' ? 'AI 선생님과 오늘 할 수업을 고르고 있어요'
        : view.phase === 'recap' ? '오늘 수업 정리' : null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[60] flex select-none flex-col items-center justify-center gap-6 bg-[#1f2a24] px-10 text-center text-white">
      <p className="text-2xl font-black text-emerald-200">학습하기{topic ? ` · ${topic}` : ''}</p>
      {view?.titleKo ? <p className="text-4xl font-black">{view.titleKo}</p> : null}
      {view?.phase === 'lesson' && view.lineEn ? (
        <div className="max-w-4xl rounded-3xl bg-black/30 px-10 py-8">
          <p lang="en" className="text-5xl font-black leading-tight">{view.lineEn}</p>
          {view.lineKo ? <p lang="ko" className="mt-4 text-2xl font-bold text-white/75">{view.lineKo}</p> : null}
        </div>
      ) : null}
      {view?.expressionEn && view.phase !== 'setup' ? (
        <p className="text-2xl font-bold text-white/80">
          오늘의 표현 <span lang="en" className="ml-2 rounded-full bg-emerald-400/20 px-5 py-2 font-black text-emerald-100">{view.expressionEn}</span>
        </p>
      ) : null}
      {view && view.phase === 'lesson' && view.turnTotal > 0 ? (
        <div className="flex gap-2">
          {Array.from({ length: view.turnTotal }, (_, index) => (
            <span key={index} className={`h-3 w-3 rounded-full ${index < view.turnIndex ? 'bg-emerald-300' : index === view.turnIndex ? 'bg-white' : 'bg-white/30'}`} />
          ))}
        </div>
      ) : null}
      {status ? <p className="rounded-full bg-black/40 px-6 py-3 text-2xl font-black">{status}</p> : null}
      {!view ? <p className="text-xl font-bold text-white/70">AI 선생님 화면에서 수업이 진행돼요</p> : null}
    </div>
  );
}
