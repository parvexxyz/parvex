import "server-only";
import { encodeFunctionData, recoverTypedDataAddress, type Hex } from "viem";
import { NETWORKS, settlerOf, type NetKey } from "@/config/contracts";
import { SETTLER_ABI } from "@/lib/abi";
import { MAX_SIGNED_BYTES, addListing, prune, retier, withdraw, type BoardDoc, type Listing } from "@/lib/board/rules";
import { QUOTAS } from "@/lib/holder/tier";
import { readTier } from "@/lib/server/holder";
import { rpcBatch } from "@/lib/feeds/rpc";
import { ORDER_TYPE, decodeSigned, domain, orderDigest, type Order } from "@/lib/otc/eip712";
import { readDoc, updateDoc } from "@/lib/server/kv";

/*
 * The open order relay board. Anyone may READ it. Posting needs a holder session (proves the wallet) and is limited per wallet
 * (free / holder quota, src/lib/holder/tier.ts). Before listing, the server checks the order itself: settler and chain of this
 * site, a valid EIP-712 signature from the maker (EOA), not expired, nonce neither used nor cancelled on chain. Listings whose
 * nonce the chain reports used (settled) or cancelled, and expired ones, are removed on every read.
 */

const key = (net: NetKey) => `board:${net}`;
const EMPTY: BoardDoc = { listings: [] };
export const netOfChain = (id: number): NetKey | null => (id === NETWORKS.mainnet.id ? "mainnet" : id === NETWORKS.testnet.id ? "testnet" : null);

/** For each listing: true when its nonce is spent or below the maker's cancel-all line. Unknown (read failed) = alive. */
async function deadSet(net: NetKey, settler: string, ls: Listing[]): Promise<Set<string>> {
  const dead = new Set<string>();
  if (!ls.length) return dead;
  const calls = ls.flatMap((l) => [
    { method: "eth_call", params: [{ to: settler, data: encodeFunctionData({ abi: SETTLER_ABI, functionName: "nonceUsed", args: [l.maker as Hex, BigInt(l.nonce)] }) }, "latest"] },
    { method: "eth_call", params: [{ to: settler, data: encodeFunctionData({ abi: SETTLER_ABI, functionName: "minNonce", args: [l.maker as Hex] }) }, "latest"] },
  ]);
  for (let i = 0; i < calls.length; i += 100) {
    const r = await rpcBatch<string>(calls.slice(i, i + 100), net).catch(() => null);
    if (!r) continue;
    for (let k = 0; k < r.length; k += 2) {
      const l = ls[(i + k) / 2];
      const used = r[k];
      const min = r[k + 1];
      if (typeof used === "string" && used.length >= 66 && BigInt(used.slice(0, 66)) === 1n) dead.add(l.id);
      else if (typeof min === "string" && min.length >= 66 && BigInt(min.slice(0, 66)) > BigInt(l.nonce)) dead.add(l.id);
    }
  }
  return dead;
}

export async function readBoard(net: NetKey) {
  const settler = settlerOf(net);
  const doc = await readDoc<BoardDoc>(key(net), EMPTY);
  if (!settler) return { listings: [] as Listing[], removed: 0 };
  const now = Math.floor(Date.now() / 1000);
  const dead = await deadSet(net, settler, doc.listings);
  const { doc: alive, removed } = prune(doc, now, dead);
  // Holder listings: re-check each maker's tier now (cached <= 30 s per wallet).
  const makers = [...new Set(alive.listings.filter((l) => l.tier === "holder").map((l) => l.maker))];
  const tierOf = new Map<string, "free" | "holder">();
  // Only CONFIRMED tiers count: a failed read leaves that maker's listings untouched (never demoted on an RPC hiccup).
  for (const m of makers) {
    const t = await readTier(m);
    if (t.known) tierOf.set(m, t.tier);
  }
  const { doc: next, dropped, demoted } = retier(alive, tierOf, QUOTAS.free.liveOrders, now);
  if (removed.length || dropped.length || demoted.length) {
    const gone = new Set([...removed, ...dropped].map((x) => x.id));
    const newTier = new Map(next.listings.map((l) => [l.id, l.tier]));
    await updateDoc(key(net), EMPTY, (d) => ({ doc: { listings: d.listings.filter((x) => !gone.has(x.id)).map((x) => (newTier.has(x.id) ? { ...x, tier: newTier.get(x.id) } : x)) }, result: null })).catch(() => null);
  }
  return { listings: next.listings, removed: removed.length + dropped.length };
}

export type PostCheck = { ok: true; listing: Listing; net: NetKey } | { ok: false; status: number; error: string };

/** Everything about a signed order that must hold before it is listed (chain reads included). */
export async function checkSigned(signedText: string, poster: string, replyTo: string | null): Promise<PostCheck> {
  if (signedText.length > MAX_SIGNED_BYTES) return { ok: false, status: 413, error: "Signed order too large." };
  const d = decodeSigned(signedText);
  if (!d) return { ok: false, status: 400, error: "Not a Parvex signed order." };
  const net = netOfChain(d.chainId);
  const settler = net ? settlerOf(net) : null;
  if (!net || !settler || settler.toLowerCase() !== d.settler.toLowerCase()) return { ok: false, status: 400, error: "This order is for a settler this site does not serve." };
  const o: Order = d.order;
  if (o.maker.toLowerCase() !== poster) return { ok: false, status: 403, error: "Only the order's maker may post it." };
  const now = Math.floor(Date.now() / 1000);
  if (Number(o.expiry) < now + 60) return { ok: false, status: 400, error: "The order expires within a minute." };
  if (o.baseAmount <= 0n || o.quoteGross <= 0n) return { ok: false, status: 400, error: "Amount and price must be above zero." };
  let signer: string;
  try {
    signer = await recoverTypedDataAddress({ domain: domain(d.chainId, settler), types: { Order: ORDER_TYPE }, primaryType: "Order", message: o, signature: d.signature });
  } catch {
    return { ok: false, status: 400, error: "Bad order signature." };
  }
  if (signer.toLowerCase() !== poster) return { ok: false, status: 400, error: "The order signature is not from its maker (EOA signatures only on the board in v1)." };
  const id = orderDigest(d.chainId, settler, o).toLowerCase();
  const listing: Listing = {
    id,
    chainId: d.chainId,
    settler: settler.toLowerCase(),
    maker: poster,
    side: o.side,
    base: o.base.toLowerCase(),
    quote: o.quote.toLowerCase(),
    baseAmount: o.baseAmount.toString(),
    quoteGross: o.quoteGross.toString(),
    counterparty: o.counterparty.toLowerCase(),
    expiry: Number(o.expiry),
    nonce: o.nonce.toString(),
    signed: signedText,
    postedAt: now,
    replyTo: replyTo && /^0x[0-9a-f]{64}$/.test(replyTo) ? replyTo : null,
  };
  const dead = await deadSet(net, settler, [listing]);
  if (dead.has(id)) return { ok: false, status: 409, error: "This order's nonce is already used or cancelled on chain." };
  return { ok: true, listing, net };
}

export function post(net: NetKey, listing: Listing, quota: number) {
  return updateDoc(key(net), EMPTY, (d) => addListing(d, listing, quota, Math.floor(Date.now() / 1000)));
}

export function remove(net: NetKey, id: string, maker: string) {
  return updateDoc(key(net), EMPTY, (d) => withdraw(d, id, maker));
}
