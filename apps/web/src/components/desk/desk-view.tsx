"use client";

import { useRouter } from "next/navigation";
import { appUi } from "@/content/copy";
import { bySymbol, CHAIN_EXPLORER, registry, type Market } from "@/content/registry";
import { Glyph, Row, short, StatusBadge } from "./bits";
import { Catalog, type Desk } from "./catalog";
import { OptionsTicket, PerpsTicket, TicketHeader } from "./tickets";

/** Market header + chart placeholder. Every oracle-derived value is an em dash until feeds connect. */
function MarketPanel({ m, desk }: { m: Market; desk: Desk }) {
  return (
    <section aria-label={`${m.symbol} market`} className="flex min-h-0 flex-col">
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
          {[["Oracle mark", "—"], ["24h", "—"], [desk === "perps" ? "Funding" : "IV", "—"], ["Open interest", "—"]].map(([k, v]) => (
            <div key={k}>
              <dt className="text-[10.5px] uppercase tracking-[0.08em] text-smoke">{k}</dt>
              <dd className="text-ivory/70">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="ml-auto"><StatusBadge status={m[desk]} /></div>
      </div>

      <div className="relative flex min-h-[260px] flex-1 items-center justify-center overflow-hidden border-b border-white/[0.07]">
        <svg className="absolute inset-0 h-full w-full" aria-hidden="true">
          <defs>
            <pattern id="grid" width="56" height="44" patternUnits="userSpaceOnUse">
              <path d="M56 0H0V44" fill="none" stroke="rgba(255,255,255,0.045)" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
        <div className="relative max-w-[360px] px-6 text-center">
          <p className="font-plex text-[11px] uppercase tracking-[0.14em] text-smoke">{appUi.oracleStream}</p>
          <p className="mt-2 font-inter text-[13px] leading-relaxed text-haze">{appUi.chartEmpty}</p>
        </div>
      </div>

      <div className="grid gap-x-8 px-5 py-3 md:grid-cols-2">
        <div>
          <Row k="Token contract" v={<a className="hover:text-dawn" href={`${CHAIN_EXPLORER}/address/${m.address}`} target="_blank" rel="noreferrer">{short(m.address)}</a>} />
          <Row k="Sector" v={m.sector} />
        </div>
        <div>
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

function Positions({ desk }: { desk: Desk }) {
  return (
    <section aria-label="Positions" className="border-t border-white/[0.07]">
      <div className="flex gap-5 border-b border-white/[0.07] px-5 font-inter text-[13px]">
        <span className="border-b-2 border-dawn py-2.5 text-ivory">{desk === "perps" ? "Perps positions" : "Options positions"}</span>
        <span className="py-2.5 text-haze">Orders</span>
        <span className="py-2.5 text-haze">History</span>
      </div>
      <p className="px-5 py-6 font-inter text-[13px] text-haze">{appUi.portfolioEmpty}</p>
    </section>
  );
}

export function DeskView({ desk, symbol }: { desk: Desk; symbol?: string }) {
  const router = useRouter();
  const fallback = desk === "perps" ? "NVDA" : "AAPL";
  const m = (symbol ? bySymbol(symbol) : undefined) ?? bySymbol(fallback) ?? registry[0];
  const select = (x: Market) => router.push(`/app/${desk}/${x.symbol}`, { scroll: false });

  return (
    <div className="mx-auto grid max-w-[1480px] lg:h-[calc(100dvh-81px)] lg:grid-cols-[400px_minmax(0,1fr)_340px]">
      <div className="order-3 flex min-h-0 flex-col border-white/[0.07] lg:order-1 lg:border-r max-lg:h-[640px] max-lg:border-t">
        <Catalog desk={desk} selected={m.symbol} onSelect={select} />
      </div>
      <div className="order-1 flex min-h-0 flex-col overflow-y-auto lg:order-2">
        <MarketPanel m={m} desk={desk} />
        <Positions desk={desk} />
      </div>
      <aside aria-label="Order ticket" className="order-2 min-h-0 overflow-y-auto border-white/[0.07] lg:order-3 lg:border-l max-lg:border-t">
        <TicketHeader desk={desk} />
        <div className="p-4">
          {desk === "perps" ? <PerpsTicket key={m.symbol} m={m} /> : <OptionsTicket key={m.symbol} m={m} />}
        </div>
        <p className="px-4 pb-4 font-plex text-[10.5px] uppercase tracking-[0.1em] text-smoke">Illustrative · values unavailable until oracle connects</p>
      </aside>
    </div>
  );
}
