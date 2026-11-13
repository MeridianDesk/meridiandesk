# ADR-002 — Cross margin ("Common Ledger")

Status: PROPOSED. P0 values are the dev recommendation and wait for maintainer sign-off.
Date: 2026-11-14
Parent: ADR-001 (Isolated, already live on mainnet 4663)

## Decision

We add a Cross mode next to the existing Isolated mode. Its rules follow Binance's standard cross
margin, not portfolio margin or SPAN. One USDG Cross account backs both Cross perps and Cross long
options.

- Product copy: "Common Ledger — Works like the cross margin you know." The copy must never say
  "same as Binance" and must never name Binance as a partner.
- Isolated remains the default. Existing positions keep their current behaviour.
- The margin mode is set per market. Changing it is rejected while that market still has a position
  or an order.
- v1 options in Cross are long only (option A). Long options carry IM = MM = 0. Their value counts
  toward equity with a 20% haircut, and only while the mark is fresh.
- IM and MM are summed per leg. There is no hedge discount.
- Leverage stays at 1×, 1.25×, 1.5× or 2×.

## Formulas

The formulas are implemented in `contracts/src/cross/CrossMath.sol`.
`contracts/test/CrossMath.t.sol` reproduces §6.6 exactly.

    Equity      = wallet + Σ perps uPnL + (1 − haircut) × Σ fresh long-option mark
    IM          = Σ notional / leverage                     (round up)
    MM          = Σ notional × MM_rate                      (round up)
    MarginRatio = MM / Equity
    Liquidation : Equity ≤ MM
    Backstop    : Equity < 2/3 × MM
    Free        = max(0, Equity − IM)
    Withdraw    : Equity' > IM  AND  Equity' ≥ 10% × Σ Cross perps notional  (wallet only)

## Parameter sheet (initial, recommended)

| Param | Value | Why |
|---|---|---|
| MM_rate | 25% | From the brief. Stock tokens gap on weekends, so this needs to be wide |
| OptionHaircut | 20% | From the brief |
| WithdrawFloor | 10% | From the brief (Hyperliquid) |
| Backstop | 2/3 MM | From the brief (Hyperliquid) |
| Partial liquidation | 20% per step, 30 s cooldown | From the brief (Hyperliquid) |
| **Liquidation fee** | **0.50% of closed notional**: 0.30% to the Insurance Fund, 0.20% to the keeper | See below |
| **Insurance Fund seed** | **1,000 USDG** from the treasury at beta launch. After that, Cross caps ≤ 5× IF (5,000 USDG total Cross collateral) | See below |
| Weekend / stale oracle | New Cross exposure and withdrawals are paused; liquidation waits for a fresh price | The TSLA feed stops on weekends |

Why a 0.50% liquidation fee:

- §6.6 uses 0.30% as an example. If the keeper is paid out of that same 0.30%, almost nothing is left
  to grow the Insurance Fund.
- Binance and other CEXs charge around 0.5–1.25% on liquidated notional. 0.50% is still on the
  lenient side for users, so it is easy to explain.
- The keeper's 0.20% is close to the Isolated keeper fee in ADR-001 (1%, capped at the
  collateral). On small positions the keeper still covers gas, because gas on RH Chain is cheap.
- With a 25% MM, a 0.50% fee only eats about 2% of the maintenance buffer, so after a partial close
  the account rarely gets pushed straight back to liquidation.

Why a 1,000 USDG Insurance Fund with a 5× cap:

- At 2× leverage, the bad debt that can realistically appear is a gap that exceeds MM (25%).
- A 1,000 USDG fund can absorb roughly a 20% gap beyond MM across all Cross open interest up to
  5,000 USDG. Caps are raised only after the Insurance Fund grows and an audit is complete. This
  matches the "Unaudited beta" label.

## Rollout

1. P1, testnet: MarginAccount (Cross wallet), Cross perps through CrossMath, the Isolated/Cross web
   toggle, and the Portfolio Cross card.
2. P2, testnet: Cross long options in equity, LiquidationEngine (partial and backstop),
   InsuranceFund, SessionPolicy, keeper, and indexer.
3. Mainnet: new contracts behind the same Safe 2-of-3, small caps, "Unaudited beta". Isolated v1 is
   untouched.
