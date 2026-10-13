'use client';

import type { ComponentType, ReactNode } from 'react';

import type { StorySentence } from '../types';
import { Candle, Drops, Horse, Lantern, Shout, Thought, Wonder } from './dragonCharacters';
import {
  Attic, Barrack, Bed, BigStone, Cap, Carriage, CatAndMouse, Child, Cobbles, Coins, Desk, DOCTOR, Doorway, DoorBell,
  DUNYA, Embankment, Facades, Flowers, GreatManIdea, Heartbeat, HeatLines, Journal, LANDLADY, Letter, LIZAVETA, Log,
  LUZHIN, MARMELADOV, Mug, OFFICER, OldSofa, PAINTER, Palisade, Papers, PAWNBROKER, PillowHead, PORFIRY, PRISONER, Purse,
  RAZUMIKHIN, RODION, Seated, SilverWatch, Snow, SONYA, Stairwell, Stall, StationHouse, StrongBox, Table, TavernBar,
  TopHat, TOWNSFOLK, WallClock, WIDOW, WoodenCross,
} from './crimeCharacters';
import type { Atmosphere, SceneProps } from './odysseyScenes';
import { Bubble, Camera, Cloud, Hearts, Hotspot, INK, Layer, Moon, Move, Night, Person, Sky, Sparkles, Sun, type PersonProps } from './parts';

/*
 * Scenes for "Crime and Punishment". The palette carries the mood: hot yellow
 * streets, a dim brown attic, red-dark beats around the crime, cold blue in
 * the fever and Siberia, and a warm sunrise for the new life at the end.
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

type Time = 'hot' | 'evening' | 'night' | 'grey' | 'winter' | 'spring' | 'dawn';
const SKY: Record<Time, [string, string]> = {
  hot: ['#f2c86a', '#fbeec0'],
  evening: ['#d9764e', '#f6c98a'],
  night: ['#141c40', '#3d4680'],
  grey: ['#8d96a3', '#c9cfd6'],
  winter: ['#a9bccb', '#e8eef3'],
  spring: ['#7cc3ec', '#e6f5d0'],
  dawn: ['#f39a6b', '#ffe3a8'],
};

function CitySky({ time, children }: { time: Time; children?: ReactNode }) {
  return (
    <>
      {(Object.keys(SKY) as Time[]).map((key) => (
        <g key={key} style={{ opacity: key === time ? 1 : 0, transition: 'opacity 1.8s ease' }}>
          <Sky top={SKY[key][0]} bottom={SKY[key][1]} birds={key === 'spring' || key === 'dawn'} />
        </g>
      ))}
      {children}
      <Night on={time === 'night'} strength={0.2} />
    </>
  );
}

/** A street of yellow Saint Petersburg houses. */
function Street({ time = 'hot' }: { time?: Time }) {
  const dark = time === 'night';
  return (
    <>
      <CitySky time={time}>
        {time === 'hot' ? <Sun x={1380} y={120} r={60} /> : null}
        {dark ? <Moon x={1300} y={130} /> : null}
      </CitySky>
      <Layer depth={-4}><Facades dark={dark} lit={dark || time === 'evening'} /></Layer>
      <Cobbles dark={dark} />
    </>
  );
}

type ActorProps = PersonProps & {
  x: number; y: number; s?: number; o?: number; r?: number; flip?: boolean; delay?: number; dur?: number;
  anim?: string; extra?: ReactNode;
};

/** A person placed in the scene. The animation class sits on an inner group, never on the moving one. */
function Actor({ x, y, s = 1, o, r, flip, delay, dur, anim, extra, ...person }: ActorProps) {
  return (
    <Move x={x} y={y} s={s} o={o} r={r} flip={flip} delay={delay} dur={dur}>
      <g className={anim}><Person {...person} /></g>
      {extra}
    </Move>
  );
}

/** A lamp post with a warm gas light. */
function LampPost({ x, y = 860 }: { x: number; y?: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x={-8} y={-360} width={16} height={360} fill="#2e3440" stroke={INK} strokeWidth={3} />
      <g transform="translate(0 -380)"><Lantern color="#ffd27a" /></g>
    </g>
  );
}

/** A plain wall with a skirting board, for small rooms. */
function Wall({ color, floor = '#6b4f33' }: { color: string; floor?: string }) {
  return (
    <g>
      <rect x={-800} y={-600} width={3200} height={2100} fill={color} />
      <rect x={-800} y={740} width={3200} height={24} fill="#3e2714" />
      <path d="M-800 764 L2400 764 L2400 1500 L-800 1500 Z" fill={floor} stroke={INK} strokeWidth={5} />
      {[0, 1, 2, 3].map((i) => <path key={i} d={`M-800 ${810 + i * 60} L2400 ${810 + i * 60}`} stroke="#3e2714" strokeWidth={3} opacity={0.6} />)}
    </g>
  );
}

function Window({ x, y, night = false, sill }: { x: number; y: number; night?: boolean; sill?: ReactNode }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x={-90} y={-130} width={180} height={200} rx={6} fill={night ? '#1b2757' : '#bfe3f5'} stroke={INK} strokeWidth={5} />
      <path d="M0 -130 L0 70 M-90 -30 L90 -30" stroke={INK} strokeWidth={4} />
      {night ? <circle cx={-40} cy={-90} r={14} fill="#fff3c4" /> : null}
      <rect x={-110} y={70} width={220} height={20} rx={4} fill="url(#st-wood)" stroke={INK} strokeWidth={4} />
      {sill ? <g transform="translate(0 70)">{sill}</g> : null}
    </g>
  );
}

/* ---------------------------------------------------------------- 1 */

function RoomScene({ beat, bubble }: SceneProps) {
  const place = pick(beat, ['street', 'attic', 'landing', 'attic', 'pawn', 'pawn'] as const);
  const cam = pick<Cam>(beat, [[800, 520, 1], [760, 560, 1.1], [820, 560, 1.05], [700, 470, 1.05], [800, 560, 1.05], [880, 560, 1.15]]);
  return (
    <Camera fx={cam[0]} fy={cam[1]} s={cam[2]}>
      <Place on={place === 'street'}>
        <Street time="hot" />
        {[0, 1, 2].map((i) => (
          <Actor key={i} x={300 + i * 520} y={850} s={0.82} {...TOWNSFOLK[i]} anim="story-walk" flip={i === 1} />
        ))}
        <g transform="translate(1180 860)">
          <rect x={-60} y={-300} width={10} height={300} fill="url(#st-wood)" stroke={INK} strokeWidth={3} />
          <rect x={40} y={-300} width={10} height={300} fill="url(#st-wood)" stroke={INK} strokeWidth={3} />
          {[0, 1, 2, 3, 4].map((i) => <rect key={i} x={-60} y={-60 - i * 56} width={110} height={8} fill="url(#st-wood)" stroke={INK} strokeWidth={2} />)}
          <rect x={-40} y={-40} width={50} height={40} rx={4} fill="#e8e2d6" stroke={INK} strokeWidth={3} />
          <path d="M-36 -36 q12 18 2 34" fill="none" stroke="#4f8ad0" strokeWidth={6} />
        </g>
        <Actor x={760} y={880} s={1.05} {...RODION} mood="sad" anim="story-walk" />
      </Place>

      <Place on={place === 'attic'}>
        <Attic>
          <Hotspot id="room" label="room" cx={800} cy={520} rx={520} ry={300}>
            <g transform="translate(760 830)"><OldSofa /></g>
            <g transform="translate(1260 760)">
              <rect x={-40} y={-140} width={80} height={140} fill="url(#st-wood-dark)" stroke={INK} strokeWidth={4} />
              <g transform="translate(-6 -146) scale(0.7)"><StackOfBooks /></g>
            </g>
          </Hotspot>
        </Attic>
        <Actor x={beat === 3 ? 560 : 700} y={beat === 3 ? 860 : 830} {...RODION} mood="sad" />
        <g transform="translate(600 540)">
          <Thought on={beat === 3}>
            <Hotspot id="idea" label="idea" cx={0} cy={-20} rx={200} ry={90}><g transform="translate(0 20) scale(0.8)"><GreatManIdea /></g></Hotspot>
          </Thought>
        </g>
      </Place>

      <Place on={place === 'landing'}>
        <Wall color="#8a7a5a" floor="#5c4a36" />
        <g transform="translate(560 764)">
          <Hotspot id="landlady" label="landlady" cy={-160} rx={130} ry={180}>
            <Doorway open bell={false}>
              <Actor x={-30} y={0} s={0.9} {...LANDLADY} mood="shout" />
            </Doorway>
          </Hotspot>
        </g>
        {Array.from({ length: 5 }, (_, i) => (
          <rect key={i} x={980 + i * 110} y={764 + i * 40} width={110} height={40} fill="#76644c" stroke={INK} strokeWidth={3} />
        ))}
        <Actor x={1040} y={800} {...RODION} mood="surprised" flip anim="story-tremble" extra={<g transform="translate(-20 -200)"><Drops on /></g>} />
      </Place>

      <Place on={place === 'pawn'}>
        <PawnRoom />
        <Actor x={560} y={860} {...PAWNBROKER} mood={beat === 4 ? 'sad' : 'smile'} />
        <g transform="translate(720 860)">
          <Table w={420}>
            <g transform="translate(-80 0)"><StrongBox open={beat === 5} /></g>
            {beat === 5 ? <g transform="translate(80 -6)"><Coins n={2} /></g> : null}
          </Table>
        </g>
        <Actor x={1060} y={860} {...RODION} mood={beat === 5 ? 'surprised' : 'sad'} flip
          extra={beat === 5 ? (
            <>
              <g transform="translate(-60 -120)">
                <Hotspot id="watch" label="watch" cx={0} cy={0} rx={70} ry={70}><SilverWatch s={0.9} /></Hotspot>
              </g>
              <g transform="translate(40 -150)"><Heartbeat on /></g>
            </>
          ) : undefined} />
      </Place>
      <SpeechAt bubble={bubble} at={{ Rodion: [beat === 3 ? 640 : 1000, 420] }} />
    </Camera>
  );
}

function StackOfBooks() {
  return (
    <g>
      {['#8a3b2e', '#3e5f8a', '#4f7a3a', '#d9a441'].map((c, i) => (
        <rect key={c} x={-60 + (i % 2) * 8} y={-30 - i * 26} width={120} height={26} rx={4} fill={c} stroke={INK} strokeWidth={3} />
      ))}
    </g>
  );
}

/** The pawnbroker's tidy, airless room: faded yellow paper, an icon lamp and a geranium. */
function PawnRoom() {
  return (
    <g>
      <Wall color="#d9c27a" floor="#7a5a3a" />
      {Array.from({ length: 9 }, (_, i) => <circle key={i} cx={-200 + i * 260} cy={300} r={18} fill="#c4a95a" opacity={0.5} />)}
      <Window x={1300} y={380} sill={<g transform="translate(0 -6)"><Geranium /></g>} />
      <g transform="translate(300 260)">
        <rect x={-50} y={-70} width={100} height={130} rx={6} fill="url(#st-bronze)" stroke={INK} strokeWidth={4} />
        <rect x={-34} y={-54} width={68} height={98} rx={4} fill="#7a4a24" />
        <circle cx={0} cy={-14} r={18} fill="#f3c79b" />
        <g transform="translate(0 90)"><Lantern color="#e5483a" /></g>
      </g>
    </g>
  );
}

function Geranium() {
  return (
    <g>
      <path d="M-24 0 L24 0 L18 -36 L-18 -36 Z" fill="#c86a3a" stroke={INK} strokeWidth={3} />
      {[[-20, -60], [0, -76], [20, -58]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={14} fill="#e5483a" stroke={INK} strokeWidth={2.5} />)}
      <path d="M-14 -36 q-6 -14 -6 -24 M0 -36 L0 -62 M14 -36 q6 -10 6 -22" stroke="#4f8a3a" strokeWidth={4} fill="none" />
    </g>
  );
}

/* ---------------------------------------------------------------- 2 */

function TavernScene({ beat, bubble }: SceneProps) {
  const place = pick(beat, ['tavern', 'tavern', 'tavern', 'street', 'home', 'home'] as const);
  const cam = pick<Cam>(beat, [[800, 480, 1], [740, 560, 1.15], [760, 470, 1.05], [800, 560, 1.05], [820, 560, 1.05], [980, 540, 1.15]]);
  return (
    <Camera fx={cam[0]} fy={cam[1]} s={cam[2]}>
      <Place on={place === 'tavern'}>
        <TavernBar />
        <Hotspot id="tavern" label="tavern" cx={800} cy={150} rx={200} ry={90}>
          <g transform="translate(800 110)">
            <path d="M-120 -80 L-120 -40 M120 -80 L120 -40" stroke={INK} strokeWidth={4} />
            <rect x={-170} y={-40} width={340} height={96} rx={10} fill="url(#st-wood)" stroke={INK} strokeWidth={5} />
            <text x={0} y={22} textAnchor="middle" fontSize={50} fontWeight={900} fill="#fff1c4" stroke={INK} strokeWidth={3} paintOrder="stroke">TAVERN</text>
          </g>
        </Hotspot>
        {[[260, 640], [1500, 640]].map(([x, y]) => <g key={x} transform={`translate(${x} ${y})`}><Lantern color="#ffb347" /></g>)}
        {[0, 1, 2].map((i) => (
          <Actor key={i} x={1000 + i * 150} y={780} s={0.75} {...TOWNSFOLK[i + 2]} mood="laugh" anim="story-bob" delay={i * 0.1} />
        ))}
        <g transform="translate(700 880)">
          <Table w={440}><g transform="translate(-100 0)"><Mug /></g><g transform="translate(110 0)"><Mug /></g></Table>
        </g>
        <Actor x={480} y={880} {...RODION} mood="sad" />
        <Actor x={beat >= 1 ? 900 : 1300} y={880} o={beat >= 1 ? 1 : 0} {...MARMELADOV} mood="sad" flip anim={beat === 1 ? 'story-bob' : undefined} />
        <g transform="translate(880 560)">
          <Thought on={beat === 2}>
            <Hotspot id="sonya" label="daughter" cx={-40} cy={-60} rx={90} ry={110}>
              <g transform="translate(-40 40) scale(0.55)"><Person {...SONYA} mood="sad" /></g>
            </Hotspot>
            <g transform="translate(60 40) scale(0.55)"><Child {...TOWNSFOLK[1]} mood="sad" /></g>
            <g transform="translate(120 40) scale(0.55)"><Child {...TOWNSFOLK[0]} mood="sad" /></g>
          </Thought>
        </g>
      </Place>

      <Place on={place === 'street'}>
        <Street time="night" />
        <LampPost x={1180} />
        <Actor x={760} y={880} {...RODION} anim="story-walk" />
        <Actor x={880} y={880} r={8} {...MARMELADOV} mood="sad" anim="story-walk" />
      </Place>

      <Place on={place === 'home'}>
        <Wall color="#8f9480" floor="#5c4a36" />
        <Window x={1260} y={380} night sill={beat === 5 ? (
          <Hotspot id="coins" label="coins" cx={0} cy={-10} rx={80} ry={40}><g transform="translate(0 -4)"><Coins n={3} /></g></Hotspot>
        ) : undefined} />
        <Actor x={400} y={860} {...WIDOW} mood="sad" anim="story-tremble" extra={<g transform="translate(30 -180)"><Drops on={beat === 4} /></g>} />
        <Hotspot id="children" label="children" cx={700} cy={-110 + 860} rx={150} ry={100}>
          {[0, 1, 2].map((i) => (
            <Actor key={i} x={600 + i * 100} y={860} {...TOWNSFOLK[i]} mood="sad" s={1}
              extra={<g transform="translate(0 -110) scale(0.62)"><Drops on tears /></g>} anim={undefined} dress={i === 1} />
          ))}
        </Hotspot>
        <Actor x={beat === 5 ? 1120 : 980} y={860} {...RODION} mood="sad" flip={beat !== 5} />
      </Place>
      <SpeechAt bubble={bubble} at={{ Marmeladov: [900, 430] }} />
    </Camera>
  );
}

/* ---------------------------------------------------------------- 3 */

function LetterScene({ beat, bubble }: SceneProps) {
  const place = pick(beat, ['attic', 'attic', 'attic', 'market', 'market', 'night'] as const);
  const cam = pick<Cam>(beat, [[740, 560, 1.15], [740, 460, 1.05], [760, 540, 1.05], [800, 520, 1], [900, 460, 1.1], [760, 560, 1.1]]);
  return (
    <Camera fx={cam[0]} fy={cam[1]} s={cam[2]} shake={beat === 2}>
      <Place on={place === 'attic'}>
        <Attic>
          <g transform="translate(760 830)"><OldSofa /></g>
        </Attic>
        <Actor x={700} y={beat === 2 ? 860 : 830} {...RODION} mood={beat === 2 ? 'shout' : beat === 1 ? 'sad' : 'surprised'} armsUp={beat === 2}
          anim={beat === 0 ? 'story-tremble' : undefined}
          extra={beat < 2 ? (
            <g transform="translate(46 -110)">
              <Hotspot id="letter" label="letter" cx={0} cy={0} rx={70} ry={80}><Letter /></Hotspot>
            </g>
          ) : undefined} />
        {beat === 2 ? <g transform="translate(860 840) scale(0.6)"><Letter open={false} /></g> : null}
        <g transform="translate(720 300)"><Shout text="NO!" on={beat === 2} color="#ff8a5c" /></g>
        <g transform="translate(760 560)">
          <Thought on={beat === 1}>
            <Hotspot id="dunya" label="sister" cx={-70} cy={-70} rx={80} ry={110}>
              <g transform="translate(-70 40) scale(0.55)"><Person {...DUNYA} mood="sad" /></g>
            </Hotspot>
            <g transform="translate(70 40) scale(0.55)"><Person {...LUZHIN} mood="smile" /><TopHat /></g>
            <g transform="translate(0 -40)"><circle r={16} fill="none" stroke="#d9a441" strokeWidth={7} /></g>
          </Thought>
        </g>
      </Place>

      <Place on={place === 'market'}>
        <Street time="evening" />
        <Hotspot id="market" label="market" cx={760} cy={720} rx={460} ry={160}>
          <g transform="translate(470 850)"><Stall awning="#c23b2e" /></g>
          <g transform="translate(1060 850)"><Stall awning="#3e5f8a" /></g>
        </Hotspot>
        <g transform="translate(1060 440)">
          <rect x={-8} y={0} width={16} height={190} fill="#2e3440" stroke={INK} strokeWidth={3} />
          <Hotspot id="clock" label="seven o'clock" cx={0} cy={0} rx={100} ry={100}>
            <g className={beat === 4 ? 'story-pulse' : undefined}><WallClock hour={7} /></g>
          </Hotspot>
        </g>
        {[0, 3, 4].map((look, i) => (
          <Actor key={i} x={240 + i * 620} y={900} s={0.8} {...TOWNSFOLK[look]} anim="story-walk" flip={i === 1} />
        ))}
        <Actor x={760} y={880} {...LIZAVETA} mood="smile" wave={beat === 3} />
        <Actor x={beat === 4 ? 1260 : 1360} y={880} {...RODION} mood={beat === 4 ? 'surprised' : 'sad'} flip
          extra={<g transform="translate(-10 -250)"><Wonder on={beat === 4} /></g>} />
      </Place>

      <Place on={place === 'night'}>
        <Attic night>
          <g transform="translate(760 830)"><OldSofa blanket /></g>
          <g transform="translate(420 380)"><g className="story-pulse"><WallClock hour={7} /></g></g>
        </Attic>
        <Actor x={760} y={830} {...RODION} mood="surprised" extra={<g transform="translate(60 -160)"><Heartbeat on /></g>} />
        <path d="M1050 300 L640 900 L900 900 L1130 300 Z" fill="#fff3c4" opacity={0.12} pointerEvents="none" />
      </Place>
      <SpeechAt bubble={bubble} at={{ Rodion: [700, 420] }} />
    </Camera>
  );
}

/* ---------------------------------------------------------------- 4 */

function CrimeScene({ beat, bubble }: SceneProps) {
  const place = pick(beat, ['stairs', 'stairs', 'door', 'door', 'door', 'door', 'inside', 'street'] as const);
  const cam = pick<Cam>(beat, [[700, 520, 1], [760, 480, 1.15], [860, 520, 1.15], [800, 540, 1.1], [800, 520, 1], [760, 540, 1.1], [760, 540, 1.1], [800, 560, 1.05]]);
  const step = (i: number): Point => [255 + i * 110, 820 - i * 70];
  const [sx, sy] = step(beat === 0 ? 2 : 5);
  return (
    <Camera fx={cam[0]} fy={cam[1]} s={cam[2]} shake={beat === 6}>
      <Place on={place === 'stairs'}>
        <Hotspot id="stairs" label="stairs" cx={700} cy={500} rx={460} ry={320}><Stairwell /></Hotspot>
        <Move x={sx} y={sy} s={0.9}>
          <Hotspot id="coat" label="axe under the coat" cx={0} cy={-100} rx={70} ry={110}>
            <Person {...RODION} mood="sad" />
            {beat === 1 ? <rect x={30} y={-70} width={10} height={60} rx={4} fill="url(#st-wood)" stroke={INK} strokeWidth={3} /> : null}
          </Hotspot>
          <g transform="translate(70 -210)"><Heartbeat on={beat === 1} /></g>
        </Move>
      </Place>

      <Place on={place === 'door'}>
        <Wall color="#6e5d46" floor="#4a3d2e" />
        <rect x={-800} y={-600} width={3200} height={2100} fill="#1a120c" opacity={beat === 4 ? 0.55 : 0.25} style={{ transition: 'opacity 1.2s ease' }} pointerEvents="none" />
        <g transform="translate(800 764)">
          <Hotspot id="door" label="door" cy={-170} rx={140} ry={190}>
            <Doorway open={beat === 3 || beat === 5} dark bell={false}>
              {beat === 3 ? <Actor x={-40} y={0} s={0.95} {...PAWNBROKER} mood="sad" /> : null}
            </Doorway>
          </Hotspot>
          <g transform="translate(150 -250)">
            <Hotspot id="bell" label="bell" cx={0} cy={0} rx={50} ry={50}><DoorBell ringing={beat === 2} /></Hotspot>
          </g>
        </g>
        <Actor x={beat === 5 ? 1260 : 1080} y={800} {...RODION} mood="sad" flip o={beat === 4 || beat === 5 ? 0 : 1}
          extra={<g transform="translate(60 -230)"><Heartbeat on={beat === 2} /></g>} />
        <Actor x={beat === 5 ? 520 : 200} y={800} o={beat === 5 ? 1 : 0} {...LIZAVETA} mood="surprised" armsUp />
      </Place>

      <Place on={place === 'inside'}>
        <Wall color="#9c8240" floor="#5c4a36" />
        <rect x={-800} y={-600} width={3200} height={2100} fill="#1a120c" opacity={0.45} pointerEvents="none" />
        <g transform="translate(980 764)"><Doorway bell={false} /></g>
        <Actor x={700} y={800} {...RODION} mood="surprised" anim="story-tremble" extra={<g transform="translate(-10 -200)"><Drops on /></g>} />
        <g transform="translate(1000 330)"><Shout text="KNOCK! KNOCK!" on color="#ffd84d" /></g>
      </Place>

      <Place on={place === 'street'}>
        <Street time="night" />
        <LampPost x={1180} />
        <Actor x={760} y={880} {...RODION} mood="surprised" anim="story-trot" extra={<g transform="translate(-30 -200)"><Drops on /></g>} />
        {[0, 1].map((i) => <Actor key={i} x={300 + i * 900} y={860} s={0.8} {...TOWNSFOLK[i + 2]} anim="story-walk" flip={i === 0} />)}
      </Place>
      <SpeechAt bubble={bubble} at={{ Pawnbroker: [720, 400] }} />
    </Camera>
  );
}

/* ---------------------------------------------------------------- 5 */

function FeverScene({ beat, bubble }: SceneProps) {
  const place = pick(beat, ['yard', 'office', 'office', 'attic', 'attic', 'attic'] as const);
  const cam = pick<Cam>(beat, [[780, 560, 1.1], [800, 520, 1], [760, 560, 1.05], [760, 600, 1.15], [800, 560, 1.05], [760, 560, 1.1]]);
  return (
    <Camera fx={cam[0]} fy={cam[1]} s={cam[2]}>
      <Place on={place === 'yard'}>
        <CitySky time="grey" />
        <Layer depth={-4}><Facades /></Layer>
        <path d="M-800 760 L2400 760 L2400 1500 L-800 1500 Z" fill="#8a8272" stroke={INK} strokeWidth={5} />
        <g transform="translate(860 860)">
          <Hotspot id="stone" label="stone" cy={-60} rx={190} ry={90}><BigStone lifted /></Hotspot>
          <g transform="translate(-40 -10)"><Purse /></g>
        </g>
        <Actor x={600} y={880} {...RODION} mood="surprised" r={14} extra={<g transform="translate(-20 -200)"><Drops on /></g>} />
      </Place>

      <Place on={place === 'office'}>
        <Wall color="#b8b29a" floor="#6b5a44" />
        <g transform="translate(1260 330)"><WallClock hour={11} /></g>
        <g transform="translate(820 880)"><Desk w={460}><g transform="translate(-60 0)"><Papers /></g></Desk></g>
        <Hotspot id="officers" label="police" cx={900} cy={620} rx={300} ry={190}>
          <Actor x={820} y={720} {...OFFICER} mood={beat === 2 ? 'surprised' : 'smile'} extra={<Cap />} />
          <Actor x={1100} y={860} {...OFFICER} hair="#6b5138" mood={beat === 2 ? 'surprised' : 'shout'} flip extra={<Cap />} />
        </Hotspot>
        <Actor x={beat === 2 ? 500 : 460} y={beat === 2 ? 880 : 870} r={beat === 2 ? -78 : 0} {...RODION} mood={beat === 2 ? 'sad' : 'surprised'} dur={0.9} />
        {beat === 2 ? <g transform="translate(420 600)"><Wonder on /></g> : null}
      </Place>

      <Place on={place === 'attic'}>
        <Attic night={beat === 5}>
          <g transform="translate(760 840)">
            <Hotspot id="bed" label="fever" cy={-110} rx={250} ry={90}>
              <Bed blanket="#7a8a9a" sleeper={beat < 5 ? <PillowHead hot={beat === 3 || beat === 4} /> : undefined} />
            </Hotspot>
            <g transform="translate(-160 -170)"><HeatLines on={beat === 3} /></g>
          </g>
        </Attic>
        <g transform="translate(1100 860)">
          <Hotspot id="friend" label="friend" cy={-130} rx={90} ry={160}>
            <Move o={beat === 4 ? 1 : 0}>
              <Seated><Person {...RAZUMIKHIN} mood="sad" holding={<g transform="translate(-10 4)"><Bowl /></g>} /></Seated>
            </Move>
          </Hotspot>
        </g>
        {beat === 5 ? (
          <>
            <Actor x={640} y={850} {...RODION} mood="sad" />
            <g transform="translate(700 560)">
              <Thought on>
                <g transform="translate(0 30) scale(0.55)"><BigStone /></g>
                <text x={0} y={-50} textAnchor="middle" fontSize={40} fontWeight={900} fill={INK}>?!</text>
              </Thought>
            </g>
          </>
        ) : null}
      </Place>
      <SpeechAt bubble={bubble} at={{ Razumikhin: [1060, 520] }} />
    </Camera>
  );
}

function Bowl() {
  return (
    <g>
      <path d="M-30 -10 Q0 30 30 -10 Z" fill="#f4ecd6" stroke={INK} strokeWidth={3} />
      <g transform="translate(0 -14)"><g className="story-smoke"><circle r={8} fill="#ffffff" opacity={0.7} /></g></g>
    </g>
  );
}

/* ---------------------------------------------------------------- 6 */

function SonyaScene({ beat, bubble }: SceneProps) {
  const place = pick(beat, ['accident', 'home', 'home', 'home', 'home', 'home', 'walk'] as const);
  const cam = pick<Cam>(beat, [[800, 540, 1], [760, 560, 1.05], [760, 560, 1.05], [760, 560, 1.15], [900, 520, 1.1], [860, 560, 1.15], [800, 520, 1]]);
  return (
    <Camera fx={cam[0]} fy={cam[1]} s={cam[2]}>
      <Place on={place === 'accident'}>
        <Street time="night" />
        <LampPost x={380} />
        <g transform="translate(1220 860)"><Carriage horse={<g transform="translate(260 0) scale(0.7)"><Horse /></g>} /></g>
        <Hotspot id="crowd" label="crowd" cx={720} cy={720} rx={330} ry={170}>
          {[0, 1, 2, 3].map((i) => (
            <Actor key={i} x={470 + i * 170} y={860} s={0.9} {...TOWNSFOLK[i]} mood="surprised" flip={i > 1} anim="story-bob" delay={i * 0.1} />
          ))}
        </Hotspot>
        <Actor x={800} y={900} {...RODION} mood="surprised" />
      </Place>

      <Place on={place === 'home'}>
        <Wall color="#8f9480" floor="#5c4a36" />
        <Window x={1340} y={360} night />
        <g transform="translate(560 860)"><Bed blanket="#8a7a56" sleeper={<PillowHead hair="#9a9a9a" />} /></g>
        <Actor x={300} y={860} o={beat === 1 ? 1 : 0} {...DOCTOR} mood="sad" />
        <Actor x={860} y={860} {...WIDOW} mood="sad" flip={beat !== 3}
          extra={<g transform="translate(0 -180)"><Drops on={beat === 2} tears /></g>} />
        {[0, 1].map((i) => (
          <Actor key={i} x={700 + i * 80} y={880} s={0.62} {...TOWNSFOLK[i * 3]} mood="sad" o={beat === 2 ? 1 : 0}
            extra={<g transform="translate(0 -190)"><Drops on tears /></g>} />
        ))}
        <Actor x={beat === 3 ? 1040 : 1100} y={860} {...RODION} mood="sad" flip
          extra={beat === 3 ? (
            <g transform="translate(-50 -96)">
              <Hotspot id="money" label="money" cx={0} cy={-6} rx={60} ry={40}><Coins n={4} /></Hotspot>
            </g>
          ) : undefined} />
        <Move x={1280} y={860} o={beat >= 4 ? 1 : 0}>
          <Hotspot id="sonya" label="green shawl" cy={-130} rx={80} ry={140}><Person {...SONYA} mood={beat === 5 ? 'smile' : 'sad'} /></Hotspot>
        </Move>
        <Move x={980} y={880} s={0.6} o={beat === 5 ? 1 : 0}>
          <Hotspot id="girl" label="hug" cy={-130} rx={80} ry={140}><g className="story-bob"><Person {...TOWNSFOLK[3]} mood="laugh" armsUp /></g></Hotspot>
          <g transform="translate(40 -330)"><Hearts on={beat === 5} /></g>
        </Move>
      </Place>

      <Place on={place === 'walk'}>
        <Street time="night" />
        <LampPost x={420} />
        <Actor x={800} y={880} {...RODION} mood="laugh" anim="story-walk" extra={<g transform="translate(0 -150)"><Sparkles on spread={90} /></g>} />
      </Place>
      <SpeechAt bubble={bubble} at={{ Girl: [980, 600] }} />
    </Camera>
  );
}

/* ---------------------------------------------------------------- 7 */

function PorfiryScene({ beat, bubble }: SceneProps) {
  const cam = pick<Cam>(beat, [[760, 540, 1.05], [700, 640, 1.3], [880, 480, 1.05], [880, 480, 1.05], [700, 520, 1], [880, 540, 1.05]]);
  return (
    <Camera fx={cam[0]} fy={cam[1]} s={cam[2]}>
      <Wall color="#b8b29a" floor="#6b5a44" />
      <g transform="translate(1180 320)"><WallClock hour={3} /></g>
      <g transform="translate(230 764)"><Doorway open={beat === 4} bell={false} /></g>
      <Move x={beat === 4 ? 360 : 230} y={800} o={beat === 4 ? 1 : 0}>
        <Hotspot id="painter" label="painter" cy={-130} rx={90} ry={150}>
          <g className="story-tremble"><Person {...PAINTER} mood="shout" armsUp /></g>
          {[[-20, -100], [14, -70], [-6, -120]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={7} fill={['#4f8ad0', '#e5483a', '#f3c74d'][i]} />)}
        </Hotspot>
      </Move>
      <Move x={700} y={800}>
        <Hotspot id="porfiry" label="detective" cy={-150} rx={110} ry={170}>
          <g transform="scale(1.18 1)"><Person {...PORFIRY} mood={beat === 4 ? 'surprised' : 'laugh'} wave={beat === 5} /></g>
        </Hotspot>
      </Move>
      <g transform="translate(720 900)">
        <Desk w={440}>
          <g transform="translate(-120 0)"><Papers /></g>
          <g transform="translate(110 0)">
            <Hotspot id="article" label="article" cx={0} cy={-56} rx={90} ry={66}><Journal /></Hotspot>
          </g>
        </Desk>
      </g>
      <Actor x={beat === 5 ? 1300 : 1080} y={880} {...RODION} mood={beat === 3 || beat === 4 ? 'surprised' : 'sad'} flip={beat !== 5}
        anim={beat === 5 ? 'story-walk' : undefined} extra={<g transform="translate(40 -230)"><Drops on={beat === 3} /></g>} />
      <g transform="translate(1040 560)">
        <Thought on={beat === 2} flip>
          <g transform="translate(0 20) scale(0.75)"><GreatManIdea /></g>
        </Thought>
      </g>
      <g transform="translate(1040 560)">
        <Thought on={beat === 3} flip>
          <Hotspot id="mouse" label="mouse" cx={0} cy={-40} rx={170} ry={90}><g transform="translate(-10 20) scale(0.8)"><CatAndMouse /></g></Hotspot>
        </Thought>
      </g>
      <SpeechAt bubble={bubble} at={{ Porfiry: [700, 460], Painter: [380, 480] }} />
    </Camera>
  );
}

/* ---------------------------------------------------------------- 8 */

function TruthScene({ beat, bubble }: SceneProps) {
  const cam = pick<Cam>(beat, [[860, 520, 1], [700, 580, 1.15], [760, 560, 1.1], [760, 560, 1.15], [780, 580, 1.2], [760, 480, 1.05], [800, 580, 1.15]]);
  const close = beat >= 4;
  return (
    <Camera fx={cam[0]} fy={cam[1]} s={cam[2]}>
      <Wall color="#8a9aa6" floor="#5c4a36" />
      <path d="M-800 -600 L300 -600 L120 764 L-800 764 Z" fill="#000000" opacity={0.08} />
      <Window x={1180} y={340} night />
      <g transform="translate(1340 764)"><Doorway open={beat === 0} bell={false} /></g>
      <g transform="translate(560 880)">
        <Table w={300}>
          <g transform="translate(-60 0)">
            <Hotspot id="candle" label="candle" cx={0} cy={-60} rx={60} ry={80}><Candle /></Hotspot>
          </g>
          <g transform="translate(60 -14) scale(0.9)"><BookOfStories /></g>
        </Table>
      </g>
      <Move x={close ? 780 : 420} y={880}>
        <Seated seat="#6b4f33">
          <Hotspot id="sonya" label="Sonya" cy={-130} rx={80} ry={140}>
            <Person {...SONYA} mood={beat === 3 ? 'surprised' : beat === 4 ? 'sad' : 'smile'}
              holding={beat === 6 ? <Hotspot id="cross" label="cross" cx={0} cy={-50} rx={50} ry={70}><WoodenCross /></Hotspot> : undefined} />
          </Hotspot>
        </Seated>
        <g transform="translate(0 -160)"><Drops on={beat === 4} tears /></g>
      </Move>
      <Actor x={beat === 0 ? 1240 : close ? 920 : 860} y={880} {...RODION} flip mood={beat === 2 ? 'sad' : beat === 4 ? 'surprised' : 'sad'}
        anim={beat === 2 ? 'story-tremble' : undefined} extra={<g transform="translate(30 -220)"><Drops on={beat === 2} /></g>} />
      <g transform="translate(700 520)">
        <Thought on={beat === 5}>
          <Crossroads />
        </Thought>
      </g>
      <SpeechAt bubble={bubble} at={{ Sonya: [760, 420] }} />
    </Camera>
  );
}

function BookOfStories() {
  return (
    <g>
      <path d="M0 -6 Q-30 -18 -58 -10 L-58 26 Q-30 18 0 30 Z" fill="#fffaf0" stroke={INK} strokeWidth={3} />
      <path d="M0 -6 Q30 -18 58 -10 L58 26 Q30 18 0 30 Z" fill="#fffaf0" stroke={INK} strokeWidth={3} />
      <path d="M-60 26 Q-30 20 0 32 Q30 20 60 26 L60 32 Q30 26 0 38 Q-30 26 -60 32 Z" fill="#3e5f8a" stroke={INK} strokeWidth={3} />
      <path d="M30 -2 L30 18 M22 6 L38 6" stroke="#d9a441" strokeWidth={3} />
    </g>
  );
}

/** Sonya's picture of the crossroads: a tiny Rodion kneeling to kiss the earth. */
function Crossroads() {
  return (
    <g>
      <path d="M-190 40 L190 40 L120 -70 L-120 -70 Z" fill="#a39a8a" stroke={INK} strokeWidth={3} />
      <path d="M-40 -70 L-80 40 M40 -70 L80 40 M-160 -10 L160 -10" stroke="#fffaf0" strokeWidth={6} strokeDasharray="14 10" />
      <Hotspot id="earth" label="earth" cx={0} cy={20} rx={110} ry={34}>
        <ellipse cx={0} cy={26} rx={90} ry={16} fill="#8a6a46" stroke={INK} strokeWidth={3} />
      </Hotspot>
      <g transform="translate(0 30) rotate(28) scale(0.4)"><Person {...RODION} mood="sad" /></g>
    </g>
  );
}

/* ---------------------------------------------------------------- 9 */

function ConfessionScene({ beat, bubble }: SceneProps) {
  const place = pick(beat, ['attic', 'attic', 'river', 'square', 'station', 'inside'] as const);
  const cam = pick<Cam>(beat, [[800, 540, 1.05], [780, 520, 1.15], [800, 560, 1], [800, 580, 1.05], [800, 520, 1], [800, 520, 1.1]]);
  return (
    <Camera fx={cam[0]} fy={cam[1]} s={cam[2]}>
      <Place on={place === 'attic'}>
        <Attic>
          <g transform="translate(560 830)"><OldSofa /></g>
        </Attic>
        <Actor x={560} y={830} {...RODION} mood={beat === 1 ? 'surprised' : 'sad'} extra={<g transform="translate(-30 -210)"><Drops on={beat === 1} /></g>} />
        <Actor x={beat === 0 ? 1200 : 960} y={860} {...PORFIRY} mood="smile" flip wave={beat === 1} />
      </Place>

      <Place on={place === 'river'}>
        <CitySky time="evening"><Sun x={1300} y={470} r={60} /></CitySky>
        <Hotspot id="river" label="river" cx={800} cy={720} rx={500} ry={90}><Embankment evening /></Hotspot>
        <Move x={760} y={900}>
          <Hotspot id="rodion" label="pride" cy={-130} rx={80} ry={150}>
            <g className="story-walk"><Person {...RODION} mood="shout" /></g>
          </Hotspot>
          <g transform="translate(-10 -250)"><Wonder on /></g>
        </Move>
      </Place>

      <Place on={place === 'square'}>
        <Street time="hot" />
        <Hotspot id="ground" label="ground" cx={800} cy={890} rx={240} ry={50}>
          <ellipse cx={800} cy={900} rx={220} ry={34} fill="#8a7a62" stroke={INK} strokeWidth={4} />
        </Hotspot>
        <Actor x={800} y={920} r={32} {...RODION} mood="sad" />
        {[0, 1, 2, 3].map((i) => (
          <Actor key={i} x={[420, 560, 1060, 1200][i]} y={880} s={0.85} {...TOWNSFOLK[i]} mood="laugh" flip={i > 1} anim="story-bob" delay={i * 0.15} />
        ))}
      </Place>

      <Place on={place === 'station'}>
        <Street time="grey" />
        <g transform="translate(800 860)">
          <Hotspot id="station" label="police station" cy={-260} rx={320} ry={260}><StationHouse /></Hotspot>
        </g>
        <Actor x={1220} y={900} {...SONYA} mood="sad" flip />
        <Actor x={760} y={900} {...RODION} mood="sad" flip />
      </Place>

      <Place on={place === 'inside'}>
        <Wall color="#b8b29a" floor="#6b5a44" />
        <path d="M600 -100 L420 900 L1000 900 L820 -100 Z" fill="#fff4c8" opacity={0.25} pointerEvents="none" />
        <g transform="translate(1060 880)"><Desk w={380}><Papers /></Desk></g>
        <Actor x={1080} y={720} {...OFFICER} mood="surprised" flip extra={<Cap />} />
        <Actor x={680} y={880} {...RODION} mood="smile" />
      </Place>
      <SpeechAt bubble={bubble} at={{ Porfiry: [980, 470], Rodion: [700, 470] }} />
    </Camera>
  );
}

/* ---------------------------------------------------------------- 10 */

function SiberiaScene({ beat, bubble }: SceneProps) {
  const place = pick(beat, ['camp', 'camp', 'camp', 'hospital', 'river', 'river', 'river'] as const);
  const cam = pick<Cam>(beat, [[800, 500, 1], [800, 560, 1.1], [820, 560, 1.05], [800, 520, 1], [800, 520, 1], [800, 580, 1.15], [800, 480, 1]]);
  return (
    <Camera fx={cam[0]} fy={cam[1]} s={cam[2]}>
      <Place on={place === 'camp'}>
        <CitySky time="winter"><Cloud x={300} y={150} color="#eef2f6" shade="#c9d3dc" /><Cloud x={1200} y={110} s={0.8} color="#eef2f6" shade="#c9d3dc" /></CitySky>
        <Hotspot id="prison" label="prison" cx={800} cy={520} rx={640} ry={260}>
          <Palisade gateOpen={beat === 1} />
          <g transform="translate(1180 760)"><Barrack w={420} /></g>
        </Hotspot>
        <path d="M-800 760 Q800 730 2400 760 L2400 1500 L-800 1500 Z" fill="#f4f8fb" stroke={INK} strokeWidth={5} />
        <Actor x={beat === 2 ? 640 : 700} y={880} {...PRISONER} hair={RODION.hair} mood="sad" flip={beat === 2} />
        <Actor x={900} y={880} o={beat >= 1 ? 1 : 0} {...SONYA} mood="smile" flip />
        {[0, 1].map((i) => (
          <Actor key={i} x={1080 + i * 150} y={880} s={0.95} o={beat === 2 ? 1 : 0} {...PRISONER} mood="laugh" flip wave={i === 0} delay={i * 0.2} />
        ))}
        <Snow on />
      </Place>

      <Place on={place === 'hospital'}>
        <CitySky time="winter" />
        <path d="M-800 760 Q800 730 2400 760 L2400 1500 L-800 1500 Z" fill="#f4f8fb" stroke={INK} strokeWidth={5} />
        <g transform="translate(760 780)">
          <Hotspot id="hospital" label="hospital" cy={-150} rx={320} ry={170}><Barrack w={560} label="HOSPITAL" /></Hotspot>
        </g>
        <Actor x={1160} y={880} {...SONYA} mood="sad" flip />
        <Snow on />
      </Place>

      <Place on={place === 'river'}>
        <CitySky time={beat === 6 ? 'dawn' : 'spring'}>
          <Hotspot id="sun" label="spring" cx={1300} cy={180} rx={110} ry={110}><Sun x={1300} y={180} r={70} /></Hotspot>
          <Cloud x={360} y={140} />
        </CitySky>
        <path d="M-800 560 Q100 520 900 540 Q1600 520 2400 560 L2400 700 L-800 700 Z" fill="#9cc98a" />
        <Hotspot id="river" label="river" cx={800} cy={640} rx={520} ry={70}>
          <path d="M-800 600 Q800 570 2400 610 L2400 700 Q800 680 -800 700 Z" fill="#4f9ad0" stroke={INK} strokeWidth={4} />
          {[0, 1, 2].map((i) => <path key={i} d={`M${200 + i * 420} 640 q40 -10 80 0`} stroke="#ffffff" strokeWidth={4} fill="none" opacity={0.7} />)}
        </Hotspot>
        <path d="M-800 700 Q800 680 2400 700 L2400 1500 L-800 1500 Z" fill="url(#st-grass)" stroke={INK} strokeWidth={5} />
        <g transform="translate(800 900)"><Log /></g>
        <Move x={beat === 5 ? 860 : 900} y={beat === 5 ? 880 : 870}>
          <Seated seat="transparent"><Person {...SONYA} mood={beat === 5 ? 'sad' : 'smile'} /></Seated>
          <g transform="translate(0 -170)"><Drops on={beat === 5} tears /></g>
        </Move>
        <Actor x={beat === 5 ? 680 : 680} y={beat === 5 ? 950 : 930} r={beat === 5 ? 38 : 0} {...PRISONER} hair={RODION.hair} mood={beat === 5 ? 'sad' : 'smile'} flip
          extra={<g transform="translate(0 -200)"><Drops on={beat === 5} tears /></g>} />
        <g transform="translate(800 540)"><Hearts on={beat >= 5} /></g>
        <g transform="translate(300 940)"><Flowers n={5} /></g>
        <g transform="translate(1300 960)"><Flowers n={6} /></g>
        <g transform="translate(800 400)"><Sparkles on={beat === 6} spread={260} /></g>
      </Place>
      <SpeechAt bubble={bubble} at={{}} />
    </Camera>
  );
}

export const CRIME_SCENES: Record<string, ComponentType<SceneProps>> = {
  room: RoomScene,
  tavern: TavernScene,
  letter: LetterScene,
  crime: CrimeScene,
  fever: FeverScene,
  sonya: SonyaScene,
  porfiry: PorfiryScene,
  truth: TruthScene,
  confession: ConfessionScene,
  siberia: SiberiaScene,
};

const HOT = 'rgba(255, 196, 92, 0.18)';
const GLOOM = 'rgba(70, 50, 30, 0.22)';
const NIGHT = 'rgba(30, 50, 120, 0.25)';
const DREAD = 'rgba(120, 20, 20, 0.28)';
const COLD = 'rgba(120, 160, 210, 0.2)';
const WARM = 'rgba(255, 176, 92, 0.2)';

export const CRIME_ATMOSPHERE: Record<string, (beat: number) => Atmosphere> = {
  room: (beat) => beat === 0 ? { particles: 'dust', grade: HOT, blend: 'soft-light' } : { particles: 'dust', grade: GLOOM, blend: 'multiply' },
  tavern: (beat) => beat === 3 ? { particles: 'fireflies', grade: NIGHT, blend: 'multiply' } : { particles: 'dust', grade: GLOOM, blend: 'multiply' },
  letter: (beat) => beat === 3 || beat === 4 ? { particles: 'dust', grade: WARM, blend: 'soft-light' }
    : beat === 5 ? { grade: NIGHT, blend: 'multiply' } : { particles: 'dust', grade: GLOOM, blend: 'multiply' },
  crime: (beat) => beat === 4 || beat === 5 ? { grade: DREAD, blend: 'multiply', flash: beat === 4 }
    : beat === 7 ? { particles: 'rain', grade: NIGHT, blend: 'multiply' } : { particles: 'dust', grade: GLOOM, blend: 'multiply' },
  fever: (beat) => beat === 3 ? { particles: 'embers', grade: 'rgba(255, 110, 80, 0.2)', blend: 'soft-light' }
    : beat === 5 ? { grade: NIGHT, blend: 'multiply' } : { particles: 'dust', grade: COLD, blend: 'soft-light' },
  sonya: (beat) => beat === 6 ? { particles: 'fireflies', grade: NIGHT, blend: 'multiply' }
    : beat === 0 ? { particles: 'rain', grade: NIGHT, blend: 'multiply' } : { particles: 'dust', grade: WARM, blend: 'soft-light' },
  porfiry: () => ({ particles: 'dust', grade: GLOOM, blend: 'soft-light' }),
  truth: (beat) => beat === 6 ? { particles: 'magic', grade: WARM, blend: 'soft-light' } : { particles: 'dust', grade: WARM, blend: 'soft-light' },
  confession: (beat) => beat === 2 ? { particles: 'spray', grade: 'rgba(255, 140, 90, 0.18)', blend: 'soft-light' }
    : beat === 5 ? { particles: 'magic', grade: WARM, blend: 'soft-light' } : { particles: 'dust', grade: GLOOM, blend: 'soft-light' },
  siberia: (beat) => beat <= 3 ? { grade: COLD, blend: 'soft-light' }
    : beat === 6 ? { particles: 'confetti', grade: WARM, blend: 'soft-light' } : { particles: 'fireflies', grade: WARM, blend: 'soft-light' },
};
