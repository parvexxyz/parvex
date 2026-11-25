import "server-only";
import { MemDocs, MemFull } from "@/lib/memdocs";
import { getStore } from "@/lib/server/store";
import { MAX_DOC_BYTES } from "@/lib/board/rules";

/*
 * JSON documents for the order board and saved counterparty lists, plus signed-out session nonces. In kv-gateway / Redis when
 * configured (KV_REST_API_URL + KV_REST_API_TOKEN or a Redis URL), else in this instance's bounded memory (src/lib/memdocs.ts: TTL on
 * every key, key cap, byte budget); then the pages show "Not configured: saved data may be lost on restart". Every key has a TTL in
 * both modes. Writes to one document go through a short lock so two requests cannot overwrite each other.
 */

// Documents (board per network up to MAX_DOC_BYTES each, lists) and locks share one bounded store; revocations get their own.
const mem = new MemDocs(5000, 2 * MAX_DOC_BYTES + 4_000_000);
const revoked = new MemDocs(20_000, 2_000_000);
export { MemFull };

/** Documents live 30 days after their last write (board listings expire long before; lists are re-saved by use). */
export const DOC_TTL = 30 * 24 * 3600;

export const persistent = () => getStore() !== null;

export async function readDoc<T>(key: string, fallback: T): Promise<T> {
  const s = getStore();
  const raw = s ? await s.get(key) : mem.get(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeDoc(key: string, value: unknown) {
  const s = getStore();
  const raw = JSON.stringify(value);
  if (raw.length > MAX_DOC_BYTES) throw new MemFull("document too large");
  if (s) await s.setEx(key, raw, DOC_TTL);
  else mem.set(key, raw, DOC_TTL);
}

/** Read-modify-write under a lock. `fn` returns the new document, or throws to abort without writing. */
export async function updateDoc<T, R>(key: string, fallback: T, fn: (doc: T) => { doc: T; result: R }): Promise<R> {
  const s = getStore();
  const lockKey = `lock:${key}`;
  const token = `${Date.now()}-${Math.random()}`;
  for (let i = 0; i < 40; i++) {
    const got = s ? await s.setNx(lockKey, token, 10) : mem.setNx(lockKey, token, 10);
    if (got) {
      try {
        const { doc, result } = fn(await readDoc(key, fallback));
        await writeDoc(key, doc);
        return result;
      } finally {
        if (s) await s.delIf(lockKey, token);
        else mem.del(lockKey);
      }
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Busy, try again.");
}

/** Records a signed-out session nonce until the session would have expired (own bounded store; a repeat is a no-op). */
export async function revokeNonce(nonce: string, untilUnix: number) {
  const ttl = Math.max(1, Math.ceil(untilUnix - Date.now() / 1000));
  const s = getStore();
  if (s) {
    await s.setNx(`revoked:${nonce}`, "1", ttl);
    return;
  }
  if (revoked.get(nonce) !== null) return;
  revoked.set(nonce, "1", ttl);
}

export async function isRevoked(nonce: string) {
  const s = getStore();
  return (s ? await s.get(`revoked:${nonce}`) : revoked.get(nonce)) !== null;
}
