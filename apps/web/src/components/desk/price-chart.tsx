"use client";

import { useMemo, useRef, useState } from "react";
import { chartUi } from "@/content/copy";
import { type PricePoint, usePriceHistory } from "@/lib/price-history";

const W = 800;
const H = 260;
const PAD = { l: 8, r: 64, t: 16, b: 26 };

const fmt = (p: number) => p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (t: number) => new Date(t * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const stamp = (t: number) => new Date(t * 1000).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

/** Line chart of Chainlink mainnet rounds. Hover shows the round's price + time. */
export function PriceChart({ symbol, feed }: { symbol: string; feed: `0x${string}` }) {
  const q = usePriceHistory(feed);
  const pts = q.data;

  if (q.isLoading) return <Empty title={chartUi.loading} />;
  if (q.isError || !pts || pts.length < 2) return <Empty title={chartUi.unavailable} />;
  return <Plot symbol={symbol} pts={pts} />;
}

function Empty({ title }: { title: string }) {
  return (
    <div className="relative grid h-full min-h-[260px] place-items-center px-6 text-center">
      <p className="font-plex text-[11px] uppercase tracking-[0.14em] text-smoke">{title}</p>
    </div>
  );
}

function Plot({ symbol, pts }: { symbol: string; pts: PricePoint[] }) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const g = useMemo(() => {
    const t0 = pts[0].t, t1 = pts[pts.length - 1].t;
    let lo = Math.min(...pts.map((x) => x.p)), hi = Math.max(...pts.map((x) => x.p));
    const pad = (hi - lo || hi * 0.01) * 0.08;
    lo -= pad; hi += pad;
    const x = (t: number) => PAD.l + ((t - t0) / (t1 - t0 || 1)) * (W - PAD.l - PAD.r);
    const y = (p: number) => PAD.t + (1 - (p - lo) / (hi - lo)) * (H - PAD.t - PAD.b);
    const line = pts.map((d, i) => `${i ? "L" : "M"}${x(d.t).toFixed(1)},${y(d.p).toFixed(1)}`).join("");
    const area = `${line}L${x(t1).toFixed(1)},${H - PAD.b}L${x(t0).toFixed(1)},${H - PAD.b}Z`;
    const ticksY = Array.from({ length: 4 }, (_, i) => lo + ((hi - lo) * (i + 0.5)) / 4);
    const days = Math.max(1, Math.round((t1 - t0) / 86_400));
    const ticksX = Array.from({ length: Math.min(days, 6) + 1 }, (_, i) => t0 + ((t1 - t0) * i) / Math.min(days, 6));
    return { x, y, line, area, ticksY, ticksX, up: pts[pts.length - 1].p >= pts[0].p, t0, t1 };
  }, [pts]);

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = ref.current!.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let best = 0, bd = Infinity;
    pts.forEach((d, i) => { const dd = Math.abs(g.x(d.t) - px); if (dd < bd) { bd = dd; best = i; } });
    setHover(best);
  };

  const h = hover != null ? pts[hover] : null;
  const last = pts[pts.length - 1];
  const stroke = g.up ? "#f0c48e" : "#9b978f";

  return (
    <div className="relative flex h-full min-h-[260px] w-full flex-col">
      <div className="flex items-baseline justify-between gap-4 px-5 pt-3">
        <p className="font-plex text-[11px] uppercase tracking-[0.12em] text-smoke">{chartUi.title(symbol)}</p>
        <p className="font-plex text-[11.5px] text-haze">
          {h ? <>{stamp(h.t)} · <span className="text-ivory">${fmt(h.p)}</span></> : <>{chartUi.lastRound} · <span className="text-ivory">${fmt(last.p)}</span></>}
        </p>
      </div>
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-full min-h-[220px] w-full flex-1 touch-none"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label={chartUi.aria(symbol, pts.length)}
      >
        <defs>
          <linearGradient id="pc-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.18" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        {g.ticksY.map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={g.y(v)} y2={g.y(v)} stroke="rgba(255,255,255,0.05)" />
            <text x={W - PAD.r + 8} y={g.y(v) + 4} fill="#6e6b65" fontSize="11" fontFamily="var(--font-plex), monospace">{fmt(v)}</text>
          </g>
        ))}
        {g.ticksX.map((t) => (
          <text key={t} x={g.x(t)} y={H - 8} fill="#6e6b65" fontSize="11" textAnchor="middle" fontFamily="var(--font-plex), monospace">{day(t)}</text>
        ))}
        <path d={g.area} fill="url(#pc-fill)" />
        <path d={g.line} fill="none" stroke={stroke} strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        {h && (
          <g>
            <line x1={g.x(h.t)} x2={g.x(h.t)} y1={PAD.t} y2={H - PAD.b} stroke="rgba(244,241,234,0.25)" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
            <circle cx={g.x(h.t)} cy={g.y(h.p)} r="3.5" fill={stroke} />
          </g>
        )}
      </svg>
      <p className="px-5 pb-2 font-inter text-[11px] text-smoke">{chartUi.source(pts.length)}</p>
    </div>
  );
}
