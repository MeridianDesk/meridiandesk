"use client";

import { chartUi } from "@/content/copy";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { appUi, testnetDesk } from "@/content/copy";
import { ACTIVE_CHAIN_ID, addressUrl } from "@/content/chain";
import { deployed, listed, type ListedMarket } from "@/content/deployments";
import { bySymbol, CHAIN_EXPLORER, registry, type Market } from "@/content/registry";
import { Glyph, Row, short, StatusBadge } from "./bits";
import { Catalog, type Desk } from "./catalog";
import { OptionsTicket, PerpsTicket, TicketHeader } from "./tickets";
import { LiveOptionsHistory, LiveOptionsPositions, LiveOptionsTicket } from "./live-options";
import { LiveHistory, LiveMark, LivePerpsTicket, LivePositions, useMarketStats } from "./live";
import { ago, fmtPx, fmtUsd, useOraclePrice } from "@/lib/onchain";
import { change24h, usePriceHistory } from "@/lib/price-history";
import { PriceChart } from "./price-chart";
import { TvChart } from "./tv-chart";
import { TV_SYMBOLS } from "@/content/tv-symbols";

/** Market header + chart placeholder. Every oracle-derived value is an em dash until feeds connect. */
function MarkStat({ lm }: { lm: ListedMarket }) {
  const { price } = useOraclePrice(lm.token);
  return <>{price ? fmtPx(price) : "—"}</>;
}

function ChangeStat({ feed }: { feed: `0x${string}` }) {
  const c = change24h(usePriceHistory(feed).data);
  if (c == null) return <>—</>;
  return <span className={c >= 0 ? "text-dawn-hi" : "text-haze"}>{`${c >= 0 ? "+" : ""}${(c * 100).toFixed(2)}%`}</span>;
}

/** Testnet mark (MirrorFeed) under the mainnet chart, with staleness. */
function TestnetMarkLine({ lm }: { lm: ListedMarket }) {
  const { price, updatedAt, error } = useOraclePrice(lm.token);
  return (
    <p className="px-5 pb-3 font-plex text-[11px] text-haze">
      {testnetDesk.badge} mark <span className="text-ivory">{price ? `$${fmtPx(price)}` : "—"}</span> · {error ? testnetDesk.stale : updatedAt ? testnetDesk.updated(ago(updatedAt)) : "—"}
    </p>
  );
}

function OiStat({ lm }: { lm: ListedMarket }) {
  const s = useMarketStats(lm.token);
  return <>{s ? fmtUsd(s.oi) : "—"}</>;
}

function MarketPanel({ m, desk, lm }: { m: Market; desk: Desk; lm: ListedMarket | null }) {
  return (
    <section aria-label={`${m.symbol} market`} className="flex shrink-0 flex-col">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-white/[0.07] px-5 py-4">
        <div className="flex items-center gap-3">
          <Glyph m={m} size={36} />
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-zal text-[20px] font-semibold tracking-[-0.02em] text-ivory">{m.symbol}</h2>
              <span className="font-plex text-[11px] text-smoke">{desk === "perps" ? "PERP" : "OPTIONS"}</span>
            </div>
            <p className="font-inter text-[12.5px] text-haze">{m.name}</p>
          </div>
        </div>
        <dl className="flex flex-wrap gap-x-6 gap-y-1 font-plex text-[12px]">
          {([["Oracle mark", lm ? <MarkStat key="mk" lm={lm} /> : "—"], ["24h", m.oracle ? <ChangeStat key="ch" feed={m.oracle} /> : "—"], [desk === "perps" ? "Funding" : "IV", "—"], ["Open interest", lm ? <OiStat key="oi" lm={lm} /> : "—"]] as const).map(([k, v]) => (
            <div key={k}>
              <dt className="text-[10.5px] uppercase tracking-[0.08em] text-smoke">{k}</dt>
              <dd className="text-ivory/70">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="ml-auto"><StatusBadge status={m[desk]} /></div>
      </div>

      <div className="relative flex h-[420px] shrink-0 items-center justify-center overflow-hidden border-b border-white/[0.07]">
        <svg className="absolute inset-0 h-full w-full" aria-hidden="true">
          <defs>
            <pattern id="grid" width="56" height="44" patternUnits="userSpaceOnUse">
              <path d="M56 0H0V44" fill="none" stroke="rgba(255,255,255,0.045)" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
        {m.oracle ? (
          <div className="relative flex h-full w-full flex-col">
            <PriceChart symbol={m.symbol} feed={m.oracle} />
            {lm ? <TestnetMarkLine lm={lm} /> : null}
          </div>
        ) : lm ? (
          <LiveMark lm={lm} />
        ) : TV_SYMBOLS[m.symbol] ? (
          <div className="relative h-full w-full">
            <TvChart symbol={m.symbol} tv={TV_SYMBOLS[m.symbol]} />
          </div>
        ) : (
          <div className="relative max-w-[360px] px-6 text-center">
            <p className="font-plex text-[11px] uppercase tracking-[0.14em] text-smoke">{chartUi.noFeedTitle}</p>
            <p className="mt-2 font-inter text-[13px] leading-relaxed text-haze">{chartUi.noFeedBody}</p>
          </div>
        )}
      </div>

      <div className="grid gap-x-8 px-5 py-3 md:grid-cols-2">
        <div>
          {lm ? (
            <Row k={`${testnetDesk.badge} token`} v={<a className="hover:text-dawn" href={addressUrl(lm.token)} target="_blank" rel="noreferrer">{short(lm.token)}</a>} />
          ) : (
            <Row k="Token contract" v={<a className="hover:text-dawn" href={`${CHAIN_EXPLORER}/address/${m.address}`} target="_blank" rel="noreferrer">{short(m.address)}</a>} />
          )}
          <Row k="Sector" v={m.sector} />
        </div>
        <div>
          {lm?.feed ? (
            <Row k={`${testnetDesk.badge} mirror feed`} v={<a className="hover:text-dawn" href={addressUrl(lm.feed)} target="_blank" rel="noreferrer">{short(lm.feed)}</a>} />
          ) : null}
          <Row
            k="Chainlink feed"
            v={m.oracle ? <a className="hover:text-dawn" href={`${CHAIN_EXPLORER}/address/${m.oracle}`} target="_blank" rel="noreferrer">{short(m.oracle)}</a> : "Not published"}
            muted={!m.oracle}
          />
          <Row k="Session" v="24/5 · US equities" />
        </div>
      </div>
      <p className="px-5 pb-3 font-inter text-[11.5px] text-smoke">{appUi.sessionNote}</p>
    </section>
  );
}

function Positions({ desk, live, token, symbol }: { desk: Desk; live: boolean; token?: string | null; symbol: string }) {
  const [tab, setTab] = useState<"positions" | "history">("positions");
  const [scope, setScope] = useState<"market" | "all">("market");
  const tabCls = (on: boolean) => `py-2.5 ${on ? "border-b-2 border-dawn text-ivory" : "text-haze hover:text-ivory"}`;
  const filter = scope === "market" ? token : null;
  return (
    <section aria-label="Positions" className="shrink-0 border-t border-white/[0.07]">
      <div className="flex items-center gap-5 border-b border-white/[0.07] px-5 font-inter text-[13px]" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "positions"} className={tabCls(tab === "positions")} onClick={() => setTab("positions")}>{desk === "perps" ? "Perps positions" : "Options positions"}</button>
        <button type="button" role="tab" aria-selected={tab === "history"} className={tabCls(tab === "history")} onClick={() => setTab("history")}>History</button>
        {live ? (
          <div className="ml-auto flex gap-1.5 py-1.5" role="group" aria-label="Scope">
            {(["market", "all"] as const).map((k) => (
              <button key={k} type="button" aria-pressed={scope === k} onClick={() => setScope(k)} className={`rounded-[4px] px-2 py-1 text-[12px] ${scope === k ? "bg-white/[0.08] text-ivory" : "text-haze hover:text-ivory"}`}>
                {k === "market" ? symbol : "All markets"}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {!live ? <p className="px-5 py-6 font-inter text-[13px] text-haze">{appUi.portfolioEmpty}</p> : desk === "options" ? (tab === "positions" ? <LiveOptionsPositions token={filter} /> : <LiveOptionsHistory token={filter} />) : tab === "positions" ? <LivePositions token={filter} /> : <LiveHistory token={filter} />}
    </section>
  );
}

export function DeskView({ desk, symbol }: { desk: Desk; symbol?: string }) {
  const router = useRouter();
  const firstLive = registry.find((x) => x[desk] === "live")?.symbol;
  const fallback = firstLive ?? "NVDA";
  const m = (symbol ? bySymbol(symbol) : undefined) ?? bySymbol(fallback) ?? registry[0];
  const lm = listed(ACTIVE_CHAIN_ID, m.symbol);
  // Options go live wherever the market has an on-chain feed; the ticket itself checks registry.isOptionsEnabled.
  const live = desk === "perps" ? !!lm?.perps : !!lm?.feed && !!deployed(ACTIVE_CHAIN_ID, "OptionsEngine");
  const select = (x: Market) => router.push(`/app/${desk}/${x.symbol}`, { scroll: false });

  return (
    <div className="mx-auto grid max-w-[1480px] lg:h-[calc(100dvh-81px)] lg:grid-cols-[400px_minmax(0,1fr)_340px]">
      <div className="order-3 flex min-h-0 flex-col border-white/[0.07] lg:order-1 lg:border-r max-lg:h-[640px] max-lg:border-t">
        <Catalog desk={desk} selected={m.symbol} onSelect={select} />
      </div>
      <div className="order-1 flex min-h-0 flex-col overflow-y-auto lg:order-2">
        <MarketPanel m={m} desk={desk} lm={live ? lm : null} />
        <Positions desk={desk} live={live} token={lm?.token} symbol={m.symbol} />
      </div>
      <aside aria-label="Order ticket" className="order-2 min-h-0 overflow-y-auto border-white/[0.07] lg:order-3 lg:border-l max-lg:border-t">
        <TicketHeader desk={desk} />
        <div className="p-4">
          {desk === "perps" ? (live && lm ? <LivePerpsTicket key={m.symbol} symbol={m.symbol} lm={lm} /> : <PerpsTicket key={m.symbol} m={m} />) : live && lm ? <LiveOptionsTicket key={m.symbol} symbol={m.symbol} lm={lm} /> : <OptionsTicket key={m.symbol} m={m} />}
        </div>
        <p className="px-4 pb-4 font-plex text-[10.5px] uppercase tracking-[0.1em] text-smoke">{live ? testnetDesk.illustrative : "Illustrative · values unavailable until oracle connects"}</p>
      </aside>
    </div>
  );
}
