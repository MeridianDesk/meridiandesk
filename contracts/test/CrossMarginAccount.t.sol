// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Base} from "./Base.t.sol";
import {CrossMarginAccount} from "../src/cross/CrossMarginAccount.sol";
import {CrossMath} from "../src/cross/CrossMath.sol";
import {OptionsEngine} from "../src/OptionsEngine.sol";
import {CrossOptionBook} from "../src/cross/CrossOptionBook.sol";
import {InsuranceFund} from "../src/cross/InsuranceFund.sol";

contract CrossMarginAccountTest is Base {
    CrossMarginAccount cross;
    CrossOptionBook book;
    address insurance = makeAddr("insurance");

    function setUp() public override {
        super.setUp();
        vm.startPrank(admin);
        cross = new CrossMarginAccount(usdg, registry, router, pool, admin, insurance);
        book = new CrossOptionBook(cross, options);
        cross.setOptionBook(book);
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

    /// Backstop loss beyond the wallet: InsuranceFund pays the pool what it holds, the rest stays bad debt.
    function test_insuranceFundCoversDeficit() public {
        vm.startPrank(admin);
        InsuranceFund fund = new InsuranceFund(usdg, address(pool), admin);
        fund.grantRole(fund.COVER_ROLE(), address(cross));
        (uint16 mm, uint16 hc, uint16 wf, uint16 bs) = cross.params();
        (uint16 pb, uint32 cd, uint16 inf, uint16 kf) = cross.liqConfig();
        cross.setParams(CrossMath.Params(mm, hc, wf, bs), CrossMarginAccount.LiqConfig(pb, cd, inf, kf), address(fund));
        vm.stopPrank();
        usdg.mint(address(this), 100 * U);
        usdg.approve(address(fund), 100 * U);
        fund.contribute(100 * U);

        vm.prank(alice);
        cross.deposit(1_000 * U);
        _open(alice, 1_000 * U, 20_000, true); // 2,000 notional @ 400
        _setPrice(150e8); // loss 1,250 vs wallet 1,000 → deficit 250
        uint256 pb0 = usdg.balanceOf(address(pool));
        vm.prank(keeper);
        cross.liquidate(alice);
        assertEq(fund.totalCovered(), 100 * U);
        assertEq(fund.totalUncovered(), 150 * U);
        assertEq(fund.balance(), 0);
        assertEq(usdg.balanceOf(address(pool)) - pb0, 1_100 * U); // wallet 1,000 + fund 100
        assertEq(cross.totalBadDebt(), 150 * U + 10 * U); // uncovered loss + unpaid liq fees (0.50% of 2,000)
    }

    function test_insuranceFundOnlyEngineCovers() public {
        InsuranceFund fund = new InsuranceFund(usdg, address(pool), admin);
        vm.expectRevert();
        fund.coverDeficit(alice, 1);
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

    // ───────────── P2: Cross long options ─────────────
    uint256 rnd;

    function _crossQuote(address trader, bool isCall, uint256 strike, uint64 expiry, uint256 qty, uint256 premium)
        internal
        returns (OptionsEngine.Quote memory q, bytes memory sig)
    {
        q = OptionsEngine.Quote({
            buyer: address(book),
            token: address(tsla),
            isCall: isCall,
            strike: strike,
            expiry: expiry,
            quantity: qty,
            premium: premium,
            deadline: uint64(block.timestamp + 60),
            nonce: (uint256(uint160(trader)) << 96) | ++rnd
        });
        (uint8 v, bytes32 r, bytes32 s_) = vm.sign(quoterPk, options.quoteDigest(q));
        sig = abi.encodePacked(r, s_, v);
    }

    function test_U13_optionCountedAfterHaircut_premiumFromWallet() public {
        vm.prank(alice);
        cross.deposit(1_000 * U);
        uint64 exp = uint64(block.timestamp + 7 days);
        (OptionsEngine.Quote memory q, bytes memory sig) = _crossQuote(alice, false, 450e18, exp, 4e18, 220 * U);
        vm.prank(alice);
        uint256 id = book.buy(q, sig);
        assertEq(cross.walletOf(alice), 780 * U);
        assertEq(book.ownerOf(id), alice);
        CrossMath.Snapshot memory s = cross.accountSnapshot(alice);
        assertEq(s.longOptionMark, 200 * U); // intrinsic 4 × (450 − 400)
        assertEq(s.longOptionCounted, 160 * U); // 80%
        assertEq(s.crossEquity, 940 * U);
        assertEq(s.crossIM, 0);
        assertEq(s.crossMM, 0);
        // option value never leaves as cash
        assertEq(s.withdrawable, 780 * U); // capped at wallet
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(CrossMarginAccount.WithdrawExceeds.selector, 781 * U, 780 * U));
        cross.withdraw(781 * U);
    }

    function test_optionValueSupportsPerps_noHedgeDiscount() public {
        vm.prank(alice);
        cross.deposit(1_000 * U);
        uint64 exp = uint64(block.timestamp + 7 days);
        (OptionsEngine.Quote memory q, bytes memory sig) = _crossQuote(alice, false, 450e18, exp, 4e18, 200 * U);
        vm.prank(alice);
        book.buy(q, sig);
        // wallet 800 + option 160 = 960 equity; 2× long 950 margin → IM 950 (no discount for the put hedge)
        _open(alice, 950 * U, 20_000, true);
        CrossMath.Snapshot memory s = cross.accountSnapshot(alice);
        assertEq(s.crossIM, 950 * U);
        assertEq(s.crossMM, 475 * U);
        assertGe(s.crossEquity, s.crossIM);
        // without the option the same order would not fit
        vm.prank(bob);
        cross.deposit(800 * U);
        vm.expectRevert();
        _open(bob, 950 * U, 20_000, true);
    }

    function test_quoteBoundToTrader() public {
        vm.prank(alice);
        cross.deposit(1_000 * U);
        vm.prank(bob);
        cross.deposit(1_000 * U);
        (OptionsEngine.Quote memory q, bytes memory sig) =
            _crossQuote(alice, true, 400e18, uint64(block.timestamp + 7 days), 1e18, 30 * U);
        vm.prank(bob);
        vm.expectRevert(CrossOptionBook.WrongQuote.selector);
        book.buy(q, sig);
    }

    function test_staleOptionCountsZero_expiredCountsZero_settleCredits() public {
        vm.prank(alice);
        cross.deposit(1_000 * U);
        uint64 exp = uint64(block.timestamp + 1 days);
        (OptionsEngine.Quote memory q, bytes memory sig) = _crossQuote(alice, true, 380e18, exp, 10e18, 250 * U);
        vm.prank(alice);
        uint256 id = book.buy(q, sig);
        assertEq(cross.accountSnapshot(alice).longOptionCounted, 160 * U); // 0.8 × 10 × 20
        uint80 r = feed.pushAt(410e8, exp - 10);
        vm.warp(exp + 1);
        assertEq(cross.accountSnapshot(alice).longOptionCounted, 0); // expired → 0 until settled
        feed.pushAt(420e8, exp + 1);
        vm.prank(keeper);
        book.settle(id, r);
        assertEq(cross.walletOf(alice), 750 * U + 300 * U); // 10 × (410 − 380)
        assertEq(book.optionsOf(alice).length, 0);
        assertEq(book.ownerOf(id), address(0));
    }

    function test_settledDirectlyStillCredited() public {
        vm.prank(alice);
        cross.deposit(1_000 * U);
        uint64 exp = uint64(block.timestamp + 1 days);
        (OptionsEngine.Quote memory q, bytes memory sig) = _crossQuote(alice, true, 380e18, exp, 10e18, 250 * U);
        vm.prank(alice);
        uint256 id = book.buy(q, sig);
        uint80 r = feed.pushAt(410e8, exp - 10);
        vm.warp(exp + 1);
        feed.pushAt(420e8, exp + 1);
        options.settle(id, r); // someone bypasses the Cross contract
        book.settle(id, r);
        assertEq(cross.walletOf(alice), 1_050 * U);
        vm.expectRevert(abi.encodeWithSelector(CrossOptionBook.NotCrossOption.selector, id));
        book.settle(id, r); // no double credit
        assertEq(usdg.balanceOf(address(cross)), cross.totalWallets());
        assertEq(usdg.balanceOf(address(book)), 0);
    }

    function test_premiumAboveWalletReverts() public {
        vm.prank(alice);
        cross.deposit(100 * U);
        (OptionsEngine.Quote memory q, bytes memory sig) =
            _crossQuote(alice, true, 400e18, uint64(block.timestamp + 7 days), 10e18, 150 * U);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(CrossMarginAccount.InsufficientMargin.selector, 100 * U, 150 * U));
        book.buy(q, sig);
    }

    // Brief §6.6 t0 (U4), scaled to the mock TSLA price 400: put mark 200, Cross perps notional 15,000 at 2x.
    function test_U4_briefT0() public {
        vm.prank(admin);
        cross.setCaps(50_000 * U, 500_000 * U);
        vm.prank(alice);
        cross.deposit(9_000 * U); // 10,000 − 1,000 kept for Isolated
        (OptionsEngine.Quote memory q, bytes memory sig) =
            _crossQuote(alice, false, 450e18, uint64(block.timestamp + 7 days), 4e18, 200 * U);
        vm.prank(alice);
        book.buy(q, sig);
        _open(alice, 7_500 * U, 20_000, true);
        CrossMath.Snapshot memory s = cross.accountSnapshot(alice);
        assertEq(s.crossWalletBalance, 8_800 * U);
        assertEq(s.longOptionCounted, 160 * U);
        assertEq(s.crossEquity, 8_960 * U);
        assertEq(s.crossIM, 7_500 * U);
        assertEq(s.crossMM, 3_750 * U);
        assertEq(s.freeCollateral, 1_460 * U);
        assertEq(s.withdrawable, 1_460 * U - 1); // strict > IM (1,459.999999)
        assertApproxEqAbs(s.marginRatioWad, 0.41852678e18, 1e10);
    }
}
