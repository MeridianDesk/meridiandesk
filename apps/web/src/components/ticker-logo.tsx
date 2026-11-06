import type { ReactNode } from "react";
import {
  siAlibabadotcom, siAmd, siApple, siAtlassian, siBlackberry, siBoeing, siBroadcom, siCircle, siCisco, siCloudflare,
  siCoinbase, siDatadog, siDell, siDigitalocean, siFigma, siFord, siFortinet, siGeneralelectric, siGoogle, siIntel,
  siIntuit, siMcdonalds, siMeta, siMongodb, siNetflix, siNvidia, siPaloaltonetworks, siPalantir, siPaypal, siQualcomm,
  siReddit, siRoblox, siShopify, siSnapchat, siSnowflake, siSpacex, siSupermicro, siTaketwointeractivesoftware, siTesla,
  siUber, siUipath, siUps, siVisa, siZoom,
  type SimpleIcon,
} from "simple-icons";

/**
 * Issuer marks for Stock Token tickers (PM revision 2026-11-06), from simple-icons (CC0 path data;
 * the marks themselves remain their owners' trademarks — used only to identify the underlying stock,
 * no affiliation implied). Curated by ticker, never fuzzy-matched by name. Tickers without a mark in
 * simple-icons (e.g. AMZN, MSFT, ETFs) fall back to the monogram the caller passes in.
 */
const LOGOS: Record<string, SimpleIcon> = {
  AAPL: siApple, AMD: siAmd, AVGO: siBroadcom, BA: siBoeing, BABA: siAlibabadotcom, BB: siBlackberry, COIN: siCoinbase,
  CRCL: siCircle, CSCO: siCisco, DDOG: siDatadog, DELL: siDell, DOCN: siDigitalocean, F: siFord, FIG: siFigma,
  FTNT: siFortinet, GE: siGeneralelectric, GOOGL: siGoogle, GOOG: siGoogle, INTC: siIntel, INTU: siIntuit,
  MCD: siMcdonalds, MDB: siMongodb, META: siMeta, NET: siCloudflare, NFLX: siNetflix, NVDA: siNvidia,
  PANW: siPaloaltonetworks, PATH: siUipath, PLTR: siPalantir, PYPL: siPaypal, QCOM: siQualcomm, RBLX: siRoblox,
  RDDT: siReddit, SHOP: siShopify, SMCI: siSupermicro, SNAP: siSnapchat, SNOW: siSnowflake, SPCX: siSpacex,
  TEAM: siAtlassian, TSLA: siTesla, TTWO: siTaketwointeractivesoftware, UBER: siUber, UPS: siUps, V: siVisa, ZM: siZoom,
};

export const hasLogo = (symbol: string) => symbol.toUpperCase() in LOGOS;

/** Round issuer logo chip; renders `fallback` (monogram) when no mark is mapped. */
export function TickerLogo({ symbol, size = 28, fallback }: { symbol: string; size?: number; fallback: ReactNode }) {
  const icon = LOGOS[symbol.toUpperCase()];
  if (!icon) return <>{fallback}</>;
  const inner = Math.round(size * 0.56);
  const n = parseInt(icon.hex, 16);
  const light = 0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255) > 190; // e.g. Snapchat yellow
  return (
    <span
      role="img"
      aria-label={`${icon.title} logo`}
      className={`inline-grid shrink-0 place-items-center rounded-full ring-1 ring-white/10 ${light ? "bg-void" : "bg-ivory"}`}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 24 24" width={inner} height={inner} fill={`#${icon.hex}`} aria-hidden="true">
        <path d={icon.path} />
      </svg>
    </span>
  );
}
