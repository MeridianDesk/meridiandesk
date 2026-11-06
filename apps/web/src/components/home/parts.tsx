import Link from "next/link";
import type { FeaturedToken } from "@/content/featured";

export const APP = "/app";

/** Meridian mark: two meridian arcs crossed by the vertical noon line. */
export function VMark({ size = 22, light = false }: { size?: number; light?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2.5 19 A 9.5 9.5 0 0 1 21.5 19" fill="none" stroke="#1f3bff" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M7 19 A 5 5 0 0 1 17 19" fill="none" stroke="#6f95ff" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M12 3 V21" stroke={light ? "#f7f8f9" : "#0b0e12"} strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function Wordmark({ light = false }: { light?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2" aria-label="Meridian Desk home">
      <VMark light={light} />
      <span className={`font-inter text-[21px] font-medium tracking-[-0.03em] ${light ? "text-snow" : "text-graphite"}`}>Meridian</span>
      <span className={`mt-0.5 font-inter text-[13px] ${light ? "text-ash" : "text-slate"}`}>Desk</span>
    </Link>
  );
}

export function Arrow() {
  return (
    <svg width="13" height="13" viewBox="0 0 12 12" aria-hidden="true" className="inline-block">
      <path d="M3 9 L9 3 M4 3 H9 V8" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

const btn = "inline-flex items-center justify-center gap-2 rounded-[4px] font-inter";
const sizes = { sm: "h-[42px] px-7 text-[14px]", md: "h-[46px] px-8 text-[15px]", lg: "h-[54px] px-10 text-[17px]" };
export function PrimaryBtn({ href, children, size = "md" }: { href: string; children: React.ReactNode; size?: keyof typeof sizes }) {
  return (
    <Link href={href} className={`${btn} ${sizes[size]} bg-cobalt text-white shadow-[0_10px_30px_-12px_rgba(31,59,255,0.7)] hover:bg-cobalt-ink`}>
      {children}
    </Link>
  );
}
export function GhostBtn({ href, children, size = "md", dark = false }: { href: string; children: React.ReactNode; size?: keyof typeof sizes; dark?: boolean }) {
  return (
    <Link
      href={href}
      className={`${btn} ${sizes[size]} border ${
        dark ? "border-white/15 text-snow hover:border-white/50" : "border-line bg-white/70 text-graphite backdrop-blur-sm hover:border-graphite"
      }`}
    >
      {children}
    </Link>
  );
}

const ring: Record<FeaturedToken["cluster"], string> = {
  MAG7: "from-cobalt to-cobalt-hi",
  "Index ETF": "from-cobalt-ink to-peri",
  Liquid: "from-graphite to-slate",
};

/** Ticker monogram — not a company logo (no third-party marks). */
export function Monogram({ t, size = 22 }: { t: FeaturedToken; size?: number }) {
  return (
    <span
      className={`inline-grid shrink-0 place-items-center rounded-full bg-gradient-to-br ${ring[t.cluster]} font-zal text-[9px] font-semibold text-white`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {t.symbol[0]}
    </span>
  );
}

/** Ticker card. Deliberately shows no price: live oracle marks are only shown in-app. */
export function TokenCard({ t }: { t: FeaturedToken }) {
  return (
    <Link
      href={`${APP}/markets/${t.symbol}`}
      className="flex w-[212px] shrink-0 flex-col gap-1.5 rounded-[6px] border border-line bg-white/95 px-5 py-3.5 shadow-[0_8px_24px_-16px_rgba(11,14,18,0.35)] backdrop-blur-sm hover:border-cobalt"
    >
      <span className="flex items-center gap-2">
        <Monogram t={t} />
        <span className="font-zal text-[16px] font-medium tracking-[-0.02em] text-graphite">{t.symbol}</span>
      </span>
      <span className="flex items-center justify-between font-inter text-[12.5px] text-slate">
        <span className="truncate">{t.name}</span>
        <span className="ml-2 shrink-0 font-plex text-[10.5px] text-ash">P · O</span>
      </span>
    </Link>
  );
}

export function Marquee({ items, duration = 60, reverse = false }: { items: FeaturedToken[]; duration?: number; reverse?: boolean }) {
  const loop = [...items, ...items];
  return (
    <div className="relative overflow-hidden py-2 [mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)]">
      <div className={`v-marquee flex w-max gap-4 ${reverse ? "v-marquee-rev" : ""}`} style={{ ["--v-dur" as string]: `${duration}s` }}>
        {loop.map((t, i) => (
          <div key={`${t.symbol}-${i}`} aria-hidden={i >= items.length ? true : undefined}>
            <TokenCard t={t} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function Kicker({ children, dark = false }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2 font-plex text-[11.5px] uppercase tracking-[0.16em] ${dark ? "text-peri" : "text-cobalt"}`}>
      <span className={`size-1.5 rounded-full ${dark ? "bg-peri" : "bg-cobalt"}`} aria-hidden="true" />
      {children}
    </span>
  );
}

export function SectionTitle({
  kicker,
  title,
  sub,
  dark = false,
}: {
  kicker?: React.ReactNode;
  title: React.ReactNode;
  sub?: React.ReactNode;
  dark?: boolean;
}) {
  return (
    <div className="max-w-[720px]">
      {kicker ? <div className="mb-5">{kicker}</div> : null}
      <h2 className={`font-zal text-[34px] font-semibold leading-[1.12] tracking-[-0.025em] md:text-[48px] ${dark ? "text-snow" : "text-graphite"}`}>{title}</h2>
      {sub ? <p className={`mt-4 font-inter text-[16px] leading-relaxed md:text-[17px] ${dark ? "text-ash" : "text-slate"}`}>{sub}</p> : null}
    </div>
  );
}

export function Card({ children, className = "", dark = false }: { children: React.ReactNode; className?: string; dark?: boolean }) {
  return (
    <div
      className={`rounded-[8px] border ${
        dark
          ? "border-white/10 bg-white/[0.04]"
          : "border-line bg-white shadow-[0_1px_0_rgba(11,14,18,0.04),0_24px_60px_-40px_rgba(11,14,18,0.35)]"
      } ${className}`}
    >
      {children}
    </div>
  );
}
