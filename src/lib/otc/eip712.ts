import { hashTypedData, type Hex } from "viem";
import type { Mandate } from "./types";

/*
 * The EIP-712 order a maker signs. Field order and names match ORDER_TYPEHASH in ParvexMandateSettler; eip712.test.ts compares
 * the type string with the Solidity file and the digest with the contract's hashOrder (fixture from a forge run).
 */

export const ORDER_TYPE = [
  { name: "maker", type: "address" },
  { name: "side", type: "uint8" },
  { name: "base", type: "address" },
  { name: "quote", type: "address" },
  { name: "baseAmount", type: "uint256" },
  { name: "quoteGross", type: "uint256" },
  { name: "limitQuote", type: "uint256" },
  { name: "feeBps", type: "uint16" },
  { name: "feeRecipient", type: "address" },
  { name: "counterparty", type: "address" },
  { name: "expiry", type: "uint64" },
  { name: "nonce", type: "uint256" },
] as const;

export const ORDER_TYPE_STRING = `Order(${ORDER_TYPE.map((f) => `${f.type} ${f.name}`).join(",")})`;

export type Order = {
  maker: Hex;
  side: number;
  base: Hex;
  quote: Hex;
  baseAmount: bigint;
  quoteGross: bigint;
  limitQuote: bigint;
  feeBps: number;
  feeRecipient: Hex;
  counterparty: Hex;
  expiry: bigint;
  nonce: bigint;
};

export const ZERO = "0x0000000000000000000000000000000000000000" as Hex;

export const domain = (chainId: number, settler: string) => ({ name: "Parvex Mandate Settler", version: "1", chainId, verifyingContract: settler as Hex });

/**
 * The order for one side of an agreed deal. By default the signed limit is the deal's own number for that side (the seller's
 * exact net, the buyer's exact total), so the wider private limit never leaves the device. `signFullLimit` signs the mandate's
 * limit instead (useful when the same order should stay valid for a re-quote inside it).
 */
export function orderFor(m: Mandate, gross: bigint, exact: { sellerNet: bigint; buyerTotal: bigint }, nonce: bigint, counterparty: string | null, signFullLimit = false): Order {
  const limitQuote = signFullLimit ? m.limit : m.side === "sell" ? exact.sellerNet : exact.buyerTotal;
  return {
    maker: m.maker as Hex,
    side: m.side === "sell" ? 0 : 1,
    base: m.base.address as Hex,
    quote: m.quote.address as Hex,
    baseAmount: m.amount,
    quoteGross: gross,
    limitQuote,
    feeBps: m.feeBps,
    feeRecipient: (m.feeBps > 0 ? m.feeRecipient : ZERO) as Hex,
    counterparty: (counterparty ?? m.counterparty ?? ZERO) as Hex,
    expiry: BigInt(m.expiry),
    nonce,
  };
}

/** eth_signTypedData_v4 payload (numbers as decimal strings, which every wallet accepts). */
export function typedData(chainId: number, settler: string, o: Order) {
  return {
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
      Order: ORDER_TYPE,
    },
    primaryType: "Order",
    domain: domain(chainId, settler),
    message: Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === "bigint" ? v.toString() : v])),
  };
}

export function orderDigest(chainId: number, settler: string, o: Order): Hex {
  return hashTypedData({ domain: domain(chainId, settler), types: { Order: ORDER_TYPE }, primaryType: "Order", message: o });
}

/** Tuple for viem encodeFunctionData (struct field order). */
export const orderTuple = (o: Order) => o;

/** JSON-safe form for export/import of a signed order between two devices. */
export function encodeSigned(o: Order, signature: string, chainId: number, settler: string) {
  return JSON.stringify({ v: 1, chainId, settler, signature, order: Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === "bigint" ? v.toString() : v])) });
}

export function decodeSigned(text: string): { order: Order; signature: Hex; chainId: number; settler: string } | null {
  try {
    const j = JSON.parse(text) as { v: number; chainId: number; settler: string; signature: string; order: Record<string, string | number> };
    if (j.v !== 1 || !/^0x[0-9a-fA-F]*$/.test(j.signature)) return null;
    const o = j.order;
    const addr = (k: string) => {
      const v = String(o[k]);
      if (!/^0x[0-9a-fA-F]{40}$/.test(v)) throw new Error(k);
      return v as Hex;
    };
    const order: Order = {
      maker: addr("maker"),
      side: Number(o.side),
      base: addr("base"),
      quote: addr("quote"),
      baseAmount: BigInt(o.baseAmount),
      quoteGross: BigInt(o.quoteGross),
      limitQuote: BigInt(o.limitQuote),
      feeBps: Number(o.feeBps),
      feeRecipient: addr("feeRecipient"),
      counterparty: addr("counterparty"),
      expiry: BigInt(o.expiry),
      nonce: BigInt(o.nonce),
    };
    if (order.side !== 0 && order.side !== 1) return null;
    return { order, signature: j.signature as Hex, chainId: Number(j.chainId), settler: String(j.settler) };
  } catch {
    return null;
  }
}
