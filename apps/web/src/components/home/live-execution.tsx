"use client";

import { useEffect, useRef, useState } from "react";
import { execLive } from "@/content/copy";

/**
 * Live Robinhood Chain mainnet meter. Reads only public RPC (no wallet, no API key):
 * - block height (polled), avg block time = Δheight / Δwall-clock over the session,
 * - RPC round-trip of each poll. Shows "—" until two samples exist. No synthetic numbers.
 */
const RPC = "https://robinhood-rpc.publicnode.com";

async function blockNumber() {
  const t0 = performance.now();
  const r = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
  });
  const j = await r.json();
  return { n: parseInt(j.result, 16), rtt: performance.now() - t0, at: Date.now() };
}

export function LiveExecution() {
  const first = useRef<{ n: number; at: number } | null>(null);
  const [s, setS] = useState<{ n: number; rtt: number; blockMs: number | null } | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let live = true;
    const tick = async () => {
      try {
        const b = await blockNumber();
        if (!live || !Number.isFinite(b.n)) return;
        if (!first.current) first.current = { n: b.n, at: b.at };
        const dn = b.n - first.current.n;
        const dt = b.at - first.current.at;
        setS({ n: b.n, rtt: b.rtt, blockMs: dn > 0 && dt > 3000 ? dt / dn : null });
        setErr(false);
      } catch {
        if (live) setErr(true);
      }
    };
    tick();
    const id = setInterval(tick, 2000);
    return () => { live = false; clearInterval(id); };
  }, []);

  const cells = [
    { k: execLive.blockTime, v: s?.blockMs ? `${Math.round(s.blockMs)} ms` : "—" },
    { k: execLive.rtt, v: s ? `${Math.round(s.rtt)} ms` : "—" },
    { k: execLive.height, v: s ? s.n.toLocaleString("en-US") : "—" },
  ];

  return (
    <div className="rounded-[10px] border border-dawn/30 bg-void/70 p-6 shadow-[0_0_80px_-20px_rgba(240,196,142,0.35)]">
      <div className="flex items-center justify-between">
        <span className="font-plex text-[11px] uppercase tracking-[0.14em] text-haze">{execLive.meterTitle}</span>
        <span className={`inline-flex items-center gap-2 rounded-[4px] border px-2.5 py-1 font-plex text-[11px] ${err ? "border-white/15 text-smoke" : "border-dawn/50 text-dawn-hi"}`}>
          <span className={`size-1.5 rounded-full ${err ? "bg-smoke" : "animate-pulse bg-dawn-hi"}`} aria-hidden="true" />
          {err ? execLive.offline : execLive.live}
        </span>
      </div>
      <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5">
        {cells.map((c) => (
          <div key={c.k} className={c.k === execLive.height ? "col-span-2" : ""}>
            <dt className="font-plex text-[10.5px] uppercase tracking-[0.12em] text-smoke">{c.k}</dt>
            <dd className="mt-2 font-zal whitespace-nowrap text-[24px] font-semibold tabular-nums tracking-[-0.01em] text-ivory md:text-[30px]" aria-live="polite">{c.v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-5 font-inter text-[11.5px] leading-relaxed text-smoke">{execLive.meterNote}</p>
    </div>
  );
}
