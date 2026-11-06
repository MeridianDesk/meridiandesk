// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MarketRegistry} from "../src/MarketRegistry.sol";
import {OracleRouter} from "../src/OracleRouter.sol";
import {LiquidityPool} from "../src/LiquidityPool.sol";
import {PerpsEngine} from "../src/PerpsEngine.sol";
import {OptionsEngine} from "../src/OptionsEngine.sol";

/// @notice Deploys the Meridian Desk core with GUARDED launch params.
///   env: USDG (collateral token), ADMIN (Safe multisig — receives all roles), GUARDIAN (optional pause key),
///        QUOTER (options RFQ signer), DEPOSIT_CAP (USDG units, default 50_000e6).
///   The deployer key never keeps a role: roles are granted to ADMIN, then renounced.
///   Markets are NOT listed here (see ListMarkets.s.sol) and both desks start disabled.
///
///   forge script script/Deploy.s.sol --rpc-url robinhood_testnet --broadcast --verify
contract Deploy is Script {
    function run() external {
        address usdg = vm.envAddress("USDG");
        address admin = vm.envAddress("ADMIN");
        address guardian = vm.envOr("GUARDIAN", address(0));
        address quoter = vm.envOr("QUOTER", address(0));
        uint256 depositCap = vm.envOr("DEPOSIT_CAP", uint256(50_000e6));

        vm.startBroadcast();
        address deployer = msg.sender;

        MarketRegistry registry = new MarketRegistry(deployer);
        OracleRouter router = new OracleRouter(registry);
        LiquidityPool pool = new LiquidityPool(IERC20(usdg), deployer, depositCap);
        PerpsEngine perps = new PerpsEngine(IERC20(usdg), registry, router, pool, deployer);
        OptionsEngine options = new OptionsEngine(IERC20(usdg), registry, router, pool, deployer);

        pool.grantRole(pool.ENGINE_ROLE(), address(perps));
        pool.grantRole(pool.ENGINE_ROLE(), address(options));

        // Guarded caps (USDG 6 decimals): $10 min, $1k max per position, $25k total collateral.
        perps.setCaps(10e6, 1_000e6, 25_000e6);
        // Calls capped at +100% of strike, 1h..45d expiry, 3d settlement grace, $500 max premium, $50k total.
        options.setParams(10_000, 1 hours, 45 days, 3 days, 500e6, 50_000e6);
        pool.setCaps(depositCap, 10_000e6, 8_000);
        if (quoter != address(0)) options.grantRole(options.QUOTER_ROLE(), quoter);

        _handOver(address(registry), deployer, admin, guardian, registry.LISTER_ROLE(), bytes32(0));
        _handOver(address(pool), deployer, admin, guardian, pool.GUARDIAN_ROLE(), pool.GUARDIAN_ROLE());
        _handOver(address(perps), deployer, admin, guardian, perps.GUARDIAN_ROLE(), perps.GUARDIAN_ROLE());
        _handOver(address(options), deployer, admin, guardian, options.GUARDIAN_ROLE(), options.GUARDIAN_ROLE());
        vm.stopBroadcast();

        console2.log("MarketRegistry", address(registry));
        console2.log("OracleRouter  ", address(router));
        console2.log("LiquidityPool ", address(pool));
        console2.log("PerpsEngine   ", address(perps));
        console2.log("OptionsEngine ", address(options));

        string memory k = "deploy";
        vm.serializeUint(k, "chainId", block.chainid);
        vm.serializeAddress(k, "usdg", usdg);
        vm.serializeAddress(k, "admin", admin);
        vm.serializeAddress(k, "MarketRegistry", address(registry));
        vm.serializeAddress(k, "OracleRouter", address(router));
        vm.serializeAddress(k, "LiquidityPool", address(pool));
        vm.serializeAddress(k, "PerpsEngine", address(perps));
        string memory json = vm.serializeAddress(k, "OptionsEngine", address(options));
        vm.writeJson(json, string.concat("deployments/", vm.toString(block.chainid), ".json"));
    }

    /// @dev Grant admin (+ extra role) to the multisig, the guardian role to a hot pause key, renounce deployer.
    function _handOver(
        address c,
        address deployer,
        address admin,
        address guardian,
        bytes32 extraRole,
        bytes32 guardianRole
    ) internal {
        IAccess a = IAccess(c);
        bytes32 adminRole = 0x00;
        a.grantRole(adminRole, admin);
        a.grantRole(extraRole, admin);
        if (guardian != address(0) && guardianRole != bytes32(0)) a.grantRole(guardianRole, guardian);
        if (admin != deployer) {
            a.renounceRole(extraRole, deployer);
            a.renounceRole(adminRole, deployer);
        }
    }
}

interface IAccess {
    function grantRole(bytes32 role, address account) external;
    function renounceRole(bytes32 role, address callerConfirmation) external;
}
