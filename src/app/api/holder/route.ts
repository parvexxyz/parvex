import { NextResponse } from "next/server";
import { allow, allowPublic, readBody, tooLarge, tooMany } from "@/lib/guard";
import { QUOTAS } from "@/lib/holder/tier";
import { recordSignout } from "@/lib/holder/signout";
import { readTier, sessionFrom } from "@/lib/server/holder";
import { persistent, revokeNonce } from "@/lib/server/kv";
import { getStore } from "@/lib/server/store";

export const dynamic = "force-dynamic";

/*
 * POST { session } → the wallet's tier, read live (balanceOf + totalSupply, block), and its quotas. The session is verified here.
 * POST { session, action: "signout" } → the session's nonce is revoked until it would expire; it can never be used again.
 */
export async function POST(request: Request) {
  if (!(await allowPublic(getStore(), request, "holder", 30, 1200))) return tooMany();
  const b = await readBody<{ session?: { message?: string; signature?: string }; action?: string }>(request, 4096);
  if (!b.ok) return b.tooLarge ? tooLarge() : NextResponse.json({ error: "Invalid body." }, { status: 400 });
  const s = await sessionFrom(request, b.value);
  if (!s.ok) return NextResponse.json({ error: s.reason }, { status: 401, headers: { "cache-control": "no-store" } });
  if (b.value?.action === "signout") {
    if (!(await allow(getStore(), "signout", [s.address], 10, 3600))) return tooMany();
    const r = await recordSignout(revokeNonce, s.nonce, s.expiresAt);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status, headers: { "cache-control": "no-store" } });
    return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  }
  const tier = await readTier(s.address);
  return NextResponse.json({ address: s.address, expiresAt: s.expiresAt, persistent: persistent(), ...tier }, { headers: { "cache-control": "no-store" } });
}

/* GET → the live threshold: token address, totalSupply, 0.1 % of it, block. "Unlocks at launch" before the token exists. */
export async function GET(request: Request) {
  if (!(await allowPublic(getStore(), request, "holder-info", 60, 1200))) return tooMany();
  const t = await readTier("0x0000000000000000000000000000000000000000");
  return NextResponse.json({ token: t.token, supply: t.supply, threshold: t.threshold, block: t.block, checkedAt: t.checkedAt, note: t.token ? null : t.note, quotas: QUOTAS }, { headers: { "cache-control": "public, max-age=0, s-maxage=30" } });
}
