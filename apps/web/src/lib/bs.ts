/**
 * Black-Scholes (r = 0, no dividends) for the Options quoter.
 * Shared by the server quote route (authoritative, signed) and the ticket (indicative table).
 * Flat IV, no skew / spread. Mainnet runs a wider IV than testnet so the pool is not underpaid.
 */
import { ACTIVE_CHAIN_ID } from "@/content/chain";

export const DESK_IV = ACTIVE_CHAIN_ID === 4663 ? 0.75 : 0.6;
export const YEAR = 365 * 24 * 3600;

/** Strike offsets offered by the ticket, relative to the oracle mark. */
export const STRIKE_OFFSETS = [-0.1, -0.05, 0, 0.05, 0.1] as const;
/** Expiry tenors in seconds. Contract enforces minTimeToExpiry 1h / maxTimeToExpiry 45d. */
export const TENORS = { "1D": 24 * 3600, "1W": 7 * 24 * 3600, "1M": 30 * 24 * 3600 } as const;
export type Tenor = keyof typeof TENORS;

// Abramowitz-Stegun 7.1.26 normal CDF (|err| < 7.5e-8)
function ncdf(x: number) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp((-x * x) / 2);
  const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}

/** Per-unit premium (USD) and delta. */
export function bs(isCall: boolean, spot: number, strike: number, tYears: number, iv = DESK_IV) {
  if (tYears <= 0 || spot <= 0 || strike <= 0) return { premium: Math.max(0, isCall ? spot - strike : strike - spot), delta: 0 };
  const v = iv * Math.sqrt(tYears);
  const d1 = (Math.log(spot / strike) + (v * v) / 2) / v;
  const d2 = d1 - v;
  return isCall
    ? { premium: spot * ncdf(d1) - strike * ncdf(d2), delta: ncdf(d1) }
    : { premium: strike * ncdf(-d2) - spot * ncdf(-d1), delta: ncdf(d1) - 1 };
}

/** Strike rounded to 0.01 USD, as WAD bigint (matches what the quoter signs). */
export function strikeWad(spotWad: bigint, offset: number) {
  const cents = Math.round((Number(spotWad) / 1e18) * (1 + offset) * 100);
  return BigInt(cents) * 10n ** 16n;
}

/** Expiry rounded up to the next full hour so repeated quotes share one expiry. */
export function expiryFor(tenor: Tenor, nowSec: number) {
  return Math.ceil((nowSec + TENORS[tenor]) / 3600) * 3600;
}
