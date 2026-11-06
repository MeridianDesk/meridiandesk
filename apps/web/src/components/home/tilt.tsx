"use client";

import { useEffect, useRef } from "react";

const prefersStill = () =>
  typeof window === "undefined" ||
  window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
  window.matchMedia("(pointer: coarse)").matches;

/**
 * Pointer-driven 3D tilt. The card follows the cursor directly (direct manipulation,
 * eased in rAF — no CSS hover transition). Children can pop forward with `.z-pop-*`
 * classes (translateZ) because the card keeps `transform-style: preserve-3d`.
 * Writes --rx/--ry/--gx/--gy custom properties; off for touch and reduced-motion.
 */
export function Tilt3D({
  children,
  className = "",
  max = 8,
  glare = true,
}: {
  children: React.ReactNode;
  className?: string;
  max?: number;
  glare?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || prefersStill()) return;
    let raf = 0;
    const cur = { rx: 0, ry: 0, gx: 50, gy: 50, o: 0 };
    const tgt = { rx: 0, ry: 0, gx: 50, gy: 50, o: 0 };
    const tick = () => {
      let moving = false;
      for (const k of ["rx", "ry", "gx", "gy", "o"] as const) {
        cur[k] += (tgt[k] - cur[k]) * 0.14;
        if (Math.abs(tgt[k] - cur[k]) > 0.01) moving = true;
      }
      el.style.setProperty("--rx", `${cur.rx.toFixed(2)}deg`);
      el.style.setProperty("--ry", `${cur.ry.toFixed(2)}deg`);
      el.style.setProperty("--gx", `${cur.gx.toFixed(1)}%`);
      el.style.setProperty("--gy", `${cur.gy.toFixed(1)}%`);
      el.style.setProperty("--go", cur.o.toFixed(3));
      raf = moving ? requestAnimationFrame(tick) : 0;
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const u = (e.clientX - r.left) / r.width;
      const v = (e.clientY - r.top) / r.height;
      tgt.ry = (u - 0.5) * 2 * max;
      tgt.rx = -(v - 0.5) * 2 * max;
      tgt.gx = u * 100;
      tgt.gy = v * 100;
      tgt.o = 1;
      kick();
    };
    const leave = () => {
      tgt.rx = 0;
      tgt.ry = 0;
      tgt.o = 0;
      kick();
    };
    el.addEventListener("pointermove", move, { passive: true });
    el.addEventListener("pointerleave", leave);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
    };
  }, [max]);

  return (
    <div className="tilt-scene h-full">
      <div ref={ref} className={`tilt-card relative h-full ${className}`}>
        {children}
        {glare ? <span aria-hidden="true" className="tilt-glare" /> : null}
      </div>
    </div>
  );
}

/**
 * Scroll-in 3D reveal: element swings up from a tipped-back plane.
 * Content is fully visible without JS / under reduced-motion (class added only when animating).
 */
export function Reveal3D({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const r = el.getBoundingClientRect();
    if (r.top < window.innerHeight * 0.92) return; // already in view: no flash
    el.classList.add("reveal-3d");
    el.style.setProperty("--reveal-delay", `${delay}ms`);
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          el.classList.add("is-in");
          io.disconnect();
        }
      },
      { threshold: 0.18 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [delay]);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
