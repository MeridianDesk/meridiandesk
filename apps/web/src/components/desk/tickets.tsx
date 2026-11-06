"use client";

import { useState } from "react";
import { app, appUi } from "@/content/copy";
import type { Market } from "@/content/registry";
import { LatencyChip, Row } from "./bits";
import { useUsdgBalance } from "./wallet";

type Lev = (typeof app.leverageOptions)[number];

const seg = (on: boolean, tone: "dawn" | "ivory" = "dawn") =>
  `h-9 flex-1 rounded-[4px] border font-inter text-[13.5px] ${
    on
      ? tone === "dawn"
        ? "border-dawn bg-dawn text-void"
        : "border-ivory bg-ivory text-void"
      : "border-white/10 text-haze hover:border-white/30 hover:text-ivory"
  }`;

function Submit({ label, m }: { label: string; m: Market | null }) {
  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled
        aria-describedby="pretestnet-note"
        className="h-11 w-full cursor-not-allowed rounded-[4px] border border-white/10 bg-white/[0.04] font-inter text-[14px] text-haze"
      >
        {m ? `${label} · ${appUi.preTestnet}` : appUi.preTestnet}
      </button>
      <p id="pretestnet-note" className="font-inter text-[11.5px] leading-relaxed text-smoke">
        {appUi.preTestnetNote}
      </p>
    </div>
  );
}

function SizeField({ id }: { id: string }) {
  const [v, setV] = useState("");
  const usdg = useUsdgBalance();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 flex justify-between font-inter text-[12.5px] text-haze">
        <span>Size</span>
        <span className="font-plex text-[11px] text-smoke">Balance {usdg}</span>
      </label>
      <div className="flex h-10 items-center rounded-[4px] border border-white/10 bg-void px-3 focus-within:border-dawn/60">
        <input
          id={id}
          inputMode="decimal"
          value={v}
          onChange={(e) => setV(e.target.value.replace(/[^0-9.]/g, ""))}
          placeholder="0.00"
          className="h-full w-full bg-transparent font-plex text-[14px] text-ivory placeholder:text-smoke focus:outline-none"
        />
        <span className="font-plex text-[12px] text-haze">USDG</span>
      </div>
      <p className="mt-1 font-plex text-[11px] text-smoke">≈ — tokens</p>
    </div>
  );
}

export function PerpsTicket({ m }: { m: Market | null }) {
  const [side, setSide] = useState<"long" | "short">("long");
  const [lev, setLev] = useState<Lev>("1×");
  const [type, setType] = useState<"market" | "limit">("market");
  return (
    <div className="space-y-4">
      <div className="flex gap-1.5" role="group" aria-label="Side">
        <button type="button" aria-pressed={side === "long"} className={seg(side === "long")} onClick={() => setSide("long")}>Long</button>
        <button type="button" aria-pressed={side === "short"} className={seg(side === "short", "ivory")} onClick={() => setSide("short")}>Short</button>
      </div>
      <div className="flex gap-4 font-inter text-[13px]" role="group" aria-label="Order type">
        {(["market", "limit"] as const).map((t) => (
          <button key={t} type="button" aria-pressed={type === t} onClick={() => setType(t)} className={type === t ? "text-ivory underline decoration-dawn decoration-2 underline-offset-[6px]" : "text-haze hover:text-ivory"}>
            {t === "market" ? "Market" : "Limit"}
          </button>
        ))}
      </div>
      {type === "limit" ? (
        <div>
          <label htmlFor="perps-limit" className="mb-1.5 block font-inter text-[12.5px] text-haze">Limit price</label>
          <input id="perps-limit" inputMode="decimal" placeholder="—" className="h-10 w-full rounded-[4px] border border-white/10 bg-void px-3 font-plex text-[14px] text-ivory placeholder:text-smoke focus:border-dawn/60 focus:outline-none" />
        </div>
      ) : null}
      <SizeField id="perps-size" />
      <div>
        <div className="mb-1.5 flex justify-between font-inter text-[12.5px] text-haze">
          <span id="lev-label">Leverage</span>
          <span className="font-plex text-[11px] text-smoke">{app.leverageHelper}</span>
        </div>
        {/* Exactly four settings. No slider, no free input (§8.4). */}
        <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-labelledby="lev-label">
          {app.leverageOptions.map((l) => (
            <button key={l} type="button" role="radio" aria-checked={lev === l} onClick={() => setLev(l)} className={seg(lev === l)}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <div className="rounded-[6px] border border-white/[0.07] bg-void/60 px-3 py-1.5">
        <Row k="Entry (oracle mark)" v="—" muted />
        <Row k="Margin required" v="—" muted />
        <Row k="Est. liquidation price" v="—" muted />
        <Row k="Fees" v="—" muted />
        <Row k="Funding (periodic)" v="—" muted />
        <Row k="Margin mode" v="Isolated · proposed" />
      </div>
      <p className="flex gap-2 rounded-[5px] border border-dawn/20 bg-dawn/[0.05] px-3 py-2 font-inter text-[12.5px] text-dawn-hi" role="note">
        <span aria-hidden="true">!</span>
        {app.liqWarning}
      </p>
      <Submit label={`${side === "long" ? "Long" : "Short"} ${m?.symbol ?? ""} ${lev}`} m={m} />
    </div>
  );
}

const expiries = ["1D", "1W", "1M"] as const;
const strikes = ["−10%", "−5%", "ATM", "+5%", "+10%"] as const;

export function OptionsTicket({ m }: { m: Market | null }) {
  const [kind, setKind] = useState<"call" | "put">("call");
  const [exp, setExp] = useState<(typeof expiries)[number]>("1W");
  const [strike, setStrike] = useState<(typeof strikes)[number] | null>(null);
  if (!m) return <p className="py-10 text-center font-inter text-[13.5px] text-haze">{app.optionsEmpty}</p>;
  return (
    <div className="space-y-4">
      <div className="flex gap-1.5" role="group" aria-label="Option type">
        <button type="button" aria-pressed={kind === "call"} className={seg(kind === "call")} onClick={() => setKind("call")}>Call</button>
        <button type="button" aria-pressed={kind === "put"} className={seg(kind === "put", "ivory")} onClick={() => setKind("put")}>Put</button>
      </div>
      <div className="flex items-center justify-between font-inter text-[12.5px]">
        <span className="text-ivory">Buy</span>
        <span className="font-plex text-[11px] text-smoke">{appUi.optionsBuyOnly}</span>
      </div>
      <div>
        <div id="exp-label" className="mb-1.5 font-inter text-[12.5px] text-haze">Expiry</div>
        <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-labelledby="exp-label">
          {expiries.map((e) => (
            <button key={e} type="button" role="radio" aria-checked={exp === e} onClick={() => setExp(e)} className={seg(exp === e)}>{e}</button>
          ))}
        </div>
      </div>
      <div>
        <div className="mb-1.5 flex justify-between font-inter text-[12.5px] text-haze">
          <span id="strike-label">Strike (relative to ATM)</span>
          <span className="font-plex text-[11px] text-smoke">European · cash-settled</span>
        </div>
        <div className="overflow-hidden rounded-[6px] border border-white/[0.07]" role="radiogroup" aria-labelledby="strike-label">
          <div className="grid grid-cols-3 bg-white/[0.03] px-3 py-1.5 font-plex text-[10.5px] uppercase tracking-[0.08em] text-smoke">
            <span>Strike</span><span className="text-right">Premium</span><span className="text-right">Δ</span>
          </div>
          {strikes.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={strike === s}
              onClick={() => setStrike(s)}
              className={`grid w-full grid-cols-3 border-t border-white/[0.05] px-3 py-2 text-left font-plex text-[12.5px] ${strike === s ? "bg-dawn/[0.08] text-ivory" : "text-haze hover:bg-white/[0.03]"}`}
            >
              <span>{s}</span><span className="text-right text-smoke">—</span><span className="text-right text-smoke">—</span>
            </button>
          ))}
        </div>
      </div>
      <SizeField id="opt-size" />
      <div className="rounded-[6px] border border-white/[0.07] bg-void/60 px-3 py-1.5">
        <Row k="Premium (USDG)" v="—" muted />
        <Row k="Max loss" v="Premium paid" />
        <Row k="Breakeven" v="—" muted />
        <Row k="Settlement" v="Oracle mark at expiry" />
      </div>
      <Submit label={`Buy ${m.symbol} ${kind === "call" ? "Call" : "Put"} ${exp}`} m={m} />
    </div>
  );
}

export function TicketHeader({ desk }: { desk: "perps" | "options" }) {
  return (
    <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3">
      <span className="font-zal text-[14px] font-semibold tracking-[-0.01em] text-ivory">
        {desk === "perps" ? "Perps order" : "Options order"}
      </span>
      <LatencyChip />
    </div>
  );
}
