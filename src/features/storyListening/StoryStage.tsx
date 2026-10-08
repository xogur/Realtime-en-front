'use client';

import { useCallback, useEffect, useRef, useState, type ComponentType, type CSSProperties, type PointerEvent, type ReactNode } from 'react';

import { StageParticles } from './StageParticles';
import { SceneContext, SceneDefs } from './scenes/parts';
import type { Atmosphere, SceneProps } from './scenes/odysseyScenes';
import type { StorySentence } from './types';

export type StagePoint = { x: number; y: number };

type StoryStageProps = {
  Scene: ComponentType<SceneProps>;
  beat: number;
  label: string;
  bubble?: StorySentence['bubble'];
  highlight?: string | null;
  atmosphere?: Atmosphere;
  /** Twinkles on tappable objects. */
  hint?: boolean;
  /** Plays the cartoon iris-in when the stage appears. */
  intro?: boolean;
  onHotspot?: (id: string, point: StagePoint) => void;
  onPress?: (id: string, phase: 'down' | 'up', point: StagePoint) => void;
  /** Pointer movement while pressed (stage pixels), for rubbing moments. Also stops touch scrolling on the stage. */
  onDrag?: (point: StagePoint) => void;
  /** Learner progress (0-1) on the current moment, handed to the scene. */
  effort?: number;
  /** Text that pops up where an object was tapped. */
  tapLabel?: (id: string) => string | null;
  children?: ReactNode;
};

type Burst = { key: number; x: number; y: number };
const BURST_RAYS = Array.from({ length: 10 }, (_, i) => {
  const angle = (i / 10) * Math.PI * 2;
  return { dx: Math.cos(angle) * (60 + (i % 3) * 18), dy: Math.sin(angle) * (60 + (i % 3) * 18), color: ['#ffe27a', '#ffffff', '#ffb3c7'][i % 3] };
});

/** Cartoon stage: scene, depth parallax, particles, colour grade, tap effects. */
export function StoryStage({
  Scene, beat, label, bubble, highlight = null, atmosphere, hint = false, intro = false,
  onHotspot, onPress, onDrag, effort, tapLabel, children,
}: StoryStageProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const pointRef = useRef<StagePoint>({ x: 0, y: 0 });
  const pressedRef = useRef(false);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [tag, setTag] = useState<{ key: number; x: number; y: number; text: string } | null>(null);
  const timersRef = useRef<number[]>([]);

  useEffect(() => () => timersRef.current.forEach((timer) => window.clearTimeout(timer)), []);

  const later = useCallback((fn: () => void, ms: number) => {
    timersRef.current.push(window.setTimeout(fn, ms));
  }, []);

  const onPointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const root = rootRef.current;
    if (!root) return;
    const rect = root.getBoundingClientRect();
    const nx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    root.style.setProperty('--px', nx.toFixed(3));
    root.style.setProperty('--py', ny.toFixed(3));
    if (pressedRef.current) onDrag?.({ x: event.clientX - rect.left, y: event.clientY - rect.top });
  }, [onDrag]);

  const release = useCallback(() => { pressedRef.current = false; }, []);

  const onPointerDownCapture = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    pointRef.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    pressedRef.current = true;
    onPointerMove(event);
  }, [onPointerMove]);

  const handleHotspot = useCallback((id: string) => {
    const point = pointRef.current.x || pointRef.current.y
      ? pointRef.current
      : { x: (rootRef.current?.clientWidth ?? 0) / 2, y: (rootRef.current?.clientHeight ?? 0) / 2 };
    const key = Date.now() + Math.random();
    setBursts((current) => [...current.slice(-3), { key, ...point }]);
    later(() => setBursts((current) => current.filter((item) => item.key !== key)), 900);
    const text = tapLabel?.(id);
    if (text) {
      setTag({ key, ...point, text });
      later(() => setTag((current) => (current?.key === key ? null : current)), 2200);
    }
    onHotspot?.(id, point);
  }, [later, onHotspot, tapLabel]);

  const handlePress = useCallback((id: string, phase: 'down' | 'up') => {
    onPress?.(id, phase, pointRef.current);
  }, [onPress]);

  const interactive = Boolean(onHotspot || tapLabel);

  return (
    <div
      ref={rootRef}
      className={`story-stage relative h-full min-h-0 w-full overflow-hidden bg-[#1d2c3c] ${intro ? 'story-iris' : ''} ${onDrag ? 'touch-none' : ''}`}
      onPointerMove={onPointerMove}
      onPointerDownCapture={onPointerDownCapture}
      onPointerUp={release}
      onPointerCancel={release}
      onPointerLeave={release}
    >
      <svg
        viewBox="0 0 1600 900"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 h-full w-full select-none"
        role="group"
        aria-label={label}
      >
        <SceneDefs />
        <SceneContext.Provider value={{
          highlight,
          onHotspot: interactive ? handleHotspot : undefined,
          onPress: onPress ? handlePress : undefined,
          hint,
        }}>
          <Scene beat={beat} bubble={bubble} effort={effort} />
        </SceneContext.Provider>
      </svg>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundColor: atmosphere?.grade ?? 'transparent',
          mixBlendMode: atmosphere?.blend ?? 'normal',
          transition: 'background-color 1.6s ease',
        } as CSSProperties}
      />
      <StageParticles kind={atmosphere?.particles} />
      {atmosphere?.flash ? <div aria-hidden className="story-lightning pointer-events-none absolute inset-0 bg-white" /> : null}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(25,12,4,0.42)_100%)]" />
      {bursts.map((burst) => (
        <span key={burst.key} aria-hidden className="pointer-events-none absolute z-20" style={{ left: burst.x, top: burst.y }}>
          <span className="story-burst-ring absolute -left-10 -top-10 h-20 w-20 rounded-full border-4 border-[#ffe27a]" />
          {BURST_RAYS.map((ray, i) => (
            <span
              key={i}
              className="story-burst absolute -left-1.5 -top-1.5 h-3 w-3 rounded-full"
              style={{ backgroundColor: ray.color, '--dx': `${ray.dx}px`, '--dy': `${ray.dy}px` } as CSSProperties}
            />
          ))}
        </span>
      ))}
      {tag ? (
        <span
          key={tag.key}
          role="status"
          className="story-tag pointer-events-none absolute z-30 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-full border-[3px] border-[#2a1b12] bg-white px-5 py-2 text-xl font-black text-[#2a1b12] shadow-[0_6px_0_#2a1b12]"
          style={{ left: tag.x, top: tag.y - 18 }}
        >
          {tag.text}
        </span>
      ) : null}
      {children}
    </div>
  );
}
