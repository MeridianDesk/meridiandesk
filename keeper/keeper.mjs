#!/usr/bin/env node
// Meridian keeper — three jobs, one loop:
//   1. mirror   (testnet 46630 only) copy mainnet Chainlink answers into the MirrorFeeds
//   2. liquidate  scan open perps positions, call liquidate(id) when positionHealth says so
//   2b. cross   scan Cross accounts (Deposited/CrossOpened logs), call liquidate(user) when accountSnapshot says so
//   3. settle     find the Chainlink round that brackets each expired option, call settle(id, roundId)
// Funding needs no keeper: PerpsEngine accrues it lazily on every open/close/liquidate.
//
// Default is DRY RUN (reads only, prints what it would send). Pass --live to send transactions.
// Keys come ONLY from env (keeper/.env, gitignored):
//   KEEPER_PK  any funded key — liquidate/settle are permissionless (earns liqFee)
//   PUSHER_PK  testnet only — must be the MirrorFeed pusher (immutable, = deployer)
// Usage: node keeper.mjs [--live] [--once] [--interval=15] [--chain=46630]

import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { createPublicClient, createWalletClient, http, fallback, parseAbi, formatUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { robinhood, robinhoodTestnet } from "viem/chains";

const here = new URL(".", import.meta.url).pathname;
if (existsSync(here + ".env")) {
  for (const l of readFileSync(here + ".env", "utf8").split("\n")) {
    const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1] ?? d;
const LIVE = process.argv.includes("--live");
const ONCE = process.argv.includes("--once");
const INTERVAL = Number(arg("interval", "15")) * 1000;
const CHAIN = Number(arg("chain", "46630"));
const MIRROR_MAX_AGE = Number(process.env.MIRROR_MAX_AGE ?? 600); // push when mirror older than this (s)
const MIRROR_DEV_BPS = Number(process.env.MIRROR_DEV_BPS ?? 10); // …or deviates more than this

const dep = JSON.parse(readFileSync(new URL("../contracts/deployments/" + CHAIN + ".json", import.meta.url)));
let markets = {};
const lf = new URL("../contracts/deployments/listed." + CHAIN + ".json", import.meta.url);
if (existsSync(lf)) markets = JSON.parse(readFileSync(lf)).markets ?? JSON.parse(readFileSync(lf));
else markets = JSON.parse(readFileSync(new URL("../apps/web/src/content/deployments.json", import.meta.url)))[String(CHAIN)]?.markets ?? {};

const rpcs = (env, list) => (process.env[env] ? [process.env[env]] : list); // explicit RPC = use only it
const testRpc = rpcs("RH_RPC_TESTNET", ["https://robinhood-sepolia-rpc.publicnode.com", "https://rpc.testnet.chain.robinhood.com"]);
const mainRpc = rpcs("RH_RPC_MAINNET", ["https://robinhood-rpc.publicnode.com", "https://robinhood.drpc.org", "https://rpc.mainnet.chain.robinhood.com"]);
const chain = CHAIN === 46630 ? robinhoodTestnet : robinhood;
const pub = createPublicClient({ chain, transport: fallback((CHAIN === 46630 ? testRpc : mainRpc).map((u) => http(u))) });
const mainPub = createPublicClient({ chain: robinhood, transport: fallback(mainRpc.map((u) => http(u))) });

const wallet = (pk) => (pk ? createWalletClient({ chain, account: privateKeyToAccount(pk.startsWith("0x") ? pk : "0x" + pk), transport: fallback((CHAIN === 46630 ? testRpc : mainRpc).map((u) => http(u))) }) : null);
const keeper = wallet(process.env.KEEPER_PK);
const pusher = CHAIN === 46630 ? wallet(process.env.PUSHER_PK) : null;

const agg = parseAbi([
  "function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)",
  "function getRoundData(uint80) view returns (uint80,int256,uint256,uint256,uint80)",
  "function pusher() view returns (address)",
  "function push(int256) returns (uint80)",
]);
const perpsAbi = parseAbi([
  "function nextPositionId() view returns (uint256)",
  "function frozen() view returns (bool)",
  "function getPosition(uint256) view returns ((address owner,uint64 openedAt,uint16 leverageBps,bool isLong,bool open,address token,uint128 collateral,uint128 size,uint128 entryPrice,uint128 entryFunding))",
  "function positionHealth(uint256) view returns (int256 pnl,uint256 funding,int256 equity,uint256 maintenance,bool liquidatable)",
  "function liquidate(uint256)",
]);
const optAbi = parseAbi([
  "function nextOptionId() view returns (uint256)",
  "function getOption(uint256) view returns ((address owner,uint64 expiry,bool isCall,uint8 status,address token,uint128 strike,uint128 quantity,uint128 premium,uint128 maxPayout))",
  "function settle(uint256,uint80)",
]);
const crossAbi = parseAbi([
  "event Deposited(address indexed user, uint256 amount)",
  "event CrossOpened(address indexed user, address indexed token, bool isLong, uint16 leverageBps, uint256 size, uint256 price, uint256 fee)",
  "function accountSnapshot(address) view returns ((uint256 crossWalletBalance,int256 crossPerpUPnL,uint256 longOptionMark,uint256 longOptionCounted,int256 crossEquityRaw,uint256 crossEquity,uint256 crossIM,uint256 crossMM,uint256 perpNotional,uint256 marginRatioWad,uint256 freeCollateral,uint256 withdrawable,bool liquidatable,bool backstopEligible))",
  "function liquidate(address)",
]);
const regAbi = parseAbi(["function oracleOf(address) view returns (address,uint32)"]);

const ts = () => new Date().toISOString().slice(11, 19);
const log = (job, msg) => console.log(`${ts()} [${job}] ${msg}`);
const px = (a, d = 8) => Number(formatUnits(a, d)).toFixed(2);

// Track ids we already know are closed/settled so the scan stays cheap.
const done = { pos: new Set(), opt: new Set() };

async function send(w, job, req) {
  if (!LIVE || !w) { log(job, `DRY-RUN would call ${req.functionName}(${req.args.join(", ")})${!w && LIVE ? " — missing key" : ""}`); return; }
  try {
    await pub.simulateContract({ ...req, account: w.account });
    const hash = await w.writeContract(req);
    const r = await pub.waitForTransactionReceipt({ hash });
    log(job, `${req.functionName}(${req.args.join(", ")}) → ${r.status} ${hash}`);
  } catch (e) {
    log(job, `${req.functionName} failed: ${e.shortMessage ?? e.message}`);
  }
}

async function mirror() {
  if (CHAIN !== 46630) return;
  for (const [sym, m] of Object.entries(markets)) {
    const Z = /^0x0{40}$/i;
    if (!m?.feed || !m.sourceFeed || Z.test(m.feed) || Z.test(m.sourceFeed)) continue;
    const [[, src, , srcTs], [, cur, , curTs]] = await Promise.all([
      mainPub.readContract({ address: m.sourceFeed, abi: agg, functionName: "latestRoundData" }),
      pub.readContract({ address: m.feed, abi: agg, functionName: "latestRoundData" }),
    ]);
    const age = Math.floor(Date.now() / 1000) - Number(curTs);
    const dev = cur > 0n ? Number(((src > cur ? src - cur : cur - src) * 10000n) / cur) : 1e9;
    const stale = age > MIRROR_MAX_AGE || dev > MIRROR_DEV_BPS;
    log("mirror", `${sym} mainnet ${px(src)} (src age ${Math.floor(Date.now() / 1000) - Number(srcTs)}s) · mirror ${px(cur)} age ${age}s dev ${dev}bps${stale ? " → push" : ""}`);
    if (stale) await send(pusher, "mirror", { address: m.feed, abi: agg, functionName: "push", args: [src] });
  }
}

async function liquidate() {
  if (await pub.readContract({ address: dep.PerpsEngine, abi: perpsAbi, functionName: "frozen" })) return log("liq", "engine frozen — skip");
  const next = Number(await pub.readContract({ address: dep.PerpsEngine, abi: perpsAbi, functionName: "nextPositionId" }));
  let open = 0;
  for (let id = 1; id < next; id++) {
    if (done.pos.has(id)) continue;
    const p = await pub.readContract({ address: dep.PerpsEngine, abi: perpsAbi, functionName: "getPosition", args: [BigInt(id)] });
    if (!p.open) { done.pos.add(id); continue; }
    open++;
    let h;
    try { h = await pub.readContract({ address: dep.PerpsEngine, abi: perpsAbi, functionName: "positionHealth", args: [BigInt(id)] }); }
    catch (e) { log("liq", `#${id} health read failed (${e.shortMessage ?? e.message}) — oracle stale?`); continue; }
    const [, , equity, maint, liq] = h;
    if (liq) {
      log("liq", `#${id} ${p.isLong ? "long" : "short"} equity ${px(equity, 6)} < maint ${px(maint, 6)} → liquidate`);
      await send(keeper, "liq", { address: dep.PerpsEngine, abi: perpsAbi, functionName: "liquidate", args: [BigInt(id)] });
    }
  }
  log("liq", `scanned ${next - 1} ids · ${open} open`);
}

// Cross accounts: discovered from logs once, then incrementally. Start block per chain (deploy block).
const CROSS_START = { 46630: 153_088_089n, 4663: 113_997_727n }[CHAIN] ?? BigInt(process.env.CROSS_START_BLOCK ?? 0);
// Scan progress persists across restarts (keeper/.cross-<chain>.json, gitignored) so a slow free-tier backfill runs once.
const crossFile = here + `.cross-${CHAIN}.json`;
const crossSaved = existsSync(crossFile) ? JSON.parse(readFileSync(crossFile, "utf8")) : null;
const crossUsers = new Set(crossSaved?.users ?? []);
let crossFrom = crossSaved ? BigInt(crossSaved.from) : CROSS_START;
const saveCross = () => writeFileSync(crossFile, JSON.stringify({ from: crossFrom.toString(), users: [...crossUsers] }));
async function crossScan() {
  if (!dep.CrossMarginAccount) return;
  const head = await pub.getBlockNumber();
  const STEP = BigInt(process.env.LOG_STEP ?? 5_000);
  for (let a = crossFrom; a <= head; a += STEP) {
    const b = a + STEP - 1n < head ? a + STEP - 1n : head;
    let logs;
    for (let t = 0; ; t++) {
      try { logs = await pub.getLogs({ address: dep.CrossMarginAccount, events: crossAbi.filter((x) => x.type === "event"), fromBlock: a, toBlock: b }); break; }
      catch (e) { if (t >= 4) { saveCross(); throw e; } await new Promise((r) => setTimeout(r, 1500 * (t + 1))); } // free-tier RPC: back off + retry
    }
    for (const l of logs) crossUsers.add(l.args.user);
    crossFrom = b + 1n;
    if (STEP <= 100n) await new Promise((r) => setTimeout(r, 120)); // stay under free-tier rate limits
  }
  saveCross();
}

async function crossLiquidate() {
  if (!dep.CrossMarginAccount) return;
  await crossScan();
  let checked = 0, stale = 0;
  for (const u of crossUsers) {
    let s;
    try { s = await pub.readContract({ address: dep.CrossMarginAccount, abi: crossAbi, functionName: "accountSnapshot", args: [u] }); }
    catch { stale++; continue; } // a stale Cross price reverts the snapshot → liquidation paused by design
    checked++;
    if (s.perpNotional === 0n || !s.liquidatable) continue;
    const ratio = s.marginRatioWad === 2n ** 256n - 1n ? "∞" : (Number(s.marginRatioWad) / 1e16).toFixed(1) + "%";
    log("xliq", `${u} equity ${px(s.crossEquity, 6)} MM ${px(s.crossMM, 6)} ratio ${ratio}${s.backstopEligible ? " BACKSTOP" : ""} → liquidate`);
    await send(keeper, "xliq", { address: dep.CrossMarginAccount, abi: crossAbi, functionName: "liquidate", args: [u] });
  }
  log("xliq", `${crossUsers.size} Cross accounts · ${checked} checked${stale ? ` · ${stale} snapshot reverted (oracle stale?)` : ""}`);
}

/** Round r with ts(r) ≤ expiry < ts(r+1), walking back from latest within the current phase. */
async function bracketRound(feed, expiry) {
  const [latest, , , latestTs] = await pub.readContract({ address: feed, abi: agg, functionName: "latestRoundData" });
  if (latestTs <= expiry) return null; // no round after expiry yet
  let r = latest;
  for (let i = 0; i < 2000 && r > 0n; i++) {
    const prev = r - 1n;
    let t;
    try { [, , , t] = await pub.readContract({ address: feed, abi: agg, functionName: "getRoundData", args: [prev] }); } catch { return null; }
    if (t === 0n) return null;
    if (t <= expiry) return prev;
    r = prev;
  }
  return null;
}

async function settle() {
  const next = Number(await pub.readContract({ address: dep.OptionsEngine, abi: optAbi, functionName: "nextOptionId" }));
  const now = (await pub.getBlock()).timestamp; // chain time, not wall clock
  let pending = 0;
  for (let id = 1; id < next; id++) {
    if (done.opt.has(id)) continue;
    const o = await pub.readContract({ address: dep.OptionsEngine, abi: optAbi, functionName: "getOption", args: [BigInt(id)] });
    if (o.status !== 1) { done.opt.add(id); continue; } // enum Status { None, Open, Settled, Voided }
    if (o.expiry > now) continue;
    pending++;
    const [feed] = await pub.readContract({ address: dep.MarketRegistry, abi: regAbi, functionName: "oracleOf", args: [o.token] });
    const round = await bracketRound(feed, o.expiry);
    if (round === null) { log("settle", `#${id} expired, no bracketing round yet`); continue; }
    // Cross long options are held by CrossOptionBook: settle through it so the payout lands in the Cross wallet.
    const viaBook = dep.CrossOptionBook && o.owner.toLowerCase() === dep.CrossOptionBook.toLowerCase();
    log("settle", `#${id} ${o.isCall ? "call" : "put"}${viaBook ? " (Cross)" : ""} expiry ${o.expiry} → round ${round}`);
    await send(keeper, "settle", { address: viaBook ? dep.CrossOptionBook : dep.OptionsEngine, abi: optAbi, functionName: "settle", args: [BigInt(id), round] });
  }
  log("settle", `scanned ${next - 1} ids · ${pending} awaiting settlement`);
}

async function tick() {
  for (const [name, fn] of [["mirror", mirror], ["liq", liquidate], ["xliq", crossLiquidate], ["settle", settle]]) {
    try { await fn(); } catch (e) { log(name, `error: ${e.shortMessage ?? e.message}`); }
  }
}

log("boot", `chain ${CHAIN} · ${LIVE ? "LIVE" : "DRY-RUN"} · keeper ${keeper?.account.address ?? "—"} · pusher ${pusher?.account.address ?? "—"}`);
if (pusher && CHAIN === 46630) {
  for (const m of Object.values(markets)) if (m?.feed && !/^0x0{40}$/i.test(m.feed)) {
    const p = await pub.readContract({ address: m.feed, abi: agg, functionName: "pusher" });
    if (p.toLowerCase() !== pusher.account.address.toLowerCase()) { log("boot", `PUSHER_PK is not the feed pusher (${p})`); process.exit(1); }
  }
}
await tick();
if (!ONCE) setInterval(tick, INTERVAL);
