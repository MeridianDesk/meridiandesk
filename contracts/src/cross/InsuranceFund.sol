// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title InsuranceFund — Common Ledger backstop (spec §8.4, §10.7)
/// @notice Holds USDG apart from user wallets. In: admin seed, liquidation fees (plain transfers), anyone's
///         `contribute`. Out: only `coverDeficit`, called by the Cross engine (COVER_ROLE) when a liquidated
///         account's loss exceeds its wallet; the cover is paid straight to the LiquidityPool. When the fund
///         runs short it pays what it has and the rest stays recorded as bad debt (no ADL in v1). Not a retail
///         insurance product and no guarantee to users.
contract InsuranceFund is AccessControl {
    using SafeERC20 for IERC20;

    bytes32 public constant COVER_ROLE = keccak256("COVER_ROLE");

    IERC20 public immutable usdg;
    address public immutable pool;
    uint256 public totalCovered;
    uint256 public totalUncovered;

    event Contributed(address indexed from, uint256 amount);
    event InsuranceFundPaid(address indexed user, uint256 requested, uint256 paid);

    error ZeroAddress();

    constructor(IERC20 usdg_, address pool_, address admin) {
        if (address(usdg_) == address(0) || pool_ == address(0) || admin == address(0)) revert ZeroAddress();
        usdg = usdg_;
        pool = pool_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function balance() public view returns (uint256) {
        return usdg.balanceOf(address(this));
    }

    function contribute(uint256 amount) external {
        usdg.safeTransferFrom(msg.sender, address(this), amount);
        emit Contributed(msg.sender, amount);
    }

    /// @return paid amount sent to the pool (≤ amount, bounded by the fund balance)
    function coverDeficit(address user, uint256 amount) external onlyRole(COVER_ROLE) returns (uint256 paid) {
        uint256 b = balance();
        paid = amount <= b ? amount : b;
        if (paid > 0) usdg.safeTransfer(pool, paid);
        totalCovered += paid;
        totalUncovered += amount - paid;
        emit InsuranceFundPaid(user, amount, paid);
    }
}
