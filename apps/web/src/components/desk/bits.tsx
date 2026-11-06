import { app } from "@/content/copy";
import type { DeskStatus, Market, Sector } from "@/content/registry";

export function StatusBadge({ status }: { status: DeskStatus }) {
  if (status === "live")
    return <span className="rounded-[3px] border border-dawn/40 bg-dawn/10 whitespace-nowrap px-1.5 py-0.5 font-plex text-[10.5px] uppercase tracking-[0.06em] text-dawn">Live</span>;
  if (status === "coming-soon")
    return (
      <span className="rounded-[3px] border border-white/15 whitespace-nowrap px-1.5 py-0.5 font-plex text-[10.5px] uppercase tracking-[0.06em] text-ivory/80">
        {app.badgeComingSoon}
      </span>
    );
  return (
    <span className="rounded-[3px] border border-white/[0.08] whitespace-nowrap px-1.5 py-0.5 font-plex text-[10.5px] uppercase tracking-[0.06em] text-smoke">
      {app.badgeOracle}
    </span>
  );
}

const tint: Record<Sector, string> = {
  Semiconductors: "from-dawn to-dawn-hi",
  "Software & Internet": "from-dawn-hi to-ivory",
  "Crypto & Fintech": "from-dawn-deep to-dawn",
  Quantum: "from-haze to-dawn-hi",
  "Space, Aero & Defense": "from-smoke to-haze",
  "Energy & Industrials": "from-dawn-deep to-haze",
  Consumer: "from-haze to-ivory",
  Healthcare: "from-smoke to-dawn",
  "ETFs & Funds": "from-ivory to-dawn",
};

/** Ticker monogram, not a company logo (no third-party marks). */
export function Glyph({ m, size = 28 }: { m: Pick<Market, "symbol" | "sector">; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-grid shrink-0 place-items-center rounded-full bg-gradient-to-br ${tint[m.sector]} font-zal font-semibold text-void`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
    >
      {m.symbol.slice(0, m.symbol.length > 3 ? 2 : 1)}
    </span>
  );
}

export function short(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/** Order-confirm latency chip (§8.6 / §17.7). No measurement exists before testnet, so it shows Soft-confirm. */
export function LatencyChip({ ms }: { ms?: number | null }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-1 font-plex text-[11px] text-haze">
      <span className={`size-1.5 rounded-full ${ms ? "bg-dawn" : "bg-smoke"}`} aria-hidden="true" />
      {ms ? app.latencyChip(ms) : app.softConfirm}
    </span>
  );
}

export function Row({ k, v, muted = false }: { k: string; v: React.ReactNode; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5 font-inter text-[13px]">
      <span className="text-haze">{k}</span>
      <span className={`font-plex ${muted ? "text-smoke" : "text-ivory"}`}>{v}</span>
    </div>
  );
}
