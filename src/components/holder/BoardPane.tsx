"use client";

import { useCallback, useEffect, useState } from "react";
import { useHolder } from "@/components/holder/useHolder";
import type { NetKey } from "@/config/contracts";
import type { Listing } from "@/lib/board/rules";

/*
 * The open order relay board: signed orders other desks posted, checked by the server (signature, expiry, nonce on chain) and
 * removed once settled, cancelled or expired. Reading is open to everyone; "Take" imports a listing into your book, where its
 * signed terms fix the price.
 */
export function BoardPane({ net, onTake, symbols }: { net: NetKey; onTake: (signed: string, id: string) => void; symbols: (addr: string) => { symbol: string; decimals: number } | null }) {
  const { address, session, call } = useHolder();
  const [list, setList] = useState<Listing[]>([]);
  const [info, setInfo] = useState<{ persistent: boolean; removed: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/board?net=${net}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setList(j.listings);
      setInfo({ persistent: j.persistent, removed: j.removed });
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Board unavailable.");
    }
  }, [net]);

  useEffect(() => {
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 20_000);
    window.addEventListener("px-board", load);
    return () => {
      clearInterval(t);
      window.removeEventListener("px-board", load);
    };
  }, [load]);

  const fmt = (addr: string, raw: string) => {
    const t = symbols(addr);
    if (!t) return `${raw} units`;
    const v = BigInt(raw);
    const base = 10n ** BigInt(t.decimals);
    const frac = (v % base).toString().padStart(t.decimals, "0").slice(0, 4).replace(/0+$/, "");
    return `${(v / base).toLocaleString("en-US")}${frac ? `.${frac}` : ""} ${t.symbol}`;
  };

  return (
    <div className="pane" id="board" data-testid="board">
      <div className="pane-h">
        <span>Order board · open to all</span>
        <button type="button" className="underline" onClick={load}>refresh</button>
      </div>
      <div className="pane-b grid gap-1.5">
        {info && !info.persistent ? <p className="rq-alert text-[12px]">Not configured: saved data may be lost on restart.</p> : null}
        {err ? <p className="rq-alert">{err}</p> : null}
        {list.map((l) => {
          const mine = address && l.maker === address.toLowerCase();
          return (
            <div key={l.id} className="rounded-md border border-[var(--sline)] px-2 py-1.5 text-[12px]" data-testid="board-row">
              <div className="flex items-center justify-between gap-2">
                <span className={l.side === 0 ? "side-sell" : "side-buy"}>{l.side === 0 ? "SELL" : "BUY"}</span>
                <span className="min-w-0 flex-1 truncate">
                  {fmt(l.base, l.baseAmount)} for {fmt(l.quote, l.quoteGross)}
                </span>
                {mine ? (
                  <button
                    type="button"
                    className="underline"
                    disabled={!session}
                    onClick={() => call("/api/board", { action: "withdraw", net, id: l.id }).then(load).catch((e) => setErr(e.message))}
                  >
                    withdraw
                  </button>
                ) : (
                  <button type="button" className="btn btn-line btn-xs" onClick={() => onTake(l.signed, l.id)} data-testid="board-take">
                    Take
                  </button>
                )}
              </div>
              <span className="text-[11px] text-[var(--text-2)]">
                {l.maker.slice(0, 8)}… · expires {new Date(l.expiry * 1000).toISOString().slice(11, 16)} UTC{/^0x0{40}$/.test(l.counterparty) ? "" : ` · only for ${l.counterparty.slice(0, 8)}…`}
                {l.replyTo ? " · counter-offer" : ""}
              </span>
            </div>
          );
        })}
        {!list.length && !err ? <p className="small muted">No live orders on this network. Sign an order, then post it here.</p> : null}
        <p className="small muted">Reading is free and open. Posting needs a holder session: free tier 3 live orders, holders 25.</p>
      </div>
    </div>
  );
}
