// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {MarketRegistry} from "./MarketRegistry.sol";
import {OracleRouter} from "./OracleRouter.sol";
import {LiquidityPool} from "./LiquidityPool.sol";

/// @title PerpsEngine
/// @notice Isolated-margin, oracle-priced perpetuals on Robinhood Stock Tokens, USDG margin.
///         Counterparty = LiquidityPool. Leverage is one of exactly 1× / 1.25× / 1.5× / 2× — enforced
///         here (defense in depth with the UI). Max profit per position = its notional, which is
///         reserved in the pool at open, so every position is fully backed.
///         See docs/adr/ADR-001-risk-model.md.
contract PerpsEngine is AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using SafeCast for uint256;
    using SafeCast for int256;

    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");

    uint256 internal constant BPS = 10_000;
    uint256 internal constant WAD = 1e18;
    /// @notice Hard leverage cap (2×) in bps.
    uint16 public constant MAX_LEVERAGE_BPS = 20_000;
    uint16 public constant MAX_FEE_BPS = 100; // 1%
    uint256 public constant MAX_FUNDING_RATE_PER_SEC = 1e18 / uint256(365 days); // ≤100%/yr at full skew

    IERC20 public immutable usdg;
    MarketRegistry public immutable registry;
    OracleRouter public immutable oracle;
    LiquidityPool public immutable pool;

    struct MarketConfig {
        uint128 maxOiLong; // USDG notional
        uint128 maxOiShort;
        uint64 fundingRatePerSec; // WAD per second at 100% skew
        uint16 openFeeBps;
        uint16 closeFeeBps;
        uint16 maintenanceBps; // of notional
        uint16 liqFeeBps; // keeper reward, of notional
        bool paused; // blocks opens for this market only
        bool configured;
    }

    struct MarketState {
        uint128 longOi;
        uint128 shortOi;
        uint128 cumFundingLong; // WAD per 1 unit notional
        uint128 cumFundingShort;
        uint64 lastAccrual;
    }

    struct Position {
        address owner;
        uint64 openedAt;
        uint16 leverageBps;
        bool isLong;
        bool open;
        address token;
        uint128 collateral; // USDG, net of open fee
        uint128 size; // USDG notional
        uint128 entryPrice; // WAD
        uint128 entryFunding; // cum funding index of its side at open
    }

    mapping(address token => MarketConfig) public marketConfig;
    mapping(address token => MarketState) public marketState;
    mapping(uint256 id => Position) private _positions;
    mapping(address owner => uint256[]) private _positionsOf;
    uint256 public nextPositionId = 1;

    // Guarded-launch caps (USDG units)
    uint256 public minCollateral;
    uint256 public maxCollateralPerPosition;
    uint256 public totalCollateralCap;
    uint256 public totalCollateral;
    /// @notice Emergency freeze: blocks close and liquidation too (oracle compromise). Admin only.
    bool public frozen;

    event MarketConfigured(address indexed token, MarketConfig cfg);
    event MarketPaused(address indexed token, bool paused);
    event CapsUpdated(uint256 minCollateral, uint256 maxCollateralPerPosition, uint256 totalCollateralCap);
    event Frozen(bool frozen);
    event PositionOpened(
        uint256 indexed id,
        address indexed owner,
        address indexed token,
        bool isLong,
        uint16 leverageBps,
        uint256 collateral,
        uint256 size,
        uint256 price,
        uint256 fee
    );
    event PositionClosed(
        uint256 indexed id,
        address indexed owner,
        uint256 price,
        int256 pnl,
        uint256 funding,
        uint256 fee,
        uint256 paidOut
    );
    event PositionLiquidated(
        uint256 indexed id,
        address indexed owner,
        address indexed keeper,
        uint256 price,
        int256 equity,
        uint256 keeperFee,
        uint256 paidOut
    );

    error InvalidLeverage(uint256 leverageBps);
    error MarketDisabled(address token);
    error MarketNotConfigured(address token);
    error MarketIsPaused(address token);
    error CollateralOutOfRange(uint256 collateral);
    error TotalCollateralCapExceeded(uint256 totalAfter, uint256 cap);
    error OpenInterestCapExceeded(address token, bool isLong, uint256 oiAfter, uint256 cap);
    error Slippage(uint256 price, uint256 acceptablePrice);
    error NotOwner();
    error NotOpen(uint256 id);
    error NotLiquidatable(int256 equity, uint256 maintenance);
    error IsFrozen();
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

    constructor(IERC20 usdg_, MarketRegistry registry_, OracleRouter oracle_, LiquidityPool pool_, address admin) {
        if (admin == address(0) || address(usdg_) == address(0)) revert ZeroAddress();
        usdg = usdg_;
        registry = registry_;
        oracle = oracle_;
        pool = pool_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(GUARDIAN_ROLE, admin);
    }

    // ───────────────────────────── leverage ─────────────────────────────

    /// @notice The only accepted leverage values: 1×, 1.25×, 1.5×, 2× (bps).
    function isAllowedLeverage(uint256 leverageBps) public pure returns (bool) {
        return leverageBps == 10_000 || leverageBps == 12_500 || leverageBps == 15_000 || leverageBps == 20_000;
    }

    // ───────────────────────────── trading ─────────────────────────────

    function open(address token, bool isLong, uint256 collateral, uint16 leverageBps, uint256 acceptablePrice)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 id)
    {
        if (frozen) revert IsFrozen();
        if (!isAllowedLeverage(leverageBps)) revert InvalidLeverage(leverageBps);
        MarketConfig memory cfg = marketConfig[token];
        if (!cfg.configured) revert MarketNotConfigured(token);
        if (cfg.paused) revert MarketIsPaused(token);
        if (!registry.isPerpsEnabled(token)) revert MarketDisabled(token);
        if (collateral < minCollateral || collateral > maxCollateralPerPosition) {
            revert CollateralOutOfRange(collateral);
        }

        (uint256 px, uint256 ts) = oracle.price(token);
        _checkOpenAge(ts);
        if (isLong ? px > acceptablePrice : px < acceptablePrice) revert Slippage(px, acceptablePrice);

        _accrue(token, cfg);

        // size = net × L and fee = size × feeBps, net = collateral − fee
        //   ⇒ size = collateral × L / (1 + L × feeBps)   (all in bps)
        uint256 size = (collateral * leverageBps * BPS) / (BPS * BPS + uint256(leverageBps) * cfg.openFeeBps);
        uint256 fee = collateral - (size * BPS + leverageBps - 1) / leverageBps; // net rounded up ⇒ fee rounded down
        uint256 net = collateral - fee;
        // Defense in depth: effective leverage never above the 2× hard cap.
        if (size * BPS > net * MAX_LEVERAGE_BPS) revert InvalidLeverage((size * BPS) / net);

        uint256 totalAfter = totalCollateral + net;
        if (totalAfter > totalCollateralCap) revert TotalCollateralCapExceeded(totalAfter, totalCollateralCap);
        totalCollateral = totalAfter;

        MarketState storage st = marketState[token];
        if (isLong) {
            uint256 oi = st.longOi + size;
            if (oi > cfg.maxOiLong) revert OpenInterestCapExceeded(token, true, oi, cfg.maxOiLong);
            st.longOi = oi.toUint128();
        } else {
            uint256 oi = st.shortOi + size;
            if (oi > cfg.maxOiShort) revert OpenInterestCapExceeded(token, false, oi, cfg.maxOiShort);
            st.shortOi = oi.toUint128();
        }

        id = nextPositionId++;
        _positions[id] = Position({
            owner: msg.sender,
            openedAt: uint64(block.timestamp),
            leverageBps: leverageBps,
            isLong: isLong,
            open: true,
            token: token,
            collateral: net.toUint128(),
            size: size.toUint128(),
            entryPrice: px.toUint128(),
            entryFunding: isLong ? st.cumFundingLong : st.cumFundingShort
        });
        _positionsOf[msg.sender].push(id);

        usdg.safeTransferFrom(msg.sender, address(this), collateral);
        if (fee > 0) usdg.safeTransfer(address(pool), fee);
        pool.reserve(size); // max profit = notional, fully backed

        emit PositionOpened(id, msg.sender, token, isLong, leverageBps, net, size, px, fee);
    }

    function close(uint256 id, uint256 acceptablePrice) external nonReentrant {
        if (frozen) revert IsFrozen();
        Position storage p = _positions[id];
        if (!p.open) revert NotOpen(id);
        if (p.owner != msg.sender) revert NotOwner();

        (uint256 px,) = oracle.price(p.token);
        if (p.isLong ? px < acceptablePrice : px > acceptablePrice) revert Slippage(px, acceptablePrice);

        MarketConfig memory cfg = marketConfig[p.token];
        _accrue(p.token, cfg);

        int256 pnl = _pnl(p, px);
        uint256 funding = _funding(p);
        uint256 fee = (uint256(p.size) * cfg.closeFeeBps) / BPS;
        int256 out = int256(uint256(p.collateral)) + pnl - int256(funding) - int256(fee);
        uint256 paid = out > 0 ? uint256(out) : 0;

        _settle(id, p, paid, address(0), 0);
        emit PositionClosed(id, p.owner, px, pnl, funding, fee, paid);
    }

    /// @notice Permissionless liquidation once equity < maintenance margin. Keeper earns liqFeeBps of notional
    ///         (bounded by collateral); any remaining equity goes back to the trader.
    function liquidate(uint256 id) external nonReentrant {
        if (frozen) revert IsFrozen();
        Position storage p = _positions[id];
        if (!p.open) revert NotOpen(id);

        (uint256 px,) = oracle.price(p.token);
        MarketConfig memory cfg = marketConfig[p.token];
        _accrue(p.token, cfg);

        int256 equity = int256(uint256(p.collateral)) + _pnl(p, px) - int256(_funding(p));
        uint256 maint = (uint256(p.size) * cfg.maintenanceBps) / BPS;
        if (equity >= int256(maint)) revert NotLiquidatable(equity, maint);

        uint256 keeperFee = (uint256(p.size) * cfg.liqFeeBps) / BPS;
        if (keeperFee > p.collateral) keeperFee = p.collateral;
        int256 rest = equity - int256(keeperFee);
        uint256 paid = rest > 0 ? uint256(rest) : 0;

        address owner = p.owner;
        _settle(id, p, paid, msg.sender, keeperFee);
        emit PositionLiquidated(id, owner, msg.sender, px, equity, keeperFee, paid);
    }

    // ───────────────────────────── views ─────────────────────────────

    function getPosition(uint256 id) external view returns (Position memory) {
        return _positions[id];
    }

    function positionsOf(address owner) external view returns (uint256[] memory) {
        return _positionsOf[owner];
    }

    /// @notice Live equity / liquidation status at the current oracle price (reverts if oracle stale).
    function positionHealth(uint256 id)
        external
        view
        returns (int256 pnl, uint256 funding, int256 equity, uint256 maintenance, bool liquidatable)
    {
        Position memory p = _positions[id];
        if (!p.open) revert NotOpen(id);
        (uint256 px,) = oracle.price(p.token);
        pnl = _pnl(p, px);
        (uint256 cl, uint256 cs) = _projectedFunding(p.token);
        funding = (uint256(p.size) * ((p.isLong ? cl : cs) - p.entryFunding)) / WAD;
        equity = int256(uint256(p.collateral)) + pnl - int256(funding);
        maintenance = (uint256(p.size) * marketConfig[p.token].maintenanceBps) / BPS;
        liquidatable = equity < int256(maintenance);
    }

    /// @notice Estimated liquidation price ignoring future funding (UI preview).
    function liquidationPrice(uint256 id) external view returns (uint256) {
        Position memory p = _positions[id];
        if (!p.open) revert NotOpen(id);
        uint256 maint = (uint256(p.size) * marketConfig[p.token].maintenanceBps) / BPS;
        // long: c + size·(P−E)/E = maint ⇒ P = E·(1 − (c − maint)/size)
        int256 buffer = int256(uint256(p.collateral)) - int256(maint);
        int256 move = (int256(uint256(p.entryPrice)) * buffer) / int256(uint256(p.size));
        int256 liq = p.isLong ? int256(uint256(p.entryPrice)) - move : int256(uint256(p.entryPrice)) + move;
        return liq > 0 ? uint256(liq) : 0;
    }

    // ───────────────────────────── internals ─────────────────────────────

    function _pnl(Position memory p, uint256 px) internal pure returns (int256 pnl) {
        int256 d = int256(px) - int256(uint256(p.entryPrice));
        if (!p.isLong) d = -d;
        pnl = (int256(uint256(p.size)) * d) / int256(uint256(p.entryPrice));
        if (pnl > int256(uint256(p.size))) pnl = int256(uint256(p.size)); // profit cap = reserved notional
    }

    function _funding(Position memory p) internal view returns (uint256) {
        MarketState storage st = marketState[p.token];
        uint256 cum = p.isLong ? st.cumFundingLong : st.cumFundingShort;
        return (uint256(p.size) * (cum - p.entryFunding)) / WAD;
    }

    function _projectedFunding(address token) internal view returns (uint256 cl, uint256 cs) {
        MarketState memory st = marketState[token];
        (uint256 dl, uint256 ds) = _fundingDelta(st, marketConfig[token].fundingRatePerSec);
        return (st.cumFundingLong + dl, st.cumFundingShort + ds);
    }

    /// @dev Funding is paid by the heavier side only, into the pool (which carries the skew risk).
    function _fundingDelta(MarketState memory st, uint256 ratePerSec) internal view returns (uint256 dl, uint256 ds) {
        if (st.lastAccrual == 0) return (0, 0);
        uint256 dt = block.timestamp - st.lastAccrual;
        uint256 total = uint256(st.longOi) + st.shortOi;
        if (dt == 0 || total == 0 || st.longOi == st.shortOi) return (0, 0);
        uint256 skew = st.longOi > st.shortOi ? st.longOi - st.shortOi : st.shortOi - st.longOi;
        uint256 delta = (ratePerSec * dt * skew) / total;
        if (st.longOi > st.shortOi) return (delta, 0);
        return (0, delta);
    }

    function _accrue(address token, MarketConfig memory cfg) internal {
        MarketState storage st = marketState[token];
        (uint256 dl, uint256 ds) = _fundingDelta(st, cfg.fundingRatePerSec);
        if (dl != 0) st.cumFundingLong = (st.cumFundingLong + dl).toUint128();
        if (ds != 0) st.cumFundingShort = (st.cumFundingShort + ds).toUint128();
        st.lastAccrual = uint64(block.timestamp);
    }

    function _settle(uint256, Position storage p, uint256 toUser, address keeper, uint256 toKeeper) internal {
        uint256 c = p.collateral;
        uint256 size = p.size;
        p.open = false;
        totalCollateral -= c;
        MarketState storage st = marketState[p.token];
        if (p.isLong) st.longOi -= size.toUint128();
        else st.shortOi -= size.toUint128();

        pool.release(size);

        // toKeeper ≤ c always. Profit beyond collateral comes from the pool (≤ size, which was reserved).
        if (toKeeper > 0) usdg.safeTransfer(keeper, toKeeper);
        uint256 fromEngine = c - toKeeper;
        if (toUser > fromEngine) {
            if (fromEngine > 0) usdg.safeTransfer(p.owner, fromEngine);
            pool.pay(p.owner, toUser - fromEngine);
        } else {
            if (toUser > 0) usdg.safeTransfer(p.owner, toUser);
            if (fromEngine - toUser > 0) usdg.safeTransfer(address(pool), fromEngine - toUser);
        }
    }

    // ───────────────────────────── admin ─────────────────────────────

    function configureMarket(address token, MarketConfig calldata cfg) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (
            cfg.openFeeBps > MAX_FEE_BPS || cfg.closeFeeBps > MAX_FEE_BPS
                || cfg.fundingRatePerSec > MAX_FUNDING_RATE_PER_SEC || cfg.maintenanceBps == 0
                || cfg.maintenanceBps >= 5_000 // must sit below 2× initial margin (50%)
                || cfg.liqFeeBps > cfg.maintenanceBps
        ) {
            revert InvalidConfig();
        }
        _accrue(token, marketConfig[token]); // settle old rate up to now
        MarketConfig memory c = cfg;
        c.configured = true;
        marketConfig[token] = c;
        emit MarketConfigured(token, c);
    }

    function setMarketPaused(address token, bool paused_) external onlyRole(GUARDIAN_ROLE) {
        if (!paused_ && !hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) revert InvalidConfig(); // guardians only pause
        marketConfig[token].paused = paused_;
        emit MarketPaused(token, paused_);
    }

    function setCaps(uint256 min_, uint256 maxPerPosition, uint256 totalCap) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (min_ > maxPerPosition) revert InvalidConfig();
        minCollateral = min_;
        maxCollateralPerPosition = maxPerPosition;
        totalCollateralCap = totalCap;
        emit CapsUpdated(min_, maxPerPosition, totalCap);
    }

    function pause() external onlyRole(GUARDIAN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    function setFrozen(bool f) external onlyRole(DEFAULT_ADMIN_ROLE) {
        frozen = f;
        emit Frozen(f);
    }
}
