"use client";

import { useState } from "react";
import { app } from "@/content/copy";

type Desk = "perps" | "options";

/**
 * Product-true ticket mock. No prices, marks or balances: every value that would
 * come from the oracle is shown as an em dash, and the panel is labelled Illustrative.
 */
export function DeskTicket({ initial = "perps" }: { initial?: Desk }) {
  const [desk, setDesk] = useState<Desk>(initial);
  const [lev, setLev] = useState<(typeof app.leverageOptions)[number]>("1.5×");
  const [side, setSide] = useState<"long" | "short">("long");
  const [kind, setKind] = useState<"call" | "put">("call");

  const tab = (d: Desk, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={desk === d}
      onClick={() => setDesk(d)}
      className={`h-9 flex-1 rounded-[4px] font-inter text-[13.5px] ${
        desk === d ? "bg-white/10 text-ivory" : "text-haze hover:text-ivory"
      }`}
    >
      {label}
    </button>
  );
  const pill = (on: boolean, strong: "cobalt" | "graphite") =>
    on
      ? strong === "cobalt"
        ? "border-dawn bg-dawn text-void"
        : "border-ivory bg-ivory text-void"
      : "border-white/10 text-haze hover:border-white/40 hover:text-ivory";

  return (
    <div className="w-full rounded-[10px] border border-white/10 bg-char p-4 shadow-[0_40px_90px_-40px_rgba(240,196,142,0.18)]">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-zal text-[15px] font-medium text-ivory">NVDA</span>
          <span className="font-inter text-[12px] text-smoke">NVIDIA · Stock Token</span>
        </div>
        <span className="rounded-[3px] border border-white/10 px-2 py-0.5 font-plex text-[10px] uppercase tracking-[0.12em] text-smoke">Illustrative</span>
      </div>

      <div role="tablist" aria-label="Desk" className="flex gap-1 rounded-[6px] bg-char-2 p-1">
        {tab("perps", "Perps")}
        {tab("options", "Options")}
      </div>

      {desk === "perps" ? (
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {(["long", "short"] as const).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={side === s}
                onClick={() => setSide(s)}
                className={`h-10 rounded-[4px] border font-inter text-[13.5px] capitalize ${pill(side === s, s === "long" ? "cobalt" : "graphite")}`}
              >
                {s}
              </button>
            ))}
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between font-inter text-[12px]">
              <span className="text-haze">Leverage</span>
              <span className="text-smoke">{app.leverageHelper}</span>
            </div>
            <div role="radiogroup" aria-label="Leverage" className="grid grid-cols-4 gap-1.5">
              {app.leverageOptions.map((l) => (
                <button
                  key={l}
                  type="button"
                  role="radio"
                  aria-checked={lev === l}
                  onClick={() => setLev(l)}
                  className={`h-9 rounded-[4px] border font-plex text-[12.5px] ${pill(lev === l, "cobalt")}`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
          <Rows rows={[["Margin", "USDG"], ["Mark", "—"], ["Est. liquidation", "—"]]} />
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {(["call", "put"] as const).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={kind === k}
                onClick={() => setKind(k)}
                className={`h-10 rounded-[4px] border font-inter text-[13.5px] capitalize ${pill(kind === k, k === "call" ? "cobalt" : "graphite")}`}
              >
                Buy {k}
              </button>
            ))}
          </div>
          <div className="rounded-[6px] border border-dashed border-white/10 px-3 py-4 text-center font-inter text-[12.5px] text-smoke">{app.optionsEmpty}</div>
          <Rows rows={[["Style", "European, cash-settled"], ["Premium", "USDG"], ["Expiry", "Preset ladder"]]} />
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-t border-white/10 pt-3">
        <span className="inline-flex items-center gap-2 font-plex text-[11px] text-haze">
          <span className="size-1.5 rounded-full bg-dawn" aria-hidden="true" />
          {app.softConfirm} · Confirm ~ms
        </span>
        <span className="font-inter text-[11px] text-smoke">{app.liqWarning}</span>
      </div>
    </div>
  );
}

function Rows({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="space-y-2 font-inter text-[12.5px]">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between">
          <dt className="text-smoke">{k}</dt>
          <dd className="font-plex text-ivory">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
