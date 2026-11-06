// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @title LiquidityPool
/// @notice USDG liquidity that is the counterparty for both desks (Perps and Options keep separate
///         engines and positions; only the backstop liquidity is shared).
///         Engines reserve the maximum amount a position can ever be paid; reserved USDG cannot be
///         withdrawn by LPs, so every open position is fully backed.
///         Guarded launch: total deposit cap, per-tx withdraw cap, pause.
contract LiquidityPool is ERC4626, AccessControl, Pausable {
    using SafeERC20 for IERC20;

    bytes32 public constant ENGINE_ROLE = keccak256("ENGINE_ROLE");
    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");

    uint256 public depositCap; // max totalAssets(), USDG units
    uint256 public withdrawCapPerTx; // 0 = unlimited
    uint256 public reserved; // USDG locked as max payout of open positions
    uint16 public maxUtilizationBps = 8_000; // reserved / totalAssets after a new reservation

    event Reserved(address indexed engine, uint256 amount, uint256 totalReserved);
    event Released(address indexed engine, uint256 amount, uint256 totalReserved);
    event Paid(address indexed engine, address indexed to, uint256 amount);
    event CapsUpdated(uint256 depositCap, uint256 withdrawCapPerTx, uint16 maxUtilizationBps);

    error UtilizationExceeded(uint256 reservedAfter, uint256 assets);
    error ReleaseExceedsReserved(uint256 amount, uint256 reserved);
    error WithdrawCapExceeded(uint256 amount, uint256 cap);
    error InvalidBps(uint16 bps);
    error ZeroAddress();

    constructor(IERC20 usdg, address admin, uint256 depositCap_) ERC20("Meridian USDG LP", "mLP") ERC4626(usdg) {
        if (admin == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(GUARDIAN_ROLE, admin);
        depositCap = depositCap_;
    }

    // ───────────────────────────── engine hooks ─────────────────────────────

    function reserve(uint256 amount) external onlyRole(ENGINE_ROLE) whenNotPaused {
        uint256 after_ = reserved + amount;
        uint256 assets = totalAssets();
        if (after_ * 10_000 > assets * maxUtilizationBps) revert UtilizationExceeded(after_, assets);
        reserved = after_;
        emit Reserved(msg.sender, amount, after_);
    }

    /// @dev Release never pauses: positions must always be closable / settleable.
    function release(uint256 amount) external onlyRole(ENGINE_ROLE) {
        if (amount > reserved) revert ReleaseExceedsReserved(amount, reserved);
        reserved -= amount;
        emit Released(msg.sender, amount, reserved);
    }

    /// @notice Pay trader profit. Bounded by the engine's own reservation accounting.
    function pay(address to, uint256 amount) external onlyRole(ENGINE_ROLE) {
        IERC20(asset()).safeTransfer(to, amount);
        emit Paid(msg.sender, to, amount);
    }

    // ───────────────────────────── LP side ─────────────────────────────

    function freeLiquidity() public view returns (uint256) {
        uint256 a = totalAssets();
        return a > reserved ? a - reserved : 0;
    }

    function utilizationBps() external view returns (uint256) {
        uint256 a = totalAssets();
        return a == 0 ? 0 : (reserved * 10_000) / a;
    }

    function maxDeposit(address) public view override returns (uint256) {
        if (paused()) return 0;
        uint256 a = totalAssets();
        return a >= depositCap ? 0 : depositCap - a;
    }

    function maxMint(address receiver) public view override returns (uint256) {
        return previewDeposit(maxDeposit(receiver));
    }

    function maxWithdraw(address owner) public view override returns (uint256) {
        uint256 own = _convertToAssets(balanceOf(owner), _roundDown());
        uint256 free = freeLiquidity();
        uint256 m = own < free ? own : free;
        if (withdrawCapPerTx != 0 && m > withdrawCapPerTx) m = withdrawCapPerTx;
        return m;
    }

    function maxRedeem(address owner) public view override returns (uint256) {
        return _convertToShares(maxWithdraw(owner), _roundDown());
    }

    /// @dev Virtual-share offset blunts the first-depositor inflation attack.
    function _decimalsOffset() internal pure override returns (uint8) {
        return 6;
    }

    function _deposit(address caller, address receiver, uint256 assets, uint256 shares)
        internal
        override
        whenNotPaused
    {
        super._deposit(caller, receiver, assets, shares);
    }

    function _withdraw(address caller, address receiver, address owner, uint256 assets, uint256 shares)
        internal
        override
    {
        if (withdrawCapPerTx != 0 && assets > withdrawCapPerTx) {
            revert WithdrawCapExceeded(assets, withdrawCapPerTx);
        }
        super._withdraw(caller, receiver, owner, assets, shares);
    }

    // ───────────────────────────── admin ─────────────────────────────

    function setCaps(uint256 depositCap_, uint256 withdrawCapPerTx_, uint16 maxUtilBps)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        if (maxUtilBps == 0 || maxUtilBps > 10_000) revert InvalidBps(maxUtilBps);
        depositCap = depositCap_;
        withdrawCapPerTx = withdrawCapPerTx_;
        maxUtilizationBps = maxUtilBps;
        emit CapsUpdated(depositCap_, withdrawCapPerTx_, maxUtilBps);
    }

    function pause() external onlyRole(GUARDIAN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    function _roundDown() private pure returns (Math.Rounding) {
        return Math.Rounding.Floor;
    }
}
