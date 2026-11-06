# ADR-001 — Meridian Desk on-chain risk model (v1, guarded)

Status: PROPOSED (needs maintainer + external audit before mainnet)
Date: 2026-11-06
Scope: contracts/ (Foundry, solc 0.8.24, OpenZeppelin 5)

## Decision

Meridian Desk v1 is an oracle-priced, pool-backed design written from scratch. It is not a fork of any
existing perps codebase and not an order book.

    MarketRegistry   every Stock Token (204 now), symbol, token, Chainlink proxy, staleness, desk flags
    OracleRouter     Chainlink AggregatorV3 → 1e18; reverts on stale / missing / ≤0; expiry-round proof
    LiquidityPool    ERC-4626 USDG vault (mLP), counterparty for both desks, reservations
    PerpsEngine      isolated-margin perps, leverage ∈ {1×, 1.25×, 1.5×, 2×}
    OptionsEngine    buy-to-open European calls/puts, cash-settled in USDG at expiry

Perps and Options are separate contracts with separate positions and entry points. They share only
the backstop liquidity.

## Perps

- Leverage. `open()` accepts exactly 10000/12500/15000/20000 bps and nothing else. After fees it
  also checks that size/collateral ≤ 2×. Fuzz tests cover every other uint16 plus effective leverage.
- Margin. Isolated per position, USDG only. The fee is taken from collateral up front, and the
  size is solved so that size = net × leverage.
- Price. Chainlink price at execution, with the user-supplied `acceptablePrice` as the slippage guard.
- Backing. The max profit per position equals its notional. The notional is reserved in the pool at
  open, so every open position is fully paid for. The pool also caps utilisation (80% by default).
- Liquidation. Permissionless once equity < maintenance (5% of notional, PROPOSED). The keeper earns
  1% of notional, capped at the collateral. Leftover equity goes to the trader. Bad debt stays with
  the pool. The README and UI say it plainly: low leverage does not remove liquidation risk. The
  test suite liquidates a 1× long.
- Funding. Only the heavier side pays, into the pool, at rate × skew/OI. Accrued per second.
- Exits. Pausing blocks opens only. `close` and `liquidate` keep working. The one exception is the
  separate admin-only `frozen` switch, which is reserved for oracle compromise.

## Options (v1)

- The user can only buy. There is no writing, so the buyer's max loss is the premium.
- Premium comes from an EIP-712 quote signed by a QUOTER key (RFQ). Each quote is bound to one
  buyer and carries a deadline and a single-use nonce. No pricing model runs on-chain.
- Payout is capped and reserved at purchase. A put pays at most strike × qty. A call pays at most
  strike × qty × `callPayoutCapBps` (100% by default, i.e. the payout stops growing at 2× strike).
  The premium must be ≤ maxPayout.
- Settlement. Anyone can call it and the payout always goes to the owner. The caller supplies the
  Chainlink round that was live at expiry. It is checked by requiring
  `round.updatedAt ≤ expiry < (round+1).updatedAt`.
- Void. If no valid round exists after `settlementGrace` (3 days), for example because of a feed
  outage or a proxy phase change, the admin multisig may void the option and refund the premium.
  Void is admin-only. A permissionless void would let out-of-the-money buyers reclaim their premium.

## Oracle

- Feeds come from the Chainlink Robinhood mainnet directory. A fork test checks all 35 proxies
  on-chain: `description()` matches the symbol, `decimals()` = 8, and the token's `symbol()`
  matches. The heartbeat is 24h with a 0.5% deviation threshold.
- Registry staleness defaults to heartbeat + 600s.
- OPEN QUESTION. Stock Token feeds run 24/5, so a 24h staleness lets new trades open on Friday's
  closing price over the weekend. v1 mitigation: `maxOpenPriceAge` on both engines (new exposure
  only) plus guardian per-market pause. Candidate v2 fixes: an on-chain market-hours calendar or
  Chainlink Data Streams. This needs a PM decision.
- Markets without a feed (169 of 204) can be listed but cannot be enabled (`OracleRequired`), which
  matches the UI label "Oracle unavailable".

## Governance / guarded launch

- ADMIN is a Safe multisig. Deploy.s.sol grants it every admin role and renounces the deployer.
- GUARDIAN is an optional hot key that can pause but cannot unpause.
- Launch caps (USDG): $10–$1,000 per position, $25k total perps collateral, $50k LP deposit cap,
  $10k per-tx LP withdraw, options $500 max premium / $50k total max payout.
- All numbers are PROPOSED and can be changed by the multisig within hard limits: fee ≤ 1%,
  funding ≤ 100%/yr at full skew, maintenance < 50%, and leverage is a hard-coded constant.

## Not in v1

Cross margin, limit/stop orders, selling or writing options, early exercise, non-USDG collateral,
upgradeability (contracts are immutable, so a v2 means redeploy and migrate), and keeper or
quoter infrastructure.

## Before mainnet

1. External audit and fix review.
2. Testnet (46630) campaign with mock feeds or testnet feeds, plus keeper and quoter bots.
3. Confirm the USDG address and decimals on 4663 from the official Robinhood token table.
4. A PM decision on the weekend / market-hours policy.
