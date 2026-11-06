// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IAggregatorV3} from "../../src/interfaces/IAggregatorV3.sol";

contract MockERC20 is ERC20 {
    uint8 private immutable _dec;

    constructor(string memory n, string memory s, uint8 d) ERC20(n, s) {
        _dec = d;
    }

    function decimals() public view override returns (uint8) {
        return _dec;
    }

    function mint(address to, uint256 amt) external {
        _mint(to, amt);
    }
}

/// @dev Chainlink-like aggregator with historical rounds (8 decimals like the RH stock feeds).
contract MockAggregator is IAggregatorV3 {
    struct Round {
        int256 answer;
        uint256 updatedAt;
    }

    uint8 public immutable override decimals;
    uint80 public latestRound;
    mapping(uint80 => Round) public rounds;

    constructor(uint8 d) {
        decimals = d;
    }

    function description() external pure returns (string memory) {
        return "MOCK / USD";
    }

    function push(int256 answer) external returns (uint80) {
        return pushAt(answer, block.timestamp);
    }

    function pushAt(int256 answer, uint256 ts) public returns (uint80) {
        latestRound++;
        rounds[latestRound] = Round(answer, ts);
        return latestRound;
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        Round memory r = rounds[latestRound];
        return (latestRound, r.answer, r.updatedAt, r.updatedAt, latestRound);
    }

    function getRoundData(uint80 id) external view returns (uint80, int256, uint256, uint256, uint80) {
        Round memory r = rounds[id];
        return (id, r.answer, r.updatedAt, r.updatedAt, id);
    }
}
