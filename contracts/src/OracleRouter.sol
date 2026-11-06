// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IAggregatorV3} from "./interfaces/IAggregatorV3.sol";
import {MarketRegistry} from "./MarketRegistry.sol";

/// @title OracleRouter
/// @notice Reads Chainlink Stock Token feeds through the MarketRegistry and normalises them to 1e18 (WAD).
///         Stale, missing or non-positive answers revert, so engines never trade on a frozen price —
///         this is what blocks trading across weekend / holiday gaps when the 24/5 feeds stop updating.
contract OracleRouter {
    MarketRegistry public immutable registry;

    error OracleUnavailable(address token);
    error StalePrice(address token, uint256 updatedAt, uint256 maxStaleness);
    error InvalidAnswer(address token, int256 answer);
    error RoundNotBeforeExpiry(uint80 roundId, uint256 updatedAt, uint256 expiry);
    error NextRoundNotAfterExpiry(uint80 nextRoundId, uint256 updatedAt, uint256 expiry);

    constructor(MarketRegistry registry_) {
        registry = registry_;
    }

    /// @return priceWad USD price per whole token, 1e18 precision
    /// @return updatedAt feed update timestamp
    function price(address token) public view returns (uint256 priceWad, uint256 updatedAt) {
        (address feed, uint32 maxStaleness) = registry.oracleOf(token);
        if (feed == address(0)) revert OracleUnavailable(token);
        (, int256 answer,, uint256 ts,) = IAggregatorV3(feed).latestRoundData();
        if (answer <= 0) revert InvalidAnswer(token, answer);
        if (ts == 0 || ts > block.timestamp || block.timestamp - ts > maxStaleness) {
            revert StalePrice(token, ts, maxStaleness);
        }
        return (_scale(answer, IAggregatorV3(feed).decimals()), ts);
    }

    /// @notice Settlement price for an expiry: `roundId` must be the last round published at or before
    ///         `expiry`, proven by round `roundId + 1` being published strictly after it.
    ///         Permissionless — anyone can supply the round id; a wrong one reverts.
    function priceAtExpiry(address token, uint64 expiry, uint80 roundId) external view returns (uint256 priceWad) {
        (address feed,) = registry.oracleOf(token);
        if (feed == address(0)) revert OracleUnavailable(token);
        IAggregatorV3 agg = IAggregatorV3(feed);
        (, int256 answer,, uint256 ts,) = agg.getRoundData(roundId);
        if (answer <= 0) revert InvalidAnswer(token, answer);
        if (ts == 0 || ts > expiry) revert RoundNotBeforeExpiry(roundId, ts, expiry);
        // Next round in the same phase. Phase rollovers (proxy aggregator upgrade) are handled by
        // OptionsEngine's void path rather than by guessing ids across phases.
        (,,, uint256 nextTs,) = agg.getRoundData(roundId + 1);
        if (nextTs <= expiry) revert NextRoundNotAfterExpiry(roundId + 1, nextTs, expiry);
        return _scale(answer, agg.decimals());
    }

    function _scale(int256 answer, uint8 dec) private pure returns (uint256) {
        uint256 a = uint256(answer);
        if (dec == 18) return a;
        if (dec < 18) return a * 10 ** (18 - dec);
        return a / 10 ** (dec - 18);
    }
}
