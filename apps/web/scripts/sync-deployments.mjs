// Copies contract addresses from contracts/deployments/<chainId>.json (written by Deploy.s.sol)
// into src/content/deployments.json so the landing footer + tx links use real addresses only.
// Also copies listed markets (deployments/listed.<chainId>.json, written by SetupTestnet.s.sol)
// and regenerates src/lib/abi.ts from the Foundry build output (contracts/out).
// NOTE: forge writes JSON during simulation — confirm the broadcast landed on-chain before syncing.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../../contracts");
const src = resolve(root, "deployments");
const out = resolve(here, "../src/content/deployments.json");
const keys = ["MarketRegistry", "OracleRouter", "LiquidityPool", "PerpsEngine", "OptionsEngine", "CrossMarginAccount", "CrossOptionBook", "InsuranceFund", "usdg"];
const addr = /^0x[0-9a-fA-F]{40}$/;
const ZERO = "0x0000000000000000000000000000000000000000";
const real = (a) => (addr.test(a ?? "") && a !== ZERO ? a : null);

// eth_call MarketRegistry.isPerpsEnabled(token) on mainnet (public RPC, read-only).
const MAINNET_RPC = process.env.SYNC_RPC_MAINNET || "https://robinhood-rpc.publicnode.com";
async function perpsEnabledOnChain(registry, token) {
  if (!registry) return false;
  const data = "0x" + "b84f545a" + token.slice(2).toLowerCase().padStart(64, "0");
  const res = await fetch(MAINNET_RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: registry, data }, "latest"] }),
  });
  const j = await res.json();
  if (j.error) throw new Error(`isPerpsEnabled: ${j.error.message}`);
  return BigInt(j.result ?? "0x0") === 1n;
}

const result = {};
for (const id of ["4663", "46630"]) {
  const f = resolve(src, `${id}.json`);
  result[id] = {};
  if (!existsSync(f)) { console.log(`${id}: not deployed`); continue; }
  const j = JSON.parse(readFileSync(f, "utf8"));
  if (String(j.chainId) !== id) throw new Error(`${f}: chainId ${j.chainId} != ${id}`);
  for (const k of keys) if (addr.test(j[k] ?? "")) result[id][k] = j[k];
  console.log(`${id}: ${Object.keys(result[id]).length} addresses`);

  const lf = resolve(src, `listed.${id}.json`);
  if (!existsSync(lf)) continue;
  // forge writes listed.*.json during SIMULATION too. Only trust it once every tx of the
  // SetupTestnet broadcast has a successful receipt.
  // Mainnet markets are listed by the Safe (script/mainnet/batches), so there is no forge
  // broadcast to check: each market is verified on-chain via MarketRegistry instead.
  if (id !== "4663") {
    const run = resolve(root, `broadcast/SetupTestnet.s.sol/${id}/run-latest.json`);
    const r = existsSync(run) ? JSON.parse(readFileSync(run, "utf8")) : null;
    const landed = r && r.transactions?.length > 0 && r.receipts?.length === r.transactions.length && r.receipts.every((x) => x.status === "0x1");
    if (!landed) { console.log(`${id}: listed markets NOT synced — SetupTestnet broadcast has no successful receipts yet`); continue; }
  }
  const l = JSON.parse(readFileSync(lf, "utf8"));
  if (String(l.chainId) !== id) throw new Error(`${lf}: chainId ${l.chainId} != ${id}`);
  const markets = {};
  for (const [sym, m] of Object.entries(l)) {
    if (sym === "chainId" || !real(m.token)) continue;
    if (id === "4663" && !(await perpsEnabledOnChain(result[id].MarketRegistry, m.token))) {
      console.log(`4663: ${sym} NOT synced — perps not enabled on-chain yet`);
      continue;
    }
    markets[sym] = { token: m.token, feed: real(m.feed), sourceFeed: real(m.sourceFeed), perps: m.perps === true };
  }
  result[id].markets = markets;
  console.log(`${id}: ${Object.keys(markets).length} listed markets`);
}
writeFileSync(out, JSON.stringify(result, null, 2) + "\n");
console.log(`wrote ${out}`);

// ABIs — only what the web app calls.
const abiOf = (file, name = file) => {
  const f = resolve(root, `out/${file}.sol/${name}.json`);
  if (!existsSync(f)) throw new Error(`${f} missing — run \`forge build\` in contracts/`);
  return JSON.parse(readFileSync(f, "utf8")).abi;
};
const pick = (abi, names) => abi.filter((x) => (x.type === "function" && names.includes(x.name)) || x.type === "error");
const abis = {
  perpsAbi: pick(abiOf("PerpsEngine"), ["open", "close", "getPosition", "positionsOf", "positionHealth", "liquidationPrice", "marketConfig", "marketState", "minCollateral", "maxCollateralPerPosition", "frozen", "paused"]),
  poolAbi: pick(abiOf("LiquidityPool"), ["deposit", "redeem", "totalAssets", "freeLiquidity", "utilizationBps", "balanceOf", "maxRedeem", "maxDeposit", "convertToAssets", "decimals"]),
  optionsAbi: pick(abiOf("OptionsEngine"), ["buy", "getOption", "optionsOf", "payoutAt", "maxPayoutOf", "nextOptionId", "maxPremiumPerOption", "minTimeToExpiry", "maxTimeToExpiry", "totalMaxPayout", "totalMaxPayoutCap", "nonceUsed", "paused", "callPayoutCapBps"]),
  crossAbi: pick(abiOf("CrossMarginAccount"), ["deposit", "withdraw", "setMarginMode", "marginMode", "open", "close", "liquidate", "walletOf", "accountSnapshot", "positionOf", "tokensOf", "marketConfig", "params", "maxWalletPerAccount", "totalWalletCap", "totalWallets", "paused", "optionBook"]),
  crossBookAbi: pick(abiOf("CrossOptionBook"), ["buy", "settle", "optionsOf", "ownerOf", "legsOf", "MAX_OPTIONS"]),
  registryAbi: pick(abiOf("MarketRegistry"), ["isOptionsEnabled", "isPerpsEnabled"]),
  oracleAbi: pick(abiOf("OracleRouter"), ["price"]),
  // Test USDG (MockERC20) — public mint, testnet only.
  testUsdgAbi: pick(abiOf("Mocks", "MockERC20"), ["mint"]),
};
const abiOut = resolve(here, "../src/lib/abi.ts");
writeFileSync(
  abiOut,
  "// GENERATED by scripts/sync-deployments.mjs from contracts/out — do not edit by hand.\n" +
    Object.entries(abis).map(([k, v]) => `export const ${k} = ${JSON.stringify(v)} as const;\n`).join(""),
);
console.log(`wrote ${abiOut}`);
