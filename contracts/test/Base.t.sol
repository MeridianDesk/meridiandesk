// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {MarketRegistry} from "../src/MarketRegistry.sol";
import {OracleRouter} from "../src/OracleRouter.sol";
import {LiquidityPool} from "../src/LiquidityPool.sol";
import {PerpsEngine} from "../src/PerpsEngine.sol";
import {OptionsEngine} from "../src/OptionsEngine.sol";
import {MockERC20, MockAggregator} from "./mocks/Mocks.sol";

abstract contract Base is Test {
    address admin = makeAddr("admin");
    address lp = makeAddr("lp");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address keeper = makeAddr("keeper");
    uint256 quoterPk = 0xA11CE;
    address quoter;

    MockERC20 usdg;
    MockERC20 tsla;
    MockAggregator feed;
    MarketRegistry registry;
    OracleRouter router;
    LiquidityPool pool;
    PerpsEngine perps;
    OptionsEngine options;

    uint256 constant U = 1e6; // 1 USDG

    function setUp() public virtual {
        vm.warp(1_780_000_000);
        quoter = vm.addr(quoterPk);
        usdg = new MockERC20("USDG", "USDG", 6);
        tsla = new MockERC20("Tesla", "TSLA", 18);
        feed = new MockAggregator(8);
        feed.push(400e8); // $400

        vm.startPrank(admin);
        registry = new MarketRegistry(admin);
        router = new OracleRouter(registry);
        pool = new LiquidityPool(usdg, admin, 1_000_000 * U);
        perps = new PerpsEngine(usdg, registry, router, pool, admin);
        options = new OptionsEngine(usdg, registry, router, pool, admin);
        pool.grantRole(pool.ENGINE_ROLE(), address(perps));
        pool.grantRole(pool.ENGINE_ROLE(), address(options));
        options.grantRole(options.QUOTER_ROLE(), quoter);

        MarketRegistry.Listing[] memory ls = new MarketRegistry.Listing[](1);
        ls[0] = MarketRegistry.Listing(address(tsla), address(feed), 18, "TSLA", "");
        registry.list(ls);
        registry.setFlags(address(tsla), true, true);

        perps.configureMarket(
            address(tsla),
            PerpsEngine.MarketConfig({
                maxOiLong: uint128(200_000 * U),
                maxOiShort: uint128(200_000 * U),
                fundingRatePerSec: uint64(uint256(0.1e18) / 365 days), // 10%/yr at full skew
                openFeeBps: 10,
                closeFeeBps: 10,
                maintenanceBps: 500, // 5%
                liqFeeBps: 100,
                paused: false,
                configured: false
            })
        );
        perps.setCaps(10 * U, 50_000 * U, 500_000 * U);
        options.setParams(10_000, 1 hours, 45 days, 3 days, 10_000 * U, 500_000 * U);
        vm.stopPrank();

        usdg.mint(lp, 500_000 * U);
        vm.startPrank(lp);
        usdg.approve(address(pool), type(uint256).max);
        pool.deposit(500_000 * U, lp);
        vm.stopPrank();

        for (uint256 i; i < 2; ++i) {
            address u = i == 0 ? alice : bob;
            usdg.mint(u, 100_000 * U);
            vm.startPrank(u);
            usdg.approve(address(perps), type(uint256).max);
            usdg.approve(address(options), type(uint256).max);
            vm.stopPrank();
        }
    }

    function _setPrice(int256 p8) internal {
        feed.push(p8);
    }
}
