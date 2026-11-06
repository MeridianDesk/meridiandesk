// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title MarketRegistry
/// @notice On-chain source of truth for every Stock Token Meridian Desk supports (brief §11.3).
///         The registry never hides a market: delisting is an explicit admin action that emits a public
///         changelog event, and `allMarkets()` returns every listed entry (enabled or not) so a dashboard
///         consumer cannot quietly show a "famous only" subset.
contract MarketRegistry is AccessControl {
    /// @dev Listing / flag changes. Held by the admin multisig.
    bytes32 public constant LISTER_ROLE = keccak256("LISTER_ROLE");

    struct Market {
        address token; // Robinhood Stock Token (ERC-20 on chain 4663)
        address oracle; // Chainlink AggregatorV3 proxy, address(0) = oracle unavailable
        uint8 decimals; // token decimals, read at listing time
        bool perpsEnabled;
        bool optionsEnabled;
        bool listed;
        uint48 listedAt;
        uint32 maxStaleness; // seconds; 0 = use defaultMaxStaleness
        string symbol;
        string metadataURI;
    }

    uint32 public constant MAX_STALENESS_LIMIT = 7 days;

    mapping(address token => Market) private _markets;
    address[] private _tokens;
    uint32 public defaultMaxStaleness = 1 hours;

    event MarketListed(address indexed token, string symbol, address oracle, uint8 decimals);
    event MarketDelisted(address indexed token, string symbol);
    event FlagsUpdated(address indexed token, bool perpsEnabled, bool optionsEnabled);
    event OracleUpdated(address indexed token, address oracle, uint32 maxStaleness);
    event MetadataUpdated(address indexed token, string metadataURI);
    event DefaultMaxStalenessUpdated(uint32 seconds_);

    error ZeroAddress();
    error AlreadyListed(address token);
    error NotListed(address token);
    error EmptySymbol();
    error StalenessOutOfRange(uint32 value);
    error OracleRequired(address token);

    constructor(address admin) {
        if (admin == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(LISTER_ROLE, admin);
    }

    // ───────────────────────────── admin ─────────────────────────────

    struct Listing {
        address token;
        address oracle;
        uint8 decimals;
        string symbol;
        string metadataURI;
    }

    /// @notice List markets. New markets start with both desks DISABLED; enabling is a separate action
    ///         so a listing can never silently open trading.
    function list(Listing[] calldata items) external onlyRole(LISTER_ROLE) {
        for (uint256 i; i < items.length; ++i) {
            Listing calldata l = items[i];
            if (l.token == address(0)) revert ZeroAddress();
            if (bytes(l.symbol).length == 0) revert EmptySymbol();
            Market storage m = _markets[l.token];
            if (m.listed) revert AlreadyListed(l.token);
            if (m.listedAt == 0) _tokens.push(l.token); // relisting keeps the original slot
            m.token = l.token;
            m.oracle = l.oracle;
            m.decimals = l.decimals;
            m.symbol = l.symbol;
            m.metadataURI = l.metadataURI;
            m.listed = true;
            m.perpsEnabled = false;
            m.optionsEnabled = false;
            m.listedAt = uint48(block.timestamp);
            emit MarketListed(l.token, l.symbol, l.oracle, l.decimals);
        }
    }

    /// @notice Delist: the entry stays readable (listed=false) and emits a public changelog event.
    function delist(address token) external onlyRole(LISTER_ROLE) {
        Market storage m = _listed(token);
        m.listed = false;
        m.perpsEnabled = false;
        m.optionsEnabled = false;
        emit MarketDelisted(token, m.symbol);
    }

    function setFlags(address token, bool perps, bool options) external onlyRole(LISTER_ROLE) {
        Market storage m = _listed(token);
        if ((perps || options) && m.oracle == address(0)) revert OracleRequired(token);
        m.perpsEnabled = perps;
        m.optionsEnabled = options;
        emit FlagsUpdated(token, perps, options);
    }

    function setOracle(address token, address oracle, uint32 maxStaleness) external onlyRole(LISTER_ROLE) {
        Market storage m = _listed(token);
        if (maxStaleness > MAX_STALENESS_LIMIT) revert StalenessOutOfRange(maxStaleness);
        m.oracle = oracle;
        m.maxStaleness = maxStaleness;
        if (oracle == address(0)) {
            m.perpsEnabled = false;
            m.optionsEnabled = false;
            emit FlagsUpdated(token, false, false);
        }
        emit OracleUpdated(token, oracle, maxStaleness);
    }

    function setMetadataURI(address token, string calldata uri) external onlyRole(LISTER_ROLE) {
        _listed(token).metadataURI = uri;
        emit MetadataUpdated(token, uri);
    }

    function setDefaultMaxStaleness(uint32 s) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (s == 0 || s > MAX_STALENESS_LIMIT) revert StalenessOutOfRange(s);
        defaultMaxStaleness = s;
        emit DefaultMaxStalenessUpdated(s);
    }

    // ───────────────────────────── views ─────────────────────────────

    function marketCount() external view returns (uint256) {
        return _tokens.length;
    }

    function tokenAt(uint256 i) external view returns (address) {
        return _tokens[i];
    }

    function getMarket(address token) external view returns (Market memory) {
        return _markets[token];
    }

    /// @notice Every market ever listed, in listing order, including disabled and delisted entries.
    function allMarkets() external view returns (Market[] memory out) {
        out = new Market[](_tokens.length);
        for (uint256 i; i < out.length; ++i) {
            out[i] = _markets[_tokens[i]];
        }
    }

    /// @notice Paged variant for large catalogs (RPC response limits).
    function marketsPage(uint256 offset, uint256 limit) external view returns (Market[] memory out) {
        uint256 n = _tokens.length;
        if (offset >= n) return out;
        uint256 end = offset + limit > n ? n : offset + limit;
        out = new Market[](end - offset);
        for (uint256 i = offset; i < end; ++i) {
            out[i - offset] = _markets[_tokens[i]];
        }
    }

    function isPerpsEnabled(address token) external view returns (bool) {
        Market storage m = _markets[token];
        return m.listed && m.perpsEnabled;
    }

    function isOptionsEnabled(address token) external view returns (bool) {
        Market storage m = _markets[token];
        return m.listed && m.optionsEnabled;
    }

    function oracleOf(address token) external view returns (address oracle, uint32 maxStaleness) {
        Market storage m = _markets[token];
        return (m.oracle, m.maxStaleness == 0 ? defaultMaxStaleness : m.maxStaleness);
    }

    function _listed(address token) private view returns (Market storage m) {
        m = _markets[token];
        if (!m.listed) revert NotListed(token);
    }
}
