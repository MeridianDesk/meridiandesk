// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {CrossMath} from "../src/cross/CrossMath.sol";

/// @notice Reproduces the worked example of spec §6.6 (t0, t1, t2, path 1, path 2)
///         with the PROPOSED params MM 25%, haircut 20%, floor 10%, backstop 2/3.
contract CrossMathTest is Test {
    uint256 constant U = 1e6;
    uint256 constant C = 1e4; // one cent in USDG units

    CrossMath.Params P = CrossMath.Params({mmBps: 2500, optionHaircutBps: 2000, withdrawFloorBps: 1000, backstopBps: 6667});

    // Cross wallet after: deposit 10,000 − 1,000 to Isolated AAPL − 200 put premium.
    uint256 constant WALLET = 8_800 * U;
    uint256 constant ENTRY = 250;
    uint256 constant SIZE = 60;

    function _snap(uint256 wallet, uint256 size, uint256 mark, uint256 putMark, bool fresh)
        internal
        view
        returns (CrossMath.Snapshot memory)
    {
        CrossMath.PerpLeg[] memory perps = new CrossMath.PerpLeg[](1);
        perps[0] = CrossMath.PerpLeg({
            notional: size * mark * U,
            upnl: int256(size * mark * U) - int256(size * ENTRY * U),
            leverageBps: 20_000
        });
        CrossMath.OptionLeg[] memory opts = new CrossMath.OptionLeg[](1);
        opts[0] = CrossMath.OptionLeg({mark: putMark * U, fresh: fresh});
        return CrossMath.snapshot(P, wallet, perps, opts, 0);
    }

    function test_t0_healthy() public view {
        CrossMath.Snapshot memory s = _snap(WALLET, SIZE, 250, 200, true);
        assertEq(s.longOptionCounted, 160 * U);
        assertEq(s.crossEquity, 8_960 * U);
        assertEq(s.crossIM, 7_500 * U);
        assertEq(s.crossMM, 3_750 * U);
        assertEq(s.freeCollateral, 1_460 * U);
        assertEq(s.marginRatioWad / 1e14, 4185); // 41.85%
        assertEq(s.withdrawable / C, 145_999); // 1,459.99 at 2 decimals
        assertFalse(s.liquidatable);
    }

    function test_t1_optionSupports() public view {
        CrossMath.Snapshot memory s = _snap(WALLET, SIZE, 220, 320, true);
        assertEq(s.crossPerpUPnL, -1_800 * int256(U));
        assertEq(s.longOptionCounted, 256 * U);
        assertEq(s.crossEquity, 7_256 * U);
        assertEq(s.crossIM, 6_600 * U); // no hedge discount (anti-SPAN)
        assertEq(s.crossMM, 3_300 * U);
        assertEq((s.marginRatioWad + 0.5e14) / 1e14, 4548); // 0.454795… → 45.48% displayed
        assertEq(s.freeCollateral, 656 * U);
    }

    function test_t2_liquidatable() public view {
        CrossMath.Snapshot memory s = _snap(WALLET, SIZE, 130, 400, true);
        assertEq(s.crossEquity, 1_920 * U);
        assertEq(s.crossMM, 1_950 * U);
        assertEq(s.marginRatioWad, 1.015625e18); // 101.5625%
        assertTrue(s.liquidatable);
        assertFalse(s.backstopEligible);
        assertEq(s.freeCollateral, 0);
        assertEq(s.withdrawable, 0);
    }

    /// Path 1: close 1 contract at 130, fee 0.30% of 130 = 0.39 → restored.
    function test_path1_partialRestores() public view {
        uint256 fee = 39 * C;
        // Closing at mark realises PnL into the wallet: wallet += 1×(130−250); fee leaves the wallet.
        uint256 wallet = WALLET - 120 * U - fee;
        CrossMath.Snapshot memory s = _snap(wallet, 59, 130, 400, true);
        assertEq(s.crossEquity, 1_919_610_000);
        assertEq(s.crossMM, 1_917_500_000);
        assertFalse(s.liquidatable);
        assertEq(s.marginRatioWad / 1e14, 9989); // 99.89%
    }

    /// Path 2: gap to 80, put 500 → equity −1,000 < 2/3 × 1,200 → backstop.
    function test_path2_backstop() public view {
        CrossMath.Snapshot memory s = _snap(WALLET, SIZE, 80, 500, true);
        assertEq(s.crossEquityRaw, -1_000 * int256(U));
        assertEq(s.crossEquity, 0);
        assertEq(s.crossMM, 1_200 * U);
        assertTrue(s.liquidatable);
        assertTrue(s.backstopEligible);
        assertEq(s.marginRatioWad, type(uint256).max);
    }

    function test_staleOptionCountsZero() public view {
        CrossMath.Snapshot memory s = _snap(WALLET, SIZE, 250, 200, false);
        assertEq(s.longOptionCounted, 0);
        assertEq(s.crossEquity, 8_800 * U);
    }

    function testFuzz_haircutNeverExceedsMark(uint128 mark, uint16 h) public view {
        h = uint16(bound(h, 0, 10_000));
        CrossMath.Params memory p = P;
        p.optionHaircutBps = h;
        CrossMath.OptionLeg[] memory opts = new CrossMath.OptionLeg[](1);
        opts[0] = CrossMath.OptionLeg({mark: mark, fresh: true});
        CrossMath.Snapshot memory s = CrossMath.snapshot(p, 0, new CrossMath.PerpLeg[](0), opts, 0);
        assertLe(s.longOptionCounted, s.longOptionMark);
    }

    function testFuzz_imIsSumOfLegs(uint64 n1, uint64 n2, uint8 l1, uint8 l2) public view {
        uint16[4] memory levs = [uint16(10_000), 12_500, 15_000, 20_000];
        CrossMath.PerpLeg[] memory perps = new CrossMath.PerpLeg[](2);
        // opposite directions: a hedge must not reduce IM
        perps[0] = CrossMath.PerpLeg({notional: n1, upnl: 0, leverageBps: levs[l1 % 4]});
        perps[1] = CrossMath.PerpLeg({notional: n2, upnl: 0, leverageBps: levs[l2 % 4]});
        CrossMath.Snapshot memory s = CrossMath.snapshot(P, 0, perps, new CrossMath.OptionLeg[](0), 0);
        assertEq(s.crossIM, CrossMath.initialMargin(n1, levs[l1 % 4]) + CrossMath.initialMargin(n2, levs[l2 % 4]));
    }

    function test_rejectsOtherLeverage() public {
        CrossMath.PerpLeg[] memory perps = new CrossMath.PerpLeg[](1);
        perps[0] = CrossMath.PerpLeg({notional: 100 * U, upnl: 0, leverageBps: 30_000});
        vm.expectRevert(abi.encodeWithSelector(CrossMath.InvalidLeverage.selector, 30_000));
        this.ext(perps);
    }

    function ext(CrossMath.PerpLeg[] memory perps) external view {
        CrossMath.snapshot(P, 0, perps, new CrossMath.OptionLeg[](0), 0);
    }
}
