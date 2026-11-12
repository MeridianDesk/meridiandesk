import { NextResponse } from "next/server";
import https from "node:https";

/**
 * Stock Token reference prices from Robinhood's official read-only Stock Token API
 * (docs.robinhood.com/chain/stock-token-apis). `tokenBid`/`tokenAsk` are already
 * multiplier-adjusted, i.e. the price of one token, not of the underlying share.
 * Tokens the API does not list yet (e.g. QNT) fall back to the underlying share price (Yahoo chart API).
 * Display only: perps/options always settle on the on-chain oracle mark.
 */

const RH = "https://api.robinhood.com/rhj/prices";
const FALLBACK = ["QNT"];

type RhQuote = { tokenSymbol: string; tokenBid?: string; tokenAsk?: string; bid?: string; ask?: string; dailyHigh?: string; dailyLow?: string; dailyTradingVolume?: string; isTradingHalt?: boolean; generatedAt?: string };
/** p = token mid; hi/lo = session range scaled to token terms; vol = underlying shares traded today. */
export type RefPrice = { p: number; hi?: number; lo?: number; vol?: number; halt: boolean; src: "rh" | "share" };
export type RefPrices = { ts: string; q: Record<string, RefPrice> };

/** Resolve via Cloudflare DNS-over-HTTPS: some ISPs (Indonesia) block *.robinhood.com at the resolver. */
async function doh(host: string): Promise<string> {
  const r = await fetch(`https://cloudflare-dns.com/dns-query?name=${host}&type=A`, { headers: { accept: "application/dns-json" }, signal: AbortSignal.timeout(5000) });
  const j = (await r.json()) as { Answer?: { type: number; data: string }[] };
  const ip = j.Answer?.find((a) => a.type === 1)?.data;
  if (!ip) throw new Error(`doh: no A record for ${host}`);
  return ip;
}

function getViaIp(url: string, ip: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { lookup: (_h, opts, cb) => (opts?.all ? cb(null, [{ address: ip, family: 4 }]) : cb(null, ip, 4)), timeout: 8000 }, (res) => {
      let b = "";
      res.on("data", (c) => (b += c));
      res.on("end", () => {
        if ((res.statusCode ?? 0) >= 400) return reject(new Error(`upstream ${res.statusCode}`));
        try { resolve(JSON.parse(b)); } catch (e) { reject(e); }
      });
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
  });
}

async function getJson(url: string): Promise<unknown> {
  try {
    const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`upstream ${r.status}`);
    return await r.json();
  } catch {
    return getViaIp(url, await doh(new URL(url).hostname));
  }
}

async function shareQuote(sym: string): Promise<Omit<RefPrice, "halt" | "src"> | null> {
  try {
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}?range=1d&interval=1d`, {
      headers: { "user-agent": "Mozilla/5.0" },
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    type Meta = { regularMarketPrice?: number; regularMarketDayHigh?: number; regularMarketDayLow?: number; regularMarketVolume?: number };
    const j = (await r.json()) as { chart?: { result?: { meta?: Meta }[] } };
    const m = j.chart?.result?.[0]?.meta;
    if (!m?.regularMarketPrice || m.regularMarketPrice <= 0) return null;
    return {
      p: m.regularMarketPrice,
      ...(m.regularMarketDayHigh && m.regularMarketDayLow ? { hi: m.regularMarketDayHigh, lo: m.regularMarketDayLow } : {}),
      ...(m.regularMarketVolume ? { vol: m.regularMarketVolume } : {}),
    };
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  void req.url; // request-bound → always dynamic; caching handled by Cache-Control below
  try {
    const j = (await getJson(RH)) as { quotes?: RhQuote[] };
    const q: Record<string, RefPrice> = {};
    let ts = "";
    for (const x of j.quotes ?? []) {
      const bid = Number(x.tokenBid ?? x.bid);
      const ask = Number(x.tokenAsk ?? x.ask);
      const p = bid > 0 && ask > 0 ? (bid + ask) / 2 : bid > 0 ? bid : ask;
      if (!(p > 0)) continue;
      // dailyHigh/Low are raw underlying; scale by the token/raw ratio (the multiplier) for token terms.
      const raw = (Number(x.bid) + Number(x.ask)) / 2;
      const k = raw > 0 ? p / raw : 1;
      const hi = Number(x.dailyHigh) * k;
      const lo = Number(x.dailyLow) * k;
      const vol = Number(x.dailyTradingVolume);
      q[x.tokenSymbol.toUpperCase()] = {
        p,
        ...(hi > 0 && lo > 0 ? { hi, lo } : {}),
        ...(vol > 0 ? { vol } : {}),
        halt: !!x.isTradingHalt,
        src: "rh",
      };
      if (x.generatedAt && x.generatedAt > ts) ts = x.generatedAt;
    }
    await Promise.all(
      FALLBACK.filter((s) => !q[s]).map(async (s) => {
        const r = await shareQuote(s);
        if (r) q[s] = { ...r, halt: false, src: "share" };
      }),
    );
    const body: RefPrices = { ts: ts || new Date().toISOString(), q };
    return NextResponse.json(body, { headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=60" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "fetch failed" }, { status: 502 });
  }
}
