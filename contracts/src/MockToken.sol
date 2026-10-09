// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// Minimal ERC-20 used for mock Ascend-style launches on Elysium testnet. Not for production.
contract MockToken {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory n, string memory s, address mintTo, uint256 supply) {
        name = n;
        symbol = s;
        totalSupply = supply;
        balanceOf[mintTo] = supply;
        emit Transfer(address(0), mintTo, supply);
    }

    function transfer(address to, uint256 v) external returns (bool) {
        _move(msg.sender, to, v);
        return true;
    }

    function approve(address sp, uint256 v) external returns (bool) {
        allowance[msg.sender][sp] = v;
        emit Approval(msg.sender, sp, v);
        return true;
    }

    function transferFrom(address from, address to, uint256 v) external returns (bool) {
        uint256 a = allowance[from][msg.sender];
        require(a >= v, "allowance");
        if (a != type(uint256).max) allowance[from][msg.sender] = a - v;
        _move(from, to, v);
        return true;
    }

    function _move(address from, address to, uint256 v) internal {
        require(balanceOf[from] >= v, "balance");
        unchecked { balanceOf[from] -= v; }
        balanceOf[to] += v;
        emit Transfer(from, to, v);
    }
}
