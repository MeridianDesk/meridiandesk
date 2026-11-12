"use client";

import { useQuery } from "@tanstack/react-query";
import type { RefPrices } from "@/app/api/prices/route";

/** Live Stock Token reference prices (Robinhood Stock Token API via /api/prices), refreshed every 15 s. */
export function useRefPrices() {
  return useQuery({
    queryKey: ["ref-prices"],
    queryFn: async (): Promise<RefPrices> => {
      const r = await fetch("/api/prices");
      if (!r.ok) throw new Error(`prices ${r.status}`);
      return r.json();
    },
    refetchInterval: 15_000,
    staleTime: 10_000,
  });
}

export const fmtVol = (v: number) =>
  v >= 1e9 ? `${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}K` : v.toFixed(0);

export const fmtRef = (p: number) =>
  p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: p < 1 ? 4 : 2 });
