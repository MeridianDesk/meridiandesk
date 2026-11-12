import { NextResponse } from "next/server";
import { createPublicClient, fallback, http, isAddress, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ACTIVE_CHAIN_ID } from "@/content/chain";
import { deployed } from "@/content/deployments";
import { optionsAbi, oracleAbi, registryAbi } from "@/lib/abi";
import { bs, expiryFor, STRIKE_OFFSETS, TENORS, DESK_IV, type Tenor } from "@/lib/bs";
import { rhMainnet, rhTestnet } from "@/lib/wagmi";

/**
 * Options quoter (testnet + mainnet). Prices with flat-IV Black-Scholes off the on-chain oracle mark and
 * returns an EIP-712 Quote signed by QUOTER_PK (server-only env, must hold QUOTER_ROLE).
 * The contract re-checks everything (deadline, buyer, nonce, caps, oracle liveness).
 * Dynamic by nature (reads the request); no segment config needed under cacheComponents.
 */

const C = ACTIVE_CHAIN_ID;
const chain = C === rhTestnet.id ? rhTestnet : rhMainnet;
const OPTIONS = deployed(C, "OptionsEngine");
const ROUTER = deployed(C, "OracleRouter");
const REGISTRY = deployed(C, "MarketRegistry");
const QUOTE_TTL = 60; // seconds


const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function GET(req: Request) {
  if (C !== 46630 && C !== 4663) return bad("Unsupported chain", 403);
  const pk = process.env.QUOTER_PK;
  if (!pk || !/^0x[0-9a-fA-F]{64}$/.test(pk)) return bad("Quoter not configured", 503);
  if (!OPTIONS || !ROUTER || !REGISTRY) return bad("Options not deployed", 503);

  const q = new URL(req.url).searchParams;
  const buyer = q.get("buyer") ?? "";
  const token = q.get("token") ?? "";
  const isCall = q.get("type") === "call";
  const tenor = q.get("tenor") as Tenor;
  const k = Number(q.get("strike"));
  const qty = q.get("qty") ?? "";
  if (!isAddress(buyer) || !isAddress(token)) return bad("Bad address");
  if (!(tenor in TENORS)) return bad("Bad expiry");
  if (!Number.isInteger(k) || k < 0 || k >= STRIKE_OFFSETS.length) return bad("Bad strike");
  if (!/^\d+(\.\d{1,6})?$/.test(qty)) return bad("Bad quantity");
  const quantity = parseUnits(qty as `${number}`, 18);
  if (quantity === 0n) return bad("Bad quantity");

  const client = createPublicClient({ chain, transport: fallback(chain.rpcUrls.default.http.map((u) => http(u))) });
  const [enabled, [spotWad], maxPremium] = await Promise.all([
    client.readContract({ address: REGISTRY, abi: registryAbi, functionName: "isOptionsEnabled", args: [token] }),
    client.readContract({ address: ROUTER, abi: oracleAbi, functionName: "price", args: [token] }),
    client.readContract({ address: OPTIONS, abi: optionsAbi, functionName: "maxPremiumPerOption" }),
  ]).catch(() => [false, [0n], 0n] as const);
  if (!enabled) return bad("Options not enabled for this market", 409);
  if (spotWad === 0n) return bad("Oracle unavailable", 503);

  const now = Math.floor(Date.now() / 1000);
  const expiry = expiryFor(tenor, now);
  const spot = Number(spotWad) / 1e18;
  const strikeCents = Math.round(spot * (1 + STRIKE_OFFSETS[k]) * 100);
  const strike = BigInt(strikeCents) * 10n ** 16n;
  const { premium: unit, delta } = bs(isCall, spot, strikeCents / 100, (expiry - now) / 31_536_000, DESK_IV);
  // premium in USDG (6 dp), rounded up; floor at 0.01 so deep OTM still prices
  const premium = BigInt(Math.max(10_000, Math.ceil(unit * Number(qty) * 1e6)));
  if (premium > maxPremium) return bad(`Premium above per-option cap (${Number(maxPremium) / 1e6} USDG) — reduce quantity`, 422);

  const nonce = BigInt(`0x${Buffer.from(crypto.getRandomValues(new Uint8Array(31))).toString("hex")}`);
  const quote = { buyer, token, isCall, strike, expiry: BigInt(expiry), quantity, premium, deadline: BigInt(now + QUOTE_TTL), nonce };
  const account = privateKeyToAccount(pk as `0x${string}`);
  const signature = await account.signTypedData({
    domain: { name: "Meridian Desk Options", version: "1", chainId: C, verifyingContract: OPTIONS },
    types: {
      Quote: [
        { name: "buyer", type: "address" }, { name: "token", type: "address" }, { name: "isCall", type: "bool" },
        { name: "strike", type: "uint256" }, { name: "expiry", type: "uint64" }, { name: "quantity", type: "uint256" },
        { name: "premium", type: "uint256" }, { name: "deadline", type: "uint64" }, { name: "nonce", type: "uint256" },
      ],
    },
    primaryType: "Quote",
    message: quote,
  });
  const str = (v: bigint | string | boolean) => (typeof v === "bigint" ? v.toString() : v);
  return NextResponse.json({
    quote: Object.fromEntries(Object.entries(quote).map(([a, b]) => [a, str(b)])),
    signature,
    spot: spotWad.toString(),
    delta,
    iv: DESK_IV,
  });
}
