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
export type PriceHistory = { pts: PricePoint[]; full: boolean }; // full = history reaches back the whole window

const WINDOW = 7 * 86_400;
const BATCH = 250;
const MAX_ROUNDS = 3000; // hard cap for very chatty feeds; chart labels the range it actually covers
const MAX_POINTS = 4000; // candles aggregate client-side, so keep (almost) every round

export function usePriceHistory(feed: `0x${string}` | null) {
  const client = usePublicClient({ chainId: MAINNET });
  return useQuery({
    queryKey: ["chainlink-history", feed],
    enabled: !!feed && !!client,
    staleTime: 60_000,
    refetchInterval: 120_000,
    retry: 2,
    queryFn: async (): Promise<PriceHistory> => {
      const [latest, dec] = await client!.multicall({
        multicallAddress: MULTICALL3,
        allowFailure: false,
        contracts: [
          { address: feed!, abi: feedAbi, functionName: "latestRoundData" },
          { address: feed!, abi: feedAbi, functionName: "decimals" },
        ],
      });
      const scale = 10 ** dec;
      const phase = latest[0] >> 64n;
      let next = (latest[0] & ((1n << 64n) - 1n)) - 1n; // walk back within the current phase
      const cutoff = Number(latest[3]) - WINDOW;
      const pts: PricePoint[] = [{ t: Number(latest[3]), p: Number(latest[1]) / scale }];
      let fetched = 0;
      let full = false;
      while (next >= 1n && fetched < MAX_ROUNDS) {
        const n = next < BigInt(BATCH) ? Number(next) : BATCH;
        const ids = Array.from({ length: n }, (_, i) => (phase << 64n) | (next - BigInt(i)));
        const res = await client!.multicall({
          multicallAddress: MULTICALL3,
          allowFailure: true,
          contracts: ids.map((id) => ({ address: feed!, abi: feedAbi, functionName: "getRoundData" as const, args: [id] as const })),
        });
        let reached = false;
        for (const r of res) {
          if (r.status !== "success" || r.result[3] <= 0n || r.result[1] <= 0n) continue;
          const t = Number(r.result[3]);
          if (t < cutoff) { reached = true; continue; }
          pts.push({ t, p: Number(r.result[1]) / scale });
        }
        fetched += n;
        next -= BigInt(n);
        if (reached) { full = true; break; }
      }
      pts.sort((x, y) => x.t - y.t);
      if (pts.length <= MAX_POINTS) return { pts, full };
      const step = pts.length / MAX_POINTS; // even downsample, always keep the latest round
      const out = Array.from({ length: MAX_POINTS - 1 }, (_, i) => pts[Math.floor(i * step)]);
      out.push(pts[pts.length - 1]);
      return { pts: out, full };
    },
  });
}

/** Human label for the span the points actually cover, e.g. "7D" or "2.4D". */
export function spanLabel({ pts, full }: PriceHistory) {
  if (full) return "7D";
  const d = (pts[pts.length - 1].t - pts[0].t) / 86_400;
  if (d >= 1) return `${d.toFixed(1)}D`;
  return `${Math.max(1, Math.round(d * 24))}H`;
}

/** Change vs the last round at or before 24h ago; null when history does not reach back that far. */
export function change24h(h: PriceHistory | undefined) {
  const pts = h?.pts;
  if (!pts || pts.length < 2) return null;
  const last = pts[pts.length - 1];
  const cut = last.t - 86_400;
  const base = [...pts].reverse().find((x) => x.t <= cut);
  return base ? (last.p - base.p) / base.p : null;
}
