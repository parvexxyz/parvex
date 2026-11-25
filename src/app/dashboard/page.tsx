import { Dashboard } from "@/components/dashboard/Dashboard";
import { ClientOnly } from "@/components/site/ClientOnly";
import { LiveBadge, PageHead, StatusBadge } from "@/components/site/PageHead";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  path: "/dashboard",
  title: "Dashboard: offers, approvals and settlement proofs | Parvex",
  description: "Settlement proofs read from the Parvex settler's logs on Robinhood Chain and its testnet, with explorer links, plus this browser's offers, signatures, refusals and cancel controls.",
});

export default function DashboardPage() {
  return (
    <>
      <PageHead eyebrow="Dashboard" title="Every offer, every signature, every proof." actions={<><StatusBadge status="Prototype" /><LiveBadge label="Proofs live from chain logs" /></>}>
        <p>Settlements come from the settler&apos;s own events, each linked to its transaction. Offers, refusals and signatures from your terminal stay in this browser.</p>
      </PageHead>
      <section className="sheet tint">
        <div className="wrap py-8">
          <ClientOnly fallback={<div className="pane pane-b small">Loading…</div>}>
            <Dashboard />
          </ClientOnly>
        </div>
      </section>
    </>
  );
}
