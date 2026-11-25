import Link from "next/link";
import { CaBox } from "@/components/site/CaCopy";
import { ClientOnly } from "@/components/site/ClientOnly";
import { PageHead, StatusBadge } from "@/components/site/PageHead";
import { HolderPanel } from "@/components/holder/HolderPanel";
import { Threshold } from "@/components/holder/Threshold";
import { BRAND, TOKEN, buyUrl } from "@/config/brand";
import { QUOTAS } from "@/lib/holder/tier";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  path: "/token",
  title: `${BRAND.symbol} token | Parvex`,
  description: `${BRAND.symbol} on Robinhood Chain: contract address, the holder tier at 0.1 % of supply read on chain, and what it unlocks. Parvex works fully without the token.`,
});

const ROWS: { t: string; free: string; holder: string; s: "Prototype" | "Concept" }[] = [
  { t: "Live orders on the order relay board", free: `${QUOTAS.free.liveOrders}`, holder: `${QUOTAS.holder.liveOrders}`, s: "Prototype" },
  { t: "Saved counterparties (server-side, per wallet)", free: `${QUOTAS.free.savedCounterparties}`, holder: `${QUOTAS.holder.savedCounterparties}`, s: "Prototype" },
  { t: "Reading the board, taking orders, the terminal, the agent, settlement", free: "Free", holder: "Free", s: "Prototype" },
  { t: "Alerts: bell inbox + browser notifications", free: "Free", holder: "Free", s: "Prototype" },
];

export default function TokenPage() {
  return (
    <>
      <PageHead eyebrow={`${BRAND.symbol} · Robinhood Chain`} title={`${BRAND.tokenName} (${BRAND.symbol})`}>
        <p>A community token. Parvex works fully without it: practice, matching, the agent, signing, settlement and alerts need none. Holding 0.1 % of the supply raises two quotas, nothing more.</p>
      </PageHead>
      <section className="sheet">
        <div className="wrap grid gap-10 py-14 lg:grid-cols-[1.2fr_1fr]">
          <div className="grid content-start gap-5">
            <div className="flex items-center gap-4">
              <img src="/brand/mark-tile.webp?v=dc0b0043" alt={`${BRAND.tokenName} logo`} width={72} height={72} className="rounded-[14px]" data-testid="token-logo" />
              <p className="text-[22px] tracking-[-0.02em]">
                {BRAND.tokenName} <span className="text-[var(--text-2)]">{BRAND.symbol}</span>
              </p>
            </div>
            <p className="label">Contract address</p>
            <CaBox testid="token-ca" />
            <p className="small muted">{TOKEN.isLive ? "This is the only address. Parvex will never DM you first or ask you to send tokens." : "Not launched yet. The address appears here, in the header and in the footer the moment it exists. Launchpad: TBA. Until then, any token claiming to be ours is not."}</p>
            <div className="flex flex-wrap gap-3">
              <a href={buyUrl()} target="_blank" rel="noreferrer" className="btn btn-neon btn-sm">
                {TOKEN.isLive ? "Open on the launchpad" : "At launch"}
              </a>
              {TOKEN.explorerUrl ? (
                <a href={TOKEN.explorerUrl} target="_blank" rel="noreferrer" className="btn btn-line btn-sm">
                  Explorer
                </a>
              ) : null}
            </div>

            <p className="label mt-6">Token features</p>
            <div className="overflow-x-auto">
              <table className="tbl" data-testid="token-features">
                <thead>
                  <tr>
                    <th>Feature</th>
                    <th>Free</th>
                    <th>Holder (≥ 0.1 %)</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {ROWS.map((r) => (
                    <tr key={r.t}>
                      <td>{r.t}</td>
                      <td>{r.free}</td>
                      <td>{r.holder}</td>
                      <td>
                        <StatusBadge status={r.s} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ClientOnly>
              <Threshold />
            </ClientOnly>
            <div className="grid gap-2 text-[15px] text-[var(--text-2)]">
              <p className="text-[var(--text)]">How the check works</p>
              <p>You sign one standard sign-in message (EIP-4361, no gas, valid 4 h in that tab). On every holder request the server checks the signature, this site&apos;s domain from a fixed list, chain 4663 and the expiry, then reads balanceOf(your wallet) and totalSupply() from the token on Robinhood Chain (kept at most 30 s). Holder = balance × 1,000 ≥ supply. Quotas are enforced on the server. No server secret is involved; Sign out revokes the session. EOA wallets only in v1.</p>
              <p>No price, return or yield is promised. Holding {BRAND.symbol} gives no share of anything, no fee discount (Parvex charges no fee) and no rewards. Not investment advice. <Link className="underline" href="/method#holder">Method</Link>.</p>
            </div>
          </div>
          <div className="grid content-start gap-4">
            <p className="label">Your tier</p>
            <ClientOnly fallback={<div className="pane pane-b small">Loading…</div>}>
              <HolderPanel />
            </ClientOnly>
          </div>
        </div>
      </section>
    </>
  );
}
