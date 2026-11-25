/* The objects of a Parvex negotiation. Amounts are bigint base units everywhere; text is only made at the edge. */

export type Asset = {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  /** How the token was proven (shown next to it). */
  proof: string;
  /** Chainlink USD price with 8 decimals and its update time, when a feed exists. */
  usd?: { answer: bigint; decimals: number; updatedAt: number; feed: string; stale: boolean } | null;
};

export type MandateSide = "sell" | "buy";

/**
 * A mandate is a private instruction: what to trade, how much, the hard limit and until when. It lives in the browser. Only the
 * agreed terms (plus the limit the maker chooses to sign) ever leave it, as an EIP-712 order.
 */
export type Mandate = {
  id: string;
  label: string;
  /** Wallet address, or a practice name like "practice:desk-1". */
  maker: string;
  side: MandateSide;
  base: Asset;
  quote: Asset;
  /** Exact full-fill quantity of the base asset (no partial fills in v1). */
  amount: bigint;
  /** Sell: minimum NET quote received after the seller's fee. Buy: maximum TOTAL quote paid including the buyer's fee. */
  limit: bigint;
  /** Fee this maker pays to their own fee recipient (broker, desk), 0 to 50 bps. Parvex charges nothing. */
  feeBps: number;
  feeRecipient: string;
  /** Only this maker may be on the other side (null = anyone). */
  counterparty: string | null;
  /** Unix seconds. */
  expiry: number;
  createdAt: number;
  source: "sample" | "you";
};

export type Condition = { key: string; ok: boolean; title: string; detail: string; bit?: number };
