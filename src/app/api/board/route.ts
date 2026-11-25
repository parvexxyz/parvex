import { NextResponse } from "next/server";
import { allow, allowPublic, readBody, tooLarge, tooMany } from "@/lib/guard";
import { clientIp, trustsProxyHeaders } from "@/lib/netkey";
import { spend } from "@/lib/ratelimit";
import { QUOTAS } from "@/lib/holder/tier";
import { checkSigned, post, readBoard, remove } from "@/lib/server/board";
import { readTier, sessionFrom } from "@/lib/server/holder";
import { MemFull, persistent } from "@/lib/server/kv";
import { getStore } from "@/lib/server/store";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const no = (error: string, status = 400) => NextResponse.json({ error }, { status, headers: { "cache-control": "no-store" } });

/* GET /api/board?net=mainnet|testnet → live listings (expired, settled and cancelled ones are removed first). Open to everyone. */
export async function GET(request: Request) {
  if (!(await allowPublic(getStore(), request, "board", 60, 1200))) return tooMany();
  const net = new URL(request.url).searchParams.get("net") ?? "mainnet";
  if (net !== "mainnet" && net !== "testnet") return no("Give ?net=mainnet or ?net=testnet.");
  try {
    const b = await readBoard(net);
    return NextResponse.json({ net, persistent: persistent(), quotas: QUOTAS, ...b }, { headers: { "cache-control": "no-store" } });
  } catch {
    return no("The board could not be read.", 503);
  }
}

/*
 * POST { session, action: "post", signed, replyTo? } lists your signed order (quota per tier, checked here).
 * POST { session, action: "withdraw", net, id } removes your own listing.
 */
export async function POST(request: Request) {
  if (!(await allowPublic(getStore(), request, "board-post", 20, 600))) return tooMany();
  const b = await readBody<{ session?: { message?: string; signature?: string }; action?: string; signed?: string; replyTo?: string; net?: string; id?: string }>(request, 8192);
  if (!b.ok) return b.tooLarge ? tooLarge() : no("Invalid body.");
  const s = await sessionFrom(request, b.value);
  if (!s.ok) return no(s.reason, 401);
  const v = b.value!;
  try {
    if (v.action === "withdraw") {
      if (v.net !== "mainnet" && v.net !== "testnet") return no("Unknown network.");
      const done = await remove(v.net, String(v.id ?? "").toLowerCase(), s.address);
      return done ? NextResponse.json({ ok: true }) : no("No listing of yours with that id.", 404);
    }
    if (v.action !== "post" || typeof v.signed !== "string") return no("Unknown action.");
    const c = await checkSigned(v.signed, s.address, v.replyTo ?? null);
    if (!c.ok) return no(c.error, c.status);
    // Posting budget per client network key (IP, IPv6 /64) charged together with its /24 and /48 aggregates, and per wallet, on
    // top of the live-order quota. Only when the IP cannot be trusted (self-hosted, no proxy) a site-wide budget is charged too,
    // in one atomic increment up front. There is no single per-network bucket anyone could exhaust for everyone.
    const store = getStore();
    const ip = clientIp(request);
    if (!(await spend(store, "board-post-ip", ip, 1, 20, 600, { aggregate: true })) || !(await allow(store, "board-post-wallet", [s.address], 20, 600))) return no("Too many posts from you. Try again in a few minutes.", 429);
    if (!trustsProxyHeaders() && !(await spend(store, "board-post-site", "all", 1, 600, 600))) return no("The board is taking many posts right now. Try again in a few minutes.", 429);
    const tier = await readTier(s.address);
    const r = await post(c.net, { ...c.listing, tier: tier.tier }, tier.quotas.liveOrders).catch(async (e) => {
      await spend(store, "board-post-ip", ip, -1, 20, 600, { aggregate: true });
      throw e;
    });
    // Only a successful post keeps its charge on the per-IP (and range) budget.
    if (!r.ok) await spend(store, "board-post-ip", ip, -1, 20, 600, { aggregate: true });
    if (!r.ok) return NextResponse.json({ error: r.error, live: r.live, quota: tier.quotas.liveOrders, tier: tier.tier }, { status: r.status });
    return NextResponse.json({ ok: true, id: c.listing.id, live: r.live, quota: tier.quotas.liveOrders, tier: tier.tier });
  } catch (e) {
    return no(e instanceof MemFull ? "Storage full on this server, try later." : e instanceof Error && /Busy/.test(e.message) ? "Busy, try again." : "The board could not be updated.", 503);
  }
}
