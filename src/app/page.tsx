import Link from "next/link";
import { AssetCarousel, LiveRail, TryTabs, WhyList, type TryTab } from "@/components/home/Live";
import { CaBox } from "@/components/site/CaCopy";
import { SampleBadge, StatusBadge } from "@/components/site/PageHead";
import { SplitTitle } from "@/components/site/SplitTitle";
import { BRAND } from "@/config/brand";
import { negotiate } from "@/lib/otc/agent";
import { buyerTotal, fromUnits, maxGrossForBudget, minGrossForNet, sellerNet } from "@/lib/otc/netmath";
import { appLd, faqLd, ldJson } from "@/lib/seo";
import { FAQ } from "@/lib/faq";

/*
 * Home in the UI reference's order: full-height hero over the ribbon art -> live rail -> dot field -> white sheet with the split
 * intro -> sticky "why" list beside four product cards -> dark sphere section -> tabs of tiles -> live asset carousel -> arrow list
 * of features -> three link cards -> footer. Every number in the cards is computed here by the same code the terminal runs, on a
 * sample mandate pair (labelled), and the agent trace is a real run of src/lib/otc/agent.ts.
 */

const U = (v: number) => BigInt(Math.round(v * 1e6));
const SELL_MIN_NET = U(7000);
const SELL_FEE = 10;
const BUY_MAX_TOTAL = U(7060);
const BUY_FEE = 0;
const REF = U(7030);
const minG = minGrossForNet(SELL_MIN_NET, SELL_FEE);
const maxG = maxGrossForBudget(BUY_MAX_TOTAL, BUY_FEE);
const run = negotiate(minG, maxG, REF);
const gross = run.agreed ? run.gross : REF;
const sn = sellerNet(gross, SELL_FEE);
const bt = buyerTotal(gross, BUY_FEE);
const q = (v: bigint) => fromUnits(v, 6, 2);

const WHY = [
  { id: "why-mandate", title: "Private mandates" },
  { id: "why-net", title: "Net after fees" },
  { id: "why-agent", title: "A bounded agent" },
  { id: "why-settle", title: "One atomic swap" },
];

const TABS: TryTab[] = [
  {
    id: "seller",
    label: "Seller",
    tiles: [
      { title: "Set a minimum net", body: "Enter the least you will receive after your own fee. The terminal turns it into a minimum gross price.", href: "/terminal?side=sell", icon: "↓" },
      { title: "See why a bid fails", body: "A 1,000 gross bid under a 20 bps fee nets 998. Your 1,000 floor refuses it, with the numbers.", href: "/terminal?pair=floor", icon: "≥" },
    ],
  },
  {
    id: "buyer",
    label: "Buyer",
    tiles: [
      { title: "Set a maximum total", body: "Your budget includes your own fee. Anything above it is refused before you sign.", href: "/terminal?side=buy", icon: "↑" },
      { title: "Lock a counterparty", body: "Name the one wallet you will trade with; any other match is refused on chain.", href: "/terminal?pair=locked", icon: "⊙" },
    ],
  },
  {
    id: "agent",
    label: "Agent",
    tiles: [
      { title: "Watch the rounds", body: "Each side's agent sees only its own limit and the other's last offer, and never offers past its limit.", href: "/terminal", icon: "⇄" },
      { title: "When limits do not meet", body: "Both agents stop at their limits and say so. No deal is forced.", href: "/terminal?pair=gap", icon: "≠" },
    ],
  },
  {
    id: "proof",
    label: "Proof",
    tiles: [
      { title: "Settlement proofs", body: "Every settled deal is a Settled event with both legs and fees, linked to the explorer.", href: "/dashboard", icon: "✓" },
      { title: "Reason bits", body: "21 refusal reasons, the same on this site and in the contract's checkDeal view.", href: "/method#bits", icon: "#" },
    ],
  },
];

const FEATURES: { t: string; s: "Prototype" | "Concept"; href?: string }[] = [
  { t: "Mandate book (buyer and seller)", s: "Prototype", href: "/terminal" },
  { t: "Deterministic matching", s: "Prototype", href: "/method#matching" },
  { t: "Net-after-fee checks", s: "Prototype", href: "/method#net" },
  { t: "Rule-based counter-offer agent", s: "Prototype", href: "/method#agent" },
  { t: "EIP-712 orders, exact terms", s: "Prototype", href: "/method#orders" },
  { t: "checkDeal pre-check (21 bits)", s: "Prototype", href: "/method#bits" },
  { t: "Atomic settle, both legs or none", s: "Prototype", href: "/method#settle" },
  { t: "Cancel one order or all below a nonce", s: "Prototype", href: "/dashboard" },
  { t: "Robinhood Chain Testnet", s: "Prototype", href: "/terminal" },
  { t: "Signed order hand-off as a file", s: "Prototype", href: "/terminal" },
  { t: "Order relay board (post, take, withdraw)", s: "Prototype", href: "/terminal#board" },
  { t: "Alerts: bell + browser notifications", s: "Prototype", href: "/method#alerts" },
  { t: `${BRAND.symbol} holder tier (0.1 % of supply)`, s: "Prototype", href: "/token" },
  { t: "Partial fills", s: "Concept", href: "/method#planned" },
];

export default function Home() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={ldJson(appLd)} />
      <script type="application/ld+json" dangerouslySetInnerHTML={ldJson(faqLd(FAQ))} />
      <section className="hero on-dark" data-testid="hero">
        <div className="hero-art" aria-hidden="true" />
        <div className="orb" style={{ left: "46%", top: "48%" }} aria-hidden="true" />
        <div className="orb" style={{ left: "12%", top: "22%", width: 60, height: 60 }} aria-hidden="true" />
        <div className="wrap relative">
          <div className="mb-8 flex flex-wrap items-center gap-2">
            <StatusBadge status="Prototype" />
            <span className="mono text-[12px] opacity-80">OTC negotiation · Robinhood Chain</span>
          </div>
          <div className="hero-grid">
            <SplitTitle as="h1" className="h-hero" text={BRAND.slogan} accent={["clear", "limits"]} />
            <div className="max-w-[440px]" data-reveal="" style={{ "--delay": "500ms" } as React.CSSProperties}>
              <p className="lede">
                {BRAND.tagline} Buyer and seller enter limits, a rule-based agent counters inside both, and you see every number before your wallet signs.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link href="/terminal" className="btn btn-neon" data-testid="hero-cta">
                  Open terminal
                </Link>
                <Link href="/method" className="btn btn-dark">
                  Read the method
                </Link>
              </div>
              <div className="mt-6">
                <CaBox testid="hero-ca" compact />
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="relative">
        <LiveRail />
        <div className="dots" aria-hidden="true" />
      </div>

      <section className="sheet" id="intro">
        <div className="wrap sec">
          <div className="two items-start">
            <p className="max-w-[340px] text-[clamp(20px,1.9vw,26.5px)] leading-[1.35] tracking-[-0.025em]" data-reveal="">
              A block trade on a pool moves the price. A deal in chat moves slowly, and the number that looks right may not clear the seller&apos;s fees.
            </p>
            <SplitTitle className="h-sec" text="Built for both sides, settled in one swap" accent={["one", "swap"]} />
          </div>

          <div className="why mt-28">
            <WhyList items={WHY} />
            <div>
              <article id="why-mandate" className="why-card" data-reveal="">
                <div className="art-box">
                  <div className="glass">
                    <div className="flex items-center justify-between gap-2">
                      <span className="mono text-[12px]">Mandate pair · 40 NVDA / USDG</span>
                      <SampleBadge />
                    </div>
                    {[
                      { k: "Seller minimum gross (net 7,000 + 10 bps fee)", v: minG, w: 72, neon: false },
                      { k: "Agreed gross price", v: gross, w: 80, neon: true },
                      { k: "Buyer maximum gross (total 7,060)", v: maxG, w: 92, neon: false },
                    ].map((r) => (
                      <div key={r.k} className="mt-4">
                        <p className="mono text-[11.5px] text-[var(--text-2)]">{r.k}</p>
                        <div className="mt-2 flex items-center gap-3">
                          <div className="bar flex-1">
                            <i className={r.neon ? "neon" : ""} style={{ "--w": `${r.w}%` } as React.CSSProperties} />
                          </div>
                          <span className="num text-[22px] tracking-[-0.03em]">{q(r.v)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <h3 className="h-card mt-6 flex flex-wrap items-center gap-3">
                  Your limit stays on your device. <StatusBadge status="Prototype" />
                </h3>
                <p className="lede muted mt-3 max-w-[570px]">
                  A mandate is asset, amount, price limit and expiry. It lives in your browser. When you sign, the order carries the deal&apos;s own number for your side by default, not your wider limit.
                </p>
              </article>

              <article id="why-net" className="why-card" data-reveal="">
                <div className="art-box alt">
                  <div className="glass">
                    <div className="flex items-center justify-between gap-2">
                      <span className="mono text-[12px]">Net receipt · USDG</span>
                      <SampleBadge />
                    </div>
                    <div className="mt-3">
                      {[
                        ["Gross price", q(gross)],
                        ["Seller fee 10 bps (to the seller's own broker)", `− ${q(sn.fee)}`],
                        ["Seller receives", q(sn.net)],
                        ["Buyer fee 0 bps", `+ ${q(bt.fee)}`],
                        ["Buyer pays", q(bt.total)],
                        ["Parvex fee", "0.00"],
                      ].map(([k, v]) => (
                        <div key={k} className="kv">
                          <span>{k}</span>
                          <span>{v}</span>
                        </div>
                      ))}
                    </div>
                    <p className="note mt-4">1,000 gross under a 20 bps fee nets 998.00, so a 1,000 floor refuses it. The minimum gross for that floor is 1,002.004008.</p>
                  </div>
                </div>
                <h3 className="h-card mt-6 flex flex-wrap items-center gap-3">
                  The seller&apos;s minimum is a net number. <StatusBadge status="Prototype" />
                </h3>
                <p className="lede muted mt-3 max-w-[570px]">Every fee is floored integer math in the token&apos;s own units, the same on this page and in the contract. Each side may sign a fee of up to 0.50 % to its own recipient. Parvex takes nothing.</p>
              </article>

              <article id="why-agent" className="why-card" data-reveal="">
                <div className="art-box">
                  <div className="glass dark typing" data-reveal="">
                    <p className="mono text-[12px] text-[var(--neon)]">agent trace · deterministic · no model</p>
                    <div className="mt-3 grid gap-1 font-mono text-[12px] leading-[1.55]">
                      {run.rounds.slice(0, 9).map((r, i) => (
                        <span key={i} className="ln" style={{ "--i": i } as React.CSSProperties}>
                          r{r.round} {r.by.padEnd(6)} {q(r.offer).padStart(9)} <span className="faint">{r.rule}</span>
                        </span>
                      ))}
                      <span className="ln caret" style={{ "--i": Math.min(9, run.rounds.length) } as React.CSSProperties}>
                        {run.agreed ? `agreed ${q(run.gross)} USDG gross` : run.reason}
                      </span>
                    </div>
                  </div>
                </div>
                <h3 className="h-card mt-6 flex flex-wrap items-center gap-3">
                  An agent that cannot cross your line. <StatusBadge status="Prototype" />
                </h3>
                <p className="lede muted mt-3 max-w-[570px]">The agent is plain rules: open near the feed price, move 40 % of the gap each round, stop at your limit. It proposes; it never signs. Same inputs, same rounds, every time.</p>
              </article>

              <article id="why-settle" className="why-card" data-reveal="">
                <div className="art-box alt">
                  <div className="glass">
                    <span className="mono text-[12px]">settle(sell, sig, buy, sig)</span>
                    <ol className="mt-3 grid gap-2 text-[14px]">
                      {["checkDeal = 0 (21 reasons, all clear)", "both nonces spent before any token call", "40 NVDA: seller → buyer, delta checked", `${q(sn.net)} USDG: buyer → seller, delta checked`, `${q(sn.fee)} USDG: buyer → seller's fee recipient`, "Settled + SettledAmounts events = the proof"].map((s, i) => (
                        <li key={s} className="flex gap-3">
                          <span className="mono text-[11px] text-[var(--text-2)]">0{i + 1}</span>
                          <span>{s}</span>
                        </li>
                      ))}
                    </ol>
                    <p className="mono mt-4 text-[11px] text-[var(--text-2)]">Fork test on real NVDA and USDG: 226,696 gas in the call</p>
                  </div>
                </div>
                <h3 className="h-card mt-6 flex flex-wrap items-center gap-3">
                  Both legs or nothing. <StatusBadge status="Prototype" />
                </h3>
                <p className="lede muted mt-3 max-w-[570px]">Both wallets sign the exact terms. One transaction moves the asset and the payment with transferFrom, or reverts and moves nothing. The contract never holds a balance.</p>
              </article>
            </div>
          </div>
        </div>
      </section>

      <section className="darksec on-dark -mt-6 pt-6">
        <div className="sphere" aria-hidden="true" />
        <div className="wrap sec relative">
          <div className="grid gap-12 lg:grid-cols-[1fr_1fr]">
            <div>
              <p className="label neon">On chain</p>
              <SplitTitle className="h-sec mt-8" text="Limits checked on chain, not just on screen" accent={["on", "chain,"]} />
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/method#bits" className="btn btn-neon btn-sm">
                  Reason bits
                </Link>
                <Link href="/method#review" className="btn btn-dark btn-sm">
                  Self-review
                </Link>
              </div>
            </div>
            <div className="grid gap-10">
              {[
                ["Non-custodial", "Tokens stay in each wallet until the settle transaction. The settler has no payable function, no owner, no admin and no upgrade."],
                ["Exact amounts", "Every leg is measured by the receiver's balance change. Fee-on-transfer and rebasing tokens are refused; nothing moves."],
                ["Expiry, nonce, cancel", "Each order expires, spends its nonce once, and can be cancelled alone or all below a nonce, effective for any later transaction."],
                ["Seen before signing", "checkDeal returns every reason a deal would fail, so the terminal shows refusals before a wallet opens. A reverted transaction leaves no log."],
              ].map(([t, b], i) => (
                <div key={t} data-reveal="" style={{ "--delay": `${i * 80}ms` } as React.CSSProperties}>
                  <p className="h-card flex items-center gap-2">
                    <span className="feat-ico" aria-hidden="true">
                      ◆
                    </span>
                    {t}
                  </p>
                  <p className="small muted mt-2 max-w-[470px]">{b}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-32">
            <SplitTitle className="h-mid text-center" text="Try it with sample mandates" />
            <p className="small muted mx-auto mt-3 max-w-[520px] text-center">Practice mode runs entirely in your browser. No wallet, no token, no transaction.</p>
            <div className="mt-8">
              <TryTabs tabs={TABS} />
            </div>
          </div>
        </div>
      </section>

      <section className="sheet tint -mt-6">
        <div className="wrap sec">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <SplitTitle className="h-sec max-w-[760px]" text="Assets proven on Robinhood Chain" accent={["proven"]} />
            <p className="small muted max-w-[420px]" data-reveal="">
              Stock tokens are tokens on Robinhood Chain, not the shares themselves. A ticker proves nothing: each one here passed the beacon-proxy, beacon-slot and minted-supply checks on chain.
            </p>
          </div>
          <div className="mt-12">
            <AssetCarousel />
          </div>

          <div className="mt-28 grid gap-10 lg:grid-cols-[1fr_2fr]">
            <p className="label">Features</p>
            <div className="alist">
              {FEATURES.map((f) =>
                f.href ? (
                  <Link key={f.t} href={f.href}>
                    <span className="flex min-w-0 flex-wrap items-center gap-2">
                      {f.t} <StatusBadge status={f.s} />
                    </span>
                    <span className="arr" aria-hidden="true">
                      →
                    </span>
                  </Link>
                ) : null,
              )}
            </div>
          </div>

          <div className="mt-28 flex items-end justify-between gap-4">
            <h2 className="h-mid">Go deeper</h2>
          </div>
          <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
            {[
              { href: "/terminal", tag: "Prototype", title: "The terminal: mandates, rounds, review, settle", glyph: "⇄" },
              { href: "/dashboard", tag: "Live from chain", title: "Dashboard: offers, approvals and settlement proofs", glyph: "✓" },
              { href: "/method", tag: "Method", title: "Net math, agent rules, reason bits and limits", glyph: "∑" },
            ].map((c, i) => (
              <Link key={c.href} href={c.href} className="lcard" data-reveal="" style={{ "--delay": `${i * 80}ms` } as React.CSSProperties}>
                <div className="img">
                  <span className="text-[64px] font-light text-[var(--neon)]">{c.glyph}</span>
                </div>
                <div className="p-4">
                  <p className="mono text-[11px] text-[var(--text-2)]">{c.tag}</p>
                  <p className="mt-2 text-[19px] leading-snug tracking-[-0.02em]">{c.title}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
