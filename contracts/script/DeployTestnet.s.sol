// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {console2} from "forge-std/Script.sol";
import {MockERC20} from "../test/mocks/Mocks.sol";
import {Deploy} from "./Deploy.s.sol";

/// @notice TESTNET ONLY (chain 46630). Deploys a freely-mintable mock USDG (6 decimals) when env USDG
///   is empty, then runs the normal Deploy flow against it. Refuses to run on any other chain.
///
///   forge script script/DeployTestnet.s.sol --rpc-url robinhood_testnet --account meridian-deployer \
///     --sender $DEPLOYER_ADDRESS --broadcast --slow
contract DeployTestnet is Deploy {
    function run() external override {
        require(block.chainid == 46630, "DeployTestnet: testnet (46630) only");

        address usdg = vm.envOr("USDG", address(0));
        if (usdg == address(0)) {
            vm.startBroadcast();
            usdg = address(new MockERC20("Meridian Test USDG", "tUSDG", 6));
            vm.stopBroadcast();
            console2.log("MockUSDG      ", usdg);
        }
        _deploy(usdg);
    }
}
