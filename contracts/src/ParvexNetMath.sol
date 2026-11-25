// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title ParvexNetMath
/// @notice Integer basis-point math shared by ParvexMandateSettler and the site (src/lib/otc/netmath.ts holds the same
///         formulas; a parity test reads this file). Every fee is floored, so a fee never rounds up against a payer.
///         Amounts are bounded by MAX_AMOUNT (2^128 - 1), so `amount * bps` can never overflow.
library ParvexNetMath {
    uint256 internal constant BPS = 10_000;
    /// @dev Highest fee a maker can sign for their own fee recipient (0.50 %). Parvex itself charges nothing.
    uint16 internal constant MAX_FEE_BPS = 50;
    uint256 internal constant MAX_AMOUNT = type(uint128).max;

    /// @notice Fee in quote units for a gross amount: floor(gross * bps / 10_000).
    function feeOf(uint256 gross, uint16 bps) internal pure returns (uint256) {
        return (gross * bps) / BPS;
    }

    /// @notice What the seller keeps after paying their own signed fee out of the gross price.
    function sellerNet(uint256 gross, uint16 sellFeeBps) internal pure returns (uint256 net, uint256 fee) {
        fee = feeOf(gross, sellFeeBps);
        net = gross - fee;
    }

    /// @notice What the buyer pays in total: the gross price plus their own signed fee on top.
    function buyerTotal(uint256 gross, uint16 buyFeeBps) internal pure returns (uint256 total, uint256 fee) {
        fee = feeOf(gross, buyFeeBps);
        total = gross + fee;
    }

    /// @notice Smallest gross price whose seller net reaches `minNet`.
    /// @dev net(g) = g - floor(g*b/BPS) = ceil(g*(BPS-b)/BPS) >= m  <=>  g > (m-1)*BPS/(BPS-b).
    function minGrossForNet(uint256 minNet, uint16 bps) internal pure returns (uint256) {
        if (minNet == 0) return 0;
        return ((minNet - 1) * BPS) / (BPS - bps) + 1;
    }

    /// @notice Largest gross price whose buyer total stays within `maxTotal`.
    /// @dev total(g) = g + floor(g*b/BPS) = floor(g*(BPS+b)/BPS) <= M  <=>  g*(BPS+b) <= (M+1)*BPS - 1.
    function maxGrossForBudget(uint256 maxTotal, uint16 bps) internal pure returns (uint256) {
        if (maxTotal > MAX_AMOUNT) maxTotal = MAX_AMOUNT;
        return ((maxTotal + 1) * BPS - 1) / (BPS + bps);
    }
}
