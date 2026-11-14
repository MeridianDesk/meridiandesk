// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {OptionsEngine} from "../OptionsEngine.sol";
import {OracleRouter} from "../OracleRouter.sol";
import {CrossMath} from "./CrossMath.sol";
import {CrossMarginAccount} from "./CrossMarginAccount.sol";

/// @title CrossOptionBook — Common Ledger P2: long options inside the Cross account
/// @notice Buys long options on OptionsEngine on behalf of Cross traders (this contract is the holder),
///         paying the premium from the trader's Cross wallet, and reports each option's mark so it counts
///         toward Cross equity after the haircut (IM = MM = 0, Opsi A: no short options in Cross).
///         Mark = intrinsic value at the fresh oracle price, capped at max payout (no time value, so the
///         counted value is conservative). Fail closed → 0 when expired, not open or the price is stale.
///         Settlement is permissionless and always allowed; the payout is credited to the Cross wallet.
contract CrossOptionBook is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant MAX_OPTIONS = 8; // open Cross long options per account (bounds snapshot loops)

    CrossMarginAccount public immutable account;
    OptionsEngine public immutable options;
    OracleRouter public immutable oracle;
    IERC20 public immutable usdg;

    mapping(address user => uint256[]) private _opts;
    mapping(uint256 optionId => address user) public ownerOf;

    event CrossOptionBought(address indexed user, uint256 indexed optionId, uint256 premium);
    event CrossOptionSettled(address indexed user, uint256 indexed optionId, uint256 credited);

    error WrongQuote();
    error TooManyOptions();
    error NotCrossOption(uint256 optionId);
    error InsufficientMargin(uint256 equity, uint256 im);
    error Paused();

    constructor(CrossMarginAccount account_, OptionsEngine options_) {
        account = account_;
        options = options_;
        oracle = account_.oracle();
        usdg = account_.usdg();
    }

    /// @notice The quote must name this contract as buyer and carry the trader in the top 160 bits of the
    ///         nonce, so a quote can only be filled for the trader it was priced for.
    function buy(OptionsEngine.Quote calldata q, bytes calldata signature) external nonReentrant returns (uint256 id) {
        if (account.paused()) revert Paused();
        if (q.buyer != address(this) || address(uint160(q.nonce >> 96)) != msg.sender) revert WrongQuote();
        if (_opts[msg.sender].length >= MAX_OPTIONS) revert TooManyOptions();

        account.debitPremium(msg.sender, q.premium); // wallet → here
        usdg.forceApprove(address(options), q.premium);
        id = options.buy(q, signature); // premium → pool, max payout reserved
        _opts[msg.sender].push(id);
        ownerOf[id] = msg.sender;

        CrossMath.Snapshot memory s = account.accountSnapshot(msg.sender);
        if (s.liquidatable || s.crossEquity < s.crossIM) revert InsufficientMargin(s.crossEquity, s.crossIM);
        emit CrossOptionBought(msg.sender, id, q.premium);
    }

    /// @notice Permissionless. Settles a Cross option (or picks up a settlement / void already run directly
    ///         on OptionsEngine) and credits the payout to the owner's Cross wallet. `roundId` = the feed round
    ///         live at expiry (ignored for voided options).
    function settle(uint256 id, uint80 roundId) external nonReentrant {
        address user = ownerOf[id];
        if (user == address(0)) revert NotCrossOption(id);
        OptionsEngine.Option memory o = options.getOption(id);
        uint256 credit;
        if (o.status == OptionsEngine.Status.Open) {
            uint256 b = usdg.balanceOf(address(this));
            options.settle(id, roundId);
            credit = usdg.balanceOf(address(this)) - b;
        } else if (o.status == OptionsEngine.Status.Settled) {
            // Same round validation as OptionsEngine.settle → same (unique) settlement price.
            uint256 px = oracle.priceAtExpiry(o.token, o.expiry, roundId);
            credit = options.payoutAt(o.isCall, o.strike, o.quantity, px);
            if (credit > o.maxPayout) credit = o.maxPayout;
        } else {
            credit = o.premium; // Voided: the refund was paid to this contract
        }
        delete ownerOf[id];
        uint256[] storage a = _opts[user];
        for (uint256 i; i < a.length; ++i) {
            if (a[i] == id) {
                a[i] = a[a.length - 1];
                a.pop();
                break;
            }
        }
        if (credit > 0) {
            usdg.forceApprove(address(account), credit);
            account.creditPayout(user, credit);
        }
        emit CrossOptionSettled(user, id, credit);
    }

    /// @notice Marked legs for CrossMath (mark = intrinsic at the fresh oracle price, capped at max payout).
    function legsOf(address user) external view returns (CrossMath.OptionLeg[] memory legs) {
        uint256[] memory ids = _opts[user];
        legs = new CrossMath.OptionLeg[](ids.length);
        for (uint256 i; i < ids.length; ++i) {
            OptionsEngine.Option memory o = options.getOption(ids[i]);
            if (o.status != OptionsEngine.Status.Open || block.timestamp >= o.expiry) continue;
            try oracle.price(o.token) returns (uint256 px, uint256) {
                uint256 v = options.payoutAt(o.isCall, o.strike, o.quantity, px);
                legs[i] = CrossMath.OptionLeg({mark: v > o.maxPayout ? o.maxPayout : v, fresh: true});
            } catch {}
        }
    }

    /// @notice Cross long options held for `user` (OptionsEngine ids) that are not yet credited.
    function optionsOf(address user) external view returns (uint256[] memory) {
        return _opts[user];
    }
}
