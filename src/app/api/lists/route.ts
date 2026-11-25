import { NextResponse } from "next/server";
import { allowPublic, readBody, tooLarge, tooMany } from "@/lib/guard";
import { readTier, sessionFrom } from "@/lib/server/holder";
import { MemFull, persistent, readDoc, updateDoc } from "@/lib/server/kv";
import { getStore } from "@/lib/server/store";

export const dynamic = "force-dynamic";

/*
 * Saved counterparties per wallet (addresses you trade with, with a short label). POST { session, action: "get" } or
 * { session, action: "save", entries: [{ address, label }] }. The size limit depends on the tier and is enforced here.
 */
type Entry = { address: string; label: string };
const no = (error: string, status = 400) => NextResponse.json({ error }, { status, headers: { "cache-control": "no-store" } });

export async function POST(request: Request) {
  if (!(await allowPublic(getStore(), request, "lists", 30, 1200))) return tooMany();
  const b = await readBody<{ session?: { message?: string; signature?: string }; action?: string; entries?: Entry[] }>(request, 16_384);
  if (!b.ok) return b.tooLarge ? tooLarge() : no("Invalid body.");
  const s = await sessionFrom(request, b.value);
  if (!s.ok) return no(s.reason, 401);
  const key = `lists:${s.address}`;
  const tier = await readTier(s.address);
  const max = tier.quotas.savedCounterparties;
  if (b.value!.action === "get") return NextResponse.json({ entries: await readDoc<Entry[]>(key, []), max, tier: tier.tier, persistent: persistent() });
  if (b.value!.action !== "save" || !Array.isArray(b.value!.entries)) return no("Unknown action.");
  const entries = b.value!.entries;
  if (entries.some((e) => !e || typeof e.address !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(e.address) || typeof e.label !== "string")) return no("Each entry needs an address and a label.");
  const clean = [...new Map(entries.map((e) => [e.address.toLowerCase(), { address: e.address.toLowerCase(), label: e.label.slice(0, 40) }])).values()];
  if (clean.length > max) return NextResponse.json({ error: `Quota reached: ${clean.length} of ${max} saved counterparties on the ${tier.tier} tier.`, max, tier: tier.tier }, { status: 429 });
  try {
    await updateDoc<Entry[], null>(key, [], () => ({ doc: clean, result: null }));
  } catch (e) {
    return no(e instanceof MemFull ? "Storage full on this server, try later." : "Busy, try again.", 503);
  }
  return NextResponse.json({ ok: true, entries: clean, max, tier: tier.tier });
}
