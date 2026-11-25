import Link from "next/link";
import { BRAND, hasGithub } from "@/config/brand";
import { NETWORKS, explorerAddressOn, settlerOf } from "@/config/contracts";
import { Wordmark } from "@/components/site/Mark";
import { CaBox } from "@/components/site/CaCopy";

/* The reference's footer: social icons left, two link columns, a closing line with two buttons over the ribbon art, a hairline
   and a mono legal row. */
export function SiteFooter() {
  const main = settlerOf("mainnet");
  return (
    <footer className="ft on-dark" data-testid="footer">
      <div className="ft-art" aria-hidden="true" />
      <div className="wrap relative pb-8 pt-20">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-[1fr_1fr]">
          <div className="min-w-0">
            <Wordmark size={26} />
            <div className="mt-6 flex items-center gap-4">
              <a href={BRAND.x} target="_blank" rel="noreferrer" aria-label={`${BRAND.name} on X`} className="opacity-90">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M18.2 2.25h3.4l-7.4 8.46L23 21.75h-6.8l-5.3-6.93-6.08 6.93H1.4l7.9-9.05L1 2.25h6.97l4.8 6.34 5.43-6.34Zm-1.2 17.5h1.88L7.1 4.15H5.08L17 19.75Z" />
                </svg>
              </a>
              {hasGithub ? (
                <a href={BRAND.github} target="_blank" rel="noreferrer" aria-label="Source code">
                  GitHub
                </a>
              ) : null}
            </div>
            <div className="mt-6 max-w-[440px]">
              <CaBox testid="footer-ca" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-8 text-[13px]">
            <div>
              <p className="faint">Product</p>
              <ul className="mt-4 grid gap-1.5">
                <li><Link href="/terminal">Terminal</Link></li>
                <li><Link href="/dashboard">Dashboard</Link></li>
                <li><Link href="/method">Method</Link></li>
                <li><Link href="/token">{BRAND.symbol}</Link></li>
              </ul>
            </div>
            <div>
              <p className="faint">Chain</p>
              <ul className="mt-4 grid gap-1.5">
                <li>
                  {main ? (
                    <a href={explorerAddressOn("mainnet", main)} target="_blank" rel="noreferrer">
                      Settler {main.slice(0, 6)}…{main.slice(-4)}
                    </a>
                  ) : (
                    <span className="faint">Settler: not deployed yet</span>
                  )}
                </li>
                <li>
                  <a href={NETWORKS.mainnet.explorer} target="_blank" rel="noreferrer">
                    {NETWORKS.mainnet.name} explorer
                  </a>
                </li>
                <li>
                  <a href={NETWORKS.testnet.explorer} target="_blank" rel="noreferrer">
                    Testnet explorer
                  </a>
                </li>
                <li><a href="/llms.txt">llms.txt</a></li>
              </ul>
            </div>
          </div>
        </div>
        <div className="mt-24 grid gap-6 md:grid-cols-[1fr_1fr]">
          <div />
          <div data-reveal="">
            <p className="h-card max-w-[520px] text-[clamp(25px,2.6vw,36px)] font-light leading-[1.15] tracking-[-0.025em]">
              Agree inside your limits. Settle both legs in one transaction.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/terminal" className="btn btn-neon btn-sm">
                Open terminal
              </Link>
              <Link href="/method" className="btn btn-dark btn-sm">
                Read the method
              </Link>
            </div>
          </div>
        </div>
        <div className="mt-16 flex flex-col gap-3 border-t border-[var(--line)] pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13px]">2026 © {BRAND.name}</p>
          <p className="mono text-[11.5px] opacity-80">
            Not affiliated with Robinhood · Not investment advice · Prototype, no outside security review yet
          </p>
        </div>
      </div>
    </footer>
  );
}
