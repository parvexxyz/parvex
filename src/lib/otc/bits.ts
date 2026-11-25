/*
 * Reason bits returned by ParvexMandateSettler.checkDeal (contracts/src/ParvexMandateSettler.sol, R_* constants). The same bit means
 * the same thing on the site and on chain; bits.test.ts reads the Solidity file and fails if a bit or a name drifts.
 */

export type Side = "seller" | "buyer" | "both";

export const BITS = [
  { bit: 0, key: "SIDE", side: "both", label: "Sides are wrong", why: "One order must sell the asset and the other must buy it." },
  { bit: 1, key: "TOKENS", side: "both", label: "Tokens do not line up", why: "Both orders must name the same asset and quote token, two different tokens that are contracts." },
  { bit: 2, key: "AMOUNT", side: "both", label: "Amounts differ", why: "Both orders must sign the same full-fill amount (above zero, below 2^128)." },
  { bit: 3, key: "PRICE", side: "both", label: "Prices differ", why: "Both orders must sign the same gross price (above zero, below 2^128)." },
  { bit: 4, key: "SELF_MATCH", side: "both", label: "Same wallet on both sides", why: "A maker cannot trade with itself." },
  { bit: 5, key: "SELL_EXPIRED", side: "seller", label: "Seller order expired", why: "The chain's clock is past the seller's expiry." },
  { bit: 6, key: "BUY_EXPIRED", side: "buyer", label: "Buyer order expired", why: "The chain's clock is past the buyer's expiry." },
  { bit: 7, key: "SELL_COUNTERPARTY", side: "seller", label: "Seller locked to someone else", why: "The seller named a different counterparty." },
  { bit: 8, key: "BUY_COUNTERPARTY", side: "buyer", label: "Buyer locked to someone else", why: "The buyer named a different counterparty." },
  { bit: 9, key: "SELL_NONCE", side: "seller", label: "Seller order used or cancelled", why: "Its nonce was settled before, cancelled, or is below the seller's cancel-all line." },
  { bit: 10, key: "BUY_NONCE", side: "buyer", label: "Buyer order used or cancelled", why: "Its nonce was settled before, cancelled, or is below the buyer's cancel-all line." },
  { bit: 11, key: "SELL_SIGNATURE", side: "seller", label: "Seller has not authorized these terms", why: "No valid signature (or on-chain approval) from the seller over exactly these terms." },
  { bit: 12, key: "BUY_SIGNATURE", side: "buyer", label: "Buyer has not authorized these terms", why: "No valid signature (or on-chain approval) from the buyer over exactly these terms." },
  { bit: 13, key: "SELL_FEE", side: "seller", label: "Seller fee not allowed", why: "Above 0.50 %, or paid to nobody, to the seller or to the buyer." },
  { bit: 14, key: "BUY_FEE", side: "buyer", label: "Buyer fee not allowed", why: "Above 0.50 %, or paid to nobody, to the buyer or to the seller." },
  { bit: 15, key: "SELLER_NET", side: "seller", label: "Seller net below minimum", why: "After the seller's fee, the price leaves the seller less than the signed minimum." },
  { bit: 16, key: "BUYER_TOTAL", side: "buyer", label: "Buyer total above maximum", why: "With the buyer's fee, the price costs the buyer more than the signed maximum." },
  { bit: 17, key: "SELLER_BALANCE", side: "seller", label: "Seller lacks the asset", why: "The seller's balance of the asset is below the amount." },
  { bit: 18, key: "SELLER_ALLOWANCE", side: "seller", label: "Seller allowance too low", why: "The seller has not approved the settler for the amount." },
  { bit: 19, key: "BUYER_BALANCE", side: "buyer", label: "Buyer lacks the quote token", why: "The buyer's quote balance is below the total to pay." },
  { bit: 20, key: "BUYER_ALLOWANCE", side: "buyer", label: "Buyer allowance too low", why: "The buyer has not approved the settler for the total." },
] as const satisfies readonly { bit: number; key: string; side: Side; label: string; why: string }[];

export type BitKey = (typeof BITS)[number]["key"];

export const bit = (key: BitKey) => 1n << BigInt(BITS.find((b) => b.key === key)!.bit);

export function decode(mask: bigint) {
  return BITS.filter((b) => (mask >> BigInt(b.bit)) & 1n);
}

export function mask(keys: BitKey[]) {
  return keys.reduce((m, k) => m | bit(k), 0n);
}
