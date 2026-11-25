/*
 * The negotiation agent: a deterministic, rule-based assistant (no language model). Each side's agent knows ONLY its own bound
 * (the seller's minimum gross, the buyer's maximum gross) and the other side's last offer. It never offers past its own bound, so
 * nothing it proposes can break its mandate. Same inputs, same rounds, every time.
 *
 * Rules:
 *   1. Opening. With a reference price (a Chainlink feed for the asset, when one exists), the seller asks reference + OPEN_BPS and
 *      the buyer bids reference − OPEN_BPS. Without one, each opens OPEN_BPS outside its own bound. Both are clamped to the bound.
 *   2. Each round the seller, then the buyer, moves CONCEDE_BPS of the gap toward the other's last offer, clamped to its bound.
 *   3. When a new bid reaches the standing ask, the buyer accepts the ask; when a new ask reaches the standing bid, the seller
 *      accepts the bid. When the gap left is within CLOSE_BPS (0.05 %) of the ask, the side whose limit allows it accepts the
 *      other's number (the seller a bid above its floor, the buyer an ask under its ceiling). The accepted number is the deal's gross price.
 *   4. When both sides sit at their bounds and still do not cross, or after MAX_ROUNDS, the agents stop: no agreement.
 */

export const OPEN_BPS = 150n;
export const CONCEDE_BPS = 4000n;
export const MAX_ROUNDS = 12;
export const CLOSE_BPS = 5n;

export type Round = { round: number; by: "seller" | "buyer"; offer: bigint; gap: bigint; rule: string };
export type Outcome = { agreed: true; gross: bigint; by: "seller" | "buyer"; rounds: Round[] } | { agreed: false; reason: string; rounds: Round[] };

const clampUp = (v: bigint, floor: bigint) => (v < floor ? floor : v);
const clampDown = (v: bigint, ceil: bigint) => (v > ceil ? ceil : v);

export function openingAsk(minGross: bigint, reference: bigint | null) {
  const anchor = reference && reference > 0n ? reference : minGross;
  return clampUp((anchor * (10_000n + OPEN_BPS)) / 10_000n, minGross);
}

export function openingBid(maxGross: bigint, reference: bigint | null) {
  const anchor = reference && reference > 0n ? reference : maxGross;
  return clampDown((anchor * (10_000n - OPEN_BPS)) / 10_000n, maxGross);
}

/** Seller's next ask, seeing only its own floor and the buyer's last bid. */
export function nextAsk(ask: bigint, bid: bigint, minGross: bigint) {
  if (bid >= ask) return ask;
  return clampUp(ask - ((ask - bid) * CONCEDE_BPS) / 10_000n, minGross);
}

/** Buyer's next bid, seeing only its own ceiling and the seller's last ask. */
export function nextBid(bid: bigint, ask: bigint, maxGross: bigint) {
  if (bid >= ask) return bid;
  return clampDown(bid + ((ask - bid) * CONCEDE_BPS) / 10_000n + 1n, maxGross);
}

export function negotiate(minGross: bigint, maxGross: bigint, reference: bigint | null = null): Outcome {
  const rounds: Round[] = [];
  if (maxGross <= 0n) return { agreed: false, reason: "The buyer's budget is zero after fees.", rounds };
  let ask = openingAsk(minGross, reference);
  rounds.push({ round: 0, by: "seller", offer: ask, gap: 0n, rule: reference ? "opens 1.5 % above the reference price, not below its floor" : "opens 1.5 % above its floor" });
  let bid = openingBid(maxGross, reference);
  if (bid >= ask) {
    rounds.push({ round: 0, by: "buyer", offer: ask, gap: 0n, rule: "the opening ask is inside its ceiling: accepts it" });
    return { agreed: true, gross: ask, by: "buyer", rounds };
  }
  rounds.push({ round: 0, by: "buyer", offer: bid, gap: ask - bid, rule: reference ? "opens 1.5 % below the reference price, not above its ceiling" : "opens 1.5 % below its ceiling" });
  for (let r = 1; r <= MAX_ROUNDS; r++) {
    const a2 = nextAsk(ask, bid, minGross);
    if (a2 <= bid) {
      rounds.push({ round: r, by: "seller", offer: bid, gap: 0n, rule: "the standing bid clears its floor: accepts it" });
      return { agreed: true, gross: bid, by: "seller", rounds };
    }
    if ((a2 - bid) * 10_000n <= a2 * CLOSE_BPS && bid >= minGross) {
      rounds.push({ round: r, by: "seller", offer: bid, gap: 0n, rule: "the gap is under 0.05 % and the bid clears its floor: accepts it" });
      return { agreed: true, gross: bid, by: "seller", rounds };
    }
    rounds.push({ round: r, by: "seller", offer: a2, gap: a2 - bid, rule: a2 === minGross ? "moves 40 % toward the bid, stops at its floor" : "moves 40 % toward the bid" });
    const b2 = nextBid(bid, a2, maxGross);
    if (b2 >= a2) {
      rounds.push({ round: r, by: "buyer", offer: a2, gap: 0n, rule: "the ask is inside its ceiling: accepts it" });
      return { agreed: true, gross: a2, by: "buyer", rounds };
    }
    if ((a2 - b2) * 10_000n <= a2 * CLOSE_BPS && a2 <= maxGross) {
      rounds.push({ round: r, by: "buyer", offer: a2, gap: 0n, rule: "the gap is under 0.05 % and the ask is inside its ceiling: accepts it" });
      return { agreed: true, gross: a2, by: "buyer", rounds };
    }
    rounds.push({ round: r, by: "buyer", offer: b2, gap: a2 - b2, rule: b2 === maxGross ? "moves 40 % toward the ask, stops at its ceiling" : "moves 40 % toward the ask" });
    if (a2 === ask && b2 === bid) {
      return { agreed: false, reason: "Both agents are at their limits and the prices still do not meet. The limits do not overlap.", rounds };
    }
    ask = a2;
    bid = b2;
  }
  return { agreed: false, reason: `No agreement after ${MAX_ROUNDS} rounds. Widen a limit or start again.`, rounds };
}
