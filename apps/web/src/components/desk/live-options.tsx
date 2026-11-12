"use client";

import { useEffect, useState } from "react";
import { erc20Abi, maxUint256, parseAbiItem, parseUnits } from "viem";
import { usePublicClient, useReadContract, useReadContracts } from "wagmi";
import { testnetDesk as t } from "@/content/copy";
import { ACTIVE_CHAIN_ID, txUrl } from "@/content/chain";
import { deployed, symbolOf, type ListedMarket } from "@/content/deployments";
import { optionsAbi, registryAbi } from "@/lib/abi";
import { bs, expiryFor, STRIKE_OFFSETS, TENORS, TESTNET_IV, type Tenor } from "@/lib/bs";
import { fmtPx, fmtUsd, useOraclePrice, useReady, useSendTx } from "@/lib/onchain";
import { Row } from "./bits";
import { FaucetButton, Gate, MAX_RANGE, th, useMounted, useUsdg } from "./live";

const C = ACTIVE_CHAIN_ID;
const OPTIONS = deployed(C, "OptionsEngine");
// OptionsEngine deployment block per chain (from contracts/broadcast) — floor for the first history scan,
// otherwise the 45-day look-back walks hundreds of 49k-block chunks and History never finishes loading.
const OPTIONS_START: Partial<Record<number, bigint>> = { 46630: 149_373_383n, 4663: 112_561_077n };
const REGISTRY = deployed(C, "MarketRegistry");
const USDG = deployed(C, "usdg");

const primary = "h-11 w-full rounded-[4px] bg-dawn font-inter text-[14px] font-medium text-void hover:bg-dawn-hi disabled:cursor-not-allowed disabled:opacity-50";
const seg = (on: boolean, tone: "dawn" | "ivory" = "dawn") =>
  `h-9 flex-1 rounded-[4px] border font-inter text-[13.5px] ${on ? (tone === "dawn" ? "border-dawn bg-dawn text-void" : "border-ivory bg-ivory text-void") : "border-white/10 text-haze hover:border-white/30 hover:text-ivory"}`;
const pctLabel = (o: number) => (o === 0 ? "ATM" : `${o > 0 ? "+" : "−"}${Math.abs(o * 100)}%`);
const qtyWad = (v: string) => { try { return v ? parseUnits(v as `${number}`, 18) : 0n; } catch { return 0n; } };

/** Wall clock in seconds, ticking every 15 s (keeps render pure). */
function useNow() {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => { const i = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 15_000); return () => clearInterval(i); }, []);
  return now;
}

type Quote = { buyer: `0x${string}`; token: `0x${string}`; isCall: boolean; strike: bigint; expiry: bigint; quantity: bigint; premium: bigint; deadline: bigint; nonce: bigint };

export function LiveOptionsTicket({ symbol, lm }: { symbol: string; lm: ListedMarket }) {
  const [kind, setKind] = useState<"call" | "put">("call");
  const [tenor, setTenor] = useState<Tenor>("1W");
  const [k, setK] = useState(2);
  const [v, setV] = useState("");
  const [quoting, setQuoting] = useState(false);
  const [qErr, setQErr] = useState<string | null>(null);
  const { address } = useReady();
  const { price, error: pxErr } = useOraclePrice(lm.token);
  const { balance, allowance } = useUsdg(OPTIONS);
  const tx = useSendTx();
  const en = useReadContract({ address: REGISTRY ?? undefined, abi: registryAbi, functionName: "isOptionsEnabled", args: [lm.token], chainId: C, query: { enabled: !!REGISTRY } });
  const caps = useReadContract({ address: OPTIONS ?? undefined, abi: optionsAbi, functionName: "maxPremiumPerOption", chainId: C, query: { enabled: !!OPTIONS } });
  const capBps = useReadContract({ address: OPTIONS ?? undefined, abi: optionsAbi, functionName: "callPayoutCapBps", chainId: C, query: { enabled: !!OPTIONS } });

  const isCall = kind === "call";
  const spot = price ? Number(price) / 1e18 : 0;
  const now = useNow();
  const expiry = expiryFor(tenor, now);
  const tY = (expiry - now) / 31_536_000;
  const rows = STRIKE_OFFSETS.map((o) => {
    const strike = Math.round(spot * (1 + o) * 100) / 100;
    return { o, strike, ...bs(isCall, spot, strike, tY, TESTNET_IV) };
  });
  const sel = rows[k];
  const qty = qtyWad(v);
  const qtyN = Number(v) || 0;
  const estPremium = spot && qtyN ? BigInt(Math.max(10_000, Math.ceil(sel.premium * qtyN * 1e6))) : 0n;
  const maxPayout = isCall ? (sel.strike * qtyN * Number(capBps.data ?? 0)) / 10_000 : sel.strike * qtyN; // OptionsEngine.maxPayoutOf
  const breakeven = spot ? (isCall ? sel.strike + sel.premium : sel.strike - sel.premium) : 0;
  const needsApprove = allowance !== undefined && estPremium > 0n && allowance < estPremium * 2n;
  const overCap = caps.data !== undefined && estPremium > caps.data;
  const enabled = en.data === true;
  const canSend = enabled && !!price && !pxErr && qty > 0n && !overCap && balance !== undefined && estPremium <= balance && !tx.busy && !quoting;

  async function submit() {
    setQErr(null);
    if (needsApprove && !(await tx.send("approve", { address: USDG!, abi: erc20Abi, functionName: "approve", args: [OPTIONS!, maxUint256] }))) return;
    setQuoting(true);
    let res: { quote?: Record<string, string>; signature?: `0x${string}`; error?: string };
    try {
      const r = await fetch(`/api/quote?${new URLSearchParams({ buyer: address!, token: lm.token, type: kind, tenor, strike: String(k), qty: v })}`, { cache: "no-store" });
      res = await r.json();
    } catch {
      res = { error: "Quoter unreachable" };
    } finally {
      setQuoting(false);
    }
    if (!res.quote || !res.signature) return setQErr(res.error ?? "No quote");
    const q = res.quote;
    const quote: Quote = { buyer: q.buyer as `0x${string}`, token: q.token as `0x${string}`, isCall: String(q.isCall) === "true", strike: BigInt(q.strike), expiry: BigInt(q.expiry), quantity: BigInt(q.quantity), premium: BigInt(q.premium), deadline: BigInt(q.deadline), nonce: BigInt(q.nonce) };
    if (balance !== undefined && quote.premium > balance) return setQErr("Premium exceeds balance");
    if (await tx.send("buy", { address: OPTIONS!, abi: optionsAbi, functionName: "buy", args: [quote, res.signature] }, { title: t.optBoughtTitle, summary: `${symbol} ${isCall ? "Call" : "Put"} ${fmtPx(quote.strike)} · ${tenor} · premium ${fmtUsd(quote.premium)} USDG` })) setV("");
  }

  if (en.isSuccess && !enabled) return <p className="rounded-[5px] border border-white/[0.08] px-3 py-2.5 font-inter text-[12.5px] text-haze">{t.optNotEnabled}</p>;
  return (
    <div className="space-y-4">
      <div className="flex gap-1.5" role="group" aria-label="Option type">
        <button type="button" aria-pressed={isCall} className={seg(isCall)} onClick={() => setKind("call")}>Call</button>
        <button type="button" aria-pressed={!isCall} className={seg(!isCall, "ivory")} onClick={() => setKind("put")}>Put</button>
      </div>
      <div>
        <div id="exp-label" className="mb-1.5 flex justify-between font-inter text-[12.5px] text-haze">
          <span>Expiry</span>
          <span className="font-plex text-[11px] text-smoke">{new Date(expiry * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</span>
        </div>
        <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-labelledby="exp-label">
          {(Object.keys(TENORS) as Tenor[]).map((e) => (
            <button key={e} type="button" role="radio" aria-checked={tenor === e} onClick={() => setTenor(e)} className={seg(tenor === e)}>{e}</button>
          ))}
        </div>
      </div>
      <div className="overflow-hidden rounded-[6px] border border-white/[0.07]" role="radiogroup" aria-label="Strike">
        <div className="grid grid-cols-4 bg-white/[0.03] px-3 py-1.5 font-plex text-[10.5px] uppercase tracking-[0.08em] text-smoke">
          <span>Strike</span><span className="text-right">Price</span><span className="text-right">Premium / unit</span><span className="text-right">Δ</span>
        </div>
        {rows.map((r, i) => (
          <button key={r.o} type="button" role="radio" aria-checked={k === i} onClick={() => setK(i)} className={`grid w-full grid-cols-4 border-t border-white/[0.05] px-3 py-2 text-left font-plex text-[12.5px] ${k === i ? "bg-dawn/[0.08] text-ivory" : "text-haze hover:bg-white/[0.03]"}`}>
            <span>{pctLabel(r.o)}</span>
            <span className="text-right">{spot ? r.strike.toFixed(2) : "—"}</span>
            <span className="text-right">{spot ? r.premium.toFixed(2) : "—"}</span>
            <span className="text-right">{spot ? r.delta.toFixed(2) : "—"}</span>
          </button>
        ))}
      </div>
      <div>
        <label htmlFor="opt-qty" className="mb-1.5 flex justify-between font-inter text-[12.5px] text-haze">
          <span>{t.optQty}</span>
          <span className="font-plex text-[11px] text-smoke">Balance {balance !== undefined ? fmtUsd(balance) : "—"}</span>
        </label>
        <div className="flex h-10 items-center rounded-[4px] border border-white/10 bg-void px-3 focus-within:border-dawn/60">
          <input id="opt-qty" inputMode="decimal" value={v} onChange={(e) => setV(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0.00" className="h-full w-full bg-transparent font-plex text-[14px] text-ivory placeholder:text-smoke focus:outline-none" />
          <span className="font-plex text-[12px] text-haze">{symbol} {t.optQtyUnit}</span>
        </div>
        <div className="mt-1 flex justify-end"><FaucetButton /></div>
      </div>
      <div className="rounded-[6px] border border-white/[0.07] bg-void/60 px-3 py-1.5">
        <Row k="Est. premium (USDG)" v={estPremium ? fmtUsd(estPremium) : "—"} muted={!estPremium} />
        <Row k="Max loss" v={estPremium ? `${fmtUsd(estPremium)} USDG (premium)` : "Premium paid"} />
        <Row k="Max payout" v={qtyN && spot ? `${maxPayout.toFixed(2)} USDG` : "—"} muted={!qtyN} />
        <Row k="Breakeven" v={spot ? breakeven.toFixed(2) : "—"} muted={!spot} />
        <Row k="Settlement" v="Oracle mark at expiry" />
      </div>
      <p className="font-inter text-[11px] text-smoke">{t.optQuoteNote}</p>
      <Gate>
        <div className="space-y-2">
          <button type="button" disabled={!canSend} onClick={submit} className={primary}>
            {tx.busy === "approve" ? t.approving : quoting ? t.optQuoting : tx.busy ? t.sending : needsApprove ? t.approve : `Buy ${symbol} ${isCall ? "Call" : "Put"} ${tenor}`}
          </button>
          {pxErr ? <p className="font-inter text-[11.5px] text-dawn">{t.stale}</p> : null}
          {overCap && caps.data !== undefined ? <p className="font-inter text-[11.5px] text-dawn">Premium above per-option cap ({fmtUsd(caps.data, 6, 0)} USDG) — reduce quantity.</p> : null}
          {qErr ? <p role="alert" className="font-inter text-[11.5px] text-dawn">{qErr}</p> : null}
          {tx.error ? <p role="alert" className="font-inter text-[11.5px] text-dawn">{t.failed} {tx.error}</p> : null}
        </div>
      </Gate>
    </div>
  );
}

type Opt = { owner: `0x${string}`; expiry: bigint; isCall: boolean; status: number; token: `0x${string}`; strike: bigint; quantity: bigint; premium: bigint; maxPayout: bigint };

function useWalletOptions() {
  const { address, onChain } = useReady();
  const ids = useReadContract({ address: OPTIONS ?? undefined, abi: optionsAbi, functionName: "optionsOf", args: address ? [address] : undefined, chainId: C, query: { enabled: !!OPTIONS && !!address && onChain, refetchInterval: 15_000 } });
  const list = (ids.data ?? []) as readonly bigint[];
  const q = useReadContracts({
    contracts: list.map((id) => ({ address: OPTIONS!, abi: optionsAbi, functionName: "getOption" as const, args: [id] as const, chainId: C })),
    query: { enabled: list.length > 0, refetchInterval: 15_000 },
  });
  const all = list.map((id, i) => ({ id, o: q.data?.[i]?.result as Opt | undefined })).filter((x): x is { id: bigint; o: Opt } => !!x.o);
  return { all, loading: ids.isLoading || q.isLoading };
}

const qtyFmt = (w: bigint) => (Number(w) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 6 });
const td = "px-3 py-2.5 font-plex text-[12.5px] whitespace-nowrap";

function OptionRow({ id, o }: { id: bigint; o: Opt }) {
  const { price } = useOraclePrice(o.token);
  const now = useNow();
  const expired = Number(o.expiry) <= now;
  const intrinsic = price ? (o.isCall ? (price > o.strike ? price - o.strike : 0n) : o.strike > price ? o.strike - price : 0n) : undefined;
  let value = intrinsic !== undefined ? (intrinsic * o.quantity) / 10n ** 18n / 10n ** 12n : undefined;
  if (value !== undefined && value > o.maxPayout) value = o.maxPayout;
  return (
    <tr className="border-t border-white/[0.05]">
      <td className={`${td} text-ivory`}>{symbolOf(C, o.token) ?? "—"} <span className={o.isCall ? "text-dawn" : "text-ivory/70"}>{o.isCall ? "Call" : "Put"}</span> <span className="text-smoke">#{String(id)}</span></td>
      <td className={`${td} text-right text-haze`}>{fmtPx(o.strike)}</td>
      <td className={`${td} text-right text-haze`}>{new Date(Number(o.expiry) * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</td>
      <td className={`${td} text-right text-haze`}>{qtyFmt(o.quantity)}</td>
      <td className={`${td} text-right text-haze`}>{fmtUsd(o.premium)}</td>
      <td className={`${td} text-right text-haze`}>{price ? fmtPx(price) : "—"}</td>
      <td className={`${td} text-right ${value ? "text-dawn" : "text-haze"}`}>{value !== undefined ? fmtUsd(value) : "—"}</td>
      <td className={`${td} text-right text-smoke`}>{expired ? t.awaitingSettle : "Open"}</td>
    </tr>
  );
}

export function LiveOptionsPositions({ token }: { token?: string | null }) {
  const mounted = useMounted();
  const { connected, onChain } = useReady();
  const { all, loading } = useWalletOptions();
  if (!mounted || !connected || !onChain || !OPTIONS) return null;
  const open = all.filter((x) => x.o.status === 1 && (!token || x.o.token.toLowerCase() === token.toLowerCase())).reverse();
  if (!open.length) return <p className="px-5 py-6 font-inter text-[13px] text-haze">{loading ? "—" : t.noOptions}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr>
            <th className={`${th} text-left`}>Option</th><th className={th}>Strike</th><th className={th}>Expiry</th><th className={th}>Qty</th><th className={th}>Premium</th><th className={th}>Mark</th><th className={th}>Intrinsic</th><th className={th}>Status</th>
          </tr>
        </thead>
        <tbody>{open.map(({ id, o }) => <OptionRow key={String(id)} id={id} o={o} />)}</tbody>
      </table>
    </div>
  );
}

const evBought = parseAbiItem("event OptionBought(uint256 indexed id, address indexed owner, address indexed token, bool isCall, uint256 strike, uint64 expiry, uint256 quantity, uint256 premium, uint256 maxPayout)");
const evSettled = parseAbiItem("event OptionSettled(uint256 indexed id, address indexed owner, uint256 settlementPrice, uint256 payout)");
const evVoided = parseAbiItem("event OptionVoided(uint256 indexed id, address indexed owner, uint256 refund)");

type OptHist = { kind: "Buy" | "Settled" | "Voided"; id: string; block: string; tx: string; price?: string; amount: string };

/** Options events of the wallet, same chunked + localStorage-cached scan as Perps history (testnet). */
function useOptionsHistory() {
  const { address, onChain } = useReady();
  const client = usePublicClient({ chainId: C });
  const { all } = useWalletOptions();
  const key = address ? `meridian.opthist.${C}.${OPTIONS}.${address.toLowerCase()}` : null;
  const [state, setState] = useState<{ key: string | null; rows: OptHist[]; scanning: boolean; error?: string }>({ key: null, rows: [], scanning: false });
  const has = all.length > 0;

  useEffect(() => {
    if (!client || !key || !address || !OPTIONS || !onChain || !has) return;
    let stop = false;
    const run = async () => {
      let cache: { to: string; rows: OptHist[] } | null = null;
      try { cache = JSON.parse(localStorage.getItem(key) ?? "null"); } catch {}
      const head = await client.getBlockNumber();
      if (cache && BigInt(cache.to) >= head) { setState({ key, rows: cache.rows, scanning: false }); return; }
      // first scan: find the first OptionBought by walking back until we pass the oldest option's buy
      let from: bigint;
      if (cache) from = BigInt(cache.to) + 1n;
      else {
        const latest = await client.getBlock();
        const back = await client.getBlock({ blockNumber: head > 200_000n ? head - 200_000n : 0n });
        const spb = Number(latest.timestamp - back.timestamp) / Number(head - back.number || 1n);
        // options can be bought up to 45d before expiry; bound the scan by the earliest expiry
        const firstExp = all.reduce((m, x) => (x.o.expiry < m ? x.o.expiry : m), all[0].o.expiry);
        const est = head - BigInt(Math.ceil((Math.max(0, Number(latest.timestamp) - Number(firstExp)) + 45 * 86400) / spb));
        const floor = OPTIONS_START[C] ?? 0n;
        from = est > floor ? est : floor;
      }
      let rows = cache?.rows ?? [];
      setState({ key, rows, scanning: true });
      const args = { owner: address };
      for (let a = from; a <= head && !stop; a += MAX_RANGE + 1n) {
        const b = a + MAX_RANGE > head ? head : a + MAX_RANGE;
        const [x, y, z] = await Promise.all([
          client.getLogs({ address: OPTIONS!, event: evBought, args, fromBlock: a, toBlock: b }),
          client.getLogs({ address: OPTIONS!, event: evSettled, args, fromBlock: a, toBlock: b }),
          client.getLogs({ address: OPTIONS!, event: evVoided, args, fromBlock: a, toBlock: b }),
        ]);
        rows = rows.concat(
          x.map((e) => ({ kind: "Buy" as const, id: String(e.args.id), block: String(e.blockNumber), tx: e.transactionHash, amount: String(e.args.premium) })),
          y.map((e) => ({ kind: "Settled" as const, id: String(e.args.id), block: String(e.blockNumber), tx: e.transactionHash, price: String(e.args.settlementPrice), amount: String(e.args.payout) })),
          z.map((e) => ({ kind: "Voided" as const, id: String(e.args.id), block: String(e.blockNumber), tx: e.transactionHash, amount: String(e.args.refund) })),
        );
        const seen = new Set<string>();
        rows = rows.filter((r) => { const kk = r.tx + r.kind + r.id; if (seen.has(kk)) return false; seen.add(kk); return true; });
        localStorage.setItem(key, JSON.stringify({ to: String(b), rows }));
        if (!stop) setState({ key, rows, scanning: b < head });
      }
    };
    run().catch((e) => !stop && setState((s) => ({ ...s, key, scanning: false, error: (e as { shortMessage?: string }).shortMessage ?? String(e) })));
    const iv = setInterval(() => run().catch(() => {}), 30_000);
    return () => { stop = true; clearInterval(iv); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, key, address, onChain, has]);

  const byId = new Map(all.map((x) => [String(x.id), x.o]));
  const rows = state.key === key ? state.rows : [];
  return { rows: [...rows].sort((a, b) => Number(BigInt(b.block) - BigInt(a.block))), byId, scanning: state.scanning, error: state.error };
}

export function LiveOptionsHistory({ token }: { token?: string | null }) {
  const mounted = useMounted();
  const { connected, onChain } = useReady();
  const { rows, byId, scanning, error } = useOptionsHistory();
  if (!mounted || !connected || !onChain || !OPTIONS) return null;
  const list = rows.filter((r) => !token || byId.get(r.id)?.token.toLowerCase() === token.toLowerCase());
  if (!list.length) return <p className="px-5 py-6 font-inter text-[13px] text-haze">{error ? `History unavailable: ${error}` : scanning ? "Loading history…" : t.noOptHistory}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr>
            <th className={`${th} text-left`}>Option</th><th className={`${th} text-left`}>Event</th><th className={th}>Strike</th><th className={th}>Settlement px</th><th className={th}>Amount</th><th className={th}>Tx</th>
          </tr>
        </thead>
        <tbody>
          {list.map((r) => {
            const o = byId.get(r.id);
            return (
              <tr key={r.tx + r.kind + r.id} className="border-t border-white/[0.05]">
                <td className={`${td} text-ivory`}>{o ? symbolOf(C, o.token) ?? "—" : "—"} {o ? <span className={o.isCall ? "text-dawn" : "text-ivory/70"}>{o.isCall ? "Call" : "Put"}</span> : null} <span className="text-smoke">#{r.id}</span></td>
                <td className={`${td} text-haze`}>{r.kind === "Buy" ? "Buy (premium)" : r.kind === "Settled" ? "Settled (payout)" : "Voided (refund)"}</td>
                <td className={`${td} text-right text-haze`}>{o ? fmtPx(o.strike) : "—"}</td>
                <td className={`${td} text-right text-haze`}>{r.price ? fmtPx(BigInt(r.price)) : "—"}</td>
                <td className={`${td} text-right ${r.kind === "Buy" ? "text-ivory/70" : BigInt(r.amount) > 0n ? "text-dawn" : "text-haze"}`}>{r.kind === "Buy" ? "−" : "+"}{fmtUsd(BigInt(r.amount))}</td>
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
