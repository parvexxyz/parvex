import Link from "next/link";
import { CaBox } from "@/components/site/CaCopy";
import { PageHead, StatusBadge } from "@/components/site/PageHead";
import { BRAND, TOKEN, buyUrl } from "@/config/brand";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  path: "/token",
  title: `${BRAND.symbol} token | Parvex`,
  description: `${BRAND.symbol} on Robinhood Chain: contract address, where it launches, and its planned utility. Parvex works fully without the token.`,
});

export default function TokenPage() {
  return (
    <>
      <PageHead eyebrow={`${BRAND.symbol} · Robinhood Chain`} title={`${BRAND.tokenName} (${BRAND.symbol})`}>
        <p>Parvex works fully without the token: practice, matching, the agent, signing and settlement need none. Utility is planned, not built.</p>
      </PageHead>
      <section className="sheet">
        <div className="wrap grid gap-10 py-14 lg:grid-cols-[1.2fr_1fr]">
          <div className="grid content-start gap-5">
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
          </div>
          <div className="grid content-start gap-4">
            <p className="label">Planned utility</p>
            {[
              ["Desk features", "Saved counterparty lists, order relay between desks and alerts, once they exist."],
              ["Discovery network access", "Listing signed orders on a shared network (Concept today: orders move as files)."],
            ].map(([t, b]) => (
              <div key={t} className="rounded-[10px] bg-[var(--sheet)] p-4">
                <p className="flex items-center gap-2 text-[19px] tracking-[-0.02em]">
                  {t} <StatusBadge status="Concept" />
                </p>
                <p className="small muted mt-1">{b}</p>
              </div>
            ))}
            <p className="small muted">
              No price, return or yield is promised. Holding {BRAND.symbol} gives no share of anything and no fee discount: the settler has no fee for Parvex to discount. Not investment advice. <Link className="underline" href="/method#planned">What is planned</Link>.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
