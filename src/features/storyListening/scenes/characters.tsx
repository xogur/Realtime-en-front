'use client';

import { INK, lookStyle } from './parts';

/* Larger props and characters used by individual Odyssey scenes. Origins sit on the ground. */

const ink = (width = 4) => ({ stroke: INK, strokeWidth: width, strokeLinejoin: 'round' as const });

export function Palace({ roof = '#e9dcc4', wall = '#f7f1e6' }: { roof?: string; wall?: string }) {
  return (
    <g>
      <ellipse cx={0} cy={4} rx={190} ry={14} fill="#000000" opacity={0.15} />
      <rect x={-176} y={-14} width={352} height={16} fill="#d8cbb3" {...ink(3)} />
      <rect x={-164} y={-26} width={328} height={14} fill="#e6dac4" {...ink(3)} />
      <rect x={-140} y={-152} width={280} height={128} fill={wall} {...ink(4)} />
      <rect x={-140} y={-152} width={280} height={28} fill="#000000" opacity={0.08} />
      {[-120, -60, 60, 120].map((x) => <rect key={x} x={x - 12} y={-148} width={24} height={122} rx={4} fill="url(#st-marble)" {...ink(3)} />)}
      <path d="M-30 -26 L-30 -86 Q0 -112 30 -86 L30 -26 Z" fill="#6b4a2f" {...ink(3)} />
      <rect x={-166} y={-168} width={332} height={18} fill={roof} {...ink(4)} />
      <path d="M-176 -166 L0 -238 L176 -166 Z" fill={roof} {...ink(4)} />
      <path d="M-120 -172 L0 -220 L120 -172 Z" fill="#000000" opacity={0.07} />
      <circle cx={0} cy={-194} r={14} fill="url(#st-bronze)" {...ink(3)} />
    </g>
  );
}

export function OliveTree({ s = 1 }: { s?: number }) {
  return (
    <g transform={`scale(${s})`}>
      <ellipse cx={0} cy={4} rx={60} ry={10} fill="#000000" opacity={0.15} />
      <g className="story-sway">
        <path d="M-10 0 Q-16 -50 -4 -96 L8 -96 Q2 -50 12 0 Z" fill="url(#st-wood)" {...ink(3)} />
        <circle cx={-30} cy={-112} r={38} fill="#5f9446" {...ink(3)} />
        <circle cx={26} cy={-124} r={42} fill="#6fa654" {...ink(3)} />
        <circle cx={-2} cy={-156} r={36} fill="#7fb862" {...ink(3)} />
        <circle cx={-10} cy={-168} r={12} fill="#a2d27f" />
        <circle cx={30} cy={-134} r={10} fill="#a2d27f" />
        {[[-36, -110], [20, -112], [4, -150]].map(([x, y], i) => <ellipse key={i} cx={x} cy={y} rx={5} ry={7} fill="#3f5c2a" />)}
      </g>
    </g>
  );
}

export function TrojanHorse({ open = false, rolling = false }: { open?: boolean; rolling?: boolean }) {
  return (
    <g>
      <ellipse cx={0} cy={4} rx={230} ry={18} fill="#000000" opacity={0.2} />
      <path d="M-172 -252 Q-236 -210 -220 -112" fill="none" stroke={INK} strokeWidth={30} strokeLinecap="round" />
      <path d="M-172 -252 Q-236 -210 -220 -112" fill="none" stroke="#7a4a24" strokeWidth={22} strokeLinecap="round" />
      {[-130, -88, 76, 118].map((x) => <rect key={x} x={x} y={-178} width={30} height={142} rx={8} fill="url(#st-wood)" {...ink(4)} />)}
      <rect x={-178} y={-298} width={334} height={140} rx={62} fill="url(#st-wood)" {...ink(5)} />
      <path d="M-150 -286 Q-10 -300 130 -286" stroke="#e6b177" strokeWidth={8} fill="none" opacity={0.6} strokeLinecap="round" />
      {[-252, -216, -182].map((y) => <line key={y} x1={-150} y1={y} x2={130} y2={y} stroke="#8a5a2c" strokeWidth={4} />)}
      {[-120, -40, 40, 110].map((x) => [-262, -196].map((y) => <circle key={`${x}${y}`} cx={x} cy={y} r={4} fill="#5c3a1c" />))}
      <path d="M86 -270 L150 -418 L216 -400 L160 -252 Z" fill="url(#st-wood)" {...ink(5)} />
      <path d="M150 -438 L264 -416 L272 -366 L184 -360 L150 -392 Z" fill="url(#st-wood)" {...ink(5)} />
      <path d="M156 -442 L170 -480 L188 -438 Z" fill="#a46f3c" {...ink(4)} />
      <path d="M150 -418 L128 -394 L140 -372 L116 -348 L130 -324 L104 -298 L92 -272" fill="none" stroke={INK} strokeWidth={22} strokeLinejoin="round" />
      <path d="M150 -418 L128 -394 L140 -372 L116 -348 L130 -324 L104 -298 L92 -272" fill="none" stroke="#5c3a1c" strokeWidth={14} strokeLinejoin="round" />
      <path d="M190 -380 L262 -372 M200 -424 L176 -366" stroke="#c23b2e" strokeWidth={6} />
      <circle cx={208} cy={-410} r={12} fill="#ffffff" {...ink(3)} />
      <circle cx={211} cy={-410} r={6} fill={INK} />
      <circle cx={213} cy={-413} r={2} fill="#ffffff" />
      <circle cx={260} cy={-380} r={4} fill={INK} />
      <rect x={-48} y={-198} width={96} height={42} rx={4} fill={open ? '#1a0f07' : '#a46f3c'} {...ink(4)} />
      {open ? (
        <g>
          <rect x={-48} y={-156} width={96} height={22} rx={4} fill="#a46f3c" {...ink(4)} />
          <line x1={-20} y1={-156} x2={-20} y2={-30} stroke="#d9b07a" strokeWidth={5} strokeDasharray="10 8" />
          <line x1={20} y1={-156} x2={20} y2={-30} stroke="#d9b07a" strokeWidth={5} strokeDasharray="10 8" />
          <circle cx={0} cy={-178} r={60} fill="url(#st-fireglow)" />
        </g>
      ) : null}
      <rect x={-204} y={-42} width={396} height={28} rx={8} fill="url(#st-wood-dark)" {...ink(4)} />
      {[-160, -60, 60, 150].map((x) => (
        <g key={x} className={rolling ? 'story-spin' : undefined}>
          <circle cx={x} cy={-12} r={24} fill="#4a2f18" {...ink(4)} />
          <path d={`M${x - 18} -12 L${x + 18} -12 M${x} -30 L${x} 6`} stroke="#c48a4e" strokeWidth={4} />
          <circle cx={x} cy={-12} r={7} fill="#c48a4e" {...ink(2)} />
        </g>
      ))}
    </g>
  );
}

export function TroyWall({ gateOpen, flag }: { gateOpen: boolean; flag: string }) {
  return (
    <g>
      <rect x={820} y={360} width={820} height={350} fill="url(#st-stone)" {...ink(5)} />
      {[400, 450, 500, 550, 600, 650].map((y, row) => (
        <g key={y} stroke="#a88f60" strokeWidth={3}>
          <line x1={820} y1={y} x2={1640} y2={y} />
          {Array.from({ length: 10 }, (_, i) => 840 + i * 84 + (row % 2) * 42).map((x) => <line key={x} x1={x} y1={y} x2={x} y2={y + 50} />)}
        </g>
      ))}
      {Array.from({ length: 10 }, (_, i) => 820 + i * 84).map((x) => <rect key={x} x={x} y={330} width={50} height={34} fill="url(#st-stone)" {...ink(4)} />)}
      <rect x={820} y={360} width={820} height={30} fill="#000000" opacity={0.1} />
      {[860, 1520].map((x) => (
        <g key={x}>
          <rect x={x - 72} y={240} width={144} height={470} fill="url(#st-stone)" {...ink(5)} />
          <rect x={x + 20} y={240} width={52} height={470} fill="#000000" opacity={0.09} />
          {[0, 1, 2].map((i) => <rect key={i} x={x - 72 + i * 54} y={210} width={36} height={34} fill="url(#st-stone)" {...ink(4)} />)}
          <path d={`M${x - 14} 330 L${x - 14} 300 Q${x} 284 ${x + 14} 300 L${x + 14} 330 Z`} fill="#2b1d14" />
          <rect x={x - 3} y={120} width={6} height={100} fill="#6b4423" {...ink(2)} />
          <path d={`M${x + 3} 124 L${x + 76} 142 L${x + 3} 164 Z`} fill={flag} {...ink(3)} style={{ transition: 'fill 1s ease' }} className="story-flag" />
        </g>
      ))}
      <path d="M1070 712 L1070 520 Q1180 410 1290 520 L1290 712 Z" fill="#241710" {...ink(5)} />
      <g style={{ transform: `translate(1080px, 0) scale(${gateOpen ? 0.18 : 1}, 1)`, transition: 'transform 1.4s cubic-bezier(.45,.05,.25,1)' }}>
        <path d="M0 710 L0 520 Q50 470 100 455 L100 710 Z" fill="url(#st-wood)" {...ink(5)} />
        <path d="M20 520 L20 700 M50 480 L50 700 M80 462 L80 700" stroke="#6b4423" strokeWidth={4} />
      </g>
      <g style={{ transform: `translate(1280px, 0) scale(${gateOpen ? -0.18 : -1}, 1)`, transition: 'transform 1.4s cubic-bezier(.45,.05,.25,1)' }}>
        <path d="M0 710 L0 520 Q50 470 100 455 L100 710 Z" fill="url(#st-wood)" {...ink(5)} />
        <path d="M20 520 L20 700 M50 480 L50 700 M80 462 L80 700" stroke="#6b4423" strokeWidth={4} />
      </g>
    </g>
  );
}

export function Tent({ stripe = '#c23b2e' }: { stripe?: string }) {
  return (
    <g>
      <ellipse cx={0} cy={4} rx={130} ry={12} fill="#000000" opacity={0.15} />
      <path d="M-114 0 L0 -156 L114 0 Z" fill="#efe6d2" {...ink(4)} />
      <path d="M0 -156 L114 0 L40 0 Z" fill="#000000" opacity={0.08} />
      <path d="M-42 -57 L0 -156 L42 -57 Z" fill={stripe} {...ink(3)} />
      <path d="M-28 0 L0 -62 L28 0 Z" fill="#4a2f18" {...ink(3)} />
      <path d="M0 -156 L0 -186" stroke={INK} strokeWidth={4} />
      <path d="M0 -186 L30 -178 L0 -170 Z" fill={stripe} {...ink(2)} className="story-flag" />
    </g>
  );
}

type CyclopsProps = { eye?: 'open' | 'closed' | 'hurt'; roar?: boolean; armsUp?: boolean };

/** The one-eyed giant, about 650 units tall. His eye follows the learner's finger. */
export function Cyclops({ eye = 'open', roar = false, armsUp = false }: CyclopsProps) {
  const skin = 'url(#st-cyclops)';
  return (
    <g>
      <ellipse cx={0} cy={4} rx={190} ry={22} fill="#000000" opacity={0.22} />
      <rect x={-98} y={-214} width={66} height={214} rx={26} fill={skin} {...ink(5)} />
      <rect x={32} y={-214} width={66} height={214} rx={26} fill={skin} {...ink(5)} />
      <ellipse cx={-66} cy={-8} rx={52} ry={20} fill="#7a9a5c" {...ink(4)} />
      <ellipse cx={66} cy={-8} rx={52} ry={20} fill="#7a9a5c" {...ink(4)} />
      {[-96, -76, 76, 96].map((x) => <circle key={x} cx={x} cy={-12} r={6} fill="#e8e0c8" />)}
      <g className="story-breathe">
        {armsUp ? (
          <g fill={skin} {...ink(5)}>
            <rect x={-164} y={-580} width={60} height={210} rx={30} transform="rotate(18 -134 -390)" />
            <rect x={104} y={-580} width={60} height={210} rx={30} transform="rotate(-18 134 -390)" />
          </g>
        ) : (
          <g fill={skin} {...ink(5)}>
            <rect x={-212} y={-428} width={64} height={236} rx={32} />
            <rect x={148} y={-428} width={64} height={236} rx={32} />
            <circle cx={-180} cy={-192} r={34} />
            <circle cx={180} cy={-192} r={34} />
          </g>
        )}
        <path d="M-154 -436 Q-182 -262 -134 -190 L134 -190 Q182 -262 154 -436 Q0 -490 -154 -436 Z" fill="#7a5532" {...ink(5)} />
        <path d="M-134 -200 L-112 -168 L-88 -200 L-64 -168 L-40 -200 L-16 -168 L8 -200 L32 -168 L56 -200 L80 -168 L104 -200 L134 -200 Z" fill="#7a5532" {...ink(4)} />
        {[[-90, -380], [-30, -330], [50, -400], [90, -300], [-80, -260], [20, -250]].map(([x, y], i) => (
          <path key={i} d={`M${x} ${y} q8 -12 16 0 q8 -12 16 0`} fill="none" stroke="#5a3d22" strokeWidth={4} />
        ))}
        <rect x={-150} y={-240} width={300} height={22} rx={8} fill="#4a2f18" {...ink(4)} />
        <rect x={-36} y={-484} width={72} height={52} fill={skin} {...ink(4)} />
        <g className="story-head">
          <ellipse cx={-114} cy={-552} rx={20} ry={30} fill={skin} {...ink(4)} />
          <ellipse cx={114} cy={-552} rx={20} ry={30} fill={skin} {...ink(4)} />
          <circle cx={0} cy={-554} r={112} fill={skin} {...ink(6)} />
          <path d="M-60 -650 Q-40 -690 -10 -660 Q10 -700 40 -656 Q60 -690 70 -640" fill="none" stroke="#4a2f18" strokeWidth={18} strokeLinecap="round" />
          <path d="M60 -620 A112 112 0 0 1 70 -470 A100 100 0 0 0 60 -620 Z" fill="#000000" opacity={0.08} />
          {eye === 'open' ? (
            <g>
              <ellipse cx={0} cy={-574} rx={54} ry={46} fill="#ffffff" {...ink(5)} />
              <g style={lookStyle(22, 12)}>
                <g className="story-look">
                  <circle cx={0} cy={-570} r={24} fill="#4e7fbf" {...ink(3)} />
                  <circle cx={0} cy={-570} r={11} fill={INK} />
                  <circle cx={8} cy={-578} r={6} fill="#ffffff" />
                </g>
              </g>
              <path d="M-66 -630 Q0 -660 66 -630" fill="none" stroke="#3d2a18" strokeWidth={16} strokeLinecap="round" />
            </g>
          ) : eye === 'closed' ? (
            <g>
              <path d="M-50 -570 Q0 -536 50 -570" fill="none" stroke={INK} strokeWidth={8} strokeLinecap="round" />
              <path d="M-60 -616 Q0 -632 60 -616" fill="none" stroke="#3d2a18" strokeWidth={14} strokeLinecap="round" />
            </g>
          ) : (
            <g stroke={INK} strokeWidth={9} strokeLinecap="round">
              <path d="M-36 -604 L36 -544 M36 -604 L-36 -544" />
              <path d="M-66 -640 Q0 -620 66 -640" fill="none" stroke="#3d2a18" strokeWidth={16} />
            </g>
          )}
          <ellipse cx={0} cy={-516} rx={14} ry={10} fill="#8fae6e" {...ink(3)} />
          <ellipse cx={-56} cy={-504} rx={16} ry={10} fill="#f08a7a" opacity={0.35} />
          <ellipse cx={56} cy={-504} rx={16} ry={10} fill="#f08a7a" opacity={0.35} />
          {roar || eye === 'hurt'
            ? <path d="M-52 -494 Q0 -420 52 -494 Z" fill="#5a2a22" {...ink(4)} />
            : eye === 'closed'
              ? <ellipse cx={0} cy={-486} rx={14} ry={10} fill="#5a2a22" {...ink(3)} />
              : <path d="M-40 -492 Q0 -470 40 -492" fill="none" stroke={INK} strokeWidth={6} strokeLinecap="round" />}
          {roar || eye === 'hurt' ? <path d="M-34 -490 L-26 -472 L-18 -488 M18 -488 L26 -472 L34 -490" fill="#ffffff" stroke={INK} strokeWidth={2} /> : null}
          {eye === 'open' && !roar ? <path d="M-30 -490 L-24 -478 L-18 -490" fill="#ffffff" stroke={INK} strokeWidth={2} /> : null}
        </g>
      </g>
    </g>
  );
}

export function CaveInterior({ closed, day = true }: { closed: boolean; day?: boolean }) {
  return (
    <g>
      <rect x={-800} y={-600} width={3200} height={2100} fill="url(#st-cave)" />
      {[[200, 200, 160], [620, 120, 120], [1080, 180, 170], [380, 440, 90], [900, 380, 110]].map(([x, y, r], i) => (
        <ellipse key={i} cx={x} cy={y} rx={r} ry={r * 0.6} fill="#4a362b" opacity={0.8} />
      ))}
      {[[160, 120], [360, 90], [700, 140], [980, 100], [1180, 130]].map(([x, h], i) => (
        <path key={i} d={`M${x - 40} -60 L${x} ${h} L${x + 40} -60 Z`} fill="#2e211a" stroke={INK} strokeWidth={3} />
      ))}
      <ellipse cx={1340} cy={700} rx={150} ry={250} fill={day ? '#bfe3f5' : '#22305a'} />
      <rect x={1190} y={640} width={300} height={70} fill={day ? '#89c06a' : '#1d3a2a'} />
      {day ? <ellipse cx={1340} cy={680} rx={360} ry={300} fill="url(#st-glow)" opacity={0.25} /> : null}
      <path d="M-800 700 Q400 670 1600 700 L2400 700 L2400 1500 L-800 1500 Z" fill="#5a4334" />
      <path d="M-800 700 Q400 670 1600 700" fill="none" stroke="#3d2a20" strokeWidth={6} />
      {[[150, 780], [820, 760], [1100, 820], [460, 840]].map(([x, y], i) => <ellipse key={i} cx={x} cy={y} rx={40} ry={10} fill="#4a362b" />)}
      <ellipse cx={1340} cy={700} rx={150} ry={250} fill="none" stroke="#1c130e" strokeWidth={30} />
      <g style={{ opacity: closed ? 0.5 : 0, transition: 'opacity 1.4s ease' }} pointerEvents="none">
        <rect x={-800} y={-600} width={3200} height={2100} fill="#120a06" />
      </g>
    </g>
  );
}

export function Campfire() {
  return (
    <g>
      <circle cx={0} cy={-60} r={320} fill="url(#st-fireglow)" className="story-pulse" />
      {[-30, -10, 14, 32].map((x, i) => <circle key={x} cx={x} cy={-4} r={9} fill="#7d7468" stroke={INK} strokeWidth={2} opacity={i % 2 ? 1 : 0.9} />)}
      <rect x={-52} y={-16} width={104} height={18} rx={8} fill="#6b4423" stroke={INK} strokeWidth={3} transform="rotate(12)" />
      <rect x={-52} y={-16} width={104} height={18} rx={8} fill="#7a5530" stroke={INK} strokeWidth={3} transform="rotate(-12)" />
      <path d="M-42 -10 Q-56 -74 0 -132 Q56 -74 42 -10 Z" fill="#ff7a2f" className="story-flicker" />
      <path d="M-26 -10 Q-32 -58 0 -96 Q32 -58 26 -10 Z" fill="#ffb347" className="story-flicker" style={{ animationDelay: '.15s' }} />
      <path d="M-12 -10 Q-14 -36 0 -58 Q14 -36 12 -10 Z" fill="#fff1a8" className="story-flicker" style={{ animationDelay: '.3s' }} />
    </g>
  );
}

export function Cheese() {
  return (
    <g>
      <ellipse cx={30} cy={2} rx={100} ry={10} fill="#000000" opacity={0.2} />
      <path d="M-56 -30 L-56 -46 A56 20 0 0 1 56 -46 L56 -30 A56 30 0 0 1 -56 -30 Z" fill="#f3c74d" {...ink(4)} />
      <ellipse cx={0} cy={-46} rx={56} ry={20} fill="#ffdc6e" {...ink(4)} />
      <circle cx={-18} cy={-46} r={6} fill="#e0ad2c" />
      <circle cx={16} cy={-50} r={5} fill="#e0ad2c" />
      <circle cx={-30} cy={-24} r={5} fill="#e0ad2c" />
      <path d="M70 0 L70 -64 Q72 -76 92 -76 Q114 -76 116 -64 L116 0 Z" fill="#c8a07a" {...ink(4)} />
      <ellipse cx={93} cy={-70} rx={18} ry={6} fill="#ffffff" {...ink(3)} />
      <path d="M78 -40 Q93 -30 108 -40" stroke="#a37b52" strokeWidth={4} fill="none" />
    </g>
  );
}

export function Boulder() {
  return (
    <g>
      <ellipse cx={0} cy={4} rx={210} ry={18} fill="#000000" opacity={0.25} />
      <ellipse cx={0} cy={-190} rx={204} ry={192} fill="url(#st-rock)" {...ink(7)} />
      <ellipse cx={-70} cy={-270} rx={60} ry={36} fill="#bdb7af" opacity={0.7} />
      <ellipse cx={70} cy={-120} rx={44} ry={28} fill="#6c6762" />
      <path d="M-130 -110 Q-90 -90 -64 -136 M40 -300 Q70 -270 110 -280 M-10 -60 Q20 -80 50 -50" fill="none" stroke={INK} strokeWidth={5} opacity={0.6} />
      <path d="M-180 -120 Q-150 -150 -110 -140 Q-150 -100 -180 -120 Z" fill="#6f9a52" />
    </g>
  );
}

export function WineBowl() {
  return (
    <g>
      <path d="M-50 -22 Q0 44 50 -22 Z" fill="url(#st-bronze)" {...ink(4)} />
      <ellipse cx={0} cy={-22} rx={50} ry={11} fill="#7b2b5a" {...ink(3)} />
      <ellipse cx={-14} cy={-24} rx={14} ry={3} fill="#c86da4" />
    </g>
  );
}

export function SheepRider() {
  return (
    <g>
      <ellipse cx={4} cy={-22} rx={42} ry={13} fill="#e7dcc4" stroke={INK} strokeWidth={3} />
      <circle cx={-42} cy={-20} r={14} fill="#f3c79b" stroke={INK} strokeWidth={3} />
      <circle cx={-46} cy={-22} r={2.5} fill={INK} />
      <path d="M-50 -14 Q-46 -10 -42 -14" stroke={INK} strokeWidth={2} fill="none" />
    </g>
  );
}

export function Aeolus() {
  return (
    <g>
      <g className="story-drift">
        <ellipse cx={0} cy={22} rx={160} ry={40} fill="#dce7f2" />
        <ellipse cx={0} cy={10} rx={150} ry={46} fill="#ffffff" stroke="#c9d7e6" strokeWidth={4} />
        <ellipse cx={-80} cy={-6} rx={70} ry={44} fill="#ffffff" />
        <ellipse cx={80} cy={-4} rx={74} ry={46} fill="#ffffff" />
      </g>
      <path d="M-52 -10 Q-64 -124 -38 -176 L38 -176 Q64 -124 52 -10 Z" fill="#3f6fb5" {...ink(4)} />
      <path d="M10 -176 L38 -176 Q64 -124 52 -10 L24 -10 Z" fill="#000000" opacity={0.15} />
      <path d="M-50 -40 L50 -40" stroke="#f0c35a" strokeWidth={6} />
      <rect x={-68} y={-170} width={17} height={84} rx={8} fill="#f3c79b" {...ink(3)} />
      <g transform="translate(60 -170)"><g className="story-arm-wave"><rect x={-8} y={0} width={17} height={84} rx={8} fill="#f3c79b" {...ink(3)} /></g></g>
      <circle cx={0} cy={-206} r={34} fill="#f3c79b" {...ink(4)} />
      <path d="M-32 -202 Q-34 -134 0 -122 Q34 -134 32 -202 Q16 -180 0 -182 Q-16 -180 -32 -202 Z" fill="#f4f4f4" {...ink(3)} />
      <path d="M-36 -212 Q-32 -252 0 -248 Q32 -252 36 -212 Q16 -230 0 -228 Q-16 -230 -36 -212 Z" fill="#f4f4f4" {...ink(3)} />
      <path d="M-26 -244 L-14 -270 L0 -248 L14 -270 L26 -244 Z" fill="url(#st-bronze)" {...ink(3)} />
      <g className="story-blink">
        <circle cx={-12} cy={-210} r={4} fill={INK} />
        <circle cx={12} cy={-210} r={4} fill={INK} />
      </g>
      <path d="M-20 -222 L-5 -219 M20 -222 L5 -219" stroke={INK} strokeWidth={3} strokeLinecap="round" />
    </g>
  );
}

export function WindBag({ open = false }: { open?: boolean }) {
  return (
    <g>
      <circle cx={0} cy={-50} r={110} fill="url(#st-glow)" opacity={0.5} className="story-pulse" />
      <path d="M-58 -10 Q-74 -82 -24 -102 L24 -102 Q74 -82 58 -10 Q0 18 -58 -10 Z" fill="#9fb3c8" {...ink(4)} />
      <path d="M20 -100 Q66 -80 54 -16 Q40 -6 30 -8 Q44 -60 20 -100 Z" fill="#000000" opacity={0.12} />
      <path d="M-30 -62 Q-20 -86 0 -88" fill="none" stroke="#e5eef7" strokeWidth={7} strokeLinecap="round" />
      {open
        ? <path d="M-30 -106 Q0 -134 30 -106" fill="none" stroke="#f4c542" strokeWidth={8} strokeLinecap="round" />
        : <rect x={-32} y={-112} width={64} height={15} rx={7} fill="url(#st-bronze)" {...ink(3)} />}
      {open ? null : <path d="M-22 -114 Q0 -144 22 -114" fill="#9fb3c8" {...ink(4)} />}
    </g>
  );
}

/** Swirling wind spirals; `burst` throws them outward. */
export function Winds({ burst }: { burst: boolean }) {
  return (
    <g pointerEvents="none">
      {[[-120, -60], [100, -120], [0, -200], [-200, -180], [210, -30], [-60, -260]].map(([x, y], i) => (
        <g key={i} style={{ transform: `translate(${burst ? x * 2.6 : x * 0.2}px, ${burst ? y * 1.8 : y * 0.2}px) scale(${burst ? 1.4 : 0.2})`, opacity: burst ? 0.92 : 0, transition: `transform 1.4s cubic-bezier(.2,.8,.3,1) ${i * 0.08}s, opacity .6s ease` }}>
          <path d="M0 0 m-40 0 a40 40 0 1 1 40 40 a26 26 0 1 1 -26 -26 a14 14 0 1 1 14 14" fill="none" stroke="#3d5a7a" strokeWidth={14} strokeLinecap="round" opacity={0.35} className="story-spin" />
          <path d="M0 0 m-40 0 a40 40 0 1 1 40 40 a26 26 0 1 1 -26 -26 a14 14 0 1 1 14 14" fill="none" stroke="#eef9ff" strokeWidth={8} strokeLinecap="round" className="story-spin" />
        </g>
      ))}
    </g>
  );
}

export function Island({ palace = true }: { palace?: boolean }) {
  return (
    <g>
      <path d="M-260 0 Q-180 -150 0 -160 Q180 -150 260 0 Z" fill="url(#st-grass-far)" {...ink(4)} />
      <path d="M-200 0 Q-120 -110 0 -116 Q120 -110 200 0 Z" fill="#a3d672" opacity={0.6} />
      <ellipse cx={0} cy={0} rx={280} ry={18} fill="url(#st-sand)" {...ink(3)} />
      {palace ? <g transform="translate(0 -110) scale(0.45)"><Palace /></g> : null}
      <g transform="translate(-150 -40) scale(0.45)"><OliveTree /></g>
    </g>
  );
}

export function GoldThought() {
  return (
    <g>
      <circle cx={-60} cy={30} r={10} fill="#ffffff" {...ink(3)} />
      <circle cx={-34} cy={0} r={16} fill="#ffffff" {...ink(3)} />
      <ellipse cx={40} cy={-70} rx={104} ry={66} fill="#ffffff" {...ink(5)} />
      {[[0, -60], [44, -78], [84, -54], [20, -96]].map(([x, y], i) => (
        <g key={i} className="story-bob" style={{ animationDelay: `${i * 0.15}s` }}>
          <circle cx={x} cy={y} r={21} fill="url(#st-bronze)" {...ink(3)} />
          <text x={x} y={y + 7} textAnchor="middle" fontSize={20} fontWeight={900} fill="#7a5410">$</text>
        </g>
      ))}
    </g>
  );
}

export function Flower() {
  return (
    <g>
      <circle r={70} fill="url(#st-glow)" className="story-pulse" />
      <path d="M0 0 Q-6 30 0 60" stroke="#4f8a3a" strokeWidth={6} fill="none" />
      <path d="M0 34 Q-24 22 -30 36 Q-14 46 0 38 Z" fill="#6fae52" stroke={INK} strokeWidth={2} />
      {[0, 72, 144, 216, 288].map((a) => <ellipse key={a} cx={0} cy={-17} rx={11} ry={19} fill="#ffffff" stroke={INK} strokeWidth={2.5} transform={`rotate(${a})`} />)}
      <circle r={10} fill="#f4c542" stroke={INK} strokeWidth={2.5} />
    </g>
  );
}

export function Wand() {
  return (
    <g transform="rotate(-30)">
      <rect x={-4} y={-92} width={8} height={92} rx={4} fill="#3b2a55" stroke={INK} strokeWidth={2.5} />
      <circle cx={0} cy={-110} r={36} fill="url(#st-magicglow)" className="story-pulse" />
      <path d="M0 -114 L6 -100 L20 -98 L9 -88 L13 -74 L0 -82 L-13 -74 L-9 -88 L-20 -98 L-6 -100 Z" fill="#f4c542" stroke={INK} strokeWidth={2.5} strokeLinejoin="round" />
    </g>
  );
}

export function Cup() {
  return <path d="M-15 -26 L15 -26 L11 0 L-11 0 Z" fill="url(#st-bronze)" stroke={INK} strokeWidth={3} strokeLinejoin="round" />;
}

export function Siren({ hair = '#c2452d' }: { hair?: string }) {
  return (
    <g>
      <g className="story-flap">
        <path d="M-20 -42 Q-140 -130 -118 -10 Q-76 -50 -20 -10 Z" fill="#e0a83a" {...ink(4)} />
        <path d="M-40 -60 Q-90 -90 -100 -40 M-50 -40 Q-80 -50 -90 -20" fill="none" stroke="#b07a1f" strokeWidth={4} />
      </g>
      <ellipse cx={0} cy={-50} rx={48} ry={58} fill="#f2c14e" {...ink(4)} />
      <path d="M-24 -40 q8 8 16 0 q8 8 16 0 q8 8 16 0 M-24 -16 q8 8 16 0 q8 8 16 0 q8 8 16 0" fill="none" stroke="#c98a1f" strokeWidth={3} />
      <path d="M-30 -10 L-20 20 M0 -6 L0 24 M30 -10 L20 20" stroke="#c98a1f" strokeWidth={6} strokeLinecap="round" />
      <path d="M-36 -152 Q-48 -70 -32 -60 L32 -60 Q48 -70 36 -152 Z" fill={hair} {...ink(4)} />
      <path d="M-22 -102 L22 -102 L28 -62 L-28 -62 Z" fill="#f6b6c8" {...ink(3)} />
      <circle cx={0} cy={-132} r={29} fill="#f5cfa6" {...ink(4)} />
      <path d="M-31 -134 Q-31 -168 0 -166 Q31 -168 31 -134 Q16 -152 0 -150 Q-16 -152 -31 -134 Z" fill={hair} {...ink(3)} />
      <g className="story-blink">
        <path d="M-15 -134 Q-9 -140 -3 -134 M3 -134 Q9 -140 15 -134" stroke={INK} strokeWidth={3} fill="none" strokeLinecap="round" />
      </g>
      <ellipse cx={0} cy={-117} rx={6} ry={8} fill="#b0384d" stroke={INK} strokeWidth={2} className="story-sing" />
      <ellipse cx={-18} cy={-124} rx={5} ry={3} fill="#f08a7a" opacity={0.6} />
      <ellipse cx={18} cy={-124} rx={5} ry={3} fill="#f08a7a" opacity={0.6} />
    </g>
  );
}

export function SeaRocks() {
  return (
    <g>
      <path d="M1080 760 L1150 560 L1230 600 L1300 470 L1400 520 L1470 420 L1560 540 L1640 500 L1700 760 Z" fill="url(#st-rock)" {...ink(6)} />
      <path d="M1150 560 L1190 620 L1230 600 M1300 470 L1330 560 L1400 520 M1470 420 L1490 520 L1560 540" fill="none" stroke="#4f4a45" strokeWidth={5} />
      <path d="M1300 470 L1340 500 L1320 530 Z M1470 420 L1500 460 L1480 480 Z" fill="#c7c1b8" opacity={0.6} />
      {[1120, 1260, 1420, 1600].map((x, i) => <ellipse key={x} cx={x} cy={752} rx={60} ry={12} fill="#ffffff" opacity={0.8} className="story-twinkle" style={{ animationDelay: `${i * 0.4}s` }} />)}
    </g>
  );
}

export function Bow() {
  return (
    <g>
      <path d="M0 -92 Q62 0 0 92" fill="none" stroke={INK} strokeWidth={14} strokeLinecap="round" />
      <path d="M0 -92 Q62 0 0 92" fill="none" stroke="#a46f3c" strokeWidth={8} strokeLinecap="round" />
      <line x1={0} y1={-92} x2={0} y2={92} stroke="#efe6d2" strokeWidth={3} />
      <rect x={20} y={-12} width={14} height={24} rx={4} fill="#c23b2e" stroke={INK} strokeWidth={2} />
    </g>
  );
}

export function Arrow() {
  return (
    <g>
      <path d="M-200 0 L-100 0" stroke="#fff3c4" strokeWidth={10} strokeLinecap="round" opacity={0.6} />
      <line x1={-92} y1={0} x2={72} y2={0} stroke={INK} strokeWidth={10} strokeLinecap="round" />
      <line x1={-92} y1={0} x2={72} y2={0} stroke="#a46f3c" strokeWidth={5} strokeLinecap="round" />
      <path d="M68 -15 L104 0 L68 15 Z" fill="#c7d0d6" stroke={INK} strokeWidth={3} strokeLinejoin="round" />
      <path d="M-92 0 L-114 -16 L-80 -2 Z M-92 0 L-114 16 L-80 2 Z" fill="#c23b2e" stroke={INK} strokeWidth={2.5} strokeLinejoin="round" />
    </g>
  );
}

export function Axe({ glow }: { glow: boolean }) {
  return (
    <g>
      <rect x={-6} y={-132} width={12} height={132} rx={5} fill="url(#st-wood)" stroke={INK} strokeWidth={3} />
      <path d="M-4 -178 Q-44 -172 -50 -140 Q-44 -108 -4 -112 Z" fill="#c7d0d6" stroke={INK} strokeWidth={3.5} strokeLinejoin="round" />
      <circle cx={0} cy={-150} r={16} fill="#aeb8bf" stroke={INK} strokeWidth={3.5} />
      <circle cx={0} cy={-150} r={9} fill={glow ? '#ffe27a' : '#f1e2c6'} style={{ transition: 'fill .4s ease' }} />
      {glow ? <circle cx={0} cy={-150} r={30} fill="url(#st-glow)" /> : null}
    </g>
  );
}

export function Column({ h = 520 }: { h?: number }) {
  return (
    <g>
      <rect x={-42} y={-h} width={84} height={h} fill="url(#st-marble)" stroke={INK} strokeWidth={4} />
      {[-20, 0, 20].map((x) => <line key={x} x1={x} y1={-h + 30} x2={x} y2={-24} stroke="#d4c6ae" strokeWidth={4} />)}
      <path d={`M-60 ${-h - 28} L60 ${-h - 28} L52 ${-h + 4} L-52 ${-h + 4} Z`} fill="#efe4cf" stroke={INK} strokeWidth={4} strokeLinejoin="round" />
      <rect x={-56} y={-26} width={112} height={26} fill="#efe4cf" stroke={INK} strokeWidth={4} />
    </g>
  );
}

export function Torch() {
  return (
    <g>
      <circle cx={0} cy={-70} r={160} fill="url(#st-fireglow)" className="story-pulse" />
      <path d="M-14 -40 L14 -40 L8 20 L-8 20 Z" fill="url(#st-wood-dark)" stroke={INK} strokeWidth={3} />
      <path d="M-18 -40 Q-24 -80 0 -108 Q24 -80 18 -40 Z" fill="#ff7a2f" className="story-flicker" />
      <path d="M-9 -40 Q-12 -64 0 -82 Q12 -64 9 -40 Z" fill="#ffe08a" className="story-flicker" style={{ animationDelay: '.2s' }} />
    </g>
  );
}

export function Dolphin() {
  return (
    <g>
      <path d="M-60 10 Q-20 -50 50 -30 Q70 -24 80 -10 L60 -6 Q40 -20 10 -10 Q-20 0 -40 30 Z" fill="#5f8fb5" stroke={INK} strokeWidth={4} strokeLinejoin="round" />
      <path d="M-4 -30 L10 -56 L20 -26 Z" fill="#5f8fb5" stroke={INK} strokeWidth={3.5} strokeLinejoin="round" />
      <path d="M-56 12 L-80 0 L-70 26 Z" fill="#5f8fb5" stroke={INK} strokeWidth={3.5} strokeLinejoin="round" />
      <path d="M-30 6 Q10 -14 56 -14" stroke="#cfe3f2" strokeWidth={8} fill="none" strokeLinecap="round" />
      <circle cx={52} cy={-22} r={3.5} fill={INK} />
    </g>
  );
}
