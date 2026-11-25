import { bit, type BitKey } from "./bits";
import { buyerTotal, fromUnits, MAX_AMOUNT, MAX_FEE_BPS, maxGrossForBudget, minGrossForNet, sellerNet } from "./netmath";
import type { Condition, Mandate } from "./types";

/*
 * Deterministic matching and deal evaluation. Every rule here has a twin in ParvexMandateSettler (_checkTerms / _feeOk); the bits
 * returned by evaluateDeal are the bits checkDeal would return for the same terms, minus the ones only the chain can answer
 * (signatures, nonces, balances, allowances), which the terminal reads live when a wallet and a deployed settler are present.
 */

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const ZERO = "0x0000000000000000000000000000000000000000";

export type Zone = { minGross: bigint; maxGross: bigint; overlap: boolean; width: bigint };

/** The prices both limits accept: from the seller's minimum gross (net + fee) to the buyer's maximum gross (total − fee). */
export function zone(sell: Mandate, buy: Mandate): Zone {
  const minGross = minGrossForNet(sell.limit, Math.min(sell.feeBps, MAX_FEE_BPS));
  const maxGross = maxGrossForBudget(buy.limit, Math.min(buy.feeBps, MAX_FEE_BPS));
  return { minGross, maxGross, overlap: minGross <= maxGross && maxGross > 0n, width: maxGross - minGross };
}

function feeOk(m: Mandate, other: string) {
  if (m.feeBps > MAX_FEE_BPS || m.feeBps < 0 || !Number.isInteger(m.feeBps)) return false;
  if (m.feeBps === 0) return true;
  return /^0x[0-9a-fA-F]{40}$/.test(m.feeRecipient) && !same(m.feeRecipient, ZERO) && !same(m.feeRecipient, m.maker) && !same(m.feeRecipient, other);
}

const q = (v: bigint, m: Mandate) => `${fromUnits(v, m.quote.decimals)} ${m.quote.symbol}`;
const b = (v: bigint, m: Mandate) => `${fromUnits(v, m.base.decimals)} ${m.base.symbol}`;

/** Conditions that decide whether two mandates can be negotiated at all (no price yet). */
export function pairConditions(sell: Mandate, buy: Mandate, now: number): Condition[] {
  const z = zone(sell, buy);
  return [
    { key: "SIDE", bit: 0, ok: sell.side === "sell" && buy.side === "buy", title: "One seller, one buyer", detail: `${sell.side} vs ${buy.side}` },
    {
      key: "TOKENS",
      bit: 1,
      ok: same(sell.base.address, buy.base.address) && same(sell.quote.address, buy.quote.address) && !same(sell.base.address, sell.quote.address),
      title: "Same asset and quote token",
      detail: `${sell.base.symbol}/${sell.quote.symbol} vs ${buy.base.symbol}/${buy.quote.symbol}`,
    },
    { key: "AMOUNT", bit: 2, ok: sell.amount === buy.amount && sell.amount > 0n && sell.amount <= MAX_AMOUNT, title: "Same full-fill amount", detail: `${b(sell.amount, sell)} vs ${b(buy.amount, buy)}` },
    { key: "SELF_MATCH", bit: 4, ok: !same(sell.maker, buy.maker), title: "Two different makers", detail: same(sell.maker, buy.maker) ? "the same maker on both sides" : "different makers" },
    { key: "SELL_EXPIRED", bit: 5, ok: now <= sell.expiry, title: "Seller mandate still valid", detail: `expires ${new Date(sell.expiry * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC` },
    { key: "BUY_EXPIRED", bit: 6, ok: now <= buy.expiry, title: "Buyer mandate still valid", detail: `expires ${new Date(buy.expiry * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC` },
    { key: "SELL_COUNTERPARTY", bit: 7, ok: !sell.counterparty || same(sell.counterparty, buy.maker), title: "Seller accepts this buyer", detail: sell.counterparty ? `locked to ${sell.counterparty.slice(0, 10)}…` : "open to anyone" },
    { key: "BUY_COUNTERPARTY", bit: 8, ok: !buy.counterparty || same(buy.counterparty, sell.maker), title: "Buyer accepts this seller", detail: buy.counterparty ? `locked to ${buy.counterparty.slice(0, 10)}…` : "open to anyone" },
    { key: "SELL_FEE", bit: 13, ok: feeOk(sell, buy.maker), title: "Seller fee within 0.50 %", detail: `${sell.feeBps} bps${sell.feeBps ? ` to ${sell.feeRecipient.slice(0, 10)}…` : ""}` },
    { key: "BUY_FEE", bit: 14, ok: feeOk(buy, sell.maker), title: "Buyer fee within 0.50 %", detail: `${buy.feeBps} bps${buy.feeBps ? ` to ${buy.feeRecipient.slice(0, 10)}…` : ""}` },
    {
      key: "ZONE",
      ok: z.overlap,
      title: "Limits overlap",
      detail: z.overlap
        ? `any gross from ${q(z.minGross, sell)} to ${q(z.maxGross, buy)} satisfies both`
        : `seller needs at least ${q(z.minGross, sell)} gross, buyer can pay at most ${q(z.maxGross < 0n ? 0n : z.maxGross, buy)} gross`,
    },
  ];
}

export type DealNumbers = { gross: bigint; sellerNet: bigint; sellerFee: bigint; buyerTotal: bigint; buyerFee: bigint };

export function numbers(sell: Mandate, buy: Mandate, gross: bigint): DealNumbers {
  const s = sellerNet(gross, Math.min(sell.feeBps, MAX_FEE_BPS));
  const t = buyerTotal(gross, Math.min(buy.feeBps, MAX_FEE_BPS));
  return { gross, sellerNet: s.net, sellerFee: s.fee, buyerTotal: t.total, buyerFee: t.fee };
}

/**
 * Tests one offer (a gross price) against both mandates. Returns every condition with its numbers and the reason mask the settler
 * would return for the price-and-terms part. Signatures, nonces, balances and allowances are chain-only (see chainChecks in the
 * terminal).
 */
export function evaluateDeal(sell: Mandate, buy: Mandate, gross: bigint, now: number): { mask: bigint; rows: Condition[]; n: DealNumbers } {
  const n = numbers(sell, buy, gross);
  const rows = pairConditions(sell, buy, now).filter((r) => r.key !== "ZONE");
  rows.splice(3, 0, { key: "PRICE", bit: 3, ok: gross > 0n && gross <= MAX_AMOUNT, title: "One agreed gross price", detail: q(gross, sell) });
  rows.push({
    key: "SELLER_NET",
    bit: 15,
    ok: n.sellerNet >= sell.limit,
    title: "Seller net ≥ seller minimum",
    detail: `${q(gross, sell)} − fee ${q(n.sellerFee, sell)} = ${q(n.sellerNet, sell)} ${n.sellerNet >= sell.limit ? "≥" : "<"} ${q(sell.limit, sell)}`,
  });
  rows.push({
    key: "BUYER_TOTAL",
    bit: 16,
    ok: n.buyerTotal <= buy.limit,
    title: "Buyer total ≤ buyer maximum",
    detail: `${q(gross, buy)} + fee ${q(n.buyerFee, buy)} = ${q(n.buyerTotal, buy)} ${n.buyerTotal <= buy.limit ? "≤" : ">"} ${q(buy.limit, buy)}`,
  });
  let mask = 0n;
  for (const r of rows) if (!r.ok && r.bit !== undefined) mask |= 1n << BigInt(r.bit);
  return { mask, rows, n };
}

export type Candidate = { sell: Mandate; buy: Mandate; zone: Zone; blocked: Condition[] };

/** Every seller × buyer pair of the book, matchable ones first (widest overlap first), then the blocked ones with their reasons. */
export function matchBook(book: Mandate[], now: number): Candidate[] {
  const sells = book.filter((m) => m.side === "sell");
  const buys = book.filter((m) => m.side === "buy");
  const out: Candidate[] = [];
  for (const s of sells)
    for (const bu of buys) {
      if (!same(s.base.address, bu.base.address) || !same(s.quote.address, bu.quote.address)) continue;
      const blocked = pairConditions(s, bu, now).filter((c) => !c.ok);
      out.push({ sell: s, buy: bu, zone: zone(s, bu), blocked });
    }
  return out.sort((x, y) => x.blocked.length - y.blocked.length || (y.zone.width > x.zone.width ? 1 : y.zone.width < x.zone.width ? -1 : 0));
}

export const bitOf = (key: BitKey) => bit(key);
