'use client';

import { useEffect, useRef } from 'react';

import type { ParticleKind } from './scenes/odysseyScenes';

type Particle = { x: number; y: number; vx: number; vy: number; size: number; life: number; phase: number; hue: number; spin: number };

type Recipe = {
  count: number;
  spawn: (w: number, h: number, initial: boolean) => Particle;
  draw: (ctx: CanvasRenderingContext2D, p: Particle, t: number) => void;
  additive?: boolean;
};

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const CONFETTI = ['#ef5b6e', '#f4c542', '#4fb3a9', '#6f8ff0', '#f29b4b', '#b58cf0'];

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r * 0.25, y - r * 0.25);
  ctx.lineTo(x + r, y);
  ctx.lineTo(x + r * 0.25, y + r * 0.25);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r * 0.25, y + r * 0.25);
  ctx.lineTo(x - r, y);
  ctx.lineTo(x - r * 0.25, y - r * 0.25);
  ctx.closePath();
  ctx.fill();
}

function glowDot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha: number) {
  ctx.globalAlpha = alpha * 0.25;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r * 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

const base = (w: number, h: number, initial: boolean, fromBottom = false): Particle => ({
  x: rand(0, w),
  y: initial ? rand(0, h) : fromBottom ? h + 10 : -10,
  vx: 0, vy: 0, size: 2, life: 1, phase: rand(0, Math.PI * 2), hue: 0, spin: rand(-0.1, 0.1),
});

const RECIPES: Record<ParticleKind, Recipe> = {
  dust: {
    count: 46,
    spawn: (w, h, initial) => ({ ...base(w, h, initial, true), vx: rand(-6, 6), vy: rand(-14, -5), size: rand(1.2, 3.2) }),
    draw: (ctx, p, t) => glowDot(ctx, p.x + Math.sin(t * 0.6 + p.phase) * 10, p.y, p.size, '#fff1c9', 0.35 + 0.35 * Math.sin(t * 1.4 + p.phase) ** 2),
    additive: true,
  },
  spray: {
    count: 40,
    spawn: (w, h, initial) => ({ ...base(w, h, initial, true), y: initial ? rand(h * 0.55, h) : h + 6, vx: rand(-10, 10), vy: rand(-26, -10), size: rand(1, 2.6) }),
    draw: (ctx, p, t) => glowDot(ctx, p.x, p.y, p.size, '#e8f8ff', 0.25 + 0.5 * Math.sin(t * 2 + p.phase) ** 2),
    additive: true,
  },
  embers: {
    count: 48,
    spawn: (w, h, initial) => ({ ...base(w, h, initial, true), vx: rand(-12, 12), vy: rand(-60, -24), size: rand(1.5, 3.4) }),
    draw: (ctx, p, t) => glowDot(ctx, p.x + Math.sin(t * 2 + p.phase) * 8, p.y, p.size, p.phase > 3 ? '#ffb347' : '#ff7a2f', 0.5 + 0.45 * Math.sin(t * 5 + p.phase) ** 2),
    additive: true,
  },
  rain: {
    count: 150,
    spawn: (w, h, initial) => ({ ...base(w, h, initial), x: rand(-w * 0.2, w), vx: 220, vy: rand(900, 1300), size: rand(12, 26) }),
    draw: (ctx, p) => {
      ctx.globalAlpha = 0.45;
      ctx.strokeStyle = '#d8e6ff';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.size * 0.18, p.y - p.size);
      ctx.stroke();
    },
  },
  magic: {
    count: 42,
    spawn: (w, h, initial) => ({ ...base(w, h, initial, true), vx: rand(-10, 10), vy: rand(-22, -8), size: rand(3, 7), hue: Math.floor(rand(0, 3)) }),
    draw: (ctx, p, t) => {
      ctx.globalAlpha = 0.3 + 0.6 * Math.sin(t * 2.4 + p.phase) ** 2;
      ctx.fillStyle = ['#e6c8ff', '#ffd6f0', '#fff1a8'][p.hue];
      star(ctx, p.x + Math.sin(t + p.phase) * 12, p.y, p.size);
    },
    additive: true,
  },
  fireflies: {
    count: 26,
    spawn: (w, h, initial) => ({ ...base(w, h, true), y: initial ? rand(h * 0.3, h) : rand(h * 0.3, h), size: rand(2, 3.6) }),
    draw: (ctx, p, t) => glowDot(ctx, p.x + Math.sin(t * 0.7 + p.phase) * 40, p.y + Math.cos(t * 0.5 + p.phase) * 26, p.size, '#fff59a', 0.2 + 0.8 * Math.sin(t * 1.8 + p.phase) ** 4),
    additive: true,
  },
  confetti: {
    count: 90,
    spawn: (w, h, initial) => ({ ...base(w, h, initial), vx: rand(-30, 30), vy: rand(80, 170), size: rand(6, 11), hue: Math.floor(rand(0, CONFETTI.length)), spin: rand(-4, 4) }),
    draw: (ctx, p, t) => {
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = CONFETTI[p.hue];
      ctx.save();
      ctx.translate(p.x + Math.sin(t * 2 + p.phase) * 14, p.y);
      ctx.rotate(t * p.spin + p.phase);
      ctx.scale(1, Math.abs(Math.sin(t * 3 + p.phase)) + 0.15);
      ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66);
      ctx.restore();
    },
  },
};

function canAnimate() {
  if (typeof window === 'undefined' || /jsdom/i.test(window.navigator.userAgent)) return false;
  return !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** Ambient particles drawn over the scene. Decorative only; skipped for reduced motion. */
export function StageParticles({ kind }: { kind?: ParticleKind }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!kind || !canvas || !canAnimate()) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const recipe = RECIPES[kind];
    let width = 0;
    let height = 0;
    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.max(1, Math.round(height * ratio));
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    resize();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
    observer?.observe(canvas);
    const particles = Array.from({ length: recipe.count }, () => recipe.spawn(width, height, true));
    let frame = 0;
    let last = performance.now();
    const start = last;

    const tick = (now: number) => {
      frame = window.requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (document.hidden) return;
      const t = (now - start) / 1000;
      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = recipe.additive ? 'lighter' : 'source-over';
      for (let i = 0; i < particles.length; i += 1) {
        const p = particles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.y < -30 || p.y > height + 40 || p.x < -60 || p.x > width + 60) particles[i] = recipe.spawn(width, height, false);
        else recipe.draw(ctx, p, t);
      }
      ctx.globalAlpha = 1;
    };
    frame = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [kind]);

  return <canvas ref={canvasRef} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" />;
}
