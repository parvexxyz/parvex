// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {ParvexMandateSettler as D} from "../src/ParvexMandateSettler.sol";
import {ParvexNetMath as M} from "../src/ParvexNetMath.sol";
import "./ParvexMocks.sol";

contract ParvexBase is Test {
    D desk;
    ParvexTestToken base;
    ParvexTestToken quote;
    uint256 sellerKey = 0xA11CE;
    uint256 buyerKey = 0xB0B;
    address seller;
    address buyer;
    address broker = makeAddr("parvex-broker");
    address relayer = makeAddr("parvex-relayer");

    function setUp() public virtual {
        vm.warp(1_800_000_000);
        desk = new D();
        base = new ParvexTestToken("Stock", "STK", 18);
        quote = new ParvexTestToken("Dollar", "USD6", 6);
        seller = vm.addr(sellerKey);
        buyer = vm.addr(buyerKey);
        base.mint(seller, 1_000 ether);
        quote.mint(buyer, 10_000_000e6);
        vm.prank(seller);
        base.approve(address(desk), type(uint256).max);
        vm.prank(buyer);
        quote.approve(address(desk), type(uint256).max);
    }

    function _sell(uint256 amount, uint256 gross, uint256 minNet) internal view returns (D.Order memory o) {
        o = D.Order(seller, 0, address(base), address(quote), amount, gross, minNet, 0, address(0), address(0), uint64(block.timestamp + 1 days), 1);
    }

    function _buy(uint256 amount, uint256 gross, uint256 maxTotal) internal view returns (D.Order memory o) {
        o = D.Order(buyer, 1, address(base), address(quote), amount, gross, maxTotal, 0, address(0), address(0), uint64(block.timestamp + 1 days), 1);
    }

    function _sign(uint256 key, D.Order memory o) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, desk.hashOrder(o));
        return abi.encodePacked(r, s, v);
    }

    function _pair(D.Order memory s, D.Order memory b) internal view returns (bytes memory ss, bytes memory bs) {
        ss = _sign(sellerKey, s);
        bs = _sign(buyerKey, b);
    }
}

contract ParvexMandateSettlerTest is ParvexBase {
    function test_settle_happyPath_movesBothLegsAtomically() public {
        D.Order memory s = _sell(10 ether, 2_500e6, 2_500e6);
        D.Order memory b = _buy(10 ether, 2_500e6, 2_600e6);
        (bytes memory ss, bytes memory bs) = _pair(s, b);
        assertEq(desk.checkDeal(s, ss, b, bs), 0);
        vm.prank(relayer);
        bytes32 id = desk.settle(s, ss, b, bs);
        assertEq(id, desk.dealId(desk.hashOrder(s), desk.hashOrder(b)));
        assertEq(base.balanceOf(buyer), 10 ether);
        assertEq(base.balanceOf(seller), 990 ether);
        assertEq(quote.balanceOf(seller), 2_500e6);
        assertEq(quote.balanceOf(buyer), 10_000_000e6 - 2_500e6);
        assertEq(base.balanceOf(address(desk)), 0);
        assertEq(quote.balanceOf(address(desk)), 0);
        assertEq(desk.settlementCount(), 1);
        assertTrue(desk.nonceUsed(seller, 1) && desk.nonceUsed(buyer, 1));
    }

    function test_settle_emitsProofEvents() public {
        D.Order memory s = _sell(1 ether, 100e6, 99e6);
        s.feeBps = 20;
        s.feeRecipient = broker;
        D.Order memory b = _buy(1 ether, 100e6, 101e6);
        (bytes memory ss, bytes memory bs) = _pair(s, b);
        bytes32 id = desk.dealId(desk.hashOrder(s), desk.hashOrder(b));
        vm.expectEmit(true, true, true, true, address(desk));
        emit D.Settled(id, seller, buyer, address(base), address(quote), 1 ether, 100e6, 1);
        vm.expectEmit(true, false, false, true, address(desk));
        emit D.SettledAmounts(id, desk.hashOrder(s), desk.hashOrder(b), 99.8e6, 0.2e6, 0, relayer);
        vm.prank(relayer);
        desk.settle(s, ss, b, bs);
        assertEq(quote.balanceOf(broker), 0.2e6);
        assertEq(quote.balanceOf(seller), 99.8e6);
    }

    function test_fees_bothSides_netMathHolds() public {
        D.Order memory s = _sell(5 ether, 25_000e6, 24_950e6);
        s.feeBps = 20;
        s.feeRecipient = broker;
        D.Order memory b = _buy(5 ether, 25_000e6, 25_025e6);
        b.feeBps = 10;
        b.feeRecipient = makeAddr("buyer-agent");
        (bytes memory ss, bytes memory bs) = _pair(s, b);
        assertEq(desk.checkDeal(s, ss, b, bs), 0);
        desk.settle(s, ss, b, bs);
        assertEq(quote.balanceOf(seller), 24_950e6);
        assertEq(quote.balanceOf(broker), 50e6);
        assertEq(quote.balanceOf(makeAddr("buyer-agent")), 25e6);
        assertEq(quote.balanceOf(buyer), 10_000_000e6 - 25_025e6);
    }

    function test_refuse_sellerNetBelowLimit_afterFee() public {
        // 1,000 gross with a 20 bps fee nets 998: a 1,000 floor refuses.
        D.Order memory s = _sell(1 ether, 1_000e6, 1_000e6);
        s.feeBps = 20;
        s.feeRecipient = broker;
        D.Order memory b = _buy(1 ether, 1_000e6, 1_000e6);
        (bytes memory ss, bytes memory bs) = _pair(s, b);
        assertEq(desk.checkDeal(s, ss, b, bs), desk.R_SELLER_NET());
        vm.expectRevert(abi.encodeWithSelector(D.DealRefused.selector, desk.R_SELLER_NET()));
        desk.settle(s, ss, b, bs);
    }

    function test_refuse_buyerTotalAboveLimit() public {
        D.Order memory s = _sell(1 ether, 1_000e6, 900e6);
        D.Order memory b = _buy(1 ether, 1_000e6, 1_000e6);
        b.feeBps = 1;
        b.feeRecipient = broker;
        (bytes memory ss, bytes memory bs) = _pair(s, b);
        assertEq(desk.checkDeal(s, ss, b, bs), desk.R_BUYER_TOTAL());
    }

    function test_refuse_termsMismatch() public {
        D.Order memory s = _sell(1 ether, 1_000e6, 900e6);
        D.Order memory b = _buy(2 ether, 1_001e6, 2_000e6);
        b.quote = address(base);
        s.side = 1;
        (bytes memory ss, bytes memory bs) = _pair(s, b);
        uint256 r = desk.checkDeal(s, ss, b, bs);
        assertTrue(r & desk.R_SIDE() != 0, "side");
        assertTrue(r & desk.R_TOKENS() != 0, "tokens");
        assertTrue(r & desk.R_AMOUNT() != 0, "amount");
        assertTrue(r & desk.R_PRICE() != 0, "price");
    }

    function test_refuse_zeroAndHugeAmounts() public {
        D.Order memory s = _sell(0, 0, 0);
        D.Order memory b = _buy(0, 0, 0);
        (bytes memory ss, bytes memory bs) = _pair(s, b);
        uint256 r = desk.checkDeal(s, ss, b, bs);
        assertTrue(r & desk.R_AMOUNT() != 0 && r & desk.R_PRICE() != 0);
        s = _sell(uint256(type(uint128).max) + 1, uint256(type(uint128).max) + 1, 0);
        b = _buy(uint256(type(uint128).max) + 1, uint256(type(uint128).max) + 1, type(uint256).max);
        (ss, bs) = _pair(s, b);
        r = desk.checkDeal(s, ss, b, bs);
        assertTrue(r & desk.R_AMOUNT() != 0 && r & desk.R_PRICE() != 0);
    }

    function test_refuse_tokenWithoutCode() public {
        D.Order memory s = _sell(1 ether, 1e6, 1e6);
        D.Order memory b = _buy(1 ether, 1e6, 1e6);
        s.base = makeAddr("eoa");
        b.base = s.base;
        (bytes memory ss, bytes memory bs) = _pair(s, b);
        assertEq(desk.checkDeal(s, ss, b, bs), desk.R_TOKENS());
    }

    function test_refuse_selfMatch() public {
        D.Order memory s = _sell(1 ether, 1e6, 1e6);
        D.Order memory b = _buy(1 ether, 1e6, 1e6);
        b.maker = seller;
        bytes memory ss = _sign(sellerKey, s);
        bytes memory bs = _sign(sellerKey, b);
        assertTrue(desk.checkDeal(s, ss, b, bs) & desk.R_SELF_MATCH() != 0);
    }

    function test_refuse_expiry_boundary() public {
        D.Order memory s = _sell(1 ether, 1e6, 1e6);
        D.Order memory b = _buy(1 ether, 1e6, 1e6);
        (bytes memory ss, bytes memory bs) = _pair(s, b);
        vm.warp(s.expiry);
        assertEq(desk.checkDeal(s, ss, b, bs), 0, "valid at expiry second");
        vm.warp(uint256(s.expiry) + 1);
        assertEq(desk.checkDeal(s, ss, b, bs), desk.R_SELL_EXPIRED() | desk.R_BUY_EXPIRED());
    }

    function test_counterpartyLock() public {
        D.Order memory s = _sell(1 ether, 1e6, 1e6);
        s.counterparty = makeAddr("someone-else");
        D.Order memory b = _buy(1 ether, 1e6, 1e6);
        b.counterparty = seller;
        (bytes memory ss, bytes memory bs) = _pair(s, b);
        assertEq(desk.checkDeal(s, ss, b, bs), desk.R_SELL_COUNTERPARTY());
        s.counterparty = buyer;
        ss = _sign(sellerKey, s);
        assertEq(desk.checkDeal(s, ss, b, bs), 0);
    }

    function test_replay_refused() public {
        D.Order memory s = _sell(1 ether, 1e6, 1e6);
        D.Order memory b = _buy(1 ether, 1e6, 1e6);
        (bytes memory ss, bytes memory bs) = _pair(s, b);
        desk.settle(s, ss, b, bs);
        assertEq(desk.checkDeal(s, ss, b, bs), desk.R_SELL_NONCE() | desk.R_BUY_NONCE());
        vm.expectRevert(abi.encodeWithSelector(D.DealRefused.selector, desk.R_SELL_NONCE() | desk.R_BUY_NONCE()));
        desk.settle(s, ss, b, bs);
    }

    function test_cancelOrder_sameBlock() public {
        D.Order memory s = _sell(1 ether, 1e6, 1e6);
        D.Order memory b = _buy(1 ether, 1e6, 1e6);
        (bytes memory ss, bytes memory bs) = _pair(s, b);
        vm.prank(seller);
        desk.cancelOrder(s);
        assertEq(desk.checkDeal(s, ss, b, bs), desk.R_SELL_NONCE());
        vm.prank(buyer);
        vm.expectRevert(D.NotMaker.selector);
        desk.cancelOrder(s);
    }

    function test_cancelUpTo() public {
        D.Order memory s = _sell(1 ether, 1e6, 1e6);
        s.nonce = 7;
        D.Order memory b = _buy(1 ether, 1e6, 1e6);
        (bytes memory ss, bytes memory bs) = _pair(s, b);
        vm.prank(seller);
        desk.cancelUpTo(8);
        assertEq(desk.checkDeal(s, ss, b, bs), desk.R_SELL_NONCE());
        vm.prank(seller);
        vm.expectRevert(D.NonceNotHigher.selector);
        desk.cancelUpTo(8);
    }

    function test_signature_wrongSigner_malleable_badLength() public {
        D.Order memory s = _sell(1 ether, 1e6, 1e6);
        D.Order memory b = _buy(1 ether, 1e6, 1e6);
        bytes memory ss = _sign(buyerKey, s);
        bytes memory bs = _sign(buyerKey, b);
        assertEq(desk.checkDeal(s, ss, b, bs), desk.R_SELL_SIGNATURE());
        // high-s copy of a valid signature
        (uint8 v, bytes32 r, bytes32 sg) = vm.sign(sellerKey, desk.hashOrder(s));
        uint256 n = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141;
        bytes memory flipped = abi.encodePacked(r, bytes32(n - uint256(sg)), v == 27 ? uint8(28) : uint8(27));
        assertEq(desk.checkDeal(s, flipped, b, bs), desk.R_SELL_SIGNATURE());
        assertEq(desk.checkDeal(s, hex"1234", b, bs), desk.R_SELL_SIGNATURE());
        // a signature over different terms
        D.Order memory s2 = _sell(1 ether, 2e6, 1e6);
        assertTrue(desk.checkDeal(s, _sign(sellerKey, s2), b, bs) & desk.R_SELL_SIGNATURE() != 0);
    }

    function test_onChainApproval_withoutSignature() public {
        D.Order memory s = _sell(1 ether, 1e6, 1e6);
        D.Order memory b = _buy(1 ether, 1e6, 1e6);
        bytes memory bs = _sign(buyerKey, b);
        assertEq(desk.checkDeal(s, "", b, bs), desk.R_SELL_SIGNATURE());
        vm.prank(buyer);
        vm.expectRevert(D.NotMaker.selector);
        desk.approveOrder(s);
        vm.prank(seller);
        desk.approveOrder(s);
        assertEq(desk.checkDeal(s, "", b, bs), 0);
        desk.settle(s, "", b, bs);
        assertEq(base.balanceOf(buyer), 1 ether);
    }

    function test_erc1271Wallet() public {
        ParvexTestWallet w = new ParvexTestWallet(buyer);
        quote.mint(address(w), 10e6);
        vm.prank(buyer);
        w.approveToken(address(quote), address(desk), type(uint256).max);
        D.Order memory s = _sell(1 ether, 1e6, 1e6);
        D.Order memory b = _buy(1 ether, 1e6, 1e6);
        b.maker = address(w);
        (bytes memory ss, bytes memory bs) = _pair(s, b);
        assertEq(desk.checkDeal(s, ss, b, bs), 0);
        desk.settle(s, ss, b, bs);
        assertEq(base.balanceOf(address(w)), 1 ether);
        // a wrong key is refused by the wallet
        D.Order memory b2 = _buy(1 ether, 1e6, 1e6);
        b2.maker = address(w);
        b2.nonce = 2;
        D.Order memory s2 = _sell(1 ether, 1e6, 1e6);
        s2.nonce = 2;
        assertEq(desk.checkDeal(s2, _sign(sellerKey, s2), b2, _sign(sellerKey, b2)), desk.R_BUY_SIGNATURE());
    }

    function test_feeRules() public {
        D.Order memory s = _sell(1 ether, 1e6, 0);
        D.Order memory b = _buy(1 ether, 1e6, 2e6);
        s.feeBps = 51;
        s.feeRecipient = broker;
        b.feeBps = 10;
        b.feeRecipient = seller; // paying the other side is not a fee
        (bytes memory ss, bytes memory bs) = _pair(s, b);
        assertEq(desk.checkDeal(s, ss, b, bs), desk.R_SELL_FEE() | desk.R_BUY_FEE());
        s.feeBps = 50;
        s.feeRecipient = address(0);
        b.feeRecipient = buyer;
        (ss, bs) = _pair(s, b);
        assertEq(desk.checkDeal(s, ss, b, bs), desk.R_SELL_FEE() | desk.R_BUY_FEE());
        // a fee paid to the settler itself would leave tokens in it: refused
        s.feeRecipient = address(desk);
        b.feeBps = 0;
        (ss, bs) = _pair(s, b);
        assertEq(desk.checkDeal(s, ss, b, bs), desk.R_SELL_FEE());
    }

    function test_funds_balanceAndAllowanceReported() public {
        D.Order memory s = _sell(2_000 ether, 1e6, 1e6);
        D.Order memory b = _buy(2_000 ether, 1e6, 1e6);
        (bytes memory ss, bytes memory bs) = _pair(s, b);
        assertEq(desk.checkDeal(s, ss, b, bs), desk.R_SELLER_BALANCE());
        vm.prank(seller);
        base.approve(address(desk), 0);
        vm.prank(buyer);
        quote.approve(address(desk), 0);
        s = _sell(1 ether, 1e6, 1e6);
        b = _buy(1 ether, 1e6, 1e6);
        (ss, bs) = _pair(s, b);
        assertEq(desk.checkDeal(s, ss, b, bs), desk.R_SELLER_ALLOWANCE() | desk.R_BUYER_ALLOWANCE());
        s = _sell(1 ether, 20_000_000e6, 1e6);
        b = _buy(1 ether, 20_000_000e6, 30_000_000e6);
        vm.prank(buyer);
        quote.approve(address(desk), type(uint256).max);
        vm.prank(seller);
        base.approve(address(desk), type(uint256).max);
        (ss, bs) = _pair(s, b);
        assertEq(desk.checkDeal(s, ss, b, bs), desk.R_BUYER_BALANCE());
    }

    function test_quoteDeal_matchesSettlement() public view {
        D.Order memory s = _sell(1 ether, 1_031_002_004, 1_000_000_000);
        s.feeBps = 20;
        D.Order memory b = _buy(1 ether, 1_031_002_004, 1_040_000_000);
        b.feeBps = 5;
        (uint256 net, uint256 sf, uint256 total, uint256 bf, uint256 minG, uint256 maxG) = desk.quoteDeal(s, b);
        assertEq(sf, 2_062_004);
        assertEq(net, 1_028_940_000);
        assertEq(bf, 515_501);
        assertEq(total, 1_031_517_505);
        assertEq(minG, M.minGrossForNet(1_000_000_000, 20));
        assertEq(maxG, M.maxGrossForBudget(1_040_000_000, 5));
    }

    function test_domainSeparator_followsChainId() public {
        bytes32 a = desk.domainSeparator();
        vm.chainId(4663);
        assertTrue(desk.domainSeparator() != a);
    }

    function test_noPayable_noReceive() public {
        (bool ok,) = address(desk).call{value: 1}("");
        assertFalse(ok);
    }
}

contract ParvexHostileTokenTest is ParvexBase {
    function _swapQuote(address t) internal returns (D.Order memory s, D.Order memory b, bytes memory ss, bytes memory bs) {
        s = _sell(1 ether, 100, 100);
        b = _buy(1 ether, 100, 100);
        s.quote = t;
        b.quote = t;
        (ss, bs) = _pair(s, b);
    }

    function test_noReturnToken_accepted() public {
        ParvexNoReturnToken t = new ParvexNoReturnToken();
        t.mint(buyer, 1_000);
        vm.prank(buyer);
        t.approve(address(desk), 1_000);
        (D.Order memory s, D.Order memory b, bytes memory ss, bytes memory bs) = _swapQuote(address(t));
        assertEq(desk.checkDeal(s, ss, b, bs), 0);
        desk.settle(s, ss, b, bs);
        assertEq(t.balanceOf(seller), 100);
    }

    function test_falseReturningToken_refused() public {
        ParvexFalseToken t = new ParvexFalseToken();
        t.mint(buyer, 1_000);
        vm.prank(buyer);
        t.approve(address(desk), 1_000);
        (D.Order memory s, D.Order memory b, bytes memory ss, bytes memory bs) = _swapQuote(address(t));
        vm.expectRevert(abi.encodeWithSelector(D.TransferFailed.selector, address(t)));
        desk.settle(s, ss, b, bs);
        assertFalse(desk.nonceUsed(seller, 1), "revert rolls the nonce back");
    }

    function test_feeOnTransferToken_refused() public {
        ParvexFeeToken t = new ParvexFeeToken();
        t.mint(buyer, 1_000);
        vm.prank(buyer);
        t.approve(address(desk), 1_000);
        (D.Order memory s, D.Order memory b, bytes memory ss, bytes memory bs) = _swapQuote(address(t));
        vm.expectRevert(abi.encodeWithSelector(D.ExactAmountMismatch.selector, address(t), 100, 99));
        desk.settle(s, ss, b, bs);
        assertEq(base.balanceOf(seller), 1_000 ether, "asset leg rolled back");
    }

    function test_reentrancy_blocked() public {
        ParvexReentrantToken t = new ParvexReentrantToken();
        t.mint(buyer, 1_000);
        vm.prank(buyer);
        t.approve(address(desk), 1_000);
        (D.Order memory s, D.Order memory b, bytes memory ss, bytes memory bs) = _swapQuote(address(t));
        D.Order memory s2 = _sell(1 ether, 100, 100);
        s2.nonce = 9;
        D.Order memory b2 = _buy(1 ether, 100, 100);
        b2.nonce = 9;
        t.arm(desk, s2, _sign(sellerKey, s2), b2, _sign(buyerKey, b2));
        desk.settle(s, ss, b, bs);
        assertTrue(t.reentered());
        assertEq(bytes4(t.lastError()), D.Reentrancy.selector);
        assertEq(desk.settlementCount(), 1);
        assertFalse(desk.nonceUsed(seller, 9));
        assertEq(base.balanceOf(buyer), 1 ether);
    }

    function test_hostileViews_checkDealStillAnswers() public {
        ParvexHostileViewToken t = new ParvexHostileViewToken();
        (D.Order memory s, D.Order memory b, bytes memory ss, bytes memory bs) = _swapQuote(address(t));
        uint256 r = desk.checkDeal(s, ss, b, bs);
        assertEq(r, desk.R_BUYER_BALANCE() | desk.R_BUYER_ALLOWANCE());
    }
}

contract ParvexNetMathFuzzTest is Test {
    function testFuzz_minGrossForNet_isTight(uint128 minNet, uint16 bps) public pure {
        bps = uint16(bound(bps, 0, M.MAX_FEE_BPS));
        uint256 g = M.minGrossForNet(minNet, bps);
        (uint256 net,) = M.sellerNet(g, bps);
        assertGe(net, minNet);
        if (g > 0) {
            (uint256 below,) = M.sellerNet(g - 1, bps);
            assertLt(below, minNet);
        }
    }

    function testFuzz_maxGrossForBudget_isTight(uint128 maxTotal, uint16 bps) public pure {
        bps = uint16(bound(bps, 0, M.MAX_FEE_BPS));
        uint256 g = M.maxGrossForBudget(maxTotal, bps);
        (uint256 total,) = M.buyerTotal(g, bps);
        assertLe(total, maxTotal);
        (uint256 above,) = M.buyerTotal(g + 1, bps);
        assertGt(above, maxTotal);
    }

    function testFuzz_feeNeverExceedsCap(uint128 gross, uint16 bps) public pure {
        bps = uint16(bound(bps, 0, M.MAX_FEE_BPS));
        uint256 fee = M.feeOf(gross, bps);
        assertLe(fee * 10_000, uint256(gross) * M.MAX_FEE_BPS);
        (uint256 net, uint256 f2) = M.sellerNet(gross, bps);
        assertEq(net + f2, gross);
    }
}

contract ParvexSettleFuzzTest is ParvexBase {
    function testFuzz_settle_conservesAndRespectsLimits(uint96 amount, uint64 gross, uint16 sb, uint16 bb, uint64 minNet, uint64 maxTotal) public {
        amount = uint96(bound(amount, 1, 1_000 ether));
        gross = uint64(bound(gross, 1, 10_000_000e6));
        sb = uint16(bound(sb, 0, 50));
        bb = uint16(bound(bb, 0, 50));
        D.Order memory s = _sell(amount, gross, minNet);
        D.Order memory b = _buy(amount, gross, maxTotal);
        s.feeBps = sb;
        s.feeRecipient = broker;
        b.feeBps = bb;
        b.feeRecipient = relayer;
        (bytes memory ss, bytes memory bs) = _pair(s, b);
        uint256 r = desk.checkDeal(s, ss, b, bs);
        (uint256 net, uint256 sf) = M.sellerNet(gross, sb);
        (uint256 total, uint256 bf) = M.buyerTotal(gross, bb);
        assertEq(r & desk.R_SELLER_NET() != 0, net < minNet);
        assertEq(r & desk.R_BUYER_TOTAL() != 0, total > maxTotal);
        uint256 qBefore = quote.balanceOf(buyer);
        if (r != 0) {
            vm.expectRevert(abi.encodeWithSelector(D.DealRefused.selector, r));
            desk.settle(s, ss, b, bs);
            return;
        }
        desk.settle(s, ss, b, bs);
        assertEq(quote.balanceOf(seller), net);
        assertEq(quote.balanceOf(broker), sf);
        assertEq(quote.balanceOf(relayer), bf);
        assertEq(qBefore - quote.balanceOf(buyer), total);
        assertGe(net, minNet);
        assertLe(total, maxTotal);
        assertEq(base.balanceOf(buyer), amount);
        assertEq(quote.balanceOf(address(desk)) + base.balanceOf(address(desk)), 0);
    }
}
