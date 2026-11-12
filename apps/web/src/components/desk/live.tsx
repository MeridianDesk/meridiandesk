"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { erc20Abi, maxUint256, parseAbiItem, parseUnits } from "viem";
import { usePublicClient, useReadContract, useReadContracts } from "wagmi";
import { app, testnetDesk as t } from "@/content/copy";
import { ACTIVE_CHAIN_ID, addressUrl, chains, txUrl } from "@/content/chain";
import { deployed, symbolOf, type ListedMarket } from "@/content/deployments";
import { perpsAbi, poolAbi, testUsdgAbi } from "@/lib/abi";
import { ago, fmtPx, fmtUsd, LEV_BPS, USDG_DEC, useOraclePrice, useReady, useSendTx } from "@/lib/onchain";
import { Row } from "./bits";

const noop = () => () => {};
export const useMounted = () => useSyncExternalStore(noop, () => true, () => false);

const C = ACTIVE_CHAIN_ID;
const PERPS = deployed(C, "PerpsEngine");
const POOL = deployed(C, "LiquidityPool");
const USDG = deployed(C, "usdg");
const BPS = 10_000n;
const SLIPPAGE_BPS = 50n; // 0.5% guard on the oracle mark

const primary = "h-11 w-full rounded-[4px] bg-dawn font-inter text-[14px] font-medium text-void hover:bg-dawn-hi disabled:cursor-not-allowed disabled:opacity-50";
const ghost = "rounded-[4px] border border-white/10 px-2.5 py-1.5 font-inter text-[12px] text-haze hover:border-white/30 hover:text-ivory disabled:opacity-50";

const parse = (v: string) => {
  try { return v ? parseUnits(v as `${number}`, USDG_DEC) : 0n; } catch { return 0n; }
};

export function useUsdg(spender: `0x${string}` | null) {
  const { address } = useReady();
  const q = useReadContracts({
    contracts: [
      { address: USDG!, abi: erc20Abi, functionName: "balanceOf", args: [address!], chainId: C },
      { address: USDG!, abi: erc20Abi, functionName: "allowance", args: [address!, spender!], chainId: C },
    ],
    query: { enabled: !!address && !!USDG && !!spender },
  });
  return { balance: q.data?.[0]?.result as bigint | undefined, allowance: q.data?.[1]?.result as bigint | undefined };
}

/** Public mint on the testnet mock token. Never rendered on mainnet. */
export function FaucetButton() {
  const { address, connected, onChain } = useReady();
  const tx = useSendTx();
  if (C !== 46630 || !USDG || !connected || !onChain) return null;
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={!!tx.busy}
        onClick={() => tx.send("faucet", { address: USDG, abi: testUsdgAbi, functionName: "mint", args: [address!, 1_000n * 10n ** 6n] }, { title: t.faucet, summary: t.faucetNote })}
        className="font-inter text-[11.5px] text-dawn hover:text-dawn-hi disabled:opacity-50"
      >
        {tx.busy ? t.sending : t.faucet}
      </button>
      {tx.error ? <span role="alert" className="font-inter text-[11px] text-dawn">{tx.error}</span> : null}
    </span>
  );
}

export function Gate({ children }: { children: React.ReactNode }) {
  const mounted = useMounted();
  const { connected, onChain } = useReady();
  if (!mounted || !connected) return <p className="rounded-[5px] border border-white/[0.08] px-3 py-2.5 font-inter text-[12.5px] text-haze">{t.connectToTrade}</p>;
  if (!onChain) return <p className="rounded-[5px] border border-dawn/30 px-3 py-2.5 font-inter text-[12.5px] text-dawn-hi">{t.wrongChain}</p>;
  return <>{children}</>;
}

/** Live mark for the market header. */
export function LiveMark({ lm }: { lm: ListedMarket }) {
  const { price, updatedAt, error } = useOraclePrice(lm.token);
  return (
    <div className="relative max-w-[420px] px-6 text-center">
      <p className="font-plex text-[11px] uppercase tracking-[0.14em] text-smoke">Oracle mark</p>
      <p className="mt-2 font-zal text-[34px] font-semibold tracking-[-0.03em] text-ivory">{price ? `$${fmtPx(price)}` : "—"}</p>
      <p className="mt-1 font-plex text-[11px] text-haze">{error ? t.stale : updatedAt ? t.updated(ago(updatedAt)) : "—"}</p>
      <p className="mt-3 font-inter text-[12px] leading-relaxed text-smoke">{t.illustrative}</p>
    </div>
  );
}

export function useMarketStats(token: `0x${string}`) {
  const q = useReadContract({ address: PERPS ?? undefined, abi: perpsAbi, functionName: "marketState", args: [token], chainId: C, query: { enabled: !!PERPS, refetchInterval: 30_000 } });
  return q.data ? { oi: q.data[0] + q.data[1] } : null;
}

export function LivePerpsTicket({ symbol, lm }: { symbol: string; lm: ListedMarket }) {
  const [side, setSide] = useState<"long" | "short">("long");
  const [lev, setLev] = useState<keyof typeof LEV_BPS>("1×");
  const [v, setV] = useState("");
  const { price, error: pxErr } = useOraclePrice(lm.token);
  const { balance, allowance } = useUsdg(PERPS);
  const tx = useSendTx();
  const cfgQ = useReadContracts({
    contracts: [
      { address: PERPS!, abi: perpsAbi, functionName: "marketConfig", args: [lm.token], chainId: C },
      { address: PERPS!, abi: perpsAbi, functionName: "minCollateral", chainId: C },
      { address: PERPS!, abi: perpsAbi, functionName: "maxCollateralPerPosition", chainId: C },
    ],
    query: { enabled: !!PERPS },
  });
  const cfg = cfgQ.data?.[0]?.result as readonly [bigint, bigint, bigint, number, number, number, number, boolean, boolean] | undefined;
  const minC = cfgQ.data?.[1]?.result as bigint | undefined;
  const maxC = cfgQ.data?.[2]?.result as bigint | undefined;

  const c = parse(v);
  const L = BigInt(LEV_BPS[lev]);
  const openFee = BigInt(cfg?.[3] ?? 0);
  const size = c > 0n && cfg ? (c * L * BPS) / (BPS * BPS + L * openFee) : 0n;
  const fee = size > 0n ? c - (size * BPS + L - 1n) / L : 0n;
  const net = c - fee;
  const maint = cfg ? (size * BigInt(cfg[5])) / BPS : 0n;
  const liq = price && size > 0n ? (side === "long" ? price - (price * (net - maint)) / size : price + (price * (net - maint)) / size) : undefined;

  const inRange = minC !== undefined && maxC !== undefined && c >= minC && c <= maxC;
  const enough = balance !== undefined && c <= balance;
  const needsApprove = allowance !== undefined && c > 0n && allowance < c;
  const canSend = !!price && !pxErr && inRange && enough && !tx.busy && !!cfg && !cfg[7];

  const accept = price ? (side === "long" ? (price * (BPS + SLIPPAGE_BPS)) / BPS : (price * (BPS - SLIPPAGE_BPS)) / BPS) : 0n;
  const label = `${side === "long" ? "Long" : "Short"} ${symbol} ${lev}`;

  const submit = async () => {
    if (needsApprove) {
      // one-time approval, then continue straight into the open (second wallet prompt)
      if (!(await tx.send("approve", { address: USDG!, abi: erc20Abi, functionName: "approve", args: [PERPS!, maxUint256] }))) return;
    }
    const ok = await tx.send("open", { address: PERPS!, abi: perpsAbi, functionName: "open", args: [lm.token, side === "long", c, LEV_BPS[lev], accept] }, { title: t.openedTitle, summary: `${label} · ${fmtUsd(size)} USDG notional` });
    if (ok) setV("");
  };

  const seg = (on: boolean, tone: "dawn" | "ivory" = "dawn") =>
    `h-9 flex-1 rounded-[4px] border font-inter text-[13.5px] ${on ? (tone === "dawn" ? "border-dawn bg-dawn text-void" : "border-ivory bg-ivory text-void") : "border-white/10 text-haze hover:border-white/30 hover:text-ivory"}`;

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5" role="group" aria-label="Side">
        <button type="button" aria-pressed={side === "long"} className={seg(side === "long")} onClick={() => setSide("long")}>Long</button>
        <button type="button" aria-pressed={side === "short"} className={seg(side === "short", "ivory")} onClick={() => setSide("short")}>Short</button>
      </div>
      <div>
        <label htmlFor="perps-size" className="mb-1.5 flex justify-between font-inter text-[12.5px] text-haze">
          <span>{t.sizeLabel}</span>
          <span className="font-plex text-[11px] text-smoke">Balance {balance !== undefined ? fmtUsd(balance) : "—"}</span>
        </label>
        <div className="flex h-10 items-center rounded-[4px] border border-white/10 bg-void px-3 focus-within:border-dawn/60">
          <input id="perps-size" inputMode="decimal" value={v} onChange={(e) => setV(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0.00" className="h-full w-full bg-transparent font-plex text-[14px] text-ivory placeholder:text-smoke focus:outline-none" />
          <span className="font-plex text-[12px] text-haze">{C === 46630 ? "tUSDG" : "USDG"}</span>
        </div>
        <div className="mt-1 flex justify-between gap-2">
          <span className="font-plex text-[11px] text-smoke">{minC !== undefined && maxC !== undefined ? t.range(fmtUsd(minC, USDG_DEC, 0), fmtUsd(maxC, USDG_DEC, 0)) : "—"}</span>
          <FaucetButton />
        </div>
      </div>
      <div>
        <div className="mb-1.5 flex justify-between font-inter text-[12.5px] text-haze">
          <span id="lev-label">Leverage</span>
          <span className="font-plex text-[11px] text-smoke">{app.leverageHelper}</span>
        </div>
        {/* Exactly four settings. No slider, no free input (§8.4). */}
        <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-labelledby="lev-label">
          {app.leverageOptions.map((l) => (
            <button key={l} type="button" role="radio" aria-checked={lev === l} onClick={() => setLev(l)} className={seg(lev === l)}>{l}</button>
          ))}
        </div>
      </div>
      <div className="rounded-[6px] border border-white/[0.07] bg-void/60 px-3 py-1.5">
        <Row k="Entry (oracle mark)" v={price ? fmtPx(price) : "—"} muted={!price} />
        <Row k={t.notional} v={size > 0n ? `${fmtUsd(size)} USDG` : "—"} muted={size === 0n} />
        <Row k="Est. liquidation price" v={liq !== undefined && liq > 0n ? fmtPx(liq) : "—"} muted={liq === undefined} />
        <Row k="Open fee" v={size > 0n ? `${fmtUsd(fee)} USDG` : cfg ? `${cfg[3] / 100}%` : "—"} />
        <Row k="Funding (periodic)" v="Skew-based" />
        <Row k="Margin mode" v="Isolated" />
      </div>
      <p className="flex gap-2 rounded-[5px] border border-dawn/20 bg-dawn/[0.05] px-3 py-2 font-inter text-[12.5px] text-dawn-hi" role="note">
        <span aria-hidden="true">!</span>
        {app.liqWarning}
      </p>
      <Gate>
        <div className="space-y-2">
          <button type="button" disabled={!canSend} onClick={submit} className={primary}>
            {tx.busy === "approve" ? t.approving : tx.busy ? t.sending : needsApprove ? t.approve : label}
          </button>
          {pxErr ? <p className="font-inter text-[11.5px] text-dawn">{t.stale}</p> : null}
          {tx.error ? <p role="alert" className="font-inter text-[11.5px] text-dawn">{t.failed} {tx.error}</p> : null}
        </div>
      </Gate>
    </div>
  );
}

type Pos = { owner: `0x${string}`; openedAt: bigint; leverageBps: number; isLong: boolean; open: boolean; token: `0x${string}`; collateral: bigint; size: bigint; entryPrice: bigint; entryFunding: bigint };

function PositionRow({ id, p }: { id: bigint; p: Pos }) {
  const { price } = useOraclePrice(p.token);
  const tx = useSendTx();
  const h = useReadContracts({
    contracts: [
      { address: PERPS!, abi: perpsAbi, functionName: "positionHealth", args: [id], chainId: C },
      { address: PERPS!, abi: perpsAbi, functionName: "liquidationPrice", args: [id], chainId: C },
    ],
    query: { refetchInterval: 15_000 },
  });
  const health = h.data?.[0]?.result as readonly [bigint, bigint, bigint, bigint, boolean] | undefined;
  const liq = h.data?.[1]?.result as bigint | undefined;
  const sym = symbolOf(C, p.token) ?? "—";
  const accept = price ? (p.isLong ? (price * (BPS - SLIPPAGE_BPS)) / BPS : (price * (BPS + SLIPPAGE_BPS)) / BPS) : 0n;
  const pnl = health?.[0];
  const td = "px-3 py-2.5 font-plex text-[12.5px] whitespace-nowrap";
  return (
    <tr className="border-t border-white/[0.05]">
      <td className={`${td} text-ivory`}>{sym} <span className={p.isLong ? "text-dawn" : "text-ivory/70"}>{p.isLong ? "Long" : "Short"}</span> {p.leverageBps / 10_000}×</td>
      <td className={`${td} text-right text-ivory`}>{fmtUsd(p.size)}</td>
      <td className={`${td} text-right text-haze`}>{fmtUsd(p.collateral)}</td>
      <td className={`${td} text-right text-haze`}>{fmtPx(p.entryPrice)}</td>
      <td className={`${td} text-right text-haze`}>{price ? fmtPx(price) : "—"}</td>
      <td className={`${td} text-right ${pnl === undefined ? "text-smoke" : pnl >= 0n ? "text-dawn" : "text-ivory/70"}`}>{pnl === undefined ? "—" : `${pnl >= 0n ? "+" : "−"}${fmtUsd(pnl >= 0n ? pnl : -pnl)}`}</td>
      <td className={`${td} text-right text-haze`}>{liq !== undefined && liq > 0n ? fmtPx(liq) : "—"}</td>
      <td className={`${td} text-right`}>
        <button type="button" disabled={!price || !!tx.busy} onClick={() => tx.send("close", { address: PERPS!, abi: perpsAbi, functionName: "close", args: [id, accept] }, { title: t.closedTitle, summary: `${sym} ${p.isLong ? "Long" : "Short"} · #${id}` })} className={ghost}>
          {tx.busy ? t.closing : t.close}
        </button>
        {tx.error ? <span role="alert" className="mt-1 block font-inter text-[11px] text-dawn">{tx.error}</span> : null}
      </td>
    </tr>
  );
}

/** The wallet's Perps position ids + structs (open and closed), read from PerpsEngine. */
function useWalletPositions() {
  const { address, onChain } = useReady();
  const ids = useReadContract({ address: PERPS ?? undefined, abi: perpsAbi, functionName: "positionsOf", args: address ? [address] : undefined, chainId: C, query: { enabled: !!PERPS && !!address && onChain, refetchInterval: 15_000 } });
  const list = (ids.data ?? []) as readonly bigint[];
  const pos = useReadContracts({
    contracts: list.map((id) => ({ address: PERPS!, abi: perpsAbi, functionName: "getPosition" as const, args: [id] as const, chainId: C })),
    query: { enabled: list.length > 0, refetchInterval: 15_000 },
  });
  const all = list.map((id, i) => ({ id, p: pos.data?.[i]?.result as Pos | undefined })).filter((x): x is { id: bigint; p: Pos } => !!x.p);
  return { all, loading: ids.isLoading || pos.isLoading };
}

export const th = "px-3 py-2 text-right font-plex text-[10.5px] font-normal uppercase tracking-[0.08em] text-smoke";

/** Open Perps positions of the connected wallet; `token` narrows to one market. */
export function LivePositions({ token }: { token?: string | null }) {
  const mounted = useMounted();
  const { connected, onChain } = useReady();
  const { all, loading } = useWalletPositions();
  if (!mounted || !connected || !onChain || !PERPS) return null;
  const open = all.filter((x) => x.p.open && (!token || x.p.token.toLowerCase() === token.toLowerCase())).reverse();
  if (!open.length) return <p className="px-5 py-6 font-inter text-[13px] text-haze">{loading ? "—" : t.noPositions}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr>
            <th className={`${th} text-left`}>Market</th><th className={th}>Size</th><th className={th}>Collateral</th><th className={th}>Entry</th><th className={th}>Mark</th><th className={th}>PnL</th><th className={th}>Liq.</th><th className={th}><span className="sr-only">Action</span></th>
          </tr>
        </thead>
        <tbody>{open.map(({ id, p }) => <PositionRow key={String(id)} id={id} p={p} />)}</tbody>
      </table>
    </div>
  );
}

const evOpened = parseAbiItem("event PositionOpened(uint256 indexed id, address indexed owner, address indexed token, bool isLong, uint16 leverageBps, uint256 collateral, uint256 size, uint256 price, uint256 fee)");
const evClosed = parseAbiItem("event PositionClosed(uint256 indexed id, address indexed owner, uint256 price, int256 pnl, uint256 funding, uint256 fee, uint256 paidOut)");
const evLiq = parseAbiItem("event PositionLiquidated(uint256 indexed id, address indexed owner, address indexed keeper, uint256 price, int256 equity, uint256 keeperFee, uint256 paidOut)");
export const MAX_RANGE = 49_000n; // public RPC caps eth_getLogs at 50k blocks

type HistRow = { kind: "Open" | "Close" | "Liquidated"; id: string; block: string; tx: string; price: string; pnl?: string; fee: string; paidOut?: string; collateral?: string };
type HistCache = { from: string; to: string; rows: HistRow[] };

/**
 * Wallet trade history from PerpsEngine events. Scans only from the wallet's first position
 * (estimated from openedAt) in 49k-block chunks, caching scanned range + rows in localStorage.
 * Fine for testnet; mainnet should read from an indexer instead.
 */
function usePerpsHistory() {
  const { address, onChain } = useReady();
  const client = usePublicClient({ chainId: C });
  const { all } = useWalletPositions();
  const firstTs = all.length ? Number(all.reduce((m, x) => (x.p.openedAt < m ? x.p.openedAt : m), all[0].p.openedAt)) : 0;
  const key = address ? `meridian.hist.${C}.${PERPS}.${address.toLowerCase()}` : null;
  const [state, setState] = useState<{ key: string | null; rows: HistRow[]; scanning: boolean; error?: string }>({ key: null, rows: [], scanning: false });

  useEffect(() => {
    if (!client || !key || !address || !PERPS || !onChain || !firstTs) return;
    let stop = false;
    const run = async () => {
      let cache: HistCache | null = null;
      try { cache = JSON.parse(localStorage.getItem(key) ?? "null"); } catch {}
      const latest = await client.getBlock();
      const head = latest.number;
      let from: bigint;
      if (cache && BigInt(cache.to) < head) from = BigInt(cache.to) + 1n;
      else if (cache) { setState({ key, rows: cache.rows, scanning: false }); return; }
      else {
        // estimate the block of the first open from timestamps, with a safety margin
        const back = await client.getBlock({ blockNumber: head > 200_000n ? head - 200_000n : 0n });
        const spb = Number(latest.timestamp - back.timestamp) / Number(head - back.number || 1n);
        const est = head - BigInt(Math.ceil(((Number(latest.timestamp) - firstTs) / spb) * 1.1 + 2000));
        from = est > 0n ? est : 0n;
      }
      let rows = cache?.rows ?? [];
      setState({ key, rows, scanning: true });
      const args = { owner: address };
      for (let a = from; a <= head && !stop; a += MAX_RANGE + 1n) {
        const b = a + MAX_RANGE > head ? head : a + MAX_RANGE;
        const [o, c, l] = await Promise.all([
          client.getLogs({ address: PERPS!, event: evOpened, args, fromBlock: a, toBlock: b }),
          client.getLogs({ address: PERPS!, event: evClosed, args, fromBlock: a, toBlock: b }),
          client.getLogs({ address: PERPS!, event: evLiq, args, fromBlock: a, toBlock: b }),
        ]);
        rows = rows.concat(
          o.map((e) => ({ kind: "Open" as const, id: String(e.args.id), block: String(e.blockNumber), tx: e.transactionHash, price: String(e.args.price), fee: String(e.args.fee), collateral: String(e.args.collateral) })),
          c.map((e) => ({ kind: "Close" as const, id: String(e.args.id), block: String(e.blockNumber), tx: e.transactionHash, price: String(e.args.price), pnl: String(e.args.pnl), fee: String(e.args.fee), paidOut: String(e.args.paidOut) })),
          l.map((e) => ({ kind: "Liquidated" as const, id: String(e.args.id), block: String(e.blockNumber), tx: e.transactionHash, price: String(e.args.price), pnl: String(e.args.equity), fee: String(e.args.keeperFee), paidOut: String(e.args.paidOut) })),
        );
        const seen = new Set<string>();
        rows = rows.filter((r) => { const k = r.tx + r.kind + r.id; if (seen.has(k)) return false; seen.add(k); return true; });
        localStorage.setItem(key, JSON.stringify({ from: String(cache?.from ?? from), to: String(b), rows } satisfies HistCache));
        if (!stop) setState({ key, rows, scanning: b < head });
      }
    };
    run().catch((e) => !stop && setState((s) => ({ ...s, key, scanning: false, error: (e as { shortMessage?: string }).shortMessage ?? String(e) })));
    const iv = setInterval(() => run().catch(() => {}), 30_000);
    return () => { stop = true; clearInterval(iv); };
  }, [client, key, address, onChain, firstTs]);

  const byId = new Map(all.map((x) => [String(x.id), x.p]));
  const rows = state.key === key ? state.rows : [];
  return { rows: [...rows].sort((a, b) => Number(BigInt(b.block) - BigInt(a.block))), byId, scanning: state.scanning, error: state.error, hasPositions: all.length > 0 };
}

/** Open / close / liquidation events of the connected wallet; `token` narrows to one market. */
export function LiveHistory({ token }: { token?: string | null }) {
  const mounted = useMounted();
  const { connected, onChain } = useReady();
  const { rows, byId, scanning, error, hasPositions } = usePerpsHistory();
  if (!mounted || !connected || !onChain || !PERPS) return null;
  const list = rows.filter((r) => !token || byId.get(r.id)?.token.toLowerCase() === token.toLowerCase());
  if (!list.length) return <p className="px-5 py-6 font-inter text-[13px] text-haze">{error ? `History unavailable: ${error}` : scanning ? "Loading history…" : hasPositions || !token ? t.noHistory : t.noHistory}</p>;
  const td = "px-3 py-2.5 font-plex text-[12.5px] whitespace-nowrap";
  const usd = (v?: string) => (v === undefined ? "—" : fmtUsd(BigInt(v)));
  const signed = (v?: string) => { if (v === undefined) return "—"; const n = BigInt(v); return `${n >= 0n ? "+" : "−"}${fmtUsd(n >= 0n ? n : -n)}`; };
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr>
            <th className={`${th} text-left`}>Market</th><th className={`${th} text-left`}>Event</th><th className={th}>Price</th><th className={th}>Collateral</th><th className={th}>PnL / equity</th><th className={th}>Fee</th><th className={th}>Paid out</th><th className={th}>Tx</th>
          </tr>
        </thead>
        <tbody>
          {list.map((r) => {
            const p = byId.get(r.id);
            return (
              <tr key={r.tx + r.kind + r.id} className="border-t border-white/[0.05]">
                <td className={`${td} text-ivory`}>{p ? symbolOf(C, p.token) ?? "—" : "—"} {p ? <span className={p.isLong ? "text-dawn" : "text-ivory/70"}>{p.isLong ? "Long" : "Short"}</span> : null} {p ? `${p.leverageBps / 10_000}×` : ""} <span className="text-smoke">#{r.id}</span></td>
                <td className={`${td} ${r.kind === "Liquidated" ? "text-dawn" : "text-haze"}`}>{r.kind}</td>
                <td className={`${td} text-right text-haze`}>{fmtPx(BigInt(r.price))}</td>
                <td className={`${td} text-right text-haze`}>{usd(r.collateral)}</td>
                <td className={`${td} text-right ${r.pnl === undefined ? "text-smoke" : BigInt(r.pnl) >= 0n ? "text-dawn" : "text-ivory/70"}`}>{signed(r.pnl)}</td>
                <td className={`${td} text-right text-haze`}>{usd(r.fee)}</td>
                <td className={`${td} text-right text-haze`}>{usd(r.paidOut)}</td>
                <td className={`${td} text-right`}><a href={txUrl(r.tx)} target="_blank" rel="noreferrer" className="text-haze underline decoration-white/20 underline-offset-4 hover:text-ivory">{r.tx.slice(0, 8)}…</a></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {scanning ? <p className="px-5 py-2 font-inter text-[11px] text-smoke">Loading older events…</p> : null}
    </div>
  );
}

/** Shared LP pool (ERC-4626) — deposit / withdraw-all with test USDG. */
export function PoolPanel() {
  const { address } = useReady();
  const [v, setV] = useState("");
  const tx = useSendTx();
  const { balance, allowance } = useUsdg(POOL);
  const q = useReadContracts({
    contracts: [
      { address: POOL!, abi: poolAbi, functionName: "totalAssets", chainId: C },
      { address: POOL!, abi: poolAbi, functionName: "freeLiquidity", chainId: C },
      { address: POOL!, abi: poolAbi, functionName: "utilizationBps", chainId: C },
      { address: POOL!, abi: poolAbi, functionName: "maxRedeem", args: [address ?? "0x0000000000000000000000000000000000000000"], chainId: C },
      { address: POOL!, abi: poolAbi, functionName: "balanceOf", args: [address ?? "0x0000000000000000000000000000000000000000"], chainId: C },
    ],
    query: { enabled: !!POOL, refetchInterval: 30_000 },
  });
  const r = (i: number) => q.data?.[i]?.result as bigint | undefined;
  const shares = r(4);
  const mine = useReadContract({ address: POOL ?? undefined, abi: poolAbi, functionName: "convertToAssets", args: [shares ?? 0n], chainId: C, query: { enabled: !!POOL && shares !== undefined } });
  const c = parse(v);
  const needsApprove = allowance !== undefined && c > 0n && allowance < c;
  const util = r(2);

  return (
    <section aria-label={t.poolTitle} className="rounded-[8px] border border-white/[0.08] bg-char">
      <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-3">
        <h2 className="font-zal text-[15px] font-semibold tracking-[-0.01em] text-ivory">{t.poolTitle}</h2>
        {POOL ? <a href={addressUrl(POOL)} target="_blank" rel="noreferrer" className="font-plex text-[11px] text-haze hover:text-dawn">{chains[C].short} ↗</a> : null}
      </div>
      <dl className="grid grid-cols-2 gap-px bg-white/[0.05] md:grid-cols-4">
        {[
          [t.poolAssets, r(0) !== undefined ? fmtUsd(r(0)!) : "—"],
          [t.freeLiquidity, r(1) !== undefined ? fmtUsd(r(1)!) : "—"],
          [t.utilization, util !== undefined ? `${(Number(util) / 100).toFixed(2)}%` : "—"],
          [t.yourShare, address && mine.data !== undefined ? fmtUsd(mine.data) : "—"],
        ].map(([k, val]) => (
          <div key={k} className="bg-char px-5 py-4">
            <dt className="font-plex text-[10.5px] uppercase tracking-[0.08em] text-smoke">{k}</dt>
            <dd className="mt-1 font-plex text-[16px] text-ivory">{val}</dd>
          </div>
        ))}
      </dl>
      <div className="space-y-3 px-5 py-4">
        <p className="font-inter text-[12.5px] leading-relaxed text-haze">{t.poolNote}</p>
        <Gate>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex h-10 min-w-[200px] flex-1 items-center rounded-[4px] border border-white/10 bg-void px-3 focus-within:border-dawn/60">
              <input aria-label="Deposit amount" inputMode="decimal" value={v} onChange={(e) => setV(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0.00" className="h-full w-full bg-transparent font-plex text-[14px] text-ivory placeholder:text-smoke focus:outline-none" />
              <span className="font-plex text-[12px] text-haze">{C === 46630 ? "tUSDG" : "USDG"}</span>
            </div>
            <button
              type="button"
              disabled={!!tx.busy || c === 0n || balance === undefined || c > balance}
              onClick={async () => {
                if (needsApprove && !(await tx.send("approve", { address: USDG!, abi: erc20Abi, functionName: "approve", args: [POOL!, maxUint256] }))) return;
                if (await tx.send("deposit", { address: POOL!, abi: poolAbi, functionName: "deposit", args: [c, address!] }, { title: t.deposit, summary: `${fmtUsd(c)} test USDG → pool` })) setV("");
              }}
              className="h-10 rounded-[4px] bg-dawn px-4 font-inter text-[13.5px] font-medium text-void hover:bg-dawn-hi disabled:opacity-50"
            >
              {tx.busy === "approve" ? t.approving : tx.busy === "deposit" ? t.sending : needsApprove ? t.approve : t.deposit}
            </button>
            <button
              type="button"
              disabled={!!tx.busy || !r(3)}
              onClick={() => tx.send("redeem", { address: POOL!, abi: poolAbi, functionName: "redeem", args: [r(3)!, address!, address!] }, { title: t.withdrawAll, summary: t.poolTitle })}
              className="h-10 rounded-[4px] border border-white/10 px-4 font-inter text-[13.5px] text-haze hover:border-white/30 hover:text-ivory disabled:opacity-50"
            >
              {tx.busy === "redeem" ? t.sending : t.withdrawAll}
            </button>
          </div>
          <div className="mt-2 flex justify-between">
            <span className="font-plex text-[11px] text-smoke">Balance {balance !== undefined ? fmtUsd(balance) : "—"}</span>
            <FaucetButton />
          </div>
          {tx.error ? <p role="alert" className="mt-1 font-inter text-[11.5px] text-dawn">{t.failed} {tx.error}</p> : null}
        </Gate>
      </div>
    </section>
  );
}
