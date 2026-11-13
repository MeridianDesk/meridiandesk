// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title CrossMath
/// @notice Pure Cross-account math for Common Ledger (Meridian Cross margin).
///         Standard cross margin: IM and MM are summed per leg. There is NO hedge netting
///         (no SPAN / portfolio margin). See docs/adr/ADR-002-cross-margin.md and the
///         cross-margin spec §6.
///
///         Units: every amount is USDG base units (6 decimals). Rounding is conservative:
///         IM / MM round UP, equity and option value round DOWN.
library CrossMath {
    uint256 internal constant BPS = 10_000;
    uint256 internal constant WAD = 1e18;

    error InvalidLeverage(uint256 leverageBps);

    struct Params {
        uint16 mmBps; // maintenance margin, of notional (PROPOSED 2500 = 25%)
        uint16 optionHaircutBps; // discount on long-option mark (PROPOSED 2000 = 20%)
        uint16 withdrawFloorBps; // min equity left, of Cross perps notional (PROPOSED 1000 = 10%)
        uint16 backstopBps; // backstop when equity < backstopBps * MM (PROPOSED 6667 ≈ 2/3)
    }

    /// @notice One Cross perps leg, already marked by the caller (engine) at the fresh oracle mark.
    struct PerpLeg {
        uint256 notional; // abs(size) * mark, USDG
        int256 upnl; // USDG, includes accrued funding owed
        uint16 leverageBps; // 10000 | 12500 | 15000 | 20000
    }

    /// @notice One Cross long-option leg. Long options carry IM = MM = 0 (premium is prepaid).
    struct OptionLeg {
        uint256 mark; // current mark value of the position, USDG
        bool fresh; // false → counts 0 (stale underlying / IV / closed session / near-settled)
    }

    struct Snapshot {
        uint256 crossWalletBalance;
        int256 crossPerpUPnL;
        uint256 longOptionMark;
        uint256 longOptionCounted;
        int256 crossEquityRaw;
        uint256 crossEquity;
        uint256 crossIM;
        uint256 crossMM;
        uint256 perpNotional;
        uint256 marginRatioWad; // type(uint256).max when equity <= 0
        uint256 freeCollateral;
        uint256 withdrawable;
        bool liquidatable;
        bool backstopEligible;
    }

    function isAllowedLeverage(uint256 lev) internal pure returns (bool) {
        return lev == 10_000 || lev == 12_500 || lev == 15_000 || lev == 20_000;
    }

    function _ceilDiv(uint256 a, uint256 b) private pure returns (uint256) {
        return a == 0 ? 0 : (a - 1) / b + 1;
    }

    function initialMargin(uint256 notional, uint16 leverageBps) internal pure returns (uint256) {
        if (!isAllowedLeverage(leverageBps)) revert InvalidLeverage(leverageBps);
        return _ceilDiv(notional * BPS, leverageBps);
    }

    function maintenanceMargin(uint256 notional, uint16 mmBps) internal pure returns (uint256) {
        return _ceilDiv(notional * mmBps, BPS);
    }

    /// @param wallet          Cross wallet balance (USDG)
    /// @param isolatedOpenOrderIM  IM reserved by pending Isolated orders (0 in v1: market orders only)
    function snapshot(
        Params memory p,
        uint256 wallet,
        PerpLeg[] memory perps,
        OptionLeg[] memory opts,
        uint256 isolatedOpenOrderIM
    ) internal pure returns (Snapshot memory s) {
        s.crossWalletBalance = wallet;

        for (uint256 i; i < perps.length; ++i) {
            PerpLeg memory l = perps[i];
            s.crossPerpUPnL += l.upnl;
            s.perpNotional += l.notional;
            s.crossIM += initialMargin(l.notional, l.leverageBps);
            s.crossMM += maintenanceMargin(l.notional, p.mmBps);
        }

        for (uint256 i; i < opts.length; ++i) {
            if (!opts[i].fresh) continue; // fail closed
            s.longOptionMark += opts[i].mark;
        }
        s.longOptionCounted = s.longOptionMark * (BPS - p.optionHaircutBps) / BPS; // round down

        s.crossEquityRaw = int256(wallet) + s.crossPerpUPnL + int256(s.longOptionCounted);
        s.crossEquity = s.crossEquityRaw > 0 ? uint256(s.crossEquityRaw) : 0;

        if (s.crossEquity == 0) {
            s.marginRatioWad = s.crossMM == 0 ? 0 : type(uint256).max;
        } else {
            s.marginRatioWad = _ceilDiv(s.crossMM * WAD, s.crossEquity);
        }

        uint256 used = s.crossIM + isolatedOpenOrderIM;
        s.freeCollateral = s.crossEquity > used ? s.crossEquity - used : 0;

        // Withdraw: equity' > IM' (strict) AND equity' >= floor * Σ perps notional.
        // Withdrawals reduce wallet only; unrealised PnL / option value cannot leave as cash.
        uint256 floorReq = _ceilDiv(s.perpNotional * p.withdrawFloorBps, BPS);
        uint256 keep = s.crossIM == 0 ? 0 : s.crossIM + 1;
        if (floorReq > keep) keep = floorReq;
        keep += isolatedOpenOrderIM;
        uint256 w = s.crossEquity > keep ? s.crossEquity - keep : 0;
        s.withdrawable = w < wallet ? w : wallet;

        s.liquidatable = s.crossMM > 0 && s.crossEquityRaw <= int256(s.crossMM);
        s.backstopEligible = s.crossMM > 0 && s.crossEquityRaw * int256(BPS) < int256(s.crossMM * p.backstopBps);
    }
}
