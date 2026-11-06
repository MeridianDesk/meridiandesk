// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Base} from "./Base.t.sol";
import {MarketRegistry} from "../src/MarketRegistry.sol";
import {LiquidityPool} from "../src/LiquidityPool.sol";
import {PerpsEngine} from "../src/PerpsEngine.sol";

contract RegistryPoolTest is Base {
    function test_listingStartsDisabled() public {
        address t = makeAddr("NVDA");
        MarketRegistry.Listing[] memory ls = new MarketRegistry.Listing[](1);
        ls[0] = MarketRegistry.Listing(t, address(feed), 18, "NVDA", "ipfs://x");
        vm.prank(admin);
        registry.list(ls);
        assertFalse(registry.isPerpsEnabled(t));
        assertFalse(registry.isOptionsEnabled(t));
        assertEq(registry.marketCount(), 2);
    }

    function test_delistKeepsEntryVisible() public {
        vm.prank(admin);
        registry.delist(address(tsla));
        MarketRegistry.Market[] memory all = registry.allMarkets();
        assertEq(all.length, 1);
        assertFalse(all[0].listed);
        assertEq(all[0].symbol, "TSLA");
        assertFalse(registry.isPerpsEnabled(address(tsla)));
    }

    function test_relistDoesNotDuplicate() public {
        vm.startPrank(admin);
        registry.delist(address(tsla));
        MarketRegistry.Listing[] memory ls = new MarketRegistry.Listing[](1);
        ls[0] = MarketRegistry.Listing(address(tsla), address(feed), 18, "TSLA", "");
        registry.list(ls);
        vm.stopPrank();
        assertEq(registry.marketCount(), 1);
    }

    function test_clearingOracleDisablesDesks() public {
        vm.prank(admin);
        registry.setOracle(address(tsla), address(0), 0);
        assertFalse(registry.isPerpsEnabled(address(tsla)));
    }

    function test_onlyListerLists() public {
        MarketRegistry.Listing[] memory ls = new MarketRegistry.Listing[](0);
        vm.prank(alice);
        vm.expectRevert();
        registry.list(ls);
    }

    function test_pagination() public view {
        assertEq(registry.marketsPage(0, 10).length, 1);
        assertEq(registry.marketsPage(5, 10).length, 0);
    }

    function test_depositCap() public {
        usdg.mint(bob, 600_000 * U);
        vm.startPrank(bob);
        usdg.approve(address(pool), type(uint256).max);
        assertEq(pool.maxDeposit(bob), 500_000 * U);
        vm.expectRevert();
        pool.deposit(500_001 * U, bob);
        vm.stopPrank();
    }

    function test_utilizationCap() public {
        // 80% max utilisation of 500k ⇒ ≤ 400k reserved. Raise OI/collateral caps to isolate it.
        vm.startPrank(admin);
        perps.setCaps(10 * U, 300_000 * U, 1_000_000 * U);
        perps.configureMarket(
            address(tsla),
            PerpsEngine.MarketConfig(uint128(1_000_000 * U), uint128(1_000_000 * U), 0, 0, 0, 500, 100, false, false)
        );
        vm.stopPrank();
        usdg.mint(alice, 300_000 * U);
        vm.prank(alice);
        vm.expectPartialRevert(LiquidityPool.UtilizationExceeded.selector);
        perps.open(address(tsla), true, 210_000 * U, 20_000, type(uint256).max); // 420k notional
        vm.prank(alice);
        perps.open(address(tsla), true, 190_000 * U, 20_000, type(uint256).max); // 380k ok
        assertEq(pool.reserved(), 380_000 * U);
    }

    function test_onlyEngineReserves() public {
        vm.prank(alice);
        vm.expectRevert();
        pool.reserve(1);
        vm.prank(alice);
        vm.expectRevert();
        pool.pay(alice, 1);
    }

    function test_guardianPausesPool() public {
        vm.prank(admin);
        pool.pause();
        assertEq(pool.maxDeposit(lp), 0);
    }
}
