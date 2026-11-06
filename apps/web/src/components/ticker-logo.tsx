/* eslint-disable @next/next/no-img-element */
import type { ReactNode } from "react";

/**
 * Issuer logos for Stock Token tickers (PM revision 2026-11-06). Files are vendored locally in
 * public/logos/<TICKER>.png (no runtime third-party fetch). Marks remain their owners' trademarks and
 * are used only to identify the underlying stock / ETF issuer — no affiliation implied.
 * Unmapped tickers fall back to the caller's monogram.
 */
const LOGOS = new Set<string>(["AAOI", "AAPL", "ABCL", "ADBE", "AEHR", "AEIS", "ALAB", "AMAT", "AMBA", "AMC", "AMD", "AMKR", "AMZN", "ANET", "APLD", "APP", "ASML", "ASTS", "AUR", "AVAV", "AVGO", "AXON", "AXTI", "BA", "BABA", "BB", "BE", "BMNR", "BND", "BULL", "CBRS", "CCL", "CEG", "CELH", "CIEN", "CLOV", "CLS", "CLSK", "COHR", "COIN", "COST", "CRCL", "CRDO", "CRM", "CRWD", "CRWV", "CSCO", "CTSH", "CVNA", "DDOG", "DELL", "DIS", "DJT", "DOCN", "ELF", "EWT", "EWY", "F", "FICO", "FIG", "FISV", "FIX", "FLNC", "FLY", "FTNT", "FUTU", "GDX", "GE", "GEV", "GLD", "GLW", "GLXY", "GME", "GOOG", "GOOGL", "HII", "HIMS", "HPE", "HWM", "IBM", "IBRX", "INDA", "INFQ", "INOD", "INTC", "INTU", "IONQ", "IREN", "JBL", "JNJ", "JOBY", "JPM", "KLAC", "KSS", "KTOS", "LHX", "LITE", "LLY", "LMT", "LRCX", "LULU", "LUNR", "MCD", "MDB", "META", "MOD", "MPWR", "MRNA", "MRVL", "MSFT", "MSTR", "MTSI", "MU", "MXL", "NAVN", "NBIS", "NET", "NFLX", "NNE", "NOW", "NU", "NVDA", "NVTS", "OKLO", "ON", "ONTO", "ORCL", "OUST", "P", "PANW", "PATH", "PENG", "PFE", "PL", "PLTR", "POET", "POWL", "PR", "PWR", "PYPL", "QBTS", "QCOM", "QNT", "QQQ", "QUBT", "RBLX", "RCAT", "RDDT", "RDW", "RGTI", "RIVN", "RKLB", "RUN", "SATS", "SCHD", "SGOV", "SHOP", "SHY", "SIMO", "SKHY", "SLS", "SLV", "SMCI", "SMH", "SMR", "SNAP", "SNDK", "SNOW", "SOFI", "SOUN", "SOXX", "SPCX", "SPMO", "SPY", "TE", "TEAM", "TEM", "TER", "TSEM", "TSLA", "TSM", "TTD", "TTWO", "UBER", "UMC", "UNH", "UPS", "USAR", "USO", "V", "VICR", "VRT", "VSAT", "VST", "VTI", "WDAY", "WDC", "WULF", "WYFI", "XLK", "XNDU", "XOM", "ZETA", "ZM", "ZS"]);

export const hasLogo = (symbol: string) => LOGOS.has(symbol.toUpperCase());

export function TickerLogo({ symbol, size = 28, fallback }: { symbol: string; size?: number; fallback: ReactNode }) {
  const s = symbol.toUpperCase();
  if (!LOGOS.has(s)) return <>{fallback}</>;
  return (
    <img
      src={`/logos/${s}.png`}
      alt={`${s} logo`}
      role="img"
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      className="inline-block shrink-0 rounded-full bg-[#1c1c1e] object-cover ring-1 ring-white/10"
      style={{ width: size, height: size }}
    />
  );
}
