// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {MarketRegistry} from "../src/MarketRegistry.sol";

/// @notice Lists the full Stock Token catalog from deployments/markets.<chainId>.json into the registry.
///         Every token is listed (none hidden); desks stay DISABLED. Enabling a market is a separate,
///         per-market multisig action after its feed has been checked.
///   env: REGISTRY, MARKETS_FILE (optional), STALENESS_BUFFER (s, default 600), BATCH (default 25)
///   Run by the LISTER (multisig via Safe tx builder, or a temporary lister key on testnet).
contract ListMarkets is Script {
    // Field order must be alphabetical for vm.parseJson → struct decoding.
    struct Entry {
        address feed;
        uint256 feedDecimals;
        uint256 heartbeat;
        string symbol;
        address token;
    }

    function run() external {
        MarketRegistry registry = MarketRegistry(vm.envAddress("REGISTRY"));
        string memory file = vm.envOr(
            "MARKETS_FILE",
            string.concat(vm.projectRoot(), "/deployments/markets.", vm.toString(block.chainid), ".json")
        );
        uint256 buffer = vm.envOr("STALENESS_BUFFER", uint256(600));
        uint256 batch = vm.envOr("BATCH", uint256(25));

        Entry[] memory all = abi.decode(vm.parseJson(vm.readFile(file), ".markets"), (Entry[]));
        console2.log("entries in file", all.length);

        vm.startBroadcast();
        uint256 listed;
        for (uint256 start; start < all.length; start += batch) {
            uint256 end = start + batch > all.length ? all.length : start + batch;
            MarketRegistry.Listing[] memory tmp = new MarketRegistry.Listing[](end - start);
            uint256 n;
            for (uint256 i = start; i < end; ++i) {
                Entry memory e = all[i];
                if (registry.getMarket(e.token).listedAt != 0) continue; // idempotent re-runs
                uint8 dec = 18;
                try IERC20Metadata(e.token).decimals() returns (uint8 d) {
                    dec = d;
                } catch {}
                tmp[n++] = MarketRegistry.Listing(e.token, e.feed, dec, e.symbol, "");
            }
            if (n == 0) continue;
            MarketRegistry.Listing[] memory items = new MarketRegistry.Listing[](n);
            for (uint256 j; j < n; ++j) {
                items[j] = tmp[j];
            }
            registry.list(items);
            listed += n;
            for (uint256 j; j < n; ++j) {
                Entry memory e = all[start + _indexOf(all, start, end, items[j].token)];
                if (e.feed != address(0) && e.heartbeat != 0) {
                    registry.setOracle(e.token, e.feed, uint32(e.heartbeat + buffer));
                }
            }
        }
        vm.stopBroadcast();
        console2.log("newly listed", listed, "total", registry.marketCount());
    }

    function _indexOf(Entry[] memory all, uint256 start, uint256 end, address token) private pure returns (uint256) {
        for (uint256 i = start; i < end; ++i) {
            if (all[i].token == token) return i - start;
        }
        revert("token missing");
    }
}
