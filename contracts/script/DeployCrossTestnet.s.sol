// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {MarketRegistry} from "../src/MarketRegistry.sol";
import {OracleRouter} from "../src/OracleRouter.sol";
import {LiquidityPool} from "../src/LiquidityPool.sol";
import {OptionsEngine} from "../src/OptionsEngine.sol";
import {CrossOptionBook} from "../src/cross/CrossOptionBook.sol";
import {CrossMarginAccount} from "../src/cross/CrossMarginAccount.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice TESTNET ONLY (46630). Deploys Common Ledger P1 (CrossMarginAccount, P2: + Cross long options) next to the existing
///         Isolated stack, shares the same LiquidityPool, configures the listed perps markets and
///         writes the address into deployments/46630.json (key "CrossMarginAccount").
///         Insurance fund = admin for P1 (dedicated InsuranceFund contract lands in P2).
contract DeployCrossTestnet is Script {
    uint256 constant U = 1e6;
    address constant TSLA = 0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E;
    address constant AMZN = 0x5884aD2f920c162CFBbACc88C9C51AA75eC09E02;

    function run() external {
        require(block.chainid == 46630, "DeployCrossTestnet: testnet (46630) only");
        string memory path = string.concat(vm.projectRoot(), "/deployments/46630.json");
        string memory dep = vm.readFile(path);
        MarketRegistry registry = MarketRegistry(vm.parseJsonAddress(dep, ".MarketRegistry"));
        OracleRouter router = OracleRouter(vm.parseJsonAddress(dep, ".OracleRouter"));
        LiquidityPool pool = LiquidityPool(vm.parseJsonAddress(dep, ".LiquidityPool"));
        IERC20 usdg = IERC20(vm.parseJsonAddress(dep, ".usdg"));
        OptionsEngine options = OptionsEngine(vm.parseJsonAddress(dep, ".OptionsEngine"));
        // P2 redeploy: the P1 account (if any) loses pool access.
        address old = vm.keyExistsJson(dep, ".CrossMarginAccount") ? vm.parseJsonAddress(dep, ".CrossMarginAccount") : address(0);

        vm.startBroadcast();
        (, address me,) = vm.readCallers(); // broadcast sender (keystore), not the script's msg.sender
        CrossMarginAccount cross = new CrossMarginAccount(usdg, registry, router, pool, me, me);
        CrossOptionBook book = new CrossOptionBook(cross, options);
        cross.setOptionBook(book);
        pool.grantRole(pool.ENGINE_ROLE(), address(cross));
        if (old != address(0) && pool.hasRole(pool.ENGINE_ROLE(), old)) pool.revokeRole(pool.ENGINE_ROLE(), old);

        CrossMarginAccount.MarketConfig memory cfg = CrossMarginAccount.MarketConfig({
            maxOiLong: uint128(4_000 * U),
            maxOiShort: uint128(4_000 * U),
            fundingRatePerSec: uint64(uint256(0.1e18) / 365 days),
            openFeeBps: 10,
            closeFeeBps: 10,
            paused: false,
            configured: false
        });
        cross.configureMarket(TSLA, cfg);
        cross.configureMarket(AMZN, cfg);
        cross.setCaps(1_000 * U, 8_000 * U);
        vm.stopBroadcast();

        vm.writeJson(vm.toString(address(cross)), path, ".CrossMarginAccount");
        vm.writeJson(vm.toString(address(book)), path, ".CrossOptionBook");
        console2.log("CrossMarginAccount", address(cross));
        console2.log("CrossOptionBook", address(book));
    }
}
