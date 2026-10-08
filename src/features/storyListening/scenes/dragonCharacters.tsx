'use client';

import type { CSSProperties, ReactNode } from 'react';

import { EASE, Hotspot, INK, lookStyle, Person, type PersonProps } from './parts';

/* Characters and props for "The Reluctant Dragon". Origins sit on the ground. */

const ink = (width = 4) => ({ stroke: INK, strokeWidth: width, strokeLinejoin: 'round' as const });
const glide = (dur = 1.1): CSSProperties => ({ transition: `transform ${dur}s ${EASE}, opacity .6s ease` });

export const BOY = { tunic: '#e0862f', hair: '#8a5428', trim: '#f6e3b4' } satisfies PersonProps;
export const FATHER = { tunic: '#8a6d4a', hair: '#6b5138', beard: '#8a7058', trim: '#c9b48a', staff: true } satisfies PersonProps;
export const MOTHER = { tunic: '#b8546a', dress: true, hair: '#5a3a22', trim: '#fbeede' } satisfies PersonProps;
export const GEORGE = { tunic: '#e3b23c', helmet: true, crest: '#d23a2e', cape: '#c8372d', trim: '#fff1c4' } satisfies PersonProps;
export const GEORGE_BARE = { tunic: '#e3b23c', hair: '#f2cf6b', cape: '#c8372d', trim: '#fff1c4' } satisfies PersonProps;
export const FRIEND = { tunic: '#4f9a5a', hair: '#2b2118', trim: '#e7f0c4' } satisfies PersonProps;
export const VILLAGERS: readonly PersonProps[] = [
  { tunic: '#b23a3a', hair: '#2b2118' },
  { tunic: '#6b8e3a', hair: '#7a5530', dress: true },
  { tunic: '#8a4fb3', hair: '#3b2416', beard: '#3b2416' },
  { tunic: '#d08a2a', hair: '#a35f2a', dress: true, long: true },
  { tunic: '#3f6ea5', hair: '#55402e' },
  { tunic: '#9b6a4a', hair: '#d7d7d7', beard: '#d7d7d7' },
];

export type DragonPose = 'rest' | 'sit' | 'rear' | 'down';
export type DragonEyes = 'open' | 'closed' | 'happy' | 'wink' | 'worried' | 'shut' | 'side';
export type DragonMouth = 'smile' | 'open' | 'roar' | 'worried' | 'o' | 'grin' | 'sleep';

type DragonProps = {
  pose?: DragonPose;
  eyes?: DragonEyes;
  mouth?: DragonMouth;
  blush?: boolean;
  /** Little puffs from the nostrils (or a roaring cloud). */
  smoke?: boolean;
  fire?: boolean;
  /** Freshly polished: highlights and sparkles. */
  shine?: number;
  purr?: boolean;
  sleep?: boolean;
  /** Hotspot on the soft folds under the neck. */
  neckSpot?: boolean;
  /** Hotspot on the front paws. */
  pawSpot?: boolean;
  /** Something the dragon holds against his chest (a poem, a cloth). */
  holding?: ReactNode;
};

const NECK_ANGLE: Record<DragonPose, number> = { rest: -20, sit: 28, rear: 46, down: -26 };
const ARM_ANGLE: Record<DragonPose, number> = { rest: 72, sit: 6, rear: 115, down: 78 };
const BODY: Record<DragonPose, string> = {
  rest: 'translate(0px, 0px) rotate(0deg) scale(1, 1)',
  sit: 'translate(0px, 0px) rotate(-4deg) scale(1, 1)',
  rear: 'translate(-10px, -36px) rotate(-12deg) scale(1, 1)',
  down: 'translate(0px, 14px) rotate(2deg) scale(1.02, 0.9)',
};

/** Deep blue on top shading to green below, as the shepherd describes him. */
export function DragonDefs() {
  return (
    <defs>
      <linearGradient id="dr-scale" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#2f6fcf" />
        <stop offset=".55" stopColor="#3f9bc4" />
        <stop offset="1" stopColor="#6fcf9a" />
      </linearGradient>
      <linearGradient id="dr-belly" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fbf0b8" />
        <stop offset="1" stopColor="#e9cf7a" />
      </linearGradient>
      <linearGradient id="dr-spike" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ffe08a" />
        <stop offset="1" stopColor="#f0a83a" />
      </linearGradient>
    </defs>
  );
}

function DragonHead({ eyes, mouth, blush, smoke, fire, purr, sleep }: Required<Pick<DragonProps, 'eyes' | 'mouth'>> & Pick<DragonProps, 'blush' | 'smoke' | 'fire' | 'purr' | 'sleep'>) {
  const closedLid = (cx: number, cy: number, w: number) => <path d={`M${cx - w} ${cy} Q${cx} ${cy + w * 0.7} ${cx + w} ${cy}`} fill="none" stroke={INK} strokeWidth={5} strokeLinecap="round" />;
  const happyLid = (cx: number, cy: number, w: number) => <path d={`M${cx - w} ${cy + 4} Q${cx} ${cy - w * 0.9} ${cx + w} ${cy + 4}`} fill="none" stroke={INK} strokeWidth={5} strokeLinecap="round" />;
  const openEye = (cx: number, cy: number, rx: number, ry: number, key: string) => (
    <g key={key}>
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="#ffffff" {...ink(3.5)} />
      <g style={lookStyle(4, 3)}>
        <circle cx={cx - 4 + (eyes === 'side' ? 6 : 0)} cy={cy + 2} r={rx * 0.52} fill="#2a1b12" />
        <circle cx={cx - 7 + (eyes === 'side' ? 6 : 0)} cy={cy - 4} r={rx * 0.2} fill="#ffffff" />
      </g>
    </g>
  );
  const eye = (cx: number, cy: number, rx: number, ry: number, which: 0 | 1) => {
    const state = eyes === 'wink' ? (which === 0 ? 'open' : 'closed') : eyes;
    if (state === 'closed' || state === 'shut') return <g key={which}>{closedLid(cx, cy, rx)}</g>;
    if (state === 'happy') return <g key={which}>{happyLid(cx, cy, rx)}</g>;
    return openEye(cx, cy, rx, ry, String(which));
  };
  const brows = eyes === 'worried'
    ? ['M-58 -58 Q-44 -66 -30 -54', 'M-16 -60 Q-2 -70 14 -64']
    : eyes === 'shut'
      ? ['M-58 -52 Q-44 -46 -30 -50', 'M-16 -54 Q0 -48 14 -52']
      : ['M-58 -60 Q-44 -70 -28 -62', 'M-18 -64 Q-2 -74 16 -66'];
  return (
    <g>
      {/* horns and frill sit behind the head */}
      <path d="M18 -64 Q24 -130 66 -146 Q46 -110 46 -60 Z" fill="#f7ecd0" {...ink(4)} />
      <path d="M52 -50 Q92 -100 126 -98 Q98 -76 82 -36 Z" fill="#efe1bd" {...ink(4)} />
      <path d="M62 -10 Q116 -36 130 6 Q104 -2 74 22 Z" fill="#4fb3a9" {...ink(4)} />
      <path d="M58 22 Q104 18 116 52 Q90 40 62 48 Z" fill="#4fb3a9" {...ink(4)} />
      <circle cx={14} cy={-6} r={72} fill="url(#dr-scale)" {...ink(5)} />
      <path d="M-20 -54 C-96 -66 -164 -44 -176 -4 C-184 30 -150 58 -96 56 C-54 54 -12 46 16 34 Z" fill="url(#dr-scale)" {...ink(5)} />
      <path d="M-176 6 C-166 44 -124 60 -84 58 C-44 56 -10 48 16 36 L20 50 C-28 74 -150 74 -176 6 Z" fill="url(#dr-belly)" {...ink(3)} />
      <path d="M40 -50 A72 72 0 0 1 70 30 A64 64 0 0 0 40 -50 Z" fill="#000000" opacity={0.1} />
      {[[-110, -36], [-74, -42], [40, -40], [56, -2]].map(([x, y], i) => (
        <path key={i} d={`M${x - 10} ${y} q10 10 20 0`} fill="none" stroke="#2a5aa8" strokeWidth={4} strokeLinecap="round" opacity={0.6} />
      ))}
      <ellipse cx={-156} cy={-16} rx={8} ry={6} fill={INK} />
      <ellipse cx={-130} cy={-24} rx={7} ry={5} fill={INK} />
      <g className="story-blink">
        {eye(-44, -28, 17, 21, 0)}
        {eye(-2, -32, 20, 24, 1)}
      </g>
      {brows.map((d) => <path key={d} d={d} fill="none" stroke="#1f3f7a" strokeWidth={6} strokeLinecap="round" />)}
      <g style={{ opacity: blush ? 1 : 0.25, transition: 'opacity .8s ease' }}>
        <ellipse cx={-70} cy={8} rx={16} ry={9} fill="#ff8aa6" opacity={0.75} />
        <ellipse cx={20} cy={4} rx={18} ry={10} fill="#ff8aa6" opacity={0.75} />
      </g>
      {mouth === 'roar' ? (
        <g>
          <path d="M-176 8 Q-124 96 -56 32 Q-112 44 -176 8 Z" fill="#7a1f2a" {...ink(4)} />
          <path d="M-164 14 L-156 30 L-148 18 M-120 30 L-112 46 L-104 32 M-82 34 L-74 48 L-68 34" fill="#ffffff" stroke={INK} strokeWidth={2} />
          <ellipse cx={-110} cy={58} rx={20} ry={8} fill="#e56b7c" />
        </g>
      ) : mouth === 'open' ? (
        <ellipse cx={-112} cy={34} rx={20} ry={14} fill="#7a1f2a" {...ink(3.5)} />
      ) : mouth === 'o' ? (
        <ellipse cx={-118} cy={34} rx={11} ry={13} fill="#7a1f2a" {...ink(3.5)} />
      ) : mouth === 'grin' ? (
        <g>
          <path d="M-170 16 Q-112 70 -52 24 Q-112 42 -170 16 Z" fill="#7a1f2a" {...ink(4)} />
          <path d="M-160 22 Q-112 44 -62 28 L-64 34 Q-112 50 -158 28 Z" fill="#ffffff" />
        </g>
      ) : mouth === 'worried' ? (
        <path d="M-160 32 q12 -8 24 0 q12 8 24 0 q12 -8 24 0" fill="none" stroke={INK} strokeWidth={5} strokeLinecap="round" />
      ) : mouth === 'sleep' ? (
        <path d="M-150 30 Q-118 40 -90 30" fill="none" stroke={INK} strokeWidth={5} strokeLinecap="round" />
      ) : (
        <path d="M-166 20 Q-116 56 -60 28" fill="none" stroke={INK} strokeWidth={5} strokeLinecap="round" />
      )}
      {mouth === 'smile' || mouth === 'sleep' ? <path d="M-150 26 L-144 40 L-136 28" fill="#ffffff" stroke={INK} strokeWidth={2} /> : null}
      {smoke ? (
        <g pointerEvents="none">
          {[0, 1, 2].map((i) => (
            <g key={i} transform={`translate(${-160 + i * 16} ${-34 - i * 6})`}>
              <circle r={14 - i * 2} fill="#eef1f4" stroke="#b8c2cc" strokeWidth={3} className="story-float" style={{ animationDelay: `${i * 0.5}s` }} />
            </g>
          ))}
        </g>
      ) : null}
      {fire ? (
        <g pointerEvents="none" transform="translate(-176 0)">
          <g className="story-flame">
            <path d="M0 -16 C-60 -50 -130 -18 -190 -42 C-150 -4 -120 6 -196 34 C-120 50 -60 30 0 14 Z" fill="#ff7a2f" {...ink(3)} />
            <path d="M0 -8 C-46 -28 -90 -8 -130 -20 C-100 0 -86 6 -136 22 C-80 30 -40 18 0 8 Z" fill="#ffd25a" />
          </g>
        </g>
      ) : null}
      {purr ? (
        <g transform="translate(-40 -110)" pointerEvents="none">
          <g className="story-float">
            <text fontSize={34} fontWeight={900} fill="#ffffff" stroke={INK} strokeWidth={2.5} fontStyle="italic">purr~</text>
          </g>
        </g>
      ) : null}
      {sleep ? (
        <g transform="translate(40 -120)" pointerEvents="none">
          <g className="story-zzz">
            <text fontSize={58} fontWeight={900} fill="#ffffff" stroke={INK} strokeWidth={3}>Z</text>
            <text x={42} y={-46} fontSize={40} fontWeight={900} fill="#ffffff" stroke={INK} strokeWidth={2.5}>z</text>
          </g>
        </g>
      ) : null}
    </g>
  );
}

function FrontLeg({ angle, shade = false }: { angle: number; shade?: boolean }) {
  return (
    <g style={{ transform: `rotate(${angle}deg)`, transition: `transform 1s ${EASE}` }}>
      <rect x={-30} y={-10} width={60} height={118} rx={28} fill="url(#dr-scale)" {...ink(5)} />
      {shade ? <rect x={-30} y={-10} width={60} height={118} rx={28} fill="#0b2a5a" opacity={0.22} /> : null}
      <ellipse cx={-14} cy={110} rx={44} ry={20} fill="url(#dr-scale)" {...ink(4.5)} />
      {[-48, -30, -12].map((x) => <path key={x} d={`M${x} 118 l-10 12 l14 -4 Z`} fill="#fff6dc" stroke={INK} strokeWidth={2.5} strokeLinejoin="round" />)}
    </g>
  );
}

/**
 * The reluctant dragon: "as big as four cart-horses", facing left, about
 * 880 x 420 units. The neck swings from the shoulder for each pose and the
 * head counter-rotates so the face stays level.
 */
export function Dragon({
  pose = 'rest', eyes = 'open', mouth = 'smile', blush = false, smoke = false, fire = false,
  shine = 0, purr = false, sleep = false, neckSpot = false, pawSpot = false, holding,
}: DragonProps) {
  const neck = NECK_ANGLE[pose];
  const arm = ARM_ANGLE[pose];
  return (
    <g>
      <DragonDefs />
      <ellipse cx={40} cy={6} rx={340} ry={28} fill="#000000" opacity={0.2} />
      <g style={{ transform: BODY[pose], transformOrigin: '200px 0px', transition: `transform 1s ${EASE}` }}>
        <g className={pose === 'rear' ? 'story-ramp' : undefined}>
          <g transform="translate(240 -64)">
            <g className="story-tail">
              <path d="M0 -46 C110 -64 172 18 250 8 C300 2 322 -30 332 -62 L352 -42 C342 0 312 52 250 54 C160 60 100 12 0 36 Z" fill="url(#dr-scale)" {...ink(5)} />
              <path d="M326 -58 L384 -110 L360 -34 Z" fill="url(#dr-spike)" {...ink(4)} />
              {[[70, -44], [140, -16], [210, 4]].map(([x, y]) => <path key={x} d={`M${x - 14} ${y + 4} L${x} ${y - 24} L${x + 14} ${y + 6} Z`} fill="url(#dr-spike)" {...ink(3)} />)}
            </g>
          </g>
          <g transform="translate(-130 -126)"><FrontLeg angle={arm + 10} shade /></g>
          <ellipse cx={176} cy={-82} rx={98} ry={80} fill="url(#dr-scale)" {...ink(5)} />
          <path d="M120 -18 Q118 4 150 4 L262 4 Q276 -18 250 -36 Z" fill="url(#dr-scale)" {...ink(4.5)} />
          {[262, 244, 226].map((x) => <path key={x} d={`M${x} 2 l12 10 l-2 -14 Z`} fill="#fff6dc" stroke={INK} strokeWidth={2.5} strokeLinejoin="round" />)}
          <g className="story-breathe">
            <path d="M-176 -118 C-176 -232 0 -262 124 -238 C254 -212 296 -120 266 -40 C236 10 -124 12 -166 -40 Z" fill="url(#dr-scale)" {...ink(6)} />
            {[[-128, -212], [-66, -242], [-2, -252], [62, -250], [124, -238], [184, -214], [236, -176]].map(([x, y], i) => (
              <path key={i} d={`M${x - 20} ${y + 12} L${x} ${y - 26} L${x + 20} ${y + 10} Z`} fill="url(#dr-spike)" {...ink(4)} transform={`rotate(${-30 + i * 11} ${x} ${y})`} />
            ))}
            <path d="M-166 -40 C-154 -112 -62 -60 58 -28 C140 -8 214 -6 256 -30 C232 8 -116 14 -166 -40 Z" fill="url(#dr-belly)" {...ink(4)} />
            {[-110, -60, -10, 40, 90, 140, 190].map((x, i) => <path key={x} d={`M${x} ${-58 + Math.abs(i - 2) * 4} q8 22 0 40`} fill="none" stroke="#c9a94a" strokeWidth={3} opacity={0.7} />)}
            {[[-60, -180], [20, -200], [100, -190], [-10, -140], [70, -130], [150, -150], [200, -110]].map(([x, y], i) => (
              <path key={i} d={`M${x - 14} ${y} q14 16 28 0`} fill="none" stroke="#2a5aa8" strokeWidth={4} strokeLinecap="round" opacity={0.45} />
            ))}
            <path d="M-60 -226 C20 -246 120 -236 180 -206" fill="none" stroke="#ffffff" strokeWidth={10} strokeLinecap="round" opacity={0.28} />
          </g>
          {/* The near paw sits under the chin, so it is drawn before the head. */}
          <g transform="translate(-96 -118)">
            {pawSpot ? (
              <Hotspot id="paws" label="paws" cx={-80} cy={80} rx={90} ry={60}><FrontLeg angle={arm} /></Hotspot>
            ) : <FrontLeg angle={arm} />}
          </g>
          <g transform="translate(-120 -150)">
            <g style={{ transform: `rotate(${neck}deg)`, transition: `transform 1.1s ${EASE}` }}>
              <path d="M30 -56 C-50 -62 -140 -50 -176 -40 L-176 42 C-140 50 -50 62 30 56 Z" fill="url(#dr-scale)" {...ink(5.5)} />
              <path d="M24 30 C-50 44 -140 42 -176 30 L-176 44 C-140 52 -50 64 24 56 Z" fill="url(#dr-belly)" />
              {neckSpot ? (
                <Hotspot id="neck" label="neck" cx={-90} cy={46} rx={86} ry={40}>
                  {[-140, -104, -68, -32].map((x) => <path key={x} d={`M${x} 40 q14 14 28 0`} fill="none" stroke="#c9a94a" strokeWidth={4} strokeLinecap="round" />)}
                </Hotspot>
              ) : [-140, -104, -68, -32].map((x) => <path key={x} d={`M${x} 40 q14 14 28 0`} fill="none" stroke="#c9a94a" strokeWidth={4} strokeLinecap="round" />)}
              {[-150, -90, -30].map((x, i) => <path key={x} d={`M${x - 14} -52 L${x} -${82 - i * 4} L${x + 14} -52 Z`} fill="url(#dr-spike)" {...ink(3)} />)}
              <g style={{ transform: `translate(-180px, 0px) rotate(${-neck}deg)`, transition: `transform 1.1s ${EASE}` }}>
                <g className={sleep ? undefined : 'story-head'}>
                  <DragonHead eyes={eyes} mouth={mouth} blush={blush} smoke={smoke} fire={fire} purr={purr} sleep={sleep} />
                </g>
              </g>
            </g>
          </g>
          {/* Held things sit in front: on the chest when sitting, on the flank when lying down. */}
          {holding ? <g style={{ transform: pose === 'sit' || pose === 'rear' ? 'translate(-205px, -70px)' : 'translate(-40px, -120px)', transition: `transform 1s ${EASE}` }}>{holding}</g> : null}
          <g style={{ opacity: shine, transition: 'opacity .5s ease' }} pointerEvents="none">
            <path d="M-110 -200 C-40 -236 60 -240 150 -214" fill="none" stroke="#ffffff" strokeWidth={14} strokeLinecap="round" opacity={0.7} />
            {[[-90, -160], [10, -210], [120, -170], [210, -120], [-30, -100], [60, -140], [176, -60]].map(([x, y], i) => (
              <g key={i} transform={`translate(${x} ${y})`}>
                <path d="M0 -18 L5 -5 L18 0 L5 5 L0 18 L-5 5 L-18 0 L-5 -5 Z" fill="#ffffff" className="story-twinkle" style={{ animationDelay: `${i * 0.2}s` }} />
              </g>
            ))}
          </g>
        </g>
      </g>
    </g>
  );
}

/** A small dragon used inside thought clouds and pictures. */
export function MiniDragon({ fierce = false, sleeping = false }: { fierce?: boolean; sleeping?: boolean }) {
  return (
    <g>
      <path d="M40 -30 Q110 -40 130 -80 L140 -60 Q120 -10 40 0 Z" fill="url(#dr-scale)" {...ink(3)} />
      <ellipse cx={0} cy={-40} rx={80} ry={44} fill={fierce ? '#c2452d' : 'url(#dr-scale)'} {...ink(4)} />
      <ellipse cx={-6} cy={-24} rx={56} ry={18} fill="#fbf0b8" />
      <circle cx={-80} cy={sleeping ? -36 : -78} r={34} fill={fierce ? '#c2452d' : 'url(#dr-scale)'} {...ink(4)} />
      <ellipse cx={-112} cy={sleeping ? -30 : -70} rx={26} ry={16} fill={fierce ? '#c2452d' : 'url(#dr-scale)'} {...ink(3.5)} />
      {sleeping
        ? <path d="M-96 -44 q8 6 16 0" stroke={INK} strokeWidth={4} fill="none" strokeLinecap="round" />
        : <circle cx={-88} cy={-86} r={6} fill={INK} />}
      {fierce ? <path d="M-136 -70 L-176 -84 L-170 -64 L-190 -56 L-138 -60 Z" fill="#ff9a3d" stroke={INK} strokeWidth={2.5} /> : null}
      <path d="M-60 -106 L-50 -128 L-40 -104 Z M-80 -110 L-74 -132 L-62 -110 Z" fill="#f7ecd0" stroke={INK} strokeWidth={2.5} />
    </g>
  );
}

export function Book({ open = true, s = 1 }: { open?: boolean; s?: number }) {
  return (
    <g transform={`scale(${s})`}>
      {open ? (
        <g>
          <path d="M0 -6 Q-30 -18 -58 -10 L-58 26 Q-30 18 0 30 Z" fill="#fffaf0" {...ink(3)} />
          <path d="M0 -6 Q30 -18 58 -10 L58 26 Q30 18 0 30 Z" fill="#fffaf0" {...ink(3)} />
          <path d="M-48 0 L-12 4 M-48 10 L-12 14 M12 4 L48 0 M12 14 L48 10" stroke="#c9b48a" strokeWidth={3} />
          <path d="M-60 26 Q-30 20 0 32 Q30 20 60 26 L60 32 Q30 26 0 38 Q-30 26 -60 32 Z" fill="#b8546a" {...ink(3)} />
        </g>
      ) : (
        <g>
          <rect x={-40} y={-10} width={80} height={44} rx={5} fill="#b8546a" {...ink(3)} />
          <rect x={-34} y={-4} width={68} height={6} fill="#f6d36b" />
          <rect x={-40} y={26} width={80} height={8} fill="#fffaf0" {...ink(2.5)} />
        </g>
      )}
    </g>
  );
}

export function Scroll({ s = 1 }: { s?: number }) {
  return (
    <g transform={`scale(${s})`}>
      <rect x={-54} y={-70} width={108} height={130} fill="#fff6dc" {...ink(4)} />
      {[-44, -24, -4, 16, 36].map((y) => <path key={y} d={`M-36 ${y} q18 -6 36 0 q18 6 36 0`} fill="none" stroke="#b08a5a" strokeWidth={4} />)}
      <rect x={-64} y={-84} width={128} height={20} rx={10} fill="#d9a441" {...ink(3.5)} />
      <rect x={-64} y={52} width={128} height={20} rx={10} fill="#d9a441" {...ink(3.5)} />
    </g>
  );
}

export function Cloth() {
  return (
    <g>
      <path d="M-40 -30 Q0 -46 40 -26 Q46 10 34 34 Q0 22 -34 36 Q-50 4 -40 -30 Z" fill="#f0e3c4" {...ink(3.5)} />
      <path d="M-28 -18 L28 -10 M-30 2 L30 8 M-26 20 L26 22" stroke="#d26a5a" strokeWidth={4} />
    </g>
  );
}

/** A thought cloud floating up from (0, 0); children are drawn inside the cloud around (0, -150). */
export function Thought({ on, flip = false, children }: { on: boolean; flip?: boolean; children: ReactNode }) {
  const d = flip ? -1 : 1;
  return (
    <g style={{ opacity: on ? 1 : 0, transform: `scale(${on ? 1 : 0.6})`, transformOrigin: '0px 0px', ...glide(0.7) }} pointerEvents={on ? undefined : 'none'}>
      <circle cx={10 * d} cy={-20} r={10} fill="#ffffff" {...ink(3)} />
      <circle cx={30 * d} cy={-52} r={16} fill="#ffffff" {...ink(3)} />
      <g transform="translate(0 -170)">
        <path d="M-200 40 C-250 30 -250 -50 -190 -60 C-190 -120 -100 -140 -60 -100 C-30 -150 60 -150 80 -100 C130 -140 220 -110 200 -50 C260 -40 250 40 190 50 C180 100 80 110 50 80 C20 120 -80 120 -110 80 C-170 110 -230 80 -200 40 Z" fill="#ffffff" {...ink(5)} />
        <g transform="translate(0 40)">{children}</g>
      </g>
    </g>
  );
}

/** A white war horse with a red-cross cloth; a rider passed as children sits in the saddle. */
export function Horse({ run = false, rider }: { run?: boolean; rider?: ReactNode }) {
  return (
    <g>
      <ellipse cx={0} cy={4} rx={190} ry={16} fill="#000000" opacity={0.18} />
      <g className={run ? 'story-gallop' : undefined}>
        {[[-110, 1], [-70, 0], [70, 1], [110, 0]].map(([x, far]) => (
          <g key={x}>
            <rect x={x - 13} y={-150} width={26} height={150} rx={12} fill={far ? '#dcd6cc' : '#f7f3ec'} {...ink(4)} />
            <rect x={x - 15} y={-16} width={30} height={16} rx={4} fill="#6b5138" {...ink(3)} />
          </g>
        ))}
        <path d="M150 -230 Q230 -200 220 -110 Q200 -150 160 -160 Z" fill="#e8dcc4" {...ink(4)} />
        {/* The rider sits behind the saddle cloth, so only the body above the waist shows. */}
        {rider ? <g transform="translate(-10 -155)">{rider}</g> : null}
        <ellipse cx={0} cy={-190} rx={170} ry={76} fill="#f7f3ec" {...ink(5)} />
        <path d="M-150 -170 Q-120 -260 -60 -250 L40 -250 Q120 -260 150 -170 L140 -110 Q0 -90 -140 -110 Z" fill="#ffffff" {...ink(4)} />
        <path d="M-30 -250 L30 -250 L36 -100 L-36 -100 Z M-146 -196 L146 -196 L144 -156 L-146 -156 Z" fill="#d23a2e" />
        <path d="M-150 -112 Q-130 -98 -110 -112 Q-90 -98 -70 -112 Q-50 -98 -30 -112 Q-10 -98 10 -112 Q30 -98 50 -112 Q70 -98 90 -112 Q110 -98 130 -112" fill="none" stroke="#f0c35a" strokeWidth={6} />
        <path d="M-130 -230 Q-190 -300 -200 -360 L-150 -380 Q-100 -320 -80 -250 Z" fill="#f7f3ec" {...ink(5)} />
        <path d="M-150 -380 Q-120 -400 -110 -350 Q-120 -320 -90 -270" fill="none" stroke="#d9cfa8" strokeWidth={20} strokeLinecap="round" />
        <g transform="translate(-200 -372)">
          <path d="M20 -10 Q-10 -40 -60 -20 Q-110 0 -110 40 Q-100 70 -60 64 Q-20 60 10 40 Z" fill="#f7f3ec" {...ink(5)} />
          <path d="M-10 -36 L0 -70 L20 -32 Z" fill="#f7f3ec" {...ink(4)} />
          <circle cx={-48} cy={0} r={8} fill={INK} />
          <circle cx={-46} cy={-3} r={2.5} fill="#ffffff" />
          <ellipse cx={-100} cy={36} rx={6} ry={4} fill={INK} />
          <path d="M-60 -24 L-26 -46 L10 -30" fill="none" stroke="#d23a2e" strokeWidth={6} strokeLinecap="round" />
        </g>
        <path d="M-26 -190 L-30 -120 L-4 -116" fill="none" stroke="#c9a13a" strokeWidth={16} strokeLinecap="round" strokeLinejoin="round" style={{ opacity: rider ? 1 : 0 }} />
      </g>
    </g>
  );
}

/** A long lance with the white pennon and red cross. Points up by default; the tip is at (0, -length). */
export function Spear({ length = 420 }: { length?: number }) {
  return (
    <g>
      <rect x={-6} y={-length} width={12} height={length} rx={5} fill="url(#st-wood)" {...ink(3)} />
      <path d={`M0 ${-length - 46} L14 ${-length} L-14 ${-length} Z`} fill="#d8dee4" {...ink(3)} />
      <g transform={`translate(6 ${-length + 30})`}>
        <path d="M0 0 L90 14 L0 34 Z" fill="#ffffff" {...ink(3)} className="story-flag" />
      </g>
      <path d={`M10 ${-length + 40} L52 ${-length + 46} M30 ${-length + 34} L30 ${-length + 58}`} stroke="#d23a2e" strokeWidth={5} />
      <path d="M-18 -110 L18 -110 L12 -80 L-12 -80 Z" fill="#c2b28a" {...ink(3)} />
    </g>
  );
}

/** St. George riding, optionally charging with the spear lowered. */
export function Knight({ charge = false, mood = 'smile' as PersonProps['mood'], run = false }: { charge?: boolean; mood?: PersonProps['mood']; run?: boolean }) {
  return (
    <Horse run={run} rider={(
      <g>
        <g style={{ transform: `translate(30px, -70px) rotate(${charge ? -76 : -6}deg)`, transformOrigin: '0px 0px', transition: `transform .9s ${EASE}` }}>
          <Spear />
        </g>
        <Person {...GEORGE} mood={mood} />
      </g>
    )} />
  );
}

export function Cottage({ lit = true }: { lit?: boolean }) {
  return (
    <g>
      <ellipse cx={0} cy={6} rx={260} ry={18} fill="#000000" opacity={0.16} />
      <rect x={-210} y={-200} width={420} height={200} fill="#f1e2c4" {...ink(5)} />
      {[[-170, -170], [-90, -60], [120, -150], [160, -40], [-30, -130]].map(([x, y], i) => <ellipse key={i} cx={x} cy={y} rx={22} ry={12} fill="#dcc8a0" />)}
      <path d="M-250 -190 Q-120 -330 0 -360 Q120 -330 250 -190 Q0 -170 -250 -190 Z" fill="#d9a441" {...ink(5)} />
      {[-180, -120, -60, 0, 60, 120, 180].map((x) => <path key={x} d={`M${x} -196 Q${x * 0.6} -280 ${x * 0.3} -340`} fill="none" stroke="#b07a2a" strokeWidth={4} />)}
      <rect x={120} y={-380} width={44} height={110} fill="#b9a284" {...ink(4)} />
      <g transform="translate(142 -400)" pointerEvents="none">
        {[0, 1, 2].map((i) => <g key={i} className="story-float" style={{ animationDelay: `${i * 0.8}s` }}><circle cx={i * 8} cy={0} r={18 - i * 3} fill="#e6e1d8" opacity={0.85} /></g>)}
      </g>
      <path d="M-40 0 L-40 -110 Q0 -140 40 -110 L40 0 Z" fill="#7a4a24" {...ink(4)} />
      <circle cx={26} cy={-54} r={5} fill="#f0c35a" />
      {[-140, 120].map((x) => (
        <g key={x}>
          <rect x={x - 40} y={-150} width={80} height={70} fill={lit ? '#ffd76a' : '#5a6a8a'} {...ink(4)} />
          {lit ? <rect x={x - 40} y={-150} width={80} height={70} fill="url(#st-glow)" opacity={0.6} /> : null}
          <path d={`M${x} -150 L${x} -80 M${x - 40} -115 L${x + 40} -115`} stroke={INK} strokeWidth={4} />
        </g>
      ))}
    </g>
  );
}

/** The chalk down with the dragon's cave. Cave mouth centre is at (0, -60); ground at 0. */
export function CaveHill({ smoke = false, glow = false }: { smoke?: boolean; glow?: boolean }) {
  return (
    <g>
      <path d="M-420 20 C-330 -230 -150 -370 60 -370 C260 -370 420 -230 500 20 Z" fill="url(#st-grass)" {...ink(5)} />
      <path d="M-300 -60 C-240 -200 -120 -290 40 -300 C-80 -270 -200 -180 -240 -40 Z" fill="#b8dc8f" opacity={0.6} />
      {[[-200, -150, 40], [180, -230, 30], [300, -100, 46]].map(([x, y, r], i) => <ellipse key={i} cx={x} cy={y} rx={r} ry={r * 0.45} fill="#f4efe2" opacity={0.85} />)}
      {[[-280, -40], [-180, -260], [250, -280], [400, -60]].map(([x, y], i) => (
        <g key={i} transform={`translate(${x} ${y})`}>
          <circle r={34} fill="#3f6e3a" {...ink(3.5)} />
          <circle cx={-14} cy={-14} r={12} fill="#5c8f4f" />
        </g>
      ))}
      <path d="M-130 20 L-130 -80 Q0 -230 130 -80 L130 20 Z" fill="#2a1d16" {...ink(6)} />
      <path d="M-130 -80 Q0 -230 130 -80" fill="none" stroke="#e8e0cc" strokeWidth={14} opacity={0.7} />
      <circle cx={0} cy={-40} r={150} fill="url(#st-fireglow)" opacity={glow ? 0.9 : 0} style={{ transition: 'opacity .8s ease' }} />
      {smoke ? (
        <g pointerEvents="none">
          {[[-60, -80, 70], [40, -110, 80], [-10, -160, 60], [90, -60, 56], [-100, -140, 50]].map(([x, y, r], i) => (
            <g key={i} transform={`translate(${x} ${y})`}>
              <g className="story-smoke" style={{ animationDelay: `${i * 0.25}s` }}><circle r={r} fill="#e9ecef" stroke="#9aa4ad" strokeWidth={4} /></g>
            </g>
          ))}
        </g>
      ) : null}
    </g>
  );
}

/** Rolling downs seen far below, with a little village and white roads. */
export function Vale({ dusk = false }: { dusk?: boolean }) {
  const far = dusk ? '#8aa6b8' : '#a9cfa0';
  const near = dusk ? '#6f9a86' : '#8fc27a';
  return (
    <g pointerEvents="none">
      <path d="M-800 620 Q-300 540 200 590 Q700 520 1300 580 Q1900 540 2400 600 L2400 900 L-800 900 Z" fill={far} />
      <path d="M-800 680 Q0 610 700 650 Q1400 610 2400 670 L2400 900 L-800 900 Z" fill={near} />
      <path d="M-200 700 Q200 650 460 660 M300 690 Q600 640 900 650" fill="none" stroke="#f4efe2" strokeWidth={6} opacity={0.8} />
      {[[120, 640], [170, 650], [220, 636], [600, 628], [650, 640]].map(([x, y], i) => (
        <g key={i} transform={`translate(${x} ${y}) scale(0.5)`}>
          <rect x={-24} y={-30} width={48} height={30} fill="#f7efe0" stroke={INK} strokeWidth={3} />
          <path d="M-30 -28 L0 -52 L30 -28 Z" fill="#b5523a" stroke={INK} strokeWidth={3} />
          {dusk ? <rect x={-8} y={-22} width={14} height={12} fill="#ffd76a" /> : null}
        </g>
      ))}
      <g transform="translate(420 610) scale(0.5)">
        <rect x={-20} y={-90} width={40} height={90} fill="#e6dac4" stroke={INK} strokeWidth={3} />
        <path d="M-26 -88 L0 -130 L26 -88 Z" fill="#7a6a5a" stroke={INK} strokeWidth={3} />
      </g>
    </g>
  );
}

export function House({ wall = '#f7efe0', roof = '#b5523a', lit = false, w = 220 }: { wall?: string; roof?: string; lit?: boolean; w?: number }) {
  const h = 210;
  return (
    <g>
      <rect x={-w / 2} y={-h} width={w} height={h} fill={wall} {...ink(5)} />
      {[-w / 2 + 12, w / 2 - 12].map((x) => <rect key={x} x={x - 6} y={-h} width={12} height={h} fill="#7a4a24" />)}
      <rect x={-w / 2} y={-h * 0.52} width={w} height={12} fill="#7a4a24" />
      <path d={`M${-w / 2 - 22} ${-h + 4} L0 ${-h - 120} L${w / 2 + 22} ${-h + 4} Z`} fill={roof} {...ink(5)} />
      <path d={`M${-w / 2} ${-h - 4} L0 ${-h - 104}`} stroke="#000000" strokeWidth={10} opacity={0.08} />
      {[-w / 4, w / 4].map((x) => (
        <g key={x}>
          <rect x={x - 26} y={-h + 30} width={52} height={50} fill={lit ? '#ffd76a' : '#bfe0f0'} {...ink(4)} />
          <path d={`M${x} ${-h + 30} L${x} ${-h + 80}`} stroke={INK} strokeWidth={3} />
        </g>
      ))}
      <path d="M-26 0 L-26 -76 Q0 -96 26 -76 L26 0 Z" fill="#6b4423" {...ink(4)} />
    </g>
  );
}

/** Church tower with a bell that swings while `ringing`. */
export function BellTower({ ringing = false }: { ringing?: boolean }) {
  return (
    <g>
      <rect x={-80} y={-420} width={160} height={420} fill="#e6dac4" {...ink(5)} />
      {[[-50, -360], [30, -300], [-30, -200], [40, -120]].map(([x, y], i) => <rect key={i} x={x} y={y} width={30} height={16} fill="#d2c3a6" />)}
      <path d="M-96 -416 L0 -560 L96 -416 Z" fill="#7a6a5a" {...ink(5)} />
      <path d="M-50 -400 L-50 -300 Q0 -350 50 -300 L50 -400 Z" fill="#3d2a18" {...ink(4)} />
      <Hotspot id="bell" label="bell" cx={0} cy={-340} rx={70} ry={70}>
        <g transform="translate(0 -398)">
          <g className={ringing ? 'story-bell' : undefined}>
            <path d="M-34 70 Q-36 20 -20 6 Q0 -6 20 6 Q36 20 34 70 Z" fill="url(#st-bronze)" {...ink(4)} />
            <rect x={-42} y={66} width={84} height={12} rx={6} fill="url(#st-bronze)" {...ink(3.5)} />
            <circle cx={0} cy={84} r={9} fill="#a5701f" {...ink(3)} />
          </g>
        </g>
      </Hotspot>
      {ringing ? (
        <g transform="translate(0 -340)" pointerEvents="none">
          {[-1, 1].map((d) => (
            <g key={d} transform={`translate(${d * 90} 0)`}>
              <g className="story-ring-out"><path d={`M0 -30 Q${d * 24} 0 0 30 M${d * 18} -46 Q${d * 50} 0 ${d * 18} 46`} fill="none" stroke="#ffe27a" strokeWidth={7} strokeLinecap="round" /></g>
            </g>
          ))}
        </g>
      ) : null}
    </g>
  );
}

/** Party bunting between two points. */
export function Bunting({ x1, y1, x2, y2, on }: { x1: number; y1: number; x2: number; y2: number; on: boolean }) {
  const colors = ['#ef5b6e', '#f4c542', '#4fb3a9', '#6f8ff0', '#f29b4b'];
  const n = 9;
  const sag = 60;
  const point = (t: number) => [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t + Math.sin(Math.PI * t) * sag];
  return (
    <g style={{ opacity: on ? 1 : 0, transition: 'opacity .8s ease' }}>
      <path d={`M${x1} ${y1} Q${(x1 + x2) / 2} ${(y1 + y2) / 2 + sag * 2} ${x2} ${y2}`} fill="none" stroke={INK} strokeWidth={3} />
      {Array.from({ length: n }, (_, i) => {
        const [x, y] = point((i + 0.5) / n);
        return (
          <g key={i} transform={`translate(${x} ${y})`}>
            <g className="story-flag"><path d="M-16 0 L16 0 L0 34 Z" fill={colors[i % colors.length]} stroke={INK} strokeWidth={2.5} strokeLinejoin="round" /></g>
          </g>
        );
      })}
    </g>
  );
}

export function FlowerBed({ n = 7, spread = 60 }: { n?: number; spread?: number }) {
  const colors = ['#ef5b6e', '#f4c542', '#ffffff', '#b58cf0', '#f29b4b'];
  return (
    <g pointerEvents="none">
      {Array.from({ length: n }, (_, i) => (
        <g key={i} transform={`translate(${i * spread} ${(i % 2) * 10})`}>
          <path d="M0 0 L0 -26" stroke="#4f8a3a" strokeWidth={4} />
          {[0, 72, 144, 216, 288].map((a) => <ellipse key={a} cx={0} cy={-34} rx={6} ry={10} fill={colors[i % colors.length]} stroke={INK} strokeWidth={1.5} transform={`rotate(${a} 0 -26)`} />)}
          <circle cx={0} cy={-26} r={5} fill="#f4c542" stroke={INK} strokeWidth={1.5} />
        </g>
      ))}
    </g>
  );
}

export function Hen({ happy = false }: { happy?: boolean }) {
  return (
    <g>
      <ellipse cx={0} cy={2} rx={34} ry={6} fill="#000000" opacity={0.16} />
      <path d="M-6 -8 L-6 0 M8 -8 L8 0" stroke="#e0a83a" strokeWidth={4} />
      <ellipse cx={0} cy={-30} rx={32} ry={24} fill="#ffffff" {...ink(3.5)} />
      <path d="M26 -40 Q50 -64 40 -26 Z" fill="#ffffff" {...ink(3)} />
      <circle cx={-26} cy={-54} r={16} fill="#ffffff" {...ink(3.5)} />
      <path d="M-34 -70 Q-30 -82 -24 -70 Q-20 -82 -14 -68" fill="#e5483a" stroke={INK} strokeWidth={2.5} />
      <path d="M-42 -54 L-52 -50 L-42 -46 Z" fill="#f4c542" stroke={INK} strokeWidth={2} />
      {happy ? <path d="M-34 -58 q4 -4 8 0" stroke={INK} strokeWidth={2.5} fill="none" /> : <circle cx={-30} cy={-56} r={3} fill={INK} />}
      <ellipse cx={-36} cy={-44} rx={4} ry={6} fill="#e5483a" />
    </g>
  );
}

export function HenHouse({ open = false }: { open?: boolean }) {
  return (
    <g>
      <rect x={-90} y={-130} width={180} height={130} fill="url(#st-wood)" {...ink(4)} />
      {[-60, -20, 20, 60].map((x) => <line key={x} x1={x} y1={-130} x2={x} y2={0} stroke="#7a4a24" strokeWidth={3} />)}
      <path d="M-110 -126 L0 -200 L110 -126 Z" fill="#b5523a" {...ink(4)} />
      <path d="M-30 0 L-30 -60 Q0 -84 30 -60 L30 0 Z" fill={open ? '#3a2416' : '#8a5a2c'} {...ink(3.5)} />
      <path d="M30 0 L90 30" stroke="#c48a4e" strokeWidth={10} strokeLinecap="round" />
      {[-110, 110].map((x, i) => (
        <g key={x} transform={`translate(${x} 0)`}>
          <g className={open ? 'story-hen-hop' : undefined} style={{ animationDelay: `${i * 0.2}s` }}><Hen happy={open} /></g>
        </g>
      ))}
      <g transform="translate(0 10) scale(0.9)">
        <g style={{ opacity: open ? 1 : 0, transform: `translateY(${open ? 0 : -30}px)`, transition: 'transform .6s ease, opacity .5s ease' }}>
          <g className="story-hen-hop" style={{ animationDelay: '.1s' }}><Hen happy /></g>
        </g>
      </g>
    </g>
  );
}

export function Basket() {
  return (
    <g>
      <path d="M-34 -40 Q0 -86 34 -40" fill="none" stroke="#8a5a2c" strokeWidth={6} />
      <path d="M-40 -40 L40 -40 L30 0 L-30 0 Z" fill="#c48a4e" {...ink(3.5)} />
      <path d="M-36 -26 L36 -26 M-32 -12 L32 -12" stroke="#8a5a2c" strokeWidth={3} />
      <circle cx={-14} cy={-46} r={10} fill="#e5483a" {...ink(2.5)} />
      <ellipse cx={12} cy={-46} rx={16} ry={8} fill="#f3c74d" {...ink(2.5)} />
      <path d="M20 -44 L30 -70 L36 -66 L26 -42 Z" fill="#6b8e3a" {...ink(2)} />
    </g>
  );
}

export function Badger({ run = false }: { run?: boolean }) {
  return (
    <g className={run ? 'story-trot' : undefined}>
      <ellipse cx={0} cy={2} rx={50} ry={6} fill="#000000" opacity={0.16} />
      <ellipse cx={0} cy={-26} rx={50} ry={24} fill="#6f6a66" {...ink(3.5)} />
      <path d="M-30 -8 L-30 0 M24 -8 L24 0" stroke={INK} strokeWidth={8} strokeLinecap="round" />
      <path d="M-44 -30 Q-80 -40 -86 -20 Q-74 -6 -44 -14 Z" fill="#ffffff" {...ink(3)} />
      <path d="M-50 -34 Q-74 -36 -82 -24 L-80 -18 Q-70 -26 -50 -24 Z" fill={INK} />
      <circle cx={-66} cy={-28} r={3} fill="#ffffff" />
      <circle cx={-86} cy={-20} r={4} fill={INK} />
    </g>
  );
}

export function Lantern({ color = '#ffb347' }: { color?: string }) {
  return (
    <g>
      <line x1={0} y1={-30} x2={0} y2={0} stroke={INK} strokeWidth={2} />
      <circle cx={0} cy={22} r={48} fill="url(#st-fireglow)" />
      <ellipse cx={0} cy={22} rx={18} ry={22} fill={color} {...ink(3)} />
      <rect x={-10} y={-2} width={20} height={6} fill="#7a4a24" />
    </g>
  );
}

export function FeastTable({ wide = 900 }: { wide?: number }) {
  const foods = ['#c86a3a', '#f3c74d', '#e5483a', '#8ab83f', '#f0a24a', '#b5523a'];
  return (
    <g>
      <rect x={-wide / 2} y={-90} width={wide} height={26} rx={6} fill="#fff6e6" {...ink(4)} />
      <path d={`M${-wide / 2} -66 L${-wide / 2 + 20} -66 L${-wide / 2 + 10} 0 M${wide / 2} -66 L${wide / 2 - 20} -66 L${wide / 2 - 10} 0`} stroke="#7a4a24" strokeWidth={14} />
      <path d={`M${-wide / 2} -66 Q${-wide / 4} -40 0 -66 Q${wide / 4} -40 ${wide / 2} -66`} fill="none" stroke="#d23a2e" strokeWidth={6} />
      {Array.from({ length: Math.floor(wide / 110) }, (_, i) => {
        const x = -wide / 2 + 60 + i * 110;
        return (
          <g key={i} transform={`translate(${x} -92)`}>
            <ellipse cx={0} cy={0} rx={40} ry={10} fill="#ffffff" {...ink(3)} />
            {i % 3 === 0
              ? <path d="M-30 -2 Q-30 -40 0 -44 Q30 -40 30 -2 Z" fill={foods[i % foods.length]} {...ink(3)} />
              : i % 3 === 1
                ? <g>{[-14, 0, 14].map((dx) => <circle key={dx} cx={dx} cy={-14 - (dx === 0 ? 10 : 0)} r={12} fill={foods[(i + 2) % foods.length]} {...ink(2.5)} />)}</g>
                : <g><rect x={-12} y={-50} width={24} height={48} rx={6} fill="#7ab8d6" {...ink(2.5)} /><rect x={-12} y={-36} width={24} height={10} fill="#f7f1e3" /></g>}
          </g>
        );
      })}
    </g>
  );
}

/** A gilded picture frame used for St. George's "what a beautiful picture". */
export function PictureFrame({ children }: { children: ReactNode }) {
  return (
    <g>
      <rect x={-170} y={-120} width={340} height={240} fill="url(#st-bronze)" {...ink(5)} />
      <rect x={-146} y={-96} width={292} height={192} fill="#bfe3f5" {...ink(3)} />
      <path d="M-146 96 L-146 30 Q-60 -10 0 20 Q80 -20 146 30 L146 96 Z" fill="#8fc27a" />
      <g>{children}</g>
      {[[-170, -120], [170, -120], [-170, 120], [170, 120]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={14} fill="url(#st-bronze)" {...ink(3)} />)}
    </g>
  );
}

/** A table candle with a soft glow. */
export function Candle() {
  return (
    <g>
      <circle cx={0} cy={-70} r={200} fill="url(#st-fireglow)" className="story-pulse" />
      <rect x={-12} y={-56} width={24} height={56} rx={4} fill="#fff6e0" {...ink(3)} />
      <path d="M-24 0 L24 0 L18 8 L-18 8 Z" fill="url(#st-bronze)" {...ink(2.5)} />
      <g transform="translate(0 -60)">
        <g className="story-flicker"><path d="M0 -30 Q12 -10 0 0 Q-12 -10 0 -30 Z" fill="#ffb347" stroke={INK} strokeWidth={2} /></g>
      </g>
    </g>
  );
}

/** Tear drops or sweat beads near a face. */
export function Drops({ on, tears = false }: { on: boolean; tears?: boolean }) {
  return on ? (
    <g pointerEvents="none">
      {(tears ? [[-14, 0], [14, 0]] : [[30, -10]]).map(([x, y], i) => (
        <g key={i} transform={`translate(${x} ${y})`}>
          <g className="story-drip" style={{ animationDelay: `${i * 0.4}s` }}>
            <path d="M0 -10 Q8 2 0 8 Q-8 2 0 -10 Z" fill="#7ac7f0" stroke={INK} strokeWidth={2} />
          </g>
        </g>
      ))}
    </g>
  ) : null;
}

/** "?" marks above a thinking head. */
export function Wonder({ on }: { on: boolean }) {
  return (
    <g style={{ opacity: on ? 1 : 0, transition: 'opacity .5s ease' }} pointerEvents="none">
      {[[-24, 0, 44], [26, -26, 34]].map(([x, y, size], i) => (
        <g key={i} transform={`translate(${x} ${y})`}>
          <g className="story-float" style={{ animationDelay: `${i * 0.7}s` }}>
            <text fontSize={size} fontWeight={900} fill="#ffffff" stroke={INK} strokeWidth={3}>?</text>
          </g>
        </g>
      ))}
    </g>
  );
}

/** A big cartoon caption such as "ROUND 1" or "ROAR!". */
export function Shout({ text, on, color = '#ffd84d' }: { text: string; on: boolean; color?: string }) {
  return on ? (
    <g pointerEvents="none">
      <g className="story-pop">
        <text textAnchor="middle" fontSize={84} fontWeight={900} fill={color} stroke={INK} strokeWidth={6} paintOrder="stroke" letterSpacing={4}>{text}</text>
      </g>
    </g>
  ) : null;
}
