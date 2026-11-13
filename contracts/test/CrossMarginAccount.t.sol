// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Base} from "./Base.t.sol";
import {CrossMarginAccount} from "../src/cross/CrossMarginAccount.sol";
import {CrossMath} from "../src/cross/CrossMath.sol";

contract CrossMarginAccountTest is Base {
    CrossMarginAccount cross;
    address insurance = makeAddr("insurance");

    function setUp() public override {
        super.setUp();
        vm.startPrank(admin);
        cross = new CrossMarginAccount(usdg, registry, router, pool, admin, insurance);
        pool.grantRole(pool.ENGINE_ROLE(), address(cross));
        cross.configureMarket(
            address(tsla),
            CrossMarginAccount.MarketConfig({
                maxOiLong: uint128(200_000 * U),
                maxOiShort: uint128(200_000 * U),
                fundingRatePerSec: 0,
                openFeeBps: 0,
                closeFeeBps: 0,
                paused: false,
                configured: false
            })
        );
        cross.setCaps(50_000 * U, 500_000 * U);
        vm.stopPrank();
        for (uint256 i; i < 2; ++i) {
            address u = i == 0 ? alice : bob;
            vm.startPrank(u);
            usdg.approve(address(cross), type(uint256).max);
            cross.setMarginMode(address(tsla), CrossMarginAccount.MarginMode.Cross);
            vm.stopPrank();
        }
    }

    function _open(address u, uint256 margin, uint16 lev, bool isLong) internal {
        vm.prank(u);
        cross.open(address(tsla), isLong, margin, lev, isLong ? type(uint256).max : 0);
    }

    function test_depositOpenSnapshot() public {
        vm.startPrank(alice);
        cross.deposit(10_000 * U);
        cross.open(address(tsla), true, 4_000 * U, 20_000, type(uint256).max);
        vm.stopPrank();
        CrossMath.Snapshot memory s = cross.accountSnapshot(alice);
        assertEq(s.crossEquity, 10_000 * U);
        assertEq(s.crossIM, 4_000 * U);
        assertEq(s.crossMM, 2_000 * U); // 25% of 8,000
        assertEq(s.freeCollateral, 6_000 * U);
        assertEq(pool.reserved(), 8_000 * U);
    }

    function test_requiresCrossMode() public {
        vm.prank(alice);
        cross.setMarginMode(address(tsla), CrossMarginAccount.MarginMode.Isolated);
        vm.prank(alice);
        cross.deposit(1_000 * U);
        vm.expectRevert(abi.encodeWithSelector(CrossMarginAccount.NotCrossMode.selector, address(tsla)));
        _open(alice, 100 * U, 10_000, true);
    }

    function test_modeLockedWhileOpen() public {
        vm.prank(alice);
        cross.deposit(1_000 * U);
        _open(alice, 100 * U, 10_000, true);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(CrossMarginAccount.ModeLocked.selector, address(tsla)));
        cross.setMarginMode(address(tsla), CrossMarginAccount.MarginMode.Isolated);
    }

    function test_rejectsLeverageAbove2x() public {
        vm.prank(alice);
        cross.deposit(1_000 * U);
        vm.expectRevert(abi.encodeWithSelector(CrossMarginAccount.InvalidLeverage.selector, 30_000));
        _open(alice, 100 * U, 30_000, true);
    }

    function test_insufficientMargin() public {
        vm.prank(alice);
        cross.deposit(1_000 * U);
        vm.expectRevert(abi.encodeWithSelector(CrossMarginAccount.InsufficientMargin.selector, 1_000 * U, 1_001 * U));
        _open(alice, 1_001 * U, 20_000, true);
    }

    function test_profitSharedAcrossWallet_closeRealises() public {
        vm.prank(alice);
        cross.deposit(1_000 * U);
        _open(alice, 500 * U, 20_000, true); // 1,000 notional @ 400
        _setPrice(440e8); // +10%
        assertEq(cross.accountSnapshot(alice).crossPerpUPnL, int256(100 * U));
        uint256 before = usdg.balanceOf(alice);
        vm.prank(alice);
        cross.close(address(tsla), 0, 0);
        assertEq(cross.walletOf(alice), 1_100 * U);
        vm.prank(alice);
        cross.withdraw(1_100 * U);
        assertEq(usdg.balanceOf(alice) - before, 1_100 * U);
        assertEq(pool.reserved(), 0);
    }

    function test_withdrawBlockedBeyondIM() public {
        vm.prank(alice);
        cross.deposit(1_000 * U);
        _open(alice, 600 * U, 20_000, true);
        CrossMath.Snapshot memory s = cross.accountSnapshot(alice);
        assertEq(s.withdrawable, 400 * U - 1); // strict > IM
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(CrossMarginAccount.WithdrawExceeds.selector, 400 * U, 400 * U - 1));
        cross.withdraw(400 * U);
    }

    function test_staleOracleBlocksWithdraw() public {
        vm.prank(alice);
        cross.deposit(1_000 * U);
        _open(alice, 100 * U, 10_000, true);
        vm.warp(block.timestamp + 3 days);
        vm.prank(alice);
        vm.expectRevert();
        cross.withdraw(1 * U);
    }

    function test_partialLiquidationThenCooldown() public {
        vm.prank(alice);
        cross.deposit(1_000 * U);
        _open(alice, 1_000 * U, 20_000, true); // 2,000 notional @ 400
        // equity = 1000 + 2000×(p−400)/400 ≤ 0.25 × 2000·p/400 ⇒ p ≤ ~ 266.67
        _setPrice(265e8);
        assertTrue(cross.accountSnapshot(alice).liquidatable);
        uint256 kb = usdg.balanceOf(keeper);
        vm.prank(keeper);
        cross.liquidate(alice);
        CrossMarginAccount.Position memory p = cross.positionOf(alice, address(tsla));
        assertEq(p.size, 1_600 * U); // 20% closed
        assertEq(usdg.balanceOf(keeper) - kb, 400 * U * 20 / 10_000); // 0.20%
        assertEq(usdg.balanceOf(insurance), 400 * U * 30 / 10_000); // 0.30%
        vm.prank(keeper);
        vm.expectRevert();
        cross.liquidate(alice);
    }

    function test_backstopClosesEverything() public {
        vm.prank(alice);
        cross.deposit(1_000 * U);
        _open(alice, 1_000 * U, 20_000, true);
        _setPrice(150e8); // deep gap
        assertTrue(cross.accountSnapshot(alice).backstopEligible);
        vm.prank(keeper);
        cross.liquidate(alice);
        assertEq(cross.tokensOf(alice).length, 0);
        assertEq(cross.walletOf(alice), 0);
        assertGt(cross.totalBadDebt(), 0);
        assertEq(pool.reserved(), 0);
    }

    function test_crossNeverTouchesIsolated() public {
        vm.prank(bob);
        uint256 isoId = perps.open(address(tsla), true, 100 * U, 20_000, type(uint256).max);
        vm.prank(alice);
        cross.deposit(1_000 * U);
        _open(alice, 1_000 * U, 20_000, true);
        _setPrice(150e8);
        vm.prank(keeper);
        cross.liquidate(alice);
        assertTrue(perps.getPosition(isoId).open);
    }

    function test_userCanAlwaysCloseWhenPaused() public {
        vm.prank(alice);
        cross.deposit(1_000 * U);
        _open(alice, 100 * U, 10_000, true);
        vm.prank(admin);
        cross.pause();
        vm.prank(alice);
        cross.close(address(tsla), 0, 0);
        assertEq(cross.tokensOf(alice).length, 0);
    }
}
