import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BITS, decode, mask } from "./bits";
import { buyerTotal, fromUnits, maxGrossForBudget, minGrossForNet, sellerNet, toUnits } from "./netmath";
import { negotiate, openingAsk, openingBid } from "./agent";
import { evaluateDeal, matchBook, zone } from "./engine";
import { ORDER_TYPE_STRING, decodeSigned, encodeSigned, orderDigest, orderFor, type Order } from "./eip712";
import type { Asset, Mandate } from "./types";

const SOL = readFileSync(new URL("../../../contracts/src/ParvexMandateSettler.sol", import.meta.url), "utf8");
const MATH = readFileSync(new URL("../../../contracts/src/ParvexNetMath.sol", import.meta.url), "utf8");

test("every reason bit matches the Solidity constants, name and position", () => {
  const sol = [...SOL.matchAll(/uint256 public constant R_([A-Z_]+) = 1 << (\d+);/g)].map((m) => [m[1], Number(m[2])]);
  assert.equal(sol.length, BITS.length);
  for (const [name, b] of sol) {
    const ours = BITS.find((x) => x.bit === b);
    assert.ok(ours, `bit ${b}`);
    assert.equal(ours.key, name);
  }
  assert.deepEqual(decode(mask(["SELLER_NET", "BUY_NONCE"])).map((b) => b.key), ["BUY_NONCE", "SELLER_NET"]);
});

test("fee cap and amount bound match the library", () => {
  assert.match(MATH, /MAX_FEE_BPS = 50;/);
  assert.match(MATH, /MAX_AMOUNT = type\(uint128\)\.max;/);
});

test("net math matches the forge unit test numbers", () => {
  assert.deepEqual(sellerNet(1_031_002_004n, 20), { net: 1_028_940_000n, fee: 2_062_004n });
  assert.deepEqual(buyerTotal(1_031_002_004n, 5), { total: 1_031_517_505n, fee: 515_501n });
  // 1,000 gross under 20 bps nets 998: a 1,000 floor needs 1,002.004008 gross.
  assert.equal(sellerNet(1_000_000_000n, 20).net, 998_000_000n);
  assert.equal(minGrossForNet(1_000_000_000n, 20), 1_002_004_008n);
});

test("min gross and max gross are tight bounds (random sweep)", () => {
  let seed = 12345n;
  const rnd = (m: bigint) => (seed = (seed * 6364136223846793005n + 1442695040888963407n) % (1n << 64n)) % m;
  for (let i = 0; i < 3000; i++) {
    const v = rnd(10n ** 15n);
    const bps = Number(rnd(51n));
    const g = minGrossForNet(v, bps);
    assert.ok(sellerNet(g, bps).net >= v);
    if (g > 0n) assert.ok(sellerNet(g - 1n, bps).net < v);
    const h = maxGrossForBudget(v, bps);
    assert.ok(buyerTotal(h, bps).total <= v);
    assert.ok(buyerTotal(h + 1n, bps).total > v);
  }
});

test("units round-trip", () => {
  assert.equal(toUnits("1,234.5678", 6), 1_234_567_800n);
  assert.equal(toUnits("0.1234567", 6), 123_456n);
  assert.equal(toUnits("abc", 6), null);
  assert.equal(fromUnits(1_234_567_800n, 6), "1,234.5678");
});

const A = (s: string, d: number, a: string): Asset => ({ address: a, symbol: s, name: s, decimals: d, proof: "test" });
const NVDA = A("NVDA", 18, "0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec");
const USDG = A("USDG", 6, "0x5fc5360d0400a0fd4f2af552add042d716f1d168");
const S = "0x1111111111111111111111111111111111111111";
const B = "0x2222222222222222222222222222222222222222";
const BROKER = "0x4444444444444444444444444444444444444444";
const NOW = 1_800_000_000;
function mandate(side: "sell" | "buy", limit: bigint, over: Partial<Mandate> = {}): Mandate {
  return { id: side, label: side, maker: side === "sell" ? S : B, side, base: NVDA, quote: USDG, amount: 40n * 10n ** 18n, limit, feeBps: 0, feeRecipient: "", counterparty: null, expiry: NOW + 3600, createdAt: NOW, source: "sample", ...over };
}

test("agent never offers past its own bound and agrees whenever the limits overlap", () => {
  let seed = 99n;
  const rnd = (m: bigint) => (seed = (seed * 6364136223846793005n + 1442695040888963407n) % (1n << 64n)) % m;
  let agreed = 0;
  for (let i = 0; i < 2000; i++) {
    const min = 1_000_000n + rnd(10n ** 12n);
    const max = min + rnd(min / 20n + 1n) - min / 40n;
    const ref = rnd(3n) === 0n ? null : min + rnd(min / 10n + 1n) - min / 20n;
    const o = negotiate(min, max, ref);
    for (const r of o.rounds) {
      if (r.by === "seller" && r.offer < min && !(o.agreed && r.offer === o.gross)) assert.fail("seller below floor");
      if (r.by === "buyer" && r.offer > max && !(o.agreed && r.offer === o.gross)) assert.fail("buyer above ceiling");
    }
    if (o.agreed) {
      agreed++;
      assert.ok(o.gross >= min && o.gross <= max, `deal ${o.gross} outside [${min}, ${max}]`);
    } else if (max >= min) assert.fail(`overlap [${min}, ${max}] ref ${ref} but no deal: ${o.reason}`);
  }
  assert.ok(agreed > 500);
});

test("agent is deterministic and opens at the documented anchors", () => {
  assert.deepEqual(negotiate(1000_000n, 1100_000n, 1050_000n), negotiate(1000_000n, 1100_000n, 1050_000n));
  assert.equal(openingAsk(1000_000n, null), 1015_000n);
  assert.equal(openingBid(1000_000n, null), 985_000n);
  assert.equal(openingAsk(1000_000n, 900_000n), 1000_000n);
  const none = negotiate(2000n, 1000n, null);
  assert.equal(none.agreed, false);
});

test("deal evaluation: net after fee decides, numbers shown", () => {
  const sell = mandate("sell", 1_000_000_000n, { feeBps: 20, feeRecipient: BROKER });
  const buy = mandate("buy", 1_000_000_000n);
  const r = evaluateDeal(sell, buy, 1_000_000_000n, NOW);
  assert.equal(r.mask, 1n << 15n);
  assert.equal(r.n.sellerNet, 998_000_000n);
  const z = zone(sell, buy);
  assert.equal(z.overlap, false);
  const ok = evaluateDeal(mandate("sell", 990_000_000n, { feeBps: 20, feeRecipient: BROKER }), buy, 1_000_000_000n, NOW);
  assert.equal(ok.mask, 0n);
});

test("deal evaluation flags every pre-chain bit", () => {
  const sell = mandate("sell", 1n, { maker: B, expiry: NOW - 1, counterparty: BROKER, feeBps: 51, feeRecipient: BROKER });
  const buy = mandate("buy", 0n, { amount: 1n, expiry: NOW - 1, counterparty: BROKER, feeBps: 10, feeRecipient: B });
  const r = evaluateDeal(sell, buy, 5n, NOW);
  const keys = decode(r.mask).map((x) => x.key);
  for (const k of ["AMOUNT", "SELF_MATCH", "SELL_EXPIRED", "BUY_EXPIRED", "SELL_COUNTERPARTY", "BUY_COUNTERPARTY", "SELL_FEE", "BUY_FEE", "BUYER_TOTAL"]) assert.ok(keys.includes(k as never), k);
});

test("matching ranks matchable pairs first", () => {
  const book = [mandate("sell", 1_000n), mandate("buy", 2_000n), mandate("buy", 500n, { id: "b2", maker: "0x3333333333333333333333333333333333333333" })];
  const c = matchBook(book, NOW);
  assert.equal(c.length, 2);
  assert.equal(c[0].blocked.length, 0);
  assert.ok(c[1].blocked.some((x) => x.key === "ZONE"));
});

test("EIP-712 type string equals ORDER_TYPEHASH and the digest equals the contract's hashOrder", () => {
  assert.ok(SOL.includes(`"${ORDER_TYPE_STRING}"`), ORDER_TYPE_STRING);
  const o: Order = {
    maker: "0x1111111111111111111111111111111111111111",
    side: 0,
    base: "0x2222222222222222222222222222222222222222",
    quote: "0x3333333333333333333333333333333333333333",
    baseAmount: 40n * 10n ** 18n,
    quoteGross: 7_000_000_000n,
    limitQuote: 6_993_000_000n,
    feeBps: 10,
    feeRecipient: "0x4444444444444444444444444444444444444444",
    counterparty: "0x0000000000000000000000000000000000000000",
    expiry: 1_800_000_000n,
    nonce: 7n,
  };
  // forge test --match-contract DigestFixture -vv (chain 4663, settler at the forge default deploy address)
  assert.equal(orderDigest(4663, "0x5615dEB798BB3E4dFa0139dFa1b3D433Cc23b72f", o), "0xe75790624711bfa07f119ac949ecbab1b2040850c02755c5f634f342220f4de9");
  const round = decodeSigned(encodeSigned(o, "0xabcd", 4663, "0x5615dEB798BB3E4dFa0139dFa1b3D433Cc23b72f"));
  assert.deepEqual(round?.order, o);
});

test("signed limit defaults to the exact deal number, not the private limit", () => {
  const sell = mandate("sell", 900n);
  const o = orderFor(sell, 1000n, { sellerNet: 998n, buyerTotal: 1001n }, 1n, B);
  assert.equal(o.limitQuote, 998n);
  assert.equal(orderFor(sell, 1000n, { sellerNet: 998n, buyerTotal: 1001n }, 1n, B, true).limitQuote, 900n);
  assert.equal(o.counterparty, B);
});
