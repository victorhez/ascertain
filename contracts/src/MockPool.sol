// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MockToken} from "./MockToken.sol";

/// Closed pool with an operator-set price (no bonding curve), mirroring the shape of Ascend closed hook pools.
/// Emits the Swap event the Ascertain pool adapter indexes:
///   Swap(address indexed trader, bool isBuy, uint256 tokenAmount, uint256 quoteAmount)
/// The quote leg is accounting only (no USDC moves). This is a mock for generating on-chain history.
contract MockPool {
    MockToken public immutable token;
    address public immutable operator;
    uint256 public priceE6; // quote units (6 decimals) per 1e18 token units

    event Swap(address indexed trader, bool isBuy, uint256 tokenAmount, uint256 quoteAmount);

    constructor(MockToken t, uint256 initialPriceE6) {
        token = t;
        operator = msg.sender;
        priceE6 = initialPriceE6;
    }

    function setPrice(uint256 p) external {
        require(msg.sender == operator, "operator");
        priceE6 = p;
    }

    /// Trader receives tokenAmount from the pool inventory.
    function buy(address trader, uint256 tokenAmount) external {
        require(msg.sender == operator, "operator");
        token.transfer(trader, tokenAmount);
        emit Swap(trader, true, tokenAmount, (tokenAmount * priceE6) / 1e18);
    }

    /// Trader returns tokens to the pool (needs prior approval of the pool).
    function sell(address trader, uint256 tokenAmount) external {
        require(msg.sender == operator, "operator");
        token.transferFrom(trader, address(this), tokenAmount);
        emit Swap(trader, false, tokenAmount, (tokenAmount * priceE6) / 1e18);
    }
}
