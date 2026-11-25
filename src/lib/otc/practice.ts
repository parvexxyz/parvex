import type { Asset, Mandate } from "./types";

/*
 * Sample mandates for practice mode ("Sample data" everywhere they show). Makers are practice names, not wallets. Limits are set
 * around the live Chainlink price when the asset has one (so the numbers look like today's market); without a price they use the
 * fixed sample prices below. Each pair demonstrates one outcome: agreement, a net-after-fee refusal, a counterparty lock, limits
 * that do not overlap, an expired mandate.
 */

const USDG: Asset = { address: "0x5fc5360d0400a0fd4f2af552add042d716f1d168", symbol: "USDG", name: "Global Dollar", decimals: 6, proof: "fixed address", usd: null };
const FALLBACK: Record<string, { asset: Asset; usd: number }> = {
  NVDA: { asset: { address: "0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec", symbol: "NVDA", name: "NVIDIA", decimals: 18, proof: "fixture", usd: null }, usd: 175 },
  AAPL: { asset: { address: "0xaf3d76f1834a1d425780943c99ea8a608f8a93f9", symbol: "AAPL", name: "Apple", decimals: 18, proof: "fixture", usd: null }, usd: 100 },
  TSLA: { asset: { address: "0x322f0929c4625ed5bad873c95208d54e1c003b2d", symbol: "TSLA", name: "Tesla", decimals: 18, proof: "fixture", usd: null }, usd: 400 },
  SPY: { asset: { address: "0x117cc2133c37b721f49de2a7a74833232b3b4c0c", symbol: "SPY", name: "SPDR S&P 500 ETF Trust", decimals: 18, proof: "fixture", usd: null }, usd: 600 },
};

export const PRACTICE_BROKER = "0x000000000000000000000000000000000000b10c";
export const PRACTICE_LOCK = "0x000000000000000000000000000000000000dead";

/** USD price with 6 decimals for `units` whole tokens of `a`, from its feed or the sample price. */
function usd6(a: Asset, fallbackUsd: number, units: number) {
  const per = a.usd && a.usd.answer > 0n ? (a.usd.answer * 1_000_000n) / 10n ** BigInt(a.usd.decimals) : BigInt(Math.round(fallbackUsd * 1e6));
  return per * BigInt(units);
}
const pct = (v: bigint, bps: number) => (v * BigInt(10_000 + bps)) / 10_000n;

export function practiceBook(bases: Asset[], quotes: Asset[], now: number): Mandate[] {
  const usdg = quotes.find((q) => q.symbol === "USDG") ?? USDG;
  const pick = (sym: string) => {
    const live = bases.find((b) => b.symbol === sym);
    return { asset: live ?? FALLBACK[sym].asset, fb: FALLBACK[sym].usd };
  };
  const tok = (a: Asset, n: number) => BigInt(n) * 10n ** BigInt(a.decimals);
  const base = { quote: usdg, feeBps: 0, feeRecipient: "", counterparty: null, expiry: now + 2 * 3600, createdAt: now, source: "sample" as const };
  const out: Mandate[] = [];

  const nv = pick("NVDA");
  const nvRef = usd6(nv.asset, nv.fb, 40);
  out.push({ ...base, id: "s-nvda", label: "Desk 1 sells NVDA", maker: "practice:desk-1", side: "sell", base: nv.asset, amount: tok(nv.asset, 40), limit: pct(nvRef, -50), feeBps: 10, feeRecipient: PRACTICE_BROKER });
  out.push({ ...base, id: "b-nvda", label: "Desk 2 buys NVDA", maker: "practice:desk-2", side: "buy", base: nv.asset, amount: tok(nv.asset, 40), limit: pct(nvRef, 40) });

  const ap = pick("AAPL");
  out.push({ ...base, id: "s-floor", label: "Desk 3 sells AAPL, net floor", maker: "practice:desk-3", side: "sell", base: ap.asset, amount: tok(ap.asset, 10), limit: 1_000_000_000n, feeBps: 20, feeRecipient: PRACTICE_BROKER });
  out.push({ ...base, id: "b-floor", label: "Desk 4 buys AAPL at 1,000", maker: "practice:desk-4", side: "buy", base: ap.asset, amount: tok(ap.asset, 10), limit: 1_000_000_000n });

  const ts = pick("TSLA");
  const tsRef = usd6(ts.asset, ts.fb, 25);
  out.push({ ...base, id: "s-locked", label: "Desk 5 sells TSLA to one buyer", maker: "practice:desk-5", side: "sell", base: ts.asset, amount: tok(ts.asset, 25), limit: pct(tsRef, -40), counterparty: PRACTICE_LOCK });
  out.push({ ...base, id: "b-locked", label: "Desk 6 buys TSLA", maker: "practice:desk-6", side: "buy", base: ts.asset, amount: tok(ts.asset, 25), limit: pct(tsRef, 60) });

  const sp = pick("SPY");
  const spRef = usd6(sp.asset, sp.fb, 12);
  out.push({ ...base, id: "s-gap", label: "Desk 7 sells SPY high", maker: "practice:desk-7", side: "sell", base: sp.asset, amount: tok(sp.asset, 12), limit: pct(spRef, 250) });
  out.push({ ...base, id: "b-gap", label: "Desk 8 bids SPY low", maker: "practice:desk-8", side: "buy", base: sp.asset, amount: tok(sp.asset, 12), limit: pct(spRef, -150) });
  out.push({ ...base, id: "b-expired", label: "Desk 9 bid, expired", maker: "practice:desk-9", side: "buy", base: sp.asset, amount: tok(sp.asset, 12), limit: pct(spRef, 300), expiry: now - 600 });
  return out;
}

export const PAIRS: Record<string, [string, string]> = {
  agree: ["s-nvda", "b-nvda"],
  floor: ["s-floor", "b-floor"],
  locked: ["s-locked", "b-locked"],
  gap: ["s-gap", "b-gap"],
  expired: ["s-gap", "b-expired"],
};
