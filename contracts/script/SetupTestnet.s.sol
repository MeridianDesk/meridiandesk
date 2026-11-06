// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {MarketRegistry} from "../src/MarketRegistry.sol";
import {LiquidityPool} from "../src/LiquidityPool.sol";
import {PerpsEngine} from "../src/PerpsEngine.sol";
import {MirrorFeed} from "../src/testnet/MirrorFeed.sol";
import {MockERC20} from "../test/mocks/Mocks.sol";

/// @notice TESTNET ONLY (46630). Lists faucet Stock Tokens with MirrorFeeds, enables the Perps desk with
///         small guarded caps and seeds the pool with test USDG (no value).
///
/// Env: TSLA_PX, AMZN_PX = latest mainnet Chainlink answers (8 decimals), read right before running.
/// Writes deployments/listed.46630.json (synced into the web app).
contract SetupTestnet is Script {
    uint256 constant U = 1e6; // tUSDG decimals

    // Faucet Stock Tokens on Robinhood Chain Testnet (symbol() checked on-chain 2026-11-06).
    address constant TSLA = 0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E;
    address constant AMZN = 0x5884aD2f920c162CFBbACc88C9C51AA75eC09E02;
    address constant NFLX = 0x3b8262A63d25f0477c4DDE23F83cfe22Cb768C93;
    // Mainnet (4663) Chainlink proxies being mirrored. NFLX has no public feed → listed without oracle.
    address constant TSLA_SRC = 0x4A1166a659A55625345e9515b32adECea5547C38;
    address constant AMZN_SRC = 0xD5a1508ceD74c084eBf3cBe853e2C968fB2a651C;

    uint32 constant STALENESS = 7 days; // registry max; mirror is refreshed manually on testnet
    uint256 constant SEED = 20_000 * U;

    function run() external {
        require(block.chainid == 46630, "SetupTestnet: testnet (46630) only");
        string memory path = string.concat(vm.projectRoot(), "/deployments/46630.json");
        string memory dep = vm.readFile(path);
        MarketRegistry registry = MarketRegistry(vm.parseJsonAddress(dep, ".MarketRegistry"));
        LiquidityPool pool = LiquidityPool(vm.parseJsonAddress(dep, ".LiquidityPool"));
        PerpsEngine perps = PerpsEngine(vm.parseJsonAddress(dep, ".PerpsEngine"));
        MockERC20 usdg = MockERC20(vm.parseJsonAddress(dep, ".usdg"));
        int256 tslaPx = vm.envInt("TSLA_PX");
        int256 amznPx = vm.envInt("AMZN_PX");

        vm.startBroadcast();
        address me = msg.sender;

        MirrorFeed tslaFeed = new MirrorFeed(8, "TSLA / USD (testnet mirror)", TSLA_SRC, me);
        MirrorFeed amznFeed = new MirrorFeed(8, "AMZN / USD (testnet mirror)", AMZN_SRC, me);
        tslaFeed.push(tslaPx);
        amznFeed.push(amznPx);

        MarketRegistry.Listing[] memory ls = new MarketRegistry.Listing[](3);
        ls[0] = MarketRegistry.Listing(TSLA, address(tslaFeed), 18, "TSLA", "");
        ls[1] = MarketRegistry.Listing(AMZN, address(amznFeed), 18, "AMZN", "");
        ls[2] = MarketRegistry.Listing(NFLX, address(0), 18, "NFLX", "");
        registry.list(ls);
        registry.setOracle(TSLA, address(tslaFeed), STALENESS);
        registry.setOracle(AMZN, address(amznFeed), STALENESS);
        registry.setFlags(TSLA, true, false);
        registry.setFlags(AMZN, true, false);

        PerpsEngine.MarketConfig memory cfg = PerpsEngine.MarketConfig({
            maxOiLong: uint128(4_000 * U),
            maxOiShort: uint128(4_000 * U),
            fundingRatePerSec: uint64(uint256(0.1e18) / 365 days), // 10%/yr at full skew
            openFeeBps: 10,
            closeFeeBps: 10,
            maintenanceBps: 500,
            liqFeeBps: 100,
            paused: false,
            configured: false
        });
        perps.configureMarket(TSLA, cfg);
        perps.configureMarket(AMZN, cfg);
        perps.setCaps(10 * U, 1_000 * U, 8_000 * U);

        usdg.mint(me, SEED);
        usdg.approve(address(pool), SEED);
        pool.deposit(SEED, me);
        vm.stopBroadcast();

        string memory o = "listed";
        vm.serializeUint(o, "chainId", block.chainid);
        string memory t = _m("TSLA", "Tesla", TSLA, address(tslaFeed), TSLA_SRC, true);
        string memory a = _m("AMZN", "Amazon", AMZN, address(amznFeed), AMZN_SRC, true);
        string memory n = _m("NFLX", "Netflix", NFLX, address(0), address(0), false);
        vm.serializeString(o, "TSLA", t);
        vm.serializeString(o, "AMZN", a);
        string memory json = vm.serializeString(o, "NFLX", n);
        vm.writeJson(json, string.concat(vm.projectRoot(), "/deployments/listed.46630.json"));

        console2.log("TSLA feed", address(tslaFeed));
        console2.log("AMZN feed", address(amznFeed));
        console2.log("pool assets", pool.totalAssets());
    }

    function _m(string memory sym, string memory name, address token, address feed, address src, bool perps)
        private
        returns (string memory)
    {
        vm.serializeString(sym, "name", name);
        vm.serializeAddress(sym, "token", token);
        vm.serializeAddress(sym, "feed", feed);
        vm.serializeAddress(sym, "sourceFeed", src);
        return vm.serializeBool(sym, "perps", perps);
    }
}
