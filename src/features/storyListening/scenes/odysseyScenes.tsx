'use client';

import type { ComponentType } from 'react';

import type { StorySentence } from '../types';
import {
  Bubble, Camera, Cloud, ForegroundGrass, ForegroundRocks, HERO, Hearts, Hotspot, INK, Layer, Moon, Move, Night,
  Notes, Person, Pig, Poof, SAILOR, SOLDIER, Sea, Sheep, Ship, Sky, Sparkles, Sun,
} from './parts';
import {
  Aeolus, Arrow, Axe, Boulder, Bow, CaveInterior, Campfire, Cheese, Column, Cup, Cyclops, Dolphin, Flower,
  GoldThought, Island, OliveTree, Palace, SeaRocks, SheepRider, Siren, Tent, Torch, TrojanHorse,
  TroyWall, Wand, WindBag, Winds, WineBowl,
} from './characters';

/** `effort` (0-1) is the learner's progress on a rub moment, so the scene can react while they act. */
export type SceneProps = { beat: number; bubble?: StorySentence['bubble']; effort?: number };

export type ParticleKind = 'dust' | 'spray' | 'embers' | 'rain' | 'magic' | 'fireflies' | 'confetti';
/** Screen-level mood for a beat: floating particles, colour grade and lightning. */
export type Atmosphere = {
  particles?: ParticleKind;
  grade?: string;
  blend?: 'multiply' | 'soft-light' | 'screen' | 'overlay';
  flash?: boolean;
};

type Point = [number, number];
const pick = <T,>(beat: number, values: readonly T[]) => values[Math.min(beat, values.length - 1)];

function SpeechAt({ bubble, at }: { bubble?: StorySentence['bubble']; at: Record<string, Point> }) {
  if (!bubble) return null;
  const point = at[bubble.speaker] ?? [800, 160];
  return <Bubble key={bubble.text} x={point[0]} y={point[1]} text={bubble.text} speaker={bubble.speaker} />;
}

function JumpingDolphin({ x, y, on, delay = 0 }: { x: number; y: number; on: boolean; delay?: number }) {
  return on ? (
    <g transform={`translate(${x} ${y})`} pointerEvents="none">
      <g className="story-dolphin" style={{ animationDelay: `${delay}s` }}><Dolphin /></g>
    </g>
  ) : null;
}

function IthacaScene({ beat, bubble }: SceneProps) {
  const cam = pick<[number, number, number]>(beat, [[800, 450, 1], [640, 520, 1.45], [900, 470, 1.05], [920, 520, 1.2], [900, 450, 1]]);
  const shipX = pick(beat, [1900, 1900, 1240, 1240, 1300]);
  return (
    <Camera fx={cam[0]} fy={cam[1]} s={cam[2]}>
      <Sky top="#6fbcea" bottom="#ffe1b0" rays birds>
        <Sun x={1300} y={beat === 0 ? 330 : 170} />
        <Cloud x={280} y={150} />
        <Cloud x={980} y={110} s={0.8} />
      </Sky>
      <Layer depth={-6}>
        <path d="M1150 610 Q1300 520 1480 540 Q1620 560 1720 610 Z" fill="#9cc3d6" opacity={0.8} />
      </Layer>
      <Sea y={600} />
      <JumpingDolphin x={1480} y={760} on={beat >= 4} />
      <Hotspot id="island" label="island" cx={600} cy={560} rx={460} ry={130}>
        <path d="M120 680 Q260 420 620 400 Q980 420 1100 680 Z" fill="url(#st-grass)" stroke={INK} strokeWidth={5} />
        <path d="M200 680 Q320 480 620 470 Q920 480 1020 680 Z" fill="#a3d672" opacity={0.45} />
        <ellipse cx={610} cy={690} rx={520} ry={40} fill="url(#st-sand)" stroke={INK} strokeWidth={4} />
        <g transform="translate(260 600)"><OliveTree s={0.9} /></g>
        <g transform="translate(980 610)"><OliveTree s={0.8} /></g>
        <g transform="translate(620 520)"><Palace /></g>
      </Hotspot>
      <rect x={1000} y={660} width={240} height={20} fill="url(#st-wood)" stroke={INK} strokeWidth={4} />
      {[1020, 1100, 1180].map((x) => <rect key={x} x={x} y={676} width={14} height={64} fill="url(#st-wood-dark)" stroke={INK} strokeWidth={3} />)}
      <Move x={720} y={690} o={beat >= 1 ? 1 : 0}>
        <Person tunic="#2f8f86" dress hair="#3b2416" wave={beat >= 3} mood={beat >= 3 ? 'sad' : 'smile'}
          holding={<g><ellipse cx={-30} cy={0} rx={36} ry={23} fill="#f7f1e3" stroke={INK} strokeWidth={3} /><circle cx={-52} cy={-8} r={15} fill="#f3c79b" stroke={INK} strokeWidth={3} /><circle cx={-56} cy={-10} r={2} fill={INK} /></g>} />
        <g transform="translate(0 -260)"><Hearts on={beat === 1} /></g>
      </Move>
      <Move x={pick(beat, [580, 580, 580, 1060, 1060])} y={690} o={beat >= 4 ? 0 : 1} dur={1.8}>
        {beat < 4 ? (
          <Hotspot id="hero" label="king" cy={-120} rx={70} ry={150}>
            <Person {...HERO} wave={beat === 0} mood={beat === 2 ? 'surprised' : 'smile'} />
          </Hotspot>
        ) : <Person {...HERO} />}
      </Move>
      <Move x={shipX} y={700} s={beat >= 4 ? 0.8 : 1} dur={2.4}>
        <Hotspot id="ship" label="ship" cy={-150} rx={230} ry={190}>
          <Ship>
            <g style={{ opacity: beat >= 4 ? 1 : 0, transition: 'opacity .6s ease' }}>
              <Person {...HERO} wave />
            </g>
            <g transform="translate(220 0)"><Person {...SAILOR} /></g>
          </Ship>
        </Hotspot>
        {/* Match Ship's rocking deck; paint after the ship's hit area so hero taps reach hero. */}
        {beat >= 4 ? (
          <g className="story-rock">
            <g transform="translate(0 -52) scale(0.5)">
              <Hotspot id="hero" label="king" cy={-120} rx={70} ry={150}>{null}</Hotspot>
            </g>
          </g>
        ) : null}
        <g style={{ opacity: beat === 2 ? 1 : 0, transition: 'opacity .5s ease' }}>
          <circle cx={180} cy={-390} r={40} fill="#e5483a" stroke={INK} strokeWidth={5} className="story-pop" />
          <text x={180} y={-372} textAnchor="middle" fontSize={52} fontWeight={900} fill="#ffffff">!</text>
        </g>
      </Move>
      <ForegroundGrass y={940} />
      <SpeechAt bubble={bubble} at={{ Odysseus: [1180, 380] }} />
    </Camera>
  );
}

function HorseScene({ beat, bubble }: SceneProps) {
  const cam = pick<[number, number, number]>(beat, [[800, 450, 1], [560, 480, 1.25], [600, 480, 1.1], [950, 470, 1], [1050, 520, 1.3]]);
  const night = beat >= 4;
  const horseX = pick(beat, [520, 520, 520, 1000, 1000]);
  return (
    <Camera fx={cam[0]} fy={cam[1]} s={cam[2]}>
      <Sky top="#7cc3ec" bottom="#ffe6b8" rays={!night} birds={!night}>
        <Sun x={260} y={night ? 700 : 160} />
        <Cloud x={560} y={130} />
      </Sky>
      <Moon x={1250} y={night ? 120 : -200} o={night ? 1 : 0} />
      <Layer depth={-5}>
        <path d="M-800 640 Q0 540 700 600 Q1200 560 2400 640 L2400 900 L-800 900 Z" fill="#e8cf96" />
      </Layer>
      <path d="M-800 700 Q400 650 2400 700 L2400 1500 L-800 1500 Z" fill="url(#st-sand)" />
      <path d="M-800 700 Q400 650 2400 700" fill="none" stroke={INK} strokeWidth={4} opacity={0.4} />
      <Hotspot id="walls" label="wall" cx={1230} cy={480} rx={420} ry={200}>
        <TroyWall gateOpen={beat >= 3} flag={night ? '#2f5d8a' : '#c23b2e'} />
      </Hotspot>
      <Hotspot id="gate" label="gate" cx={1180} cy={600} rx={120} ry={130}><rect x={1080} y={460} width={200} height={10} fill="none" /></Hotspot>
      <Move x={0} y={0} o={beat <= 1 ? 1 : 0}>
        <g transform="translate(140 720)"><Tent /></g>
        <g transform="translate(330 740)"><Tent stripe="#2f5d8a" /></g>
      </Move>
      <Move x={horseX} y={790} s={beat >= 1 ? 1 : 0.2} o={beat >= 1 ? 1 : 0} dur={beat === 3 ? 2.6 : 1}>
        <Hotspot id="horse" label="horse" cy={-230} rx={260} ry={250}>
          <TrojanHorse open={night} rolling={beat === 3} />
        </Hotspot>
        <g transform="translate(0 -320)"><Sparkles on={beat === 1} /></g>
      </Move>
      {beat === 3 ? <line x1={horseX + 240} y1={760} x2={1200} y2={700} stroke="#d9b07a" strokeWidth={7} /> : null}
      {[0, 1, 2].map((i) => (
        <Move key={i}
          x={pick(beat, [220 + i * 80, 220 + i * 80, 400 + i * 70, 470, 820 + i * 80])}
          y={pick(beat, [800, 800, 790, 790, 800])}
          s={beat === 2 ? 0.6 : 0.85}
          o={beat === 3 ? 0 : 1}
          delay={i * 0.15} dur={1.6}>
          <Hotspot id="soldiers" label="soldier" cy={-120} rx={60} ry={140}>
            <Person {...SOLDIER} armsUp={night} mood={night ? 'shout' : 'smile'} />
          </Hotspot>
        </Move>
      ))}
      <Move x={beat >= 2 ? 520 : 700} y={beat >= 2 ? 700 : 800} s={beat >= 2 ? 0.5 : 1} o={beat >= 2 ? 0 : 1} dur={1.4}>
        <Person {...HERO} wave={beat === 1} />
      </Move>
      {[0, 1].map((i) => (
        <Move key={i} x={1220 + i * 90} y={720} s={0.7} o={beat === 3 ? 1 : 0} delay={0.5}>
          <g className="story-pull"><Person tunic="#b23a3a" helmet crest="#7a1f1f" mood="laugh" /></g>
        </Move>
      ))}
      <Night on={night} strength={0.42} />
      <ForegroundGrass y={950} color="#9c8443" />
      <SpeechAt bubble={bubble} at={{ Odysseus: [700, 470] }} />
    </Camera>
  );
}

function CaveScene({ beat, bubble }: SceneProps) {
  const cam = pick<[number, number, number]>(beat, [[800, 450, 1], [560, 560, 1.3], [820, 450, 1], [1000, 480, 1], [820, 420, 1], [640, 540, 1.25]]);
  const inside = beat >= 1;
  return (
    <Camera fx={cam[0]} fy={cam[1]} s={cam[2]} shake={beat === 2 || beat === 4}>
      <g style={{ opacity: inside ? 0 : 1, transition: 'opacity 1s ease' }} pointerEvents={inside ? 'none' : undefined}>
        <Sky top="#7cbfe9" bottom="#e6f2d0" birds><Cloud x={300} y={120} /></Sky>
        <Sea y={700} />
        <Hotspot id="cave" label="cave" cx={950} cy={560} rx={300} ry={260}>
          <path d="M420 760 Q520 200 960 160 Q1400 200 1600 760 Z" fill="#9b7b5c" stroke={INK} strokeWidth={6} />
          <path d="M520 760 Q620 300 960 270 Q1300 300 1460 760 Z" fill="#8a6a4c" />
          <path d="M600 420 Q700 360 760 380 M1180 360 Q1260 380 1300 440" fill="none" stroke="#6b5038" strokeWidth={6} />
          <path d="M760 760 L760 560 Q960 330 1160 560 L1160 760 Z" fill="#1c130e" stroke={INK} strokeWidth={6} />
          <circle cx={930} cy={560} r={8} fill="#ffe27a" className="story-twinkle" />
          <circle cx={990} cy={560} r={8} fill="#ffe27a" className="story-twinkle" style={{ animationDelay: '.4s' }} />
        </Hotspot>
        <path d="M-800 740 L600 740 Q1100 720 2400 740 L2400 1500 L-800 1500 Z" fill="url(#st-grass)" stroke={INK} strokeWidth={4} />
        <g transform="translate(220 760) scale(0.55)"><Ship /></g>
        <g transform="translate(1300 800) scale(0.7)"><g className="story-graze"><Sheep /></g></g>
        <g transform="translate(1440 820) scale(0.7)"><g className="story-graze" style={{ animationDelay: '.8s' }}><Sheep /></g></g>
        {[0, 1, 2].map((i) => (
          <Move key={i} x={beat === 0 ? 600 + i * 70 : 900} y={820} s={0.7} delay={i * 0.2} dur={2.4}>
            <Person {...(i === 0 ? HERO : SAILOR)} />
          </Move>
        ))}
        <ForegroundGrass y={960} />
      </g>
      <g style={{ opacity: inside ? 1 : 0, transition: 'opacity 1s ease' }} pointerEvents={inside ? undefined : 'none'}>
        <CaveInterior closed={beat >= 3} />
        <g transform="translate(600 760)"><Campfire /></g>
        <g transform="translate(360 760)"><Cheese /></g>
        {[0, 1, 2].map((i) => (
          <Move key={i}
            x={pick(beat, [500, 460 + i * 130, 260 + i * 70, 260 + i * 70, 260 + i * 70, i === 0 ? 660 : 240 + i * 70])}
            y={790} s={0.8} delay={i * 0.12}>
            <g className={beat === 1 ? 'story-bob' : beat >= 2 && beat < 5 ? 'story-tremble' : undefined}>
              <Person {...(i === 0 ? HERO : SAILOR)} mood={beat >= 2 && beat < 5 ? (beat === 2 ? 'surprised' : 'sad') : 'smile'} />
            </g>
          </Move>
        ))}
        <Hotspot id="sheep" label="sheep" cx={900} cy={760} rx={170} ry={80}>
          {[0, 1].map((i) => (
            <Move key={i} x={beat >= 2 ? 830 + i * 120 : 1700} y={840} s={0.85} delay={0.4 + i * 0.2} dur={2}>
              <Sheep />
            </Move>
          ))}
        </Hotspot>
        <Move x={beat >= 2 ? 1180 : 1900} y={830} r={beat === 4 ? -6 : 0} dur={2}>
          <Hotspot id="cyclops" label="giant" cy={-320} rx={230} ry={330}>
            <Cyclops roar={beat === 4} />
          </Hotspot>
        </Move>
        <Move x={beat >= 3 ? 1360 : 2000} y={930} r={beat >= 3 ? -360 : 0} dur={2.2}>
          <Hotspot id="rock" label="rock" cy={-190} rx={220} ry={210}><Boulder /></Hotspot>
        </Move>
        <ForegroundRocks />
      </g>
      <SpeechAt bubble={bubble} at={{ Cyclops: [1000, 200], Odysseus: [660, 470] }} />
    </Camera>
  );
}

function NobodyScene({ beat, bubble }: SceneProps) {
  const cam = pick<[number, number, number]>(beat, [[860, 460, 1.05], [1000, 420, 1.1], [900, 380, 1.1], [900, 420, 1], [1100, 560, 1]]);
  const asleep = beat === 1 || beat === 2;
  const morning = beat >= 4;
  return (
    <Camera fx={cam[0]} fy={cam[1]} s={cam[2]} shake={beat === 3}>
      <CaveInterior closed={!morning} day={morning} />
      <g transform="translate(560 790)"><Campfire /></g>
      <Move x={morning ? 1600 : 1360} y={930} r={morning ? 200 : 0} dur={2}>
        <Boulder />
      </Move>
      <Move x={1060} y={pick(beat, [840, 900, 900, 840, 860])} r={asleep ? -8 : 0} dur={1.4}>
        <Hotspot id="cyclops" label="sleep" cy={-320} rx={230} ry={330}>
          <Cyclops eye={beat === 0 ? 'open' : beat <= 2 ? 'closed' : 'hurt'} armsUp={beat === 3} />
        </Hotspot>
        {asleep ? (
          <g transform="translate(140 -720)">
            <g className="story-zzz">
              <text fontSize={64} fontWeight={900} fill="#ffffff" stroke={INK} strokeWidth={3}>Z</text>
              <text x={46} y={-52} fontSize={46} fontWeight={900} fill="#ffffff" stroke={INK} strokeWidth={3}>z</text>
              <text x={82} y={-94} fontSize={32} fontWeight={900} fill="#ffffff" stroke={INK} strokeWidth={2.5}>z</text>
            </g>
          </g>
        ) : null}
        {beat === 2 ? <g transform="translate(0 -574)"><Sparkles on spread={100} color="#ffffff" /></g> : null}
      </Move>
      <Move x={pick(beat, [760, 400, 640, 300, 300])} y={800} s={0.85} o={morning ? 0 : 1}>
        <Person {...HERO} mood={beat === 3 ? 'surprised' : 'smile'}
          holding={beat === 0 ? <Hotspot id="wine" label="wine" cy={-10} rx={70} ry={50}><g transform="translate(20 -14) scale(1.4)"><WineBowl /></g></Hotspot> : undefined} />
      </Move>
      {[0, 1].map((i) => (
        <Move key={i} x={pick(beat, [380 + i * 110, 240 + i * 90, 520 - i * 120, 200 + i * 80, 200])} y={800} s={0.8} o={morning ? 0 : 1}>
          <g className={beat === 3 ? 'story-tremble' : undefined}><Person {...SAILOR} mood={beat === 3 ? 'sad' : 'smile'} /></g>
        </Move>
      ))}
      <Move x={beat === 2 ? 760 : 300} y={beat === 2 ? 290 : 720} r={beat === 2 ? -26 : -4} o={beat === 1 || beat === 2 ? 1 : 0} dur={1.6}>
        <Hotspot id="stick" label="stick" cx={-110} cy={0} rx={170} ry={50}>
          <rect x={-260} y={-10} width={260} height={20} rx={8} fill="url(#st-wood)" stroke={INK} strokeWidth={4} />
          <circle cx={20} cy={0} r={46} fill="url(#st-fireglow)" />
          <path d="M0 -13 L50 0 L0 13 Z" fill="#ff8a3d" stroke={INK} strokeWidth={3} className="story-flicker" />
        </Hotspot>
      </Move>
      <Hotspot id="sheep" label="escape" cx={1200} cy={760} rx={300} ry={90}>
        {[0, 1, 2].map((i) => (
          <Move key={i} x={morning ? 1120 + i * 170 : 420 + i * 140} y={morning ? 800 : 850} s={morning ? 1.1 : 0.9} o={beat >= 3 ? 1 : 0} delay={i * 0.4} dur={3}>
            <g className={morning ? 'story-trot' : undefined}>
              <Sheep />
              {morning ? <SheepRider /> : null}
            </g>
          </Move>
        ))}
      </Hotspot>
      <ForegroundRocks />
      <SpeechAt bubble={bubble} at={{ Cyclops: [900, 180] }} />
    </Camera>
  );
}

function WindsScene({ beat, bubble }: SceneProps) {
  const cam = pick<[number, number, number]>(beat, [[860, 420, 1], [900, 460, 0.95], [620, 560, 1.45], [700, 450, 1]]);
  const storm = beat >= 3;
  const shipX = pick(beat, [520, 640, 620, 300]);
  return (
    <Camera fx={cam[0]} fy={cam[1]} s={cam[2]} shake={storm}>
      <Sky top="#6fbcea" bottom="#e9f6ff" rays={!storm} birds={!storm}>
        <Sun x={1450} y={storm ? 600 : 150} />
        <Cloud x={420} y={140} />
      </Sky>
      <g style={{ opacity: storm ? 1 : 0, transition: 'opacity 1.4s ease' }} pointerEvents="none">
        <rect x={-800} y={-600} width={3200} height={2100} fill="#3a4560" opacity={0.65} />
        <Cloud x={500} y={120} s={1.6} color="#6b7790" shade="#4a5570" />
        <Cloud x={1100} y={160} s={1.8} color="#5c6880" shade="#3f4a62" />
        <path d="M980 230 L940 330 L980 330 L930 450" fill="none" stroke="#fff6b0" strokeWidth={8} strokeLinejoin="round" className="story-bolt" />
      </g>
      <Move x={beat >= 1 && !storm ? 1360 : 1750} y={650} s={beat === 1 ? 1 : 0.6} o={beat >= 1 && !storm ? 1 : 0} dur={2}>
        <Island />
      </Move>
      <Sea y={650} color={storm ? '#2a5f86' : '#2f86c0'} />
      <JumpingDolphin x={1100} y={780} on={beat === 1} delay={0.6} />
      <Move x={1150} y={beat === 0 ? 360 : -200} o={beat === 0 ? 1 : 0} dur={1.6}>
        <Aeolus />
        <g transform="translate(0 -120)"><Winds burst={false} /></g>
      </Move>
      <Move x={shipX} y={720} r={storm ? -12 : 0} s={storm ? 0.8 : 1} dur={2.2}>
        <Ship>
          <Person {...HERO} wave={beat === 1} mood={storm ? 'shout' : 'smile'} />
          <g transform="translate(-260 0)">
            <Hotspot id="sailors" label="sailor" cy={-120} rx={60} ry={140}><Person {...SAILOR} mood={storm ? 'surprised' : 'smile'} /></Hotspot>
          </g>
          <g transform="translate(-160 0)">
            <Hotspot id="sailors" label="sailor" cy={-120} rx={60} ry={140}><Person {...SAILOR} hair="#7a5530" mood={storm ? 'surprised' : 'smile'} /></Hotspot>
          </g>
        </Ship>
      </Move>
      <Move x={beat === 0 ? 1050 : shipX + 110} y={beat === 0 ? 420 : 668} r={storm ? -12 : 0} s={0.9} dur={1.8}>
        <Hotspot id="winds" label="wind" cy={-100} rx={300} ry={200}>
          <g transform="translate(0 -100)"><Winds burst={storm} /></g>
        </Hotspot>
        <Hotspot id="bag" label="bag" cy={-60} rx={90} ry={80}>
          <WindBag open={storm} />
        </Hotspot>
      </Move>
      <Move x={shipX - 60} y={480} s={beat === 2 ? 0.9 : 0.4} o={beat === 2 ? 1 : 0}>
        <GoldThought />
      </Move>
      <SpeechAt bubble={bubble} at={{ 'King of the Winds': [880, 170] }} />
    </Camera>
  );
}

function CirceScene({ beat, bubble }: SceneProps) {
  const cam = pick<[number, number, number]>(beat, [[800, 450, 1], [680, 560, 1.2], [460, 480, 1.15], [700, 500, 1.05], [700, 540, 1.1]]);
  const pigs = beat >= 1 && beat <= 3;
  return (
    <Camera fx={cam[0]} fy={cam[1]} s={cam[2]}>
      <Sky top="#7e6cc0" bottom="#f9c4d6">
        <Moon x={1380} y={150} />
        <Cloud x={420} y={130} color="#f3e6ff" shade="#d9c7f2" />
      </Sky>
      <Sea y={640} color="#5f7fc0" deep="#3d5a96" light="#b8c8f0" />
      <path d="M-800 730 Q300 650 900 660 Q1500 650 2400 730 L2400 1500 L-800 1500 Z" fill="url(#st-grass)" stroke={INK} strokeWidth={5} />
      <g transform="translate(160 720)"><OliveTree /></g>
      <g transform="translate(1500 720)"><OliveTree s={1.1} /></g>
      <g transform="translate(1200 700) scale(1.2)">
        <circle cx={0} cy={-120} r={260} fill="url(#st-magicglow)" opacity={0.5} className="story-pulse" />
        <Palace roof="#9b7bd0" wall="#f3ecff" />
      </g>
      <Move x={1010} y={780}>
        <Hotspot id="circe" label="witch" cy={-120} rx={80} ry={150}>
          <Person tunic="#7b4bb3" dress long hair="#1f1a2e" trim="#f4c542" mood={beat === 3 ? 'surprised' : 'smile'} holding={<Wand />} />
        </Hotspot>
        <g transform="translate(70 -190)"><Sparkles on={beat === 1 || beat === 4} color="#d9b8ff" spread={70} /></g>
      </Move>
      {beat === 3 ? <path d="M1060 600 Q760 520 420 650" fill="none" stroke="#c58cff" strokeWidth={12} strokeDasharray="26 16" strokeLinecap="round" className="story-beam" /> : null}
      <Hotspot id="pigs" label="pig" cx={640} cy={760} rx={220} ry={90}>
        {[0, 1, 2].map((i) => (
          <g key={i} transform={`translate(${520 + i * 120} 800)`}>
            <Move s={0.75} o={pigs ? 0 : 1} dur={0.5}>
              <Person {...SAILOR} holding={beat === 0 ? <Cup /> : undefined} mood={beat === 4 ? 'laugh' : 'smile'} />
            </Move>
            <Move s={0.9} o={pigs ? 1 : 0} dur={0.5}>
              <g className={pigs ? 'story-bob' : undefined} style={{ animationDelay: `${i * 0.2}s` }}><Pig /></g>
            </Move>
            <Poof key={`poof-${beat}`} on={beat === 1 || beat === 4} />
          </g>
        ))}
      </Hotspot>
      <Move x={360} y={800}>
        <Person {...HERO} mood={beat === 1 ? 'surprised' : 'smile'} holding={beat >= 2 ? <g transform="translate(10 -10) scale(0.8)"><Flower /></g> : undefined} />
        {beat === 3 ? <circle cx={0} cy={-120} r={150} fill="#fff1a8" opacity={0.25} stroke="#f4c542" strokeWidth={8} className="story-pulse" /> : null}
      </Move>
      <Move x={beat >= 2 ? 410 : 400} y={beat === 2 ? 640 : -300} o={beat === 2 ? 1 : 0} dur={2.2}>
        <rect x={-50} y={-1000} width={100} height={1000} fill="url(#st-glow)" opacity={0.5} />
        <Hotspot id="flower" label="flower" rx={60} ry={60}><Flower /></Hotspot>
      </Move>
      <ForegroundGrass y={950} color="#3f7a40" />
      <SpeechAt bubble={bubble} at={{ Circe: [1020, 470] }} />
    </Camera>
  );
}

function SirensScene({ beat, bubble }: SceneProps) {
  const cam = pick<[number, number, number]>(beat, [[800, 450, 1], [560, 540, 1.5], [560, 500, 1.5], [950, 470, 1.05], [1000, 450, 1]]);
  const shipX = pick(beat, [360, 560, 560, 850, 1180]);
  return (
    <Camera fx={cam[0]} fy={cam[1]} s={cam[2]}>
      <Sky top="#8fcbef" bottom="#fde6c8" rays birds={beat === 4}>
        <Sun x={300} y={140} />
        <Cloud x={900} y={120} />
      </Sky>
      <Hotspot id="sirens" label="song" cx={1360} cy={460} rx={230} ry={140}>
        <SeaRocks />
        {[[1220, 580, '#c2452d'], [1360, 500, '#6b3fa0'], [1490, 590, '#2f7a6b']].map(([x, y, hair], i) => (
          <Move key={i} x={x as number} y={y as number} o={beat >= 4 ? 0.35 : 1}>
            <g className="story-bob" style={{ animationDelay: `${i * 0.3}s` }}><Siren hair={hair as string} /></g>
            <g transform="translate(0 -200)"><Notes on={beat !== 1 && beat !== 2} /></g>
          </Move>
        ))}
      </Hotspot>
      <Sea y={680} />
      <JumpingDolphin x={700} y={800} on={beat === 4} />
      {beat === 3 ? (
        <g transform="translate(1050 420)"><g className="story-notes-fly"><Notes on color="#ff5f9b" /></g></g>
      ) : null}
      <Move x={shipX} y={760} dur={2.4}>
        <Ship mastSlot={(
          <Hotspot id="mast" label="mast" cy={-170} rx={60} ry={170}>
            <g transform="translate(0 -52) scale(0.5)">
              <g className={beat === 3 ? 'story-wiggle' : undefined}><Person {...HERO} mood={beat === 3 ? 'shout' : 'smile'} /></g>
            </g>
            {beat >= 2 ? [-150, -120, -90].map((y) => <line key={y} x1={-26} y1={y} x2={26} y2={y} stroke="#d9b07a" strokeWidth={8} strokeLinecap="round" className="story-pop" />) : null}
          </Hotspot>
        )}>
          <g transform="translate(-260 0)">
            <Hotspot id="sailors" label="wax" cy={-120} rx={60} ry={140}><Person {...SAILOR} earWax={beat >= 1} /></Hotspot>
          </g>
          <g transform="translate(260 0)">
            <Hotspot id="sailors" label="wax" cy={-120} rx={60} ry={140}><Person {...SAILOR} hair="#7a5530" earWax={beat >= 1} /></Hotspot>
          </g>
        </Ship>
      </Move>
      <SpeechAt bubble={bubble} at={{ Odysseus: [850, 350] }} />
    </Camera>
  );
}

function HomeScene({ beat, bubble }: SceneProps) {
  const cam = pick<[number, number, number]>(beat, [[520, 500, 1.15], [1000, 500, 1.05], [880, 500, 1], [860, 500, 0.95], [560, 520, 1.25]]);
  const revealed = beat >= 4;
  return (
    <Camera fx={cam[0]} fy={cam[1]} s={cam[2]}>
      <Layer depth={-6}>
        <rect x={-800} y={-600} width={3200} height={2100} fill="#f1e2c6" />
        <rect x={-800} y={-600} width={3200} height={760} fill="#e8d3ad" />
        <path d="M-800 160 L2400 160" stroke="#c9a173" strokeWidth={10} />
        {[200, 600, 1000, 1400].map((x) => (
          <g key={x} transform={`translate(${x} 300)`}>
            <path d="M-50 -60 L50 -60 L40 60 L-40 60 Z" fill="#b23a3a" stroke={INK} strokeWidth={4} />
            <circle cx={0} cy={0} r={20} fill="url(#st-bronze)" stroke={INK} strokeWidth={3} />
          </g>
        ))}
      </Layer>
      <path d="M-800 740 L2400 740 L2400 1500 L-800 1500 Z" fill="#c9a173" />
      <path d="M-800 740 L2400 740" stroke={INK} strokeWidth={5} />
      {[0, 1, 2, 3, 4, 5].map((i) => <rect key={i} x={-200 + i * 400} y={740} width={4} height={400} fill="#b48a5c" />)}
      <Hotspot id="palace" label="palace" cx={800} cy={420} rx={760} ry={330}>
        {[120, 480, 1120, 1480].map((x) => <g key={x} transform={`translate(${x} 750)`}><Column /></g>)}
        <path d="M640 160 L960 160 L960 260 Q800 200 640 260 Z" fill="#b23a3a" stroke={INK} strokeWidth={4} />
      </Hotspot>
      {[300, 1300].map((x) => <g key={x} transform={`translate(${x} 380)`}><Torch /></g>)}
      {['#b23a3a', '#6b8e3a', '#8a4fb3', '#d08a2a'].map((tunic, i) => (
        <Move key={tunic} x={revealed ? 1800 + i * 80 : 840 + i * 110} y={800} s={0.8} o={beat >= 1 ? 1 : 0} delay={i * 0.1} dur={revealed ? 1.6 : 1}>
          <g className={beat === 1 ? 'story-bob' : beat === 3 ? 'story-tremble' : undefined}>
            <Person tunic={tunic} hair={i % 2 ? '#2b2118' : '#7a5530'} mood={beat === 1 || beat === 2 ? 'laugh' : 'surprised'} />
          </g>
        </Move>
      ))}
      <g style={{ opacity: beat >= 2 && beat <= 3 ? 1 : 0, transition: 'opacity .8s ease' }}>
        {Array.from({ length: 12 }, (_, i) => (
          <g key={i} transform={`translate(${540 + i * 64} 790) scale(0.9)`}>
            <Axe glow={beat === 3} />
          </g>
        ))}
      </g>
      <Move x={beat === 3 ? 1380 : 470} y={655} o={beat === 3 ? 1 : 0} dur={beat === 3 ? 1.8 : 0.1} delay={beat === 3 ? 0.6 : 0}>
        <Hotspot id="arrow" label="arrow" rx={120} ry={40}><Arrow /></Hotspot>
      </Move>
      <Move x={pick(beat, [1450, 1420, 1150, 1400, 560])} y={800} o={beat >= 1 ? 1 : 0} dur={1.6}>
        <Person tunic="#2f8f86" dress hair="#3b2416" mood={beat === 1 ? 'sad' : beat === 3 ? 'surprised' : 'smile'}
          holding={beat === 2 ? <Hotspot id="bow" label="bow" rx={70} ry={110}><g transform="translate(6 -30)"><Bow /></g></Hotspot> : undefined} />
      </Move>
      <Move x={720} y={800} o={revealed ? 1 : 0} s={0.95}>
        <Person tunic="#c27a2a" hair="#5a3a22" mood="laugh" />
      </Move>
      <Move x={pick(beat, [300, 260, 260, 420, 400])} y={800} dur={beat === 0 ? 2.4 : 1.2}>
        <Hotspot id="hero" label="beggar" cy={-120} rx={80} ry={150}>
          <g style={{ opacity: revealed ? 0 : 1, transition: 'opacity .8s ease' }}>
            <Person tunic="#8a7458" hood="#7a6248" beard="#d7d7d7" staff={beat < 3} mood="smile"
              holding={beat === 3 ? <g transform="translate(10 -40)"><Bow /></g> : undefined} />
          </g>
          <g style={{ opacity: revealed ? 1 : 0, transition: 'opacity .8s ease .3s' }}>
            <Person {...HERO} wave={revealed} />
          </g>
        </Hotspot>
        <g transform="translate(0 -160)"><Sparkles on={revealed} /></g>
        <g transform="translate(80 -300)"><Hearts on={revealed} /></g>
      </Move>
      <SpeechAt bubble={bubble} at={{ Penelope: [1150, 470], Odysseus: [420, 480] }} />
    </Camera>
  );
}

export const ODYSSEY_SCENES: Record<string, ComponentType<SceneProps>> = {
  ithaca: IthacaScene,
  horse: HorseScene,
  cave: CaveScene,
  nobody: NobodyScene,
  winds: WindsScene,
  circe: CirceScene,
  sirens: SirensScene,
  home: HomeScene,
};

const WARM = 'rgba(255, 176, 92, 0.22)';
const NIGHT = 'rgba(30, 50, 120, 0.22)';

export const ODYSSEY_ATMOSPHERE: Record<string, (beat: number) => Atmosphere> = {
  ithaca: (beat) => beat >= 4 ? { particles: 'spray' } : { particles: 'dust', grade: WARM, blend: 'soft-light' },
  horse: (beat) => beat >= 4
    ? { particles: 'embers', grade: NIGHT, blend: 'multiply' }
    : { particles: 'dust', grade: 'rgba(255, 200, 120, 0.18)', blend: 'soft-light' },
  cave: (beat) => beat === 0 ? { particles: 'dust' } : { particles: 'embers', grade: 'rgba(255, 140, 60, 0.22)', blend: 'soft-light' },
  nobody: (beat) => beat >= 4
    ? { particles: 'dust', grade: WARM, blend: 'soft-light' }
    : { particles: 'embers', grade: beat === 1 || beat === 2 ? 'rgba(40, 30, 80, 0.3)' : 'rgba(255, 140, 60, 0.2)', blend: beat === 1 || beat === 2 ? 'multiply' : 'soft-light' },
  winds: (beat) => beat >= 3
    ? { particles: 'rain', grade: 'rgba(40, 60, 90, 0.35)', blend: 'multiply', flash: true }
    : { particles: beat === 0 ? 'magic' : 'spray' },
  circe: (beat) => ({ particles: beat === 2 ? 'fireflies' : 'magic', grade: 'rgba(160, 110, 230, 0.2)', blend: 'soft-light' }),
  sirens: (beat) => beat === 3
    ? { particles: 'magic', grade: 'rgba(255, 120, 170, 0.18)', blend: 'soft-light' }
    : { particles: 'spray' },
  home: (beat) => beat >= 4 ? { particles: 'confetti', grade: WARM, blend: 'soft-light' } : { particles: 'dust', grade: WARM, blend: 'soft-light' },
};
