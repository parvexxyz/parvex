import { test } from "node:test";
import assert from "node:assert/strict";
import { privateKeyToAccount } from "viem/accounts";
import { buildSessionMessage, newSessionFields, verifySession } from "./session";
import { QUOTAS, isHolder, threshold } from "./tier";
import { MAX_SIGNED_BYTES, addListing, prune, retier, withdraw, type Listing } from "../board/rules";
import { allowedDomains } from "./domains";
import { recordSignout } from "./signout";
import { spend } from "../ratelimit";
import { MemDocs, MemFull } from "../memdocs";
import { deriveAlerts } from "../alerts";

const acct = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const other = privateKeyToAccount("0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a");
const NOW = 1_800_000_000;
const ALLOWED = allowedDomains({ VERCEL: "1" });

async function signed(over: Partial<ReturnType<typeof newSessionFields>> = {}, signer = acct, origin = "https://parvex.xyz") {
  const f = { ...newSessionFields(origin, acct.address, NOW), ...over };
  const message = buildSessionMessage(f);
  return { message, signature: await signer.signMessage({ message }) };
}
const reason = (r: { ok: boolean }) => (r as unknown as { reason: string }).reason;

test("a good EIP-4361 session verifies; foreign domain, spoofed URI, non-SIWE text, expired, > 4 h, wrong chain, forged and revoked are refused", async () => {
  const s = await signed();
  assert.match(s.message, /^parvex\.xyz wants you to sign in with your Ethereum account:\n0x/);
  const ok = await verifySession(s.message, s.signature, ALLOWED, NOW + 10);
  assert.equal(ok.ok, true);
  assert.equal(ok.ok && ok.address, acct.address.toLowerCase());
  // foreign domain: signed on another site, presented here
  const foreign = await signed({}, acct, "https://evil.example");
  assert.match(reason(await verifySession(foreign.message, foreign.signature, ALLOWED, NOW)), /not this site/);
  // a spoofed Host header cannot help: the check never reads it, only the fixed list (production list has no localhost)
  const local = await signed({}, acct, "http://localhost:6700");
  assert.equal((await verifySession(local.message, local.signature, ALLOWED, NOW)).ok, false);
  assert.equal((await verifySession(local.message, local.signature, allowedDomains({}), NOW)).ok, true);
  const mixed = await signed({ uri: "https://evil.example" });
  assert.match(reason(await verifySession(mixed.message, mixed.signature, ALLOWED, NOW)), /URI and domain differ/);
  const plain = "Sign in to Parvex please";
  assert.match(reason(await verifySession(plain, await acct.signMessage({ message: plain }), ALLOWED, NOW)), /EIP-4361/);
  assert.match(reason(await verifySession(s.message, s.signature, ALLOWED, NOW + 5 * 3600)), /expired/);
  assert.equal((await verifySession(s.message, s.signature, ALLOWED, NOW + 30 * 24 * 3600)).ok, false, "replayed after expiry");
  const long = await signed({ expiresAt: NOW + 4 * 3600 + 1 });
  assert.match(reason(await verifySession(long.message, long.signature, ALLOWED, NOW)), /above 4 h/);
  const chain = await signed({ chainId: 1 });
  assert.match(reason(await verifySession(chain.message, chain.signature, ALLOWED, NOW)), /chain 1/);
  const forged = await signed({}, other);
  assert.match(reason(await verifySession(forged.message, forged.signature, ALLOWED, NOW)), /not from this wallet/);
  assert.equal((await verifySession(s.message + "\nextra", s.signature, ALLOWED, NOW)).ok, false);
  assert.match(reason(await verifySession(s.message, s.signature, ALLOWED, NOW, async () => true)), /signed out/);
});

test("memory fallback: TTL on every key, key cap and byte budget refuse new writes", () => {
  let t = 0;
  const m = new MemDocs(3, 100, () => t);
  m.set("a", "1", 10);
  m.set("b", "1", 10);
  m.set("c", "1", 10);
  assert.throws(() => m.set("d", "1", 10), MemFull);
  assert.throws(() => m.set("e", "1", 0));
  t = 11_000;
  m.set("d", "1", 10);
  assert.equal(m.get("a"), null);
  assert.throws(() => m.set("big", "x".repeat(200), 10), MemFull);
  assert.ok(m.size.bytes <= 100);
});

test("tier: exactly 0.1 % qualifies, one wei under does not, zero supply has no holders", () => {
  const supply = 1_000_000_000n * 10n ** 18n;
  assert.equal(isHolder(supply / 1000n, supply), true);
  assert.equal(isHolder(supply / 1000n - 1n, supply), false);
  assert.equal(isHolder(0n, 0n), false);
  assert.equal(isHolder(5n, 0n), false);
  assert.equal(threshold(1001n), 2n);
  assert.equal(isHolder(threshold(1001n), 1001n), true);
  assert.equal(isHolder(threshold(1001n) - 1n, 1001n), false);
});

const L = (id: string, maker: string, over: Partial<Listing> = {}): Listing => ({ id, chainId: 4663, settler: "0xs", maker, side: 0, base: "0xb", quote: "0xq", baseAmount: "10", quoteGross: "100", counterparty: "0x0000000000000000000000000000000000000000", expiry: NOW + 3600, nonce: id, signed: "{}", postedAt: NOW, replyTo: null, ...over });

test("board quota: free wallet stops at its quota, expired listings free a slot, a repeat post refused, withdraw only by maker", () => {
  let doc = { listings: [] as Listing[] };
  for (let i = 0; i < QUOTAS.free.liveOrders; i++) {
    const r = addListing(doc, L(`0x${i}`, "0xa"), QUOTAS.free.liveOrders, NOW);
    assert.equal(r.result.ok, true);
    doc = r.doc;
  }
  const over = addListing(doc, L("0xff", "0xa"), QUOTAS.free.liveOrders, NOW);
  assert.equal(over.result.ok, false);
  assert.equal((over.result as { status: number }).status, 429);
  assert.equal(addListing(doc, L("0xff", "0xa"), QUOTAS.holder.liveOrders, NOW).result.ok, true);
  assert.equal((addListing(doc, L("0x0", "0xa"), 99, NOW).result as { status: number }).status, 409);
  doc.listings[0].expiry = NOW - 1;
  assert.equal(addListing(doc, L("0xfe", "0xa"), QUOTAS.free.liveOrders, NOW).result.ok, true);
  assert.equal(prune(doc, NOW, new Set(["0x1"])).removed.length, 2);
  assert.equal(withdraw(doc, "0x2", "0xother").result, false);
  assert.equal(withdraw(doc, "0x2", "0xa").result, true);
});

test("board sybil limits: free share of the cap reserved for holders, free expiry <= 24 h, payload size", () => {
  let doc = { listings: [] as Listing[] };
  // cap 8 -> free part 6
  for (let i = 0; i < 6; i++) doc = addListing(doc, L(`0xf${i}`, `0xs${i}`, { tier: "free" }), 3, NOW, 8).doc;
  const free7 = addListing(doc, L("0xf7", "0xs7", { tier: "free" }), 3, NOW, 8);
  assert.equal(free7.result.ok, false);
  assert.match((free7.result as { error: string }).error, /free part of the board is full/);
  assert.equal(addListing(doc, L("0xh1", "0xh", { tier: "holder" }), 25, NOW, 8).result.ok, true);
  const longFree = addListing({ listings: [] }, L("0xl", "0xa", { tier: "free", expiry: NOW + 25 * 3600 }), 3, NOW);
  assert.equal((longFree.result as { status: number }).status, 400);
  assert.equal(addListing({ listings: [] }, L("0xl", "0xa", { tier: "holder", expiry: NOW + 25 * 3600 }), 25, NOW).result.ok, true);
  const big = addListing({ listings: [] }, L("0xb", "0xa", { signed: "x".repeat(MAX_SIGNED_BYTES + 1) }), 3, NOW);
  assert.equal((big.result as { status: number }).status, 413);
});

test("revocations live in their own bounded store: filling it never blocks document locks", () => {
  const docs = new MemDocs(2, 1000);
  const rev = new MemDocs(2, 1000);
  rev.set("n1", "1", 60);
  rev.set("n2", "1", 60);
  assert.throws(() => rev.set("n3", "1", 60), MemFull);
  assert.equal(docs.setNx("lock:board", "t", 10), true);
});

test("a full board refuses the new post and keeps every existing listing", () => {
  let doc = { listings: [] as Listing[] };
  for (let i = 0; i < 5; i++) doc = addListing(doc, L(`0x${i}`, `0xw${i}`, { tier: "holder" }), 3, NOW, 5).doc;
  const r = addListing(doc, L("0xnew", "0xspam", { tier: "holder" }), 3, NOW, 5);
  assert.equal(r.result.ok, false);
  assert.equal((r.result as { status: number }).status, 503);
  assert.deepEqual(r.doc.listings.map((x) => x.id).sort(), ["0x0", "0x1", "0x2", "0x3", "0x4"]);
});

test("alerts: settled, match, counter-offer and expiring derived from logs and the board", () => {
  const me = "0xaaaa000000000000000000000000000000000001";
  const them = "0xbbbb000000000000000000000000000000000002";
  const mine = L("0xm1", me, { expiry: NOW + 600 });
  const match = L("0xt1", them, { side: 1 });
  const counter = L("0xt2", them, { side: 1, quoteGross: "99", replyTo: "0xm1" });
  const unrelated = L("0xt3", them, { side: 1, quoteGross: "50" });
  const a = deriveAlerts(me, [{ dealId: "0xd", seller: me, buyer: them, baseAmount: "1", quoteGross: "1", tx: "0xt", block: 9 }], [mine, match, counter, unrelated], NOW);
  const kinds = a.map((x) => x.kind).sort();
  assert.deepEqual(kinds, ["counter", "expiring", "matched", "settled"]);
  assert.equal(deriveAlerts(them, [], [mine], NOW).length, 0);
});

test("holder listings: at most 7 days; a maker who fell below 0.1 % is demoted, and the newest excess over the free quota is dropped", () => {
  assert.equal((addListing({ listings: [] }, L("0x7", "0xh", { tier: "holder", expiry: NOW + 8 * 24 * 3600 }), 25, NOW).result as { status: number }).status, 400);
  const ls = [0, 1, 2, 3, 4].map((i) => L(`0xh${i}`, "0xh", { tier: "holder", postedAt: NOW + i }));
  ls.push(L("0xother", "0xo", { tier: "holder" }));
  const r = retier({ listings: ls }, new Map([["0xh", "free"], ["0xo", "holder"]]), 3, NOW);
  assert.deepEqual(r.dropped.map((x) => x.id), ["0xh3", "0xh4"]);
  assert.deepEqual(r.demoted.sort(), ["0xh0", "0xh1", "0xh2"]);
  assert.equal(r.doc.listings.find((x) => x.id === "0xother")?.tier, "holder");
  assert.equal(r.doc.listings.filter((x) => x.maker === "0xh").every((x) => x.tier === "free"), true);
  // a maker whose tier read failed (not in the map) keeps every holder listing untouched
  const u = retier({ listings: ls }, new Map([["0xo", "holder"]]), 3, NOW);
  assert.equal(u.dropped.length + u.demoted.length, 0);
  assert.equal(u.doc.listings.length, 6);
});

test("sign-out failure is reported with the expiry, never swallowed", async () => {
  const bad = await recordSignout(async () => { throw new Error("down"); }, "n", NOW + 60);
  assert.equal(bad.ok, false);
  assert.match((bad as { error: string }).error, /could not be recorded; this session still expires at 2027/);
  assert.equal((await recordSignout(async () => {}, "n", NOW)).ok, true);
});

test("post limiter: the per-IP key is charged with its /48 and /24 aggregates, so rotating /64s or addresses in one range runs out", async () => {
  let ok6 = 0;
  for (let i = 0; i < 1000; i++) if (await spend(null, "t-board-post-ip", `n6:2001:db8:1:${i.toString(16)}`, 1, 20, 600, { aggregate: true })) ok6++;
  assert.equal(ok6, 20 * 16, "the /48 aggregate stops at 16 x the per-key limit");
  let ok4 = 0;
  for (let i = 0; i < 256; i++) for (let k = 0; k < 2; k++) if (await spend(null, "t-board-post-ip4", `n4:198.51.100.${i}`, 1, 20, 600, { aggregate: true })) ok4++;
  assert.equal(ok4, 20 * 16);
});
