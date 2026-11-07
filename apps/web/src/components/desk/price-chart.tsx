"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CandlestickSeries, ColorType, CrosshairMode, createChart,
  type CandlestickData, type UTCTimestamp,
} from "lightweight-charts";
import { chartUi } from "@/content/copy";
import { type PriceHistory, type PricePoint, spanLabel, usePriceHistory } from "@/lib/price-history";

/**
 * Candlestick chart (TradingView Lightweight Charts, Apache-2.0) built from Chainlink mainnet rounds.
 * Each candle = the oracle rounds inside one time bucket: open = previous close, close = last round,
 * high/low = extremes. Buckets with no round are skipped (no synthetic candles). Oracle candles, not trades.
 */
const TF = [
  { k: "15m", s: 900 },
  { k: "1H", s: 3600 },
  { k: "4H", s: 14_400 },
] as const;
type Tf = (typeof TF)[number]["k"];
type Candle = CandlestickData<UTCTimestamp>;

function toCandles(pts: PricePoint[], bucket: number): Candle[] {
  const out: Candle[] = [];
  let cur: Candle | null = null;
  for (const { t, p } of pts) {
    const b = (Math.floor(t / bucket) * bucket) as UTCTimestamp;
    if (!cur || cur.time !== b) {
      const o: number = cur ? cur.close : p;
      if (cur) out.push(cur);
      cur = { time: b, open: o, high: Math.max(o, p), low: Math.min(o, p), close: p };
    } else {
      cur.high = Math.max(cur.high, p);
      cur.low = Math.min(cur.low, p);
      cur.close = p;
    }
  }
  if (cur) out.push(cur);
  return out;
}

const fmt = (p: number) => p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function PriceChart({ symbol, feed }: { symbol: string; feed: `0x${string}` }) {
  const q = usePriceHistory(feed);
  if (q.isLoading) return <Empty title={chartUi.loading} />;
  if (q.isError || !q.data || q.data.pts.length < 2) return <Empty title={chartUi.unavailable} />;
  return <Candles symbol={symbol} hist={q.data} />;
}

function Empty({ title }: { title: string }) {
  return (
    <div className="relative grid h-full min-h-[300px] place-items-center px-6 text-center">
      <p className="font-plex text-[11px] uppercase tracking-[0.14em] text-smoke">{title}</p>
    </div>
  );
}

function Candles({ symbol, hist }: { symbol: string; hist: PriceHistory }) {
  const box = useRef<HTMLDivElement>(null);
  const [tf, setTf] = useState<Tf>("1H");
  const candles = useMemo(() => toCandles(hist.pts, TF.find((x) => x.k === tf)!.s), [hist.pts, tf]);
  const [hover, setHover] = useState<Candle | null>(null);

  useEffect(() => {
    const chart = createChart(box.current!, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#6e6b65",
        fontFamily: "ui-monospace, 'IBM Plex Mono', monospace",
        fontSize: 11,
        attributionLogo: true, // TradingView attribution (library license notice)
      },
      grid: { vertLines: { color: "rgba(255,255,255,0.03)" }, horzLines: { color: "rgba(255,255,255,0.05)" } },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.08)" },
      timeScale: { borderColor: "rgba(255,255,255,0.08)", timeVisible: true, secondsVisible: false },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "rgba(244,241,234,0.25)", labelBackgroundColor: "#0c0c0d" },
        horzLine: { color: "rgba(244,241,234,0.25)", labelBackgroundColor: "#0c0c0d" },
      },
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#f0c48e", borderUpColor: "#f0c48e", wickUpColor: "#f0c48e",
      downColor: "#3a3835", borderDownColor: "#9b978f", wickDownColor: "#9b978f",
    });
    series.setData(candles);
    chart.timeScale().fitContent();
    chart.subscribeCrosshairMove((p) => {
      const d = p.seriesData.get(series) as Candle | undefined;
      setHover(d && "open" in d ? d : null);
    });
    return () => chart.remove();
  }, [candles]);

  const c = hover ?? candles[candles.length - 1];

  return (
    <div className="relative flex h-full min-h-[300px] w-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-3">
        <p className="font-plex text-[11px] uppercase tracking-[0.12em] text-smoke">{chartUi.title(symbol, spanLabel(hist))}</p>
        <div className="flex items-center gap-1" role="tablist" aria-label={chartUi.tfLabel}>
          {TF.map((x) => (
            <button
              key={x.k}
              type="button"
              role="tab"
              aria-selected={tf === x.k}
              onClick={() => setTf(x.k)}
              className={`rounded px-2 py-0.5 font-plex text-[11px] transition-colors ${tf === x.k ? "bg-white/[0.08] text-ivory" : "text-smoke hover:text-haze"}`}
            >
              {x.k}
            </button>
          ))}
        </div>
      </div>
      <p className="px-5 pt-1 font-plex text-[11px] text-haze">
        O <span className="text-ivory">{fmt(c.open)}</span> H <span className="text-ivory">{fmt(c.high)}</span> L{" "}
        <span className="text-ivory">{fmt(c.low)}</span> C{" "}
        <span className={c.close >= c.open ? "text-dawn" : "text-haze"}>{fmt(c.close)}</span>
      </p>
      <div ref={box} className="min-h-[240px] w-full flex-1" role="img" aria-label={chartUi.aria(symbol, hist.pts.length)} />
      <p className="px-5 pb-2 pt-1 font-inter text-[11px] text-smoke">{chartUi.source(hist.pts.length)}</p>
    </div>
  );
}
