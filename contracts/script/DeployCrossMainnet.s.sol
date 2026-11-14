// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {MarketRegistry} from "../src/MarketRegistry.sol";
import {OracleRouter} from "../src/OracleRouter.sol";
import {LiquidityPool} from "../src/LiquidityPool.sol";
import {OptionsEngine} from "../src/OptionsEngine.sol";
import {CrossOptionBook} from "../src/cross/CrossOptionBook.sol";
import {CrossMarginAccount} from "../src/cross/CrossMarginAccount.sol";
import {InsuranceFund} from "../src/cross/InsuranceFund.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice MAINNET (4663). Deploys Common Ledger (InsuranceFund, CrossMarginAccount, CrossOptionBook) with the Safe
///         as admin FROM THE CONSTRUCTOR. The broadcaster only pays gas and never holds a role, so an exposed
///         key cannot take over. Nothing is usable until the Safe executes batch 05 (roles, book, market, caps):
///         caps start at 0, so deposits revert until then. Run via script/mainnet/4-deploy-cross.sh.
contract DeployCrossMainnet is Script {
    function run() external {
        require(block.chainid == 4663, "DeployCrossMainnet: mainnet (4663) only");
        require(
            keccak256(bytes(vm.envOr("MAINNET_ACK", string("")))) == keccak256("I_UNDERSTAND_UNAUDITED_MAINNET"),
            "mainnet: set MAINNET_ACK"
        );
        string memory path = string.concat(vm.projectRoot(), "/deployments/4663.json");
        string memory dep = vm.readFile(path);
        require(!vm.keyExistsJson(dep, ".CrossMarginAccount"), "Cross already deployed on 4663");
        address admin = vm.parseJsonAddress(dep, ".admin");
        require(admin.code.length > 0, "admin must be the Safe (contract)");
        LiquidityPool pool = LiquidityPool(vm.parseJsonAddress(dep, ".LiquidityPool"));
        IERC20 usdg = IERC20(vm.parseJsonAddress(dep, ".usdg"));

        vm.startBroadcast();
        InsuranceFund fund = new InsuranceFund(usdg, address(pool), admin);
        CrossMarginAccount cross = new CrossMarginAccount(
            usdg,
            MarketRegistry(vm.parseJsonAddress(dep, ".MarketRegistry")),
            OracleRouter(vm.parseJsonAddress(dep, ".OracleRouter")),
            pool,
            admin,
            address(fund)
        );
        CrossOptionBook book = new CrossOptionBook(cross, OptionsEngine(vm.parseJsonAddress(dep, ".OptionsEngine")));
        vm.stopBroadcast();

        // Broadcaster must hold nothing.
        require(!cross.hasRole(cross.DEFAULT_ADMIN_ROLE(), msg.sender) || msg.sender == admin, "deployer has admin");
        require(cross.hasRole(cross.DEFAULT_ADMIN_ROLE(), admin) && fund.hasRole(fund.DEFAULT_ADMIN_ROLE(), admin), "admin");

        vm.writeJson(vm.toString(address(cross)), path, ".CrossMarginAccount");
        vm.writeJson(vm.toString(address(book)), path, ".CrossOptionBook");
        vm.writeJson(vm.toString(address(fund)), path, ".InsuranceFund");
        console2.log("InsuranceFund", address(fund));
        console2.log("CrossMarginAccount", address(cross));
        console2.log("CrossOptionBook", address(book));
    }
}
