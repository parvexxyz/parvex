import "server-only";
import { holderTokenAddress } from "@/config/contracts";
import { rpcBatch } from "@/lib/feeds/rpc";
import { allowedDomains } from "@/lib/holder/domains";
import { verifySession } from "@/lib/holder/session";
import { isRevoked } from "@/lib/server/kv";
import { QUOTAS, isHolder, sharePct, threshold, type TierName } from "@/lib/holder/tier";

/*
 * The holder tier of one wallet, read live: balanceOf(wallet) and totalSupply() of the token in one batch with the block number.
 * Kept at most 30 s per wallet. A failed read is never cached and answers "free" with the reason (never a fake holder).
 */

export type Tier = {
  tier: TierName;
  /** False when the tier could not be confirmed (no token yet, or the read failed): callers must not act on "free" then. */
  known: boolean;
  token: string | null;
  balance: string | null;
  supply: string | null;
  threshold: string | null;
  sharePct: number | null;
  block: number | null;
  checkedAt: number;
  note: string | null;
  quotas: (typeof QUOTAS)[TierName];
};

const cache = new Map<string, { at: number; value: Tier }>();
const TTL = 30_000;

const word = (v: unknown) => (typeof v === "string" && /^0x[0-9a-fA-F]+$/.test(v) && v.length >= 3 ? BigInt(v.slice(0, 66)) : null);

export async function readTier(address: string): Promise<Tier> {
  const a = address.toLowerCase();
  const hit = cache.get(a);
  if (hit && Date.now() - hit.at < TTL) return hit.value;
  const token = holderTokenAddress();
  const base = { token, checkedAt: Date.now() };
  if (!token) return { ...base, tier: "free", known: false, balance: null, supply: null, threshold: null, sharePct: null, block: null, note: "Unlocks at launch: the token does not exist yet.", quotas: QUOTAS.free };
  const r = await rpcBatch<string>([
    { method: "eth_call", params: [{ to: token, data: `0x70a08231${a.slice(2).padStart(64, "0")}` }, "latest"] },
    { method: "eth_call", params: [{ to: token, data: "0x18160ddd" }, "latest"] },
    { method: "eth_blockNumber", params: [] },
  ]).catch(() => [null, null, null]);
  const bal = word(r[0]);
  const sup = word(r[1]);
  if (bal === null || sup === null) return { ...base, tier: "free", known: false, balance: null, supply: null, threshold: null, sharePct: null, block: null, note: "The token could not be read right now; free tier applies.", quotas: QUOTAS.free };
  const holder = isHolder(bal, sup);
  const value: Tier = {
    ...base,
    tier: holder ? "holder" : "free",
    known: true,
    balance: bal.toString(),
    supply: sup.toString(),
    threshold: threshold(sup).toString(),
    sharePct: sharePct(bal, sup),
    block: r[2] ? Number(BigInt(r[2])) : null,
    note: holder ? null : sup === 0n ? "The token has no supply yet." : "Under 0.1 % of the supply: free tier.",
    quotas: holder ? QUOTAS.holder : QUOTAS.free,
  };
  if (cache.size > 2000) cache.clear();
  cache.set(a, { at: Date.now(), value });
  return value;
}

/**
 * Verifies the bearer session in the request body against the FIXED domain allowlist (src/lib/holder/domains.ts; the Host header
 * is never used) and the signed-out nonce list; returns the wallet or the refusal.
 */
export async function sessionFrom(_request: Request, body: { session?: { message?: string; signature?: string } } | null) {
  const s = body?.session;
  if (!s?.message || !s.signature) return { ok: false as const, reason: "Sign in first (one gas-free message)." };
  return verifySession(s.message, s.signature, allowedDomains(), Math.floor(Date.now() / 1000), isRevoked);
}
