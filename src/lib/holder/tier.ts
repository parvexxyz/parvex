/*
 * Holder tier and quotas. The owner's rule (25 Nov 2026): a wallet is a holder when balanceOf >= totalSupply / 1000 (0.1 % of the
 * supply), both read live from the token contract. Compared without division: balance * 1000 >= supply. A zero supply has no holders.
 */

export const HOLDER_DIVISOR = 1000n;

export function isHolder(balance: bigint, supply: bigint) {
  return supply > 0n && balance * HOLDER_DIVISOR >= supply;
}

/** Smallest balance that qualifies (ceil(supply / 1000)). */
export function threshold(supply: bigint) {
  return supply <= 0n ? 0n : (supply + HOLDER_DIVISOR - 1n) / HOLDER_DIVISOR;
}

/** Share of supply in basis points of a percent with 4 decimals, for display. */
export function sharePct(balance: bigint, supply: bigint) {
  if (supply <= 0n) return 0;
  return Number((balance * 1_000_000n) / supply) / 10_000;
}

/** Every quota in one place. Enforced by the server routes; the UI only shows them. */
export const QUOTAS = {
  free: { liveOrders: 3, savedCounterparties: 5 },
  holder: { liveOrders: 25, savedCounterparties: 100 },
} as const;

export type TierName = keyof typeof QUOTAS;
