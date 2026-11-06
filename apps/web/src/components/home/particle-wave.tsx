"use client";

import { useEffect, useRef } from "react";

type Tone = "light" | "dark";

/**
 * Interactive dotted terrain (Canvas 2D, no WebGL).
 * - Perspective grid of points displaced by layered sine waves.
 * - Pointer: dots under the cursor swell into a lit hill and the field leans toward it.
 * - Click / tap: a ripple ring travels out through the terrain.
 * DPR capped at 1.5, pauses off-screen, one static frame under prefers-reduced-motion.
 * `interactRef` = element whose pointer events drive the wave (canvas itself is pointer-events-none).
 */
export function ParticleWave({
  className = "",
  density = 1,
  tone = "light",
  interactRef,
}: {
  className?: string;
  density?: number;
  tone?: Tone;
  interactRef?: React.RefObject<HTMLElement | null>;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let visible = true;
    let w = 0;
    let h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);

    // ---- pointer state (canvas-local px) ----
    const ptr = { x: -9999, y: -9999, tx: -9999, ty: -9999, on: 0, ton: 0 };
    let ripples: { x: number; y: number; t: number }[] = [];
    const t0 = performance.now();
    const now = () => (performance.now() - t0) / 1000;
    const local = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const onMove = (e: PointerEvent) => {
      const p = local(e);
      ptr.tx = p.x;
      ptr.ty = p.y;
      ptr.ton = 1;
      if (ptr.x < -999) {
        ptr.x = p.x;
        ptr.y = p.y;
      }
    };
    const onLeave = () => {
      ptr.ton = 0;
    };
    const onDown = (e: PointerEvent) => {
      const p = local(e);
      if (p.y < -h * 0.2 || p.y > h) return;
      ripples.push({ x: p.x, y: Math.max(p.y, h * 0.3), t: now() });
      if (ripples.length > 6) ripples.shift();
    };
    const host = interactRef?.current ?? cv.parentElement;
    if (host && !reduce) {
      host.addEventListener("pointermove", onMove, { passive: true });
      host.addEventListener("pointerleave", onLeave);
      host.addEventListener("pointerdown", onDown, { passive: true });
    }

    const COLS = Math.round(200 * density);
    const ROWS = Math.round(50 * density);

    // light: periwinkle troughs → cobalt crests → ink-blue peaks
    // dark:  deep cobalt troughs → bright cobalt → near-white crests
    const ramp: [number, number, number][] =
      tone === "light"
        ? [
            [168, 180, 255],
            [31, 59, 255],
            [14, 26, 150],
          ]
        : [
            [26, 44, 170],
            [74, 104, 255],
            [228, 233, 255],
          ];
    const col = (k: number) => {
      const [a, b, c] = ramp;
      if (k < 0.6) {
        const q = k / 0.6;
        return [a[0] + (b[0] - a[0]) * q, a[1] + (b[1] - a[1]) * q, a[2] + (b[2] - a[2]) * q];
      }
      const q = (k - 0.6) / 0.4;
      return [b[0] + (c[0] - b[0]) * q, b[1] + (c[1] - b[1]) * q, b[2] + (c[2] - b[2]) * q];
    };
    const alphaBase = tone === "light" ? 0.1 : 0.06;

    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      ptr.x += (ptr.tx - ptr.x) * 0.12;
      ptr.y += (ptr.ty - ptr.y) * 0.12;
      ptr.on += (ptr.ton - ptr.on) * 0.06;
      const lean = ptr.on * (ptr.x / Math.max(w, 1) - 0.5);
      const sigma = Math.max(110, w * 0.09);
      const inv2s = 1 / (2 * sigma * sigma);
      ripples = ripples.filter((r) => t - r.t < 3.2);
      const reach = Math.max(w, 600) * 0.42;

      for (let j = 0; j < ROWS; j++) {
        const p = j / (ROWS - 1); // 0 far → 1 near
        const near = 0.25 + 0.75 * p;
        const baseY = h * (0.36 + 0.68 * Math.pow(p, 1.25));
        const amp = h * 0.32 * near;
        const spread = 0.9 + 0.5 * p;
        for (let i = 0; i < COLS; i++) {
          const u = i / (COLS - 1);
          const x = (u - 0.5) * 6 + lean * 0.8 * (1 - p);
          const z = p * 4;
          let y =
            Math.sin(x * 1.9 + t * 0.38 + z * 1.5) * 0.5 +
            Math.sin(x * 3.6 - t * 0.55 + z * 0.8) * 0.18 +
            Math.cos(x * 0.8 + z * 2.4 - t * 0.22) * 0.32;
          const sx = w / 2 + (u - 0.5) * w * spread;
          if (sx < -4 || sx > w + 4) continue;
          let sy = baseY - y * amp;

          let glow = 0;
          if (ptr.on > 0.01) {
            const dx = sx - ptr.x;
            const dy = (sy - ptr.y) * 1.6;
            const g = Math.exp(-(dx * dx + dy * dy) * inv2s) * ptr.on;
            sy -= g * h * 0.16 * near;
            y += g * 1.1;
            glow += g;
          }
          for (const r of ripples) {
            const age = t - r.t;
            const dx = sx - r.x;
            const dy = (sy - r.y) * 1.6;
            const d = Math.sqrt(dx * dx + dy * dy) - age * reach;
            const ring = Math.exp(-(d * d) / 2400) * Math.exp(-age * 1.1);
            sy -= ring * 28 * near;
            y += ring * 0.9;
            glow += ring;
          }

          const crest = Math.max(0, Math.min(1, (y + 0.7) / 1.5));
          const a = Math.min(1, (alphaBase + 1.3 * Math.pow(crest, 2.6)) * (0.35 + 0.65 * p) + glow * 0.35);
          const [r, g, b] = col(Math.min(1, crest * 0.9 + glow * 0.4));
          const s = (0.9 + 1.9 * p) * (0.75 + 0.6 * crest + glow * 0.5);
          ctx.fillStyle = `rgba(${r | 0},${g | 0},${b | 0},${a.toFixed(3)})`;
          ctx.fillRect(sx, sy, s, s);
        }
      }
    };

    const loop = () => {
      cancelAnimationFrame(raf);
      const step = () => {
        if (!visible) return;
        draw(now());
        raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };

    const resize = () => {
      const r = cv.getBoundingClientRect();
      w = r.width;
      h = r.height;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (reduce) draw(2);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(cv);
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible && !reduce) loop();
    });
    io.observe(cv);
    if (!reduce) loop();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      if (host) {
        host.removeEventListener("pointermove", onMove);
        host.removeEventListener("pointerleave", onLeave);
        host.removeEventListener("pointerdown", onDown);
      }
    };
  }, [density, tone, interactRef]);

  return <canvas ref={ref} aria-hidden="true" className={`pointer-events-none block h-full w-full ${className}`} />;
}

/** Wrapper whose whole area drives the wave (hero / footer). */
export function WaveStage({
  children,
  className = "",
  waveClassName = "",
  tone = "light",
  density = 1,
}: {
  children: React.ReactNode;
  className?: string;
  waveClassName?: string;
  tone?: Tone;
  density?: number;
}) {
  const host = useRef<HTMLDivElement>(null);
  return (
    <div ref={host} className={className}>
      <div className={waveClassName}>
        <ParticleWave tone={tone} density={density} interactRef={host} />
      </div>
      {children}
    </div>
  );
}
