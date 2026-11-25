// Single place to change project identity. Everything on the site reads from here.
// To publish the real contract address, replace the value of CA below. The header pill, the footer, the token page
// and every explorer link derive from it. Anything that is not a 0x + 40 hex address is treated as "not launched yet".

/** Contract address of $PARVEX on Robinhood Chain. "TBA" until the token exists. */
const CA: string = "TBA";

/**
 * True once the domain points at this deployment. While false, the production *.vercel.app host is served as is (kept
 * out of search with noindex) instead of redirecting to a domain that does not serve the site.
 * DNS 25 Nov 2026 (DoH): parvex.xyz is on Cloudflare nameservers but has no A record yet.
 */
export const DOMAIN_LIVE = true;

export const isAddress = (v: string): v is `0x${string}` => /^0x[0-9a-fA-F]{40}$/.test(v);

const NAME = "Parvex";
/** Short name for the nav and tight spaces. */
const SHORT = "Parvex";
const SLUG = "parvex";
/** Shown upper case everywhere. The only place the ticker is written. */
const TICKER = "PARVEX";
const DOMAIN = "parvex.xyz";
/** X account of the project (the owner's handle, exactly as written in the order). */
const X_HANDLE = "parvex_xyz";

export const BRAND = {
  name: NAME,
  short: SHORT,
  slug: SLUG,
  ticker: TICKER,
  symbol: `$${TICKER}`,
  domain: DOMAIN,
  url: `https://${DOMAIN}`,
  /** Token name: the owner wrote "parvex"; shown capitalised. */
  tokenName: "Parvex",
  slogan: "Agent-assisted OTC negotiation with clear limits and wallet approval for Robinhood Chain.",
  /** Our own short line (the owner gave one sentence). */
  tagline: "Set your limit, see your net, sign one atomic swap.",
  category: "OTC negotiation terminal",
  chainName: "Robinhood Chain",
  description: `${NAME} is an OTC negotiation terminal for Robinhood Chain. A buyer and a seller each enter a mandate: asset, amount, price limit and expiry. The engine matches mandates, a rule-based agent trades counter-offers strictly inside both limits, and every condition is shown with its numbers: the buyer's budget, the seller's minimum net after fees. Both sides review and sign; one transaction moves both legs or nothing. Non-custodial: tokens stay in your wallet until the swap.`,
  x: `https://x.com/${X_HANDLE}`,
  xHandle: `@${X_HANDLE}`,
  // Public source repository (open source, MIT).
  github: "https://github.com/parvexxyz/parvex",
  ca: CA,
} as const;

/** True once BRAND.github points at an actual repository, not the bare host. */
export const hasGithub = /^https:\/\/github\.com\/[^/]+\/[^/]+/.test(BRAND.github);

// Public endpoints are the default. An operator can point the site at a private RPC with ROBINHOOD_RPC_URL
// (server) / NEXT_PUBLIC_ROBINHOOD_RPC_URL (browser). Both are optional.
const PUBLIC_RPC = "https://rpc.mainnet.chain.robinhood.com";

export const CHAIN = {
  id: 4663,
  hex: "0x1237",
  name: "Robinhood Chain",
  nativeSymbol: "ETH",
  decimals: 18,
  publicRpc: PUBLIC_RPC,
  rpc: process.env.NEXT_PUBLIC_ROBINHOOD_RPC_URL || PUBLIC_RPC,
  /** Second public endpoint, used for reads only when the first one fails. */
  fallbackRpc: "https://robinhood-rpc.publicnode.com",
  /** Third read endpoint for server code (some networks intercept the official host). */
  spareRpc: "https://robinhood.drpc.org",
  explorer: "https://robinhoodchain.blockscout.com",
} as const;

/** wallet_addEthereumChain parameters, used when the wallet does not know the chain yet (error 4902). */
export function addChainParams() {
  return {
    chainId: CHAIN.hex,
    chainName: CHAIN.name,
    rpcUrls: [CHAIN.publicRpc],
    blockExplorerUrls: [CHAIN.explorer],
    nativeCurrency: { name: "Ether", symbol: CHAIN.nativeSymbol, decimals: CHAIN.decimals },
  };
}

/** RPC for server code: the private endpoint when set, else the public one. */
export function serverRpc() {
  return process.env.ROBINHOOD_RPC_URL || process.env.NEXT_PUBLIC_ROBINHOOD_RPC_URL || PUBLIC_RPC;
}

export const TOKEN = {
  get isLive() {
    return isAddress(BRAND.ca);
  },
  get explorerUrl() {
    return isAddress(BRAND.ca) ? explorerToken(BRAND.ca) : null;
  },
};

export function explorerAddress(address: string) {
  return `${CHAIN.explorer}/address/${address}`;
}
export function explorerToken(address: string) {
  return `${CHAIN.explorer}/token/${address}`;
}
export function explorerTx(hash: string) {
  return `${CHAIN.explorer}/tx/${hash}`;
}
export function shortAddress(address: string, head = 6, tail = 4) {
  if (address.length <= head + tail + 2) return address;
  return `${address.slice(0, head)}…${address.slice(-tail)}`;
}

/**
 * Chart links: DEXTools only. Robinhood Chain is listed there under the chain slug "robinhood".
 */
export const DEXTOOLS_CHAIN = "robinhood";
export function chartUrl(address: string): string | null {
  return isAddress(address) ? `https://www.dextools.io/app/en/${DEXTOOLS_CHAIN}/pair-explorer/${address.toLowerCase()}` : null;
}

/**
 * Where $PARVEX is planned to launch: TBA in public copy (statements say "launchpad TBA"). Internal note: Pons on Robinhood Chain is the
 * likely launchpad, as for the owner's other launches. Before the CA is real, the buy button opens the launchpad home and says "At launch".
 * Parvex itself never needs the token.
 */
export const LAUNCHPAD = {
  name: "Pons",
  home: "https://ponsfamily.com/launchpad",
  tokenUrl: (address: string) => `https://ponsfamily.com/launchpad/${address.toLowerCase()}`,
} as const;

export function buyUrl(): string {
  return isAddress(BRAND.ca) ? LAUNCHPAD.tokenUrl(BRAND.ca) : LAUNCHPAD.home;
}
