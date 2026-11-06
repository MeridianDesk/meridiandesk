// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {MarketRegistry} from "../src/MarketRegistry.sol";
import {OracleRouter} from "../src/OracleRouter.sol";
import {IAggregatorV3} from "../src/interfaces/IAggregatorV3.sol";

/// @notice Read-only fork check against Robinhood Chain mainnet (4663): real Stock Token + Chainlink proxy.
///         Skipped unless RH_FORK_RPC is set, e.g. RH_FORK_RPC=https://robinhood.drpc.org forge test --mt Fork -vv
contract ForkMainnetTest is Test {
    struct Entry {
        address feed;
        uint256 feedDecimals;
        uint256 heartbeat;
        string symbol;
        address token;
    }

    function test_Fork_realFeedsThroughRouter() public {
        string memory rpc = vm.envOr("RH_FORK_RPC", string(""));
        if (bytes(rpc).length == 0) {
            vm.skip(true);
            return;
        }
        vm.createSelectFork(rpc);
        assertEq(block.chainid, 4663);

        Entry[] memory all = abi.decode(
            vm.parseJson(vm.readFile(string.concat(vm.projectRoot(), "/deployments/markets.4663.json")), ".markets"),
            (Entry[])
        );
        address admin = address(this);
        MarketRegistry registry = new MarketRegistry(admin);
        OracleRouter router = new OracleRouter(registry);

        uint256 checked;
        for (uint256 i; i < all.length && checked < 6; ++i) {
            Entry memory e = all[i];
            if (e.feed == address(0)) continue;
            assertGt(e.token.code.length, 0, string.concat(e.symbol, ": token has no code"));
            uint8 dec = IERC20Metadata(e.token).decimals();
            assertEq(IAggregatorV3(e.feed).decimals(), e.feedDecimals);

            MarketRegistry.Listing[] memory ls = new MarketRegistry.Listing[](1);
            ls[0] = MarketRegistry.Listing(e.token, e.feed, dec, e.symbol, "");
            registry.list(ls);
            // Use heartbeat + 3d so a weekend fork date still reads; the point is wiring, not freshness.
            registry.setOracle(e.token, e.feed, uint32(e.heartbeat + 3 days));
            (uint256 px, uint256 ts) = router.price(e.token);
            console2.log(e.symbol, IERC20Metadata(e.token).symbol(), px / 1e16, ts); // price in cents
            assertGt(px, 0);
            checked++;
        }
        assertEq(checked, 6);
    }
}
