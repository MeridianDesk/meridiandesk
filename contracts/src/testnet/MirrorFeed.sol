// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IAggregatorV3} from "../interfaces/IAggregatorV3.sol";

/// @title MirrorFeed — TESTNET ONLY
/// @notice Robinhood Chain Testnet (46630) has no Chainlink Stock Token feeds. This contract mirrors the
///         answer of the matching Chainlink feed on Robinhood Chain mainnet (4663), pushed by a single
///         pusher. Values are illustrative: they are a delayed copy, not a price source. The constructor
///         refuses to deploy on any chain other than 46630 so it can never back a mainnet market.
contract MirrorFeed is IAggregatorV3 {
    struct Round {
        int256 answer;
        uint256 updatedAt;
    }

    uint8 public immutable override decimals;
    address public immutable pusher;
    /// @notice The mainnet (4663) Chainlink proxy this feed mirrors.
    address public immutable sourceFeed;
    string private _description;

    uint80 public latestRound;
    mapping(uint80 => Round) private _rounds;

    event Pushed(uint80 indexed roundId, int256 answer, uint256 updatedAt);

    error NotPusher();
    error TestnetOnly();
    error BadAnswer();

    constructor(uint8 decimals_, string memory description_, address sourceFeed_, address pusher_) {
        if (block.chainid != 46630) revert TestnetOnly();
        decimals = decimals_;
        _description = description_;
        sourceFeed = sourceFeed_;
        pusher = pusher_;
    }

    function description() external view returns (string memory) {
        return _description;
    }

    function push(int256 answer) external returns (uint80 id) {
        if (msg.sender != pusher) revert NotPusher();
        if (answer <= 0) revert BadAnswer();
        id = ++latestRound;
        _rounds[id] = Round(answer, block.timestamp);
        emit Pushed(id, answer, block.timestamp);
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        Round memory r = _rounds[latestRound];
        return (latestRound, r.answer, r.updatedAt, r.updatedAt, latestRound);
    }

    function getRoundData(uint80 id) external view returns (uint80, int256, uint256, uint256, uint80) {
        Round memory r = _rounds[id];
        return (id, r.answer, r.updatedAt, r.updatedAt, id);
    }
}
