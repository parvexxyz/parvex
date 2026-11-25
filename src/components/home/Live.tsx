"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { settlerOf } from "@/config/contracts";
import type { AssetsJson } from "@/lib/assets";
import { useJson } from "@/lib/useJson";

type Chain = { block: number | null; time: number | null; gasPriceWei: string | null; ethUsd: { price: number; updatedAt: number; feed: string } | null; readAt: number };

export const ago = (s: number) => {
  const d = Math.max(0, Math.round(Date.now() / 1000 - s));
  return d < 90 ? `${d}s ago` : d < 5400 ? `${Math.round(d / 60)} min ago` : d < 172800 ? `${Math.round(d / 3600)} h ago` : `${Math.round(d / 86400)} d ago`;
};
const usd = (raw: string, dec: number) => (Number(raw) / 10 ** dec).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

/** The reference's logo rail, filled with live Robinhood Chain facts instead of customer logos (rendered twice for a seamless loop). */
export function LiveRail() {
  const chain = useJson<Chain>("/api/chain", 15_000);
  const assets = useJson<AssetsJson>("/api/assets", 120_000);
  const c = chain.data;
  const a = assets.data;
  const priced = (a?.stocks ?? []).filter((s) => s.feeds.some((f) => f.answer)).slice(0, 8);
  const items: { k: string; v: string }[] = [
    { k: "Block", v: c?.block ? c.block.toLocaleString("en-US") : "reading…" },
    { k: "Gas", v: c?.gasPriceWei ? `${(Number(c.gasPriceWei) / 1e9).toFixed(4)} gwei` : "…" },
    { k: "ETH/USD", v: c?.ethUsd ? `$${c.ethUsd.price.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : "…" },
    { k: "Proven stock tokens", v: a ? String(a.stocks.length) : "…" },
    ...priced.map((s) => {
      const f = s.feeds.find((x) => x.answer)!;
      return { k: s.symbol, v: `${usd(f.answer!, f.decimals)}${f.updatedAt ? ` · ${ago(f.updatedAt)}` : ""}` };
    }),
    { k: "Settler", v: settlerOf("mainnet") ? "live" : "not deployed yet" },
  ];
  return (
    <div className="rail" data-testid="live-rail">
      <div className="rail-track">
        {[0, 1].map((dup) => (
          <div key={dup} className="flex gap-16" aria-hidden={dup === 1}>
            {items.map((i) => (
              <span key={i.k} className="rail-item">
                <span className="mono faint">{i.k}</span>
                <b className="num">{i.v}</b>
              </span>
            ))}
          </div>
        ))}
      </div>
      <p className="sr-only">Live from Robinhood Chain through this site&apos;s relay: head block, gas price, Chainlink ETH/USD and Chainlink stock feeds with their update age.</p>
    </div>
  );
}

/** Scroll-spy list beside the cards: the title of the card in view is dark, the rest faint (reference: FeatureCards). */
export function WhyList({ items }: { items: { id: string; title: string }[] }) {
  const [cur, setCur] = useState(items[0].id);
  useEffect(() => {
    const io = new IntersectionObserver(
      (es) => {
        for (const e of es) if (e.isIntersecting) setCur(e.target.id);
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    items.forEach((i) => {
      const el = document.getElementById(i.id);
      if (el) io.observe(el);
    });
    return () => io.disconnect();
  }, [items]);
  return (
    <div className="why-list">
      <p className="label mb-10">Why Parvex</p>
      {items.map((i) => (
        <button key={i.id} type="button" aria-current={cur === i.id} onClick={() => document.getElementById(i.id)?.scrollIntoView({ behavior: "smooth", block: "center" })}>
          {i.title}
        </button>
      ))}
    </div>
  );
}

export type TryTab = { id: string; label: string; tiles: { title: string; body: string; href: string; icon: string }[] };

/** Segmented tabs over tiles (reference: the "built with" block). */
export function TryTabs({ tabs }: { tabs: TryTab[] }) {
  const [t, setT] = useState(tabs[0].id);
  const tab = tabs.find((x) => x.id === t)!;
  return (
    <div>
      <div className="flex justify-center">
        <div className="seg dark" role="tablist" aria-label="Try Parvex as">
          {tabs.map((x) => (
            <button key={x.id} type="button" role="tab" aria-selected={x.id === t} onClick={() => setT(x.id)}>
              {x.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mx-auto mt-10 grid max-w-[1000px] grid-cols-1 gap-3 md:grid-cols-2" key={t}>
        {tab.tiles.map((x, i) => (
          <Link key={x.title} href={x.href} className="tile" data-reveal="" style={{ "--delay": `${i * 70}ms` } as React.CSSProperties}>
            <span className="tile-ico mono text-[20px]" aria-hidden="true">
              {x.icon}
            </span>
            <span className="min-w-0 py-1 pr-2">
              <span className="block text-[18px] leading-tight tracking-[-0.02em]">{x.title}</span>
              <span className="mt-1 block text-[14px] text-[var(--text-2)]">{x.body}</span>
              <span className="go mt-2 inline-block">Try now</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

/** Live carousel of proven stock tokens (reference: case-study carousel with arrows). */
export function AssetCarousel() {
  const { data, error } = useJson<AssetsJson>("/api/assets", 120_000);
  const box = useRef<HTMLDivElement>(null);
  const move = (d: number) => box.current?.scrollBy({ left: d * 340, behavior: "smooth" });
  const list = (data?.stocks ?? []).filter((s) => s.feeds.some((f) => f.answer)).slice(0, 16);
  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <p className="small muted" data-testid="asset-count">
          {data
            ? `${data.stocks.length} stock tokens proven on chain at block ${data.head?.toLocaleString("en-US") ?? "?"}; ${list.length} with a Chainlink price shown here.`
            : error
              ? `Not available right now: ${error}`
              : "Reading Robinhood Chain…"}
        </p>
        <div className="arrows flex shrink-0 gap-2">
          <button type="button" aria-label="Previous" onClick={() => move(-1)}>
            ←
          </button>
          <button type="button" aria-label="Next" onClick={() => move(1)}>
            →
          </button>
        </div>
      </div>
      <div className="carousel mt-6" ref={box} data-testid="asset-carousel">
        {list.length
          ? list.map((s) => {
              const f = s.feeds.find((x) => x.answer)!;
              return (
                <a key={s.address} className="ccard" href={`https://robinhoodchain.blockscout.com/token/${s.address}`} target="_blank" rel="noreferrer">
                  <div className="top">
                    <span className="tick">{s.symbol}</span>
                  </div>
                  <div className="flex flex-1 flex-col p-3.5">
                    <span className="text-[19px] leading-snug tracking-[-0.02em]">{s.name}</span>
                    <span className="num mt-2 text-[13px] text-[var(--text-2)]">
                      {usd(f.answer!, f.decimals)} · Chainlink {f.updatedAt ? ago(f.updatedAt) : ""}
                      {f.stale ? " · stale (market closed?)" : ""}
                    </span>
                    <span className="mono mt-auto pt-4 text-[11px] text-[var(--text-2)]">
                      {s.address.slice(0, 10)}…{s.address.slice(-6)}
                    </span>
                  </div>
                </a>
              );
            })
          : [0, 1, 2, 3].map((i) => (
              <div key={i} className="ccard" aria-hidden="true">
                <div className="top" />
                <div className="h-[110px]" />
              </div>
            ))}
      </div>
    </div>
  );
}
