// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Base} from "./Base.t.sol";
import {OptionsEngine} from "../src/OptionsEngine.sol";
import {OracleRouter} from "../src/OracleRouter.sol";

contract OptionsEngineTest is Base {
    uint256 nonce;

    function _quote(address buyer, bool isCall, uint256 strike, uint64 expiry, uint256 qty, uint256 premium)
        internal
        returns (OptionsEngine.Quote memory q, bytes memory sig)
    {
        q = OptionsEngine.Quote({
            buyer: buyer,
            token: address(tsla),
            isCall: isCall,
            strike: strike,
            expiry: expiry,
            quantity: qty,
            premium: premium,
            deadline: uint64(block.timestamp + 60),
            nonce: ++nonce
        });
        sig = _sign(q, quoterPk);
    }

    function _sign(OptionsEngine.Quote memory q, uint256 pk) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, options.quoteDigest(q));
        return abi.encodePacked(r, s, v);
    }

    function _buyCall() internal returns (uint256 id, uint64 expiry) {
        expiry = uint64(block.timestamp + 7 days);
        (OptionsEngine.Quote memory q, bytes memory sig) = _quote(alice, true, 400e18, expiry, 10e18, 300 * U);
        vm.prank(alice);
        id = options.buy(q, sig);
    }

    function test_buyCall_reservesAndTakesPremium() public {
        uint256 poolBefore = pool.totalAssets();
        (uint256 id,) = _buyCall();
        OptionsEngine.Option memory o = options.getOption(id);
        assertEq(uint8(o.status), uint8(OptionsEngine.Status.Open));
        assertEq(o.maxPayout, 4_000 * U); // 10 × $400 × 100% cap
        assertEq(pool.reserved(), 4_000 * U);
        assertEq(pool.totalAssets(), poolBefore + 300 * U);
    }

    function test_settleITMCall() public {
        (uint256 id, uint64 expiry) = _buyCall();
        feed.pushAt(430e8, expiry - 10); // last round before expiry
        vm.warp(expiry + 1);
        uint80 r = feed.pushAt(470e8, expiry + 1); // first after expiry (ignored)
        uint256 before = usdg.balanceOf(alice);
        vm.prank(keeper); // permissionless; pays owner
        options.settle(id, r - 1);
        assertEq(usdg.balanceOf(alice) - before, 300 * U); // 10 × (430 − 400)
        assertEq(pool.reserved(), 0);
    }

    function test_settleWrongRoundReverts() public {
        (uint256 id, uint64 expiry) = _buyCall();
        uint80 r1 = feed.pushAt(430e8, expiry - 100);
        feed.pushAt(420e8, expiry - 10);
        vm.warp(expiry + 1);
        uint80 r3 = feed.pushAt(470e8, expiry + 1);
        vm.expectRevert(); // r1 is not the last round before expiry
        options.settle(id, r1);
        vm.expectRevert(); // r3 is after expiry
        options.settle(id, r3);
        options.settle(id, r3 - 1);
        assertEq(usdg.balanceOf(alice), 100_000 * U - 300 * U + 200 * U);
    }

    function test_settleOTMPut_paysZero() public {
        uint64 expiry = uint64(block.timestamp + 1 days);
        (OptionsEngine.Quote memory q, bytes memory sig) = _quote(alice, false, 380e18, expiry, 5e18, 50 * U);
        vm.prank(alice);
        uint256 id = options.buy(q, sig);
        assertEq(options.getOption(id).maxPayout, 1_900 * U); // put capped at strike
        feed.pushAt(410e8, expiry - 1);
        vm.warp(expiry + 5);
        uint80 r = feed.pushAt(411e8, expiry + 5);
        uint256 before = usdg.balanceOf(alice);
        options.settle(id, r - 1);
        assertEq(usdg.balanceOf(alice), before);
        assertEq(uint8(options.getOption(id).status), uint8(OptionsEngine.Status.Settled));
    }

    function test_callPayoutCapped() public {
        (uint256 id, uint64 expiry) = _buyCall();
        feed.pushAt(1_200e8, expiry - 1); // +200%
        vm.warp(expiry + 1);
        uint80 r = feed.pushAt(1_200e8, expiry + 1);
        options.settle(id, r - 1);
        assertEq(usdg.balanceOf(alice), 100_000 * U - 300 * U + 4_000 * U);
    }

    function test_cannotSettleBeforeExpiry() public {
        (uint256 id,) = _buyCall();
        vm.expectRevert();
        options.settle(id, 1);
    }

    function test_noDoubleSettle() public {
        (uint256 id, uint64 expiry) = _buyCall();
        feed.pushAt(430e8, expiry - 1);
        vm.warp(expiry + 1);
        uint80 r = feed.pushAt(430e8, expiry + 1);
        options.settle(id, r - 1);
        vm.expectRevert(abi.encodeWithSelector(OptionsEngine.NotOpen.selector, id));
        options.settle(id, r - 1);
    }

    function test_quoteSecurity() public {
        uint64 expiry = uint64(block.timestamp + 7 days);
        (OptionsEngine.Quote memory q, bytes memory sig) = _quote(alice, true, 400e18, expiry, 1e18, 30 * U);

        vm.prank(bob); // quote bound to buyer
        vm.expectRevert(OptionsEngine.WrongBuyer.selector);
        options.buy(q, sig);

        OptionsEngine.Quote memory tampered = abi.decode(abi.encode(q), (OptionsEngine.Quote)); // copy, not alias
        tampered.premium = 1;
        vm.prank(alice);
        vm.expectRevert();
        options.buy(tampered, sig);

        bytes memory badSig = _sign(q, 0xBAD);
        vm.prank(alice);
        vm.expectRevert();
        options.buy(q, badSig);

        vm.prank(alice);
        options.buy(q, sig);
        vm.prank(alice); // replay
        vm.expectRevert(abi.encodeWithSelector(OptionsEngine.NonceUsed.selector, q.nonce));
        options.buy(q, sig);
    }

    function test_quoteDeadline() public {
        (OptionsEngine.Quote memory q, bytes memory sig) =
            _quote(alice, true, 400e18, uint64(block.timestamp + 7 days), 1e18, 30 * U);
        vm.warp(block.timestamp + 61);
        feed.push(400e8);
        vm.prank(alice);
        vm.expectRevert(OptionsEngine.QuoteExpired.selector);
        options.buy(q, sig);
    }

    function test_expiryBounds() public {
        (OptionsEngine.Quote memory q, bytes memory sig) =
            _quote(alice, true, 400e18, uint64(block.timestamp + 10 minutes), 1e18, 30 * U);
        vm.prank(alice);
        vm.expectRevert();
        options.buy(q, sig);
        (q, sig) = _quote(alice, true, 400e18, uint64(block.timestamp + 60 days), 1e18, 30 * U);
        vm.prank(alice);
        vm.expectRevert();
        options.buy(q, sig);
    }

    function test_staleOracleBlocksBuy() public {
        vm.warp(block.timestamp + 2 hours);
        (OptionsEngine.Quote memory q, bytes memory sig) =
            _quote(alice, true, 400e18, uint64(block.timestamp + 7 days), 1e18, 30 * U);
        vm.prank(alice);
        vm.expectRevert();
        options.buy(q, sig);
    }

    function test_voidOnlyAdminAfterGrace() public {
        (uint256 id, uint64 expiry) = _buyCall();
        vm.warp(expiry + 1 days);
        vm.prank(admin);
        vm.expectRevert(); // grace not over
        options.voidUnsettled(id);

        vm.warp(expiry + 3 days + 1);
        vm.prank(alice); // buyer cannot void an OTM option to reclaim premium
        vm.expectRevert();
        options.voidUnsettled(id);

        uint256 before = usdg.balanceOf(alice);
        vm.prank(admin);
        options.voidUnsettled(id);
        assertEq(usdg.balanceOf(alice) - before, 300 * U);
        assertEq(pool.reserved(), 0);
    }

    function test_pauseBlocksBuyNotSettle() public {
        (uint256 id, uint64 expiry) = _buyCall();
        vm.prank(admin);
        options.pause();
        (OptionsEngine.Quote memory q, bytes memory sig) = _quote(alice, true, 400e18, expiry, 1e18, 30 * U);
        vm.prank(alice);
        vm.expectRevert();
        options.buy(q, sig);
        feed.pushAt(430e8, expiry - 1);
        vm.warp(expiry + 1);
        uint80 r = feed.pushAt(430e8, expiry + 1);
        options.settle(id, r - 1);
    }

    function test_premiumAboveMaxPayoutRejected() public {
        (OptionsEngine.Quote memory q, bytes memory sig) =
            _quote(alice, false, 1e18, uint64(block.timestamp + 7 days), 1e18, 2 * U); // put max payout $1
        vm.prank(alice);
        vm.expectRevert();
        options.buy(q, sig);
    }
}
