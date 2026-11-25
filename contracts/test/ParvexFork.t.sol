// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {ParvexMandateSettler as D} from "../src/ParvexMandateSettler.sol";

interface IParvexForkERC20 {
    function balanceOf(address) external view returns (uint256);
    function approve(address, uint256) external returns (bool);
    function decimals() external view returns (uint8);
    function symbol() external view returns (string memory);
    function totalSupply() external view returns (uint256);
}

interface IParvexForkWETH is IParvexForkERC20 {
    function deposit() external payable;
}

interface IParvexForkV3Factory {
    function getPool(address, address, uint24) external view returns (address);
}

interface IParvexForkRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata) external payable returns (uint256);
}

/// @notice Runs against a fork of Robinhood Chain mainnet (chain id 4663):
///   forge test --match-contract Fork --fork-url <rpc> --evm-version cancun
/// Real WETH, USDG, the NVDA stock token and Uniswap v3 SwapRouter02 (addresses read on chain 25 Nov 2026). The seller buys real
/// NVDA tokens through the router, then sells them OTC to the buyer for USDG through the settler with EIP-712 signatures.
contract ParvexForkTest is Test {
    address constant WETH = 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73;
    address constant USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;
    address constant NVDA = 0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC;
    address constant ROUTER = 0xCaf681a66D020601342297493863E78C959E5cb2;
    address constant V3_FACTORY = 0x1f7d7550B1b028f7571E69A784071F0205FD2EfA;

    D desk;
    uint256 sellerKey = 0x5E11E2;
    uint256 buyerKey = 0xB0E2;
    address seller;
    address buyer;

    function setUp() public {
        if (block.chainid != 4663) vm.skip(true);
        desk = new D();
        seller = vm.addr(sellerKey);
        buyer = vm.addr(buyerKey);
        _fundUsdg(seller, 2 ether);
        _fundUsdg(buyer, 2 ether);
        uint24 nf = _deepest(USDG, NVDA);
        uint256 half = IParvexForkERC20(USDG).balanceOf(seller) / 2;
        vm.startPrank(seller);
        IParvexForkERC20(USDG).approve(ROUTER, half);
        IParvexForkRouter(ROUTER).exactInputSingle(IParvexForkRouter.ExactInputSingleParams(USDG, NVDA, nf, seller, half, 1, 0));
        IParvexForkERC20(NVDA).approve(address(desk), type(uint256).max);
        vm.stopPrank();
        vm.prank(buyer);
        IParvexForkERC20(USDG).approve(address(desk), type(uint256).max);
    }

    function _deepest(address a, address b) internal view returns (uint24 fee) {
        uint24[4] memory fees = [uint24(100), 500, 3000, 10000];
        uint256 best;
        for (uint256 i; i < 4; ++i) {
            address pool = IParvexForkV3Factory(V3_FACTORY).getPool(a, b, fees[i]);
            if (pool == address(0)) continue;
            uint256 depth = IParvexForkERC20(b).balanceOf(pool);
            if (depth > best) (best, fee) = (depth, fees[i]);
        }
        require(fee != 0, "no pool");
    }

    function _fundUsdg(address who, uint256 eth) internal {
        vm.deal(who, eth + 1 ether);
        uint24 f = _deepest(WETH, USDG);
        vm.startPrank(who);
        IParvexForkWETH(WETH).deposit{value: eth}();
        IParvexForkERC20(WETH).approve(ROUTER, eth);
        IParvexForkRouter(ROUTER).exactInputSingle(IParvexForkRouter.ExactInputSingleParams(WETH, USDG, f, who, eth, 1, 0));
        vm.stopPrank();
    }

    function _sign(uint256 key, D.Order memory o) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, desk.hashOrder(o));
        return abi.encodePacked(r, s, v);
    }

    function test_fork_tokensAreWhatWeThink() public view {
        assertEq(IParvexForkERC20(USDG).decimals(), 6);
        assertEq(keccak256(bytes(IParvexForkERC20(USDG).symbol())), keccak256("USDG"));
        assertEq(keccak256(bytes(IParvexForkERC20(NVDA).symbol())), keccak256("NVDA"));
        assertGt(IParvexForkERC20(NVDA).totalSupply(), 0);
    }

    function test_fork_settleStockTokenForUsdg_exactAmounts() public {
        uint256 amt = IParvexForkERC20(NVDA).balanceOf(seller);
        assertGt(amt, 0, "seller holds NVDA");
        uint256 gross = 500e6;
        D.Order memory s = D.Order(seller, 0, NVDA, USDG, amt, gross, gross * 998 / 1000, 20, address(0xFEE), buyer, uint64(block.timestamp + 1 hours), 1);
        D.Order memory b = D.Order(buyer, 1, NVDA, USDG, amt, gross, gross, 0, address(0), seller, uint64(block.timestamp + 1 hours), 1);
        bytes memory ss = _sign(sellerKey, s);
        bytes memory bs = _sign(buyerKey, b);
        assertEq(desk.checkDeal(s, ss, b, bs), 0);
        uint256 sUsdg = IParvexForkERC20(USDG).balanceOf(seller);
        uint256 bUsdg = IParvexForkERC20(USDG).balanceOf(buyer);
        uint256 g0 = gasleft();
        desk.settle(s, ss, b, bs);
        emit log_named_uint("settle gas (fork, NVDA/USDG, seller fee)", g0 - gasleft());
        assertEq(IParvexForkERC20(NVDA).balanceOf(buyer), amt);
        assertEq(IParvexForkERC20(NVDA).balanceOf(seller), 0);
        assertEq(IParvexForkERC20(USDG).balanceOf(seller) - sUsdg, gross - gross * 20 / 10_000);
        assertEq(IParvexForkERC20(USDG).balanceOf(address(0xFEE)), gross * 20 / 10_000);
        assertEq(bUsdg - IParvexForkERC20(USDG).balanceOf(buyer), gross);
        assertEq(IParvexForkERC20(USDG).balanceOf(address(desk)), 0);
        assertEq(IParvexForkERC20(NVDA).balanceOf(address(desk)), 0);
    }

    function test_fork_refusalBitsOnRealTokens() public {
        uint256 amt = IParvexForkERC20(NVDA).balanceOf(seller);
        D.Order memory s = D.Order(seller, 0, NVDA, USDG, amt + 1, 1e6, 1e6, 0, address(0), address(0), uint64(block.timestamp + 1 hours), 1);
        D.Order memory b = D.Order(buyer, 1, NVDA, USDG, amt + 1, 1e6, 1e6, 0, address(0), address(0), uint64(block.timestamp + 1 hours), 1);
        assertEq(desk.checkDeal(s, _sign(sellerKey, s), b, _sign(buyerKey, b)), desk.R_SELLER_BALANCE());
    }

    function test_fork_deployGas() public {
        uint256 g0 = gasleft();
        new D();
        emit log_named_uint("deploy gas (fork)", g0 - gasleft());
    }
}
