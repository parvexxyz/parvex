import { allowPublic, tooMany } from "@/lib/guard";
import { readDesk, type Desk } from "@/lib/server/desk";
import { bad, fail, ok } from "@/lib/server/respond";
import { getStore } from "@/lib/server/store";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/*
 * GET /api/desk?net=mainnet|testnet → settlement proofs and cancellations from the settler's logs. Rate limited; a complete scan is
 * kept 10 s per network (?fresh=1 skips it after the visitor's own transaction), an incomplete scan or a failure is never cached.
 */
const cache = new Map<string, { at: number; value: Desk }>();
const TTL = 10_000;

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const net = q.get("net") ?? "mainnet";
  if (net !== "mainnet" && net !== "testnet") return bad("Give ?net=mainnet or ?net=testnet.");
  const hit = q.get("fresh") ? null : cache.get(net);
  if (hit && Date.now() - hit.at < TTL) return ok(hit.value, 10);
  if (!(await allowPublic(getStore(), request, "desk", 30, 1200))) return tooMany();
  try {
    const value = await readDesk(net);
    if (!value.scanned || value.scanned.complete) cache.set(net, { at: Date.now(), value });
    return ok(value, 10);
  } catch (e) {
    return fail(e);
  }
}
