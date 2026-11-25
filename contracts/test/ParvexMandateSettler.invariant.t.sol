// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {ParvexMandateSettler as D} from "../src/ParvexMandateSettler.sol";
import {ParvexNetMath as M} from "../src/ParvexNetMath.sol";
import {ParvexTestToken} from "./ParvexMocks.sol";

contract ParvexDeskHandler is Test {
    D public desk;
    ParvexTestToken public base;
    ParvexTestToken public quote;
    uint256[3] internal keys = [uint256(0xA1), 0xB2, 0xC3];
    address public broker = address(0xB20C);
    uint256 public settled;
    uint256 public baseMoved;
    uint256 public quoteMoved;
    mapping(address => mapping(uint256 => uint256)) public timesUsed;
    uint256 public doubleUse;
    uint256 internal nextNonce = 1;

    constructor(D d, ParvexTestToken b, ParvexTestToken q) {
        desk = d;
        base = b;
        quote = q;
        for (uint256 i; i < 3; ++i) {
            address a = vm.addr(keys[i]);
            base.mint(a, 1_000_000 ether);
            quote.mint(a, 1_000_000_000e6);
            vm.startPrank(a);
            base.approve(address(d), type(uint256).max);
            quote.approve(address(d), type(uint256).max);
            vm.stopPrank();
        }
    }

    function _sig(uint256 key, D.Order memory o) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, desk.hashOrder(o));
        return abi.encodePacked(r, s, v);
    }

    function trade(uint8 si, uint8 bi, uint96 amount, uint64 gross, uint16 sb, uint16 bb, uint64 minNet, uint64 maxTotal, bool reuse) external {
        uint256 sk = keys[si % 3];
        uint256 bk = keys[bi % 3];
        amount = uint96(bound(amount, 1, 100 ether));
        gross = uint64(bound(gross, 1, 1_000_000e6));
        sb = uint16(bound(sb, 0, 60));
        bb = uint16(bound(bb, 0, 60));
        uint256 n = reuse && nextNonce > 1 ? nextNonce - 1 : nextNonce++;
        D.Order memory s = D.Order(vm.addr(sk), 0, address(base), address(quote), amount, gross, minNet, sb, broker, address(0), uint64(block.timestamp + 1 hours), n);
        D.Order memory b = D.Order(vm.addr(bk), 1, address(base), address(quote), amount, gross, maxTotal, bb, broker, address(0), uint64(block.timestamp + 1 hours), n);
        bytes memory ss = _sig(sk, s);
        bytes memory bs = _sig(bk, b);
        try desk.settle(s, ss, b, bs) {
            settled++;
            baseMoved += amount;
            (uint256 total,) = M.buyerTotal(gross, bb);
            quoteMoved += total;
            if (++timesUsed[s.maker][n] > 1 && s.maker != b.maker) doubleUse++;
            if (++timesUsed[b.maker][n + (1 << 200)] > 1) doubleUse++;
        } catch {}
    }

    function cancelAll(uint8 who, uint64 to) external {
        address a = vm.addr(keys[who % 3]);
        uint256 cur = desk.minNonce(a);
        uint256 nn = bound(to, cur + 1, cur + 5);
        vm.prank(a);
        desk.cancelUpTo(nn);
    }

    function warp(uint32 dt) external {
        vm.warp(block.timestamp + bound(dt, 1, 2 hours));
    }
}

contract ParvexMandateSettlerInvariant is Test {
    D desk;
    ParvexTestToken base;
    ParvexTestToken quote;
    ParvexDeskHandler h;
    uint256 baseSupply;
    uint256 quoteSupply;

    function setUp() public {
        vm.warp(1_800_000_000);
        desk = new D();
        base = new ParvexTestToken("B", "B", 18);
        quote = new ParvexTestToken("Q", "Q", 6);
        h = new ParvexDeskHandler(desk, base, quote);
        baseSupply = base.totalSupply();
        quoteSupply = quote.totalSupply();
        targetContract(address(h));
    }

    function invariant_deskNeverHoldsTokens() public view {
        assertEq(base.balanceOf(address(desk)), 0);
        assertEq(quote.balanceOf(address(desk)), 0);
    }

    function invariant_supplyConserved() public view {
        assertEq(base.totalSupply(), baseSupply);
        assertEq(quote.totalSupply(), quoteSupply);
    }

    function invariant_countMatchesSuccessfulSettles() public view {
        assertEq(desk.settlementCount(), h.settled());
    }

    function invariant_nonceNeverSettlesTwice() public view {
        assertEq(h.doubleUse(), 0);
    }
}
