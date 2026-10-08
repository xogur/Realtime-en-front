'use client';

import { createContext, useContext, useRef, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';

/*
 * Cartoon building blocks for story scenes. Every scene is drawn in a
 * 1600x900 world. Positions change through CSS transitions so a new beat
 * glides from the previous pose instead of cutting. `--px/--py` (pointer)
 * and `--ax/--ay` (idle drift) on the stage drive parallax and eye lines.
 */

export const EASE = 'cubic-bezier(.45,.05,.25,1)';
export const INK = '#2a1b12';
const LOOK_X = '(var(--px, 0) + var(--ax, 0))';
const LOOK_Y = '(var(--py, 0) + var(--ay, 0))';

/** Offsets eyes toward the learner's finger. */
export function lookStyle(xAmp: number, yAmp: number): CSSProperties {
  return { transform: `translate(calc(${LOOK_X} * ${xAmp}px), calc(${LOOK_Y} * ${yAmp}px))` };
}

type SceneContextValue = {
  highlight: string | null;
  onHotspot?: (id: string) => void;
  onPress?: (id: string, phase: 'down' | 'up') => void;
  /** Show small twinkles on tappable objects. */
  hint?: boolean;
};
export const SceneContext = createContext<SceneContextValue>({ highlight: null });

/** Shared gradients and filters. Rendered once inside each stage SVG. */
export function SceneDefs() {
  return (
    <defs>
      <linearGradient id="st-wood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#c48a4e" /><stop offset="1" stopColor="#8a5a2c" /></linearGradient>
      <linearGradient id="st-wood-dark" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8b5a2b" /><stop offset="1" stopColor="#5c3a1c" /></linearGradient>
      <linearGradient id="st-sail" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#e6d7b8" /><stop offset=".45" stopColor="#fffbf0" /><stop offset="1" stopColor="#e0cfac" /></linearGradient>
      <linearGradient id="st-sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3aa0d8" /><stop offset="1" stopColor="#0f4777" /></linearGradient>
      <linearGradient id="st-sand" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f7e2ac" /><stop offset="1" stopColor="#dcb671" /></linearGradient>
      <linearGradient id="st-grass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#a3d672" /><stop offset="1" stopColor="#5b9842" /></linearGradient>
      <linearGradient id="st-grass-far" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#b8dc8f" /><stop offset="1" stopColor="#7fb262" /></linearGradient>
      <linearGradient id="st-stone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#e2d1a8" /><stop offset="1" stopColor="#b59c6c" /></linearGradient>
      <linearGradient id="st-marble" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#e9e0d0" /><stop offset=".4" stopColor="#ffffff" /><stop offset="1" stopColor="#d9cdb8" /></linearGradient>
      <linearGradient id="st-rock" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#a8a29a" /><stop offset="1" stopColor="#625d57" /></linearGradient>
      <linearGradient id="st-bronze" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffe08a" /><stop offset=".5" stopColor="#d9a441" /><stop offset="1" stopColor="#a5701f" /></linearGradient>
      <linearGradient id="st-cyclops" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#b5d38f" /><stop offset="1" stopColor="#7fa35d" /></linearGradient>
      <radialGradient id="st-glow"><stop offset="0" stopColor="#fff7cf" stopOpacity="1" /><stop offset="1" stopColor="#fff7cf" stopOpacity="0" /></radialGradient>
      <radialGradient id="st-fireglow"><stop offset="0" stopColor="#ffb85c" stopOpacity=".55" /><stop offset="1" stopColor="#ff8a3d" stopOpacity="0" /></radialGradient>
      <radialGradient id="st-magicglow"><stop offset="0" stopColor="#e6c8ff" stopOpacity=".8" /><stop offset="1" stopColor="#b98cff" stopOpacity="0" /></radialGradient>
      <radialGradient id="st-sun" cx=".45" cy=".4"><stop offset="0" stopColor="#fffbe0" /><stop offset=".6" stopColor="#ffd968" /><stop offset="1" stopColor="#ffbb3d" /></radialGradient>
      <radialGradient id="st-cave" cx=".85" cy=".72" r=".9"><stop offset="0" stopColor="#6a4c3a" /><stop offset=".55" stopColor="#3b2a22" /><stop offset="1" stopColor="#1c130e" /></radialGradient>
    </defs>
  );
}

/** Depth layer: shifts with the pointer and the idle drift. Positive is nearer. */
export function Layer({ depth, children }: { depth: number; children: ReactNode }) {
  return (
    <g style={{ transform: `translate(calc(${LOOK_X} * ${depth}px), calc(${LOOK_Y} * ${depth * 0.45}px))` }}>
      {children}
    </g>
  );
}

type MoveProps = {
  x?: number; y?: number; s?: number; r?: number; o?: number;
  dur?: number; delay?: number; flip?: boolean; className?: string; children: ReactNode;
};

/** Positions a group and animates every change of its pose. */
export function Move({ x = 0, y = 0, s = 1, r = 0, o = 1, dur = 1.2, delay = 0, flip = false, className, children }: MoveProps) {
  return (
    <g
      className={className}
      style={{
        transform: `translate(${x}px, ${y}px) rotate(${r}deg) scale(${flip ? -s : s}, ${s})`,
        opacity: o,
        pointerEvents: o === 0 ? 'none' : undefined,
        transition: `transform ${dur}s ${EASE} ${delay}s, opacity ${Math.min(dur, 0.8)}s ease ${delay}s`,
      }}
    >
      {children}
    </g>
  );
}

/**
 * Moves the whole world so (fx, fy) sits in the middle of the stage, a little
 * above centre so subtitles at the bottom do not cover the action.
 */
export function Camera({ fx = 800, fy = 450, s = 1, shake = false, children }: { fx?: number; fy?: number; s?: number; shake?: boolean; children: ReactNode }) {
  return (
    <g style={{ transform: `translate(${800 - fx * s}px, ${400 - fy * s}px) scale(${s})`, transition: `transform 1.6s ${EASE}` }}>
      <g className={shake ? 'story-shake' : undefined}>{children}</g>
    </g>
  );
}

type HotspotProps = { id: string; label: string; cx?: number; cy?: number; rx: number; ry: number; children: ReactNode };

const JELLY: Keyframe[] = [
  { transform: 'scale(1, 1)' },
  { transform: 'scale(1.12, 0.88)', offset: 0.25 },
  { transform: 'scale(0.94, 1.08)', offset: 0.5 },
  { transform: 'scale(1.03, 0.97)', offset: 0.75 },
  { transform: 'scale(1, 1)' },
];

/** A tappable scene object. It wobbles when tapped; the ring marks the current target. */
export function Hotspot({ id, label, cx = 0, cy = 0, rx, ry, children }: HotspotProps) {
  const { highlight, onHotspot, onPress, hint } = useContext(SceneContext);
  const bodyRef = useRef<SVGGElement | null>(null);
  const active = highlight === id;
  const interactive = Boolean(onHotspot || onPress);
  const activate = (event: { stopPropagation: () => void }) => {
    // Nested targets (a dragon's paws on the dragon) report only the innermost one.
    event.stopPropagation();
    const body = bodyRef.current;
    if (body && typeof body.animate === 'function') body.animate(JELLY, { duration: 560, easing: 'ease-out' });
    onHotspot?.(id);
  };
  const onKeyDown = (event: KeyboardEvent<SVGGElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    activate(event);
  };
  return (
    <g
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? label : undefined}
      data-hotspot={id}
      onClick={interactive ? activate : undefined}
      onKeyDown={interactive ? onKeyDown : undefined}
      onPointerDown={onPress ? () => onPress(id, 'down') : undefined}
      onPointerUp={onPress ? () => onPress(id, 'up') : undefined}
      onPointerLeave={onPress ? () => onPress(id, 'up') : undefined}
      onPointerCancel={onPress ? () => onPress(id, 'up') : undefined}
      className={interactive ? 'story-hotspot' : undefined}
    >
      <g ref={bodyRef} style={{ transformBox: 'fill-box', transformOrigin: '50% 100%' }}>{children}</g>
      {interactive ? <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="transparent" /> : null}
      {hint && !active ? (
        <g pointerEvents="none" transform={`translate(${cx + rx * 0.62} ${cy - ry * 0.62})`}>
          <path
            d="M0 -16 L4 -4 L16 0 L4 4 L0 16 L-4 4 L-16 0 L-4 -4 Z"
            fill="#fff6c4"
            stroke="#e8b730"
            strokeWidth={2.5}
            className="story-glint"
          />
        </g>
      ) : null}
      {active ? (
        <g pointerEvents="none">
          <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="#fff3b0" fillOpacity={0.16} className="story-ring" />
          <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke="#ffd23f" strokeWidth={9} strokeDasharray="24 14" className="story-ring story-dash" />
        </g>
      ) : null}
    </g>
  );
}

export function Sky({ top, bottom, rays = false, birds = false, children }: { top: string; bottom: string; rays?: boolean; birds?: boolean; children?: ReactNode }) {
  const id = `sky-${top.slice(1)}-${bottom.slice(1)}`;
  return (
    <Layer depth={-10}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={top} />
          <stop offset="1" stopColor={bottom} />
        </linearGradient>
      </defs>
      <rect x={-800} y={-600} width={3200} height={2100} fill={`url(#${id})`} />
      {rays ? (
        <g transform="translate(1300 140)" opacity={0.16} pointerEvents="none">
          <g className="story-spin-slow">
            {Array.from({ length: 12 }, (_, i) => (
              <path key={i} d="M0 0 L-60 -1300 L60 -1300 Z" fill="#fff8d0" transform={`rotate(${i * 30})`} />
            ))}
          </g>
        </g>
      ) : null}
      {children}
      {birds ? (
        <g pointerEvents="none" className="story-birds">
          {[[0, 0], [60, 24], [-50, 30]].map(([x, y], i) => (
            <path key={i} d={`M${x - 16} ${y} q8 -10 16 0 q8 -10 16 0`} fill="none" stroke="#3d4a5a" strokeWidth={4} strokeLinecap="round" className="story-flap-bird" style={{ animationDelay: `${i * 0.2}s` }} />
          ))}
        </g>
      ) : null}
    </Layer>
  );
}

/** Dark blue wash for night; fades in and out with `on`. */
export function Night({ on, strength = 0.62 }: { on: boolean; strength?: number }) {
  return (
    <g style={{ opacity: on ? 1 : 0, transition: 'opacity 1.6s ease' }} pointerEvents="none">
      <rect x={-800} y={-600} width={3200} height={2100} fill="#0b1640" opacity={strength} />
      <Layer depth={-10}>
        {STARS.map(([x, y, r], i) => (
          <g key={i}>
            <circle cx={x} cy={y} r={r * 3} fill="url(#st-glow)" opacity={0.5} />
            <circle cx={x} cy={y} r={r} fill="#fff8d6" className="story-twinkle" style={{ animationDelay: `${(i % 5) * 0.45}s` }} />
          </g>
        ))}
      </Layer>
    </g>
  );
}
const STARS = [[120, 80, 3], [260, 160, 2], [420, 60, 3], [610, 130, 2], [780, 70, 4], [940, 150, 2], [1100, 60, 3], [1270, 120, 2], [1420, 70, 3], [1530, 170, 2], [340, 250, 2], [1180, 230, 2]];

export function Sun({ x, y, r = 70 }: { x: number; y: number; r?: number }) {
  return (
    <Move x={x} y={y} dur={2.2}>
      <circle r={r * 2.6} fill="url(#st-glow)" opacity={0.7} className="story-pulse" />
      <circle r={r} fill="url(#st-sun)" />
    </Move>
  );
}

export function Moon({ x, y, o = 1 }: { x: number; y: number; o?: number }) {
  return (
    <Move x={x} y={y} o={o} dur={2}>
      <circle r={130} fill="url(#st-glow)" opacity={0.45} />
      <circle r={54} fill="#fff3c4" />
      <path d="M20 -50 A54 54 0 0 1 20 50 A44 44 0 0 0 20 -50 Z" fill="#eadba8" opacity={0.6} />
      <circle cx={-14} cy={-12} r={10} fill="#eadba8" />
      <circle cx={-20} cy={18} r={7} fill="#eadba8" />
      <circle cx={8} cy={24} r={5} fill="#eadba8" />
    </Move>
  );
}

export function Cloud({ x, y, s = 1, o = 0.96, color = '#ffffff', shade = '#dce7f2' }: { x: number; y: number; s?: number; o?: number; color?: string; shade?: string }) {
  return (
    <Move x={x} y={y} s={s} o={o}>
      <g className="story-drift">
        <ellipse cx={0} cy={14} rx={110} ry={30} fill={shade} />
        <ellipse cx={0} cy={0} rx={96} ry={34} fill={color} />
        <ellipse cx={-54} cy={-10} rx={50} ry={38} fill={color} />
        <ellipse cx={30} cy={-30} rx={60} ry={46} fill={color} />
        <ellipse cx={18} cy={-44} rx={30} ry={18} fill="#ffffff" opacity={0.7} />
      </g>
    </Move>
  );
}

function wavePath(y: number, amp: number, step: number) {
  let d = `M-600 ${y}`;
  for (let x = -600; x < 2600; x += step) d += ` q${step / 4} ${-amp} ${step / 2} 0 t${step / 2} 0`;
  return `${d} V1500 H-600 Z`;
}

function foamPath(y: number, amp: number, step: number) {
  let d = `M-600 ${y}`;
  for (let x = -600; x < 2600; x += step) d += ` q${step / 4} ${-amp} ${step / 2} 0 t${step / 2} 0`;
  return d;
}

export function Sea({ y = 640, color = '#2f86c0', deep = '#1d5f93', light = '#8fd3f4' }: { y?: number; color?: string; deep?: string; light?: string }) {
  return (
    <g pointerEvents="none">
      <Layer depth={-4}>
        <path d={wavePath(y - 6, 10, 160)} fill={light} opacity={0.8} className="story-wave story-wave-slow" />
      </Layer>
      <path d={wavePath(y + 14, 16, 200)} fill={color} className="story-wave" />
      <path d={foamPath(y + 14, 16, 200)} fill="none" stroke="#e8f8ff" strokeWidth={5} opacity={0.75} className="story-wave" />
      {[[200, 60], [520, 110], [860, 70], [1180, 130], [1460, 80], [360, 190], [1010, 210]].map(([x, dy], i) => (
        <ellipse key={i} cx={x} cy={y + dy} rx={26} ry={4} fill="#ffffff" className="story-twinkle" style={{ animationDelay: `${i * 0.35}s` }} />
      ))}
      <Layer depth={8}>
        <path d={wavePath(y + 150, 14, 160)} fill={deep} opacity={0.75} className="story-wave story-wave-slow" />
        <path d={foamPath(y + 150, 14, 160)} fill="none" stroke="#bfe8ff" strokeWidth={4} opacity={0.5} className="story-wave story-wave-slow" />
      </Layer>
    </g>
  );
}

export type PersonProps = {
  tunic?: string; skin?: string; hair?: string; cape?: string;
  helmet?: boolean; crest?: string; beard?: string; dress?: boolean; long?: boolean;
  hood?: string; staff?: boolean; wave?: boolean; armsUp?: boolean; mood?: 'smile' | 'sad' | 'shout' | 'laugh' | 'surprised';
  holding?: ReactNode; earWax?: boolean; trim?: string;
};

function seedDelay(text: string) {
  let hash = 0;
  for (const char of text) hash = (hash * 31 + char.charCodeAt(0)) % 997;
  return `${(hash % 40) / 10}s`;
}

/** A cartoon person standing with feet at (0, 0), about 240 units tall. */
export function Person({
  tunic = '#3f6ea5', skin = '#f3c79b', hair = '#5a3a22', cape, helmet, crest = '#c8372d', beard, dress, long,
  hood, staff, wave, armsUp, mood = 'smile', holding, earWax, trim = '#f0c35a',
}: PersonProps) {
  const stroke = { stroke: INK, strokeWidth: 4, strokeLinejoin: 'round' as const };
  const blink: CSSProperties = { animationDelay: seedDelay(`${tunic}${hair}${mood}`) };
  const pupils: CSSProperties = { transform: `translate(calc(${LOOK_X} * 2.6px), calc(${LOOK_Y} * 1.6px))` };
  const brows = mood === 'sad' ? ['M-17 -199 L-6 -195', 'M17 -199 L6 -195']
    : mood === 'shout' ? ['M-17 -194 L-5 -199', 'M17 -194 L5 -199']
      : mood === 'surprised' ? ['M-17 -203 Q-11 -207 -5 -203', 'M17 -203 Q11 -207 5 -203']
        : ['M-17 -198 Q-11 -202 -5 -198', 'M17 -198 Q11 -202 5 -198'];
  return (
    <g>
      <ellipse cx={0} cy={2} rx={48} ry={9} fill="#000000" opacity={0.18} />
      {cape ? (
        <g>
          <path d="M-30 -150 Q-68 -70 -54 -4 L54 -4 Q68 -70 30 -150 Z" fill={cape} {...stroke} />
          <path d="M-18 -140 Q-30 -70 -22 -6 L-6 -6 Q-12 -70 -4 -140 Z" fill="#000000" opacity={0.14} />
        </g>
      ) : null}
      {hood ? <path d="M-46 -150 Q-62 -60 -58 0 L58 0 Q62 -60 46 -150 Z" fill={hood} {...stroke} /> : null}
      {staff ? <rect x={52} y={-210} width={10} height={210} rx={5} fill="url(#st-wood)" {...stroke} strokeWidth={3} /> : null}
      {dress || hood ? null : (
        <g>
          <rect x={-22} y={-66} width={16} height={62} rx={7} fill={skin} {...stroke} strokeWidth={3} />
          <rect x={6} y={-66} width={16} height={62} rx={7} fill={skin} {...stroke} strokeWidth={3} />
          <path d="M-30 -8 Q-30 -14 -20 -14 L-2 -14 Q2 -8 0 0 L-30 0 Z" fill="#7a4a24" {...stroke} strokeWidth={3} />
          <path d="M0 -8 Q0 -14 10 -14 L28 -14 Q32 -8 30 0 L0 0 Z" fill="#7a4a24" {...stroke} strokeWidth={3} />
          <path d="M-20 -30 L-8 -22 M10 -30 L22 -22" stroke="#7a4a24" strokeWidth={4} />
        </g>
      )}
      <g className="story-breathe">
        {dress
          ? <path d="M-28 -150 Q-46 -50 -60 0 L60 0 Q46 -50 28 -150 Z" fill={tunic} {...stroke} />
          : <path d="M-32 -150 L32 -150 L42 -56 L-42 -56 Z" fill={hood ?? tunic} {...stroke} />}
        {dress
          ? <path d="M10 -150 Q24 -60 34 0 L58 0 Q46 -50 28 -150 Z" fill="#000000" opacity={0.13} />
          : <path d="M10 -150 L32 -150 L42 -56 L18 -56 Z" fill="#000000" opacity={0.13} />}
        {!hood ? <path d={dress ? 'M-58 -6 L58 -6' : 'M-41 -64 L41 -64'} stroke={trim} strokeWidth={7} /> : null}
        {!dress && !hood ? (
          <g>
            <rect x={-35} y={-100} width={70} height={10} rx={4} fill="#7a4a24" {...stroke} strokeWidth={3} />
            <rect x={-7} y={-103} width={14} height={16} rx={3} fill={trim} {...stroke} strokeWidth={2.5} />
          </g>
        ) : null}
        {armsUp ? (
          <g>
            <rect x={-48} y={-224} width={17} height={78} rx={8} fill={skin} {...stroke} strokeWidth={3} />
            <rect x={31} y={-224} width={17} height={78} rx={8} fill={skin} {...stroke} strokeWidth={3} />
            <circle cx={-39} cy={-226} r={10} fill={skin} {...stroke} strokeWidth={3} />
            <circle cx={39} cy={-226} r={10} fill={skin} {...stroke} strokeWidth={3} />
          </g>
        ) : (
          <g>
            <rect x={-50} y={-146} width={17} height={74} rx={8} fill={skin} {...stroke} strokeWidth={3} />
            <circle cx={-41} cy={-70} r={10} fill={skin} {...stroke} strokeWidth={3} />
            <path d="M-50 -148 Q-46 -158 -32 -150 L-32 -126 L-52 -126 Z" fill={dress ? tunic : hood ?? tunic} {...stroke} strokeWidth={3} />
          </g>
        )}
        {!armsUp && wave ? (
          <g transform="translate(41 -146)">
            <g className="story-arm-wave">
              <rect x={-8} y={0} width={17} height={74} rx={8} fill={skin} {...stroke} strokeWidth={3} />
              <circle cx={0} cy={76} r={10} fill={skin} {...stroke} strokeWidth={3} />
            </g>
          </g>
        ) : !armsUp ? (
          <g>
            <rect x={33} y={-146} width={17} height={74} rx={8} fill={skin} {...stroke} strokeWidth={3} />
            <circle cx={41} cy={-70} r={10} fill={skin} {...stroke} strokeWidth={3} />
            <path d="M50 -148 Q46 -158 32 -150 L32 -126 L52 -126 Z" fill={dress ? tunic : hood ?? tunic} {...stroke} strokeWidth={3} />
          </g>
        ) : null}
        {holding ? <g transform="translate(46 -84)">{holding}</g> : null}
        <rect x={-8} y={-164} width={16} height={18} fill={skin} {...stroke} strokeWidth={3} />
        <g className="story-head">
          {long ? <path d="M-36 -190 Q-44 -118 -28 -108 L28 -108 Q44 -118 36 -190 Z" fill={hair} {...stroke} /> : null}
          <ellipse cx={-31} cy={-184} rx={7} ry={10} fill={skin} {...stroke} strokeWidth={3} />
          <ellipse cx={31} cy={-184} rx={7} ry={10} fill={skin} {...stroke} strokeWidth={3} />
          <circle cx={0} cy={-186} r={32} fill={skin} {...stroke} />
          <path d="M14 -212 A32 32 0 0 1 22 -160 A30 30 0 0 0 14 -212 Z" fill="#000000" opacity={0.08} />
          {hood
            ? <path d="M-40 -178 Q-44 -234 0 -236 Q44 -234 40 -178 Q32 -210 0 -212 Q-32 -210 -40 -178 Z" fill={hood} {...stroke} />
            : helmet ? null : <path d="M-33 -188 Q-32 -224 0 -222 Q32 -224 33 -188 Q24 -204 10 -200 Q4 -212 -6 -202 Q-20 -206 -33 -188 Z" fill={hair} {...stroke} />}
          {dress && !long ? <circle cx={0} cy={-226} r={15} fill={hair} {...stroke} /> : null}
          {beard ? <path d="M-30 -186 Q-28 -146 0 -140 Q28 -146 30 -186 Q16 -164 0 -166 Q-16 -164 -30 -186 Z" fill={beard} {...stroke} strokeWidth={3} /> : null}
          <g className="story-blink" style={blink}>
            <ellipse cx={-11} cy={-189} rx={7} ry={8.5} fill="#ffffff" stroke={INK} strokeWidth={2.5} />
            <ellipse cx={11} cy={-189} rx={7} ry={8.5} fill="#ffffff" stroke={INK} strokeWidth={2.5} />
            <g style={pupils}>
              <circle cx={-11} cy={-188} r={4.2} fill={INK} />
              <circle cx={11} cy={-188} r={4.2} fill={INK} />
              <circle cx={-9.5} cy={-190} r={1.5} fill="#ffffff" />
              <circle cx={12.5} cy={-190} r={1.5} fill="#ffffff" />
            </g>
          </g>
          {brows.map((d) => <path key={d} d={d} stroke={INK} strokeWidth={3.5} strokeLinecap="round" fill="none" />)}
          <path d="M-2 -180 Q2 -176 -1 -173" stroke={INK} strokeWidth={2.5} fill="none" strokeLinecap="round" />
          <ellipse cx={-21} cy={-174} rx={6} ry={4} fill="#f08a7a" opacity={0.45} />
          <ellipse cx={21} cy={-174} rx={6} ry={4} fill="#f08a7a" opacity={0.45} />
          {mood === 'shout' || mood === 'surprised'
            ? <ellipse cx={0} cy={-164} rx={7} ry={mood === 'shout' ? 9 : 6} fill="#7a2e24" stroke={INK} strokeWidth={2.5} />
            : mood === 'laugh'
              ? <path d="M-12 -170 Q0 -154 12 -170 Z" fill="#7a2e24" stroke={INK} strokeWidth={2.5} strokeLinejoin="round" />
              : <path d={mood === 'sad' ? 'M-9 -162 Q0 -169 9 -162' : 'M-10 -168 Q0 -159 10 -168'} fill="none" stroke={INK} strokeWidth={3} strokeLinecap="round" />}
          {helmet ? (
            <g>
              <path d="M-34 -186 Q-34 -230 0 -232 Q34 -230 34 -186 L25 -186 Q22 -208 0 -210 Q-22 -208 -25 -186 Z" fill="url(#st-bronze)" {...stroke} />
              <path d="M-34 -186 L-34 -168 L-26 -168 L-25 -186 Z M34 -186 L34 -168 L26 -168 L25 -186 Z" fill="url(#st-bronze)" {...stroke} strokeWidth={3} />
              <path d="M-24 -228 Q0 -276 24 -228 Q0 -242 -24 -228 Z" fill={crest} {...stroke} strokeWidth={3} />
              <path d="M-14 -238 Q0 -262 14 -238" fill="none" stroke="#ffffff" strokeWidth={3} opacity={0.35} />
            </g>
          ) : null}
          {earWax ? (
            <g>
              <circle cx={-33} cy={-184} r={8} fill="#f5c542" stroke={INK} strokeWidth={2.5} className="story-pop" />
              <circle cx={33} cy={-184} r={8} fill="#f5c542" stroke={INK} strokeWidth={2.5} className="story-pop" />
            </g>
          ) : null}
        </g>
      </g>
    </g>
  );
}

export const HERO = { tunic: '#2f5d8a', cape: '#c23b2e', helmet: true, beard: '#6b4423' } satisfies PersonProps;
export const SOLDIER = { tunic: '#41658f', helmet: true, crest: '#2f4f75' } satisfies PersonProps;
export const SAILOR = { tunic: '#e7dcc4', hair: '#3b2a1c', trim: '#2f86c0' } satisfies PersonProps;

/** Ship with its waterline at (0, 0). Crew passed as children stand on deck. */
export function Ship({ sail = 'url(#st-sail)', stripe = '#c23b2e', children, mastSlot }: { sail?: string; stripe?: string; children?: ReactNode; mastSlot?: ReactNode }) {
  const stroke = { stroke: INK, strokeWidth: 5, strokeLinejoin: 'round' as const };
  return (
    <g className="story-rock">
      <path d="M0 -334 L-200 -62 M0 -334 L200 -62" stroke="#5c3a1c" strokeWidth={3} opacity={0.7} />
      <rect x={-7} y={-334} width={14} height={294} fill="url(#st-wood-dark)" {...stroke} strokeWidth={3} />
      <path d="M7 -330 L64 -318 L7 -304 Z" fill={stripe} {...stroke} strokeWidth={3} className="story-flag" />
      <rect x={-136} y={-324} width={272} height={11} rx={5} fill="url(#st-wood-dark)" {...stroke} strokeWidth={3} />
      <path d="M-124 -314 Q0 -282 124 -314 L136 -122 Q0 -88 -136 -122 Z" fill={sail} {...stroke} />
      <path d="M-128 -252 Q0 -224 128 -252 L130 -220 Q0 -192 -130 -220 Z" fill={stripe} />
      <path d="M-132 -170 Q0 -142 132 -170 L133 -142 Q0 -114 -133 -142 Z" fill={stripe} />
      <path d="M-124 -314 Q0 -282 124 -314 L136 -122 Q0 -88 -136 -122 Z" fill="none" {...stroke} />
      <circle cx={0} cy={-216} r={32} fill="url(#st-bronze)" {...stroke} strokeWidth={4} />
      <path d="M-14 -216 L0 -232 L14 -216 L0 -200 Z" fill={stripe} />
      {mastSlot}
      <g transform="translate(0 -52) scale(0.5)">{children}</g>
      <path d="M-204 -64 L200 -64 Q186 24 120 38 L-120 38 Q-182 24 -204 -64 Z" fill="url(#st-wood)" {...stroke} />
      <path d="M-196 -30 L192 -30 M-182 2 L178 2" stroke="#6b4423" strokeWidth={3} opacity={0.6} />
      <path d="M-202 -64 L198 -64" stroke="#f0c35a" strokeWidth={6} />
      <path d="M198 -62 Q238 -98 226 -140 Q252 -104 214 -58 Z" fill="url(#st-wood)" {...stroke} strokeWidth={4} />
      <ellipse cx={168} cy={-20} rx={15} ry={10} fill="#ffffff" {...stroke} strokeWidth={3} />
      <circle cx={172} cy={-20} r={5} fill={INK} />
      {[-140, -84, -28, 28, 84].map((x) => (
        <g key={x}>
          <line x1={x} y1={-18} x2={x - 34} y2={50} stroke="#d9b07a" strokeWidth={7} strokeLinecap="round" className="story-oar" />
          <circle cx={x} cy={-46} r={14} fill={stripe} {...stroke} strokeWidth={3} />
          <circle cx={x} cy={-46} r={5} fill="#f0c35a" />
        </g>
      ))}
      <g pointerEvents="none" className="story-wake">
        <ellipse cx={-210} cy={36} rx={40} ry={8} fill="#ffffff" opacity={0.7} />
        <ellipse cx={210} cy={30} rx={30} ry={7} fill="#ffffff" opacity={0.7} />
      </g>
    </g>
  );
}

export function Sheep({ face = '#3a332e' }: { face?: string }) {
  const stroke = { stroke: INK, strokeWidth: 3.5 };
  return (
    <g>
      <ellipse cx={4} cy={2} rx={60} ry={8} fill="#000000" opacity={0.16} />
      <rect x={-36} y={-34} width={11} height={34} rx={5} fill={face} {...stroke} strokeWidth={2.5} />
      <rect x={20} y={-34} width={11} height={34} rx={5} fill={face} {...stroke} strokeWidth={2.5} />
      <g fill="#fbf7ef" {...stroke}>
        <circle cx={-32} cy={-58} r={26} />
        <circle cx={0} cy={-70} r={31} />
        <circle cx={32} cy={-58} r={26} />
        <circle cx={-16} cy={-40} r={24} />
        <circle cx={18} cy={-40} r={24} />
      </g>
      <ellipse cx={-4} cy={-50} rx={46} ry={22} fill="#fbf7ef" />
      <ellipse cx={-6} cy={-78} rx={16} ry={8} fill="#ffffff" />
      <ellipse cx={60} cy={-64} rx={19} ry={23} fill={face} {...stroke} />
      <ellipse cx={46} cy={-82} rx={13} ry={6} fill={face} {...stroke} strokeWidth={2.5} transform="rotate(-20 46 -82)" />
      <g className="story-blink">
        <circle cx={66} cy={-68} r={4.5} fill="#ffffff" />
        <circle cx={67} cy={-68} r={2.2} fill={INK} />
      </g>
      <circle cx={56} cy={-90} r={10} fill="#fbf7ef" {...stroke} strokeWidth={2.5} />
    </g>
  );
}

export function Pig() {
  const stroke = { stroke: INK, strokeWidth: 3.5 };
  return (
    <g>
      <ellipse cx={4} cy={2} rx={56} ry={8} fill="#000000" opacity={0.16} />
      <rect x={-30} y={-30} width={13} height={30} rx={5} fill="#e7899a" {...stroke} strokeWidth={2.5} />
      <rect x={16} y={-30} width={13} height={30} rx={5} fill="#e7899a" {...stroke} strokeWidth={2.5} />
      <ellipse cx={0} cy={-48} rx={52} ry={36} fill="#f6a8b6" {...stroke} />
      <ellipse cx={-6} cy={-66} rx={28} ry={10} fill="#ffd0d8" />
      <circle cx={48} cy={-60} r={26} fill="#f6a8b6" {...stroke} />
      <path d="M36 -84 L44 -104 L54 -82 Z" fill="#e7899a" {...stroke} strokeWidth={2.5} strokeLinejoin="round" />
      <ellipse cx={70} cy={-56} rx={12} ry={10} fill="#e7899a" {...stroke} strokeWidth={2.5} />
      <circle cx={66} cy={-57} r={2.5} fill="#8a3b4c" />
      <circle cx={73} cy={-57} r={2.5} fill="#8a3b4c" />
      <g className="story-blink">
        <circle cx={50} cy={-67} r={4} fill={INK} />
        <circle cx={51} cy={-68} r={1.3} fill="#ffffff" />
      </g>
      <ellipse cx={38} cy={-52} rx={6} ry={4} fill="#f07a8f" opacity={0.6} />
      <path d="M-52 -52 q-16 -6 -12 -18 q4 -10 12 -2" fill="none" stroke="#e7899a" strokeWidth={5} strokeLinecap="round" />
    </g>
  );
}

/** A puff of smoke used for magic transformations. */
export function Poof({ on, color = '#efe3ff' }: { on: boolean; color?: string }) {
  return on ? (
    <g className="story-poof" pointerEvents="none">
      {[[-40, -60, 40], [30, -80, 46], [0, -30, 50], [60, -30, 34], [-60, -20, 32]].map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill={color} stroke="#c9b3ee" strokeWidth={3} opacity={0.92} />
      ))}
      {[[-70, -110], [80, -100], [0, -130]].map(([x, y], i) => (
        <path key={i} d="M0 -12 L3 -3 L12 0 L3 3 L0 12 L-3 3 L-12 0 L-3 -3 Z" transform={`translate(${x} ${y})`} fill="#ffe27a" />
      ))}
    </g>
  ) : null;
}

export function Sparkles({ on, color = '#ffe27a', spread = 120 }: { on: boolean; color?: string; spread?: number }) {
  return (
    <g style={{ opacity: on ? 1 : 0, transition: 'opacity .6s ease' }} pointerEvents="none">
      {[[-1, -1], [1, -0.6], [-0.4, 0.8], [0.8, 0.9], [0, -1.3], [-1.2, 0.2]].map(([dx, dy], i) => (
        <g key={i} transform={`translate(${dx * spread} ${dy * spread * 0.7})`}>
          <path
            d="M0 -16 L4 -4 L16 0 L4 4 L0 16 L-4 4 L-16 0 L-4 -4 Z"
            fill={color}
            className="story-twinkle"
            style={{ animationDelay: `${i * 0.25}s` }}
          />
        </g>
      ))}
    </g>
  );
}

export function Hearts({ on }: { on: boolean }) {
  return on ? (
    <g pointerEvents="none">
      {[-60, 0, 60].map((x, i) => (
        <g key={x} transform={`translate(${x} ${-20 - i * 18})`}>
          <path d="M0 10 C-26 -10 -18 -34 0 -22 C18 -34 26 -10 0 10 Z" fill="#ef5b6e" stroke={INK} strokeWidth={3} className="story-float" style={{ animationDelay: `${i * 0.5}s` }} />
        </g>
      ))}
    </g>
  ) : null;
}

export function Notes({ on, color = '#ff8fb1' }: { on: boolean; color?: string }) {
  return (
    <g style={{ opacity: on ? 1 : 0, transition: 'opacity .8s ease' }} pointerEvents="none">
      {[0, 1, 2, 3].map((i) => (
        <g key={i} className="story-float" style={{ animationDelay: `${i * 0.55}s` }}>
          <g transform={`translate(${i * 46 - 70} ${-(i % 2) * 30})`}>
            <ellipse cx={0} cy={0} rx={14} ry={10} fill={color} stroke={INK} strokeWidth={2.5} transform="rotate(-20)" />
            <rect x={11} y={-50} width={5} height={50} fill={INK} />
            <path d="M16 -50 q18 6 16 24" fill="none" stroke={INK} strokeWidth={5} />
          </g>
        </g>
      ))}
    </g>
  );
}

export function Bubble({ x, y, text, speaker }: { x: number; y: number; text: string; speaker?: string }) {
  const width = Math.max(220, text.length * 18 + 70);
  const height = 92;
  return (
    <g style={{ transform: `translate(${x}px, ${y}px)` }} pointerEvents="none">
      <g className="story-pop">
        <rect x={-width / 2 + 8} y={-height + 10} width={width} height={height} rx={32} fill={INK} opacity={0.22} />
        <path d="M-22 -6 L-6 40 L22 -6 Z" fill="#ffffff" stroke={INK} strokeWidth={5} strokeLinejoin="round" />
        <rect x={-width / 2} y={-height} width={width} height={height} rx={32} fill="#ffffff" stroke={INK} strokeWidth={5} />
        <rect x={-20} y={-10} width={40} height={10} fill="#ffffff" />
        {speaker ? (
          <g transform={`translate(${-width / 2 + 24} ${-height - 14})`}>
            <rect x={0} y={-22} width={speaker.length * 13 + 28} height={34} rx={17} fill="#f4c542" stroke={INK} strokeWidth={4} />
            <text x={14} y={2} fontSize={20} fontWeight={800} fill={INK}>{speaker}</text>
          </g>
        ) : null}
        <text x={0} y={-height / 2 + 11} textAnchor="middle" fontSize={32} fontWeight={800} fill={INK}>{text}</text>
      </g>
    </g>
  );
}

/** Grass tufts and flowers drawn in front of everything for depth. */
export function ForegroundGrass({ y = 900, color = '#4f8a3a' }: { y?: number; color?: string }) {
  return (
    <Layer depth={22}>
      <g pointerEvents="none" opacity={0.92}>
        {[-60, 120, 330, 1250, 1450, 1640].map((x, i) => (
          <g key={x} transform={`translate(${x} ${y}) scale(${1.2 + (i % 3) * 0.25})`} className="story-sway">
            <path d="M-50 0 Q-40 -70 -20 -110 Q-24 -60 -6 0 Z M-10 0 Q0 -90 20 -140 Q14 -70 16 0 Z M10 0 Q36 -60 60 -96 Q40 -50 40 0 Z" fill={color} />
            {i % 2 ? <circle cx={-14} cy={-96} r={11} fill="#f6a8b6" /> : <circle cx={28} cy={-104} r={10} fill="#ffe27a" />}
          </g>
        ))}
      </g>
    </Layer>
  );
}

/** Dark rocky edges framing cave interiors. */
export function ForegroundRocks() {
  return (
    <Layer depth={24}>
      <g pointerEvents="none" opacity={0.92}>
        <path d="M-300 960 Q-120 760 60 820 Q160 860 200 960 Z" fill="#1f140e" />
        <path d="M1380 960 Q1480 780 1680 800 L1900 960 Z" fill="#1f140e" />
        <path d="M-300 -100 L500 -100 Q380 20 220 30 Q120 60 40 160 Q-60 60 -300 80 Z" fill="#1f140e" />
        <path d="M1100 -100 L1900 -100 L1900 120 Q1700 40 1560 60 Q1420 10 1100 -100 Z" fill="#1f140e" />
      </g>
    </Layer>
  );
}
