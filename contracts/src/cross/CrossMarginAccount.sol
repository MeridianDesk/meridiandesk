// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {MarketRegistry} from "../MarketRegistry.sol";
import {OracleRouter} from "../OracleRouter.sol";
import {LiquidityPool} from "../LiquidityPool.sol";
import {CrossMath} from "./CrossMath.sol";

/// @title CrossMarginAccount — Common Ledger (P1: Cross perps)
/// @notice One USDG Cross wallet per user that backs all of that user's Cross perps positions.
///         Standard cross margin (Binance-style), not portfolio margin: IM/MM summed per leg.
///         Isolated perps stay in PerpsEngine and are never touched by this contract.
///         Counterparty = the shared LiquidityPool; each position reserves its notional (max profit).
///         Fail-closed oracle: any stale price blocks open / withdraw / liquidation (waits for fresh
///         price); a user can always reduce or close a market whose own price is fresh.
///         See docs/adr/ADR-002-cross-margin.md.
contract CrossMarginAccount is AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using SafeCast for uint256;

    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");
    uint256 internal constant BPS = 10_000;
    uint256 internal constant WAD = 1e18;
    uint256 public constant MAX_POSITIONS = 8; // bounds account-wide loops
    uint16 public constant MAX_FEE_BPS = 100;
    uint256 public constant MAX_FUNDING_RATE_PER_SEC = 1e18 / uint256(365 days);

    enum MarginMode {
        Isolated,
        Cross
    }

    IERC20 public immutable usdg;
    MarketRegistry public immutable registry;
    OracleRouter public immutable oracle;
    LiquidityPool public immutable pool;

    struct MarketConfig {
        uint128 maxOiLong;
        uint128 maxOiShort;
        uint64 fundingRatePerSec;
        uint16 openFeeBps;
        uint16 closeFeeBps;
        bool paused;
        bool configured;
    }

    struct MarketState {
        uint128 longOi;
        uint128 shortOi;
        uint128 cumFundingLong;
        uint128 cumFundingShort;
        uint64 lastAccrual;
    }

    struct Position {
        uint128 size; // USDG notional at entry
        uint128 entryPrice; // WAD
        uint128 entryFunding;
        uint16 leverageBps;
        bool isLong;
    }

    struct LiqConfig {
        uint16 partialBps; // share of the largest position closed per step (2000 = 20%)
        uint32 cooldown; // seconds between partial steps (30)
        uint16 insuranceFeeBps; // of closed notional → insurance fund (30 = 0.30%)
        uint16 keeperFeeBps; // of closed notional → keeper (20 = 0.20%)
    }

    CrossMath.Params public params;
    LiqConfig public liqConfig;
    address public insuranceFund;

    mapping(address token => MarketConfig) public marketConfig;
    mapping(address token => MarketState) public marketState;
    mapping(address user => mapping(address token => MarginMode)) public marginMode;
    mapping(address user => uint256) public walletOf;
    mapping(address user => mapping(address token => Position)) private _pos;
    mapping(address user => address[]) private _tokens;
    mapping(address user => uint64) public lastLiquidationAt;

    uint256 public totalWallets;
    uint256 public maxWalletPerAccount;
    uint256 public totalWalletCap;
    uint256 public totalBadDebt;

    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event MarginModeSet(address indexed user, address indexed token, MarginMode mode);
    event CrossOpened(
        address indexed user, address indexed token, bool isLong, uint16 leverageBps, uint256 size, uint256 price, uint256 fee
    );
    event CrossClosed(
        address indexed user, address indexed token, uint256 sizeClosed, uint256 price, int256 pnl, uint256 funding, uint256 fee
    );
    event LiquidationFill(
        address indexed user,
        address indexed token,
        address indexed keeper,
        uint256 sizeClosed,
        uint256 price,
        uint256 insuranceFee,
        uint256 keeperFee
    );
    event LiquidationStopped(address indexed user, bool restored);
    event BadDebt(address indexed user, uint256 amount);
    event ParamsUpdated(CrossMath.Params p, LiqConfig l, address insuranceFund);
    event MarketConfigured(address indexed token, MarketConfig cfg);
    event CapsUpdated(uint256 maxWalletPerAccount, uint256 totalWalletCap);

    error ZeroAmount();
    error ZeroAddress();
    error InvalidConfig();
    error InvalidLeverage(uint256 leverageBps);
    error NotCrossMode(address token);
    error ModeLocked(address token);
    error MarketDisabled(address token);
    error MarketIsPaused(address token);
    error PositionExists(address token);
    error NoPosition(address token);
    error TooManyPositions();
    error InsufficientMargin(uint256 equity, uint256 im);
    error WithdrawExceeds(uint256 amount, uint256 withdrawable);
    error WalletCapExceeded();
    error OpenInterestCapExceeded(address token, bool isLong);
    error Slippage(uint256 price, uint256 acceptablePrice);
    error NotLiquidatable();
    error LiquidationCooldown(uint256 readyAt);

    constructor(IERC20 usdg_, MarketRegistry registry_, OracleRouter oracle_, LiquidityPool pool_, address admin, address insurance)
    {
        if (admin == address(0) || insurance == address(0) || address(usdg_) == address(0)) revert ZeroAddress();
        usdg = usdg_;
        registry = registry_;
        oracle = oracle_;
        pool = pool_;
        insuranceFund = insurance;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(GUARDIAN_ROLE, admin);
        // ADR-002 recommended initial values (maintainer sign-off pending).
        params = CrossMath.Params({mmBps: 2500, optionHaircutBps: 2000, withdrawFloorBps: 1000, backstopBps: 6667});
        liqConfig = LiqConfig({partialBps: 2000, cooldown: 30, insuranceFeeBps: 30, keeperFeeBps: 20});
    }

    // ───────────────────────────── wallet ─────────────────────────────

    function deposit(uint256 amount) external nonReentrant whenNotPaused {
        if (amount == 0) revert ZeroAmount();
        uint256 w = walletOf[msg.sender] + amount;
        if (w > maxWalletPerAccount || totalWallets + amount > totalWalletCap) revert WalletCapExceeded();
        walletOf[msg.sender] = w;
        totalWallets += amount;
        usdg.safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(msg.sender, amount);
    }

    /// @notice Withdraw from the Cross wallet. Needs fresh prices for every Cross position.
    function withdraw(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        CrossMath.Snapshot memory s = _snapshot(msg.sender);
        if (amount > s.withdrawable) revert WithdrawExceeds(amount, s.withdrawable);
        walletOf[msg.sender] -= amount;
        totalWallets -= amount;
        usdg.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    /// @notice Per-market mode. Rejected while a Cross position is open on that market.
    ///         (Isolated positions live in PerpsEngine; the UI blocks switching while one is open.)
    function setMarginMode(address token, MarginMode mode) external {
        if (_pos[msg.sender][token].size != 0) revert ModeLocked(token);
        marginMode[msg.sender][token] = mode;
        emit MarginModeSet(msg.sender, token, mode);
    }

    // ───────────────────────────── trading ─────────────────────────────

    /// @param margin USDG initial margin to commit; notional = margin × leverage. Fee comes from the wallet.
    function open(address token, bool isLong, uint256 margin, uint16 leverageBps, uint256 acceptablePrice)
        external
        nonReentrant
        whenNotPaused
    {
        if (!CrossMath.isAllowedLeverage(leverageBps)) revert InvalidLeverage(leverageBps);
        if (marginMode[msg.sender][token] != MarginMode.Cross) revert NotCrossMode(token);
        if (margin == 0) revert ZeroAmount();
        MarketConfig memory cfg = marketConfig[token];
        if (!cfg.configured || !registry.isPerpsEnabled(token)) revert MarketDisabled(token);
        if (cfg.paused) revert MarketIsPaused(token);
        if (_pos[msg.sender][token].size != 0) revert PositionExists(token);
        if (_tokens[msg.sender].length >= MAX_POSITIONS) revert TooManyPositions();

        (uint256 px,) = oracle.price(token);
        if (isLong ? px > acceptablePrice : px < acceptablePrice) revert Slippage(px, acceptablePrice);
        _accrue(token, cfg);

        uint256 size = margin * leverageBps / BPS;
        uint256 fee = size * cfg.openFeeBps / BPS;

        MarketState storage st = marketState[token];
        if (isLong) {
            uint256 oi = st.longOi + size;
            if (oi > cfg.maxOiLong) revert OpenInterestCapExceeded(token, true);
            st.longOi = oi.toUint128();
        } else {
            uint256 oi = st.shortOi + size;
            if (oi > cfg.maxOiShort) revert OpenInterestCapExceeded(token, false);
            st.shortOi = oi.toUint128();
        }

        _debit(msg.sender, fee);
        if (fee > 0) usdg.safeTransfer(address(pool), fee);

        _pos[msg.sender][token] = Position({
            size: size.toUint128(),
            entryPrice: px.toUint128(),
            entryFunding: isLong ? st.cumFundingLong : st.cumFundingShort,
            leverageBps: leverageBps,
            isLong: isLong
        });
        _tokens[msg.sender].push(token);

        // Binance rule: after the order, equity must still cover total IM (and the account is not in liquidation).
        CrossMath.Snapshot memory s = _snapshot(msg.sender);
        if (s.liquidatable || s.crossEquity < s.crossIM) revert InsufficientMargin(s.crossEquity, s.crossIM);

        pool.reserve(size);
        emit CrossOpened(msg.sender, token, isLong, leverageBps, size, px, fee);
    }

    /// @notice Reduce-only close (partial or full). Works whenever this market's price is fresh,
    ///         even while paused or under liquidation.
    function close(address token, uint256 sizeToClose, uint256 acceptablePrice) external nonReentrant {
        Position memory p = _pos[msg.sender][token];
        if (p.size == 0) revert NoPosition(token);
        if (sizeToClose == 0 || sizeToClose > p.size) sizeToClose = p.size;
        (uint256 px,) = oracle.price(token);
        if (p.isLong ? px < acceptablePrice : px > acceptablePrice) revert Slippage(px, acceptablePrice);
        uint256 fee = sizeToClose * marketConfig[token].closeFeeBps / BPS;
        _reduce(msg.sender, token, sizeToClose, px, fee, address(0), 0);
    }

    // ───────────────────────────── liquidation ─────────────────────────────

    /// @notice Permissionless. While CrossEquity ≤ CrossMM: closes partialBps of the largest-MM position
    ///         per step (cooldown between steps). Below the backstop (equity < 2/3 MM) every Cross
    ///         position is closed at once. Fee: insuranceFeeBps → insurance fund, keeperFeeBps → keeper.
    function liquidate(address user) external nonReentrant {
        CrossMath.Snapshot memory s = _snapshot(user);
        if (!s.liquidatable) revert NotLiquidatable();
        LiqConfig memory lc = liqConfig;

        if (s.backstopEligible) {
            address[] memory toks = _tokens[user];
            for (uint256 i; i < toks.length; ++i) {
                _liqFill(user, toks[i], _pos[user][toks[i]].size, lc);
            }
        } else {
            uint256 readyAt = uint256(lastLiquidationAt[user]) + lc.cooldown;
            if (lastLiquidationAt[user] != 0 && block.timestamp < readyAt) revert LiquidationCooldown(readyAt);
            (address tok, uint256 sz) = _largest(user);
            uint256 part = sz * lc.partialBps / BPS;
            if (part == 0 || sz - part < sz / 20) part = sz; // dust: close it all
            _liqFill(user, tok, part, lc);
        }
        lastLiquidationAt[user] = uint64(block.timestamp);

        bool restored;
        if (_tokens[user].length != 0) restored = !_snapshot(user).liquidatable;
        emit LiquidationStopped(user, restored || _tokens[user].length == 0);
    }

    function _liqFill(address user, address token, uint256 size, LiqConfig memory lc) internal {
        (uint256 px,) = oracle.price(token);
        uint256 insFee = size * lc.insuranceFeeBps / BPS;
        uint256 keepFee = size * lc.keeperFeeBps / BPS;
        _reduce(user, token, size, px, insFee, msg.sender, keepFee);
        emit LiquidationFill(user, token, msg.sender, size, px, insFee, keepFee);
    }

    function _largest(address user) internal view returns (address tok, uint256 sz) {
        address[] memory toks = _tokens[user];
        for (uint256 i; i < toks.length; ++i) {
            uint256 s = _pos[user][toks[i]].size;
            if (s > sz) (tok, sz) = (toks[i], s);
        }
    }

    // ───────────────────────────── core ─────────────────────────────

    /// @dev Realises pnl/funding of `sz` into the wallet and charges fees. When `keeper == 0` the fee goes
    ///      to the pool (trading fee); otherwise `fee` → insurance fund and `keeperFee` → keeper.
    function _reduce(address user, address token, uint256 sz, uint256 px, uint256 fee, address keeper, uint256 keeperFee)
        internal
    {
        Position storage p = _pos[user][token];
        MarketConfig memory cfg = marketConfig[token];
        _accrue(token, cfg);
        MarketState storage st = marketState[token];

        int256 pnl = _pnl(p.isLong, p.entryPrice, sz, px);
        uint256 cum = p.isLong ? st.cumFundingLong : st.cumFundingShort;
        uint256 funding = sz * (cum - p.entryFunding) / WAD;

        if (p.isLong) st.longOi -= sz.toUint128();
        else st.shortOi -= sz.toUint128();
        pool.release(sz);

        if (sz == p.size) {
            delete _pos[user][token];
            _removeToken(user, token);
        } else {
            p.size = (p.size - sz).toUint128();
        }

        // Settle against the pool: profit is paid in, loss + funding go out (bounded by wallet).
        int256 net = pnl - int256(funding);
        if (net > 0) {
            pool.pay(address(this), uint256(net));
            walletOf[user] += uint256(net);
            totalWallets += uint256(net);
        } else if (net < 0) {
            uint256 loss = _debit(user, uint256(-net));
            if (loss > 0) usdg.safeTransfer(address(pool), loss);
        }

        uint256 f = _debit(user, fee);
        uint256 k = _debit(user, keeperFee);
        if (keeper == address(0)) {
            if (f > 0) usdg.safeTransfer(address(pool), f);
        } else {
            if (f > 0) usdg.safeTransfer(insuranceFund, f);
            if (k > 0) usdg.safeTransfer(keeper, k);
        }

        if (keeper == address(0)) emit CrossClosed(user, token, sz, px, pnl, funding, f);
    }

    /// @dev Takes up to `amount` from the wallet; any shortfall is recorded as bad debt (pool absorbs in P1,
    ///      InsuranceFund cover lands in P2). Returns the amount actually taken.
    function _debit(address user, uint256 amount) internal returns (uint256 taken) {
        uint256 w = walletOf[user];
        taken = amount <= w ? amount : w;
        walletOf[user] = w - taken;
        totalWallets -= taken;
        if (taken < amount) {
            totalBadDebt += amount - taken;
            emit BadDebt(user, amount - taken);
        }
    }

    function _removeToken(address user, address token) internal {
        address[] storage t = _tokens[user];
        for (uint256 i; i < t.length; ++i) {
            if (t[i] == token) {
                t[i] = t[t.length - 1];
                t.pop();
                return;
            }
        }
    }

    function _pnl(bool isLong, uint256 entry, uint256 size, uint256 px) internal pure returns (int256 pnl) {
        int256 d = int256(px) - int256(entry);
        if (!isLong) d = -d;
        pnl = int256(size) * d / int256(entry);
        if (pnl > int256(size)) pnl = int256(size); // profit cap = reserved notional
    }

    function _snapshot(address user) internal view returns (CrossMath.Snapshot memory) {
        address[] memory toks = _tokens[user];
        CrossMath.PerpLeg[] memory legs = new CrossMath.PerpLeg[](toks.length);
        for (uint256 i; i < toks.length; ++i) {
            Position memory p = _pos[user][toks[i]];
            (uint256 px,) = oracle.price(toks[i]); // reverts on stale → fail closed
            (uint256 cl, uint256 cs) = _projectedFunding(toks[i]);
            uint256 funding = uint256(p.size) * ((p.isLong ? cl : cs) - p.entryFunding) / WAD;
            int256 pnl = _pnl(p.isLong, p.entryPrice, p.size, px);
            legs[i] = CrossMath.PerpLeg({
                notional: uint256(p.size) * px / p.entryPrice, // mark notional
                upnl: pnl - int256(funding),
                leverageBps: p.leverageBps
            });
        }
        return CrossMath.snapshot(params, walletOf[user], legs, new CrossMath.OptionLeg[](0), 0);
    }

    function _projectedFunding(address token) internal view returns (uint256 cl, uint256 cs) {
        MarketState memory st = marketState[token];
        (uint256 dl, uint256 ds) = _fundingDelta(st, marketConfig[token].fundingRatePerSec);
        return (st.cumFundingLong + dl, st.cumFundingShort + ds);
    }

    function _fundingDelta(MarketState memory st, uint256 rate) internal view returns (uint256 dl, uint256 ds) {
        if (st.lastAccrual == 0) return (0, 0);
        uint256 dt = block.timestamp - st.lastAccrual;
        uint256 total = uint256(st.longOi) + st.shortOi;
        if (dt == 0 || total == 0 || st.longOi == st.shortOi) return (0, 0);
        uint256 skew = st.longOi > st.shortOi ? st.longOi - st.shortOi : st.shortOi - st.longOi;
        uint256 delta = rate * dt * skew / total;
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

    // ───────────────────────────── views ─────────────────────────────

    /// @notice Full Cross account card (reverts if any Cross market's price is stale).
    function accountSnapshot(address user) external view returns (CrossMath.Snapshot memory) {
        return _snapshot(user);
    }

    function positionOf(address user, address token) external view returns (Position memory) {
        return _pos[user][token];
    }

    function tokensOf(address user) external view returns (address[] memory) {
        return _tokens[user];
    }

    // ───────────────────────────── admin ─────────────────────────────

    function configureMarket(address token, MarketConfig calldata cfg) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (cfg.openFeeBps > MAX_FEE_BPS || cfg.closeFeeBps > MAX_FEE_BPS || cfg.fundingRatePerSec > MAX_FUNDING_RATE_PER_SEC)
        {
            revert InvalidConfig();
        }
        _accrue(token, marketConfig[token]);
        MarketConfig memory c = cfg;
        c.configured = true;
        marketConfig[token] = c;
        emit MarketConfigured(token, c);
    }

    function setParams(CrossMath.Params calldata p, LiqConfig calldata l, address insurance)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        if (
            insurance == address(0) || p.mmBps == 0 || p.mmBps >= 5_000 // below 2× IM
                || p.optionHaircutBps > BPS || p.withdrawFloorBps > BPS || p.backstopBps > BPS || l.partialBps == 0
                || l.partialBps > BPS || uint256(l.insuranceFeeBps) + l.keeperFeeBps > p.mmBps
        ) revert InvalidConfig();
        params = p;
        liqConfig = l;
        insuranceFund = insurance;
        emit ParamsUpdated(p, l, insurance);
    }

    function setCaps(uint256 maxPerAccount, uint256 totalCap) external onlyRole(DEFAULT_ADMIN_ROLE) {
        maxWalletPerAccount = maxPerAccount;
        totalWalletCap = totalCap;
        emit CapsUpdated(maxPerAccount, totalCap);
    }

    function setMarketPaused(address token, bool paused_) external onlyRole(GUARDIAN_ROLE) {
        if (!paused_ && !hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) revert InvalidConfig();
        marketConfig[token].paused = paused_;
    }

    function pause() external onlyRole(GUARDIAN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
}
