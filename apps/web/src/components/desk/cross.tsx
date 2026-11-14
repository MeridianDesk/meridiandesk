"use client";

/**
 * Common Ledger — Cross margin UI (spec §5.3, §10.10, §13.6).
 * P1: Cross Perps on CrossMarginAccount. P2: Cross long options via CrossOptionBook. Every number is read from the contract
 * (accountSnapshot / params / marketConfig); previews reuse the same formulas (CrossMath).
 */

import { useEffect, useRef, useState } from "react";
import { erc20Abi, maxUint256, parseAbiItem, parseUnits } from "viem";
import { usePublicClient, useReadContract, useReadContracts } from "wagmi";
import { app, crossUi as x, testnetDesk as t } from "@/content/copy";
import { ACTIVE_CHAIN_ID, addressUrl, chains, txUrl } from "@/content/chain";
import { deployed, symbolOf, type ListedMarket } from "@/content/deployments";
import { crossAbi, crossBookAbi, optionsAbi } from "@/lib/abi";
import { fmtPx, fmtUsd, LEV_BPS, USDG_DEC, useOraclePrice, useReady, useSendTx } from "@/lib/onchain";
import { Row } from "./bits";
import { FaucetButton, Gate, LivePerpsTicket, MAX_RANGE, th, useMounted, useUsdg, useWalletPositions } from "./live";

const C = ACTIVE_CHAIN_ID;
export const CROSS = deployed(C, "CrossMarginAccount");
export const BOOK = deployed(C, "CrossOptionBook");
const OPTIONS = deployed(C, "OptionsEngine");
const BPS = 10_000n;
const WAD = 10n ** 18n;
const SLIPPAGE_BPS = 50n;
const ACK_KEY = "meridian.cross.ack";
const unit = C === 46630 ? "tUSDG" : "USDG";

const primary = "h-11 w-full rounded-[4px] bg-dawn font-inter text-[14px] font-medium text-void hover:bg-dawn-hi disabled:cursor-not-allowed disabled:opacity-50";
const ghost = "rounded-[4px] border border-white/10 px-2.5 py-1.5 font-inter text-[12px] text-haze hover:border-white/30 hover:text-ivory disabled:opacity-50";
const seg = (on: boolean) =>
  `h-9 flex-1 rounded-[4px] border font-inter text-[13.5px] disabled:cursor-not-allowed disabled:opacity-50 ${on ? "border-dawn bg-dawn text-void" : "border-white/10 text-haze hover:border-white/30 hover:text-ivory"}`;

const parse = (v: string) => {
  try { return v ? parseUnits(v as `${number}`, USDG_DEC) : 0n; } catch { return 0n; }
};
const ceilDiv = (a: bigint, b: bigint) => (a === 0n ? 0n : (a - 1n) / b + 1n);
const pct = (wad: bigint) => `${((Number(wad) / 1e18) * 100).toFixed(2)}%`;
const signed = (n: bigint) => `${n >= 0n ? "+" : "−"}${fmtUsd(n >= 0n ? n : -n)}`;

type Snapshot = {
  crossWalletBalance: bigint; crossPerpUPnL: bigint; longOptionMark: bigint; longOptionCounted: bigint;
  crossEquityRaw: bigint; crossEquity: bigint; crossIM: bigint; crossMM: bigint; perpNotional: bigint;
  marginRatioWad: bigint; freeCollateral: bigint; withdrawable: bigint; liquidatable: boolean; backstopEligible: boolean;
};
type CrossPos = { size: bigint; entryPrice: bigint; entryFunding: bigint; leverageBps: number; isLong: boolean };

/** Normal < 80%, Warning ≥ 80%, Danger ≥ 95% or liquidatable (§5.3). */
export type RatioTone = "normal" | "warning" | "danger";
const toneOf = (s: Snapshot): RatioTone =>
  s.liquidatable || s.marginRatioWad >= (WAD * 95n) / 100n ? "danger" : s.marginRatioWad >= (WAD * 80n) / 100n ? "warning" : "normal";
const toneCls: Record<RatioTone, string> = { normal: "text-ivory", warning: "text-dawn", danger: "text-dawn-hi" };

export function useCrossAccount() {
  const { address, onChain } = useReady();
  const q = useReadContracts({
    contracts: [
      { address: CROSS!, abi: crossAbi, functionName: "accountSnapshot", args: [address!], chainId: C },
      { address: CROSS!, abi: crossAbi, functionName: "params", chainId: C },
      { address: CROSS!, abi: crossAbi, functionName: "walletOf", args: [address!], chainId: C },
      { address: CROSS!, abi: crossAbi, functionName: "maxWalletPerAccount", chainId: C },
    ],
    query: { enabled: !!CROSS && !!address && onChain, refetchInterval: 15_000 },
  });
  const snap = q.data?.[0]?.result as Snapshot | undefined;
  const p = q.data?.[1]?.result as readonly [number, number, number, number] | undefined;
  return {
    snap,
    // accountSnapshot reverts when any Cross market's oracle is stale (fail-closed)
    stale: q.data?.[0]?.status === "failure",
    mmBps: p ? BigInt(p[0]) : undefined,
    wallet: q.data?.[2]?.result as bigint | undefined,
    maxWallet: q.data?.[3]?.result as bigint | undefined,
  };
}

/** Per-market mode (on-chain, per user) + lock state. Locked while any position is open on this market. */
export function useCrossMode(token: `0x${string}`) {
  const { address, onChain } = useReady();
  const q = useReadContracts({
    contracts: [
      { address: CROSS!, abi: crossAbi, functionName: "marginMode", args: [address!, token], chainId: C },
      { address: CROSS!, abi: crossAbi, functionName: "positionOf", args: [address!, token], chainId: C },
    ],
    query: { enabled: !!CROSS && !!address && onChain, refetchInterval: 15_000 },
  });
  const { all } = useWalletPositions();
  const isoOpen = all.some((p) => p.p.open && p.p.token.toLowerCase() === token.toLowerCase());
  const crossPos = q.data?.[1]?.result as CrossPos | undefined;
  const mode = q.data?.[0]?.result === 1 ? ("cross" as const) : ("isolated" as const);
  return { mode, locked: isoOpen || (crossPos?.size ?? 0n) > 0n, loaded: !!q.data };
}

/** First-time Cross confirmation (§13.6). Submit stays disabled until the risk box is ticked. */
function ModeConfirmDialog({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: (dontShow: boolean) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [ack, setAck] = useState(false);
  const [dontShow, setDontShow] = useState(false);
  useEffect(() => { const d = ref.current; if (d && !d.open) d.showModal(); }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => { e.preventDefault(); onCancel(); }}
      aria-labelledby="cross-dlg-title"
      className="m-auto w-[min(440px,calc(100vw-32px))] rounded-[10px] border border-white/10 bg-char p-0 text-ivory backdrop:bg-black/70"
    >
      <div className="space-y-4 p-6">
        <p className="font-plex text-[10.5px] uppercase tracking-[0.14em] text-dawn">{x.feature}</p>
        <h2 id="cross-dlg-title" className="font-zal text-[20px] font-semibold tracking-[-0.02em]">{x.dialogTitle}</h2>
        <p className="font-inter text-[13.5px] leading-relaxed text-haze">{x.dialogBody}</p>
        <label className="flex items-start gap-2.5 rounded-[6px] border border-dawn/25 bg-dawn/[0.05] px-3 py-2.5 font-inter text-[12.5px] text-dawn-hi">
          <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5 accent-[#f0c48e]" />
          {x.dialogAck}
        </label>
        <label className="flex items-center gap-2.5 font-inter text-[12px] text-smoke">
          <input type="checkbox" checked={dontShow} onChange={(e) => setDontShow(e.target.checked)} className="accent-[#f0c48e]" />
          {x.dontShow}
        </label>
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onCancel} className="h-10 flex-1 rounded-[4px] border border-white/10 font-inter text-[13.5px] text-haze hover:border-white/30 hover:text-ivory">{x.useIsolated}</button>
          <button type="button" disabled={!ack} onClick={() => onConfirm(dontShow)} className="h-10 flex-1 rounded-[4px] bg-dawn font-inter text-[13.5px] font-medium text-void hover:bg-dawn-hi disabled:cursor-not-allowed disabled:opacity-50">{x.useCross}</button>
        </div>
      </div>
    </dialog>
  );
}

/** Segmented Isolated | Cross control (§5.3). Mode is stored on-chain per user per market. */
function ModeToggle({ token, symbol }: { token: `0x${string}`; symbol: string }) {
  const mounted = useMounted();
  const { connected, onChain } = useReady();
  const { mode, locked } = useCrossMode(token);
  const tx = useSendTx();
  const [ask, setAsk] = useState(false);
  const ready = mounted && connected && onChain;

  const setMode = (m: 0 | 1) =>
    tx.send("mode", { address: CROSS!, abi: crossAbi, functionName: "setMarginMode", args: [token, m] }, { title: x.modeSetTitle, summary: `${symbol} · ${m ? x.cross : x.isolated}` });

  const pickCross = () => {
    if (mode === "cross") return;
    if (localStorage.getItem(ACK_KEY) === "1") void setMode(1);
    else setAsk(true);
  };
  const disabled = !ready || locked || !!tx.busy;
  const shown = ready ? mode : "isolated";

  return (
    <div>
      <div className="mb-1.5 flex justify-between font-inter text-[12.5px] text-haze">
        <span id="mode-label">{x.modeLabel}</span>
        <span className="font-plex text-[11px] text-smoke">{tx.busy ? x.switching : x.feature}</span>
      </div>
      <div className="flex gap-1.5" role="radiogroup" aria-labelledby="mode-label" title={locked ? x.locked : undefined}>
        <button type="button" role="radio" aria-checked={shown === "isolated"} disabled={disabled} onClick={() => shown !== "isolated" && void setMode(0)} className={seg(shown === "isolated")}>{x.isolated}</button>
        <button type="button" role="radio" aria-checked={shown === "cross"} disabled={disabled} onClick={pickCross} className={seg(shown === "cross")}>{x.cross}</button>
      </div>
      <p className="mt-1.5 font-inter text-[11.5px] leading-relaxed text-smoke">{locked && ready ? x.locked : shown === "cross" ? x.crossHelp : x.isolatedHelp}</p>
      {tx.error ? <p role="alert" className="mt-1 font-inter text-[11.5px] text-dawn">{t.failed} {tx.error}</p> : null}
      {ask ? (
        <ModeConfirmDialog
          onCancel={() => setAsk(false)}
          onConfirm={(dontShow) => { if (dontShow) localStorage.setItem(ACK_KEY, "1"); setAsk(false); void setMode(1); }}
        />
      ) : null}
    </div>
  );
}

/** Cross order ticket: margin from the Cross account, fee from the wallet, IM / ratio preview from the snapshot. */
function CrossTicket({ symbol, lm }: { symbol: string; lm: ListedMarket }) {
  const [side, setSide] = useState<"long" | "short">("long");
  const [lev, setLev] = useState<keyof typeof LEV_BPS>("1×");
  const [v, setV] = useState("");
  const { price, error: pxErr } = useOraclePrice(lm.token);
  const { snap, stale, mmBps } = useCrossAccount();
  const cfgQ = useReadContract({ address: CROSS ?? undefined, abi: crossAbi, functionName: "marketConfig", args: [lm.token], chainId: C, query: { enabled: !!CROSS } });
  const cfg = cfgQ.data as readonly [bigint, bigint, bigint, number, number, boolean, boolean] | undefined;
  const tx = useSendTx();

  const m = parse(v);
  const L = BigInt(LEV_BPS[lev]);
  const size = (m * L) / BPS;
  const fee = cfg ? (size * BigInt(cfg[3])) / BPS : 0n;
  const imAfter = snap ? snap.crossIM + m : undefined;
  const mmAfter = snap && mmBps !== undefined ? snap.crossMM + ceilDiv(size * mmBps, BPS) : undefined;
  const eqAfter = snap ? snap.crossEquity - (fee > snap.crossEquity ? snap.crossEquity : fee) : undefined;
  const ratioAfter = mmAfter !== undefined && eqAfter ? (mmAfter * WAD) / eqAfter : undefined;
  const enough = imAfter !== undefined && eqAfter !== undefined && eqAfter >= imAfter;

  const blocked = !price || !!pxErr || stale || !snap || snap.liquidatable || !cfg || !cfg[6] || cfg[5];
  const canSend = !blocked && m > 0n && enough && !tx.busy;
  const accept = price ? (side === "long" ? (price * (BPS + SLIPPAGE_BPS)) / BPS : (price * (BPS - SLIPPAGE_BPS)) / BPS) : 0n;
  const label = `${side === "long" ? "Long" : "Short"} ${symbol} ${lev} ${x.cross}`;

  const submit = async () => {
    const ok = await tx.send("open", { address: CROSS!, abi: crossAbi, functionName: "open", args: [lm.token, side === "long", m, LEV_BPS[lev], accept] }, { title: t.openedTitle, summary: `${label} · ${fmtUsd(size)} USDG notional` });
    if (ok) setV("");
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5" role="group" aria-label="Side">
        <button type="button" aria-pressed={side === "long"} className={seg(side === "long")} onClick={() => setSide("long")}>Long</button>
        <button type="button" aria-pressed={side === "short"} className={`h-9 flex-1 rounded-[4px] border font-inter text-[13.5px] ${side === "short" ? "border-ivory bg-ivory text-void" : "border-white/10 text-haze hover:border-white/30 hover:text-ivory"}`} onClick={() => setSide("short")}>Short</button>
      </div>
      <div>
        <label htmlFor="cross-margin" className="mb-1.5 flex justify-between font-inter text-[12.5px] text-haze">
          <span>{x.margin}</span>
          <span className="font-plex text-[11px] text-smoke">{x.free} {snap ? fmtUsd(snap.freeCollateral) : "—"}</span>
        </label>
        <div className="flex h-10 items-center rounded-[4px] border border-white/10 bg-void px-3 focus-within:border-dawn/60">
          <input id="cross-margin" inputMode="decimal" value={v} onChange={(e) => setV(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0.00" className="h-full w-full bg-transparent font-plex text-[14px] text-ivory placeholder:text-smoke focus:outline-none" />
          <span className="font-plex text-[12px] text-haze">{unit}</span>
        </div>
      </div>
      <div>
        <div className="mb-1.5 flex justify-between font-inter text-[12.5px] text-haze">
          <span id="xlev-label">Leverage</span>
          <span className="font-plex text-[11px] text-smoke">{app.leverageHelper}</span>
        </div>
        <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-labelledby="xlev-label">
          {app.leverageOptions.map((l) => (
            <button key={l} type="button" role="radio" aria-checked={lev === l} onClick={() => setLev(l)} className={seg(lev === l)}>{l}</button>
          ))}
        </div>
      </div>
      <div className="rounded-[6px] border border-white/[0.07] bg-void/60 px-3 py-1.5">
        <Row k="Entry (oracle mark)" v={price ? fmtPx(price) : "—"} muted={!price} />
        <Row k={t.notional} v={size > 0n ? `${fmtUsd(size)} USDG` : "—"} muted={size === 0n} />
        <Row k="Open fee" v={size > 0n ? `${fmtUsd(fee)} USDG` : cfg ? `${cfg[3] / 100}%` : "—"} />
        <Row k={x.imAfter} v={imAfter !== undefined && m > 0n ? fmtUsd(imAfter) : "—"} muted={m === 0n} />
        <Row k={x.ratioAfter} v={snap && ratioAfter !== undefined && m > 0n ? `${pct(snap.marginRatioWad)} → ${pct(ratioAfter)}` : "—"} muted={m === 0n} />
        <Row k={x.modeLabel} v={x.cross} />
      </div>
      <p className="font-inter text-[11.5px] leading-relaxed text-smoke">{x.crossLiqNote}</p>
      <p className="flex gap-2 rounded-[5px] border border-dawn/20 bg-dawn/[0.05] px-3 py-2 font-inter text-[12.5px] text-dawn-hi" role="note">
        <span aria-hidden="true">!</span>
        {app.liqWarning}
      </p>
      <Gate>
        <div className="space-y-2">
          <button type="button" disabled={!canSend} onClick={submit} className={primary}>{tx.busy ? t.sending : label}</button>
          {stale || pxErr ? <p className="font-inter text-[11.5px] text-dawn">{x.stale}</p> : null}
          {snap?.liquidatable ? <p className="font-inter text-[11.5px] text-dawn">{x.liquidatable}</p> : null}
          {snap && snap.crossWalletBalance === 0n ? <p className="font-inter text-[11.5px] text-haze">{x.emptyWallet}</p> : m > 0n && !enough ? <p className="font-inter text-[11.5px] text-dawn">{x.insufficient}</p> : null}
          {tx.error ? <p role="alert" className="font-inter text-[11.5px] text-dawn">{t.failed} {tx.error}</p> : null}
        </div>
      </Gate>
    </div>
  );
}

/** Perps ticket with the Isolated | Cross toggle on top. Falls back to the Isolated ticket where Cross isn't deployed. */
export function PerpsDeskTicket({ symbol, lm }: { symbol: string; lm: ListedMarket }) {
  const { mode } = useCrossMode(lm.token);
  const { connected, onChain } = useReady();
  const mounted = useMounted();
  if (!CROSS) return <LivePerpsTicket symbol={symbol} lm={lm} />;
  const cross = mounted && connected && onChain && mode === "cross";
  return (
    <div className="space-y-4">
      <ModeToggle token={lm.token} symbol={symbol} />
      {cross ? <CrossTicket key="x" symbol={symbol} lm={lm} /> : <LivePerpsTicket key="i" symbol={symbol} lm={lm} />}
    </div>
  );
}

/** Cross account card (§6.6.B, §10.10): equity breakdown, ratio tone, deposit / withdraw. */
export function CrossAccountCard({ compact = false }: { compact?: boolean }) {
  const mounted = useMounted();
  const { snap, stale, wallet, maxWallet } = useCrossAccount();
  const { balance, allowance } = useUsdg(CROSS);
  const [v, setV] = useState("");
  const tx = useSendTx();
  if (!CROSS) return compact ? null : <section className="rounded-[8px] border border-white/[0.08] bg-char px-5 py-4 font-inter text-[13px] text-haze">{x.notDeployed}</section>;

  const amt = parse(v);
  const tone = snap ? toneOf(snap) : "normal";
  const needsApprove = allowance !== undefined && amt > 0n && allowance < amt;
  const room = wallet !== undefined && maxWallet !== undefined ? (maxWallet > wallet ? maxWallet - wallet : 0n) : undefined;
  const canDeposit = amt > 0n && balance !== undefined && amt <= balance && (room === undefined || amt <= room) && !tx.busy;
  const canWithdraw = amt > 0n && !!snap && !stale && amt <= snap.withdrawable && !tx.busy;
  const overWithdraw = !!snap && amt > 0n && amt > snap.withdrawable;
  const ratio = !snap || (snap.crossMM === 0n && snap.crossEquity === 0n) ? "—" : snap.marginRatioWad === maxUint256 ? "∞" : pct(snap.marginRatioWad);
  const show = mounted && snap;

  const cells: [string, string, string?][] = [
    [x.wallet, show ? fmtUsd(snap.crossWalletBalance) : "—"],
    [x.upnl, show ? signed(snap.crossPerpUPnL) : "—"],
    [x.optionValue, show ? fmtUsd(snap.longOptionCounted) : "—", x.optionTip],
    [x.equity, show ? fmtUsd(snap.crossEquity) : "—"],
    [x.im, show ? fmtUsd(snap.crossIM) : "—"],
    [x.mm, show ? fmtUsd(snap.crossMM) : "—"],
    [x.free, show ? fmtUsd(snap.freeCollateral) : "—"],
    [x.withdrawable, show ? fmtUsd(snap.withdrawable) : "—"],
  ];

  return (
    <section aria-label={x.cardTitle} className="rounded-[8px] border border-white/[0.08] bg-char">
      <div className="flex items-center justify-between gap-3 border-b border-white/[0.07] px-5 py-3">
        <div>
          <h2 className="font-zal text-[15px] font-semibold tracking-[-0.01em] text-ivory">{x.cardTitle} <span className="ml-1 font-plex text-[10.5px] font-normal uppercase tracking-[0.12em] text-dawn">{x.feature}</span></h2>
          {!compact ? <p className="font-inter text-[12px] text-smoke">{x.cardSub}</p> : null}
        </div>
        <a href={addressUrl(CROSS)} target="_blank" rel="noreferrer" className="font-plex text-[11px] text-haze hover:text-dawn">{chains[C].short} ↗</a>
      </div>
      <div className="flex items-end justify-between gap-4 px-5 pt-4">
        <div>
          <p className="font-plex text-[10.5px] uppercase tracking-[0.08em] text-smoke">{x.ratio}</p>
          <p className={`font-zal text-[26px] font-semibold tracking-[-0.02em] ${show ? toneCls[tone] : "text-ivory/70"}`}>{show ? ratio : "—"}</p>
        </div>
        <p className="max-w-[260px] text-right font-inter text-[11.5px] leading-snug text-smoke">{x.ratioHelp}</p>
      </div>
      {stale ? <p className="mx-5 mt-3 rounded-[5px] border border-dawn/30 px-3 py-2 font-inter text-[12px] text-dawn-hi">{x.stale}</p> : null}
      {snap?.liquidatable ? <p className="mx-5 mt-3 rounded-[5px] border border-dawn/40 bg-dawn/[0.06] px-3 py-2 font-inter text-[12px] text-dawn-hi">{x.liquidatable}</p> : null}
      <dl className={`mt-4 grid gap-px bg-white/[0.05] ${compact ? "grid-cols-2" : "grid-cols-2 md:grid-cols-4"}`}>
        {cells.map(([k, val, tip]) => (
          <div key={k} className="bg-char px-5 py-3" title={tip}>
            <dt className="font-plex text-[10.5px] uppercase tracking-[0.08em] text-smoke">{k}</dt>
            <dd className="mt-1 font-plex text-[15px] text-ivory">{val}</dd>
          </div>
        ))}
      </dl>
      <div className="space-y-2 px-5 py-4">
        <Gate>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex h-10 min-w-[160px] flex-1 items-center rounded-[4px] border border-white/10 bg-void px-3 focus-within:border-dawn/60">
              <input aria-label="Cross amount" inputMode="decimal" value={v} onChange={(e) => setV(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0.00" className="h-full w-full bg-transparent font-plex text-[14px] text-ivory placeholder:text-smoke focus:outline-none" />
              <button type="button" disabled={!snap?.withdrawable} onClick={() => snap && setV(fmtUsd(snap.withdrawable, USDG_DEC, 6).replace(/,/g, ""))} className="font-plex text-[11px] text-dawn hover:text-dawn-hi disabled:opacity-40">{x.max}</button>
            </div>
            <button
              type="button"
              disabled={!canDeposit}
              onClick={async () => {
                if (needsApprove && !(await tx.send("approve", { address: deployed(C, "usdg")!, abi: erc20Abi, functionName: "approve", args: [CROSS, maxUint256] }))) return;
                if (await tx.send("deposit", { address: CROSS, abi: crossAbi, functionName: "deposit", args: [amt] }, { title: x.depositedTitle, summary: `${fmtUsd(amt)} ${unit} → ${x.feature}` })) setV("");
              }}
              className="h-10 rounded-[4px] bg-dawn px-4 font-inter text-[13.5px] font-medium text-void hover:bg-dawn-hi disabled:opacity-50"
            >
              {tx.busy === "approve" ? t.approving : tx.busy === "deposit" ? t.sending : needsApprove ? t.approve : x.deposit}
            </button>
            <button
              type="button"
              disabled={!canWithdraw}
              onClick={async () => { if (await tx.send("withdraw", { address: CROSS, abi: crossAbi, functionName: "withdraw", args: [amt] }, { title: x.withdrawnTitle, summary: `${fmtUsd(amt)} ${unit}` })) setV(""); }}
              className="h-10 rounded-[4px] border border-white/10 px-4 font-inter text-[13.5px] text-haze hover:border-white/30 hover:text-ivory disabled:opacity-50"
            >
              {tx.busy === "withdraw" ? t.sending : x.withdraw}
            </button>
          </div>
          <div className="mt-2 flex justify-between">
            <span className="font-plex text-[11px] text-smoke">Balance {balance !== undefined ? fmtUsd(balance) : "—"}</span>
            <FaucetButton />
          </div>
          {overWithdraw ? <p className="mt-1 font-inter text-[11.5px] text-dawn">{x.withdrawBlocked}</p> : null}
          {tx.error ? <p role="alert" className="mt-1 font-inter text-[11.5px] text-dawn">{t.failed} {tx.error}</p> : null}
        </Gate>
        {!compact ? (
          <>
            <p className="font-inter text-[11.5px] text-smoke">{x.isolatedApart} {BOOK ? x.optCountedNote : x.optionsSoon}</p>
            <p className="font-inter text-[11.5px] text-smoke">{x.backstop}</p>
          </>
        ) : null}
      </div>
    </section>
  );
}

function CrossRow({ token, p }: { token: `0x${string}`; p: CrossPos }) {
  const { price } = useOraclePrice(token);
  const tx = useSendTx();
  const sym = symbolOf(C, token) ?? "—";
  const pnl = price ? (p.isLong ? (p.size * price) / p.entryPrice - p.size : p.size - (p.size * price) / p.entryPrice) : undefined;
  const accept = price ? (p.isLong ? (price * (BPS - SLIPPAGE_BPS)) / BPS : (price * (BPS + SLIPPAGE_BPS)) / BPS) : 0n;
  const td = "px-3 py-2.5 font-plex text-[12.5px] whitespace-nowrap";
  return (
    <tr className="border-t border-white/[0.05]">
      <td className={`${td} text-ivory`}>{sym} <span className={p.isLong ? "text-dawn" : "text-ivory/70"}>{p.isLong ? "Long" : "Short"}</span> <span className="rounded-[3px] border border-dawn/30 px-1 text-[11px] text-dawn">{p.leverageBps / 10_000}× {x.cross}</span></td>
      <td className={`${td} text-right text-ivory`}>{fmtUsd(p.size)}</td>
      <td className={`${td} text-right text-haze`}>{fmtUsd((p.size * BPS) / BigInt(p.leverageBps))}</td>
      <td className={`${td} text-right text-haze`}>{fmtPx(p.entryPrice)}</td>
      <td className={`${td} text-right text-haze`}>{price ? fmtPx(price) : "—"}</td>
      <td className={`${td} text-right ${pnl === undefined ? "text-smoke" : pnl >= 0n ? "text-dawn" : "text-ivory/70"}`}>{pnl === undefined ? "—" : signed(pnl)}</td>
      <td className={`${td} text-right text-smoke`} title={x.crossLiqNote}>Account</td>
      <td className={`${td} text-right`}>
        <button type="button" disabled={!price || !!tx.busy} onClick={() => tx.send("close", { address: CROSS!, abi: crossAbi, functionName: "close", args: [token, 0n, accept] }, { title: t.closedTitle, summary: `${sym} ${p.isLong ? "Long" : "Short"} · ${x.cross}` })} className={ghost}>
          {tx.busy ? t.closing : t.close}
        </button>
        {tx.error ? <span role="alert" className="mt-1 block font-inter text-[11px] text-dawn">{tx.error}</span> : null}
      </td>
    </tr>
  );
}

/** Open Cross positions of the connected wallet; `token` narrows to one market. Returns null when there are none. */
export function CrossPositions({ token }: { token?: string | null }) {
  const mounted = useMounted();
  const { address, connected, onChain } = useReady();
  const toks = useReadContract({ address: CROSS ?? undefined, abi: crossAbi, functionName: "tokensOf", args: address ? [address] : undefined, chainId: C, query: { enabled: !!CROSS && !!address && onChain, refetchInterval: 15_000 } });
  const list = ((toks.data ?? []) as readonly `0x${string}`[]).filter((a) => !token || a.toLowerCase() === token.toLowerCase());
  const pos = useReadContracts({
    contracts: list.map((a) => ({ address: CROSS!, abi: crossAbi, functionName: "positionOf" as const, args: [address!, a] as const, chainId: C })),
    query: { enabled: list.length > 0, refetchInterval: 15_000 },
  });
  if (!mounted || !connected || !onChain || !CROSS || !list.length) return null;
  const rows = list.map((a, i) => ({ a, p: pos.data?.[i]?.result as CrossPos | undefined })).filter((r): r is { a: `0x${string}`; p: CrossPos } => !!r.p && r.p.size > 0n);
  if (!rows.length) return null;
  return (
    <div className="overflow-x-auto border-b border-white/[0.05]">
      <table className="w-full">
        <thead>
          <tr>
            <th className={`${th} text-left`}>Market · {x.cross}</th><th className={th}>Size</th><th className={th}>Margin (IM)</th><th className={th}>Entry</th><th className={th}>Mark</th><th className={th}>PnL</th><th className={th}>Liq.</th><th className={th}><span className="sr-only">Action</span></th>
          </tr>
        </thead>
        <tbody>{rows.map(({ a, p }) => <CrossRow key={a} token={a} p={p} />)}</tbody>
      </table>
    </div>
  );
}

type Opt = { owner: `0x${string}`; expiry: bigint; isCall: boolean; status: number; token: `0x${string}`; strike: bigint; quantity: bigint; premium: bigint; maxPayout: bigint };

function CrossOptionRow({ id, o, haircutBps }: { id: bigint; o: Opt; haircutBps: bigint }) {
  const { price } = useOraclePrice(o.token);
  const [now] = useState(() => Math.floor(Date.now() / 1000));
  const expired = Number(o.expiry) <= now;
  // Same mark as CrossOptionBook.legsOf: intrinsic at the oracle mark, capped at max payout; 0 once expired.
  let mark = price && !expired ? ((o.isCall ? (price > o.strike ? price - o.strike : 0n) : o.strike > price ? o.strike - price : 0n) * o.quantity) / WAD / 10n ** 12n : undefined;
  if (mark !== undefined && mark > o.maxPayout) mark = o.maxPayout;
  const counted = mark !== undefined ? (mark * (BPS - haircutBps)) / BPS : expired ? 0n : undefined;
  const td = "px-3 py-2.5 font-plex text-[12.5px] whitespace-nowrap";
  return (
    <tr className="border-t border-white/[0.05]">
      <td className={`${td} text-ivory`}>{symbolOf(C, o.token) ?? "—"} <span className={o.isCall ? "text-dawn" : "text-ivory/70"}>{o.isCall ? "Call" : "Put"}</span> <span className="rounded-[3px] border border-dawn/30 px-1 text-[11px] text-dawn">{x.cross}</span> <span className="text-smoke">#{String(id)}</span></td>
      <td className={`${td} text-right text-haze`}>{fmtPx(o.strike)}</td>
      <td className={`${td} text-right text-haze`}>{new Date(Number(o.expiry) * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</td>
      <td className={`${td} text-right text-haze`}>{(Number(o.quantity) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 6 })}</td>
      <td className={`${td} text-right text-haze`}>{fmtUsd(o.premium)}</td>
      <td className={`${td} text-right text-haze`}>{mark !== undefined ? fmtUsd(mark) : "—"}</td>
      <td className={`${td} text-right ${counted ? "text-dawn" : "text-haze"}`} title={x.optCountedNote}>{counted !== undefined ? fmtUsd(counted) : "—"}</td>
      <td className={`${td} text-right text-smoke`}>{expired ? x.awaitingRound : "Open"}</td>
    </tr>
  );
}

/** Cross long options held by CrossOptionBook for the connected wallet. Returns null when there are none. */
export function CrossOptionsPositions({ token }: { token?: string | null }) {
  const mounted = useMounted();
  const { address, connected, onChain } = useReady();
  const { snap } = useCrossAccount();
  const pr = useReadContract({ address: CROSS ?? undefined, abi: crossAbi, functionName: "params", chainId: C, query: { enabled: !!CROSS } });
  const ids = useReadContract({ address: BOOK ?? undefined, abi: crossBookAbi, functionName: "optionsOf", args: address ? [address] : undefined, chainId: C, query: { enabled: !!BOOK && !!address && onChain, refetchInterval: 15_000 } });
  const list = (ids.data ?? []) as readonly bigint[];
  const q = useReadContracts({
    contracts: list.map((id) => ({ address: OPTIONS!, abi: optionsAbi, functionName: "getOption" as const, args: [id] as const, chainId: C })),
    query: { enabled: list.length > 0 && !!OPTIONS, refetchInterval: 15_000 },
  });
  if (!mounted || !connected || !onChain || !BOOK || !list.length) return null;
  const haircut = BigInt((pr.data as readonly [number, number, number, number] | undefined)?.[1] ?? 2000);
  const rows = list.map((id, i) => ({ id, o: q.data?.[i]?.result as Opt | undefined })).filter((r): r is { id: bigint; o: Opt } => !!r.o && (!token || r.o.token.toLowerCase() === token.toLowerCase()));
  if (!rows.length) return null;
  return (
    <div className="overflow-x-auto border-b border-white/[0.05]">
      <table className="w-full">
        <thead>
          <tr>
            <th className={`${th} text-left`}>{x.crossOptions}</th><th className={th}>Strike</th><th className={th}>Expiry</th><th className={th}>Qty</th><th className={th}>Premium</th><th className={th}>Mark</th><th className={th}>{x.counted}</th><th className={th}>Status</th>
          </tr>
        </thead>
        <tbody>{rows.map(({ id, o }) => <CrossOptionRow key={String(id)} id={id} o={o} haircutBps={haircut} />)}</tbody>
      </table>
      {snap ? <p className="px-5 py-2 font-inter text-[11px] text-smoke">{x.optionValue}: {fmtUsd(snap.longOptionCounted)} {unit}</p> : null}
    </div>
  );
}

/* ── Cross history: Common Ledger events (deposit / withdraw / perps / options) ── */

const ev = {
  dep: parseAbiItem("event Deposited(address indexed user, uint256 amount)"),
  wd: parseAbiItem("event Withdrawn(address indexed user, uint256 amount)"),
  open: parseAbiItem("event CrossOpened(address indexed user, address indexed token, bool isLong, uint16 leverageBps, uint256 size, uint256 price, uint256 fee)"),
  close: parseAbiItem("event CrossClosed(address indexed user, address indexed token, uint256 sizeClosed, uint256 price, int256 pnl, uint256 funding, uint256 fee)"),
  liq: parseAbiItem("event LiquidationFill(address indexed user, address indexed token, address indexed keeper, uint256 sizeClosed, uint256 price, uint256 insuranceFee, uint256 keeperFee)"),
  ob: parseAbiItem("event CrossOptionBought(address indexed user, uint256 indexed optionId, uint256 premium)"),
  os: parseAbiItem("event CrossOptionSettled(address indexed user, uint256 indexed optionId, uint256 credited)"),
};
/** First block worth scanning per chain (Cross deployment). Unknown chains scan the last 200k blocks. */
const CROSS_FROM: Record<number, bigint> = { 46630: 153_088_089n, 4663: 113_997_727n };

type XRow = { kind: string; block: string; tx: string; token?: string; detail: string; amount?: string; pnl?: string; fee?: string };

function useCrossHistory() {
  const { address, onChain } = useReady();
  const client = usePublicClient({ chainId: C });
  const key = address && CROSS ? `meridian.xhist.${C}.${CROSS}.${BOOK ?? "-"}.${address.toLowerCase()}` : null;
  const [state, setState] = useState<{ key: string | null; rows: XRow[]; scanning: boolean; error?: string }>({ key: null, rows: [], scanning: false });

  useEffect(() => {
    if (!client || !key || !address || !CROSS || !onChain) return;
    let stop = false;
    const run = async () => {
      let cache: { to: string; rows: XRow[] } | null = null;
      try { cache = JSON.parse(localStorage.getItem(key) ?? "null"); } catch {}
      const head = await client.getBlockNumber();
      let from = cache ? BigInt(cache.to) + 1n : CROSS_FROM[C] ?? (head > 200_000n ? head - 200_000n : 0n);
      if (from > head) { setState({ key, rows: cache?.rows ?? [], scanning: false }); return; }
      let rows = cache?.rows ?? [];
      setState({ key, rows, scanning: true });
      const args = { user: address };
      for (; from <= head && !stop; from += MAX_RANGE + 1n) {
        const a = from, b = a + MAX_RANGE > head ? head : a + MAX_RANGE;
        const r = { fromBlock: a, toBlock: b, args };
        const [dep, wd, op, cl, lq, ob, os] = await Promise.all([
          client.getLogs({ address: CROSS!, event: ev.dep, ...r }),
          client.getLogs({ address: CROSS!, event: ev.wd, ...r }),
          client.getLogs({ address: CROSS!, event: ev.open, ...r }),
          client.getLogs({ address: CROSS!, event: ev.close, ...r }),
          client.getLogs({ address: CROSS!, event: ev.liq, ...r }),
          BOOK ? client.getLogs({ address: BOOK, event: ev.ob, ...r }) : Promise.resolve([]),
          BOOK ? client.getLogs({ address: BOOK, event: ev.os, ...r }) : Promise.resolve([]),
        ]);
        const base = (e: { blockNumber: bigint; transactionHash: `0x${string}` }) => ({ block: String(e.blockNumber), tx: e.transactionHash });
        rows = rows.concat(
          dep.map((e) => ({ ...base(e), kind: "Deposit", detail: "Cross wallet", amount: String(e.args.amount) })),
          wd.map((e) => ({ ...base(e), kind: "Withdraw", detail: "Cross wallet", amount: String(-(e.args.amount ?? 0n)) })),
          op.map((e) => ({ ...base(e), kind: "Open", token: e.args.token, detail: `${e.args.isLong ? "Long" : "Short"} ${Number(e.args.leverageBps) / 10_000}× · ${fmtUsd(e.args.size ?? 0n)} @ ${fmtPx(e.args.price ?? 0n)}`, fee: String(e.args.fee) })),
          cl.map((e) => ({ ...base(e), kind: "Close", token: e.args.token, detail: `${fmtUsd(e.args.sizeClosed ?? 0n)} @ ${fmtPx(e.args.price ?? 0n)}`, pnl: String(e.args.pnl), fee: String(e.args.fee) })),
          lq.map((e) => ({ ...base(e), kind: "Liquidated", token: e.args.token, detail: `${fmtUsd(e.args.sizeClosed ?? 0n)} @ ${fmtPx(e.args.price ?? 0n)}`, fee: String((e.args.insuranceFee ?? 0n) + (e.args.keeperFee ?? 0n)) })),
          ob.map((e) => ({ ...base(e), kind: "Option bought", detail: `#${e.args.optionId}`, amount: String(-(e.args.premium ?? 0n)) })),
          os.map((e) => ({ ...base(e), kind: "Option settled", detail: `#${e.args.optionId}`, amount: String(e.args.credited) })),
        );
        const seen = new Set<string>();
        rows = rows.filter((x) => { const k = x.tx + x.kind + x.detail; if (seen.has(k)) return false; seen.add(k); return true; });
        localStorage.setItem(key, JSON.stringify({ to: String(b), rows }));
        if (!stop) setState({ key, rows, scanning: b < head });
      }
    };
    run().catch((e) => !stop && setState((s) => ({ ...s, key, scanning: false, error: (e as { shortMessage?: string }).shortMessage ?? String(e) })));
    const iv = setInterval(() => run().catch(() => {}), 30_000);
    return () => { stop = true; clearInterval(iv); };
  }, [client, key, address, onChain]);

  const rows = state.key === key ? state.rows : [];
  return { rows: [...rows].sort((a, b) => Number(BigInt(b.block) - BigInt(a.block))), scanning: state.scanning, error: state.error };
}

/** Cross account activity of the connected wallet; `token` narrows trades to one market (wallet moves always show). */
export function CrossHistory({ token }: { token?: string | null }) {
  const mounted = useMounted();
  const { connected, onChain } = useReady();
  const { rows, scanning, error } = useCrossHistory();
  if (!mounted || !connected || !onChain || !CROSS) return null;
  const list = rows.filter((r) => !token || !r.token || r.token.toLowerCase() === token.toLowerCase());
  if (!list.length) return error ? <p className="px-5 py-3 font-inter text-[12px] text-smoke">Cross history unavailable: {error}</p> : scanning ? <p className="px-5 py-3 font-inter text-[12px] text-smoke">Loading Cross history…</p> : null;
  const td = "px-3 py-2.5 font-plex text-[12.5px] whitespace-nowrap";
  const sgn = (v?: string) => (v === undefined ? "—" : signed(BigInt(v)));
  return (
    <div className="overflow-x-auto border-b border-white/[0.05]">
      <p className="px-5 pt-4 font-inter text-[11px] uppercase tracking-[0.08em] text-smoke">{x.cross} account</p>
      <table className="w-full">
        <thead>
          <tr>
            <th className={`${th} text-left`}>Market</th><th className={`${th} text-left`}>Event</th><th className={`${th} text-left`}>Detail</th><th className={th}>Wallet</th><th className={th}>PnL</th><th className={th}>Fee</th><th className={th}>Tx</th>
          </tr>
        </thead>
        <tbody>
          {list.map((r) => (
            <tr key={r.tx + r.kind + r.detail} className="border-t border-white/[0.05]">
              <td className={`${td} text-ivory`}>{r.token ? symbolOf(C, r.token as `0x${string}`) ?? "—" : "—"} <span className="rounded-[3px] border border-dawn/30 px-1 text-[11px] text-dawn">{x.cross}</span></td>
              <td className={`${td} ${r.kind === "Liquidated" ? "text-dawn" : "text-haze"}`}>{r.kind}</td>
              <td className={`${td} text-haze`}>{r.detail}</td>
              <td className={`${td} text-right text-haze`}>{sgn(r.amount)}</td>
              <td className={`${td} text-right ${r.pnl === undefined ? "text-smoke" : BigInt(r.pnl) >= 0n ? "text-dawn" : "text-ivory/70"}`}>{sgn(r.pnl)}</td>
              <td className={`${td} text-right text-haze`}>{r.fee === undefined ? "—" : fmtUsd(BigInt(r.fee))}</td>
              <td className={`${td} text-right`}><a href={txUrl(r.tx)} target="_blank" rel="noreferrer" className="text-haze underline decoration-white/20 underline-offset-4 hover:text-ivory">{r.tx.slice(0, 8)}…</a></td>
            </tr>
          ))}
        </tbody>
      </table>
      {scanning ? <p className="px-5 py-2 font-inter text-[11px] text-smoke">Loading older events…</p> : null}
    </div>
  );
}
