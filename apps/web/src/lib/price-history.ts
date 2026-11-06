"use client";

import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";

/**
 * Price history straight from the Chainlink proxy on Robinhood Chain MAINNET (4663): the last N
 * on-chain rounds via getRoundData, batched in one Multicall3 call. No third-party price API and
 * no synthetic points — if the read fails the chart shows its empty state.
 * Round ids are phase-encoded (phaseId << 64 | aggregatorRoundId); we walk back within the
 * current phase only.
 */
const MAINNET = 4663;
const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11" as const;
const feedAbi = [
  { type: "function", name: "latestRoundData", stateMutability: "view", inputs: [], outputs: [
    { name: "roundId", type: "uint80" }, { name: "answer", type: "int256" }, { name: "startedAt", type: "uint256" },
    { name: "updatedAt", type: "uint256" }, { name: "answeredInRound", type: "uint80" }] },
  { type: "function", name: "getRoundData", stateMutability: "view", inputs: [{ name: "roundId", type: "uint80" }], outputs: [
    { name: "roundId", type: "uint80" }, { name: "answer", type: "int256" }, { name: "startedAt", type: "uint256" },
    { name: "updatedAt", type: "uint256" }, { name: "answeredInRound", type: "uint80" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
] as const;

export type PricePoint = { t: number; p: number };

export function usePriceHistory(feed: `0x${string}` | null, rounds = 240) {
  const client = usePublicClient({ chainId: MAINNET });
  return useQuery({
    queryKey: ["chainlink-history", feed, rounds],
    enabled: !!feed && !!client,
    staleTime: 60_000,
    refetchInterval: 120_000,
    retry: 1,
    queryFn: async (): Promise<PricePoint[]> => {
      const [latest, dec] = await client!.multicall({
        multicallAddress: MULTICALL3,
        allowFailure: false,
        contracts: [
          { address: feed!, abi: feedAbi, functionName: "latestRoundData" },
          { address: feed!, abi: feedAbi, functionName: "decimals" },
        ],
      });
      const rid = latest[0];
      const phase = rid >> 64n;
      const agg = rid & ((1n << 64n) - 1n);
      const n = agg - 1n < BigInt(rounds) ? Number(agg - 1n) : rounds;
      const ids = Array.from({ length: n }, (_, i) => (phase << 64n) | (agg - BigInt(n - i)));
      const res = await client!.multicall({
        multicallAddress: MULTICALL3,
        allowFailure: true,
        contracts: ids.map((id) => ({ address: feed!, abi: feedAbi, functionName: "getRoundData" as const, args: [id] as const })),
      });
      const scale = 10 ** dec;
      const pts = res
        .map((r) => (r.status === "success" && r.result[3] > 0n && r.result[1] > 0n ? { t: Number(r.result[3]), p: Number(r.result[1]) / scale } : null))
        .filter((x): x is PricePoint => !!x);
      pts.push({ t: Number(latest[3]), p: Number(latest[1]) / scale });
      return pts.sort((a, b) => a.t - b.t);
    },
  });
}

/** Change vs the last round at or before 24h ago; null when history does not reach back that far. */
export function change24h(pts: PricePoint[] | undefined) {
  if (!pts || pts.length < 2) return null;
  const last = pts[pts.length - 1];
  const cut = last.t - 86_400;
  const base = [...pts].reverse().find((x) => x.t <= cut);
  return base ? (last.p - base.p) / base.p : null;
}
