import Link from "next/link";
import { ClientOnly } from "@/components/site/ClientOnly";
import { PageHead, SampleBadge, StatusBadge } from "@/components/site/PageHead";
import { Terminal } from "@/components/terminal/Terminal";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  path: "/terminal",
  title: "OTC terminal | Parvex",
  description: "Enter buyer and seller mandates, watch a rule-based agent counter inside both limits, check the net after fees with every number, then sign and settle both legs in one transaction on Robinhood Chain or its testnet.",
});

export default function TerminalPage() {
  return (
    <>
      <PageHead
        eyebrow="Terminal"
        title="Mandates in, net numbers out."
        actions={
          <>
            <StatusBadge status="Prototype" />
            <SampleBadge label="Practice mandates are sample data" />
            <Link href="/method" className="mono text-[12px] underline underline-offset-4">
              How it decides
            </Link>
          </>
        }
      >
        <p>Pick a seller and a buyer from the book or add your own. The terminal checks the pair, runs both agents, tests the price against the buyer&apos;s maximum total and the seller&apos;s minimum net, and shows what each side would sign.</p>
      </PageHead>
      <section className="sheet tint">
        <div className="wrap py-6 lg:py-8" style={{ maxWidth: 1600 }}>
          <ClientOnly fallback={<div className="pane pane-b small">Loading the terminal…</div>}>
            <Terminal />
          </ClientOnly>
        </div>
      </section>
    </>
  );
}
