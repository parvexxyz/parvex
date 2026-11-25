// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test, console2} from "forge-std/Test.sol";
import {ParvexMandateSettler as D} from "../src/ParvexMandateSettler.sol";

/// Prints the EIP-712 digest of one fixed order on chain 4663 for src/lib/otc/eip712.test.ts (site/contract parity).
contract ParvexDigestFixtureTest is Test {
    function test_digestFixture() public {
        vm.chainId(4663);
        D desk = new D();
        D.Order memory o = D.Order(
            0x1111111111111111111111111111111111111111, 0, 0x2222222222222222222222222222222222222222, 0x3333333333333333333333333333333333333333,
            40 ether, 7_000_000_000, 6_993_000_000, 10, 0x4444444444444444444444444444444444444444, address(0), 1_800_000_000, 7
        );
        console2.log("settler", address(desk));
        console2.logBytes32(desk.hashOrder(o));
    }
}
