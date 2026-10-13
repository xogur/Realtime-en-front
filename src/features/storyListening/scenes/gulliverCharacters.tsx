'use client';

import type { CSSProperties, ReactNode } from 'react';

import { Bow } from './characters';
import { EASE, Hotspot, INK, lookStyle, Person, Ship, type PersonProps } from './parts';

/*
 * Characters and props for "Gulliver in Lilliput". The story is about scale:
 * the giant is drawn on his own (front view, sitting or lying), and the
 * Lilliputians reuse Person at finger size. Origins sit on the ground.
 */

const ink = (width = 4) => ({ stroke: INK, strokeWidth: width, strokeLinejoin: 'round' as const });
const SWING: CSSProperties = { transition: `transform 1.1s ${EASE}` };

const COAT = '#2f5d9a';
const COAT_SHADE = '#24497c';
const CUFF = '#1f3c66';
const VEST = '#f0c75e';
const LACE = '#fbf7ef';
const BREECHES = '#6b4a2f';
const STOCKING = '#f4efe2';
const SHOE = '#2a1b12';
const SKIN = '#f3c79b';
const HAIR = '#7a4a24';
const GOLD = '#f4c542';

/** Gulliver at ordinary size, for the shipwreck and the voyage home. */
export const GULLIVER = { tunic: COAT, hair: HAIR, trim: VEST } satisfies PersonProps;
export const OFFICER = { tunic: '#c23b2e', hair: '#3b2a1c', trim: GOLD } satisfies PersonProps;
export const MINISTER = { tunic: '#4b3f7a', dress: true, hair: '#e8e8e8', beard: '#f4f4f4', trim: GOLD, staff: true } satisfies PersonProps;
export const ARCHER = { tunic: '#4f7a3a', helmet: true, crest: '#e5483a', trim: GOLD } satisfies PersonProps;
export const LILLIPUTIANS: readonly PersonProps[] = [
  { tunic: '#e5483a', hair: '#3b2416' },
  { tunic: '#f4a93b', hair: '#7a4a24', dress: true },
  { tunic: '#3fae7a', hair: '#2b2118' },
  { tunic: '#8a4fb3', hair: '#a35f2a', dress: true, long: true },
  { tunic: '#2f86c0', hair: '#55402e' },
  { tunic: '#e86aa0', hair: '#2b2118', dress: true },
];
export const BLEFUSCANS: readonly PersonProps[] = [
  { tunic: '#2f6fb0', hair: '#2b2118', trim: '#bfe0f0' },
  { tunic: '#4f9ad0', hair: '#7a5530', dress: true, trim: '#ffffff' },
  { tunic: '#1f4f86', hair: '#3b2416', trim: '#f4c542' },
];

/* ------------------------------------------------------------ the giant */

export type GiantEyes = 'open' | 'closed' | 'squint' | 'happy' | 'wide';
export type GiantMouth = 'smile' | 'o' | 'open' | 'ouch' | 'grin' | 'puff' | 'frown' | 'chew' | 'sleep';
type HeadProps = { eyes?: GiantEyes; mouth?: GiantMouth; glasses?: boolean; glassesSpot?: boolean; blush?: boolean; sweat?: boolean; queue?: boolean };

/** Gulliver's face, centred at (0, 0) with a radius of 120. His long hair is tied back with a black ribbon. */
export function GiantHead({ eyes = 'open', mouth = 'smile', glasses = false, glassesSpot = false, blush = false, sweat = false, queue = true }: HeadProps) {
  const brows = eyes === 'squint' || mouth === 'frown' ? ['M-72 -54 L-24 -38', 'M72 -54 L24 -38']
    : eyes === 'wide' ? ['M-70 -60 Q-46 -76 -22 -62', 'M70 -60 Q46 -76 22 -62']
      : ['M-70 -44 Q-46 -58 -22 -46', 'M70 -44 Q46 -58 22 -46'];
  const lenses = (
    <g>
      {[-46, 46].map((x) => <circle key={x} cx={x} cy={-8} r={36} fill="#dff4ff" fillOpacity={0.35} stroke="#3a3330" strokeWidth={7} />)}
      <path d="M-10 -12 Q0 -22 10 -12 M-82 -14 L-118 -24 M82 -14 L118 -24" fill="none" stroke="#3a3330" strokeWidth={6} strokeLinecap="round" />
      <path d="M-62 -28 L-44 -36 M30 -28 L48 -36" stroke="#ffffff" strokeWidth={5} strokeLinecap="round" />
    </g>
  );
  return (
    <g>
      {/* The queue of hair and its ribbon peek out behind the head. */}
      {queue ? (
        <g>
          <path d="M70 70 Q150 120 128 214 Q110 236 92 208 Q104 138 46 98 Z" fill={HAIR} {...ink(5)} />
          <path d="M84 84 L126 60 L124 112 Z M84 84 L44 58 L54 110 Z" fill="#1f1a2e" {...ink(3)} />
        </g>
      ) : null}
      <ellipse cx={-118} cy={12} rx={22} ry={32} fill={SKIN} {...ink(5)} />
      <ellipse cx={118} cy={12} rx={22} ry={32} fill={SKIN} {...ink(5)} />
      <circle r={120} fill={SKIN} {...ink(6)} />
      <path d="M58 -102 A120 120 0 0 1 84 86 A112 112 0 0 0 58 -102 Z" fill="#000000" opacity={0.07} />
      <path d="M-124 -4 Q-130 -128 0 -128 Q130 -128 124 -4 Q114 -60 72 -68 Q42 -98 -4 -80 Q-52 -100 -86 -64 Q-116 -54 -124 -4 Z" fill={HAIR} {...ink(5)} />
      <circle cx={-116} cy={-30} r={20} fill={HAIR} {...ink(4)} />
      <circle cx={116} cy={-30} r={20} fill={HAIR} {...ink(4)} />
      {brows.map((d) => <path key={d} d={d} stroke={INK} strokeWidth={8} strokeLinecap="round" fill="none" />)}
      {eyes === 'open' || eyes === 'wide' ? (
        <g className="story-blink">
          {[-44, 44].map((x) => <ellipse key={x} cx={x} cy={-8} rx={eyes === 'wide' ? 25 : 20} ry={eyes === 'wide' ? 30 : 24} fill="#ffffff" stroke={INK} strokeWidth={4} />)}
          <g style={lookStyle(7, 5)}>
            {[-44, 44].map((x) => (
              <g key={x}>
                <circle cx={x} cy={-6} r={eyes === 'wide' ? 8 : 11} fill={INK} />
                <circle cx={x + 4} cy={-10} r={3.5} fill="#ffffff" />
              </g>
            ))}
          </g>
        </g>
      ) : (
        <g>
          {[-1, 1].map((d) => (
            <path key={d} fill="none" stroke={INK} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round"
              d={eyes === 'closed' ? `M${d * 64} -6 Q${d * 44} 8 ${d * 24} -6`
                : eyes === 'happy' ? `M${d * 64} 0 Q${d * 44} -22 ${d * 24} 0`
                  : `M${d * 64} -22 L${d * 28} -8 L${d * 64} 6`} />
          ))}
        </g>
      )}
      <ellipse cx={0} cy={30} rx={20} ry={17} fill="#eeae86" {...ink(4)} />
      <ellipse cx={-6} cy={24} rx={6} ry={4} fill="#ffffff" opacity={0.6} />
      <ellipse cx={-70} cy={44} rx={blush || mouth === 'puff' ? 24 : 16} ry={blush || mouth === 'puff' ? 16 : 10} fill="#f08a7a" opacity={blush || mouth === 'puff' ? 0.75 : 0.45} />
      <ellipse cx={70} cy={44} rx={blush || mouth === 'puff' ? 24 : 16} ry={blush || mouth === 'puff' ? 16 : 10} fill="#f08a7a" opacity={blush || mouth === 'puff' ? 0.75 : 0.45} />
      <GiantMouthShape mouth={mouth} />
      {glasses ? (glassesSpot ? <Hotspot id="glasses" label="glasses" cx={0} cy={-10} rx={130} ry={60}>{lenses}</Hotspot> : lenses) : null}
      {sweat ? (
        <g transform="translate(108 -70)" pointerEvents="none">
          <g className="story-drip"><path d="M0 -18 Q14 4 0 14 Q-14 4 0 -18 Z" fill="#7ac7f0" stroke={INK} strokeWidth={3} /></g>
        </g>
      ) : null}
    </g>
  );
}

function GiantMouthShape({ mouth }: { mouth: GiantMouth }) {
  switch (mouth) {
    case 'o': return <ellipse cx={0} cy={78} rx={16} ry={20} fill="#7a2e24" {...ink(4)} />;
    case 'open':
      return (
        <g>
          <ellipse cx={0} cy={78} rx={36} ry={30} fill="#7a2e24" {...ink(5)} />
          <ellipse cx={0} cy={94} rx={20} ry={10} fill="#e5737a" />
        </g>
      );
    case 'ouch': return <path d="M-42 68 Q-22 56 0 68 Q22 80 42 68 L38 92 Q0 104 -38 92 Z" fill="#7a2e24" {...ink(5)} />;
    case 'grin':
      return (
        <g>
          <path d="M-50 60 Q0 124 50 60 Z" fill="#7a2e24" {...ink(5)} />
          <path d="M-42 64 L42 64 L36 76 L-36 76 Z" fill="#ffffff" />
        </g>
      );
    case 'puff': return <path d="M-20 80 Q0 70 20 80" fill="none" stroke={INK} strokeWidth={6} strokeLinecap="round" />;
    case 'frown': return <path d="M-38 90 Q0 62 38 90" fill="none" stroke={INK} strokeWidth={6} strokeLinecap="round" />;
    case 'chew':
      return (
        <g>
          <path d="M-30 74 Q0 94 30 74" fill="none" stroke={INK} strokeWidth={6} strokeLinecap="round" />
          <circle cx={36} cy={86} r={5} fill="#c48a4e" />
          <circle cx={-34} cy={90} r={4} fill="#c48a4e" />
        </g>
      );
    case 'sleep': return <ellipse cx={0} cy={80} rx={12} ry={8} fill="#7a2e24" {...ink(4)} />;
    default: return <path d="M-42 66 Q0 104 42 66" fill="none" stroke={INK} strokeWidth={6} strokeLinecap="round" />;
  }
}

export type HandShape = 'fist' | 'open' | 'palm' | 'finger' | 'point';
/**
 * Where a hand goes, in the giant's own coordinates. `bend` picks which way the
 * elbow folds (default: the lower elbow); `turn` rotates the hand; `holding`
 * stays upright in the palm.
 */
export type ArmPose = { to: readonly [number, number]; bend?: 1 | -1; hand?: HandShape; turn?: number; holding?: ReactNode };
type Angles = readonly [number, number];

const UPPER = 250;
const FORE = 230;
const deg = (rad: number) => (rad * 180) / Math.PI;
const wrap = (angle: number) => ((((angle + 180) % 360) + 360) % 360) - 180;

/** Two-bone reach: shoulder and elbow turns (0 = hanging down, positive swings out) that put the hand at (dx, dy) from the shoulder. */
function reach(dx: number, dy: number, bend?: 1 | -1): Angles {
  const d = Math.min(UPPER + FORE - 4, Math.max(Math.abs(UPPER - FORE) + 4, Math.hypot(dx, dy)));
  const base = Math.atan2(dy, dx);
  const fold = Math.acos((UPPER * UPPER + d * d - FORE * FORE) / (2 * UPPER * d));
  const lower = Math.sin(base + fold) >= Math.sin(base - fold) ? 1 : -1;
  const upper = base + fold * (bend ?? lower);
  const fore = Math.atan2(Math.sin(base) * d - Math.sin(upper) * UPPER, Math.cos(base) * d - Math.cos(upper) * UPPER);
  return [wrap(deg(upper) - 90), wrap(deg(fore) - deg(upper))];
}

function GiantHand({ shape }: { shape: HandShape }) {
  const skin = { fill: SKIN, ...ink(5) };
  const knuckles = <path d="M-26 -18 Q-20 -6 -26 8 M-4 -24 Q2 -10 -4 6 M18 -20 Q24 -8 18 6" stroke={INK} strokeWidth={3} fill="none" strokeLinecap="round" />;
  switch (shape) {
    case 'open':
      return (
        <g>
          {[-30, -10, 10, 30].map((x, i) => <rect key={x} x={x - 11} y={-96 + (i === 0 || i === 3 ? 12 : 0)} width={22} height={70} rx={11} {...skin} />)}
          <ellipse cx={-50} cy={-4} rx={14} ry={30} transform="rotate(-30 -50 -4)" {...skin} />
          <ellipse cx={0} cy={0} rx={46} ry={44} {...skin} />
        </g>
      );
    case 'palm':
      return (
        <g>
          <path d="M-66 -12 Q-66 -36 -36 -36 L66 -36 Q90 -36 90 -18 Q90 2 66 4 L-36 8 Q-66 10 -66 -12 Z" {...skin} />
          <path d="M28 -36 L28 -2 M50 -36 L50 0" stroke={INK} strokeWidth={3} />
          <path d="M-44 -34 Q-56 -70 -26 -68 Q-10 -60 -18 -36" {...skin} />
        </g>
      );
    case 'finger':
      return (
        <g>
          <rect x={-15} y={-132} width={30} height={104} rx={15} {...skin} />
          <path d="M-8 -122 Q0 -130 8 -122 L8 -108 L-8 -108 Z" fill="#fbe1cc" />
          <circle r={44} {...skin} />
          {knuckles}
        </g>
      );
    case 'point':
      return (
        <g>
          <rect x={-134} y={-16} width={104} height={30} rx={15} {...skin} />
          <circle r={44} {...skin} />
          {knuckles}
        </g>
      );
    default:
      return <g><circle r={46} {...skin} />{knuckles}</g>;
  }
}

/** A coat sleeve and hand hanging from (0, 0); the turns animate so poses glide. */
function GiantArm({ pose, angles, mirror = false }: { pose?: ArmPose; angles: Angles; mirror?: boolean }) {
  const [a1, a2] = angles;
  return (
    <g style={{ transform: `rotate(${a1}deg)`, ...SWING }}>
      <rect x={-42} y={-36} width={84} height={UPPER + 50} rx={42} fill={COAT} {...ink(6)} />
      <path d="M18 -20 L18 200" stroke={COAT_SHADE} strokeWidth={16} strokeLinecap="round" opacity={0.6} />
      <g transform={`translate(0 ${UPPER})`}>
        <g style={{ transform: `rotate(${a2}deg)`, ...SWING }}>
          <rect x={-38} y={-24} width={76} height={FORE - 50} rx={38} fill={COAT} {...ink(6)} />
          <rect x={-52} y={FORE - 110} width={104} height={62} rx={18} fill={CUFF} {...ink(5)} />
          <circle cx={30} cy={FORE - 80} r={7} fill={GOLD} {...ink(2.5)} />
          <path d={`M-40 ${FORE - 48} q10 18 20 0 q10 18 20 0 q10 18 20 0 q10 18 20 0`} fill={LACE} {...ink(3)} />
          <g transform={`translate(0 ${FORE})`}>
            <g style={{ transform: `rotate(${-(a1 + a2)}deg)`, ...SWING }}>
              <g transform={mirror ? 'scale(-1 1)' : undefined}>
                <g transform={pose?.turn ? `rotate(${pose.turn})` : undefined}><GiantHand shape={pose?.hand ?? 'fist'} /></g>
                {pose?.holding}
              </g>
            </g>
          </g>
        </g>
      </g>
    </g>
  );
}

type Spot = { id: string; label: string };
function spot(target: Spot | undefined, cx: number, cy: number, rx: number, ry: number, node: ReactNode) {
  return target ? <Hotspot id={target.id} label={target.label} cx={cx} cy={cy} rx={rx} ry={ry}>{node}</Hotspot> : node;
}

/** A flap pocket; `children` sit in the pocket (origin at the opening), so their lower half hides behind the flap. */
function CoatPocket({ children }: { children?: ReactNode }) {
  return (
    <g>
      <path d="M-74 0 Q0 14 74 0 L68 -10 Q0 2 -68 -10 Z" fill="#14263f" {...ink(3)} />
      {children}
      <path d="M-82 -4 Q0 12 82 -4 L78 44 Q0 62 -78 44 Z" fill={COAT_SHADE} {...ink(5)} />
      {[-44, 0, 44].map((x) => <circle key={x} cx={x} cy={x ? 34 : 40} r={8} fill={GOLD} {...ink(2.5)} />)}
    </g>
  );
}

type GiantProps = HeadProps & {
  sit?: boolean;
  left?: ArmPose;
  right?: ArmPose;
  /** Drawn in the left coat pocket. */
  pocket?: ReactNode;
  pocketSpot?: Spot;
  faceSpot?: Spot;
};

const SHOULDER_X = 200;
const SHOULDER_Y = -985;
const SIT_DROP = 380;
const HANG: ArmPose = { to: [-300, -530], bend: 1 };
const HANG_RIGHT: ArmPose = { to: [300, -530], bend: 1 };

/** Head-centre and pocket positions in the giant's coordinates, so scenes can place things on him. */
export const GIANT = {
  head: (sit = false): [number, number] => [0, -1140 + (sit ? SIT_DROP : 0)],
  pocket: (sit = false): [number, number] => (sit ? [-230, -210] : [-150, -560]),
  hatTop: (sit = false): [number, number] => [0, -1240 + (sit ? SIT_DROP : 0)],
};

/**
 * Gulliver from the front, about 1260 units tall standing (feet at the origin).
 * Sitting, he sits cross-legged and his upper body drops by 380.
 */
export function Giant({ sit = false, left, right, pocket, pocketSpot, faceSpot, ...head }: GiantProps) {
  const drop = sit ? SIT_DROP : 0;
  const leftPose = left ?? { ...HANG, to: [HANG.to[0], HANG.to[1] + drop] as const };
  const rightPose = right ?? { ...HANG_RIGHT, to: [HANG_RIGHT.to[0], HANG_RIGHT.to[1] + drop] as const };
  const shoulderY = SHOULDER_Y + drop;
  const leftAngles = reach(leftPose.to[0] + SHOULDER_X, leftPose.to[1] - shoulderY, leftPose.bend);
  const rightAngles = reach(SHOULDER_X - rightPose.to[0], rightPose.to[1] - shoulderY, rightPose.bend);
  const [pocketX, pocketY] = GIANT.pocket(sit);
  const [headX, headY] = GIANT.head(sit);
  return (
    <g>
      <ellipse cx={0} cy={6} rx={sit ? 470 : 240} ry={30} fill="#000000" opacity={0.2} />
      {sit ? (
        <g>
          <path d="M-170 -300 Q-430 -280 -444 -130 Q-444 -14 -330 -10 L330 -10 Q444 -14 444 -130 Q430 -280 170 -300 Z" fill={BREECHES} {...ink(6)} />
          <path d="M0 -290 L0 -120" stroke="#4f351f" strokeWidth={6} />
          {[1, -1].map((d) => (
            <g key={d} transform={`scale(${d} 1)`}>
              <g transform="translate(-370 -96) rotate(6)">
                <rect x={0} y={-46} width={520} height={92} rx={46} fill={STOCKING} {...ink(6)} />
              </g>
              <path d="M150 -70 Q240 -78 262 -40 Q262 -6 220 -4 L146 -8 Z" fill={SHOE} {...ink(5)} />
              <rect x={178} y={-62} width={30} height={20} rx={4} fill="#d8dee4" {...ink(3)} />
            </g>
          ))}
        </g>
      ) : (
        <g>
          {[-1, 1].map((d) => (
            <g key={d}>
              <rect x={d < 0 ? -140 : 44} y={-440} width={96} height={410} rx={42} fill={STOCKING} {...ink(6)} />
              <path d={`M${d * 92 - 84} -4 Q${d * 92 - 84} -60 ${d * 92} -62 Q${d * 92 + 84} -60 ${d * 92 + 84} -4 Z`} fill={SHOE} {...ink(5)} />
              <rect x={d * 92 - 20} y={-58} width={40} height={22} rx={5} fill="#d8dee4" {...ink(3)} />
            </g>
          ))}
          <path d="M-162 -660 L162 -660 L158 -404 L32 -404 L0 -470 L-32 -404 L-158 -404 Z" fill={BREECHES} {...ink(6)} />
          {[-1, 1].map((d) => <rect key={d} x={d < 0 ? -150 : 40} y={-424} width={110} height={24} rx={8} fill="#5a3c24" {...ink(3)} />)}
        </g>
      )}
      {/* Coat skirts and pockets. */}
      {sit ? (
        <g>
          <path d="M-196 -300 Q-320 -220 -340 -70 Q-260 -50 -170 -70 L-70 -290 Z" fill={COAT} {...ink(6)} />
          <path d="M196 -300 Q320 -220 340 -70 Q260 -50 170 -70 L70 -290 Z" fill={COAT} {...ink(6)} />
        </g>
      ) : (
        <g>
          <path d="M-196 -690 Q-262 -540 -252 -400 Q-190 -384 -116 -396 L-60 -690 Z" fill={COAT} {...ink(6)} />
          <path d="M196 -690 Q262 -540 252 -400 Q190 -384 116 -396 L60 -690 Z" fill={COAT} {...ink(6)} />
        </g>
      )}
      <g transform={`translate(${-pocketX} ${pocketY})`}><CoatPocket /></g>
      <g transform={`translate(${pocketX} ${pocketY})`}>
        {spot(pocketSpot, 0, 0, 120, 100, <CoatPocket>{pocket}</CoatPocket>)}
      </g>
      <g style={{ transform: `translate(0px, ${drop}px)`, ...SWING }}>
        <rect x={-46} y={-1086} width={92} height={80} fill={SKIN} {...ink(5)} />
        <path d="M-212 -1000 Q-244 -820 -200 -660 L200 -660 Q244 -820 212 -1000 Q110 -1044 0 -1044 Q-110 -1044 -212 -1000 Z" fill={COAT} {...ink(6)} />
        <path d="M-82 -1014 L82 -1014 L88 -650 L0 -612 L-88 -650 Z" fill={VEST} {...ink(5)} />
        {[-950, -880, -810, -740, -680].map((y) => <circle key={y} cx={0} cy={y} r={8} fill="#c98a1f" {...ink(2.5)} />)}
        {[-1, 1].map((d) => (
          <g key={d}>
            <path d={`M${d * 84} -1010 Q${d * 120} -830 ${d * 92} -662`} fill="none" stroke={COAT_SHADE} strokeWidth={10} />
            {[-940, -860, -780].map((y) => <circle key={y} cx={d * 118} cy={y} r={10} fill={GOLD} {...ink(2.5)} />)}
          </g>
        ))}
        <path d="M-60 -1040 Q0 -1006 60 -1040 L46 -930 Q0 -900 -46 -930 Z" fill={LACE} {...ink(4)} />
        <path d="M-34 -980 q10 12 22 0 q10 12 22 0 q10 12 22 0 M-30 -950 q10 12 20 0 q10 12 20 0 q10 12 20 0" fill="none" stroke="#d9d2bf" strokeWidth={3} />
      </g>
      <g transform={`translate(${headX} ${headY})`}>
        {spot(faceSpot, 0, 0, 150, 150, <GiantHead {...head} />)}
      </g>
      <g transform={`translate(${-SHOULDER_X} ${shoulderY})`}><GiantArm pose={leftPose} angles={leftAngles} /></g>
      <g transform={`translate(${SHOULDER_X} ${shoulderY}) scale(-1 1)`}><GiantArm pose={rightPose} angles={rightAngles} mirror /></g>
    </g>
  );
}

type LyingProps = HeadProps & {
  /** The arm on our side; it rests along his body unless posed. */
  near?: ArmPose;
  /** The far arm shows only when raised above his chest. */
  far?: ArmPose;
  faceSpot?: Spot;
  chestSpot?: Spot;
  /** Red needle marks on his face (0-1), faded while the learner rubs them. */
  stings?: number;
};

const NEAR_SHOULDER: [number, number] = [-320, -150];
const FAR_SHOULDER: [number, number] = [-300, -210];
const REST: ArmPose = { to: [150, -30], hand: 'fist' };

/** Head-centre position of the lying giant, so scenes can aim speech and arrows at him. */
export const LYING_HEAD: [number, number] = [-470, -170];

/**
 * Gulliver lying on his back, seen from the side: head on the left (turned to
 * us), feet on the right, the ground at y = 0. About 1350 units long.
 */
export function GiantLying({ near = REST, far, faceSpot, chestSpot, stings = 0, ...head }: LyingProps) {
  const nearAngles = reach(near.to[0] - NEAR_SHOULDER[0], near.to[1] - NEAR_SHOULDER[1], near.bend);
  const farAngles = far ? reach(far.to[0] - FAR_SHOULDER[0], far.to[1] - FAR_SHOULDER[1], far.bend) : null;
  return (
    <g>
      <ellipse cx={-60} cy={8} rx={720} ry={28} fill="#000000" opacity={0.18} />
      <path d="M-560 -250 Q-690 -230 -740 -90 Q-760 -10 -690 2 L-470 0 Q-600 -120 -560 -250 Z" fill={HAIR} {...ink(5)} />
      <path d="M-700 -40 Q-660 -120 -600 -180 M-660 -10 Q-620 -90 -560 -140" fill="none" stroke="#5a3418" strokeWidth={5} />
      {farAngles ? <g transform={`translate(${FAR_SHOULDER[0]} ${FAR_SHOULDER[1]})`}><GiantArm pose={far} angles={farAngles} /></g> : null}
      <path d="M560 -90 Q600 -270 660 -262 Q700 -250 686 -190 Q664 -80 632 -10 L560 -10 Z" fill="#1c120c" {...ink(5)} />
      <path d="M60 -250 Q210 -252 296 -176 L304 0 L60 0 Z" fill={BREECHES} {...ink(6)} />
      <path d="M290 -172 Q420 -152 534 -118 L544 0 L290 0 Z" fill={STOCKING} {...ink(6)} />
      <rect x={278} y={-182} width={30} height={182} rx={10} fill="#5a3c24" {...ink(3)} />
      <path d="M520 -110 Q540 -262 604 -258 Q646 -248 636 -186 Q614 -64 584 0 L520 0 Z" fill={SHOE} {...ink(5)} />
      <rect x={548} y={-170} width={34} height={22} rx={5} fill="#d8dee4" transform="rotate(-14 565 -159)" {...ink(3)} />
      <path d="M40 -70 Q170 -50 250 0 L40 0 Z" fill={COAT_SHADE} {...ink(5)} />
      {spot(chestSpot, -150, -220, 260, 110, (
        <g>
          <path d="M-404 0 Q-422 -170 -322 -242 Q-200 -304 -40 -302 Q92 -294 112 -202 Q130 -100 112 0 Z" fill={COAT} {...ink(6)} />
          <path d="M-330 -236 Q-200 -300 -40 -300 Q84 -292 106 -214 L76 -206 Q60 -264 -40 -266 Q-186 -266 -312 -204 Z" fill={VEST} />
          <path d="M-404 0 Q-422 -170 -322 -242 Q-200 -304 -40 -302 Q92 -294 112 -202 Q130 -100 112 0" fill="none" {...ink(6)} />
          {[[-262, -262], [-160, -286], [-56, -292], [40, -276]].map(([x, y]) => <circle key={x} cx={x} cy={y} r={9} fill="#c98a1f" {...ink(2.5)} />)}
          <path d="M-300 -180 Q-160 -230 0 -228" fill="none" stroke={COAT_SHADE} strokeWidth={10} opacity={0.6} />
        </g>
      ))}
      <path d="M-420 -196 Q-380 -258 -330 -240 Q-344 -190 -384 -160 Z" fill={LACE} {...ink(4)} />
      <g transform={`translate(${LYING_HEAD[0]} ${LYING_HEAD[1]}) rotate(-14)`}>
        {spot(faceSpot, 0, 0, 150, 150, <GiantHead {...head} queue={false} />)}
        <g style={{ opacity: stings, transition: 'opacity .4s ease' }} pointerEvents="none">
          {[[-78, 40, -30], [64, -40, 20], [86, 52, -10], [-30, -80, 30]].map(([x, y, r], i) => (
            <g key={i} transform={`translate(${x} ${y}) rotate(${r})`}>
              <circle r={12} fill="#ef5b6e" opacity={0.7} />
              <path d="M0 0 L46 -10" stroke={INK} strokeWidth={4} strokeLinecap="round" />
              <path d="M40 -16 L52 -10 L42 -2" fill="#c23b2e" stroke={INK} strokeWidth={2} />
            </g>
          ))}
        </g>
      </g>
      <g transform={`translate(${NEAR_SHOULDER[0]} ${NEAR_SHOULDER[1]})`}><GiantArm pose={near} angles={nearAngles} /></g>
    </g>
  );
}

/** Tiny ropes pegged over the lying giant (same coordinates as GiantLying): over his hair, body and legs to pegs in front. */
export function LyingRopes() {
  const ropes: [number, number][] = [[-660, -120], [-580, -40], [-300, -246], [-150, -292], [20, -284], [190, -238], [400, -150]];
  return (
    <g>
      {ropes.map(([x, top]) => {
        const d = `M${x + 8} ${top - 2} Q${x - 40} ${top * 0.55} ${x - 22} -6 Q${x - 30} 12 ${x - 44} 24`;
        return (
          <g key={x}>
            <path d={d} fill="none" stroke={INK} strokeWidth={10} strokeLinecap="round" />
            <path d={d} fill="none" stroke="#e2c48a" strokeWidth={5} strokeLinecap="round" strokeDasharray="10 4" />
            <ellipse cx={x + 6} cy={top - 2} rx={9} ry={6} fill="#e2c48a" {...ink(2.5)} />
            <rect x={x - 52} y={12} width={16} height={34} rx={4} fill="url(#st-wood)" {...ink(3)} />
          </g>
        );
      })}
    </g>
  );
}

/* ------------------------------------------------------------ people */

/** The emperor: a cape, a beard and a little crown with a long feather. */
export function Emperor({ mood = 'smile', wave = false }: { mood?: PersonProps['mood']; wave?: boolean }) {
  return (
    <g>
      <Person tunic="#7b3fa0" cape="#c8372d" hair="#3b2416" beard="#3b2416" trim={GOLD} mood={mood} wave={wave} />
      <g transform="translate(0 -214)">
        <path d="M-40 4 Q0 -14 40 4 L36 -10 Q0 -26 -36 -10 Z" fill="#4b2a6b" {...ink(3)} />
        <path d="M-28 -10 L-28 -40 L-14 -24 L0 -46 L14 -24 L28 -40 L28 -10 Z" fill={GOLD} {...ink(3)} />
        {[-14, 0, 14].map((x) => <circle key={x} cx={x} cy={-14} r={4} fill={x ? '#e5483a' : '#2f86c0'} />)}
        <path d="M20 -24 Q60 -80 100 -60 Q70 -54 56 -30 Q44 -18 24 -14 Z" fill="#ffffff" {...ink(3)} />
        <path d="M30 -24 Q60 -60 92 -58" fill="none" stroke="#e5483a" strokeWidth={4} />
      </g>
    </g>
  );
}

/** The wise old minister with a beard down to his belt. */
export function Minister({ mood = 'smile', armsUp = false }: { mood?: PersonProps['mood']; armsUp?: boolean }) {
  return (
    <g>
      <Person {...MINISTER} mood={mood} armsUp={armsUp} />
      <path d="M-24 -150 Q-30 -70 0 -48 Q30 -70 24 -150 Z" fill="#f4f4f4" {...ink(3)} />
      <path d="M-8 -130 Q-4 -90 0 -64 M8 -130 Q6 -96 4 -70" fill="none" stroke="#d6d6d6" strokeWidth={2.5} />
    </g>
  );
}

/** An archer at finger size, bow raised. */
export function Archer({ mood = 'shout' }: { mood?: PersonProps['mood'] }) {
  return <Person {...ARCHER} mood={mood} holding={<g transform="translate(6 -40) scale(0.55)"><Bow /></g>} />;
}

/* ------------------------------------------------------------ Lilliput */

function Tower({ x, h, roof, flag }: { x: number; h: number; roof: string; flag?: string }) {
  return (
    <g transform={`translate(${x} 0)`}>
      <rect x={-34} y={-h} width={68} height={h} fill="url(#st-stone)" {...ink(4)} />
      <rect x={-10} y={-h + 34} width={20} height={28} rx={10} fill="#3a2a20" />
      <path d={`M-44 ${-h + 4} L0 ${-h - 90} L44 ${-h + 4} Z`} fill={roof} {...ink(4)} />
      {flag ? (
        <g transform={`translate(0 ${-h - 90})`}>
          <line x1={0} y1={0} x2={0} y2={-40} stroke={INK} strokeWidth={3} />
          <g transform="translate(1 -40)"><g className="story-flag"><path d="M0 0 L34 7 L0 16 Z" fill={flag} stroke={INK} strokeWidth={2.5} /></g></g>
        </g>
      ) : null}
    </g>
  );
}

/** The walled city of Lilliput, about 720 wide. Origin on the ground at the gate. */
export function TinyCity({ flag = '#e5483a' }: { flag?: string }) {
  const houses: [number, string, string][] = [[-250, '#f4a93b', '#c23b2e'], [-170, '#ffd9a8', '#2f6fb0'], [-80, '#f7c6d9', '#7b3fa0'], [90, '#d6f0b8', '#c23b2e'], [180, '#fff1c4', '#3fae7a'], [260, '#ffd0a0', '#2f6fb0']];
  return (
    <g>
      {houses.map(([x, wall, roof]) => (
        <g key={x} transform={`translate(${x} -96)`}>
          <rect x={-34} y={-70} width={68} height={70} fill={wall} {...ink(3.5)} />
          <path d="M-42 -66 L0 -110 L42 -66 Z" fill={roof} {...ink(3.5)} />
          <rect x={-10} y={-50} width={20} height={20} fill="#ffe9a0" {...ink(2.5)} />
        </g>
      ))}
      <g transform="translate(0 -110)">
        <rect x={-70} y={-120} width={140} height={120} fill="#fff6e6" {...ink(4)} />
        <path d="M-80 -116 Q0 -230 80 -116 Z" fill={GOLD} {...ink(4)} />
        <circle cx={0} cy={-186} r={10} fill="#e5483a" {...ink(3)} />
        {[-36, 0, 36].map((x) => <rect key={x} x={x - 10} y={-90} width={20} height={34} rx={10} fill="#5f7fc0" {...ink(2.5)} />)}
      </g>
      <rect x={-350} y={-120} width={700} height={120} fill="url(#st-stone)" {...ink(5)} />
      {Array.from({ length: 18 }, (_, i) => <rect key={i} x={-346 + i * 39} y={-140} width={22} height={22} fill="url(#st-stone)" {...ink(3)} />)}
      <path d="M-60 0 L-60 -70 Q0 -120 60 -70 L60 0 Z" fill="#3a2a20" {...ink(4)} />
      <path d="M-44 -62 L-44 0 M-22 -84 L-22 0 M0 -90 L0 0 M22 -84 L22 0 M44 -62 L44 0" stroke="#8a6a4c" strokeWidth={4} />
      <Tower x={-350} h={200} roof="#c23b2e" flag={flag} />
      <Tower x={-130} h={170} roof="#2f6fb0" />
      <Tower x={130} h={170} roof="#2f6fb0" />
      <Tower x={350} h={200} roof="#c23b2e" flag={flag} />
    </g>
  );
}

/** A little bell tower; the bell swings while ringing. */
export function TinyBellTower({ ringing = false, roof = '#c23b2e' }: { ringing?: boolean; roof?: string }) {
  return (
    <g>
      <rect x={-40} y={-230} width={80} height={230} fill="url(#st-stone)" {...ink(4)} />
      <path d="M-28 -214 L-28 -150 Q0 -180 28 -150 L28 -214 Z" fill="#2a1d16" {...ink(3)} />
      <path d="M-52 -226 L0 -320 L52 -226 Z" fill={roof} {...ink(4)} />
      <g transform="translate(0 -206)">
        <g className={ringing ? 'story-bell' : undefined}>
          <path d="M-20 44 Q-22 12 -12 4 Q0 -4 12 4 Q22 12 20 44 Z" fill="url(#st-bronze)" {...ink(3)} />
          <circle cx={0} cy={50} r={6} fill="#a5701f" {...ink(2)} />
        </g>
      </g>
      {ringing ? (
        <g transform="translate(0 -180)" pointerEvents="none">
          {[-1, 1].map((d) => (
            <g key={d} transform={`translate(${d * 66} 0)`}>
              <g className="story-ring-out"><path d={`M0 -24 Q${d * 18} 0 0 24 M${d * 14} -36 Q${d * 38} 0 ${d * 14} 36`} fill="none" stroke="#ffe27a" strokeWidth={6} strokeLinecap="round" /></g>
            </g>
          ))}
        </g>
      ) : null}
    </g>
  );
}

/** One flickering flame, about 120 tall at s = 1. */
export function Flame({ s = 1, delay = 0 }: { s?: number; delay?: number }) {
  return (
    <g transform={`scale(${s})`}>
      <g className="story-flicker" style={{ animationDelay: `${delay}s` }}>
        <path d="M0 0 Q-46 -6 -40 -50 Q-34 -86 -6 -120 Q0 -84 22 -70 Q46 -50 40 -20 Q34 0 0 0 Z" fill="#ff7a2f" stroke="#c2451d" strokeWidth={3} />
        <path d="M0 -6 Q-22 -10 -18 -36 Q-14 -56 0 -74 Q6 -50 16 -40 Q24 -24 16 -10 Q10 -4 0 -6 Z" fill="#ffd34d" />
      </g>
    </g>
  );
}

/** The royal palace of Lilliput, about 440 wide. `fire` 0 none, 1 burning, 2 blazing; `wet` drips after the splash. */
export function RoyalPalace({ fire = 0, wet = false }: { fire?: 0 | 1 | 2; wet?: boolean }) {
  const burning = fire > 0;
  const flames: [number, number, number][] = fire === 2
    ? [[-150, -250, 1.2], [-60, -330, 1.5], [40, -360, 1.7], [140, -260, 1.3], [-200, -150, 1], [190, -150, 1], [0, -200, 1.2]]
    : [[-60, -330, 0.9], [60, -300, 0.8], [150, -250, 0.7]];
  return (
    <g>
      {burning ? <circle cx={0} cy={-220} r={fire === 2 ? 420 : 300} fill="url(#st-fireglow)" className="story-pulse" /> : null}
      {[-170, 170].map((x) => (
        <g key={x} transform={`translate(${x} 0)`}>
          <rect x={-50} y={-280} width={100} height={280} fill="#f7efe0" {...ink(5)} />
          <path d="M-60 -276 Q-60 -350 0 -380 Q60 -350 60 -276 Z" fill="#2f6fb0" {...ink(5)} />
          <circle cx={0} cy={-388} r={10} fill={GOLD} {...ink(3)} />
          {[-210, -130].map((y) => <rect key={y} x={-16} y={y} width={32} height={44} rx={16} fill={burning ? '#ffb347' : '#8fc6e8'} {...ink(3)} />)}
        </g>
      ))}
      <rect x={-120} y={-260} width={240} height={260} fill="#fff6e6" {...ink(5)} />
      {Array.from({ length: 7 }, (_, i) => <rect key={i} x={-120 + i * 36} y={-282} width={24} height={24} fill="#fff6e6" {...ink(3.5)} />)}
      <path d="M-90 -260 Q0 -420 90 -260 Z" fill={GOLD} {...ink(5)} />
      <g transform="translate(0 -360)">
        <line x1={0} y1={0} x2={0} y2={-56} stroke={INK} strokeWidth={4} />
        <g transform="translate(2 -56)"><g className="story-flag"><path d="M0 0 L48 9 L0 22 Z" fill="#e5483a" stroke={INK} strokeWidth={3} /></g></g>
      </g>
      {[-60, 0, 60].map((x) => <rect key={x} x={x - 16} y={-200} width={32} height={50} rx={16} fill={burning ? '#ffb347' : '#8fc6e8'} {...ink(3)} />)}
      <path d="M-40 0 L-40 -90 Q0 -130 40 -90 L40 0 Z" fill="#7a4a24" {...ink(4)} />
      {burning ? (
        <g pointerEvents="none">
          {[[-120, -420], [40, -470], [160, -400]].map(([x, y], i) => (
            <g key={i} transform={`translate(${x} ${y})`}><g className="story-smoke" style={{ animationDelay: `${i * 0.4}s` }}><circle r={44} fill="#6b6460" opacity={0.7} /></g></g>
          ))}
          {flames.map(([x, y, s], i) => <g key={i} transform={`translate(${x} ${y})`}><Flame s={s} delay={i * 0.07} /></g>)}
        </g>
      ) : null}
      {wet ? (
        <g pointerEvents="none">
          {[[-170, -300], [-60, -240], [60, -250], [170, -300], [0, -340]].map(([x, y], i) => (
            <g key={i} transform={`translate(${x} ${y})`}><g className="story-drip" style={{ animationDelay: `${i * 0.25}s` }}><path d="M0 -12 Q10 2 0 10 Q-10 2 0 -12 Z" fill="#7ac7f0" stroke={INK} strokeWidth={2} /></g></g>
          ))}
          {[[-100, -440], [80, -470]].map(([x, y], i) => (
            <g key={i} transform={`translate(${x} ${y})`}><g className="story-smoke" style={{ animationDelay: `${i * 0.6}s` }}><circle r={40} fill="#f2f6fa" opacity={0.8} /></g></g>
          ))}
        </g>
      ) : null}
    </g>
  );
}

/** A teacup-sized bucket of water. */
export function Bucket({ splash = false }: { splash?: boolean }) {
  return (
    <g>
      <path d="M-22 -36 Q0 -60 22 -36" fill="none" stroke={INK} strokeWidth={3} />
      <path d="M-24 -36 L24 -36 L18 0 L-18 0 Z" fill="#c7d0d6" {...ink(3)} />
      <ellipse cx={0} cy={-36} rx={24} ry={6} fill="#7ac7f0" {...ink(2.5)} />
      {splash ? <path d="M10 -44 Q40 -90 70 -70 M0 -46 Q24 -110 56 -100" fill="none" stroke="#7ac7f0" strokeWidth={6} strokeLinecap="round" /> : null}
    </g>
  );
}

/**
 * Gulliver's tricorn hat. Origin at the brim centre. With `water` it is turned
 * upside down like a bucket, full of lake water to the brim.
 */
export function Tricorn({ water = false }: { water?: boolean }) {
  const hat = (
    <g>
      <path d="M-170 -8 Q-90 -34 0 8 Q90 -34 170 -8 Q150 -112 0 -132 Q-150 -112 -170 -8 Z" fill="#2a2440" {...ink(6)} />
      <path d="M-170 -8 Q-90 -34 0 8 Q90 -34 170 -8" fill="none" stroke={GOLD} strokeWidth={8} />
      <path d="M-120 -70 Q0 -100 120 -70" fill="none" stroke="#3d355c" strokeWidth={10} />
      <circle cx={-96} cy={-40} r={16} fill="#e5483a" {...ink(3)} />
    </g>
  );
  return water ? (
    <g>
      <g transform="scale(1 -1)">{hat}</g>
      <ellipse cx={0} cy={-4} rx={160} ry={24} fill="#7ac7f0" {...ink(4)} />
      <path d="M-90 -10 Q-50 -20 -10 -12" stroke="#ffffff" strokeWidth={5} fill="none" strokeLinecap="round" />
    </g>
  ) : hat;
}

/** Gulliver swimming: head and arms above the water line at y = 0. */
export function Swimmer({ tired = false }: { tired?: boolean }) {
  return (
    <g>
      <ellipse cx={0} cy={4} rx={190} ry={20} fill="#ffffff" opacity={0.55} />
      {[-1, 1].map((d) => (
        <g key={d} transform={`scale(${d} 1)`}>
          <path d="M-50 -16 Q-120 -54 -170 -28" stroke={INK} strokeWidth={54} strokeLinecap="round" fill="none" />
          <path d="M-50 -16 Q-120 -54 -170 -28" stroke={COAT} strokeWidth={42} strokeLinecap="round" fill="none" />
          <circle cx={-184} cy={-24} r={24} fill={SKIN} {...ink(4)} />
        </g>
      ))}
      <g transform="translate(0 -78) scale(0.52)"><GiantHead eyes={tired ? 'closed' : 'wide'} mouth="o" /></g>
      <path d="M-110 2 q14 -14 28 0 t28 0 t28 0 t28 0 t28 0 t28 0 t28 0 t28 0 L110 30 L-110 30 Z" fill="#2a5f86" />
      <path d="M-110 2 q14 -14 28 0 t28 0 t28 0 t28 0 t28 0 t28 0 t28 0 t28 0" fill="none" stroke="#e8f8ff" strokeWidth={5} />
      {[[-140, -60], [130, -70], [-30, -150]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={8} fill="#bfe8ff" stroke={INK} strokeWidth={2} className="story-twinkle" style={{ animationDelay: `${i * 0.3}s` }} />
      ))}
    </g>
  );
}

/** A big curling storm wave. Origin at its base centre. */
export function BigWave({ color = '#2a5f86' }: { color?: string }) {
  return (
    <g>
      <path d="M-220 0 Q-180 -170 0 -180 Q130 -182 166 -96 Q126 -136 70 -116 Q22 -96 44 -44 Q86 -40 100 -64 Q130 0 220 0 Z" fill={color} {...ink(5)} />
      <path d="M-160 -90 Q-110 -150 0 -160 Q100 -164 140 -112" fill="none" stroke="#e8f8ff" strokeWidth={10} strokeLinecap="round" />
      {[[150, -110], [176, -84], [130, -130]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={10 - i * 2} fill="#e8f8ff" />)}
    </g>
  );
}

/** A long low wagon with many little wheels. Origin on the ground at its middle. */
export function Wagon({ rolling = false }: { rolling?: boolean }) {
  return (
    <g>
      <rect x={-680} y={-96} width={1360} height={50} rx={10} fill="url(#st-wood)" {...ink(5)} />
      <path d="M-660 -72 L660 -72" stroke="#8a5a2c" strokeWidth={4} />
      <path d="M-680 -76 L-820 -60" stroke="#8a5a2c" strokeWidth={14} strokeLinecap="round" />
      {Array.from({ length: 14 }, (_, i) => (
        <g key={i} transform={`translate(${-630 + i * 97} -28)`}>
          <g className={rolling ? 'story-spin' : undefined}>
            <circle r={28} fill="#c48a4e" {...ink(4)} />
            <path d="M-26 0 L26 0 M0 -26 L0 26" stroke="#7a4a24" strokeWidth={4} />
          </g>
        </g>
      ))}
    </g>
  );
}

export function Ladder({ h = 300 }: { h?: number }) {
  return (
    <g>
      <rect x={-26} y={-h} width={9} height={h} fill="url(#st-wood)" {...ink(2.5)} />
      <rect x={17} y={-h} width={9} height={h} fill="url(#st-wood)" {...ink(2.5)} />
      {Array.from({ length: Math.floor(h / 30) }, (_, i) => <rect key={i} x={-20} y={-24 - i * 30} width={40} height={6} fill="#c48a4e" {...ink(2)} />)}
    </g>
  );
}

export function Loaf() {
  return (
    <g>
      <ellipse cx={0} cy={0} rx={22} ry={14} fill="#d9a05b" {...ink(3)} />
      <path d="M-10 -8 L-6 4 M2 -10 L6 2 M12 -6 L14 4" stroke="#a46f3c" strokeWidth={3} strokeLinecap="round" />
    </g>
  );
}

export function Barrel({ milk = true }: { milk?: boolean }) {
  return (
    <g>
      <path d="M-34 -84 Q-46 -42 -34 0 L34 0 Q46 -42 34 -84 Z" fill="url(#st-wood)" {...ink(4)} />
      <path d="M-40 -64 Q0 -58 40 -64 M-40 -20 Q0 -14 40 -20" fill="none" stroke="#5a3c24" strokeWidth={6} />
      <ellipse cx={0} cy={-84} rx={34} ry={10} fill={milk ? '#ffffff' : '#8a5a2c'} {...ink(3.5)} />
    </g>
  );
}

/** The giant's silver snuff box, open, with a cloud of brown dust. */
export function SnuffBox({ open = true, dust = false }: { open?: boolean; dust?: boolean }) {
  return (
    <g>
      {open ? (
        <g>
          <path d="M-120 -80 L-110 -170 L110 -170 L120 -80 Z" fill="#c7d0d6" {...ink(5)} />
          <path d="M-90 -150 Q0 -170 90 -150" fill="none" stroke="#e8eef2" strokeWidth={8} />
        </g>
      ) : null}
      <path d="M-130 -80 L130 -80 L124 0 L-124 0 Z" fill="#dfe6eb" {...ink(5)} />
      <path d="M-124 -40 L124 -40" stroke="#aeb8bf" strokeWidth={4} />
      <circle cx={0} cy={-40} r={16} fill="#aeb8bf" {...ink(3)} />
      <path d="M-100 -20 L-80 -60 M90 -60 L110 -20" stroke="#ffffff" strokeWidth={6} strokeLinecap="round" opacity={0.7} />
      {open ? <ellipse cx={0} cy={-80} rx={116} ry={14} fill="#8a5a2c" {...ink(3)} /> : null}
      {dust ? (
        <g pointerEvents="none">
          {[[-60, -150, 46], [30, -190, 60], [100, -140, 40], [-10, -240, 50]].map(([x, y, r], i) => (
            <g key={i} transform={`translate(${x} ${y})`}><g className="story-smoke" style={{ animationDelay: `${i * 0.3}s` }}><circle r={r} fill="#b0855a" opacity={0.75} /></g></g>
          ))}
        </g>
      ) : null}
    </g>
  );
}

/** The giant's pocket watch standing on its edge; the hands keep turning. */
export function PocketWatch() {
  return (
    <g>
      <path d="M0 -224 Q-60 -260 -90 -230 Q-110 -200 -150 -210" fill="none" stroke={GOLD} strokeWidth={7} strokeDasharray="12 6" />
      <circle cx={0} cy={-226} r={18} fill="none" stroke={GOLD} strokeWidth={8} />
      <circle cx={0} cy={-110} r={110} fill={GOLD} {...ink(6)} />
      <circle cx={0} cy={-110} r={88} fill="#fffaf0" {...ink(4)} />
      {Array.from({ length: 12 }, (_, i) => (
        <rect key={i} x={-3} y={-196} width={6} height={i % 3 ? 10 : 18} fill={INK} transform={`rotate(${i * 30} 0 -110)`} />
      ))}
      <g transform="translate(0 -110)">
        <g className="story-spin">
          <line x1={0} y1={0} x2={0} y2={-70} stroke={INK} strokeWidth={6} strokeLinecap="round" />
          <line x1={0} y1={0} x2={0} y2={70} stroke="transparent" strokeWidth={6} />
        </g>
      </g>
      <path d="M0 -110 L40 -130" stroke={INK} strokeWidth={8} strokeLinecap="round" />
      <circle cx={0} cy={-110} r={8} fill={INK} />
    </g>
  );
}

/**
 * An egg in a little cup. Lilliput keeps the small end up; `bigEndUp` turns it
 * the Blefuscu way. `cracked` lifts the top off.
 */
export function Egg({ bigEndUp = false, cracked = false }: { bigEndUp?: boolean; cracked?: boolean }) {
  const shell = 'M0 -150 C46 -150 74 -76 74 -40 C74 0 42 20 0 20 C-42 20 -74 0 -74 -40 C-74 -76 -46 -150 0 -150 Z';
  return (
    <g>
      <path d="M-56 0 L56 0 L44 40 L-44 40 Z M-30 40 L30 40 L40 60 L-40 60 Z" fill={GOLD} {...ink(4)} transform="translate(0 -40)" />
      <g transform="translate(0 -60)">
        <g transform={bigEndUp ? 'translate(0 -110) scale(1 -1) translate(0 20)' : undefined}>
          <path d={shell} fill="#fff8ec" {...ink(5)} />
          <path d="M-40 -100 Q-54 -60 -50 -30" fill="none" stroke="#ffffff" strokeWidth={10} strokeLinecap="round" />
        </g>
      </g>
      {cracked ? (
        <g transform={`translate(0 ${bigEndUp ? -186 : -174})`}>
          <path d="M-46 0 L-30 -12 L-14 4 L2 -14 L18 4 L34 -12 L48 0" fill="none" stroke={INK} strokeWidth={5} strokeLinejoin="round" />
          <ellipse cx={0} cy={4} rx={28} ry={8} fill="#ffcf3f" {...ink(3)} />
          <g transform="translate(20 -70) rotate(24)">
            <path d={bigEndUp ? 'M-50 30 Q-50 -26 0 -30 Q50 -26 50 30 Z' : 'M-34 30 Q-30 -40 0 -44 Q30 -40 34 30 Z'} fill="#fff8ec" {...ink(4)} />
          </g>
        </g>
      ) : null}
    </g>
  );
}

/** One iron hook with a ring for the rope. */
export function Hook() {
  return (
    <g>
      <circle cx={0} cy={-110} r={14} fill="none" stroke={INK} strokeWidth={11} />
      <circle cx={0} cy={-110} r={14} fill="none" stroke="#aeb8bf" strokeWidth={6} />
      <path d="M0 -96 L0 -30 Q0 0 -30 0 Q-56 0 -56 -30 L-48 -40" fill="none" stroke={INK} strokeWidth={15} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M0 -96 L0 -30 Q0 0 -30 0 Q-56 0 -56 -30 L-48 -40" fill="none" stroke="#aeb8bf" strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
}

/** A coil of rope. */
export function RopeCoil() {
  return (
    <g>
      {[0, 1, 2].map((i) => <ellipse key={i} cx={0} cy={-i * 10} rx={56 - i * 4} ry={24} fill="none" stroke={INK} strokeWidth={11} />)}
      {[0, 1, 2].map((i) => <ellipse key={i} cx={0} cy={-i * 10} rx={56 - i * 4} ry={24} fill="none" stroke="#e2c48a" strokeWidth={6} />)}
    </g>
  );
}

/** A small Blefuscu warship. */
export function WarShip() {
  return <Ship stripe="#2f6fb0" />;
}

/** An island kingdom for the map: a hill, a castle and its flag. */
export function Kingdom({ flag, roof, name }: { flag: string; roof: string; name: string }) {
  return (
    <g>
      <path d="M-300 0 Q-220 -170 0 -180 Q220 -170 300 0 Z" fill="url(#st-grass-far)" {...ink(5)} />
      <ellipse cx={0} cy={0} rx={320} ry={22} fill="url(#st-sand)" {...ink(4)} />
      <g transform="translate(0 -150) scale(0.42)"><TinyCity flag={flag} /></g>
      <g transform={`translate(-150 -60) scale(0.5)`}><Tower x={0} h={120} roof={roof} /></g>
      <g transform="translate(0 70)">
        <rect x={-110} y={-30} width={220} height={52} rx={26} fill="#fffaf0" {...ink(4)} />
        <text x={0} y={8} textAnchor="middle" fontSize={30} fontWeight={900} fill={flag}>{name}</text>
      </g>
    </g>
  );
}

/** A plain cartoon cow. */
export function Cow() {
  return (
    <g>
      <ellipse cx={0} cy={2} rx={70} ry={8} fill="#000000" opacity={0.16} />
      {[-44, -26, 26, 44].map((x) => <rect key={x} x={x - 7} y={-40} width={14} height={40} rx={6} fill="#fbf7ef" {...ink(3)} />)}
      <ellipse cx={0} cy={-56} rx={66} ry={34} fill="#fbf7ef" {...ink(4)} />
      <path d="M-30 -84 Q-6 -70 -20 -46 Q-40 -50 -42 -70 Z M20 -40 Q30 -60 50 -56 Q52 -36 36 -26 Z" fill={INK} />
      <ellipse cx={74} cy={-74} rx={26} ry={24} fill="#fbf7ef" {...ink(4)} />
      <ellipse cx={86} cy={-60} rx={18} ry={12} fill="#f6a8b6" {...ink(3)} />
      <path d="M58 -94 Q50 -112 60 -116 M88 -94 Q96 -112 86 -116" fill="none" stroke="#e8dcc4" strokeWidth={6} strokeLinecap="round" />
      <g className="story-blink"><circle cx={70} cy={-78} r={4} fill={INK} /></g>
      <path d="M-66 -60 Q-86 -40 -78 -20" fill="none" stroke={INK} strokeWidth={4} strokeLinecap="round" />
    </g>
  );
}

/** Gulliver's boat, his own size: about 760 long. `dirt` (0-1) is mud, weed and barnacles; `sail` raises the mast. */
export function Rowboat({ dirt = 0, sail = false }: { dirt?: number; sail?: boolean }) {
  return (
    <g>
      {sail ? (
        <g>
          <rect x={-8} y={-520} width={16} height={460} fill="url(#st-wood-dark)" {...ink(3)} />
          <path d="M14 -500 Q200 -380 170 -110 L14 -110 Z" fill="url(#st-sail)" {...ink(5)} />
          <path d="M8 -520 L60 -506 L8 -490 Z" fill="#c23b2e" {...ink(3)} className="story-flag" />
        </g>
      ) : null}
      <path d="M-380 -170 L380 -170 Q350 -20 240 0 L-240 0 Q-350 -20 -380 -170 Z" fill="url(#st-wood)" {...ink(6)} />
      <path d="M-372 -130 Q0 -110 372 -130 M-350 -80 Q0 -60 350 -80 M-300 -36 Q0 -20 300 -36" fill="none" stroke="#7a4a24" strokeWidth={4} />
      <path d="M-388 -172 L388 -172" stroke="#5c3a1c" strokeWidth={14} strokeLinecap="round" />
      <g style={{ opacity: dirt, transition: 'opacity .4s ease' }} pointerEvents="none">
        {[[-260, -110, 40], [-120, -60, 50], [60, -120, 36], [200, -70, 46], [300, -130, 26]].map(([x, y, r], i) => (
          <ellipse key={i} cx={x} cy={y} rx={r} ry={r * 0.6} fill="#6b5a3a" opacity={0.85} />
        ))}
        {[[-200, -40], [-40, -30], [140, -26], [260, -40]].map(([x, y], i) => (
          <path key={i} d={`M${x} ${y} q-10 -30 6 -50 q-4 24 10 34`} fill="#4f8a3a" stroke={INK} strokeWidth={2} />
        ))}
        {[[-320, -150], [-90, -150], [120, -40], [320, -150]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={10} fill="#d8d2c4" stroke={INK} strokeWidth={2} />)}
        <path d="M-60 -170 L-30 -120 L-50 -90" fill="none" stroke={INK} strokeWidth={5} />
      </g>
    </g>
  );
}
