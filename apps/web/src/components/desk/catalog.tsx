"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { app, appUi } from "@/content/copy";
import { registry, REGISTRY_SNAPSHOT, sectors, type Market, type Sector } from "@/content/registry";
import { Glyph, StatusBadge } from "./bits";

export type Desk = "perps" | "options";
type StatusFilter = "all" | "oracle" | "no-oracle";
type Tier = "all" | "featured" | "new";

/**
 * Full MarketRegistry list (brief §8.3 / §11.2). Filters only ever narrow what the
 * user asked for; the unfiltered view is always 100% of the registry.
 */
export function Catalog({ desk, selected, onSelect }: { desk: Desk; selected: string | null; onSelect: (m: Market) => void }) {
  const [q, setQ] = useState("");
  const [sector, setSector] = useState<Sector | "all">("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [tier, setTier] = useState<Tier>("all");
  const listRef = useRef<HTMLUListElement>(null);

  // Deep links (/app/perps/TSLA) land with the selected row visible in the list.
  useEffect(() => {
    // Scroll only the list container, never the page (scrollIntoView would jump the window on mobile).
    const ul = listRef.current;
    const row = ul?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!ul || !row) return;
    const top = row.offsetTop - ul.offsetTop;
    if (top < ul.scrollTop || top + row.offsetHeight > ul.scrollTop + ul.clientHeight) ul.scrollTop = top - ul.clientHeight / 3;
  }, [selected]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return registry.filter((m) => {
      if (needle && !m.symbol.toLowerCase().includes(needle) && !m.name.toLowerCase().includes(needle)) return false;
      if (sector !== "all" && m.sector !== sector) return false;
      if (status === "oracle" && !m.oracle) return false;
      if (status === "no-oracle" && m.oracle) return false;
      if (tier === "featured" && !m.featured) return false;
      if (tier === "new") return false; // listing dates not in registry snapshot yet
      return true;
    });
  }, [q, sector, status, tier]);

  const chip = (on: boolean) =>
    `h-7 shrink-0 rounded-full border px-3 font-inter text-[12.5px] ${on ? "border-dawn bg-dawn text-void" : "border-white/10 text-haze hover:border-white/30 hover:text-ivory"}`;
  const dirty = q || sector !== "all" || status !== "all" || tier !== "all";

  return (
    <section aria-label={`${desk === "perps" ? "Perps" : "Options"} markets`} className="flex min-h-0 flex-col">
      <div className="space-y-3 border-b border-white/[0.07] p-4">
        <div className="flex items-baseline justify-between">
          <h1 className="font-zal text-[18px] font-semibold tracking-[-0.02em] text-ivory">
            {desk === "perps" ? "Perps" : "Options"} <span className="text-haze">· {appUi.catalogTitle}</span>
          </h1>
          <span className="font-plex text-[11.5px] text-haze" aria-live="polite">
            {appUi.catalogCount(rows.length, registry.length)}
          </span>
        </div>
        <label className="flex h-10 items-center gap-2 rounded-[5px] border border-white/10 bg-char px-3 focus-within:border-dawn/60">
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" className="text-smoke">
            <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="M11 11 L15 15" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          <span className="sr-only">Search markets</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={appUi.searchPlaceholder}
            className="h-full w-full bg-transparent font-inter text-[14px] text-ivory placeholder:text-smoke focus:outline-none"
          />
          {q ? (
            <button type="button" onClick={() => setQ("")} className="font-plex text-[11px] text-haze hover:text-ivory">
              Clear
            </button>
          ) : null}
        </label>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filters">
          <button type="button" className={chip(tier === "all")} onClick={() => setTier("all")}>All</button>
          <button type="button" className={chip(tier === "featured")} onClick={() => setTier("featured")}>Featured</button>
          <button type="button" className={chip(tier === "new")} onClick={() => setTier("new")}>Newly listed</button>
          
          <button type="button" className={chip(status === "oracle")} onClick={() => setStatus(status === "oracle" ? "all" : "oracle")}>Oracle live</button>
          <button type="button" className={chip(status === "no-oracle")} onClick={() => setStatus(status === "no-oracle" ? "all" : "no-oracle")}>{app.badgeOracle}</button>
        </div>
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor={`sector-${desk}`}>Sector</label>
          <select
            id={`sector-${desk}`}
            value={sector}
            onChange={(e) => setSector(e.target.value as Sector | "all")}
            className="h-8 flex-1 rounded-[4px] border border-white/10 bg-char px-2 font-inter text-[12.5px] text-ivory focus:outline-none"
          >
            <option value="all">All sectors</option>
            {sectors.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          {dirty ? (
            <button
              type="button"
              onClick={() => { setQ(""); setSector("all"); setStatus("all"); setTier("all"); }}
              className="h-8 rounded-[4px] border border-white/10 px-3 font-inter text-[12.5px] text-haze hover:text-ivory"
            >
              Reset
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_56px_auto] gap-2 border-b border-white/[0.07] px-4 py-2 font-plex text-[10.5px] uppercase tracking-[0.08em] text-smoke">
        <span>Market</span>
        <span className="text-right">Oracle</span>
        <span className="text-right">Status</span>
      </div>

      <ul ref={listRef} className="min-h-0 flex-1 overflow-y-auto" aria-label="Market list">
        {rows.length === 0 ? (
          <li className="px-4 py-10 text-center font-inter text-[13.5px] leading-relaxed text-haze">
            {tier === "new" ? appUi.newlyListedEmpty : app.searchEmpty}
          </li>
        ) : (
          rows.map((m) => {
            const on = selected === m.symbol;
            return (
              <li key={m.symbol}>
                <button
                  type="button"
                  onClick={() => onSelect(m)}
                  aria-current={on ? "true" : undefined}
                  className={`grid w-full grid-cols-[minmax(0,1fr)_56px_auto] items-center gap-2 border-b border-white/[0.04] px-4 py-2.5 text-left ${
                    on ? "bg-dawn/[0.07]" : "hover:bg-white/[0.03]"
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <Glyph m={m} size={26} />
                    <span className="min-w-0">
                      <span className="block font-zal text-[13.5px] font-medium tracking-[-0.01em] text-ivory">{m.symbol}</span>
                      <span className="block truncate font-inter text-[11.5px] text-haze">{m.name}</span>
                    </span>
                  </span>
                  <span className="text-right font-plex text-[12.5px] text-smoke" title={appUi.oracleStream}>—</span>
                  <span className="flex justify-end">
                    <StatusBadge status={m[desk]} />
                  </span>
                </button>
              </li>
            );
          })
        )}
      </ul>
      <p className="border-t border-white/[0.07] px-4 py-2 font-plex text-[10.5px] text-smoke">{appUi.registryNote(REGISTRY_SNAPSHOT)}</p>
    </section>
  );
}
