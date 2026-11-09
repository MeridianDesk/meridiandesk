"use client";

import { useState } from "react";
import { type Abi, BaseError, formatUnits } from "viem";
import { useAccount, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { ACTIVE_CHAIN_ID } from "@/content/chain";
import { useTxReceipt } from "@/components/tx-receipt";
import { oracleAbi } from "./abi";
import { deployed } from "@/content/deployments";

export const USDG_DEC = 6;
export const WAD = 10n ** 18n;
export const LEV_BPS = { "1×": 10_000, "1.25×": 12_500, "1.5×": 15_000, "2×": 20_000 } as const;

export const fmtUsd = (v: bigint, dec = USDG_DEC, dp = 2) =>
  Number(formatUnits(v, dec)).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
export const fmtPx = (wad: bigint) => fmtUsd(wad, 18, 2);

export const ago = (ts: number) => {
  const s = Math.max(0, Math.floor(Date.now() / 1000) - ts);
  if (s < 90) return `${s}s`;
  if (s < 5400) return `${Math.round(s / 60)}m`;
  if (s < 172800) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
};

/** Wallet is connected AND on the active chain. */
export function useReady() {
  const { address, chainId, status } = useAccount();
  return { address, connected: status === "connected" && !!address, onChain: chainId === ACTIVE_CHAIN_ID };
}

/** OracleRouter.price(token) → WAD price + updatedAt. Reverts (stale / no feed) surface as `error`. */
export function useOraclePrice(token: `0x${string}` | null | undefined) {
  const router = deployed(ACTIVE_CHAIN_ID, "OracleRouter");
  const q = useReadContract({
    address: router ?? undefined,
    abi: oracleAbi,
    functionName: "price",
    args: token ? [token] : undefined,
    chainId: ACTIVE_CHAIN_ID,
    query: { enabled: !!router && !!token, refetchInterval: 15_000, retry: false },
  });
  return { price: q.data?.[0], updatedAt: q.data ? Number(q.data[1]) : undefined, error: q.error, loading: q.isLoading };
}

export const errText = (e: unknown) => {
  if (e instanceof BaseError) {
    const named = e.walk((x) => !!(x as { data?: { errorName?: string } }).data?.errorName) as { data?: { errorName?: string } } | null;
    if (named?.data?.errorName) return named.data.errorName;
    return e.shortMessage;
  }
  return e instanceof Error ? e.message : String(e);
};

/** Loose call shape; ABIs are generated from contracts/out so names/args are checked at review time. */
type WriteArgs = { address: `0x${string}`; abi: Abi | readonly unknown[]; functionName: string; args?: readonly unknown[] };

/**
 * Robinhood Chain is an Arbitrum Orbit chain: the base fee can tick up between estimate and inclusion,
 * and wallets/RPCs sometimes return a cap barely above (or below) it → "max fee per gas less than block base fee".
 * Orbit only ever charges the base fee and refunds the rest, so a 3× headroom costs nothing extra.
 */
async function fees(client: NonNullable<ReturnType<typeof usePublicClient>>) {
  try {
    const blk = await client.getBlock();
    const base = blk.baseFeePerGas ?? (await client.getGasPrice());
    return { maxFeePerGas: base * 3n, maxPriorityFeePerGas: 0n };
  } catch {
    return {};
  }
}

/**
 * Send → wait for receipt → only on status "success" show the receipt popup and refresh reads.
 * Never shows success for a pending or reverted tx.
 */
export function useSendTx() {
  const { writeContractAsync } = useWriteContract();
  const client = usePublicClient({ chainId: ACTIVE_CHAIN_ID });
  const qc = useQueryClient();
  const show = useTxReceipt();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send(tag: string, args: WriteArgs, popup?: { title?: string; summary?: string }) {
    if (!client) return false;
    setBusy(tag);
    setError(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hash = await writeContractAsync({ ...args, chainId: ACTIVE_CHAIN_ID, ...(await fees(client)) } as any);
      const r = await client.waitForTransactionReceipt({ hash });
      if (r.status !== "success") throw new Error("Transaction reverted");
      await qc.invalidateQueries();
      if (popup) show({ hash, chainId: ACTIVE_CHAIN_ID, ...popup });
      return true;
    } catch (e) {
      setError(errText(e));
      return false;
    } finally {
      setBusy(null);
    }
  }
  return { send, busy, error, clearError: () => setError(null) };
}
