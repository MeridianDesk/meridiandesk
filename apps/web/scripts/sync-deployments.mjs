// Copies contract addresses from contracts/deployments/<chainId>.json (written by Deploy.s.sol)
// into src/content/deployments.json so the landing footer + tx links use real addresses only.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, "../../../contracts/deployments");
const out = resolve(here, "../src/content/deployments.json");
const keys = ["MarketRegistry", "OracleRouter", "LiquidityPool", "PerpsEngine", "OptionsEngine", "usdg"];
const addr = /^0x[0-9a-fA-F]{40}$/;

const result = {};
for (const id of ["4663", "46630"]) {
  const f = resolve(src, `${id}.json`);
  result[id] = {};
  if (!existsSync(f)) { console.log(`${id}: not deployed`); continue; }
  const j = JSON.parse(readFileSync(f, "utf8"));
  if (String(j.chainId) !== id) throw new Error(`${f}: chainId ${j.chainId} != ${id}`);
  for (const k of keys) if (addr.test(j[k] ?? "")) result[id][k] = j[k];
  console.log(`${id}: ${Object.keys(result[id]).length} addresses`);
}
writeFileSync(out, JSON.stringify(result, null, 2) + "\n");
console.log(`wrote ${out}`);
