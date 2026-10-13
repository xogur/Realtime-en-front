'use client';

import type { ReactNode } from 'react';

import { INK, Person, type PersonProps } from './parts';

/*
 * People and props for "Crime and Punishment". The city is Dostoevsky's hot,
 * yellow Saint Petersburg: ochre walls, dark stairwells and low attic rooms.
 * Everything stays a picture-book cartoon; the crime itself is never drawn.
 */

const ink = (width = 4) => ({ stroke: INK, strokeWidth: width, strokeLinejoin: 'round' as const });

export const RODION = { tunic: '#5b5049', hair: '#2b2118', trim: '#8a7a62' } satisfies PersonProps;
export const PAWNBROKER = { tunic: '#6b5a4a', dress: true, hair: '#d8d2c8', trim: '#3b2f27' } satisfies PersonProps;
export const LIZAVETA = { tunic: '#a8875e', dress: true, hair: '#c79a5a', trim: '#efe2c4' } satisfies PersonProps;
export const MARMELADOV = { tunic: '#55603f', hair: '#9a9a9a', beard: '#b4b0a4', trim: '#7d8560' } satisfies PersonProps;
export const SONYA = { tunic: '#c9b89a', hood: '#4f8a4a', trim: '#e7dcc4' } satisfies PersonProps;
export const DUNYA = { tunic: '#7a4b6a', dress: true, hair: '#3b2a1c', long: true, trim: '#e8c9d8' } satisfies PersonProps;
export const LUZHIN = { tunic: '#2e3440', hair: '#6b5138', trim: '#c9b48a' } satisfies PersonProps;
export const PORFIRY = { tunic: '#6a7a8a', hair: '#c9b48a', trim: '#d9c27a' } satisfies PersonProps;
export const RAZUMIKHIN = { tunic: '#8a3b2e', hair: '#c2702e', trim: '#e8c07a' } satisfies PersonProps;
export const OFFICER = { tunic: '#2f4a6b', hair: '#3b2a1c', trim: '#d9b23c' } satisfies PersonProps;
export const PAINTER = { tunic: '#e8e2d6', hair: '#8a5428', trim: '#4f8ad0' } satisfies PersonProps;
export const LANDLADY = { tunic: '#a35a3a', dress: true, hair: '#5a3a22', trim: '#f0d9b5' } satisfies PersonProps;
export const WIDOW = { tunic: '#5a5a6a', dress: true, hair: '#7a4a2a', long: true, trim: '#c9c2b8' } satisfies PersonProps;
export const DOCTOR = { tunic: '#2b2b33', hair: '#d8d2c8', beard: '#e4e0d8', trim: '#ffffff' } satisfies PersonProps;
export const PRISONER = { tunic: '#7d7a72', hair: '#4a3f36', trim: '#a8a296' } satisfies PersonProps;
export const TOWNSFOLK: readonly PersonProps[] = [
  { tunic: '#8a6d4a', hair: '#6b5138', trim: '#c9b48a' },
  { tunic: '#b8546a', dress: true, hair: '#5a3a22', trim: '#fbeede' },
  { tunic: '#41658f', hair: '#2b2118', trim: '#e7dcc4' },
  { tunic: '#6f8a4a', dress: true, hair: '#c79a5a', trim: '#f2e6c8' },
  { tunic: '#7a5a8a', hair: '#3b2a1c', beard: '#4a3a2c', trim: '#d9c27a' },
];

/** A boxy cap for officers and clerks, drawn on top of a Person's head. */
export function Cap({ color = '#2f4a6b' }: { color?: string }) {
  return (
    <g>
      <path d="M-34 -206 Q-34 -236 0 -238 Q34 -236 34 -206 Z" fill={color} {...ink(3.5)} />
      <path d="M-38 -206 L38 -206 L44 -198 L-30 -198 Z" fill="#1f2a38" {...ink(3)} />
      <circle cx={0} cy={-222} r={5} fill="#d9b23c" />
    </g>
  );
}

/** A tall stiff hat for the proud Luzhin. */
export function TopHat() {
  return (
    <g>
      <rect x={-24} y={-280} width={48} height={64} rx={4} fill="#1f2228" {...ink(3.5)} />
      <path d="M-42 -214 L42 -214 L36 -206 L-36 -206 Z" fill="#1f2228" {...ink(3)} />
      <rect x={-24} y={-232} width={48} height={8} fill="#7a2e24" />
    </g>
  );
}

/** A row of Saint Petersburg houses: yellow plaster, tall windows, tin roofs. */
export function Facades({ dark = false, lit = false }: { dark?: boolean; lit?: boolean }) {
  const walls = dark ? ['#7d6a3a', '#6e5d3a', '#806c44', '#72603c'] : ['#e3c766', '#d9b85a', '#e8cf7a', '#cfae58'];
  return (
    <g>
      {[0, 1, 2, 3].map((i) => {
        const x = -700 + i * 760;
        const h = 520 + (i % 2) * 90;
        return (
          <g key={i} transform={`translate(${x} 760)`}>
            <rect x={0} y={-h} width={740} height={h} fill={walls[i]} {...ink(5)} />
            <path d={`M-10 ${-h} L370 ${-h - 70} L750 ${-h} Z`} fill={dark ? '#4a5560' : '#8a9aa6'} {...ink(4)} />
            <rect x={0} y={-h + 30} width={740} height={10} fill="#ffffff" opacity={0.35} />
            {Array.from({ length: 3 }, (_, row) => Array.from({ length: 5 }, (_, col) => (
              <g key={`${row}-${col}`} transform={`translate(${70 + col * 140} ${-h + 80 + row * 150})`}>
                <rect x={0} y={0} width={70} height={100} rx={6} fill={lit && (row + col + i) % 3 === 0 ? '#ffd27a' : dark ? '#2b3448' : '#6d8fa6'} {...ink(3.5)} />
                <path d="M35 0 L35 100 M0 46 L70 46" stroke={INK} strokeWidth={3} />
                <rect x={-8} y={100} width={86} height={10} fill="#f4ecd6" {...ink(2.5)} />
              </g>
            )))}
            <rect x={320} y={-130} width={100} height={130} rx={8} fill="url(#st-wood-dark)" {...ink(4)} />
          </g>
        );
      })}
    </g>
  );
}

/** Cobbled street from y = 760. */
export function Cobbles({ dark = false }: { dark?: boolean }) {
  return (
    <g>
      <path d="M-800 760 L2400 760 L2400 1500 L-800 1500 Z" fill={dark ? '#4c4a4a' : '#a39a8a'} {...ink(5)} />
      {Array.from({ length: 30 }, (_, i) => (
        <ellipse key={i} cx={-700 + (i * 137) % 3000} cy={800 + (i % 4) * 34} rx={36} ry={10} fill={dark ? '#5d5a58' : '#b9b09e'} stroke={INK} strokeWidth={2} opacity={0.8} />
      ))}
    </g>
  );
}

/** A low attic room with a sloped ceiling and peeling yellow wallpaper; `walls` lets the light change. */
export function Attic({ night = false, children }: { night?: boolean; children?: ReactNode }) {
  return (
    <g>
      <rect x={-800} y={-600} width={3200} height={2100} fill={night ? '#3b3a52' : '#d8bf6c'} />
      {Array.from({ length: 14 }, (_, i) => (
        <path key={i} d={`M${-600 + i * 220} 120 L${-600 + i * 220} 760`} stroke={night ? '#33334a' : '#c4a95a'} strokeWidth={14} opacity={0.6} />
      ))}
      <path d="M140 300 q20 30 0 60 q-24 20 -10 50" fill="none" stroke="#9c8240" strokeWidth={6} opacity={0.6} />
      <path d="M1280 360 q-20 40 6 70" fill="none" stroke="#9c8240" strokeWidth={6} opacity={0.6} />
      <path d="M-800 -600 L2400 -600 L2400 120 L1200 120 L400 260 L-800 260 Z" fill={night ? '#26263a' : '#8a6a3a'} {...ink(5)} />
      <path d="M-800 260 L400 260 L1200 120 L2400 120" fill="none" stroke="#5c3a1c" strokeWidth={18} />
      <g transform="translate(980 170)">
        <rect x={0} y={0} width={150} height={130} rx={6} fill={night ? '#1b2757' : '#bfe3f5'} {...ink(5)} />
        <path d="M75 0 L75 130 M0 65 L150 65" stroke={INK} strokeWidth={4} />
        {night ? <circle cx={40} cy={36} r={12} fill="#fff3c4" /> : <rect x={0} y={0} width={150} height={130} fill="#fff7cf" opacity={0.35} />}
      </g>
      <path d="M-800 760 L2400 760 L2400 1500 L-800 1500 Z" fill="url(#st-wood-dark)" {...ink(5)} />
      {[0, 1, 2, 3].map((i) => <path key={i} d={`M-800 ${800 + i * 60} L2400 ${800 + i * 60}`} stroke="#3e2714" strokeWidth={3} />)}
      {children}
    </g>
  );
}

/** A sagging old sofa that is also Rodion's bed. */
export function OldSofa({ blanket = false }: { blanket?: boolean }) {
  return (
    <g>
      <rect x={-210} y={-150} width={420} height={70} rx={20} fill="#7a6a4a" {...ink(4)} />
      <path d="M-230 -80 Q0 -60 230 -80 L230 0 L-230 0 Z" fill="#8a7a56" {...ink(4)} />
      <rect x={-250} y={-120} width={50} height={120} rx={18} fill="#6b5b3e" {...ink(4)} />
      <rect x={200} y={-120} width={50} height={120} rx={18} fill="#6b5b3e" {...ink(4)} />
      <path d="M-120 -96 l20 10 M60 -90 l18 -8" stroke="#4e4230" strokeWidth={4} />
      {blanket ? <path d="M-170 -96 Q0 -130 170 -96 L180 -40 Q0 -20 -180 -40 Z" fill="#b8546a" {...ink(4)} /> : null}
    </g>
  );
}

/** The pawnbroker's iron-bound money box. */
export function StrongBox({ open = false }: { open?: boolean }) {
  return (
    <g>
      <rect x={-70} y={-80} width={140} height={80} rx={6} fill="#6b4423" {...ink(4)} />
      <path d={open ? 'M-70 -80 L-60 -140 L80 -140 L70 -80 Z' : 'M-74 -80 Q0 -112 74 -80 Z'} fill="#7a4a24" {...ink(4)} />
      <path d="M-50 -80 L-50 0 M50 -80 L50 0" stroke="#3a3a3a" strokeWidth={8} />
      <rect x={-14} y={-60} width={28} height={30} rx={4} fill="#d9a441" {...ink(3)} />
      <circle cx={0} cy={-48} r={4} fill={INK} />
    </g>
  );
}

/** Father's silver pocket watch. */
export function SilverWatch({ s = 1 }: { s?: number }) {
  return (
    <g transform={`scale(${s})`}>
      <path d="M0 -60 Q-30 -80 -60 -66" fill="none" stroke="#c7d0d6" strokeWidth={5} strokeDasharray="8 5" />
      <circle cx={0} cy={-62} r={9} fill="none" stroke="#c7d0d6" strokeWidth={5} />
      <circle cx={0} cy={0} r={50} fill="#c7d0d6" {...ink(4)} />
      <circle cx={0} cy={0} r={38} fill="#fbfbf6" {...ink(3)} />
      {Array.from({ length: 12 }, (_, i) => <rect key={i} x={-2} y={-36} width={4} height={i % 3 ? 5 : 9} fill={INK} transform={`rotate(${i * 30})`} />)}
      <path d="M0 0 L0 -26 M0 0 L18 8" stroke={INK} strokeWidth={4} strokeLinecap="round" />
      <path d="M-30 -24 Q-20 -36 -6 -40" fill="none" stroke="#ffffff" strokeWidth={4} opacity={0.8} />
    </g>
  );
}

/** A few copper coins. */
export function Coins({ n = 3 }: { n?: number }) {
  return (
    <g>
      {Array.from({ length: n }, (_, i) => (
        <g key={i} transform={`translate(${(i - (n - 1) / 2) * 34} ${-(i % 2) * 10})`}>
          <ellipse cx={0} cy={0} rx={18} ry={8} fill="#b8732e" {...ink(2.5)} />
          <ellipse cx={0} cy={-5} rx={18} ry={8} fill="#e0a050" {...ink(2.5)} />
          <ellipse cx={-4} cy={-7} rx={6} ry={2} fill="#ffe0a0" />
        </g>
      ))}
    </g>
  );
}

/** A thin purse tied with a string. */
export function Purse() {
  return (
    <g>
      <path d="M-34 0 Q-44 -50 -10 -56 L10 -56 Q44 -50 34 0 Z" fill="#7a4a24" {...ink(3.5)} />
      <path d="M-14 -56 Q0 -66 14 -56" fill="none" stroke="#d9a441" strokeWidth={5} />
    </g>
  );
}

/** A letter in a pale envelope; `open` shows the written page. */
export function Letter({ open = true }: { open?: boolean }) {
  return open ? (
    <g>
      <rect x={-56} y={-74} width={112} height={140} rx={4} fill="#fffaf0" {...ink(3.5)} transform="rotate(-6)" />
      {[-50, -30, -10, 10, 30].map((y) => <path key={y} d={`M-40 ${y} q20 -5 40 0 q20 5 36 0`} fill="none" stroke="#6d8fa6" strokeWidth={3} transform="rotate(-6)" />)}
    </g>
  ) : (
    <g>
      <rect x={-60} y={-40} width={120} height={80} rx={4} fill="#f4ecd6" {...ink(3.5)} />
      <path d="M-60 -40 L0 6 L60 -40" fill="none" {...ink(3)} />
      <circle cx={0} cy={6} r={10} fill="#c23b2e" {...ink(2)} />
    </g>
  );
}

/** A wall clock; `hour` turns the short hand (seven o'clock by default). */
export function WallClock({ hour = 7 }: { hour?: number }) {
  return (
    <g>
      <circle cx={0} cy={0} r={90} fill="url(#st-wood)" {...ink(5)} />
      <circle cx={0} cy={0} r={72} fill="#fffaf0" {...ink(3)} />
      {Array.from({ length: 12 }, (_, i) => <rect key={i} x={-3} y={-68} width={6} height={i % 3 ? 8 : 16} fill={INK} transform={`rotate(${i * 30})`} />)}
      <path d="M0 0 L0 -56" stroke={INK} strokeWidth={6} strokeLinecap="round" />
      <path d="M0 0 L0 -38" stroke="#c23b2e" strokeWidth={9} strokeLinecap="round" transform={`rotate(${hour * 30})`} />
      <circle cx={0} cy={0} r={8} fill={INK} />
      <text x={0} y={-30} textAnchor="middle" fontSize={20} fontWeight={900} fill={INK}>XII</text>
      <text x={0} y={52} textAnchor="middle" fontSize={20} fontWeight={900} fill={INK}>VI</text>
    </g>
  );
}

/** A beating heart drawn beside a nervous character. */
export function Heartbeat({ on }: { on: boolean }) {
  return on ? (
    <g pointerEvents="none">
      <g className="story-pulse">
        <path d="M0 18 C-40 -14 -28 -52 0 -32 C28 -52 40 -14 0 18 Z" fill="#e5483a" {...ink(3.5)} />
      </g>
      <path d="M-70 -10 L-46 -10 L-38 -30 L-28 10 L-20 -10 L-6 -10" fill="none" stroke="#ffffff" strokeWidth={5} strokeLinecap="round" opacity={0.85} />
    </g>
  ) : null;
}

/** A doorway with a little bell; `open` swings the door aside. */
export function Doorway({ open = false, dark = false, bell = true, children }: { open?: boolean; dark?: boolean; bell?: boolean; children?: ReactNode }) {
  return (
    <g>
      <rect x={-110} y={-330} width={220} height={330} fill={dark ? '#120d0a' : '#3a2416'} {...ink(5)} />
      {children}
      <g style={{ transform: `scaleX(${open ? 0.18 : 1})`, transformOrigin: '-110px 0px', transition: 'transform .7s ease' }}>
        <rect x={-110} y={-330} width={220} height={330} fill="url(#st-wood)" {...ink(5)} />
        <rect x={-80} y={-300} width={160} height={120} rx={6} fill="none" stroke="#7a4a24" strokeWidth={5} />
        <rect x={-80} y={-150} width={160} height={120} rx={6} fill="none" stroke="#7a4a24" strokeWidth={5} />
        <circle cx={80} cy={-160} r={10} fill="#d9a441" {...ink(3)} />
      </g>
      <rect x={-124} y={-344} width={248} height={18} fill="#5c3a1c" {...ink(4)} />
      {bell ? <g transform="translate(150 -250)"><DoorBell /></g> : null}
    </g>
  );
}

export function DoorBell({ ringing = false }: { ringing?: boolean }) {
  return (
    <g>
      <path d="M0 -40 L0 -10" stroke={INK} strokeWidth={3} />
      <g className={ringing ? 'story-bell' : undefined}>
        <path d="M-18 14 Q-18 -14 0 -14 Q18 -14 18 14 Z" fill="url(#st-bronze)" {...ink(3)} />
        <circle cx={0} cy={18} r={5} fill={INK} />
      </g>
      {ringing ? (
        <g stroke={INK} strokeWidth={4} strokeLinecap="round" fill="none">
          <path d="M-34 -6 q-10 10 0 22 M34 -6 q10 10 0 22" />
          <path d="M-48 -14 q-16 18 0 38 M48 -14 q16 18 0 38" opacity={0.6} />
        </g>
      ) : null}
    </g>
  );
}

/** A dark stairwell: steps climbing to the right, a smudged wall and a small high window. */
export function Stairwell({ children }: { children?: ReactNode }) {
  return (
    <g>
      <rect x={-800} y={-600} width={3200} height={2100} fill="#5a4c3a" />
      <rect x={-800} y={-600} width={3200} height={2100} fill="#1a120c" opacity={0.35} />
      <g transform="translate(1080 150)">
        <rect x={0} y={0} width={90} height={120} fill="#c9d6dc" {...ink(4)} />
        <path d="M45 0 L45 120" stroke={INK} strokeWidth={3} />
      </g>
      <path d="M1125 270 L760 900 L1500 900 L1170 270 Z" fill="#fff4c8" opacity={0.12} />
      {Array.from({ length: 9 }, (_, i) => (
        <g key={i}>
          <rect x={200 + i * 110} y={820 - i * 70} width={110} height={70 + i * 70} fill={i % 2 ? '#6b5a44' : '#76644c'} {...ink(4)} />
          <rect x={200 + i * 110} y={820 - i * 70} width={110} height={12} fill="#8a7658" />
        </g>
      ))}
      <path d="M200 690 L1190 60" stroke="url(#st-wood-dark)" strokeWidth={16} strokeLinecap="round" />
      {Array.from({ length: 9 }, (_, i) => <path key={i} d={`M${250 + i * 110} ${660 - i * 70} L${250 + i * 110} ${790 - i * 70}`} stroke="#3e2714" strokeWidth={6} />)}
      <path d="M-800 820 L200 820 L200 1500 L-800 1500 Z" fill="#4a3d2e" {...ink(4)} />
      {children}
    </g>
  );
}

/** The tavern bar: counter, bottles, a lamp and a hanging sign. */
export function TavernBar() {
  return (
    <g>
      <rect x={-800} y={-600} width={3200} height={2100} fill="#4a3324" />
      {Array.from({ length: 12 }, (_, i) => <rect key={i} x={-800 + i * 280} y={-600} width={20} height={1400} fill="#3a281b" />)}
      <g transform="translate(1180 520)">
        <rect x={-260} y={-380} width={520} height={18} fill="#2e1f14" {...ink(3)} />
        <rect x={-260} y={-250} width={520} height={18} fill="#2e1f14" {...ink(3)} />
        {Array.from({ length: 8 }, (_, i) => (
          <g key={i} transform={`translate(${-220 + i * 62} ${i % 2 ? -250 : -380})`}>
            <rect x={-12} y={-70} width={24} height={70} rx={8} fill={['#4f7a3a', '#8a3b2e', '#d9a441', '#3e5f8a'][i % 4]} {...ink(3)} />
            <rect x={-6} y={-90} width={12} height={22} fill={['#4f7a3a', '#8a3b2e', '#d9a441', '#3e5f8a'][i % 4]} {...ink(2.5)} />
          </g>
        ))}
        <rect x={-300} y={-60} width={600} height={40} rx={6} fill="url(#st-wood)" {...ink(4)} />
        <rect x={-280} y={-20} width={560} height={300} fill="url(#st-wood-dark)" {...ink(4)} />
      </g>
      <path d="M-800 760 L2400 760 L2400 1500 L-800 1500 Z" fill="#3a2a1e" {...ink(5)} />
    </g>
  );
}

/** A plain wooden table seen from the front, top at y = -110. */
export function Table({ w = 360, children }: { w?: number; children?: ReactNode }) {
  return (
    <g>
      <rect x={-w / 2} y={-110} width={w} height={22} rx={5} fill="url(#st-wood)" {...ink(4)} />
      <rect x={-w / 2 + 20} y={-88} width={16} height={88} fill="url(#st-wood-dark)" {...ink(3)} />
      <rect x={w / 2 - 36} y={-88} width={16} height={88} fill="url(#st-wood-dark)" {...ink(3)} />
      <g transform="translate(0 -110)">{children}</g>
    </g>
  );
}

/** A mug of drink on the table. */
export function Mug() {
  return (
    <g>
      <rect x={-18} y={-44} width={36} height={44} rx={6} fill="#c9b48a" {...ink(3)} />
      <path d="M18 -34 q18 0 18 14 q0 14 -18 12" fill="none" {...ink(4)} />
      <ellipse cx={0} cy={-44} rx={18} ry={6} fill="#f4ecd6" {...ink(2.5)} />
    </g>
  );
}

/** A bare iron bed; `sleeper` lies under the blanket. */
export function Bed({ sleeper, blanket = '#8a9aa6' }: { sleeper?: ReactNode; blanket?: string }) {
  return (
    <g>
      <rect x={-230} y={-200} width={16} height={200} fill="#4a4f58" {...ink(3)} />
      <rect x={214} y={-150} width={16} height={150} fill="#4a4f58" {...ink(3)} />
      <rect x={-230} y={-90} width={460} height={40} fill="#f4ecd6" {...ink(4)} />
      {sleeper}
      <path d="M-120 -110 Q40 -140 220 -96 L224 -54 L-130 -54 Z" fill={blanket} {...ink(4)} />
      <ellipse cx={-170} cy={-104} rx={52} ry={24} fill="#ffffff" {...ink(3.5)} />
    </g>
  );
}

/** A sleeping or sick head on a pillow. */
export function PillowHead({ hair = '#2b2118', hot = false }: { hair?: string; hot?: boolean }) {
  return (
    <g transform="translate(-160 -128)">
      <circle cx={0} cy={0} r={30} fill={hot ? '#f2a38a' : '#f3c79b'} {...ink(3.5)} />
      <path d="M-30 -2 Q-26 -36 4 -32 Q28 -30 30 -8 Q14 -22 -4 -18 Q-20 -18 -30 -2 Z" fill={hair} {...ink(3)} />
      <path d="M-14 4 q6 4 10 0 M6 4 q6 4 10 0" fill="none" stroke={INK} strokeWidth={3} strokeLinecap="round" />
      {hot ? <ellipse cx={0} cy={-6} rx={22} ry={8} fill="#ffffff" {...ink(2.5)} /> : null}
    </g>
  );
}

/** Wavy lines rising from a feverish body. */
export function HeatLines({ on }: { on: boolean }) {
  return on ? (
    <g pointerEvents="none" stroke="#e5483a" strokeWidth={5} fill="none" strokeLinecap="round" opacity={0.75}>
      {[-40, 0, 40].map((x, i) => (
        <g key={x} transform={`translate(${x} 0)`}>
          <g className="story-float" style={{ animationDelay: `${i * 0.4}s` }}><path d="M0 0 q-10 -16 0 -32 q10 -16 0 -32" /></g>
        </g>
      ))}
    </g>
  ) : null;
}

/** The big flat stone in the quiet yard. */
export function BigStone({ lifted = false }: { lifted?: boolean }) {
  return (
    <g>
      <ellipse cx={0} cy={6} rx={170} ry={20} fill="#000000" opacity={0.2} />
      <g style={{ transform: `rotate(${lifted ? -14 : 0}deg)`, transformOrigin: '150px 0px', transition: 'transform .8s ease' }}>
        <path d="M-160 0 Q-170 -70 -90 -96 Q10 -120 110 -90 Q170 -60 156 0 Z" fill="url(#st-rock)" {...ink(5)} />
        <path d="M-100 -70 Q-40 -96 40 -88" fill="none" stroke="#ffffff" strokeWidth={6} opacity={0.3} />
      </g>
    </g>
  );
}

/** An office desk with papers and an ink pot. */
export function Desk({ w = 420, children }: { w?: number; children?: ReactNode }) {
  return (
    <g>
      <rect x={-w / 2} y={-150} width={w} height={150} fill="url(#st-wood-dark)" {...ink(4)} />
      <rect x={-w / 2 - 14} y={-166} width={w + 28} height={22} rx={4} fill="url(#st-wood)" {...ink(4)} />
      <rect x={-w / 2 + 30} y={-120} width={w - 60} height={30} rx={4} fill="none" stroke="#3e2714" strokeWidth={4} />
      <g transform="translate(0 -166)">{children}</g>
    </g>
  );
}

export function Papers() {
  return (
    <g>
      <rect x={-60} y={-14} width={110} height={14} fill="#fffaf0" {...ink(2.5)} transform="rotate(-4)" />
      <rect x={-50} y={-24} width={110} height={12} fill="#f4ecd6" {...ink(2.5)} transform="rotate(3)" />
      <rect x={70} y={-30} width={26} height={30} rx={4} fill="#2b2b33" {...ink(2.5)} />
      <path d="M84 -30 L104 -76" stroke="#fffaf0" strokeWidth={4} />
    </g>
  );
}

/** A folded journal with Rodion's article. */
export function Journal() {
  return (
    <g>
      <rect x={-80} y={-110} width={160} height={110} rx={4} fill="#f4ecd6" {...ink(4)} />
      <rect x={-64} y={-96} width={128} height={18} fill="#2b2b33" />
      <text x={0} y={-82} textAnchor="middle" fontSize={14} fontWeight={900} fill="#f4ecd6">ON CRIME</text>
      {[-62, -48, -34, -20].map((y) => <path key={y} d={`M-64 ${y} L64 ${y}`} stroke="#9a8f7e" strokeWidth={4} />)}
    </g>
  );
}

/** Napoleon's hat stepping over a fence marked LAW: Rodion's idea of "great people". */
export function GreatManIdea() {
  return (
    <g>
      <g transform="translate(40 0)">
        <rect x={-120} y={-40} width={240} height={14} fill="url(#st-wood)" {...ink(3)} />
        {[-100, -40, 20, 80].map((x) => <rect key={x} x={x} y={-70} width={14} height={80} fill="url(#st-wood)" {...ink(3)} />)}
        <rect x={-60} y={-104} width={120} height={36} rx={6} fill="#fffaf0" {...ink(3)} />
        <text x={0} y={-78} textAnchor="middle" fontSize={26} fontWeight={900} fill={INK}>LAW</text>
      </g>
      <g transform="translate(-120 -40) rotate(-8)">
        <path d="M-70 0 Q0 -70 70 0 Q0 -18 -70 0 Z" fill="#1f2228" {...ink(3.5)} />
        <circle cx={0} cy={-26} r={9} fill="#e5483a" {...ink(2.5)} />
        <path d="M30 6 q30 10 50 -10" fill="none" stroke={INK} strokeWidth={5} strokeLinecap="round" />
      </g>
    </g>
  );
}

/** A cat watching a mouse. */
export function CatAndMouse() {
  return (
    <g>
      <g transform="translate(-60 0)">
        <ellipse cx={0} cy={-40} rx={60} ry={40} fill="#f0a24a" {...ink(3.5)} />
        <circle cx={44} cy={-80} r={34} fill="#f0a24a" {...ink(3.5)} />
        <path d="M22 -106 L28 -132 L44 -110 Z M56 -110 L70 -132 L72 -104 Z" fill="#f0a24a" {...ink(3)} />
        <circle cx={36} cy={-84} r={6} fill="#ffffff" {...ink(2)} /><circle cx={56} cy={-84} r={6} fill="#ffffff" {...ink(2)} />
        <circle cx={38} cy={-84} r={3} fill={INK} /><circle cx={58} cy={-84} r={3} fill={INK} />
        <path d="M40 -66 q6 6 12 0" fill="none" stroke={INK} strokeWidth={3} />
        <path d="M-60 -40 q-40 -20 -30 -60" fill="none" stroke="#f0a24a" strokeWidth={12} strokeLinecap="round" />
      </g>
      <g transform="translate(110 -8)">
        <g className="story-tremble">
          <ellipse cx={0} cy={-14} rx={26} ry={16} fill="#b8b2a8" {...ink(3)} />
          <circle cx={22} cy={-24} r={12} fill="#b8b2a8" {...ink(3)} />
          <circle cx={18} cy={-38} r={8} fill="#f6a8b6" {...ink(2.5)} />
          <circle cx={26} cy={-26} r={2.5} fill={INK} />
          <path d="M-26 -10 q-24 0 -30 -16" fill="none" stroke="#8a8278" strokeWidth={4} strokeLinecap="round" />
        </g>
      </g>
    </g>
  );
}

/** A horse-drawn carriage (side view), wheels on y = 0. */
export function Carriage({ horse }: { horse?: ReactNode }) {
  return (
    <g>
      {horse}
      <rect x={-140} y={-230} width={260} height={150} rx={22} fill="#2b2b33" {...ink(5)} />
      <rect x={-110} y={-210} width={90} height={70} rx={8} fill="#6d8fa6" {...ink(3.5)} />
      <rect x={0} y={-210} width={90} height={70} rx={8} fill="#6d8fa6" {...ink(3.5)} />
      <rect x={-150} y={-90} width={290} height={20} rx={8} fill="#5c3a1c" {...ink(4)} />
      {[-90, 80].map((x) => (
        <g key={x} transform={`translate(${x} -40)`}>
          <circle r={44} fill="none" stroke={INK} strokeWidth={9} />
          <circle r={44} fill="none" stroke="#a5701f" strokeWidth={5} />
          {[0, 45, 90, 135].map((a) => <path key={a} d="M0 -40 L0 40" stroke="#a5701f" strokeWidth={4} transform={`rotate(${a})`} />)}
        </g>
      ))}
    </g>
  );
}

/** A plain wooden cross on a string. */
export function WoodenCross({ s = 1 }: { s?: number }) {
  return (
    <g transform={`scale(${s})`}>
      <path d="M0 -70 Q-26 -96 0 -110 Q26 -96 0 -70" fill="none" stroke="#7a4a24" strokeWidth={3} />
      <rect x={-8} y={-70} width={16} height={70} rx={3} fill="#b07a44" {...ink(3)} />
      <rect x={-26} y={-54} width={52} height={14} rx={3} fill="#b07a44" {...ink(3)} />
    </g>
  );
}

/** A market stall with an awning and a few goods. */
export function Stall({ awning = '#c23b2e' }: { awning?: string }) {
  return (
    <g>
      <rect x={-150} y={-180} width={12} height={180} fill="url(#st-wood-dark)" {...ink(3)} />
      <rect x={138} y={-180} width={12} height={180} fill="url(#st-wood-dark)" {...ink(3)} />
      <path d="M-170 -180 L170 -180 L150 -240 L-150 -240 Z" fill={awning} {...ink(4)} />
      {[-120, -60, 0, 60, 120].map((x, i) => <path key={x} d={`M${x - 30} -180 q30 26 60 0`} fill={i % 2 ? '#fffaf0' : awning} {...ink(3)} />)}
      <rect x={-160} y={-80} width={320} height={80} fill="url(#st-wood)" {...ink(4)} />
      {[-100, -40, 20, 80].map((x, i) => <circle key={x} cx={x} cy={-96} r={20} fill={['#e5483a', '#f3c74d', '#8ab83f', '#f0a24a'][i]} {...ink(3)} />)}
    </g>
  );
}

/** The Neva embankment railing with a bridge arch behind it. */
export function Embankment({ evening = false }: { evening?: boolean }) {
  return (
    <g>
      <path d="M-800 520 Q100 470 900 500 Q1600 470 2400 520 L2400 640 L-800 640 Z" fill={evening ? '#4a5876' : '#9fb4c2'} />
      <path d="M200 560 Q600 360 1000 560" fill="none" stroke={evening ? '#6b5f58' : '#c9b48a'} strokeWidth={40} />
      <path d="M200 560 Q600 360 1000 560" fill="none" stroke={INK} strokeWidth={4} />
      <rect x={-800} y={640} width={3200} height={260} fill={evening ? '#2c4a6a' : '#4f86b0'} />
      {[700, 760, 820].map((y, i) => <path key={y} d={`M-800 ${y} q100 -14 200 0 t200 0 t200 0 t200 0 t200 0 t200 0 t200 0 t200 0 t200 0 t200 0 t200 0 t200 0 t200 0 t200 0 t200 0 t200 0`} fill="none" stroke="#ffffff" strokeWidth={3} opacity={0.25 + i * 0.1} className="story-wave" />)}
      <rect x={-800} y={860} width={3200} height={640} fill="url(#st-stone)" {...ink(5)} />
      <rect x={-800} y={840} width={3200} height={24} fill="#8a9aa6" {...ink(4)} />
      {Array.from({ length: 30 }, (_, i) => <rect key={i} x={-760 + i * 110} y={780} width={14} height={62} fill="#3a3f48" {...ink(2.5)} />)}
      <rect x={-800} y={770} width={3200} height={14} fill="#3a3f48" {...ink(3)} />
    </g>
  );
}

/** A government building front with columns and a sign. */
export function StationHouse({ label = 'POLICE' }: { label?: string }) {
  return (
    <g>
      <rect x={-300} y={-420} width={600} height={420} fill="#e8dcc4" {...ink(5)} />
      <path d="M-330 -420 L0 -520 L330 -420 Z" fill="#c9b48a" {...ink(5)} />
      {[-240, -140, 140, 240].map((x) => <rect key={x} x={x - 18} y={-400} width={36} height={400} fill="url(#st-marble)" {...ink(3)} />)}
      <rect x={-70} y={-220} width={140} height={220} rx={8} fill="url(#st-wood-dark)" {...ink(4)} />
      <rect x={-110} y={-320} width={220} height={56} rx={6} fill="#2f4a6b" {...ink(4)} />
      <text x={0} y={-282} textAnchor="middle" fontSize={34} fontWeight={900} fill="#f4ecd6">{label}</text>
    </g>
  );
}

/** A wooden prison palisade with a gate, snow on the tips. */
export function Palisade({ gateOpen = false }: { gateOpen?: boolean }) {
  return (
    <g>
      {Array.from({ length: 34 }, (_, i) => {
        const x = -800 + i * 100;
        if (x > 700 && x < 900) return null;
        return (
          <g key={i}>
            <path d={`M${x} 760 L${x} 380 L${x + 45} 340 L${x + 90} 380 L${x + 90} 760 Z`} fill={i % 2 ? '#7a5a3a' : '#6b4f33'} {...ink(4)} />
            <path d={`M${x + 4} 384 L${x + 45} 346 L${x + 86} 384 Q${x + 45} 370 ${x + 4} 384 Z`} fill="#ffffff" />
          </g>
        );
      })}
      <g style={{ opacity: gateOpen ? 0.25 : 1, transition: 'opacity .8s ease' }}>
        <rect x={700} y={400} width={200} height={360} fill="url(#st-wood-dark)" {...ink(4)} />
        <path d="M700 520 L900 520 M700 640 L900 640" stroke="#3a3a3a" strokeWidth={10} />
      </g>
    </g>
  );
}

/** A long log barrack with a smoking chimney. */
export function Barrack({ w = 520, label }: { w?: number; label?: string }) {
  return (
    <g>
      <rect x={-w / 2} y={-200} width={w} height={200} fill="#8a6a46" {...ink(5)} />
      {[-160, -120, -80, -40].map((y) => <path key={y} d={`M${-w / 2} ${y} L${w / 2} ${y}`} stroke="#5c3a1c" strokeWidth={4} />)}
      <path d={`M${-w / 2 - 30} -200 L0 -300 L${w / 2 + 30} -200 Z`} fill="#f4f8fb" {...ink(5)} />
      <rect x={w / 4} y={-300} width={40} height={70} fill="#6b5a44" {...ink(3)} />
      <g transform={`translate(${w / 4 + 20} -310)`}><g className="story-smoke"><circle r={18} fill="#d8dde2" opacity={0.8} /></g></g>
      {[-w / 3, 0, w / 3].map((x) => <rect key={x} x={x - 30} y={-150} width={60} height={60} rx={4} fill="#ffd27a" {...ink(3)} />)}
      {label ? (
        <g transform="translate(0 -232)">
          <rect x={-90} y={-24} width={180} height={40} rx={6} fill="#fffaf0" {...ink(3)} />
          <path d="M-10 -14 L10 -14 M0 -24 L0 -4" stroke="#c23b2e" strokeWidth={6} />
          <text x={34} y={4} textAnchor="middle" fontSize={22} fontWeight={900} fill={INK}>{label}</text>
        </g>
      ) : null}
    </g>
  );
}

/** Falling snow over the whole stage. */
export function Snow({ on }: { on: boolean }) {
  return on ? (
    <g pointerEvents="none">
      {Array.from({ length: 26 }, (_, i) => (
        <g key={i} transform={`translate(${-200 + ((i * 173) % 2000)} ${-40 + ((i * 97) % 300)})`}>
          <g className="story-drip" style={{ animationDelay: `${(i % 7) * 0.35}s`, animationDuration: `${2.6 + (i % 4) * 0.5}s` }}>
            <circle r={6 + (i % 3) * 2} fill="#ffffff" opacity={0.9} />
          </g>
        </g>
      ))}
    </g>
  ) : null;
}

/** A fallen log to sit on. */
export function Log() {
  return (
    <g>
      <rect x={-200} y={-50} width={400} height={50} rx={24} fill="#8a5a2c" {...ink(4)} />
      <ellipse cx={200} cy={-25} rx={20} ry={25} fill="#c48a4e" {...ink(3.5)} />
      <ellipse cx={200} cy={-25} rx={9} ry={12} fill="none" stroke="#8a5a2c" strokeWidth={3} />
    </g>
  );
}

/** Small spring flowers. */
export function Flowers({ n = 6, spread = 70 }: { n?: number; spread?: number }) {
  return (
    <g>
      {Array.from({ length: n }, (_, i) => (
        <g key={i} transform={`translate(${(i - (n - 1) / 2) * spread} ${(i % 2) * 14})`}>
          <path d="M0 0 L0 -36" stroke="#4f8a3a" strokeWidth={4} />
          <g className="story-sway" style={{ animationDelay: `${i * 0.3}s` }}>
            {[0, 72, 144, 216, 288].map((a) => <ellipse key={a} cx={0} cy={-48} rx={6} ry={11} fill={i % 3 === 0 ? '#ffffff' : i % 3 === 1 ? '#f6a8b6' : '#ffe27a'} transform={`rotate(${a} 0 -36)`} />)}
            <circle cx={0} cy={-36} r={5} fill="#f0a24a" />
          </g>
        </g>
      ))}
    </g>
  );
}

/** A Person sitting: the legs are hidden behind a seat drawn after it. */
export function Seated({ seat = '#6b4f33', children }: { seat?: string; children: ReactNode }) {
  return (
    <g>
      <g transform="translate(0 60)">{children}</g>
      <rect x={-60} y={-10} width={120} height={70} rx={8} fill={seat} {...ink(4)} />
    </g>
  );
}

/** A child, smaller than an adult. */
export function Child(props: PersonProps) {
  return <g transform="scale(0.62)"><Person {...props} /></g>;
}
