import raw from "./deployments.json";
import type { ChainId } from "./chain";

/**
 * Meridian contract addresses per network.
 * Source of truth: contracts/deployments/<chainId>.json written by Deploy.s.sol.
 * Refresh with `npm run sync:deployments` after every deploy — never type addresses by hand.
 * Missing entry = not deployed; the UI shows "Not deployed", never a placeholder address.
 */
export const contractList = [
  { key: "MarketRegistry", role: "Market listings + desk status" },
  { key: "OracleRouter", role: "Chainlink price reads" },
  { key: "LiquidityPool", role: "Shared USDG pool" },
  { key: "PerpsEngine", role: "Perps positions, max 2×" },
  { key: "OptionsEngine", role: "Options buy-to-open" },
  { key: "CrossMarginAccount", role: "Common Ledger · Cross margin account" },
  { key: "CrossOptionBook", role: "Common Ledger · Cross long options" },
  { key: "usdg", role: "Collateral token (USDG)" },
] as const;

export type ContractKey = (typeof contractList)[number]["key"];
/** A market listed on-chain by SetupTestnet / ListMarkets (deployments/listed.<chainId>.json). */
export type ListedMarket = {
  token: `0x${string}`;
  /** Feed registered in MarketRegistry. On testnet: a MirrorFeed (illustrative copy of mainnet Chainlink). */
  feed: `0x${string}` | null;
  /** Mainnet Chainlink proxy the testnet mirror copies, null on mainnet. */
  sourceFeed: `0x${string}` | null;
  perps: boolean;
};
type Book = Partial<Record<ContractKey, `0x${string}`>> & { markets?: Record<string, ListedMarket> };

const book = raw as unknown as Record<string, Book>;
const isAddr = (a: unknown): a is `0x${string}` => typeof a === "string" && /^0x[0-9a-fA-F]{40}$/.test(a);

export function deployed(chainId: ChainId, key: ContractKey): `0x${string}` | null {
  const a = book[String(chainId)]?.[key];
  return isAddr(a) ? a : null;
}

export function listed(chainId: ChainId, symbol: string): ListedMarket | null {
  const m = book[String(chainId)]?.markets?.[symbol.toUpperCase()];
  return m && isAddr(m.token) ? m : null;
}

/** Symbol for a listed token address (case-insensitive), or null. */
export function symbolOf(chainId: ChainId, token: string): string | null {
  const ms = book[String(chainId)]?.markets ?? {};
  return Object.keys(ms).find((s) => ms[s].token.toLowerCase() === token.toLowerCase()) ?? null;
}
