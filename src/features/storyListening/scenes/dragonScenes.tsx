'use client';

import type { ComponentType, ReactNode } from 'react';

import type { StorySentence } from '../types';
import { Campfire } from './characters';
import {
  Badger, Basket, BellTower, BOY, Book, Bunting, CaveHill, Cloth, Cottage, Dragon, DragonDefs, Drops, FATHER,
  FeastTable, FlowerBed, FRIEND, GEORGE, GEORGE_BARE, HenHouse, Horse, House, Knight, Lantern, MiniDragon, MOTHER,
  PictureFrame, Scroll, Shout, Spear, Thought, VILLAGERS, Wonder, Candle,
} from './dragonCharacters';
import type { Atmosphere, SceneProps } from './odysseyScenes';
import {
  Bubble, Camera, Cloud, ForegroundGrass, Hearts, Hotspot, INK, Layer, Moon, Move, Night, Notes, Person,
  Sheep, Sky, Sparkles, Sun,
} from './parts';

type Point = [number, number];
type Cam = [number, number, number];
const pick = <T,>(beat: number, values: readonly T[]) => values[Math.min(beat, values.length - 1)];

function SpeechAt({ bubble, at }: { bubble?: StorySentence['bubble']; at: Record<string, Point> }) {
  if (!bubble) return null;
  const point = at[bubble.speaker] ?? [800, 160];
  return <Bubble key={bubble.text} x={point[0]} y={point[1]} text={bubble.text} speaker={bubble.speaker} />;
}

/** One location of a scene. Only the active place is drawn; it fades in when the story moves there. */
function Place({ on, children }: { on: boolean; children: ReactNode }) {
  return on ? <g className="story-place-in">{children}</g> : null;
}

type Time = 'day' | 'morning' | 'evening' | 'dusk' | 'night';
const SKY: Record<Time, [string, string]> = {
  morning: ['#8fd0f2', '#fff1c8'],
  day: ['#7cc3ec', '#e6f5d0'],
  evening: ['#f39a6b', '#ffe3a8'],
  dusk: ['#6a63a8', '#f7b58a'],
  night: ['#1b2757', '#4f5a9a'],
};

/** Sky layers cross-fade so the time of day can change inside one chapter. */
function SkyBlend({ time, children }: { time: Time; children?: ReactNode }) {
  return (
    <>
      {(Object.keys(SKY) as Time[]).map((key) => (
        <g key={key} style={{ opacity: key === time ? 1 : 0, transition: 'opacity 1.8s ease' }}>
          <Sky top={SKY[key][0]} bottom={SKY[key][1]} rays={key === 'day' || key === 'morning'} birds={key === 'day' || key === 'morning'} />
        </g>
      ))}
      {children}
      <Night on={time === 'night'} strength={0.25} />
    </>
  );
}

/** The top of the downs: far vale, the cave hill and the chalk path. Ground is at y = 760. */
function HillTop({ time, cave, smoke = false, glow = false }: { time: Time; cave?: ReactNode; smoke?: boolean; glow?: boolean }) {
  const dark = time === 'dusk' || time === 'night';
  return (
    <>
      <SkyBlend time={time}>
        <Sun x={time === 'evening' ? 260 : 1380} y={time === 'evening' ? 500 : time === 'day' || time === 'morning' ? 150 : 900} />
        <Cloud x={300} y={140} o={dark ? 0.35 : 0.95} />
        <Cloud x={980} y={100} s={0.8} o={dark ? 0.3 : 0.9} />
      </SkyBlend>
      <Layer depth={-6}><Vale dusk={dark} /></Layer>
      <g transform="translate(1270 760)">
        {cave ?? <CaveHill smoke={smoke} glow={glow} />}
      </g>
      <path d="M-800 760 Q400 735 2400 765 L2400 1500 L-800 1500 Z" fill="url(#st-grass)" stroke={INK} strokeWidth={5} />
      <path d="M-260 1060 Q120 920 380 830 Q520 784 700 772" fill="none" stroke="#d9d2bf" strokeWidth={58} strokeLinecap="round" />
      <path d="M-260 1060 Q120 920 380 830 Q520 784 700 772" fill="none" stroke="#f4efe2" strokeWidth={44} strokeLinecap="round" />
      <g style={{ opacity: dark ? 1 : 0, transition: 'opacity 1.8s ease' }} pointerEvents="none">
        <rect x={-800} y={700} width={3200} height={800} fill="#0b1640" opacity={0.28} />
      </g>
    </>
  );
}

function Vale({ dusk }: { dusk: boolean }) {
  const far = dusk ? '#7d8fb0' : '#a9cfa0';
  const near = dusk ? '#617f86' : '#8fc27a';
  return (
    <g pointerEvents="none">
      <path d="M-800 640 Q-300 560 200 610 Q700 540 1300 600 Q1900 560 2400 620 L2400 900 L-800 900 Z" fill={far} />
      <path d="M-800 700 Q0 630 700 670 Q1400 630 2400 690 L2400 900 L-800 900 Z" fill={near} />
      <path d="M-200 720 Q200 670 460 680 M300 710 Q600 660 900 668" fill="none" stroke="#f4efe2" strokeWidth={6} opacity={0.75} />
      {[[120, 664], [170, 674], [222, 660], [600, 650], [652, 662], [700, 652]].map(([x, y], i) => (
        <g key={i} transform={`translate(${x} ${y}) scale(0.45)`}>
          <rect x={-24} y={-30} width={48} height={30} fill="#f7efe0" stroke={INK} strokeWidth={3} />
          <path d="M-30 -28 L0 -52 L30 -28 Z" fill="#b5523a" stroke={INK} strokeWidth={3} />
          {dusk ? <rect x={-8} y={-22} width={14} height={12} fill="#ffd76a" /> : null}
        </g>
      ))}
    </g>
  );
}

/** A village street: houses, the inn and the church tower. Ground is at y = 760. */
function VillageStreet({ time, party = false, ringing = false, lit = false, children }: { time: Time; party?: boolean; ringing?: boolean; lit?: boolean; children?: ReactNode }) {
  return (
    <>
      <SkyBlend time={time}>
        <Sun x={1350} y={time === 'day' || time === 'morning' ? 140 : 900} />
        <Cloud x={620} y={120} o={time === 'night' ? 0.25 : 0.95} />
        {time === 'night' || time === 'dusk' ? <Moon x={1240} y={130} /> : null}
      </SkyBlend>
      <Layer depth={-6}>
        <path d="M-800 600 Q0 520 800 560 Q1600 520 2400 600 L2400 900 L-800 900 Z" fill={time === 'night' ? '#4d6a74' : '#9cc58a'} />
        <g transform="translate(1180 560) scale(0.3)"><CaveHill /></g>
      </Layer>
      <g transform="translate(250 760)"><BellTower ringing={ringing} /></g>
      <g transform="translate(560 760)"><House roof="#b5523a" lit={lit} /></g>
      <g transform="translate(830 760)"><House wall="#efe3c8" roof="#7a6a5a" w={200} lit={lit} /></g>
      {children}
      <Bunting x1={420} y1={480} x2={700} y2={500} on={party} />
      <Bunting x1={700} y1={500} x2={980} y2={490} on={party} />
      <path d="M-800 760 L2400 760 L2400 1500 L-800 1500 Z" fill={time === 'night' ? '#8f8270' : '#d8c7a2'} />
      <path d="M-800 760 L2400 760" stroke={INK} strokeWidth={5} />
      {[[-100, 820], [140, 880], [420, 840], [700, 900], [980, 830], [1260, 880], [1520, 840]].map(([x, y], i) => (
        <ellipse key={i} cx={x} cy={y} rx={60} ry={14} fill="#c4b18c" />
      ))}
      {party ? <g transform="translate(120 800)"><FlowerBed n={24} spread={62} /></g> : null}
    </>
  );
}

/** The inn with its hanging sign; the door is its own hotspot. Origin on the ground at the door. */
function Inn({ lit = false, doorOpen = false }: { lit?: boolean; doorOpen?: boolean }) {
  return (
    <g>
      <Hotspot id="inn" label="inn" cx={0} cy={-160} rx={190} ry={170}>
        <rect x={-180} y={-260} width={360} height={260} fill="#f2e2c0" stroke={INK} strokeWidth={5} />
        {[-170, 170].map((x) => <rect key={x} x={x - 7} y={-260} width={14} height={260} fill="#7a4a24" />)}
        <rect x={-180} y={-140} width={360} height={12} fill="#7a4a24" />
        <path d="M-210 -256 L0 -380 L210 -256 Z" fill="#5f6f8a" stroke={INK} strokeWidth={5} />
        {[-110, 110].map((x) => (
          <g key={x}>
            <rect x={x - 34} y={-230} width={68} height={60} fill={lit ? '#ffd76a' : '#bfe0f0'} stroke={INK} strokeWidth={4} />
            <path d={`M${x} -230 L${x} -170`} stroke={INK} strokeWidth={3} />
          </g>
        ))}
        <path d="M180 -220 L250 -220" stroke={INK} strokeWidth={6} />
        <g transform="translate(232 -220)">
          <g className="story-sway">
            <rect x={-40} y={6} width={80} height={56} rx={8} fill="#fff1c4" stroke={INK} strokeWidth={4} />
            <text x={0} y={46} textAnchor="middle" fontSize={30} fontWeight={900} fill="#7a4a24">INN</text>
          </g>
        </g>
      </Hotspot>
      <Hotspot id="door" label="door" cx={0} cy={-60} rx={60} ry={70}>
        <path d="M-44 0 L-44 -110 Q0 -140 44 -110 L44 0 Z" fill={doorOpen ? '#ffd27a' : '#6b4423'} stroke={INK} strokeWidth={5} />
        {doorOpen ? null : <path d="M-20 -110 L-20 0 M20 -116 L20 0" stroke="#4a2f18" strokeWidth={4} />}
        {doorOpen ? null : <circle cx={30} cy={-54} r={6} fill="#f0c35a" stroke={INK} strokeWidth={2} />}
      </Hotspot>
    </g>
  );
}

/** Warm interior walls and floor, with a window into the night. */
function Room({ wall = '#e9d3a8', window: view }: { wall?: string; window?: ReactNode }) {
  return (
    <>
      <rect x={-800} y={-600} width={3200} height={1360} fill={wall} />
      {[-200, 300, 800, 1300, 1800].map((x) => <rect key={x} x={x} y={-600} width={34} height={1360} fill="#8a5a2c" opacity={0.85} />)}
      <rect x={-800} y={60} width={3200} height={40} fill="#7a4a24" />
      <path d="M-800 760 L2400 760 L2400 1500 L-800 1500 Z" fill="#b98a5a" />
      {[0, 1, 2, 3, 4, 5].map((i) => <rect key={i} x={-300 + i * 400} y={760} width={4} height={400} fill="#9a6e44" />)}
      <path d="M-800 760 L2400 760" stroke={INK} strokeWidth={5} />
      {view}
    </>
  );
}

function NightWindow({ x, y, eyes = false }: { x: number; y: number; eyes?: boolean }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x={-140} y={-110} width={280} height={220} fill="#22305f" stroke={INK} strokeWidth={6} />
      {[[-100, -80], [-30, -60], [60, -86], [110, -40]].map(([sx, sy], i) => (
        <circle key={i} cx={sx} cy={sy} r={3} fill="#fff8d6" className="story-twinkle" style={{ animationDelay: `${i * 0.4}s` }} />
      ))}
      <path d="M-140 110 Q-60 -20 40 -30 Q120 -20 140 40 L140 110 Z" fill="#2f5a3a" />
      <path d="M20 110 L20 50 Q50 10 80 50 L80 110 Z" fill="#0e0a08" />
      {eyes ? (
        <g className="story-blink">
          <circle cx={42} cy={72} r={5} fill="#ffe27a" />
          <circle cx={58} cy={72} r={5} fill="#ffe27a" />
        </g>
      ) : null}
      <path d="M0 -110 L0 110 M-140 0 L140 0" stroke="#7a4a24" strokeWidth={10} />
      <rect x={-156} y={104} width={312} height={20} fill="#8a5a2c" stroke={INK} strokeWidth={4} />
    </g>
  );
}

function Hearth({ x }: { x: number }) {
  return (
    <g transform={`translate(${x} 760)`}>
      <path d="M-170 0 L-170 -300 L170 -300 L170 0 L110 0 L110 -150 Q0 -230 -110 -150 L-110 0 Z" fill="#b9ad9c" stroke={INK} strokeWidth={5} />
      {[[-140, -260], [60, -270], [-60, -200], [120, -200], [-150, -100]].map(([sx, sy], i) => <rect key={i} x={sx} y={sy} width={40} height={18} fill="#a49886" />)}
      <path d="M-110 0 L-110 -150 Q0 -230 110 -150 L110 0 Z" fill="#2a1d16" />
      <g transform="translate(0 -8) scale(0.85)"><Campfire /></g>
      <rect x={-190} y={-320} width={380} height={26} fill="#7a4a24" stroke={INK} strokeWidth={4} />
    </g>
  );
}

function WoodTable({ x, w = 360 }: { x: number; w?: number }) {
  return (
    <g transform={`translate(${x} 760)`}>
      <rect x={-w / 2} y={-150} width={w} height={22} rx={5} fill="url(#st-wood)" stroke={INK} strokeWidth={4} />
      <rect x={-w / 2 + 20} y={-128} width={20} height={128} fill="url(#st-wood-dark)" stroke={INK} strokeWidth={3} />
      <rect x={w / 2 - 40} y={-128} width={20} height={128} fill="url(#st-wood-dark)" stroke={INK} strokeWidth={3} />
    </g>
  );
}

const villager = (i: number) => VILLAGERS[i % VILLAGERS.length];

/* ---------------------------------------------------------------- 1 */

function CottageScene({ beat, bubble }: SceneProps) {
  const inside = beat >= 1;
  const cam = pick<Cam>(beat, [[800, 450, 1], [800, 450, 1], [480, 470, 1.15], [480, 420, 1.05], [620, 520, 1.3], [880, 480, 1]]);
  const fatherIn = beat >= 2;
  return (
    <Camera fx={cam[0]} fy={cam[1]} s={cam[2]}>
      <DragonDefs />
      <Place on={!inside}>
        <HillTop time="dusk" />
        <g transform="translate(560 790)"><Cottage /></g>
        <g transform="translate(980 820) scale(0.7)"><g className="story-graze"><Sheep /></g></g>
        <g transform="translate(1110 840) scale(0.7)"><g className="story-graze" style={{ animationDelay: '.7s' }}><Sheep /></g></g>
        <ForegroundGrass y={960} />
      </Place>
      <Place on={inside}>
        <Room window={(
          <Hotspot id="cave" label="cave" cx={360} cy={330} rx={160} ry={130}>
            <NightWindow x={360} y={330} eyes />
          </Hotspot>
        )} />
        <Hearth x={1500} />
        <g transform="translate(120 760)">
          <path d="M-70 0 L-70 -300 L70 -300 L70 0 Z" fill="#3a2416" stroke={INK} strokeWidth={5} />
          <g style={{ transform: `scaleX(${fatherIn ? 0.25 : 1})`, transformOrigin: '-70px 0px', transition: 'transform .6s ease' }}>
            <rect x={-70} y={-300} width={140} height={300} fill="url(#st-wood)" stroke={INK} strokeWidth={5} />
            <path d="M-30 -300 L-30 0 M10 -300 L10 0 M50 -300 L50 0" stroke="#7a4a24" strokeWidth={4} />
          </g>
        </g>
        <Move x={1210} y={790} s={0.95}>
          <Person {...MOTHER} mood={beat === 2 || beat === 3 ? 'surprised' : 'smile'} holding={<g transform="translate(-6 0) scale(0.6)"><Cloth /></g>} />
          <g transform="translate(0 -260)"><Hearts on={beat === 5} /></g>
        </Move>
        <Move x={600} y={790} s={0.78}>
          <g className={beat === 4 ? 'story-bob' : undefined}>
            <Person {...BOY} mood={beat === 4 ? 'surprised' : 'smile'}
              holding={<Hotspot id="book" label="book" cx={0} cy={0} rx={80} ry={60}><g transform="translate(-10 -8)"><Book open={beat < 4} /></g></Hotspot>} />
          </g>
        </Move>
        <WoodTable x={900} />
        <g transform="translate(990 610)"><Candle /></g>
        <Move x={fatherIn ? 330 : 120} y={800} o={fatherIn ? 1 : 0} dur={0.9}>
          <Hotspot id="father" label="shepherd" cy={-120} rx={70} ry={150}>
            <g className={beat === 2 || beat === 3 ? 'story-tremble' : undefined}>
              <Person {...FATHER} armsUp={beat === 3} mood={beat === 2 || beat === 3 ? 'shout' : beat === 4 ? 'surprised' : 'smile'} />
            </g>
          </Hotspot>
          <g transform="translate(40 -190)"><Drops on={beat === 2} /></g>
        </Move>
        <g transform="translate(400 560)">
          <Thought on={beat === 3}>
            <Hotspot id="thought" label="scales" cx={0} cy={-10} rx={200} ry={90}>
              <g transform="translate(-60 30) scale(0.75)"><MiniDragon /></g>
              <text x={60} y={-20} fontSize={44} fontWeight={900} fill={INK}>=</text>
              {[0, 1, 2, 3].map((i) => <g key={i} transform={`translate(${100 + (i % 2) * 70} ${-10 + Math.floor(i / 2) * 60}) scale(0.16)`}><Horse /></g>)}
            </Hotspot>
          </Thought>
        </g>
      </Place>
      <SpeechAt bubble={bubble} at={{ Father: [340, 420], Boy: [620, 470], Mother: [1210, 450] }} />
    </Camera>
  );
}

/* ---------------------------------------------------------------- 2 */

function HillScene({ beat, bubble }: SceneProps) {
  const cam = pick<Cam>(beat, [[520, 680, 1.2], [800, 500, 1], [900, 560, 1.05], [880, 560, 1.1], [880, 540, 1.1], [860, 570, 1.15]]);
  const found = beat >= 2;
  const moonY = beat === 0 ? 560 : 170;
  return (
    <Camera fx={cam[0]} fy={cam[1]} s={cam[2]}>
      <DragonDefs />
      <HillTop time={beat === 0 ? 'evening' : 'dusk'} cave={(
        <Hotspot id="hill" label="hill" cx={40} cy={-200} rx={420} ry={190}><CaveHill /></Hotspot>
      )} />
      <Hotspot id="moon" label="moon" cx={360} cy={moonY} rx={80} ry={80}><Moon x={360} y={moonY} /></Hotspot>
      {!found ? (
        <Move x={1150} y={765} o={beat >= 1 ? 1 : 0.4}>
          <Hotspot id="dragon" label="dragon" cx={40} cy={-70} rx={120} ry={90}>
            <g className="story-tail"><path d="M0 0 C40 -80 80 -120 120 -90 C140 -70 120 -40 100 -50 C110 -80 70 -70 50 -20 Z" fill="url(#dr-scale)" stroke={INK} strokeWidth={5} /></g>
            <g transform="translate(-60 0)">
              <circle cx={0} cy={-46} r={52} fill="#3f6e3a" stroke={INK} strokeWidth={4} />
              <circle cx={60} cy={-30} r={40} fill="#4f7f45" stroke={INK} strokeWidth={4} />
              <circle cx={-14} cy={-60} r={14} fill="#6b9a5e" />
            </g>
          </Hotspot>
        </Move>
      ) : (
        <g className="story-place-in">
          <Move x={1010} y={772}>
            <Hotspot id="dragon" label="dragon" cx={-60} cy={-150} rx={330} ry={150}>
              <Dragon pose={beat === 4 ? 'sit' : 'rest'} pawSpot
                eyes={beat === 2 ? 'closed' : beat === 4 ? 'worried' : beat === 5 ? 'happy' : 'open'}
                mouth={beat === 4 ? 'worried' : beat === 5 ? 'grin' : beat === 3 ? 'o' : 'smile'}
                purr={beat === 2} blush={beat === 5} />
            </Hotspot>
          </Move>
        </g>
      )}
      <Move x={pick(beat, [250, 470, 470, 470, 470, 560])} y={pick(beat, [900, 776, 776, 776, 776, 786])} s={pick(beat, [0.7, 0.75, 0.75, 0.75, 0.75, 0.72])} dur={2.2}>
        <g className={beat === 0 ? 'story-bob' : undefined}>
          <Person {...BOY} wave={beat === 3} mood={beat === 2 || beat === 4 ? 'surprised' : 'smile'} />
        </g>
      </Move>
      <ForegroundGrass y={980} />
      <SpeechAt bubble={bubble} at={{ Boy: [470, 520], Dragon: [760, 390] }} />
    </Camera>
  );
}

/* ---------------------------------------------------------------- 3 */

function PoemsScene({ beat, bubble }: SceneProps) {
  const cam = pick<Cam>(beat, [[760, 560, 1.15], [820, 420, 1], [820, 420, 1], [820, 420, 1], [760, 540, 1.3], [760, 520, 1.15], [620, 500, 1.1], [760, 560, 1.1]]);
  const memory = beat >= 1 && beat <= 3;
  return (
    <Camera fx={cam[0]} fy={cam[1]} s={cam[2]} shake={beat === 3}>
      <DragonDefs />
      <HillTop time="evening" />
      <Move x={1010} y={772}>
        <Hotspot id="dragon" label="lazy" cx={-60} cy={-150} rx={330} ry={150}>
          <Dragon pose={beat === 7 ? 'rest' : 'sit'}
            eyes={beat === 0 || beat === 4 ? 'side' : memory ? 'closed' : beat === 5 || beat === 7 ? 'happy' : 'open'}
            mouth={beat === 5 ? 'open' : beat === 7 ? 'grin' : beat === 6 ? 'o' : 'smile'}
            blush={beat === 4 || beat === 5}
            holding={beat === 5 ? <Hotspot id="scroll" label="poem" cx={0} cy={0} rx={80} ry={90}><Scroll s={0.9} /></Hotspot> : undefined} />
        </Hotspot>
        <g transform="translate(-280 -420)"><Notes on={beat === 5} color="#ffb3c7" /></g>
      </Move>
      <Move x={470} y={776} s={0.75}>
        <Person {...BOY} armsUp={beat === 6} mood={beat === 6 ? 'shout' : beat === 5 ? 'laugh' : 'smile'} />
      </Move>
      <g transform="translate(860 470)">
        <Thought on={memory}>
          <g style={{ opacity: beat === 1 ? 1 : 0, transition: 'opacity .5s ease' }}>
            <Hotspot id="knights" label="knight" cx={0} cy={-10} rx={200} ry={90}>
              <g transform="translate(-60 40) scale(0.7)"><g className="story-bob"><MiniDragon fierce /></g></g>
              <g transform="translate(110 50) scale(0.42)"><g className="story-tremble"><Person {...GEORGE} cape={undefined} mood="surprised" /></g></g>
            </Hotspot>
          </g>
          <g style={{ opacity: beat === 2 ? 1 : 0, transition: 'opacity .5s ease' }}>
            <Hotspot id="rock" label="rock" cx={0} cy={0} rx={200} ry={90}>
              <path d="M40 50 Q50 -40 120 -50 Q180 -30 180 50 Z" fill="url(#st-rock)" stroke={INK} strokeWidth={4} />
              <g transform="translate(20 50) scale(0.7)"><MiniDragon sleeping /></g>
              <g transform="translate(-40 -30)"><g className="story-zzz"><text fontSize={40} fontWeight={900} fill="#7a8aa0">z z</text></g></g>
            </Hotspot>
          </g>
          <g style={{ opacity: beat === 3 ? 1 : 0, transition: 'opacity .5s ease' }}>
            <rect x={-190} y={-70} width={380} height={130} rx={30} fill="#8a6a4c" />
            <path d="M-190 -60 Q0 -90 190 -60" stroke="#5b9842" strokeWidth={16} fill="none" />
            <g transform="translate(-20 50) scale(0.6) rotate(-30)"><MiniDragon /></g>
            {[[-120, 10], [100, 20], [60, -30]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={10} fill="#6b5038" />)}
          </g>
        </Thought>
      </g>
      <g transform="translate(400 540)">
        <Thought on={beat === 6} flip>
          {[-120, -40, 40, 120].map((x, i) => (
            <g key={x} transform={`translate(${x} 60) scale(0.32)`}>
              <g transform="translate(40 -60) rotate(-10)"><Spear length={300} /></g>
              <Person {...villager(i)} armsUp mood="shout" />
            </g>
          ))}
        </Thought>
      </g>
      <ForegroundGrass y={980} color="#5f8a3a" />
      <SpeechAt bubble={bubble} at={{ Boy: [560, 500], Dragon: [770, 380] }} />
    </Camera>
  );
}

/* ---------------------------------------------------------------- 4 */

function VillageScene({ beat, bubble }: SceneProps) {
  const onHill = beat <= 1 || beat === 7;
  const cam = pick<Cam>(beat, [[760, 540, 1.05], [800, 540, 1.1], [800, 450, 1], [800, 500, 1.15], [860, 480, 1.1], [1120, 580, 1.35], [800, 500, 1.1], [760, 520, 1.05]]);
  const scared = beat === 3 || beat === 6;
  return (
    <Camera fx={cam[0]} fy={cam[1]} s={cam[2]}>
      <DragonDefs />
      <Place on={onHill}>
        <HillTop time={beat === 0 ? 'day' : beat === 1 ? 'night' : 'evening'} />
        {beat === 7 ? <Hotspot id="sun" label="sunset" cx={260} cy={500} rx={110} ry={110}><circle cx={260} cy={500} r={90} fill="transparent" /></Hotspot> : null}
        <Move x={1060} y={772}>
          <Dragon pose={beat === 1 ? 'sit' : 'rest'} eyes={beat === 7 ? 'side' : 'happy'} mouth={beat === 1 ? 'open' : 'smile'} blush={beat === 7}
            holding={beat === 7 ? <Scroll s={0.8} /> : undefined} />
          <g transform="translate(-300 -420)"><Notes on={beat === 7} color="#ffb3c7" /></g>
        </Move>
        <Move x={beat === 0 ? 560 : 520} y={780} s={0.95} o={beat === 0 ? 1 : 0}>
          <Person {...FATHER} wave mood="laugh" />
        </Move>
        <Move x={380} y={780} s={0.95} o={beat === 0 ? 1 : 0}>
          <Person {...MOTHER} mood="smile" holding={<g transform="translate(0 30)"><Basket /></g>} />
        </Move>
        <Move x={beat === 1 ? 600 : 700} y={786} s={0.72} o={beat <= 1 ? 1 : 0}>
          <Person {...BOY} mood={beat === 1 ? 'laugh' : 'smile'} />
        </Move>
      </Place>
      <Place on={!onHill}>
        <VillageStreet time="night" lit>
          <Hotspot id="village" label="village" cx={700} cy={620} rx={300} ry={160}><rect x={420} y={460} width={560} height={2} fill="transparent" /></Hotspot>
          <g transform="translate(1500 760)"><Inn lit /></g>
          {[300, 1000].map((x) => <g key={x} transform={`translate(${x} 470)`}><Lantern /></g>)}
        </VillageStreet>
        <g transform="translate(1200 800)">
          <Hotspot id="henhouse" label="chicken" cx={0} cy={-90} rx={140} ry={110}><HenHouse open={beat >= 5} /></Hotspot>
        </g>
        <Hotspot id="villagers" label="brave" cx={800} cy={680} rx={300} ry={150}>
          {[0, 1, 2, 3, 4].map((i) => {
            const proud = beat === 3 && i % 2 === 1;
            const x = beat === 6 ? 520 + i * 150 + (i % 2 ? 30 : -30) : 580 + i * 110;
            return (
              <Move key={i} x={x} y={820} s={0.85} delay={i * 0.06} dur={0.9}>
                <g className={scared && !proud ? 'story-tremble' : beat === 2 ? 'story-bob' : undefined} style={{ animationDelay: `${i * 0.1}s` }}>
                  <Person {...villager(i)} armsUp={beat === 4} mood={beat === 4 ? 'shout' : proud ? 'laugh' : scared ? 'sad' : beat === 5 ? 'surprised' : 'laugh'} />
                </g>
                <g transform="translate(30 -200)"><Drops on={beat === 6} /></g>
              </Move>
            );
          })}
        </Hotspot>
      </Place>
      <SpeechAt bubble={bubble} at={{ Villagers: [800, 430] }} />
    </Camera>
  );
}

/* ---------------------------------------------------------------- 5 */

function GeorgeScene({ beat, bubble, effort = 0 }: SceneProps) {
  const inVillage = beat <= 3;
  const cam = pick<Cam>(beat, [[700, 430, 1], [640, 520, 1.2], [760, 470, 1], [1080, 460, 1.1], [700, 600, 1], [820, 560, 1.15], [800, 540, 1.1]]);
  const horseX = pick(beat, [-500, -500, 760, 1130]);
  return (
    <Camera fx={cam[0]} fy={cam[1]} s={cam[2]}>
      <DragonDefs />
      <Place on={inVillage}>
        <VillageStreet time="day" party ringing={beat <= 1}>
          <Hotspot id="flags" label="flag" cx={700} cy={540} rx={300} ry={70}><rect x={420} y={480} width={560} height={2} fill="transparent" /></Hotspot>
          <g transform="translate(1250 760)"><Inn /></g>
        </VillageStreet>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Move key={i} x={360 + i * 200} y={900} s={0.8} delay={i * 0.05}>
            <g className={beat === 3 ? 'story-bob' : undefined} style={{ animationDelay: `${i * 0.12}s` }}>
              <Person {...villager(i + 1)} armsUp={beat >= 2} mood={beat >= 2 ? 'laugh' : 'smile'} />
            </g>
          </Move>
        ))}
        {/* He rides in from the left, so the horse faces right. */}
        <Move x={horseX} y={820} dur={2.6} flip>
          <Hotspot id="horse" label="horse" cx={0} cy={-190} rx={200} ry={110}>
            <Horse run={beat === 2} rider={(
              <g>
                <g transform="translate(30 -70) rotate(-6)"><Spear /></g>
                <Person {...GEORGE} mood={beat === 3 ? 'laugh' : 'smile'} wave={beat === 3} />
              </g>
            )} />
          </Hotspot>
          {/* St. George's armour is its own target, laid over the rider. */}
          <g transform="translate(-10 -155)">
            <Hotspot id="george" label="armor" cx={0} cy={-160} rx={60} ry={100}><rect x={-1} y={-160} width={2} height={2} fill="transparent" /></Hotspot>
          </g>
        </Move>
        <Move x={pick(beat, [600, 600, 520, 520])} y={830} s={0.72} o={beat >= 1 ? 1 : 0}>
          <Person {...BOY} mood={beat === 1 ? 'surprised' : 'smile'} />
        </Move>
        <Move x={pick(beat, [760, 740, 380, 380])} y={830} s={0.72} o={beat >= 1 ? 1 : 0}>
          <g className={beat === 1 ? 'story-bob' : undefined}><Person {...FRIEND} armsUp={beat === 1} mood="laugh" /></g>
        </Move>
      </Place>
      <Place on={!inVillage}>
        <HillTop time="day" />
        <Move x={1060} y={772}>
          <Hotspot id="dragon" label="dragon" cx={-60} cy={-150} rx={330} ry={150}>
            <Dragon pose={beat === 6 ? 'sit' : 'rest'} eyes={beat === 6 ? 'open' : 'happy'} mouth="smile"
              shine={beat >= 6 ? 1 : effort} holding={beat <= 5 ? <g className="story-polish"><Cloth /></g> : undefined} />
          </Hotspot>
        </Move>
        <Move x={beat === 4 ? 320 : 480} y={beat === 4 ? 860 : 778} s={0.74} dur={2.4}>
          <g className={beat === 4 ? 'story-bob' : undefined}><Person {...BOY} armsUp={beat === 4} mood={beat === 4 ? 'shout' : 'smile'} /></g>
        </Move>
      </Place>
      <SpeechAt bubble={bubble} at={{ Friend: [720, 560], 'St. George': [1120, 300], Dragon: [770, 390] }} />
    </Camera>
  );
}

/* ---------------------------------------------------------------- 6 */

function RefuseScene({ beat, bubble }: SceneProps) {
  const cam = pick<Cam>(beat, [[700, 560, 1.15], [820, 540, 1.15], [860, 540, 1.2], [800, 540, 1.1], [600, 500, 1.05], [780, 560, 1.15], [600, 640, 1]]);
  const boyX = pick(beat, [470, 470, 470, 470, 470, 470, 260]);
  return (
    <Camera fx={cam[0]} fy={cam[1]} s={cam[2]}>
      <DragonDefs />
      <HillTop time="day" />
      <Move x={1030} y={772}>
        <Hotspot id="dragon" label="fight" cx={-60} cy={-150} rx={330} ry={150}>
          <Dragon pose={beat === 1 || beat === 3 ? 'sit' : 'rest'} shine={0.5}
            eyes={pick(beat, ['open', 'worried', 'shut', 'closed', 'worried', 'happy', 'happy'] as const)}
            mouth={pick(beat, ['smile', 'o', 'worried', 'smile', 'o', 'smile', 'smile'] as const)} />
        </Hotspot>
        <g transform="translate(-250 -230)"><Drops on={beat === 2} /></g>
      </Move>
      <Move x={boyX} y={pick(beat, [778, 778, 778, 778, 778, 778, 900])} s={pick(beat, [0.75, 0.75, 0.75, 0.75, 0.75, 0.75, 0.66])} dur={2.4}>
        <Hotspot id="boy" label="boy" cy={-120} rx={70} ry={150}>
          <g className={beat === 0 ? 'story-hop' : undefined}>
            <Person {...BOY} armsUp={beat === 0 || beat === 4} mood={pick(beat, ['laugh', 'surprised', 'surprised', 'smile', 'shout', 'surprised', 'sad'] as const)} />
          </g>
        </Hotspot>
      </Move>
      <g transform="translate(430 560)">
        <Thought on={beat === 4} flip>
          <g transform="translate(-60 70) scale(0.36)"><Knight charge /></g>
          <g transform="translate(110 40) scale(0.55)"><MiniDragon /></g>
          <g transform="translate(40 -30)"><Drops on tears /></g>
        </Thought>
      </g>
      <ForegroundGrass y={980} />
      <SpeechAt bubble={bubble} at={{ Boy: [470, 520], Dragon: [770, 390] }} />
    </Camera>
  );
}

/* ---------------------------------------------------------------- 7 */

function InnScene({ beat, bubble }: SceneProps) {
  const outside = beat <= 1;
  const cam = pick<Cam>(beat, [[800, 450, 1], [1040, 560, 1.25], [520, 480, 1], [880, 500, 1.2], [560, 460, 1.05], [560, 460, 1.05], [900, 500, 1.25], [800, 480, 1], [600, 500, 1.1]]);
  const georgeUp = beat >= 7;
  return (
    <Camera fx={cam[0]} fy={cam[1]} s={cam[2]}>
      <DragonDefs />
      <Place on={outside}>
        <VillageStreet time="dusk" lit>
          <g transform="translate(1130 760)"><Inn lit /></g>
        </VillageStreet>
        {[0, 1, 2, 3].map((i) => (
          <Move key={i} x={beat === 0 ? 360 + i * 150 : -200 - i * 120} y={850} s={0.8} delay={i * 0.1} dur={2.4}>
            <g className="story-bob" style={{ animationDelay: `${i * 0.15}s` }}><Person {...villager(i)} mood="laugh" /></g>
          </Move>
        ))}
        <Move x={beat === 0 ? 1500 : 960} y={810} s={0.74} dur={2}>
          <Person {...BOY} mood="smile" />
        </Move>
      </Place>
      <Place on={!outside}>
        <Room wall="#dcc196" window={<NightWindow x={1250} y={330} />} />
        <g transform="translate(140 760)">
          <path d="M-80 0 L-80 -320 L80 -320 L80 0 Z" fill={beat === 8 ? '#2a1d16' : '#ffe2a6'} stroke={INK} strokeWidth={5} />
        </g>
        <Move x={georgeUp ? 1020 : 880} y={790} s={0.95} dur={1.2}>
          <Hotspot id="george" label="plan" cy={-120} rx={70} ry={150}>
            <Person {...GEORGE_BARE} mood={beat === 6 ? 'sad' : beat >= 7 ? 'laugh' : 'smile'} wave={beat === 3} />
          </Hotspot>
          <g transform="translate(10 -300)"><Wonder on={beat === 6} /></g>
        </Move>
        <WoodTable x={820} w={420} />
        <g transform="translate(720 610)"><Candle /></g>
        <g transform="translate(930 600) scale(0.9)" style={{ opacity: georgeUp ? 0 : 1, transition: 'opacity .6s ease' }}>
          <path d="M-34 -14 Q-34 -58 0 -60 Q34 -58 34 -14 Z" fill="url(#st-bronze)" stroke={INK} strokeWidth={4} />
          <path d="M-24 -56 Q0 -100 24 -56 Q0 -70 -24 -56 Z" fill="#d23a2e" stroke={INK} strokeWidth={3} />
        </g>
        <Move x={pick(beat, [0, 0, 240, 520, 520, 520, 520, 520, 300])} y={800} s={0.76} dur={1.4}>
          <Hotspot id="boy" label="friend" cy={-120} rx={70} ry={150}>
            <Person {...BOY} wave={beat === 2} mood={beat === 8 ? 'laugh' : beat === 4 || beat === 5 ? 'shout' : 'smile'} />
          </Hotspot>
        </Move>
        <g transform="translate(560 520)">
          <Thought on={beat === 4 || beat === 5} flip>
            <g style={{ opacity: beat === 4 ? 1 : 0, transition: 'opacity .5s ease' }}>
              <g transform="translate(-50 60) scale(0.7)"><MiniDragon /></g>
              <g transform="translate(110 70) scale(0.4)"><Person {...MOTHER} mood="laugh" /></g>
              <g transform="translate(40 -40) scale(0.8)"><Hearts on /></g>
            </g>
            <g style={{ opacity: beat === 5 ? 1 : 0, transition: 'opacity .5s ease' }}>
              {[-110, 0, 110].map((x, i) => (
                <g key={x} transform={`translate(${x} 70) scale(0.34)`}><Person {...villager(i + 2)} armsUp mood="shout" /></g>
              ))}
              <g transform="translate(0 -40) scale(0.45)"><MiniDragon fierce /></g>
            </g>
          </Thought>
        </g>
      </Place>
      <SpeechAt bubble={bubble} at={{ Boy: [420, 500], 'St. George': [960, 420] }} />
    </Camera>
  );
}

/* ---------------------------------------------------------------- 8 */

function PlanScene({ beat, bubble }: SceneProps) {
  const cam = pick<Cam>(beat, [[700, 600, 1], [800, 560, 1.05], [700, 560, 1.1], [600, 460, 1], [820, 520, 1.15], [780, 580, 1.15], [800, 570, 1.2], [790, 560, 1.25], [860, 440, 1], [760, 560, 1.1]]);
  const georgeX = beat >= 5 && beat <= 7 ? 600 : beat === 0 ? 300 : 560;
  const spearAngle = pick(beat, [-6, -6, -6, -6, -6, 60, 92, 64, -6, -6]);
  return (
    <Camera fx={cam[0]} fy={cam[1]} s={cam[2]}>
      <DragonDefs />
      <HillTop time="night" />
      <Moon x={300} y={150} />
      <Move x={1050} y={772}>
        <Dragon pose={beat === 0 ? 'rest' : 'sit'} neckSpot
          eyes={pick(beat, ['closed', 'open', 'shut', 'open', 'happy', 'open', 'happy', 'worried', 'open', 'happy'] as const)}
          mouth={pick(beat, ['sleep', 'smile', 'smile', 'smile', 'smile', 'o', 'grin', 'o', 'open', 'grin'] as const)}
          sleep={beat === 0} blush={beat === 4} />
        <g transform="translate(-200 -420)"><Hearts on={beat === 9} /></g>
      </Move>
      <Move x={georgeX} y={beat === 0 ? 880 : 790} s={beat === 0 ? 0.85 : 0.95} dur={2}>
        <Hotspot id="george" label="rule" cy={-120} rx={70} ry={150}>
          <Person {...GEORGE} wave={beat === 3} mood={beat === 9 ? 'laugh' : 'smile'} />
        </Hotspot>
        <g style={{ transform: `translate(40px, -90px) rotate(${spearAngle}deg)`, transition: 'transform 1s cubic-bezier(.45,.05,.25,1)' }}>
          <Spear length={240} />
        </g>
      </Move>
      <Move x={beat === 0 ? 180 : 420} y={beat === 0 ? 900 : 796} s={0.72} dur={2}>
        <Person {...BOY} mood={beat === 9 || beat === 6 ? 'laugh' : 'smile'} />
      </Move>
      <g transform="translate(560 560)">
        <Thought on={beat === 3}>
          <Hotspot id="picture" label="picture" cx={0} cy={0} rx={190} ry={130}>
            <g transform="scale(0.9)">
              <PictureFrame>
                <g transform="translate(-60 70) scale(0.28)"><Knight charge /></g>
                <g transform="translate(80 60) scale(0.6)"><MiniDragon /></g>
              </PictureFrame>
            </g>
          </Hotspot>
        </Thought>
      </g>
      <g transform="translate(900 480)">
        <Thought on={beat === 8}>
          <Hotspot id="feast" label="feast" cx={0} cy={0} rx={190} ry={100}>
            <g transform="translate(0 70) scale(0.42)"><FeastTable wide={760} /></g>
            <g transform="translate(-130 -20)"><Sparkles on spread={60} /></g>
          </Hotspot>
        </Thought>
      </g>
      <ForegroundGrass y={990} color="#35593a" />
      <SpeechAt bubble={bubble} at={{ Dragon: [820, 420], 'St. George': [560, 470] }} />
    </Camera>
  );
}

/* ---------------------------------------------------------------- 9 */

function ShowScene({ beat, bubble }: SceneProps) {
  const cam = pick<Cam>(beat, [[800, 480, 1], [1150, 560, 1.2], [820, 520, 0.95], [1050, 520, 1.1], [820, 520, 0.95], [950, 480, 1], [1000, 480, 0.95], [800, 500, 1], [800, 520, 1.05], [760, 600, 1.15], [700, 620, 1.35]]);
  const out = beat >= 4;
  const knightX = pick(beat, [-500, -500, 200, 200, 200, 1520, 1900, 1900, 640, 120, 120]);
  const dismounted = beat >= 9;
  const label = beat === 5 ? 'ROUND 1' : beat === 6 ? 'ROUND 2' : beat === 8 ? 'ROUND 3' : null;
  return (
    <Camera fx={cam[0]} fy={cam[1]} s={cam[2]} shake={beat === 3 || beat === 9}>
      <DragonDefs />
      <HillTop time="morning" cave={(
        <Hotspot id="cave" label="smoke" cx={0} cy={-90} rx={190} ry={150}><CaveHill smoke={beat === 3} glow={beat === 3} /></Hotspot>
      )} />
      <Hotspot id="baskets" label="basket" cx={420} cy={790} rx={260} ry={60}>
        {[220, 420, 620].map((x) => <g key={x} transform={`translate(${x} 830)`}><Basket /></g>)}
      </Hotspot>
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <Move key={i} x={60 + i * 95} y={beat === 0 ? 760 : 740} s={0.55} delay={i * 0.08}>
          <g className={beat === 3 ? 'story-tremble' : beat === 7 || beat === 4 ? 'story-bob' : undefined} style={{ animationDelay: `${i * 0.1}s` }}>
            <Person {...villager(i)} armsUp={beat === 4 || beat === 7 || beat === 9} mood={beat === 3 ? 'surprised' : beat >= 4 ? 'laugh' : 'smile'} />
          </g>
        </Move>
      ))}
      {out ? (
        <g className="story-place-in">
          <Move x={beat === 5 ? 1080 : 1010} y={beat === 5 ? 740 : 772} dur={0.6}>
            <g className={beat === 6 ? 'story-hop-wide' : undefined}>
              <Hotspot id="dragon" label="dragon" cx={-60} cy={-150} rx={330} ry={150}>
                <Dragon pose={beat === 9 ? 'down' : beat === 10 ? 'down' : beat === 7 ? 'sit' : 'rear'}
                  eyes={beat === 9 ? 'closed' : beat === 10 ? 'wink' : beat === 7 ? 'happy' : 'open'}
                  mouth={beat === 9 || beat === 10 ? 'smile' : beat === 7 ? 'grin' : 'roar'}
                  fire={beat === 4 || beat === 6} smoke={beat === 5 || beat === 8} shine={beat >= 9 ? 0.4 : 0.9} />
              </Hotspot>
            </g>
          </Move>
        </g>
      ) : null}
      {/* St. George faces the dragon (right) throughout, and keeps facing right as his horse bolts. */}
      <Move x={knightX} y={dismounted ? 820 : 800} flip dur={beat === 5 || beat === 6 ? 1.6 : 2.2}>
        {dismounted ? <Horse /> : <Knight charge={beat === 5 || beat === 8} run={beat === 5 || beat === 6 || beat === 2} mood={beat === 6 ? 'surprised' : 'smile'} />}
      </Move>
      {dismounted ? (
        <g className="story-place-in">
          <Move x={470} y={800} s={0.95}>
            <Person {...GEORGE} mood="smile" />
          </Move>
          <g transform="translate(510 700)"><g style={{ transform: 'rotate(94deg)' }}><Spear length={310} /></g></g>
        </g>
      ) : null}
      {beat === 8 ? (
        <g pointerEvents="none">
          {[[780, 640], [840, 700], [900, 660]].map(([x, y], i) => (
            <g key={i} transform={`translate(${x} ${y})`}><g className="story-smoke" style={{ animationDelay: `${i * 0.2}s` }}><circle r={50} fill="#efe6d2" stroke="#b8a888" strokeWidth={4} /></g></g>
          ))}
        </g>
      ) : null}
      <Move x={beat >= 10 ? 590 : 420} y={830} s={0.72} dur={1.2}>
        <Person {...BOY} armsUp={beat === 4 || beat === 7} mood={beat === 1 || beat === 9 ? 'surprised' : beat >= 4 ? 'laugh' : 'smile'} />
        <g transform="translate(30 -190)"><Drops on={beat === 1} /></g>
      </Move>
      <g transform="translate(1270 360)"><Shout text="ROAR!" on={beat === 3} /></g>
      {label ? <g key={label} transform="translate(800 150)"><Shout text={label} on color="#ffffff" /></g> : null}
      {beat === 5 ? <g transform="translate(1250 420)"><Shout text="MISSED!" on color="#ff8a5c" /></g> : null}
      <SpeechAt bubble={bubble} at={{ Everyone: [560, 520] }} />
    </Camera>
  );
}

/* ---------------------------------------------------------------- 10 */

function FeastScene({ beat, bubble }: SceneProps) {
  const place = beat === 0 ? 'hill' : beat <= 2 ? 'square' : beat === 3 ? 'feast' : beat <= 6 ? 'road' : 'home';
  const cam = pick<Cam>(beat, [[700, 520, 1.05], [800, 480, 1], [800, 470, 1.05], [800, 560, 1.1], [760, 600, 1.15], [600, 580, 1.1], [780, 560, 1.1], [800, 520, 1]]);
  return (
    <Camera fx={cam[0]} fy={cam[1]} s={cam[2]}>
      <DragonDefs />
      <Place on={place === 'hill'}>
        <HillTop time="day" />
        <Move x={1060} y={772}><Dragon pose="sit" eyes="happy" mouth="grin" shine={0.5} /></Move>
        <Move x={640} y={790} s={0.95}><Person {...GEORGE} mood="laugh" /></Move>
        <Move x={330} y={800} s={0.9}><Person {...villager(5)} armsUp mood="shout" /></Move>
        <Move x={480} y={810} s={0.72}><Person {...BOY} mood="laugh" /></Move>
        {[0, 1, 2, 3].map((i) => <Move key={i} x={60 + i * 80} y={740} s={0.5}><Person {...villager(i)} mood="laugh" /></Move>)}
      </Place>
      <Place on={place === 'square'}>
        <VillageStreet time="day" party>
          <g transform="translate(1250 760)"><Inn /></g>
        </VillageStreet>
        <Move x={beat === 1 ? 420 : 760} y={beat === 1 ? 820 : 780} s={beat === 1 ? 1 : 0.95} dur={2}>
          {beat === 1 ? <Knight mood="laugh" /> : (
            <Hotspot id="george" label="speech" cy={-120} rx={70} ry={150}>
              <rect x={-80} y={-10} width={160} height={30} fill="url(#st-wood)" stroke={INK} strokeWidth={4} />
              <g transform="translate(0 -10)"><Person {...GEORGE_BARE} armsUp mood="laugh" /></g>
            </Hotspot>
          )}
        </Move>
        <Move x={beat === 1 ? 1150 : 1180} y={830} s={0.62} dur={2}><Dragon pose="sit" eyes="happy" mouth="smile" shine={0.5} /></Move>
        <Move x={beat === 1 ? 860 : 960} y={850} s={0.72} dur={2}><Person {...BOY} mood="laugh" /></Move>
        {[0, 1, 2, 3, 4].map((i) => (
          <Move key={i} x={200 + i * 140} y={920} s={0.8}>
            <g className="story-bob" style={{ animationDelay: `${i * 0.1}s` }}><Person {...villager(i)} armsUp={beat === 2} mood="laugh" /></g>
          </Move>
        ))}
        <Move x={beat === 2 ? 1380 : 1080} y={890} o={beat === 2 ? 1 : 0} dur={4}><Badger run /></Move>
      </Place>
      <Place on={place === 'feast'}>
        <VillageStreet time="night" lit>
          <g transform="translate(1250 760)"><Inn lit /></g>
        </VillageStreet>
        {[200, 450, 700, 950, 1200].map((x, i) => <g key={x} transform={`translate(${x} ${430 + (i % 2) * 30})`}><Lantern color={['#ffb347', '#ff8aa6', '#ffe27a'][i % 3]} /></g>)}
        {[0, 1, 2, 3].map((i) => (
          <Move key={i} x={420 + i * 150} y={790} s={0.85}>
            <g className="story-bob" style={{ animationDelay: `${i * 0.2}s` }}><Person {...(i === 1 ? GEORGE_BARE : i === 2 ? BOY : villager(i))} mood="laugh" /></g>
          </Move>
        ))}
        <Move x={1240} y={800} s={0.7}><Dragon pose="sit" eyes="happy" mouth="open" shine={0.6} /></Move>
        <g transform="translate(780 860)">
          <Hotspot id="table" label="feast" cx={0} cy={-90} rx={460} ry={70}><FeastTable wide={900} /></Hotspot>
        </g>
      </Place>
      <Place on={place === 'road'}>
        <VillageStreet time="night" lit>
          <g transform="translate(250 760)"><Inn lit doorOpen={beat >= 5} /></g>
        </VillageStreet>
        {beat >= 5 ? <path d="M210 760 L290 760 L520 1100 L-60 1100 Z" fill="#ffe2a6" opacity={0.35} pointerEvents="none" /> : null}
        <Move x={980} y={800} s={0.8}>
          <Hotspot id="dragon" label="asleep" cx={-60} cy={-150} rx={330} ry={150}>
            <g className={beat === 5 ? 'story-tremble' : undefined}>
              <Dragon pose={beat === 6 ? 'sit' : 'rest'} eyes={beat === 6 ? 'open' : 'closed'} mouth={beat === 6 ? 'open' : 'sleep'} sleep={beat <= 5} />
            </g>
          </Hotspot>
        </Move>
        <Move x={beat === 6 ? 620 : 560} y={820} s={0.72}>
          <Person {...BOY} mood={beat === 6 ? 'laugh' : 'sad'} />
          <g transform="translate(0 -180)"><Drops on={beat === 4} tears /></g>
        </Move>
        <Move x={beat >= 5 ? 420 : 250} y={800} s={0.92} o={beat >= 5 ? 1 : 0}>
          <Person {...GEORGE_BARE} armsUp={beat === 5} mood={beat === 5 ? 'shout' : 'laugh'} />
        </Move>
      </Place>
      <Place on={place === 'home'}>
        <HillTop time="night" />
        <Moon x={1200} y={160} />
        <Move x={880} y={740} s={0.5}>
          <Hotspot id="dragon" label="song" cx={-60} cy={-150} rx={330} ry={150}>
            <g className="story-walk"><Dragon pose="sit" eyes="happy" mouth="open" /></g>
          </Hotspot>
          <g transform="translate(-200 -460)"><Notes on color="#ffe27a" /></g>
        </Move>
        <Move x={640} y={750} s={0.62}><g className="story-walk" style={{ animationDelay: '.15s' }}><Person {...GEORGE_BARE} wave mood="laugh" /></g></Move>
        <Move x={730} y={756} s={0.52}><g className="story-walk" style={{ animationDelay: '.3s' }}><Person {...BOY} mood="laugh" /></g></Move>
      </Place>
      <SpeechAt bubble={bubble} at={{ 'St. George': [680, 430], Boy: [560, 540], Dragon: [880, 420] }} />
    </Camera>
  );
}

export const DRAGON_SCENES: Record<string, ComponentType<SceneProps>> = {
  cottage: CottageScene,
  hill: HillScene,
  poems: PoemsScene,
  village: VillageScene,
  george: GeorgeScene,
  refuse: RefuseScene,
  inn: InnScene,
  plan: PlanScene,
  show: ShowScene,
  feast: FeastScene,
};

const WARM = 'rgba(255, 176, 92, 0.2)';
const DUSK = 'rgba(120, 90, 200, 0.18)';
const NIGHT = 'rgba(30, 50, 120, 0.25)';

export const DRAGON_ATMOSPHERE: Record<string, (beat: number) => Atmosphere> = {
  cottage: (beat) => beat === 0 ? { particles: 'fireflies', grade: DUSK, blend: 'soft-light' } : { particles: 'embers', grade: WARM, blend: 'soft-light' },
  hill: (beat) => beat === 0 ? { particles: 'dust', grade: WARM, blend: 'soft-light' } : { particles: 'fireflies', grade: DUSK, blend: 'soft-light' },
  poems: (beat) => ({ particles: beat === 5 ? 'magic' : 'dust', grade: 'rgba(255, 150, 90, 0.2)', blend: 'soft-light' }),
  village: (beat) => beat === 1 ? { particles: 'fireflies', grade: NIGHT, blend: 'multiply' }
    : beat === 7 ? { particles: 'dust', grade: 'rgba(255, 150, 90, 0.2)', blend: 'soft-light' }
      : beat === 0 ? { particles: 'dust' } : { particles: 'embers', grade: NIGHT, blend: 'multiply' },
  george: (beat) => beat <= 3 ? { particles: 'confetti' } : beat >= 6 ? { particles: 'magic' } : { particles: 'dust' },
  refuse: () => ({ particles: 'dust' }),
  inn: (beat) => beat <= 1 ? { particles: 'dust', grade: DUSK, blend: 'soft-light' } : { particles: 'embers', grade: WARM, blend: 'soft-light' },
  plan: () => ({ particles: 'fireflies', grade: NIGHT, blend: 'multiply' }),
  show: (beat) => beat === 3 || beat === 8 ? { particles: 'dust', grade: 'rgba(200, 180, 150, 0.2)', blend: 'soft-light' }
    : beat === 4 ? { particles: 'embers' } : beat >= 9 ? { particles: 'confetti' } : { particles: 'dust' },
  feast: (beat) => beat === 3 ? { particles: 'confetti', grade: WARM, blend: 'soft-light' }
    : beat >= 4 ? { particles: 'fireflies', grade: NIGHT, blend: 'multiply' } : { particles: 'confetti' },
};
