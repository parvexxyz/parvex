/*
 * What Vardex reads on Robinhood Chain (chain 4663). Every address below was read on chain on 23 Nov 2026 through the official RPC;
 * how each was found is on /method.
 */

/**
 * Robinhood's stock tokens are BeaconProxy contracts pointing at one beacon. A token counts as an official stock token only when
 *   - keccak256 of its runtime code equals STOCK_PROXY_CODEHASH (the beacon proxy),
 *   - its ERC-1967 beacon slot holds STOCK_BEACON, and
 *   - its totalSupply() is above zero. The first two can be copied (the implementation's initialize() is open to anyone);
 *     minting needs a role in the beacon's registry, which only Robinhood's keys hold.
 * A ticker alone proves nothing: dozens of tokens on the chain copy stock tickers.
 */
export const STOCK_BEACON = "0xe10b6f6b275de231345c20d14ab812db62151b00";
export const STOCK_PROXY_CODEHASH = "0x6c1fdd40002dcb440c7fff6a84171404d279ccb057803b65826f7546acd65630";
export const BEACON_SLOT = "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50";

/** Chainlink ETH / USD on Robinhood Chain (description "ETH / USD", 8 decimals). */
export const ETH_USD_FEED = "0x78f3556b67e17df817d51ef5a990cdaf09e8d3a9";

/** Chainlink feed directory the stock feeds were matched from. */
export const FEED_DIRECTORY = "https://reference-data-directory.vercel.app/feeds-robinhood-mainnet.json";

/** Global Dollar (USDG), 6 decimals. Many copies use the same symbol; only this address is used. */
export const USDG = { address: "0x5fc5360d0400a0fd4f2af552add042d716f1d168", decimals: 6, symbol: "USDG" } as const;

/**
 * Uniswap v3 on Robinhood Chain. Factory = SwapRouter02.factory(); QuoterV2 answers quoteExactInputSingle. Stock-token pools
 * against USDG were found with factory.getPool(token, USDG, fee) for fees 100 / 500 / 3000 / 10000 (e.g. NVDA/USDG 0.05 %
 * 0xd4eb21209c4d6093f80b5b84f5c45cc093ea14a3, read 23 Nov 2026).
 */
export const UNISWAP_V3 = {
  factory: "0x1f7d7550b1b028f7571e69a784071f0205fd2efa",
  quoter: "0x33e885ed0ec9bf04ecfb19341582aadcb4c8a9e7",
  fees: [100, 500, 3000, 10000] as const,
} as const;

/** ArbSys precompile: arbBlockNumber() is this chain's own block number (matched eth_blockNumber on 23 Nov 2026). */
export const ARBSYS = "0x0000000000000000000000000000000000000064";
