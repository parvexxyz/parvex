/*
 * Alerts for one wallet, derived from public data only: the settler's Settled events and the order board. Free for everyone (a
 * browser can read the chain itself). Pure, so the tests cover it; the bell (components/holder/Bell.tsx) polls and shows them.
 */

export type AlertListing = {
  id: string;
  maker: string;
  side: number;
  base: string;
  quote: string;
  baseAmount: string;
  quoteGross: string;
  counterparty: string;
  expiry: number;
  replyTo: string | null;
};
export type AlertProof = { dealId: string; seller: string; buyer: string; baseAmount: string; quoteGross: string; tx: string; block: number };
export type Alert = { id: string; kind: "settled" | "matched" | "counter" | "expiring"; title: string; body: string; at: number; href: string };

const ZERO = "0x0000000000000000000000000000000000000000";
export const EXPIRING_SECONDS = 15 * 60;

export function deriveAlerts(me: string, proofs: AlertProof[], listings: AlertListing[], now: number): Alert[] {
  const m = me.toLowerCase();
  const out: Alert[] = [];
  for (const p of proofs) {
    if (p.seller !== m && p.buyer !== m) continue;
    out.push({ id: `settled:${p.dealId}`, kind: "settled", title: "Your deal settled", body: `You were the ${p.seller === m ? "seller" : "buyer"}. Block ${p.block}.`, at: p.block, href: "/dashboard" });
  }
  const mine = listings.filter((l) => l.maker === m);
  const mineIds = new Set(mine.map((l) => l.id));
  for (const l of listings) {
    if (l.maker === m) {
      if (l.expiry - now <= EXPIRING_SECONDS && l.expiry >= now) out.push({ id: `expiring:${l.id}`, kind: "expiring", title: "Your order expires soon", body: `Listed order ${l.id.slice(0, 10)}… expires in ${Math.max(1, Math.round((l.expiry - now) / 60))} min.`, at: l.expiry, href: "/terminal#board" });
      continue;
    }
    if ((l.replyTo && mineIds.has(l.replyTo)) || l.counterparty === m) {
      out.push({ id: `counter:${l.id}`, kind: "counter", title: "Counter-offer arrived", body: `${l.maker.slice(0, 8)}… answered with an order ${l.counterparty === m ? "locked to you" : "to yours"}.`, at: l.expiry, href: "/terminal#board" });
      continue;
    }
    const match = mine.find((x) => x.side !== l.side && x.base === l.base && x.quote === l.quote && x.baseAmount === l.baseAmount && x.quoteGross === l.quoteGross && (l.counterparty === ZERO || l.counterparty === m) && (x.counterparty === ZERO || x.counterparty === l.maker));
    if (match) out.push({ id: `matched:${l.id}`, kind: "matched", title: "Your order has a match", body: `An order with the same terms from ${l.maker.slice(0, 8)}… is on the board; it can settle now.`, at: l.expiry, href: "/terminal#board" });
  }
  return out;
}
