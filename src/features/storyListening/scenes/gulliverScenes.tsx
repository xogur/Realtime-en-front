'use client';

import type { ComponentType, ReactNode } from 'react';

import type { StorySentence } from '../types';
import { Basket, Drops, Horse, Shout, Wonder } from './dragonCharacters';
import {
  Archer, Barrel, BigWave, BLEFUSCANS, Bucket, Cow, Egg, Emperor, Flame, Giant, GiantLying, GULLIVER, Hook, Kingdom,
  Ladder, LILLIPUTIANS, Loaf, LYING_HEAD, LyingRopes, Minister, OFFICER, PocketWatch, RopeCoil, Rowboat, RoyalPalace,
  SnuffBox, Swimmer, TinyBellTower, TinyCity, Tricorn, Wagon, WarShip,
} from './gulliverCharacters';
import type { Atmosphere, SceneProps } from './odysseyScenes';
import {
  Bubble, Camera, Cloud, ForegroundGrass, Hearts, Hotspot, INK, Layer, Moon, Move, Night, Person, SAILOR, Sea,
  Sheep, Ship, Sky, Sparkles, Sun, type PersonProps,
} from './parts';

/*
 * Scenes for "Gulliver in Lilliput". The giant and the Lilliputians share one
 * drawing scale inside each scene (tiny people are about a twelfth of his
 * height), so the size gap itself tells the joke.
 */

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

type Time = 'day' | 'evening' | 'storm' | 'night' | 'dawn';
const SKY: Record<Time, [string, string]> = {
  day: ['#7cc3ec', '#e6f5d0'],
  evening: ['#f39a6b', '#ffe3a8'],
  storm: ['#2c3550', '#5a6680'],
  night: ['#1b2757', '#4f5a9a'],
  dawn: ['#8fa6d8', '#ffd2a8'],
};

/** Sky layers cross-fade so the weather or time can change inside one chapter. */
function SkyBlend({ time, children }: { time: Time; children?: ReactNode }) {
  return (
    <>
      {(Object.keys(SKY) as Time[]).map((key) => (
        <g key={key} style={{ opacity: key === time ? 1 : 0, transition: 'opacity 1.8s ease' }}>
          <Sky top={SKY[key][0]} bottom={SKY[key][1]} rays={key === 'day'} birds={key === 'day'} />
        </g>
      ))}
      {children}
      <Night on={time === 'night'} strength={0.22} />
    </>
  );
}

/** Lilliput's fields: far hills, the walled city on a hill and grass from y = 760. */
function Fields({ time = 'day', city = true }: { time?: Time; city?: boolean }) {
  const dark = time === 'night';
  return (
    <>
      <SkyBlend time={time}>
        <Sun x={1350} y={time === 'day' ? 150 : 900} />
        <Cloud x={340} y={140} o={dark ? 0.3 : 0.95} />
        <Cloud x={1000} y={100} s={0.8} o={dark ? 0.25 : 0.9} />
        {dark ? <Moon x={1260} y={140} /> : null}
      </SkyBlend>
      <Layer depth={-6}>
        <path d="M-800 650 Q-200 560 400 620 Q900 560 1500 610 Q2000 580 2400 640 L2400 900 L-800 900 Z" fill={dark ? '#4d6a74' : '#a9cfa0'} />
        {city ? <g transform="translate(1260 610) scale(0.3)"><TinyCity /></g> : null}
        <path d="M-800 700 Q0 650 800 690 Q1600 650 2400 700 L2400 900 L-800 900 Z" fill={dark ? '#3f5d55' : '#8fc27a'} />
      </Layer>
      <path d="M-800 760 Q400 740 2400 765 L2400 1500 L-800 1500 Z" fill="url(#st-grass)" stroke={INK} strokeWidth={5} />
      {dark ? <rect x={-800} y={700} width={3200} height={800} fill="#0b1640" opacity={0.3} pointerEvents="none" /> : null}
    </>
  );
}

type TinyProps = PersonProps & { x: number; y: number; s?: number; o?: number; delay?: number; dur?: number; flip?: boolean; anim?: string };
const TINY = 0.34;
const crowd = (i: number) => LILLIPUTIANS[i % LILLIPUTIANS.length];

/** A finger-sized person. The animation class sits on an inner group, never on the moving one. */
function Tiny({ x, y, s = TINY, o, delay = 0, dur, flip, anim, ...person }: TinyProps) {
  return (
    <Move x={x} y={y} s={s} o={o} delay={delay} dur={dur} flip={flip}>
      <g className={anim} style={anim ? { animationDelay: `${(x % 7) * 0.08}s` } : undefined}><Person {...person} /></g>
    </Move>
  );
}

function Zzz({ on }: { on: boolean }) {
  return on ? (
    <g className="story-zzz" pointerEvents="none">
      <text fontSize={64} fontWeight={900} fill="#ffffff" stroke={INK} strokeWidth={3}>Z</text>
      <text x={46} y={-52} fontSize={46} fontWeight={900} fill="#ffffff" stroke={INK} strokeWidth={3}>z</text>
      <text x={82} y={-94} fontSize={32} fontWeight={900} fill="#ffffff" stroke={INK} strokeWidth={2.5}>z</text>
    </g>
  ) : null;
}

/** Little arrows flying left, like needles. */
function FlyingArrows({ on, n = 5 }: { on: boolean; n?: number }) {
  return on ? (
    <g pointerEvents="none">
      {Array.from({ length: n }, (_, i) => (
        <g key={i} transform={`translate(${(i % 3) * 60} ${i * 34 - 60}) rotate(${-8 + (i % 3) * 8})`}>
          <g className="story-notes-fly" style={{ animationDelay: `${i * 0.37}s` }}>
            <path d="M0 0 L60 0" stroke={INK} strokeWidth={5} strokeLinecap="round" />
            <path d="M-12 0 L4 -7 L4 7 Z" fill="#c7d0d6" stroke={INK} strokeWidth={2} />
            <path d="M56 0 L68 -8 M56 0 L68 8" stroke="#c23b2e" strokeWidth={4} strokeLinecap="round" />
          </g>
        </g>
      ))}
    </g>
  ) : null;
}

/* ---------------------------------------------------------------- 1 */

function StormScene({ beat }: SceneProps) {
  const atSea = beat <= 2;
  const storm = beat === 1 || beat === 2;
  const cam = pick<Cam>(beat, [[800, 450, 1], [800, 450, 1.05], [840, 520, 1.15], [720, 540, 1.1], [1100, 560, 1.3]]);
  return (
    <Camera fx={cam[0]} fy={cam[1]} s={cam[2]} shake={beat === 1}>
      <Place on={atSea}>
        <SkyBlend time={storm ? 'storm' : 'evening'}>
          <Sun x={1250} y={storm ? 760 : 300} />
          <Cloud x={300} y={150} o={storm ? 0 : 0.9} />
        </SkyBlend>
        <Layer depth={-6}><path d="M-300 630 Q-60 540 260 600 Q380 620 420 630 Z" fill={storm ? '#4a5876' : '#c9a6a0'} /></Layer>
        <g style={{ opacity: storm ? 1 : 0, transition: 'opacity 1.2s ease' }} pointerEvents={storm ? undefined : 'none'}>
          <Hotspot id="storm" label="storm" cx={860} cy={230} rx={460} ry={130}>
            <path d="M920 270 L880 370 L920 370 L870 500" fill="none" stroke="#fff6b0" strokeWidth={12} strokeLinejoin="round" className="story-bolt" />
            <g style={{ animationDelay: '1.4s' }} className="story-bolt">
              <path d="M580 280 L550 360 L580 360 L540 450" fill="none" stroke="#fff6b0" strokeWidth={9} strokeLinejoin="round" />
            </g>
            <Cloud x={540} y={240} s={1.6} color="#5c6880" shade="#3f4a62" />
            <Cloud x={1220} y={250} s={1.5} color="#5c6880" shade="#3f4a62" />
            <Cloud x={880} y={210} s={1.9} color="#4f5a72" shade="#363f55" />
          </Hotspot>
        </g>
        <Sea y={620} color={storm ? '#2a5f86' : '#2f86c0'} deep={storm ? '#173f5f' : '#1d5f93'} light={storm ? '#6f9fc8' : '#8fd3f4'} />
        <Move x={pick(beat, [760, 800, 800])} y={700} r={beat === 1 ? -10 : 0} o={beat === 2 ? 0 : 1} dur={1.4}>
          <Hotspot id="ship" label="ship" cy={-150} rx={230} ry={190}>
            <Ship>
              <Person {...GULLIVER} wave={beat === 0} mood={beat === 1 ? 'surprised' : 'smile'} />
              <g transform="translate(-250 0)"><Person {...SAILOR} mood={beat === 1 ? 'shout' : 'smile'} /></g>
            </Ship>
          </Hotspot>
        </Move>
        <g style={{ opacity: beat === 2 ? 1 : 0, transition: 'opacity .6s ease .3s' }} pointerEvents="none">
          {[[480, 650, -70], [1120, 660, 12], [1260, 640, -20], [620, 700, 8]].map(([x, y, r], i) => (
            <g key={i} transform={`translate(${x} ${y}) rotate(${r})`}>
              <g className="story-bob" style={{ animationDelay: `${i * 0.2}s` }}>
                {i === 0 ? (
                  <g>
                    <rect x={-8} y={-220} width={16} height={220} fill="url(#st-wood-dark)" stroke={INK} strokeWidth={3} />
                    <path d="M8 -200 Q90 -170 70 -90 L30 -120 L8 -100 Z" fill="url(#st-sail)" stroke={INK} strokeWidth={4} />
                  </g>
                ) : <rect x={-70} y={-12} width={140} height={24} rx={6} fill="url(#st-wood)" stroke={INK} strokeWidth={4} />}
              </g>
            </g>
          ))}
        </g>
        <g style={{ opacity: storm ? 1 : 0, transition: 'opacity .8s ease' }} pointerEvents={storm ? undefined : 'none'}>
          <Hotspot id="waves" label="wave" cx={820} cy={740} rx={560} ry={110}>
            <Move y={beat === 1 ? 70 : 0}>
              {[[340, 820, 1], [1300, 800, 1.1], [820, 860, 1.3]].map(([x, y, s], i) => (
                <g key={i} transform={`translate(${x} ${y}) scale(${s})`}>
                  <g className="story-bob" style={{ animationDelay: `${i * 0.3}s` }}><BigWave /></g>
                </g>
              ))}
            </Move>
          </Hotspot>
        </g>
        <Move x={beat === 2 ? 860 : 760} y={660} o={beat === 2 ? 1 : 0} dur={1.6}>
          <Hotspot id="gulliver" label="swim" cy={-70} rx={200} ry={120}>
            <g className="story-bob"><Swimmer /></g>
          </Hotspot>
        </Move>
      </Place>
      <Place on={!atSea}>
        <SkyBlend time="night"><Moon x={1260} y={260} /></SkyBlend>
        <g pointerEvents="none">
          {[[420, 330], [600, 420], [780, 300], [960, 380], [1120, 450], [1400, 360], [1520, 470], [700, 520]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={3} fill="#fff8d6" className="story-twinkle" style={{ animationDelay: `${i * 0.35}s` }} />
          ))}
        </g>
        <Sea y={640} color="#2a5f86" deep="#173f5f" light="#6f9fc8" />
        <path d="M380 1000 Q560 690 820 680 L2400 680 L2400 1500 L380 1500 Z" fill="url(#st-sand)" stroke={INK} strokeWidth={5} />
        <Hotspot id="grass" label="grass" cx={1180} cy={700} rx={400} ry={90}>
          <path d="M700 1500 Q820 820 960 700 Q1060 640 1240 644 L2400 640 L2400 1500 Z" fill="url(#st-grass)" stroke={INK} strokeWidth={5} />
          {[900, 1010, 1300, 1420, 1540].map((x, i) => (
            <path key={x} d={`M${x} ${700 + (i % 2) * 30} q-14 -40 -4 -60 q6 30 14 34 q6 -34 18 -44 q-2 34 -4 70 Z`} fill="#4f8a3a" />
          ))}
        </Hotspot>
        <Move x={beat === 3 ? 700 : 820} y={756} s={1.1} o={beat === 3 ? 1 : 0} dur={1.6}>
          <g className="story-walk"><Person {...GULLIVER} mood="sad" /></g>
          <g transform="translate(20 -190)"><Drops on={beat === 3} /></g>
        </Move>
        <Move x={1130} y={730} s={0.4} o={beat === 4 ? 1 : 0}>
          <GiantLying eyes="closed" mouth="sleep" />
          <g transform="translate(-420 -420) scale(2.4)"><Zzz on={beat === 4} /></g>
        </Move>
        {beat === 4 ? (
          <g pointerEvents="none">
            {[[1420, 690], [1480, 706], [1330, 712]].map(([x, y], i) => (
              <g key={i} transform={`translate(${x} ${y})`}>
                <g className="story-blink" style={{ animationDelay: `${i * 0.7}s` }}>
                  <circle cx={-5} cy={0} r={3.5} fill="#ffe27a" />
                  <circle cx={5} cy={0} r={3.5} fill="#ffe27a" />
                </g>
              </g>
            ))}
          </g>
        ) : null}
        <Night on={beat === 4} strength={0.18} />
      </Place>
    </Camera>
  );
}

/* ---------------------------------------------------------------- 2 */

const ARCHERS: Point[] = [[-640, 70], [-560, 110], [-470, 72], [-380, 112], [-290, 74], [-200, 114], [-110, 76], [-20, 114], [70, 76], [160, 112], [250, 74], [340, 110], [430, 76], [520, 108], [-150, -296], [200, -232]];

function TiedScene({ beat, bubble, effort = 0 }: SceneProps) {
  const cam = pick<Cam>(beat, [[820, 520, 1], [820, 540, 1.05], [800, 470, 1.6], [800, 440, 2.4], [760, 540, 1], [560, 540, 1.35]]);
  const archers = beat >= 4;
  return (
    <Camera fx={cam[0]} fy={cam[1]} s={cam[2]} shake={beat === 0}>
      <Fields time="day" city={false} />
      <g transform="translate(900 760) scale(0.95)">
        <GiantLying
          eyes={pick(beat, ['wide', 'wide', 'open', 'wide', 'squint', 'happy'] as const)}
          mouth={pick(beat, ['o', 'frown', 'o', 'o', 'ouch', 'smile'] as const)}
          near={beat === 5 ? { to: [-400, -190], bend: 1, hand: 'open' } : { to: [0, -244], hand: beat === 3 ? 'finger' : 'fist' }}
          faceSpot={{ id: 'face', label: 'face' }} chestSpot={{ id: 'chest', label: 'chest' }}
          stings={beat === 4 ? 1 - effort : 0} />
        <Hotspot id="ropes" label="rope" cx={300} cy={-110} rx={260} ry={120}><LyingRopes /></Hotspot>
        <Move x={beat >= 2 ? -130 : 620} y={beat >= 2 ? -298 : -262} s={TINY} o={beat >= 2 ? 1 : 0} dur={2.4}>
          <Hotspot id="tinyman" label="finger" cy={-120} rx={110} ry={170}>
            <g className={beat === 2 ? 'story-walk' : undefined}>
              <Person tunic="#e5483a" hair="#3b2416" trim="#f4c542" wave={beat === 3} armsUp={beat === 4} mood={beat === 4 ? 'shout' : 'smile'} />
            </g>
          </Hotspot>
          <g transform="translate(-20 -280) scale(2.4)"><Wonder on={beat === 2} /></g>
        </Move>
        <Hotspot id="archers" label="arrow" cx={-60} cy={60} rx={640} ry={70}>
          {ARCHERS.map(([x, y], i) => (
            <Move key={i} x={x} y={y} s={TINY} o={archers ? 1 : 0} delay={i * 0.04} flip={i % 3 === 0}>
              <g className={beat === 5 ? undefined : 'story-tremble'}><Archer mood={beat === 5 ? 'surprised' : 'shout'} /></g>
            </Move>
          ))}
        </Hotspot>
        <g transform={`translate(${LYING_HEAD[0] + 160} ${LYING_HEAD[1] - 40})`}><FlyingArrows on={beat === 4} /></g>
      </g>
      <ForegroundGrass y={990} />
      <SpeechAt bubble={bubble} at={{ Gulliver: [460, 360] }} />
    </Camera>
  );
}

/* ---------------------------------------------------------------- 3 */

function FoodScene({ beat, bubble }: SceneProps) {
  const onRoad = beat >= 5;
  const cam = pick<Cam>(beat, [[560, 500, 1.3], [700, 540, 1.05], [560, 480, 1.45], [620, 420, 1.15], [860, 560, 0.95], [720, 600, 1.1]]);
  const loaves = (
    <g transform="translate(-70 54)">
      {[-26, 0, 26].map((x) => <g key={x} transform={`translate(${x} ${Math.abs(x) / 3})`}><Loaf /></g>)}
    </g>
  );
  const barrel = (
    <g transform="translate(-60 40) rotate(-70)">
      <Hotspot id="barrel" label="barrel" cy={-42} rx={70} ry={70}><Barrel /></Hotspot>
    </g>
  );
  const dancers = (
    <g transform="translate(10 -36)">
      {[-44, 6, 54].map((x, i) => (
        <g key={x} transform={`translate(${x} 0) scale(${TINY})`}>
          <g className="story-hop" style={{ animationDelay: `${i * 0.18}s` }}><Person {...crowd(i + 2)} armsUp mood="laugh" /></g>
        </g>
      ))}
    </g>
  );
  return (
    <Camera fx={cam[0]} fy={cam[1]} s={cam[2]}>
      <Place on={!onRoad}>
        <Fields time="day" city={false} />
        <g transform="translate(900 760) scale(0.95)">
          <Move x={beat === 4 ? -40 : 1900} y={0} o={beat === 4 ? 1 : 0} dur={1.8}>
            <Hotspot id="wagon" label="wagon" cx={0} cy={-60} rx={700} ry={70}><Wagon /></Hotspot>
          </Move>
          {beat === 4 ? (
            <g>
              {[-560, 340].map((x) => (
                <g key={x}>
                  <rect x={x - 8} y={-560} width={16} height={580} fill="url(#st-wood-dark)" stroke={INK} strokeWidth={3} />
                  <path d={`M${x} -550 L${x + 120} -260 M${x} -550 L${x - 110} -10`} stroke="#e2c48a" strokeWidth={4} />
                  <circle cx={x} cy={-550} r={18} fill="#c48a4e" stroke={INK} strokeWidth={3} />
                </g>
              ))}
            </g>
          ) : null}
          <Move y={beat === 4 ? -96 : 0} dur={1.6}>
            <GiantLying
              eyes={pick(beat, ['wide', 'open', 'happy', 'happy', 'closed'] as const)}
              mouth={pick(beat, ['open', 'smile', 'chew', 'o', 'sleep'] as const)}
              near={pick(beat, [
                { to: [-320, -310], bend: 1, hand: 'point', turn: -66 },
                { to: [150, -30] },
                { to: [-340, -200], bend: 1, hand: 'fist', holding: loaves },
                { to: [-340, -200], bend: 1, hand: 'fist', holding: barrel },
                { to: [150, -30] },
              ])}
              far={beat === 3 ? { to: [-140, -500], hand: 'palm', holding: dancers } : undefined} />
            {beat <= 3 ? <LyingRopes /> : null}
            <g transform={`translate(${LYING_HEAD[0] + 60} ${LYING_HEAD[1] - 230})`}><Zzz on={beat === 4} /></g>
            {beat === 0 ? (
              <g transform="translate(60 -340)" pointerEvents="none">
                <g className="story-tremble">
                  <path d="M-40 0 q10 -14 20 0 t20 0 t20 0 t20 0 M-30 -24 q10 -14 20 0 t20 0 t20 0" fill="none" stroke={INK} strokeWidth={5} strokeLinecap="round" />
                </g>
              </g>
            ) : null}
          </Move>
          <g style={{ opacity: beat >= 1 && beat <= 3 ? 1 : 0, transition: 'opacity .8s ease' }} pointerEvents={beat >= 1 && beat <= 3 ? undefined : 'none'}>
            {[[-200, 12], [30, 4]].map(([x, r]) => (
              <g key={x} transform={`translate(${x} 40) rotate(${r})`}><Ladder h={310} /></g>
            ))}
            <Tiny x={-196} y={-110} {...crowd(0)} anim="story-bob" holding={<g transform="translate(-40 -40) scale(0.9)"><Basket /></g>} />
            <Tiny x={34} y={-150} {...crowd(1)} anim="story-bob" holding={<g transform="translate(-40 -40) scale(0.9)"><Basket /></g>} />
            <Tiny x={-60} y={-298} {...crowd(4)} armsUp mood="laugh" />
            <Tiny x={-220} y={-272} {...crowd(2)} mood="laugh" />
            <g transform="translate(-320 -248) scale(0.75)">
              <Hotspot id="basket" label="basket" cy={-36} rx={90} ry={80}><Basket /></Hotspot>
            </g>
            {[60, 140, 220].map((x, i) => <Tiny key={x} x={x - 700} y={70 + (i % 2) * 30} {...crowd(i + 3)} anim="story-bob" holding={<g transform="translate(-30 -60) scale(0.7)"><Barrel /></g>} />)}
          </g>
          {[-600, -480, -360, -240, 120, 240, 360, 480].map((x, i) => (
            <Tiny key={x} x={x} y={70 + (i % 2) * 40} {...crowd(i)} o={beat === 4 ? 1 : 0} delay={i * 0.05} anim="story-pull" armsUp />
          ))}
        </g>
        <ForegroundGrass y={990} />
      </Place>
      <Place on={onRoad}>
        <Fields time="day" city={false} />
        <g transform="translate(150 700) scale(0.62)"><TinyCity /></g>
        <path d="M-800 820 Q600 780 2400 830" fill="none" stroke="#d9c79a" strokeWidth={70} />
        <g transform="translate(1150 800) scale(0.55)">
          <Wagon rolling />
          <g transform="translate(0 -96)">
            <GiantLying eyes="closed" mouth="sleep" />
            <g transform={`translate(${LYING_HEAD[0] + 60} ${LYING_HEAD[1] - 230})`}><Zzz on /></g>
          </g>
        </g>
        <Hotspot id="horses" label="horse" cx={520} cy={760} rx={260} ry={90}>
          {[0, 1, 2].map((row) => [0, 1, 2, 3, 4].map((col) => {
            const x = 300 + col * 92 + row * 26;
            const y = 756 + row * 32;
            return (
              <g key={`${row}-${col}`}>
                <path d={`M${x + 36} ${y - 36} L${690 + row * 10} ${762}`} stroke="#e2c48a" strokeWidth={3} />
                <g transform={`translate(${x} ${y}) scale(0.2)`}><Horse run /></g>
              </g>
            );
          }))}
        </Hotspot>
        <ForegroundGrass y={990} />
      </Place>
      <SpeechAt bubble={bubble} at={{ Gulliver: [470, 330] }} />
    </Camera>
  );
}

/* ---------------------------------------------------------------- 4 */

function PocketsScene({ beat, bubble }: SceneProps) {
  const cam = pick<Cam>(beat, [[460, 560, 1.25], [800, 480, 1.05], [880, 640, 1.6], [720, 680, 1.45], [640, 660, 1.35], [780, 480, 1]]);
  const officerA: Point = pick(beat, [[880, 800], [880, 800], [884, 724], [600, 800], [640, 800], [600, 800]]);
  const officerB: Point = pick(beat, [[880, 800], [880, 800], [880, 800], [830, 800], [740, 800], [652, 800]]);
  return (
    <Camera fx={cam[0]} fy={cam[1]} s={cam[2]}>
      <Fields time="day" city={false} />
      <g transform="translate(430 790) scale(0.85)"><TinyCity /></g>
      {[0, 1, 2, 3, 4].map((i) => (
        <Tiny key={i} x={300 + i * 70} y={812} {...crowd(i)} wave={beat <= 1 && i % 2 === 0} mood={beat === 3 ? 'surprised' : 'laugh'} anim={beat === 0 ? 'story-bob' : undefined} />
      ))}
      <g transform="translate(1080 800) scale(0.8)">
        <Giant sit
          eyes={pick(beat, ['open', 'open', 'happy', 'wide', 'open', 'open'] as const)}
          mouth={pick(beat, ['smile', 'smile', 'grin', 'o', 'smile', 'grin'] as const)}
          left={beat >= 2 ? { to: [-420, -60], hand: 'open' } : { to: [-330, -170] }}
          right={{ to: [330, -170] }}
          pocketSpot={{ id: 'pocket', label: 'pocket' }}
          pocket={beat === 2 ? <g transform="translate(10 44) scale(0.44)"><Person {...OFFICER} armsUp mood="surprised" /></g> : undefined} />
      </g>
      {beat === 2 ? <g transform="translate(872 802) rotate(9)"><Ladder h={176} /></g> : null}
      <Move x={pick(beat, [650, 700, 300, 270])} y={810} dur={1.8} flip>
        <Hotspot id="emperor" label="emperor" cy={-110} rx={150} ry={130}>
          <g transform="scale(0.32)"><Horse rider={<Emperor mood={beat === 1 ? 'shout' : 'smile'} wave={beat === 1} />} /></g>
        </Hotspot>
      </Move>
      <Move x={720} y={810} s={0.9} o={beat >= 3 ? 1 : 0}>
        <Hotspot id="box" label="box" cy={-90} rx={150} ry={110}><SnuffBox dust={beat === 3} /></Hotspot>
      </Move>
      {beat === 3 ? <g transform="translate(720 590) scale(0.6)"><Shout text="ACHOO!" on color="#ffe0b0" /></g> : null}
      <Move x={540} y={810} s={0.8} o={beat >= 4 ? 1 : 0}>
        <Hotspot id="watch" label="machine" cy={-110} rx={130} ry={130}><PocketWatch /></Hotspot>
        {beat === 4 ? (
          <g transform="translate(120 -260)" pointerEvents="none">
            <g className="story-float"><text fontSize={40} fontWeight={900} fill="#ffffff" stroke={INK} strokeWidth={3}>tick!</text></g>
          </g>
        ) : null}
      </Move>
      {[officerA, officerB].map(([x, y], i) => (
        <Move key={i} x={x} y={y} s={TINY} o={beat >= 2 && !(beat === 2 && i === 1) ? 1 : 0} dur={1.4} flip={i === 1}>
          <Hotspot id="officers" label="officer" cy={-120} rx={90} ry={150}>
            <g className={beat === 3 ? 'story-tremble' : beat === 2 ? 'story-bob' : undefined}>
              <Person {...OFFICER} hair={i ? '#7a5530' : OFFICER.hair}
                armsUp={beat === 4} mood={pick(beat, ['smile', 'smile', 'smile', 'shout', 'surprised', 'surprised'] as const)} />
            </g>
          </Hotspot>
        </Move>
      ))}
      <ForegroundGrass y={980} />
      <SpeechAt bubble={bubble} at={{ Emperor: [640, 560], Officer: [620, 600] }} />
    </Camera>
  );
}

/* ---------------------------------------------------------------- 5 */

function EggsScene({ beat, bubble }: SceneProps) {
  const onMap = beat === 2;
  const cam = pick<Cam>(beat, [[880, 480, 1], [960, 290, 1.6], [800, 450, 1], [620, 660, 1.5], [620, 660, 1.5], [860, 470, 1], [1000, 340, 1.25]]);
  const minister = (
    <Hotspot id="minister" label="minister" cy={-80} rx={70} ry={110}>
      <g transform="translate(0 -36) scale(0.44)"><Minister mood="smile" /></g>
    </Hotspot>
  );
  const giant = (
    <g>
      <Giant sit
        eyes={pick(beat, ['happy', 'open', 'open', 'wide', 'open', 'open', 'squint'] as const)}
        mouth={pick(beat, ['grin', 'o', 'o', 'o', 'smile', 'smile', 'puff'] as const)}
        blush={beat === 6}
        left={beat === 1 ? { to: [-250, -640], hand: 'palm', holding: minister } : undefined}
        right={beat === 6 ? { to: [30, -688], hand: 'open' } : undefined} />
      <g transform="translate(0 -752) scale(3)"><Drops on={beat === 6} tears /></g>
    </g>
  );
  return (
    <Camera fx={cam[0]} fy={cam[1]} s={cam[2]}>
      <Place on={!onMap}>
        <Fields time="day" city={false} />
        <g transform="translate(230 790) scale(0.7)"><TinyCity /></g>
        <g transform="translate(1080 820) scale(0.8)">
          {beat >= 3 ? <Hotspot id="gulliver" label="laugh" cx={0} cy={-720} rx={300} ry={240}>{giant}</Hotspot> : giant}
          {beat === 0 ? (
            <g>
              {[[-330, -262], [330, -262], [170, -640], [-100, -300]].map(([x, y], i) => (
                <Move key={i} x={x} y={y} s={0.44}>
                  <g className="story-bob" style={{ animationDelay: `${i * 0.2}s` }}><Person {...crowd(i)} wave={i % 2 === 0} mood="laugh" /></g>
                </Move>
              ))}
              <g transform="translate(160 -980)"><Hearts on /></g>
            </g>
          ) : null}
        </g>
        {[0, 1, 2].map((i) => (
          <Tiny key={i} x={420 + i * 64} y={830} {...crowd(i + 3)} o={beat === 0 || beat === 3 ? 1 : 0} mood="laugh" anim={beat === 0 ? 'story-bob' : undefined} />
        ))}
        <g style={{ opacity: beat >= 3 ? 1 : 0, transition: 'opacity .6s ease' }} pointerEvents={beat >= 3 ? undefined : 'none'}>
          <rect x={500} y={826} width={420} height={18} rx={6} fill="url(#st-wood)" stroke={INK} strokeWidth={4} />
          <Move x={620} y={826} s={0.8}>
            <Hotspot id="egg" label="egg" cy={-110} rx={110} ry={140}><Egg cracked={beat >= 4} /></Hotspot>
            <g transform="translate(0 -150)"><Sparkles on={beat === 3} spread={90} /></g>
            {beat === 3 ? <g transform="translate(-10 -290)"><Wonder on /></g> : null}
          </Move>
          <Move x={820} y={826} s={0.8} o={beat >= 5 ? 1 : 0}>
            <Egg bigEndUp cracked />
          </Move>
          <Tiny x={530} y={830} {...crowd(0)} o={beat >= 4 ? 1 : 0} armsUp={beat === 4} mood="laugh" />
          <Tiny x={900} y={830} {...BLEFUSCANS[0]} o={beat >= 5 ? 1 : 0} armsUp={beat === 5} mood="shout" flip />
          {beat >= 4 ? (
            <g pointerEvents="none">
              <g transform="translate(560 560)">
                <rect x={-80} y={-26} width={160} height={40} rx={20} fill="#ffffff" stroke={INK} strokeWidth={3} />
                <text x={0} y={4} textAnchor="middle" fontSize={24} fontWeight={900} fill="#c23b2e">small end</text>
              </g>
              {beat >= 5 ? (
                <g transform="translate(880 560)">
                  <rect x={-72} y={-26} width={144} height={40} rx={20} fill="#ffffff" stroke={INK} strokeWidth={3} />
                  <text x={0} y={4} textAnchor="middle" fontSize={24} fontWeight={900} fill="#2f6fb0">big end</text>
                </g>
              ) : null}
            </g>
          ) : null}
        </g>
        <ForegroundGrass y={990} />
      </Place>
      <Place on={onMap}>
        <SkyBlend time="day"><Cloud x={800} y={130} /></SkyBlend>
        <Sea y={560} />
        <g transform="translate(430 650) scale(0.9)"><Kingdom flag="#e5483a" roof="#c23b2e" name="LILLIPUT" /></g>
        <g transform="translate(1170 650) scale(0.9)">
          <Hotspot id="island" label="island" cx={0} cy={-90} rx={330} ry={150}>
            <Kingdom flag="#2f6fb0" roof="#2f6fb0" name="BLEFUSCU" />
          </Hotspot>
        </g>
        {[[680, 640, '#c23b2e'], [740, 690, '#c23b2e'], [880, 650, '#2f6fb0'], [940, 700, '#2f6fb0']].map(([x, y, stripe], i) => (
          <g key={i} transform={`translate(${x} ${y}) scale(${i < 2 ? -0.18 : 0.18} 0.18)`}><Ship stripe={stripe as string} /></g>
        ))}
        <g transform="translate(800 400) scale(0.8)"><Shout text="WAR!" on color="#ff8a5c" /></g>
      </Place>
      <SpeechAt bubble={bubble} at={{ Gulliver: [800, 250] }} />
    </Camera>
  );
}

/* ---------------------------------------------------------------- 6 */

const FLEET: Point[] = Array.from({ length: 15 }, (_, i) => [960 + (i % 5) * 66 + Math.floor(i / 5) * 26, 650 + Math.floor(i / 5) * 36]);
const WADE_S = 0.55;
/** The wading giant's feet sit this far below the water line (y = 600), so the sea reaches his chest. */
const WADE_Y = 1040;
const WADE_X = 760;
/** Where his right hand holds the tow ropes at beat 4, in giant coordinates. */
const TOW_HAND: Point = [330, -880];

function FleetScene({ beat, bubble }: SceneProps) {
  const cam = pick<Cam>(beat, [[820, 470, 1], [500, 500, 1.25], [820, 480, 1], [900, 470, 1.2], [840, 500, 1.05], [660, 470, 1.05]]);
  const wading = beat >= 2;
  // Beats 4-5 pull the fleet back to Lilliput: giant and ships slide together so the tow ropes stay taut.
  const pull = pick(beat, [0, 0, 0, 0, -120, -180]);
  const wadeX = beat === 2 ? 680 : WADE_X + pull;
  const hand: Point = [WADE_X + TOW_HAND[0] * WADE_S, WADE_Y + TOW_HAND[1] * WADE_S];
  const hooks = <g transform="translate(10 40) scale(0.7)"><Hook /></g>;
  return (
    <Camera fx={cam[0]} fy={cam[1]} s={cam[2]}>
      <SkyBlend time="day"><Cloud x={700} y={130} /><Cloud x={1300} y={170} s={0.7} /></SkyBlend>
      <g transform="translate(1560 600)">
        <path d="M-300 0 Q-200 -180 40 -190 Q260 -170 420 0 Z" fill="url(#st-grass-far)" stroke={INK} strokeWidth={5} />
        <g transform="translate(40 -160) scale(0.4)"><TinyCity flag="#2f6fb0" /></g>
      </g>
      {/* Wading: drawn before the sea, so the water covers him up to his chest. */}
      <Place on={wading}>
        <Move x={wadeX} y={WADE_Y} s={WADE_S} dur={1.8}>
          <Giant glasses={beat >= 3} glassesSpot={beat === 3}
            eyes={pick(beat, ['open', 'open', 'open', 'squint', 'open', 'happy'] as const)}
            mouth={pick(beat, ['smile', 'smile', 'smile', 'frown', 'grin', 'grin'] as const)}
            right={pick(beat, [
              undefined,
              undefined,
              undefined,
              { to: [380, -1000], hand: 'fist', holding: <Hotspot id="ropes" label="rope" cy={-10} rx={90} ry={60}><RopeCoil /></Hotspot> },
              { to: TOW_HAND, hand: 'fist' },
              { to: [360, -1260], hand: 'open' },
            ])} />
        </Move>
      </Place>
      <Sea y={600} />
      {wading ? (
        <Move x={wadeX} y={604} dur={1.8}>
          <g className="story-wake"><ellipse cx={0} cy={0} rx={200} ry={18} fill="none" stroke="#e8f8ff" strokeWidth={6} /></g>
        </Move>
      ) : null}
      <Hotspot id="sea" label="sea" cx={900} cy={740} rx={420} ry={90}><rect x={480} y={730} width={840} height={4} fill="transparent" /></Hotspot>
      <path d="M-800 588 Q120 566 400 594 Q540 610 600 900 L-800 900 Z" fill="url(#st-sand)" stroke={INK} strokeWidth={5} />
      <g transform="translate(-20 600) scale(0.5)"><TinyCity /></g>
      {/* Sitting on the beach: drawn after the sand, in front of it. */}
      <Place on={!wading}>
        <g transform="translate(360 650) scale(0.5)">
          <Giant sit
            eyes={beat === 0 ? 'wide' : 'happy'}
            mouth={beat === 0 ? 'o' : 'grin'}
            right={beat === 1 ? { to: [160, -560], hand: 'fist', holding: hooks } : undefined} />
        </g>
        {beat === 1 ? (
          <g transform="translate(510 766)">
            <Hotspot id="hooks" label="hook" cy={-30} rx={100} ry={56}>
              {[[-50, 0, -20], [-16, 6, 10], [20, 0, -30], [54, 6, 20], [0, -18, 0]].map(([x, y, r], i) => (
                <g key={i} transform={`translate(${x} ${y}) rotate(${r}) scale(0.4)`}><Hook /></g>
              ))}
            </Hotspot>
          </g>
        ) : null}
      </Place>
      <Move x={pull} dur={1.8}>
        <Hotspot id="fleet" label="ship" cx={1110} cy={650} rx={210} ry={90}>
          {FLEET.map(([x, y], i) => (
            <Move key={i} x={x} y={y} s={0.2} flip>
              <WarShip />
            </Move>
          ))}
        </Hotspot>
        {beat === 4 ? (
          <g className="story-place-in" style={{ animationDelay: '0.9s' }}>
            <Hotspot id="ropes" label="rope" cx={1060} cy={600} rx={200} ry={70}>
              {FLEET.map(([x, y], i) => {
                const d = `M${hand[0]} ${hand[1]} Q${(hand[0] + x) / 2} ${hand[1] + 16} ${x - 40} ${y - 30}`;
                return (
                  <g key={i}>
                    <path d={d} fill="none" stroke={INK} strokeWidth={6} strokeLinecap="round" />
                    <path d={d} fill="none" stroke="#e2c48a" strokeWidth={3} strokeLinecap="round" />
                  </g>
                );
              })}
            </Hotspot>
          </g>
        ) : null}
      </Move>
      <g transform={`translate(${WADE_X + 140} ${WADE_Y - 1140 * WADE_S - 20})`}><FlyingArrows on={beat === 3} n={6} /></g>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <Tiny key={i} x={200 + i * 46} y={724 + (i % 2) * 18} s={0.2} {...crowd(i)} armsUp={beat === 5} wave={beat >= 1 && beat <= 4 && i % 2 === 0}
          mood={pick(beat, ['surprised', 'smile', 'smile', 'surprised', 'smile', 'laugh'] as const)} anim={beat === 5 ? 'story-hop' : undefined} />
      ))}
      <SpeechAt bubble={bubble} at={{ People: [300, 400], Gulliver: [600, 300] }} />
    </Camera>
  );
}

/* ---------------------------------------------------------------- 7 */

function FireScene({ beat, bubble }: SceneProps) {
  const cam = pick<Cam>(beat, [[740, 450, 1], [700, 470, 1.05], [660, 600, 1.35], [820, 440, 0.95], [840, 420, 1], [700, 500, 1.1], [600, 640, 1.35]]);
  const fire = pick<0 | 1 | 2>(beat, [1, 1, 1, 2, 2, 0, 0]);
  const pouring = beat === 4;
  const hat = (
    <g transform="translate(-40 -30) rotate(-38)">
      <Hotspot id="hat" label="hat" cy={-20} rx={180} ry={90}><Tricorn water={beat === 4} /></Hotspot>
    </g>
  );
  return (
    <Camera fx={cam[0]} fy={cam[1]} s={cam[2]} shake={beat === 5}>
      <Sky top="#141d45" bottom="#3d4f8a">
        <Moon x={260} y={140} />
      </Sky>
      <Night on strength={0.15} />
      <Layer depth={-6}>
        <path d="M-800 700 Q0 640 800 690 Q1600 640 2400 700 L2400 900 L-800 900 Z" fill="#2f4a52" />
      </Layer>
      <path d="M-800 800 Q400 785 2400 805 L2400 1500 L-800 1500 Z" fill="#3f6a45" stroke={INK} strokeWidth={5} />
      <ellipse cx={1420} cy={830} rx={300} ry={44} fill="#3a6fa8" stroke={INK} strokeWidth={4} />
      <ellipse cx={1380} cy={824} rx={120} ry={10} fill="#bcd7f0" opacity={0.6} />
      {[[140, '#f4a93b'], [300, '#f7c6d9'], [930, '#d6f0b8'], [1000, '#fff1c4']].map(([x, wall]) => (
        <g key={x} transform={`translate(${x} 800) scale(0.8)`}>
          <rect x={-40} y={-90} width={80} height={90} fill={wall as string} stroke={INK} strokeWidth={4} />
          <path d="M-50 -86 L0 -140 L50 -86 Z" fill="#7a4a24" stroke={INK} strokeWidth={4} />
          <rect x={-12} y={-64} width={24} height={24} fill="#ffd76a" stroke={INK} strokeWidth={3} />
        </g>
      ))}
      <Hotspot id="bells" label="bell" cx={300} cy={620} rx={150} ry={150}>
        <g transform="translate(220 800) scale(0.75)"><TinyBellTower ringing={beat <= 1} /></g>
        <g transform="translate(380 800) scale(0.6)"><TinyBellTower ringing={beat <= 1} roof="#2f6fb0" /></g>
      </Hotspot>
      <g transform="translate(640 800)">
        <Hotspot id="palace" label="palace" cy={-200} rx={240} ry={220}><RoyalPalace fire={fire} wet={beat >= 5} /></Hotspot>
      </g>
      <Move x={1040} y={800} s={0.56}>
        <Giant
          eyes={pick(beat, ['wide', 'wide', 'open', 'wide', 'open', 'happy', 'wide'] as const)}
          mouth={pick(beat, ['o', 'o', 'frown', 'frown', 'smile', 'grin', 'o'] as const)}
          sweat={beat === 3 || beat === 6}
          left={pouring ? { to: [-446, -750], hand: 'fist', holding: hat } : undefined} />
        {!pouring ? <g transform="translate(0 -1232)"><Hotspot id="hat" label="hat" cy={-60} rx={190} ry={90}><Tricorn /></Hotspot></g> : null}
      </Move>
      {beat === 4 ? (
        <g pointerEvents="none">
          <path d="M770 380 Q700 420 660 520" fill="none" stroke="#7ac7f0" strokeWidth={34} strokeLinecap="round" />
          <path d="M770 380 Q700 420 660 520" fill="none" stroke="#e8f8ff" strokeWidth={10} strokeDasharray="26 16" strokeLinecap="round" className="story-beam" />
        </g>
      ) : null}
      {beat === 5 ? (
        <g pointerEvents="none">
          {[[520, 600], [760, 590], [640, 520], [470, 720], [820, 720]].map(([x, y], i) => (
            <g key={i} transform={`translate(${x} ${y})`}><g className="story-pop"><path d="M0 -30 Q20 0 0 16 Q-20 0 0 -30 Z" fill="#7ac7f0" stroke={INK} strokeWidth={3} /></g></g>
          ))}
          <g transform="translate(640 420) scale(0.8)"><Shout text="SPLASH!" on color="#bfe8ff" /></g>
        </g>
      ) : null}
      <Hotspot id="buckets" label="bucket" cx={640} cy={800} rx={250} ry={50}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Tiny key={i} x={420 + i * 86} y={830} {...crowd(i)} o={beat >= 1 && beat <= 5 ? 1 : 0} delay={i * 0.05}
            anim={beat === 2 ? 'story-hop' : beat <= 1 ? 'story-tremble' : undefined}
            armsUp={beat === 2 && i % 2 === 0} mood={beat >= 5 ? 'laugh' : 'shout'}
            holding={beat >= 2 && beat <= 4 ? <g transform="translate(-10 0)"><Bucket splash={beat === 2 && i % 2 === 1} /></g> : undefined} />
        ))}
      </Hotspot>
      {beat === 0 ? [0, 1, 2].map((i) => <Tiny key={i} x={460 + i * 120} y={830} {...crowd(i + 2)} armsUp mood="shout" anim="story-hop" />) : null}
      {[0, 1, 2].map((i) => (
        <Move key={i} x={480 + i * 100} y={840} s={TINY} o={beat === 6 ? 1 : 0} delay={i * 0.1}>
          <Minister mood={i === 1 ? 'shout' : 'sad'} />
        </Move>
      ))}
      {beat >= 3 && beat <= 4 ? <g transform="translate(520 640)"><Flame s={0.6} /></g> : null}
      <SpeechAt bubble={bubble} at={{ People: [480, 520], Minister: [580, 640] }} />
    </Camera>
  );
}

/* ---------------------------------------------------------------- 8 */

function HomeScene({ beat, bubble, effort = 0 }: SceneProps) {
  const place = beat === 0 ? 'whisper' : beat === 1 ? 'cross' : beat <= 4 ? 'beach' : beat === 5 ? 'ship' : 'deck';
  const cam = pick<Cam>(beat, [[940, 300, 1.45], [820, 460, 1], [820, 560, 1], [820, 600, 1.15], [860, 520, 1.3], [760, 520, 1.15], [760, 600, 1.45]]);
  const dirt = beat >= 3 ? 0 : 1 - effort;
  return (
    <Camera fx={cam[0]} fy={cam[1]} s={cam[2]}>
      <Place on={place === 'whisper'}>
        <Fields time="night" />
        <g transform="translate(1080 820) scale(0.8)">
          <Giant sit eyes="wide" mouth="o" left={{ to: [-250, -640], hand: 'palm', holding: <g transform="translate(0 -36) scale(0.44)"><Minister mood="sad" /></g> }} />
        </g>
      </Place>
      <Place on={place === 'cross'}>
        <SkyBlend time="dawn"><Moon x={300} y={180} o={0.6} /></SkyBlend>
        <g transform="translate(1380 600)">
          <path d="M-260 0 Q-160 -180 40 -190 Q260 -170 400 0 Z" fill="url(#st-grass-far)" stroke={INK} strokeWidth={5} />
          <g transform="translate(40 -160) scale(0.4)"><TinyCity flag="#2f6fb0" /></g>
        </g>
        <Move x={720} y={1040} s={0.55}>
          <Giant eyes="open" mouth="smile" right={{ to: [380, -800], hand: 'open' }} />
        </Move>
        <Sea y={600} />
        <g transform="translate(720 604)"><g className="story-wake"><ellipse cx={0} cy={0} rx={200} ry={18} fill="none" stroke="#e8f8ff" strokeWidth={6} /></g></g>
      </Place>
      <Place on={place === 'beach'}>
        <SkyBlend time="day"><Cloud x={500} y={140} /></SkyBlend>
        <Sea y={620} />
        <Hotspot id="beach" label="beach" cx={1000} cy={760} rx={460} ry={110}>
          <path d="M420 1000 Q520 690 760 676 L2400 660 L2400 1500 L420 1500 Z" fill="url(#st-sand)" stroke={INK} strokeWidth={5} />
          {[[880, 760], [1200, 820], [1420, 740]].map(([x, y], i) => <path key={i} d={`M${x} ${y} l10 -14 l10 14 l14 -6 l-6 14 Z`} fill="#f29b4b" stroke={INK} strokeWidth={2} />)}
        </Hotspot>
        <Move x={beat === 4 ? 460 : 690} y={beat === 4 ? 650 : 770} s={0.5} dur={2}>
          <Hotspot id="boat" label="boat" cy={-90} rx={400} ry={130}>
            <g className={beat === 4 ? 'story-rock' : undefined}><Rowboat dirt={dirt} sail={beat === 4} /></g>
          </Hotspot>
          <g transform="translate(0 -200)"><Sparkles on={beat === 3} spread={260} /></g>
        </Move>
        <Move x={beat === 3 ? 1060 : 1140} y={beat === 3 ? 800 : 790} s={0.5} dur={1.6}>
          <Giant sit={beat === 3}
            eyes={pick(beat, ['open', 'open', 'wide', 'happy', 'happy'] as const)}
            mouth={pick(beat, ['smile', 'smile', 'o', 'smile', 'grin'] as const)}
            left={beat === 3 ? { to: [-440, -200], hand: 'fist' } : beat === 4 ? { to: [-210, -660], hand: 'fist', holding: <g transform="translate(-6 -30) scale(0.45)"><Cow /></g> } : undefined}
            pocket={beat === 4 ? (
              <Hotspot id="cows" label="cow" cy={-30} rx={110} ry={70}>
                <g transform="translate(-34 30) scale(0.45)"><Cow /></g>
                <g transform="translate(30 34) scale(0.4)"><Sheep /></g>
              </Hotspot>
            ) : undefined} />
        </Move>
        {[0, 1, 2].map((i) => (
          <Tiny key={i} x={pick(beat, [0, 0, 1500, 900, 1500]) + i * 70} y={820} {...BLEFUSCANS[i]} o={beat === 3 ? 1 : 0} delay={i * 0.15} dur={1.6}
            anim="story-walk" holding={i === 1 ? <g transform="translate(-30 -60) scale(0.7)"><Barrel /></g> : <g transform="translate(-40 -40) scale(0.9)"><Basket /></g>} />
        ))}
      </Place>
      <Place on={place === 'ship'}>
        <SkyBlend time="day"><Cloud x={400} y={130} /><Cloud x={1100} y={180} s={0.8} /></SkyBlend>
        <Sea y={640} />
        <Move x={1180} y={720} s={1.15}>
          <Ship stripe="#c23b2e">
            <g transform="translate(-200 0)"><Person {...SAILOR} wave /></g>
            <g transform="translate(100 0)"><Person {...SAILOR} hair="#7a5530" wave /></g>
          </Ship>
        </Move>
        <Move x={500} y={700}>
          <g className="story-bob">
            <g transform="scale(0.85)">
              <Person {...GULLIVER} wave mood="laugh" />
              <Hotspot id="pocket" label="pocket" cx={16} cy={-118} rx={70} ry={60}>
                <rect x={0} y={-132} width={32} height={26} rx={5} fill="#24497c" stroke={INK} strokeWidth={3} />
                <circle cx={16} cy={-136} r={9} fill="#fbf7ef" stroke={INK} strokeWidth={2.5} />
              </Hotspot>
            </g>
            <g transform="translate(0 30) scale(0.24)"><Rowboat /></g>
          </g>
        </Move>
      </Place>
      <Place on={place === 'deck'}>
        <SkyBlend time="day"><Cloud x={300} y={130} /></SkyBlend>
        <Sea y={560} />
        <rect x={-800} y={600} width={3200} height={40} fill="url(#st-wood-dark)" stroke={INK} strokeWidth={4} />
        {Array.from({ length: 24 }, (_, i) => <rect key={i} x={-400 + i * 120} y={636} width={14} height={130} fill="url(#st-wood-dark)" stroke={INK} strokeWidth={3} />)}
        <rect x={1260} y={-400} width={40} height={1200} fill="url(#st-wood-dark)" stroke={INK} strokeWidth={4} />
        <path d="M-800 760 L2400 760 L2400 1500 L-800 1500 Z" fill="url(#st-wood)" stroke={INK} strokeWidth={5} />
        {[0, 1, 2, 3, 4].map((i) => <path key={i} d={`M-800 ${800 + i * 60} L2400 ${800 + i * 60}`} stroke="#8a5a2c" strokeWidth={3} />)}
        <Move x={700} y={830} s={1.1}>
          <Person {...GULLIVER} mood="laugh"
            holding={<Hotspot id="sheep" label="sheep" cx={0} cy={-20} rx={80} ry={60}><g transform="translate(-8 -4) scale(0.32)"><Sheep /></g></Hotspot>} />
          <g transform="translate(46 -150)"><Sparkles on spread={60} /></g>
        </Move>
        {[[500, SAILOR, true], [920, { tunic: '#b8546a', dress: true, hair: '#5a3a22' }, false], [1060, { tunic: '#8a6d4a', hair: '#6b5138', beard: '#8a7058' }, false]].map(([x, look, flip], i) => (
          <Move key={i} x={x as number} y={840} s={0.95} flip={flip as boolean}>
            <g className="story-bob" style={{ animationDelay: `${i * 0.2}s` }}><Person {...(look as PersonProps)} mood="surprised" armsUp={i === 1} /></g>
          </Move>
        ))}
        <g transform="translate(780 450) scale(0.7)"><Shout text="WOW!" on /></g>
      </Place>
      <SpeechAt bubble={bubble} at={{ Minister: [860, 150] }} />
    </Camera>
  );
}

export const GULLIVER_SCENES: Record<string, ComponentType<SceneProps>> = {
  storm: StormScene,
  tied: TiedScene,
  food: FoodScene,
  pockets: PocketsScene,
  eggs: EggsScene,
  fleet: FleetScene,
  fire: FireScene,
  home: HomeScene,
};

const WARM = 'rgba(255, 176, 92, 0.2)';
const NIGHT = 'rgba(30, 50, 120, 0.25)';
const STORM = 'rgba(40, 60, 90, 0.35)';

export const GULLIVER_ATMOSPHERE: Record<string, (beat: number) => Atmosphere> = {
  storm: (beat) => beat === 0 ? { particles: 'spray', grade: WARM, blend: 'soft-light' }
    : beat <= 2 ? { particles: 'rain', grade: STORM, blend: 'multiply', flash: true }
      : beat === 3 ? { particles: 'spray', grade: NIGHT, blend: 'multiply' } : { particles: 'fireflies', grade: NIGHT, blend: 'multiply' },
  tied: (beat) => ({ particles: 'dust', grade: beat === 4 ? 'rgba(255, 120, 100, 0.15)' : WARM, blend: 'soft-light' }),
  food: (beat) => beat === 3 ? { particles: 'confetti', grade: WARM, blend: 'soft-light' } : { particles: 'dust', grade: WARM, blend: 'soft-light' },
  pockets: (beat) => beat === 3 ? { particles: 'dust', grade: 'rgba(160, 110, 60, 0.2)', blend: 'soft-light' } : { particles: 'dust' },
  eggs: (beat) => beat === 2 ? { particles: 'spray' } : beat === 3 ? { particles: 'magic' } : { particles: 'dust', grade: WARM, blend: 'soft-light' },
  fleet: (beat) => beat === 5 ? { particles: 'confetti' } : { particles: 'spray' },
  fire: (beat) => beat === 5 ? { particles: 'rain', grade: NIGHT, blend: 'multiply' }
    : beat === 6 ? { particles: 'dust', grade: NIGHT, blend: 'multiply' } : { particles: 'embers', grade: 'rgba(255, 120, 60, 0.22)', blend: 'soft-light' },
  home: (beat) => beat === 0 ? { particles: 'fireflies', grade: NIGHT, blend: 'multiply' }
    : beat === 1 ? { particles: 'spray', grade: 'rgba(255, 170, 140, 0.18)', blend: 'soft-light' }
      : beat === 6 ? { particles: 'confetti' } : beat === 5 ? { particles: 'spray' } : { particles: 'dust', grade: WARM, blend: 'soft-light' },
};
