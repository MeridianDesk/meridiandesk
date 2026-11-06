// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {MarketRegistry} from "./MarketRegistry.sol";
import {OracleRouter} from "./OracleRouter.sol";
import {LiquidityPool} from "./LiquidityPool.sol";

/// @title OptionsEngine
/// @notice v1 = buy-to-open only. European, cash-settled in USDG at expiry from the Chainlink round that
///         was live at expiry. No writing / selling by users. Premium comes from a short-lived EIP-712 quote
///         signed by a QUOTER key (RFQ), so no pricing model lives on chain.
///         Max loss for the buyer = premium. Max payout is capped and reserved in the pool at purchase.
///         Separate engine and positions from PerpsEngine — never one combined button.
contract OptionsEngine is AccessControl, Pausable, ReentrancyGuard, EIP712 {
    using SafeERC20 for IERC20;
    using SafeCast for uint256;

    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");
    bytes32 public constant QUOTER_ROLE = keccak256("QUOTER_ROLE");

    bytes32 public constant QUOTE_TYPEHASH = keccak256(
        "Quote(address buyer,address token,bool isCall,uint256 strike,uint64 expiry,uint256 quantity,uint256 premium,uint64 deadline,uint256 nonce)"
    );

    uint256 internal constant BPS = 10_000;
    uint256 internal constant WAD = 1e18;

    IERC20 public immutable usdg;
    uint256 internal immutable usdgScale; // 10**(18 - usdgDecimals)
    MarketRegistry public immutable registry;
    OracleRouter public immutable oracle;
    LiquidityPool public immutable pool;

    struct Quote {
        address buyer;
        address token;
        bool isCall;
        uint256 strike; // WAD USD
        uint64 expiry;
        uint256 quantity; // WAD, units of underlying
        uint256 premium; // USDG units
        uint64 deadline;
        uint256 nonce;
    }

    enum Status {
        None,
        Open,
        Settled,
        Voided
    }

    struct Option {
        address owner;
        uint64 expiry;
        bool isCall;
        Status status;
        address token;
        uint128 strike;
        uint128 quantity;
        uint128 premium;
        uint128 maxPayout;
    }

    mapping(uint256 id => Option) private _options;
    mapping(address owner => uint256[]) private _optionsOf;
    mapping(uint256 nonce => bool) public nonceUsed;
    uint256 public nextOptionId = 1;

    // Guarded launch params
    uint16 public callPayoutCapBps = 10_000; // call payout ≤ strike × 100% per unit (i.e. capped at 2× strike)
    uint32 public minTimeToExpiry = 1 hours;
    uint32 public maxTimeToExpiry = 45 days;
    uint32 public settlementGrace = 3 days; // after this an unsettleable option can be voided (premium refund)
    uint256 public maxPremiumPerOption;
    uint256 public totalMaxPayoutCap;
    uint256 public totalMaxPayout;

    event OptionBought(
        uint256 indexed id,
        address indexed owner,
        address indexed token,
        bool isCall,
        uint256 strike,
        uint64 expiry,
        uint256 quantity,
        uint256 premium,
        uint256 maxPayout
    );
    event OptionSettled(uint256 indexed id, address indexed owner, uint256 settlementPrice, uint256 payout);
    event OptionVoided(uint256 indexed id, address indexed owner, uint256 refund);
    event ParamsUpdated(
        uint16 callPayoutCapBps, uint32 minTte, uint32 maxTte, uint32 grace, uint256 maxPremium, uint256 totalCap
    );

    error MarketDisabled(address token);
    error QuoteExpired();
    error WrongBuyer();
    error NonceUsed(uint256 nonce);
    error BadSigner(address signer);
    error ExpiryOutOfRange(uint64 expiry);
    error PremiumOutOfRange(uint256 premium);
    error ZeroQuantity();
    error ZeroStrike();
    error TotalPayoutCapExceeded(uint256 totalAfter, uint256 cap);
    error NotOpen(uint256 id);
    error NotExpired(uint64 expiry);
    error GraceNotOver(uint256 voidableAt);
    error InvalidConfig();
    error ZeroAddress();
    error PriceTooOldToOpen(uint256 updatedAt, uint256 maxAge);

    /// @notice Optional stricter price-age limit for NEW exposure only (0 = registry staleness only).
    ///         Closing / liquidation / settlement never use it. Tightened by ops around weekend / holiday
    ///         gaps of the 24/5 Stock Token feeds (see ADR-001 §Oracle).
    uint32 public maxOpenPriceAge;

    event MaxOpenPriceAgeUpdated(uint32 maxAge);

    function setMaxOpenPriceAge(uint32 maxAge) external onlyRole(DEFAULT_ADMIN_ROLE) {
        maxOpenPriceAge = maxAge;
        emit MaxOpenPriceAgeUpdated(maxAge);
    }

    function _checkOpenAge(uint256 ts) internal view {
        if (maxOpenPriceAge != 0 && block.timestamp - ts > maxOpenPriceAge) {
            revert PriceTooOldToOpen(ts, maxOpenPriceAge);
        }
    }

    constructor(IERC20 usdg_, MarketRegistry registry_, OracleRouter oracle_, LiquidityPool pool_, address admin)
        EIP712("Meridian Desk Options", "1")
    {
        if (admin == address(0) || address(usdg_) == address(0)) revert ZeroAddress();
        usdg = usdg_;
        uint8 d = IERC20Metadata(address(usdg_)).decimals();
        if (d > 18) revert InvalidConfig();
        usdgScale = 10 ** (18 - d);
        registry = registry_;
        oracle = oracle_;
        pool = pool_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(GUARDIAN_ROLE, admin);
    }

    // ───────────────────────────── buy-to-open ─────────────────────────────

    function buy(Quote calldata q, bytes calldata signature) external nonReentrant whenNotPaused returns (uint256 id) {
        if (block.timestamp > q.deadline) revert QuoteExpired();
        if (q.buyer != msg.sender) revert WrongBuyer();
        if (nonceUsed[q.nonce]) revert NonceUsed(q.nonce);
        if (!registry.isOptionsEnabled(q.token)) revert MarketDisabled(q.token);
        if (q.quantity == 0) revert ZeroQuantity();
        if (q.strike == 0) revert ZeroStrike();
        if (q.expiry < block.timestamp + minTimeToExpiry || q.expiry > block.timestamp + maxTimeToExpiry) {
            revert ExpiryOutOfRange(q.expiry);
        }
        if (q.premium == 0 || q.premium > maxPremiumPerOption) revert PremiumOutOfRange(q.premium);

        address signer = ECDSA.recover(_hashTypedDataV4(hashQuote(q)), signature);
        if (!hasRole(QUOTER_ROLE, signer)) revert BadSigner(signer);
        nonceUsed[q.nonce] = true;

        // Oracle must be live at purchase (no buying into a stale / closed-market price).
        (, uint256 ts) = oracle.price(q.token);
        _checkOpenAge(ts);

        uint256 maxPayout = maxPayoutOf(q.isCall, q.strike, q.quantity);
        // Premium ≤ max payout, so a void refund is always covered by the option's own reservation.
        if (q.premium > maxPayout) revert PremiumOutOfRange(q.premium);
        uint256 totalAfter = totalMaxPayout + maxPayout;
        if (totalAfter > totalMaxPayoutCap) revert TotalPayoutCapExceeded(totalAfter, totalMaxPayoutCap);
        totalMaxPayout = totalAfter;

        id = nextOptionId++;
        _options[id] = Option({
            owner: msg.sender,
            expiry: q.expiry,
            isCall: q.isCall,
            status: Status.Open,
            token: q.token,
            strike: q.strike.toUint128(),
            quantity: q.quantity.toUint128(),
            premium: q.premium.toUint128(),
            maxPayout: maxPayout.toUint128()
        });
        _optionsOf[msg.sender].push(id);

        usdg.safeTransferFrom(msg.sender, address(pool), q.premium); // premium goes to LPs
        pool.reserve(maxPayout);

        emit OptionBought(id, msg.sender, q.token, q.isCall, q.strike, q.expiry, q.quantity, q.premium, maxPayout);
    }

    // ───────────────────────────── settlement ─────────────────────────────

    /// @notice Permissionless. `roundId` = the feed round live at expiry (validated by OracleRouter).
    ///         Pays the owner (never the caller).
    function settle(uint256 id, uint80 roundId) external nonReentrant {
        Option storage o = _options[id];
        if (o.status != Status.Open) revert NotOpen(id);
        if (block.timestamp < o.expiry) revert NotExpired(o.expiry);

        uint256 px = oracle.priceAtExpiry(o.token, o.expiry, roundId);
        uint256 payout = payoutAt(o.isCall, o.strike, o.quantity, px);
        if (payout > o.maxPayout) payout = o.maxPayout;

        o.status = Status.Settled;
        totalMaxPayout -= o.maxPayout;
        pool.release(o.maxPayout);
        if (payout > 0) pool.pay(o.owner, payout);
        emit OptionSettled(id, o.owner, px, payout);
    }

    /// @notice If no valid expiry round can be proven within the grace window (feed outage, aggregator
    ///         phase change), the admin multisig may void the option and the buyer gets the premium back.
    ///         Admin-only: a permissionless void would let out-of-the-money buyers reclaim premium.
    function voidUnsettled(uint256 id) external nonReentrant onlyRole(DEFAULT_ADMIN_ROLE) {
        Option storage o = _options[id];
        if (o.status != Status.Open) revert NotOpen(id);
        uint256 voidableAt = uint256(o.expiry) + settlementGrace;
        if (block.timestamp < voidableAt) revert GraceNotOver(voidableAt);

        o.status = Status.Voided;
        totalMaxPayout -= o.maxPayout;
        pool.release(o.maxPayout);
        pool.pay(o.owner, o.premium);
        emit OptionVoided(id, o.owner, o.premium);
    }

    // ───────────────────────────── views ─────────────────────────────

    function hashQuote(Quote calldata q) public pure returns (bytes32) {
        return keccak256(
            abi.encode(
                QUOTE_TYPEHASH,
                q.buyer,
                q.token,
                q.isCall,
                q.strike,
                q.expiry,
                q.quantity,
                q.premium,
                q.deadline,
                q.nonce
            )
        );
    }

    function quoteDigest(Quote calldata q) external view returns (bytes32) {
        return _hashTypedDataV4(hashQuote(q));
    }

    /// @notice USDG payout for `quantity` options at settlement price `px` (uncapped by maxPayout).
    function payoutAt(bool isCall, uint256 strike, uint256 quantity, uint256 px) public view returns (uint256) {
        uint256 intrinsic = isCall ? (px > strike ? px - strike : 0) : (strike > px ? strike - px : 0);
        return (intrinsic * quantity) / WAD / usdgScale;
    }

    /// @notice Puts are naturally capped at strike; calls are capped at strike × callPayoutCapBps.
    function maxPayoutOf(bool isCall, uint256 strike, uint256 quantity) public view returns (uint256) {
        uint256 perUnit = isCall ? (strike * callPayoutCapBps) / BPS : strike;
        return (perUnit * quantity) / WAD / usdgScale;
    }

    function getOption(uint256 id) external view returns (Option memory) {
        return _options[id];
    }

    function optionsOf(address owner) external view returns (uint256[] memory) {
        return _optionsOf[owner];
    }

    // ───────────────────────────── admin ─────────────────────────────

    function setParams(
        uint16 callCapBps,
        uint32 minTte,
        uint32 maxTte,
        uint32 grace,
        uint256 maxPremium,
        uint256 totalCap
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (callCapBps == 0 || callCapBps > 50_000 || minTte == 0 || minTte >= maxTte || grace < 1 days) {
            revert InvalidConfig();
        }
        callPayoutCapBps = callCapBps;
        minTimeToExpiry = minTte;
        maxTimeToExpiry = maxTte;
        settlementGrace = grace;
        maxPremiumPerOption = maxPremium;
        totalMaxPayoutCap = totalCap;
        emit ParamsUpdated(callCapBps, minTte, maxTte, grace, maxPremium, totalCap);
    }

    /// @dev Pausing blocks new purchases only. Settlement and void stay open so buyers are never stuck.
    function pause() external onlyRole(GUARDIAN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
}
