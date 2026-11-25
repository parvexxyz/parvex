/*
 * The settler's net math in bigint (contracts/src/ParvexNetMath.sol). Fees are floored. netmath.test.ts holds the same tight-bound
 * properties as the forge fuzz tests and the numbers the forge unit test checks.
 */

export const BPS = 10_000n;
export const MAX_FEE_BPS = 50;
export const MAX_AMOUNT = (1n << 128n) - 1n;

export const feeOf = (gross: bigint, bps: number) => (gross * BigInt(bps)) / BPS;

export function sellerNet(gross: bigint, sellFeeBps: number) {
  const fee = feeOf(gross, sellFeeBps);
  return { net: gross - fee, fee };
}

export function buyerTotal(gross: bigint, buyFeeBps: number) {
  const fee = feeOf(gross, buyFeeBps);
  return { total: gross + fee, fee };
}

/** Smallest gross whose seller net reaches minNet. */
export function minGrossForNet(minNet: bigint, bps: number) {
  if (minNet <= 0n) return 0n;
  return ((minNet - 1n) * BPS) / (BPS - BigInt(bps)) + 1n;
}

/** Largest gross whose buyer total stays within maxTotal. */
export function maxGrossForBudget(maxTotal: bigint, bps: number) {
  const m = maxTotal > MAX_AMOUNT ? MAX_AMOUNT : maxTotal;
  if (m < 0n) return -1n;
  return ((m + 1n) * BPS - 1n) / (BPS + BigInt(bps));
}

/** Decimal string → base units (truncates extra decimals). Null when not a plain non-negative number. */
export function toUnits(text: string, decimals: number): bigint | null {
  const t = text.trim().replace(/,/g, "");
  if (!/^\d*(\.\d*)?$/.test(t) || t === "" || t === ".") return null;
  const [w, f = ""] = t.split(".");
  return BigInt(w || "0") * 10n ** BigInt(decimals) + BigInt((f + "0".repeat(decimals)).slice(0, decimals) || "0");
}

/** Base units → decimal string with at most `max` decimals, thousands separated. */
export function fromUnits(v: bigint, decimals: number, max = 6) {
  const neg = v < 0n;
  const a = neg ? -v : v;
  const base = 10n ** BigInt(decimals);
  const whole = (a / base).toLocaleString("en-US");
  let frac = (a % base).toString().padStart(decimals, "0").slice(0, Math.min(max, decimals)).replace(/0+$/, "");
  if (decimals === 0) frac = "";
  return `${neg ? "-" : ""}${whole}${frac ? `.${frac}` : ""}`;
}
