/*
 * The order board's rules, free of I/O so the tests cover them: what a listing is, when it drops off, and how many live orders a
 * maker may have. The server route applies them inside one locked read-modify-write.
 */

export type Listing = {
  /** EIP-712 digest of the order (unique). */
  id: string;
  chainId: number;
  settler: string;
  maker: string;
  side: number;
  base: string;
  quote: string;
  baseAmount: string;
  quoteGross: string;
  counterparty: string;
  expiry: number;
  nonce: string;
  /** The full signed order as exported by the terminal (encodeSigned JSON). */
  signed: string;
  postedAt: number;
  /** Listing this one answers (a counter-offer), or null. */
  replyTo: string | null;
  /** Tier of the maker when posted (holder listings may use the reserved part of the board). */
  tier?: "free" | "holder";
};

export type BoardDoc = { listings: Listing[] };

/** Global cap of live listings per network. A full board refuses new posts; it never drops someone else's order. */
export const MAX_LISTINGS = 2000;
/** Free-tier listings may fill at most this share of the cap; the rest is reserved for holder listings (sybil wallets hit it first). */
export const FREE_SHARE_PCT = 75;
/** Longest a listing may stay up: free tier 24 h, holder tier 7 days. */
export const FREE_MAX_SECONDS = 24 * 3600;
export const HOLDER_MAX_SECONDS = 7 * 24 * 3600;
/** Largest signed payload accepted, and the byte bound of one stored listing; the document cap follows from both. */
export const MAX_SIGNED_BYTES = 2048;
export const MAX_LISTING_BYTES = 3072;
export const MAX_DOC_BYTES = MAX_LISTINGS * MAX_LISTING_BYTES;

/** Drops expired listings and those whose nonce the chain reports used or cancelled. */
export function prune(doc: BoardDoc, now: number, dead: Set<string> = new Set()): { doc: BoardDoc; removed: Listing[] } {
  const keep: Listing[] = [];
  const removed: Listing[] = [];
  for (const l of doc.listings) (l.expiry < now || dead.has(l.id) ? removed : keep).push(l);
  return { doc: { listings: keep }, removed };
}

export type AddResult = { ok: true; live: number } | { ok: false; status: number; error: string; live: number };

/** Adds a listing when the maker is under quota and it is not already listed. */
export function addListing(doc: BoardDoc, l: Listing, quota: number, now: number, cap = MAX_LISTINGS): { doc: BoardDoc; result: AddResult } {
  const { doc: clean } = prune(doc, now);
  const mine = clean.listings.filter((x) => x.maker === l.maker).length;
  if (clean.listings.some((x) => x.id === l.id)) return { doc: clean, result: { ok: false, status: 409, error: "This order is already on the board.", live: mine } };
  if (l.signed.length > MAX_SIGNED_BYTES || JSON.stringify(l).length > MAX_LISTING_BYTES) return { doc: clean, result: { ok: false, status: 413, error: "Signed order too large.", live: mine } };
  if (l.tier !== "holder" && l.expiry - now > FREE_MAX_SECONDS) return { doc: clean, result: { ok: false, status: 400, error: "Free-tier orders may stay on the board at most 24 h: sign one with an earlier expiry.", live: mine } };
  if (l.tier === "holder" && l.expiry - now > HOLDER_MAX_SECONDS) return { doc: clean, result: { ok: false, status: 400, error: "Orders may stay on the board at most 7 days: sign one with an earlier expiry.", live: mine } };
  const freeCap = Math.floor((cap * FREE_SHARE_PCT) / 100);
  if (l.tier !== "holder" && clean.listings.filter((x) => x.tier !== "holder").length >= freeCap) return { doc: clean, result: { ok: false, status: 503, error: `The free part of the board is full (${freeCap} live orders). Try again when orders settle or expire.`, live: mine } };
  if (clean.listings.length >= cap) return { doc: clean, result: { ok: false, status: 503, error: `The board is full (${MAX_LISTINGS} live orders on this network). Try again when orders settle or expire.`, live: mine } };
  if (mine >= quota) return { doc: clean, result: { ok: false, status: 429, error: `Quota reached: ${mine} of ${quota} live orders for this wallet. Withdraw one, wait for one to expire, or hold 0.1 % of $PARVEX for a larger quota.`, live: mine } };
  return { doc: { listings: [l, ...clean.listings] }, result: { ok: true, live: mine + 1 } };
}

/**
 * Re-applies each maker's CURRENT tier (read at board read time): a holder listing whose maker fell below 0.1 % is demoted to the
 * free tier; if the maker then has more listings than the free quota, or a demoted listing lives longer than the free limit, the
 * excess (newest first) is dropped.
 */
export function retier(doc: BoardDoc, tierOf: Map<string, "free" | "holder">, freeQuota: number, now: number): { doc: BoardDoc; dropped: Listing[]; demoted: string[] } {
  const keep = new Map<string, Listing>();
  const dropped: Listing[] = [];
  const demoted: string[] = [];
  const count = new Map<string, number>();
  // Oldest first, so the newest excess is the one dropped.
  for (const l of [...doc.listings].sort((a, b) => a.postedAt - b.postedAt)) {
    const c = (count.get(l.maker) ?? 0) + 1;
    count.set(l.maker, c);
    const fell = l.tier === "holder" && tierOf.get(l.maker) === "free";
    if (!fell) {
      keep.set(l.id, l);
      continue;
    }
    if (c > freeQuota || l.expiry - now > FREE_MAX_SECONDS) dropped.push(l);
    else {
      keep.set(l.id, { ...l, tier: "free" });
      demoted.push(l.id);
    }
  }
  return { doc: { listings: doc.listings.filter((x) => keep.has(x.id)).map((x) => keep.get(x.id)!) }, dropped, demoted };
}

export function withdraw(doc: BoardDoc, id: string, maker: string): { doc: BoardDoc; result: boolean } {
  const before = doc.listings.length;
  const listings = doc.listings.filter((x) => !(x.id === id && x.maker === maker));
  return { doc: { listings }, result: listings.length < before };
}
