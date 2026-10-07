import { BookOpen, CheckCircle2, CircleDot, Sprout, Flag, Loader2, MessagesSquare, Repeat, Sparkles, Target, Trophy, TriangleAlert } from 'lucide-react';
import type { GuidedAction, GuidedSnapshot } from './types';
import { Confetti, guidedButton, guidedCard, guidedGhost, guidedPrimary, stagger } from './ui';

export function GuidedRecapView({ snapshot, busy, onCommand }: {
  snapshot: GuidedSnapshot; busy: boolean; onCommand: (action: GuidedAction, payload?: Record<string, string>) => void;
}) {
  const transitioning = snapshot.handoff?.status === 'PREPARED' || snapshot.handoff?.status === 'STARTING';
  const observations = snapshot.recap?.observations ?? [];
  // Celebrate only observed speech; recap text alone may say nothing was confirmed.
  const celebrate = observations.some(o => !!o.said);
  const can = (action: GuidedAction) => snapshot.allowedActions.includes(action);
  return <div className="flex h-full flex-col gap-5 [@media(max-height:820px)]:gap-3">
   <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-6">
    <div className="guided-scroll flex min-h-0 flex-col justify-center gap-5 overflow-y-auto">
    <div className="relative flex flex-col items-center pt-2 text-center">
      {celebrate && <Confetti />}
      <span aria-hidden className="relative">
        {celebrate && <span className="guided-breathe absolute inset-[-14px] rounded-full bg-[#f3d08a]/45 blur-xl" />}
        <span className={`guided-pop relative flex h-24 w-24 items-center justify-center rounded-[2rem] bg-gradient-to-br ${celebrate ? 'from-[#f3d08a] to-[#d99a2b] text-white shadow-[0_18px_36px_-16px_rgba(217,154,43,0.9)]' : 'from-[#e7efe8] to-[#cfe2d3] text-[#34513c] shadow-[0_18px_36px_-20px_rgba(44,70,52,0.6)]'}`}>
          {celebrate ? <Trophy className="h-12 w-12" /> : <Sprout className="h-12 w-12" />}
        </span>
      </span>
      <h2 className="guided-rise mt-5 text-4xl font-extrabold tracking-tight text-[#231f1b]" style={stagger(1, 0, 180)}>오늘 달라진 점</h2>
    </div>

    {snapshot.recap?.changeKo && <div className="guided-rise relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#2f4a37] to-[#4a7055] p-5 text-white shadow-[0_18px_36px_-20px_rgba(44,70,52,0.9)]" style={stagger(1, 0, 260)}>
      <span aria-hidden className="absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/10" />
      <div className="relative flex items-start gap-3"><Sparkles aria-hidden className="mt-0.5 h-6 w-6 shrink-0 text-[#f3d08a]" /><p className="text-lg font-bold leading-relaxed">{snapshot.recap.changeKo}</p></div>
    </div>}
    </div>

    <div className="guided-scroll flex min-h-0 flex-col justify-center gap-4 overflow-y-auto">
    <ul className="space-y-3">{observations.map((o, i) => <li key={i} className={`${guidedCard} guided-rise flex gap-3 p-5`} style={stagger(i, 90, 340)}>
      {o.said ? <CheckCircle2 aria-hidden className="guided-pop mt-0.5 h-6 w-6 shrink-0 text-[#34513c]" style={stagger(i, 90, 460)} /> : <CircleDot aria-hidden className="mt-0.5 h-6 w-6 shrink-0 text-[#a0968c]" />}
      <div className="min-w-0"><p className="text-lg font-semibold text-[#231f1b]">{o.textKo}</p>
        {o.said && <p className="mt-2 inline-block rounded-2xl rounded-bl-md bg-[#e4eee6] px-4 py-2 text-[#2c4634]">내가 한 말: “{o.said}”</p>}</div>
    </li>)}</ul>
    {!observations.length && <p className="guided-rise rounded-2xl bg-[#f4efe9] p-4 text-[#5f5851]" style={stagger(1, 0, 300)}>아직 확인된 말하기가 없어요. 다음에는 한 문장부터 해 보세요.</p>}

    {snapshot.recap?.nextPracticeKo && <section aria-label="다음에 연습할 말" className="guided-rise rounded-3xl border-2 border-dashed border-[#e4b25a]/50 bg-[#fffaf0] p-5" style={stagger(observations.length, 90, 420)}>
      <div className="flex items-start gap-3"><Target aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-[#b9821f]" /><p className="text-[#4a3510]">{snapshot.recap.nextPracticeKo}</p></div>
      {snapshot.recap.expressionEn && <p className="mt-3 text-2xl font-extrabold tracking-tight text-[#231f1b]">{snapshot.recap.expressionEn}</p>}
    </section>}

    </div>
   </div>

    <div className="guided-rise shrink-0 rounded-[1.75rem] bg-white/75 px-5 py-4 shadow-[0_18px_40px_-30px_rgba(72,60,45,0.6)] ring-1 ring-[#483c2d]/8 backdrop-blur-md [@media(max-height:820px)]:py-3">
      <div className="flex flex-wrap items-center gap-3">
        {can('REPLAY_LESSON') && <button className={`${guidedButton} !min-h-14 !text-lg`} disabled={busy || transitioning} onClick={() => onCommand('REPLAY_LESSON')}><Repeat aria-hidden className="h-5 w-5" />다른 상황으로 한 번 더</button>}
        {can('START_NEXT_LESSON') && snapshot.recap?.nextLessons.map(lesson => <button key={lesson.id} className={`${guidedButton} !min-h-14 !text-lg`} disabled={busy || transitioning} onClick={() => onCommand('START_NEXT_LESSON', { lessonId: lesson.id })}><BookOpen aria-hidden className="h-5 w-5" />다음 수업: {lesson.titleKo}</button>)}
        {can('BEGIN_FREE_TALK') && snapshot.recap?.freeTalkAvailable && <button className={`${guidedPrimary} !min-h-14 !text-lg`} disabled={busy || transitioning} onClick={() => onCommand('BEGIN_FREE_TALK')}><MessagesSquare aria-hidden className="h-5 w-5" />이 주제로 프리토킹</button>}
        {can('FINISH') && <button className={`${snapshot.recap?.freeTalkAvailable && can('BEGIN_FREE_TALK') ? guidedGhost : guidedPrimary} !min-h-14 !text-lg ml-auto`} disabled={busy} onClick={() => onCommand('FINISH')}><Flag aria-hidden className="h-5 w-5" />여기까지</button>}
      </div>
      {transitioning && <p role="status" className="guided-rise mt-3 flex items-center gap-2 font-semibold text-[#34513c]"><Loader2 aria-hidden className="h-5 w-5 animate-spin" />프리토킹을 연결하고 있어요. 연결이 확인되면 대화를 시작해요.</p>}
      {snapshot.handoff?.status === 'FAILED' && <p role="alert" className="guided-shake mt-3 flex items-center gap-2 rounded-2xl bg-[#fdf1ee] p-3 font-semibold text-[#8f3422]"><TriangleAlert aria-hidden className="h-5 w-5 shrink-0" />프리토킹을 시작하지 못했어요. 수업은 여기에서 다시 이어갈 수 있어요.</p>}
    </div>
  </div>;
}
