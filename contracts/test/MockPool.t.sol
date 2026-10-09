// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MockToken} from "../src/MockToken.sol";
import {MockPool} from "../src/MockPool.sol";

interface Vm {
    function prank(address) external;
}

contract MockPoolTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function test_buyThenSellRoundTrip() public {
        MockToken t = new MockToken("Mock", "MOCK", address(this), 1_000_000 ether);
        MockPool p = new MockPool(t, 700);
        t.transfer(address(p), 1_000_000 ether);
        address w = address(0xBEEF);
        p.buy(w, 1000 ether);
        assert(t.balanceOf(w) == 1000 ether);
        vm.prank(w);
        t.approve(address(p), 1000 ether);
        p.sell(w, 1000 ether);
        assert(t.balanceOf(w) == 0);
    }
}
