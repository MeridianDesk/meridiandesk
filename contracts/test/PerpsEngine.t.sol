// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Base} from "./Base.t.sol";
import {PerpsEngine} from "../src/PerpsEngine.sol";
import {OracleRouter} from "../src/OracleRouter.sol";
import {MarketRegistry} from "../src/MarketRegistry.sol";

contract PerpsEngineTest is Base {
    function _open(address u, bool isLong, uint256 c, uint16 lev) internal returns (uint256 id) {
        vm.prank(u);
        id = perps.open(address(tsla), isLong, c, lev, isLong ? type(uint256).max : 0);
    }

    // ───────── leverage cap (§8.4 / G3) ─────────

    function test_allowedLeverageSet() public view {
        assertTrue(perps.isAllowedLeverage(10_000));
        assertTrue(perps.isAllowedLeverage(12_500));
        assertTrue(perps.isAllowedLeverage(15_000));
        assertTrue(perps.isAllowedLeverage(20_000));
        assertFalse(perps.isAllowedLeverage(20_001));
        assertFalse(perps.isAllowedLeverage(30_000));
        assertFalse(perps.isAllowedLeverage(11_000));
        assertFalse(perps.isAllowedLeverage(0));
    }

    function testFuzz_rejectsAnyOtherLeverage(uint16 lev) public {
        vm.assume(lev != 10_000 && lev != 12_500 && lev != 15_000 && lev != 20_000);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(PerpsEngine.InvalidLeverage.selector, uint256(lev)));
        perps.open(address(tsla), true, 1_000 * U, lev, type(uint256).max);
    }

    function testFuzz_effectiveLeverageNeverAbove2x(uint256 c, uint8 levIdx, bool isLong) public {
        c = bound(c, 10 * U, 50_000 * U);
        uint16[4] memory levs = [uint16(10_000), 12_500, 15_000, 20_000];
        uint16 lev = levs[levIdx % 4];
        uint256 id = _open(alice, isLong, c, lev);
        PerpsEngine.Position memory p = perps.getPosition(id);
        assertLe(uint256(p.size) * 10_000, uint256(p.collateral) * 20_000, "eff lev > 2x");
        assertLe(uint256(p.size) * 10_000, uint256(p.collateral) * lev + lev, "eff lev > chosen");
    }

    // ───────── open / close PnL ─────────

    function test_longProfit() public {
        uint256 before = usdg.balanceOf(alice);
        uint256 id = _open(alice, true, 1_000 * U, 20_000);
        PerpsEngine.Position memory p = perps.getPosition(id);
        assertApproxEqAbs(p.size, 2_000 * U, 5 * U);
        assertEq(pool.reserved(), p.size);

        _setPrice(440e8); // +10%
        vm.prank(alice);
        perps.close(id, 0);
        // ≈ +10% of 2000 notional = +200, minus ~2 open fee, ~2 close fee
        int256 delta = int256(usdg.balanceOf(alice)) - int256(before);
        assertApproxEqAbs(delta, 196e6, 1e6);
        assertEq(pool.reserved(), 0);
        assertFalse(perps.getPosition(id).open);
    }

    function test_shortProfitAndLongLossFlowToPool() public {
        uint256 poolBefore = pool.totalAssets();
        uint256 idL = _open(alice, true, 1_000 * U, 10_000);
        uint256 idS = _open(bob, false, 1_000 * U, 10_000);
        _setPrice(360e8); // −10%
        vm.prank(alice);
        perps.close(idL, 0);
        vm.prank(bob);
        perps.close(idS, type(uint256).max);
        // Symmetric book: pool keeps only fees (+ any funding).
        assertGt(pool.totalAssets(), poolBefore);
        assertApproxEqAbs(pool.totalAssets() - poolBefore, 4 * U, 1 * U);
    }

    function test_closeOnlyOwner() public {
        uint256 id = _open(alice, true, 1_000 * U, 20_000);
        vm.prank(bob);
        vm.expectRevert(PerpsEngine.NotOwner.selector);
        perps.close(id, 0);
    }

    function test_slippageGuard() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(PerpsEngine.Slippage.selector, 400e18, 399e18));
        perps.open(address(tsla), true, 1_000 * U, 20_000, 399e18);
    }

    // ───────── liquidation ─────────

    function test_liquidation2x() public {
        uint256 id = _open(alice, true, 1_000 * U, 20_000);
        uint256 liqPx = perps.liquidationPrice(id);
        // 2× long: buffer = collateral − 5% maint = ~900 of 2000 notional ⇒ liq ≈ −45% ≈ $220
        assertApproxEqRel(liqPx, 220e18, 0.005e18);

        _setPrice(225e8);
        vm.expectRevert();
        vm.prank(keeper);
        perps.liquidate(id);

        _setPrice(215e8);
        (,,,, bool liq) = perps.positionHealth(id);
        assertTrue(liq);
        uint256 aliceBefore = usdg.balanceOf(alice);
        vm.prank(keeper);
        perps.liquidate(id);
        assertApproxEqAbs(usdg.balanceOf(keeper), 20 * U, 1 * U); // 1% of ~2000 notional
        assertGe(usdg.balanceOf(alice), aliceBefore); // leftover equity (if any) to trader
        assertEq(pool.reserved(), 0);
        assertEq(perps.totalCollateral(), 0);
    }

    function test_lowLeverageStillLiquidates() public {
        // "Low leverage does not remove liquidation risk": 1× long liquidates on a ~95% drop.
        uint256 id = _open(alice, true, 1_000 * U, 10_000);
        _setPrice(15e8);
        vm.prank(keeper);
        perps.liquidate(id);
        assertFalse(perps.getPosition(id).open);
    }

    function test_badDebtAbsorbedByPool() public {
        uint256 id = _open(alice, true, 1_000 * U, 20_000);
        _setPrice(100e8); // gap through liquidation (−75%), equity negative
        uint256 poolBefore = pool.totalAssets();
        vm.prank(keeper);
        perps.liquidate(id);
        // Pool receives collateral minus keeper fee; trader gets nothing.
        assertEq(usdg.balanceOf(address(perps)), 0);
        assertGt(pool.totalAssets(), poolBefore);
    }

    // ───────── oracle guards ─────────

    function test_staleOracleBlocksOpen() public {
        vm.warp(block.timestamp + 2 hours); // weekend gap: feed stops
        vm.prank(alice);
        vm.expectRevert();
        perps.open(address(tsla), true, 1_000 * U, 20_000, type(uint256).max);
    }

    function test_oracleUnavailableMarketCannotBeEnabled() public {
        MarketRegistry.Listing[] memory ls = new MarketRegistry.Listing[](1);
        ls[0] = MarketRegistry.Listing(makeAddr("noFeed"), address(0), 18, "NOFD", "");
        vm.startPrank(admin);
        registry.list(ls);
        vm.expectRevert();
        registry.setFlags(makeAddr("noFeed"), true, false);
        vm.stopPrank();
    }

    // ───────── caps / pause ─────────

    function test_oiCap() public {
        vm.prank(admin);
        perps.setCaps(10 * U, 200_000 * U, 1_000_000 * U);
        usdg.mint(alice, 200_000 * U);
        vm.prank(alice);
        vm.expectRevert();
        perps.open(address(tsla), true, 150_000 * U, 20_000, type(uint256).max); // 300k > 200k OI cap
    }

    function test_collateralCaps() public {
        vm.startPrank(alice);
        vm.expectRevert();
        perps.open(address(tsla), true, 5 * U, 20_000, type(uint256).max);
        vm.expectRevert();
        perps.open(address(tsla), true, 60_000 * U, 20_000, type(uint256).max);
        vm.stopPrank();
    }

    function test_pauseBlocksOpenButNotClose() public {
        uint256 id = _open(alice, true, 1_000 * U, 20_000);
        vm.prank(admin);
        perps.pause();
        vm.prank(alice);
        vm.expectRevert();
        perps.open(address(tsla), true, 1_000 * U, 20_000, type(uint256).max);
        vm.prank(alice);
        perps.close(id, 0);
    }

    function test_disabledMarketBlocksOpen() public {
        vm.prank(admin);
        registry.setFlags(address(tsla), false, true);
        vm.prank(alice);
        vm.expectRevert();
        perps.open(address(tsla), true, 1_000 * U, 20_000, type(uint256).max);
    }

    function test_onlyAdminConfigures() public {
        vm.prank(alice);
        vm.expectRevert();
        perps.setCaps(0, 1, 1);
    }

    // ───────── funding ─────────

    function test_fundingPaidBySkewedSide() public {
        uint256 id = _open(alice, true, 10_000 * U, 20_000); // only longs ⇒ full skew
        vm.warp(block.timestamp + 30 days);
        _setPrice(400e8);
        (, uint256 funding,,,) = perps.positionHealth(id);
        // 10%/yr × 30/365 × ~20k ≈ 164 USDG
        assertApproxEqRel(funding, 164e6, 0.02e18);
    }

    // ───────── LP safety ─────────

    function test_lpCannotWithdrawReserved() public {
        _open(alice, true, 50_000 * U, 20_000); // reserves ~100k
        uint256 maxW = pool.maxWithdraw(lp);
        assertLe(maxW, pool.totalAssets() - pool.reserved());
        vm.prank(lp);
        vm.expectRevert();
        pool.withdraw(maxW + 1, lp, lp);
    }

    function test_maxOpenPriceAgeBlocksOpenNotClose() public {
        uint256 id = _open(alice, true, 1_000 * U, 20_000);
        vm.prank(admin);
        perps.setMaxOpenPriceAge(30 minutes);
        vm.warp(block.timestamp + 45 minutes); // still inside registry staleness (1h)
        vm.prank(alice);
        vm.expectPartialRevert(PerpsEngine.PriceTooOldToOpen.selector);
        perps.open(address(tsla), true, 1_000 * U, 20_000, type(uint256).max);
        vm.prank(alice);
        perps.close(id, 0); // exits stay open
    }
}
