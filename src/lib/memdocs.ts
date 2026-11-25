/*
 * The in-memory fallback used when no KV / Redis store is configured. Bounded on every write path: each key has a TTL, the number
 * of keys is capped, and a total byte budget refuses new writes above it (expired keys are swept first). A refused write throws
 * MemFull, which the routes turn into "Storage full, try later".
 */

export class MemFull extends Error {}

export class MemDocs {
  private m = new Map<string, { v: string; exp: number }>();
  private bytes = 0;
  constructor(
    readonly maxKeys = 5000,
    readonly maxBytes = 8_000_000,
    private now: () => number = () => Date.now(),
  ) {}

  private sweep() {
    const t = this.now();
    for (const [k, e] of this.m) if (e.exp <= t) this.drop(k);
  }
  private drop(k: string) {
    const e = this.m.get(k);
    if (!e) return;
    this.bytes -= k.length + e.v.length;
    this.m.delete(k);
  }

  get(k: string): string | null {
    const e = this.m.get(k);
    if (!e) return null;
    if (e.exp <= this.now()) {
      this.drop(k);
      return null;
    }
    return e.v;
  }

  /** Sets with a TTL in seconds (required). Throws MemFull when the key cap or the byte budget would be passed. */
  set(k: string, v: string, ttlSec: number) {
    if (!(ttlSec > 0)) throw new Error("TTL required");
    const old = this.m.get(k);
    const delta = k.length + v.length - (old ? k.length + old.v.length : 0);
    if ((!old && this.m.size >= this.maxKeys) || this.bytes + delta > this.maxBytes) this.sweep();
    const cur = this.m.get(k);
    const d2 = k.length + v.length - (cur ? k.length + cur.v.length : 0);
    if (!cur && this.m.size >= this.maxKeys) throw new MemFull("key cap reached");
    if (this.bytes + d2 > this.maxBytes) throw new MemFull("byte budget reached");
    this.bytes += d2;
    this.m.set(k, { v, exp: this.now() + ttlSec * 1000 });
  }

  /** Sets only if free (lock); same caps. */
  setNx(k: string, v: string, ttlSec: number) {
    if (this.get(k) !== null) return false;
    this.set(k, v, ttlSec);
    return true;
  }

  del(k: string) {
    this.drop(k);
  }

  get size() {
    return { keys: this.m.size, bytes: this.bytes };
  }
}
