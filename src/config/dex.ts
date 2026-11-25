/*
 * Robinhood Chain (4663) contracts Parvex reads. Each address was read on chain through the official RPC (24-25 Nov 2026): code
 * present and the cross-checks noted on each line answered as shown. None of them is a Parvex contract.
 */

/** Wrapped ether, 18 decimals (SwapRouter02 WETH9() returns it). Native ETH is not a settlement asset in v1: wrap first. */
export const WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";
/** Global Dollar (USDG): name() "Global Dollar", symbol() "USDG", decimals() 6, ERC-1967 proxy. Many lookalikes use the same symbol;
 *  only this address is used. */
export const USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";

/** Chainlink ETH / USD standard proxy on Robinhood Chain, 8 decimals (description() "ETH / USD"). */
export const ETH_USD_FEED = "0x78f3556b67e17df817d51ef5a990cdaf09e8d3a9";

/** Uniswap v3 SwapRouter02 + factory (used only by the fork test to buy real stock tokens; Parvex never routes trades). */
export const UNISWAP_V3 = {
  factory: "0x1f7d7550b1b028f7571e69a784071f0205fd2efa",
  swapRouter02: "0xcaf681a66d020601342297493863e78c959e5cb2",
} as const;

/** Quote tokens offered for a deal on mainnet (both proven above). */
export const QUOTE_TOKENS = [
  { address: USDG, symbol: "USDG", name: "Global Dollar", decimals: 6, proof: "fixed address, name/symbol/decimals read on chain" },
  { address: WETH, symbol: "WETH", name: "Wrapped Ether", decimals: 18, proof: "SwapRouter02.WETH9() on Robinhood Chain" },
] as const;
