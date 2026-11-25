import Link from "next/link";
import { PageHead, StatusBadge } from "@/components/site/PageHead";
import { SplitTitle } from "@/components/site/SplitTitle";
import { NETWORKS, explorerAddressOn, settlerOf } from "@/config/contracts";
import { ETH_USD_FEED, USDG, WETH } from "@/config/dex";
import { STOCK_BEACON, STOCK_PROXY_CODEHASH } from "@/config/chain";
import { CLOSE_BPS, CONCEDE_BPS, MAX_ROUNDS, OPEN_BPS } from "@/lib/otc/agent";
import { BITS } from "@/lib/otc/bits";
import { ORDER_TYPE_STRING } from "@/lib/otc/eip712";
import { FAQ } from "@/lib/faq";
import { breadcrumbLd, faqLd, ldJson, pageMeta } from "@/lib/seo";
import { TOKEN } from "@/config/brand";

export const metadata = pageMeta({
  path: "/method",
  title: "Method: matching, net math, agent rules and reason bits | Parvex",
  description: "How Parvex matches mandates, computes the seller's net and the buyer's total, how the rule-based agent counters, what the EIP-712 order contains, the 21 reason bits of checkDeal, and what is planned.",
});

const Sec = ({ id, title, status, children }: { id: string; title: string; status?: "Prototype" | "Concept"; children: React.ReactNode }) => (
  <section id={id} className="scroll-mt-28 border-t border-[var(--sline)] py-14">
    <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
      <div>
        <h2 className="h-mid">{title}</h2>
        {status ? <div className="mt-3"><StatusBadge status={status} /></div> : null}
      </div>
      <div className="grid max-w-[820px] gap-4 text-[16px] leading-[1.6] text-[var(--text-2)]">{children}</div>
    </div>
  </section>
);

export default function MethodPage() {
  const main = settlerOf("mainnet");
  const test = settlerOf("testnet");
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={ldJson(breadcrumbLd([{ name: "Method", path: "/method" }]))} />
      <script type="application/ld+json" dangerouslySetInnerHTML={ldJson(faqLd(FAQ))} />
      <PageHead eyebrow="Method" title="How a deal is accepted or refused.">
        <p>Every rule on this page runs in the terminal and, where it touches money, again in the settler contract. Same numbers, same bits.</p>
      </PageHead>
      <section className="sheet">
        <div className="wrap pb-10 pt-6">
          <Sec id="matching" title="Mandates and matching" status="Prototype">
            <p>A mandate is a side (sell or buy), an asset, a quote token, an exact full-fill amount, a hard limit in quote units and an expiry, plus an optional fee to your own recipient and an optional counterparty lock. The seller&apos;s limit is the minimum it receives <b>after</b> its fee; the buyer&apos;s is the maximum it pays <b>including</b> its fee.</p>
            <p>Two mandates match when they are one seller and one buyer, name the same asset, quote and amount, come from different makers, are unexpired, accept each other&apos;s address and have fees within 0.50 %. Their zone of agreement runs from the seller&apos;s minimum gross to the buyer&apos;s maximum gross; when the zone is empty the terminal says so before any agent runs. Partial fills are not supported in v1.</p>
          </Sec>
          <Sec id="net" title="Net math" status="Prototype">
            <p className="code text-[var(--text)]">fee = floor(gross × bps / 10,000) · seller net = gross − seller fee · buyer total = gross + buyer fee</p>
            <p>Minimum gross for a seller net m: ((m − 1) × 10,000) / (10,000 − bps) + 1. Maximum gross for a buyer total M: ((M + 1) × 10,000 − 1) / (10,000 + bps). Both are tight: one unit less (or more) breaks the limit. They are fuzz-tested in Solidity and swept in TypeScript.</p>
            <p>Example: 1,000 USDG gross with a 20 bps seller fee nets 998.000000, so a 1,000 floor refuses it; the smallest gross that clears it is 1,002.004008. Amounts are integers in each token&apos;s own decimals; nothing is rounded through floating point.</p>
          </Sec>
          <Sec id="agent" title="The agent" status="Prototype">
            <p>Deterministic code, not a language model. Each side&apos;s agent knows only its own bound and the other side&apos;s last offer.</p>
            <ol className="list-decimal grid gap-2 pl-5">
              <li>Opening: with a Chainlink price for the asset, the seller asks the reference + {Number(OPEN_BPS) / 100} % and the buyer bids reference − {Number(OPEN_BPS) / 100} %; without one, each opens {Number(OPEN_BPS) / 100} % outside its own bound. Clamped to the bound.</li>
              <li>Each round the seller, then the buyer, moves {Number(CONCEDE_BPS) / 100} % of the gap toward the other, never past its bound.</li>
              <li>A bid that reaches the ask is accepted at the ask; an ask that reaches the bid at the bid. Under a {Number(CLOSE_BPS) / 100} % gap, the side whose limit allows it accepts.</li>
              <li>Both at their bounds without crossing, or {MAX_ROUNDS} rounds: no agreement, and it says why.</li>
            </ol>
            <p>It proposes; it never signs. A test runs 2,000 random limit pairs and checks that no offer ever crosses a bound and that every overlapping pair agrees.</p>
          </Sec>
          <Sec id="orders" title="Orders and signatures" status="Prototype">
            <p>When both sides accept, each wallet signs an EIP-712 order (domain &quot;Parvex Mandate Settler&quot;, version 1, the chain id and the settler address):</p>
            <p className="code text-[var(--text)]">{ORDER_TYPE_STRING}</p>
            <p>The signed limit is, by default, the deal&apos;s own number for that side (the seller&apos;s exact net, the buyer&apos;s exact total), so your wider private limit never leaves your device. The other maker is locked as counterparty when known. Nonces are time-based. A contract wallet can approve an order by transaction instead (ERC-1271 signatures are also accepted). Orders move between two devices through the order board, or as a small JSON file you export and import.</p>
          </Sec>
          <Sec id="bits" title="Reason bits (checkDeal)" status="Prototype">
            <p>checkDeal returns a bitmask; 0 means settle() goes through unless a token misbehaves during the transfer. The terminal shows the same rules before anything is signed.</p>
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Bit</th>
                    <th>Name</th>
                    <th>Meaning</th>
                  </tr>
                </thead>
                <tbody>
                  {BITS.map((b) => (
                    <tr key={b.bit}>
                      <td>{b.bit}</td>
                      <td className="code">R_{b.key}</td>
                      <td>
                        <b className="font-medium text-[var(--text)]">{b.label}.</b> {b.why}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Sec>
          <Sec id="settle" title="Settlement" status="Prototype">
            <p>settle(sell, sellSig, buy, buySig) may be sent by anyone, because both signatures fix every term. It re-runs checkDeal, spends both nonces, then moves the asset seller → buyer, the net buyer → seller and each signed fee buyer → its recipient, all with transferFrom under the makers&apos; own allowances. Every leg is measured by the receiver&apos;s balance change: fee-on-transfer and rebasing tokens revert the whole deal. Tokens that return nothing are accepted; tokens that return false are refused. A reentrancy guard blocks a token from settling another pair mid-transfer.</p>
            <p>Gas, measured: the deploy transaction 1,733,680 (E2E chain, id 4663); settle() of real NVDA stock tokens against USDG with a seller fee 226,696 inside the call on a Robinhood Chain fork (plus the transaction base cost). Paid in ETH.</p>
            <p>The two events Settled and SettledAmounts are the proof of settlement; the dashboard reads them with explorer links.</p>
          </Sec>
          <Sec id="sources" title="Live sources">
            <p>Read live through this site&apos;s relay (its RPC budget is rate limited) or the public endpoints; every number shows its age.</p>
            <ul className="grid gap-2">
              <li>Robinhood Chain (4663) head block and gas; Chainlink ETH/USD <span className="code">{ETH_USD_FEED}</span>.</li>
              <li>Stock tokens: candidates from the beacon&apos;s logs, each proven on chain on every refresh: proxy code hash <span className="code">{STOCK_PROXY_CODEHASH.slice(0, 18)}…</span>, beacon slot = <span className="code">{STOCK_BEACON}</span>, minted supply above zero. Prices from the matching Chainlink stock feeds (heartbeat 24 h, stale outside market hours). Stock tokens are tokens on Robinhood Chain, not the shares themselves.</li>
              <li>Quote tokens: USDG <span className="code">{USDG}</span> and WETH <span className="code">{WETH}</span>, symbol and decimals read on chain. USDG is valued at 1 USD for the reference price only.</li>
              <li>
                Robinhood Chain Testnet (46630): RPC {NETWORKS.testnet.rpc}, explorer {NETWORKS.testnet.explorer} (both answered from this build machine on 25 Nov 2026). No stock tokens are proven there; paste any token address.
              </li>
              <li>
                ParvexMandateSettler: mainnet {main ? <a className="underline" href={explorerAddressOn("mainnet", main)}>{main}</a> : "not deployed yet"}; testnet {test ? <a className="underline" href={explorerAddressOn("testnet", test)}>{test}</a> : "not deployed yet"}.
              </li>
            </ul>
          </Sec>
          <Sec id="review" title="What was checked, and what was not">
            <p>The settler has unit tests for every reason bit, hostile tokens (no-return, false-returning, fee-on-transfer, reentrant, reverting or gas-burning views), ERC-1271 wallets and on-chain approvals; fuzz tests of the net math and of settlement; invariants (the settler never holds a token, supply is conserved, a nonce never settles twice); and fork tests on Robinhood Chain with real NVDA and USDG. It has a written self-review. It has had no outside security review yet: start on the testnet, then small amounts.</p>
            <p>Stock tokens can be paused or blocked by their issuer; a blocked address makes the transfer fail and the whole deal revert.</p>
          </Sec>
          <Sec id="board" title="Order relay board" status="Prototype">
            <p>Signed orders can be posted to an open board instead of passing files. Anyone can read it and take an order into their book. Before listing, the server checks the order: this site&apos;s settler and chain, a valid EIP-712 signature from the maker (EOA), not expiring within a minute, nonce neither used nor cancelled on chain. On every read, expired orders and orders whose nonce the chain reports used (settled) or cancelled are removed. A counter-offer carries the id of the order it answers.</p>
            <p>Limits, all on the server: live orders per wallet (free 3, holder 25), a per-network posting budget, a per-IP rate limit and a cap of 2,000 live orders per network; a full board refuses new posts and never drops existing ones. Storage: the configured KV store, else this server&apos;s memory (the page says so: data may be lost on restart).</p>
          </Sec>
          <Sec id="holder" title="Holder tier" status="Prototype">
            <p>A wallet is a holder when balanceOf(wallet) × 1,000 ≥ totalSupply() of {"$PARVEX"}, both read on Robinhood Chain at each holder action (kept at most 30 s). The session is one EIP-4361 sign-in message (no gas, at most 4 h) checked on every request against a fixed domain list (never the request&apos;s Host header), chain 4663 and its expiry; Sign out revokes its nonce. No server secret exists.{TOKEN.isLive ? null : <> Before the token launches the tier shows &quot;Unlocks at launch&quot; and the free tier works fully.</>}</p>
          </Sec>
          <Sec id="alerts" title="Alerts" status="Prototype">
            <p>Level 1: the bell lists, for the connected wallet, settled deals (Settled events), board orders that match yours, counter-offers, and your orders expiring within 15 minutes, unread since your last look. Level 2: browser notifications while a Parvex tab is open, after you click Enable. Free for everyone and web only: no email, no Telegram, no push service; computed in your browser from public data.</p>
          </Sec>
          <Sec id="planned" title="Planned, not built" status="Concept">
            <ul className="list-disc grid gap-2 pl-5">
              <li>Partial fills and multi-asset baskets.</li>
              <li>ERC-1271 (contract wallet) sign-in for the holder session.</li>
            </ul>
          </Sec>
          <section className="border-t border-[var(--sline)] py-14">
            <SplitTitle className="h-mid" text="Questions" />
            <div className="mt-8 grid gap-6 md:grid-cols-2">
              {FAQ.map((f) => (
                <div key={f.q} data-reveal="">
                  <h3 className="text-[19px] tracking-[-0.02em]">{f.q}</h3>
                  <p className="small mt-2 text-[var(--text-2)]">{f.a}</p>
                </div>
              ))}
            </div>
            <Link href="/terminal" className="btn btn-neon mt-10">
              Open terminal
            </Link>
          </section>
        </div>
      </section>
    </>
  );
}
