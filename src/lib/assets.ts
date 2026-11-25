"use client";

import { useMemo } from "react";
import { testTokens, type NetKey } from "@/config/contracts";
import { QUOTE_TOKENS } from "@/config/dex";
import { useJson } from "@/lib/useJson";
import type { Asset } from "@/lib/otc/types";

/* The tradeable universe for the terminal: /api/assets (proven stock tokens + checked quotes) on mainnet, test tokens on a local
   test chain. Testnet: no stock tokens are proven there, so mandates take any token address the visitor pastes (read on chain). */

type FeedJson = { proxy: string; answer: string | null; decimals: number; updatedAt: number | null; stale: boolean | null; kind: string };
type StockJson = { address: string; symbol: string; name: string; decimals: number; feeds: FeedJson[] };
export type AssetsJson = {
  stocks: StockJson[];
  quotes: { address: string; symbol: string; name: string; decimals: number; proof: string; checked: boolean }[];
  ethUsd: { answer: string | null; updatedAt: number | null };
  head: number | null;
  readAt: number;
  complete: boolean;
  candidates: number;
};

export function toAsset(s: StockJson): Asset {
  const f = s.feeds.find((x) => x.answer !== null) ?? null;
  return {
    address: s.address.toLowerCase(),
    symbol: s.symbol,
    name: s.name,
    decimals: s.decimals,
    proof: "Robinhood stock token: beacon proxy code hash, official beacon slot and minted supply checked on chain",
    usd: f && f.answer ? { answer: BigInt(f.answer), decimals: f.decimals, updatedAt: f.updatedAt ?? 0, feed: f.proxy, stale: Boolean(f.stale) } : null,
  };
}

export function useAssets(net: NetKey) {
  const { data, error } = useJson<AssetsJson>("/api/assets", 120_000);
  return useMemo(() => {
    const tests = testTokens(net).map<Asset>((t) => ({ ...t, address: t.address.toLowerCase(), proof: "test token on the local test chain", usd: null }));
    if (tests.length) return { bases: tests.slice(1), quotes: tests.slice(0, 1), data, error, test: true };
    const ethUsd = data?.ethUsd.answer ? BigInt(data.ethUsd.answer) : null;
    const quotes: Asset[] = (data?.quotes ?? QUOTE_TOKENS.map((q) => ({ ...q, checked: false }))).map((q) => ({
      address: q.address.toLowerCase(),
      symbol: q.symbol,
      name: q.name,
      decimals: q.decimals,
      proof: q.proof,
      usd: q.symbol === "USDG" ? { answer: 100_000_000n, decimals: 8, updatedAt: 0, feed: "", stale: false } : ethUsd ? { answer: ethUsd, decimals: 8, updatedAt: data?.ethUsd.updatedAt ?? 0, feed: "0x78f3556b67e17df817d51ef5a990cdaf09e8d3a9", stale: false } : null,
    }));
    const weth = quotes.find((q) => q.symbol === "WETH");
    const bases = [...(data?.stocks ?? []).map(toAsset), ...(weth ? [weth] : [])];
    return { bases, quotes, data, error, test: false };
  }, [data, error, net]);
}

/** Reference gross for `amount` base in quote units from USD feeds (both legs need a price), else null. */
export function referenceGross(base: Asset, quote: Asset, amount: bigint): bigint | null {
  if (!base.usd || !quote.usd || quote.usd.answer <= 0n) return null;
  // amount(base units) * baseUsd / quoteUsd, rescaled to quote decimals
  const num = amount * base.usd.answer * 10n ** BigInt(quote.usd.decimals) * 10n ** BigInt(quote.decimals);
  const den = 10n ** BigInt(base.decimals) * 10n ** BigInt(base.usd.decimals) * quote.usd.answer;
  return num / den;
}
