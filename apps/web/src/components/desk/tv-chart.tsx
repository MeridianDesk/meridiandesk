"use client";

import { useEffect, useRef } from "react";
import { chartUi } from "@/content/copy";

/**
 * TradingView Advanced Chart widget (free embed) — UNDERLYING reference for markets with no oracle.
 * Loads tradingview.com script only when this component mounts. Attribution link is kept (widget terms).
 */
export function TvChart({ symbol, tv }: { symbol: string; tv: string }) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = box.current!;
    el.innerHTML = '<div class="tradingview-widget-container__widget" style="height:100%;width:100%"></div>';
    const s = document.createElement("script");
    s.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    s.async = true;
    s.type = "text/javascript";
    s.innerHTML = JSON.stringify({
      symbol: tv,
      interval: "60",
      timezone: "Etc/UTC",
      theme: "dark",
      style: "1",
      locale: "en",
      backgroundColor: "rgba(12,12,13,1)",
      gridColor: "rgba(255,255,255,0.04)",
      hide_side_toolbar: true,
      hide_volume: false,
      allow_symbol_change: false,
      save_image: false,
      calendar: false,
      autosize: true,
      support_host: "https://www.tradingview.com",
    });
    el.appendChild(s);
    return () => { el.innerHTML = ""; };
  }, [tv]);

  return (
    <div className="flex h-full min-h-[340px] w-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-3">
        <p className="font-plex text-[11px] uppercase tracking-[0.12em] text-smoke">{chartUi.tvTitle(tv)}</p>
        <span className="rounded-[3px] border border-white/15 px-2 py-0.5 font-plex text-[10.5px] uppercase tracking-[0.1em] text-haze">{chartUi.tvBadge}</span>
      </div>
      <div ref={box} className="tradingview-widget-container mt-2 min-h-[280px] w-full flex-1" aria-label={chartUi.tvAria(symbol, tv)} />
      <p className="px-5 pb-2 pt-2 font-inter text-[11px] leading-relaxed text-smoke">
        {chartUi.tvNote}{" "}
        <a href={`https://www.tradingview.com/symbols/${tv.replace(":", "-")}/`} target="_blank" rel="noopener noreferrer nofollow" className="underline decoration-white/20 underline-offset-2 hover:text-haze">
          {chartUi.tvCredit}
        </a>
      </p>
    </div>
  );
}
