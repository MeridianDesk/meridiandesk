// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Base} from "./Base.t.sol";
import {PerpsEngine} from "../src/PerpsEngine.sol";
import {LiquidityPool} from "../src/LiquidityPool.sol";
import {MockERC20, MockAggregator} from "./mocks/Mocks.sol";

/// @dev Random open / close / liquidate / price moves by several traders.
contract PerpsHandler is Test {
    PerpsEngine perps;
    MockERC20 usdg;
    MockAggregator feed;
    address token;
    address[3] traders;
    uint256[] public ids;

    function opened() external view returns (uint256) {
        return ids.length;
    }
    int256 public price = 400e8;

    constructor(PerpsEngine p, MockERC20 u, MockAggregator f, address t) {
        perps = p;
        usdg = u;
        feed = f;
        token = t;
        for (uint256 i; i < 3; ++i) {
            traders[i] = address(uint160(0xBEEF00 + i));
            u.mint(traders[i], 10_000_000e6);
            vm.prank(traders[i]);
            u.approve(address(p), type(uint256).max);
        }
    }

    function open(uint256 who, bool isLong, uint256 c, uint8 levIdx) external {
        uint16[4] memory levs = [uint16(10_000), 12_500, 15_000, 20_000];
        c = bound(c, 10e6, 20_000e6);
        vm.prank(traders[who % 3]);
        try perps.open(token, isLong, c, levs[levIdx % 4], isLong ? type(uint256).max : 0) returns (uint256 id) {
            ids.push(id);
        } catch {}
    }

    function move(int256 bps) external {
        bps = bound(bps, -2_000, 2_000);
        int256 next = (price * (10_000 + bps)) / 10_000;
        if (next < 1e8) next = 1e8;
        price = next;
        vm.warp(block.timestamp + 10 minutes);
        feed.push(price);
    }

    function close(uint256 i) external {
        if (ids.length == 0) return;
        uint256 id = ids[i % ids.length];
        PerpsEngine.Position memory p = perps.getPosition(id);
        if (!p.open) return;
        vm.prank(p.owner);
        try perps.close(id, p.isLong ? 0 : type(uint256).max) {} catch {}
    }

    function liquidate(uint256 i) external {
        if (ids.length == 0) return;
        try perps.liquidate(ids[i % ids.length]) {} catch {}
    }
}

contract PerpsInvariantTest is Base {
    PerpsHandler handler;

    function setUp() public override {
        super.setUp();
        handler = new PerpsHandler(perps, usdg, feed, address(tsla));
        targetContract(address(handler));
    }

    /// Engine always holds exactly the collateral of open positions (no leakage).
    function invariant_engineHoldsCollateral() public view {
        assertEq(usdg.balanceOf(address(perps)), perps.totalCollateral());
    }

    /// Pool can always cover the max payout it promised.
    function invariant_poolCoversReservations() public view {
        assertGe(pool.totalAssets(), pool.reserved());
    }

    /// Reserved = sum of open notional.
    function invariant_reservedMatchesOi() public view {
        (uint128 l, uint128 s,,,) = perps.marketState(address(tsla));
        assertEq(pool.reserved(), uint256(l) + s);
    }

    /// Sanity: the campaign actually opened positions (try/catch would otherwise hide a dead handler).
    function afterInvariant() public view {
        assertGt(handler.opened(), 0, "handler never opened");
    }
}
