"use client";

import { useEffect, useState } from "react";
import { useWalletModal } from "@/components/wallet/WalletButton";
import { useHolder } from "@/components/holder/useHolder";
import { QUOTAS } from "@/lib/holder/tier";
import { fromUnits } from "@/lib/otc/netmath";

const isAddr = (v: string) => /^0x[0-9a-fA-F]{40}$/.test(v);

/** Connect → sign one gas-free message → the tier read live from the token, with the numbers, and the saved counterparty list. */
export function HolderPanel({ withLists = true }: { withLists?: boolean }) {
  const { address, session, tier, busy, error, signIn, signOut, refresh, call } = useHolder();
  const { open } = useWalletModal();
  const [entries, setEntries] = useState<{ address: string; label: string }[]>([]);
  const [max, setMax] = useState<number | null>(null);
  const [na, setNa] = useState("");
  const [nl, setNl] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!session || !withLists) return;
    call("/api/lists", { action: "get" })
      .then((j) => {
        setEntries(j.entries ?? []);
        setMax(j.max ?? null);
      })
      .catch(() => {});
  }, [session, withLists, call]);

  async function save(next: { address: string; label: string }[]) {
    setMsg(null);
    try {
      const j = await call("/api/lists", { action: "save", entries: next });
      setEntries(j.entries);
      setMax(j.max);
      setMsg({ ok: true, text: "Saved on the server." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Save failed." });
    }
  }

  return (
    <div className="pane" data-testid="holder-panel">
      <div className="pane-h">
        <span>$PARVEX holder tier</span>
        <span className={`badge ${tier?.tier === "holder" ? "proto" : "concept"}`} data-testid="holder-tier">
          {tier ? (tier.tier === "holder" ? "Holder" : "Free") : "Not signed in"}
        </span>
      </div>
      <div className="pane-b grid gap-2.5 text-[13px]">
        {!address ? (
          <button type="button" className="btn btn-line btn-sm" onClick={open}>
            Connect wallet
          </button>
        ) : !session ? (
          <>
            <button type="button" className="btn btn-neon btn-sm" disabled={busy} onClick={signIn} data-testid="holder-sign">
              {busy ? "Sign in wallet…" : "Sign in (one message, no gas)"}
            </button>
            <p className="small muted">A standard sign-in message (EIP-4361), valid 4 h in this tab. The server checks the signature, this site&apos;s fixed domain, chain 4663 and the expiry on every request; Sign out revokes it. EOA wallets only in v1.</p>
          </>
        ) : tier ? (
          <>
            {tier.token ? (
              <>
                <div className="kv"><span>Your balance</span><span className="num" data-testid="holder-balance">{tier.balance ? fromUnits(BigInt(tier.balance), 18, 4) : "—"}</span></div>
                <div className="kv"><span>Threshold (0.1 % of supply)</span><span className="num" data-testid="holder-threshold">{tier.threshold ? fromUnits(BigInt(tier.threshold), 18, 4) : "—"}</span></div>
                <div className="kv"><span>Your share</span><span className="num">{tier.sharePct !== null ? `${tier.sharePct.toFixed(4)} %` : "—"}</span></div>
                <div className="kv"><span>Checked</span><span>{new Date(tier.checkedAt).toISOString().slice(11, 19)} UTC{tier.block ? `, block ${tier.block.toLocaleString("en-US")}` : ""}</span></div>
              </>
            ) : null}
            {tier.note ? <p className="note" data-testid="holder-note">{tier.note}</p> : null}
            <div className="kv"><span>Live orders on the board</span><span>{tier.quotas.liveOrders}</span></div>
            <div className="kv"><span>Saved counterparties</span><span>{tier.quotas.savedCounterparties}</span></div>
            {!tier.persistent ? <p className="rq-alert">Not configured: saved data may be lost on restart (no shared store on this server).</p> : null}
            <div className="flex gap-2">
              <button type="button" className="btn btn-line btn-xs" onClick={() => refresh()}>Re-check</button>
              <button type="button" className="btn btn-line btn-xs" onClick={signOut}>Sign out</button>
            </div>
          </>
        ) : (
          <p className="small muted">{error ?? "Reading your tier…"}</p>
        )}
        {error && session ? <p className="rq-alert">{error}</p> : null}
        <p className="small muted">
          Free: {QUOTAS.free.liveOrders} live orders, {QUOTAS.free.savedCounterparties} saved counterparties. Holder (≥ 0.1 % of supply): {QUOTAS.holder.liveOrders} and {QUOTAS.holder.savedCounterparties}. Everything else is free.
        </p>

        {withLists && session && tier ? (
          <div className="mt-1 grid gap-2" data-testid="cp-list">
            <p className="mono text-[11px]">Saved counterparties {max !== null ? `(${entries.length}/${max})` : ""}</p>
            {entries.map((e) => (
              <div key={e.address} className="flex items-center justify-between gap-2 border-b border-[var(--sline)] pb-1">
                <span className="min-w-0 truncate">
                  {e.label} <span className="code text-[var(--text-2)]">{e.address.slice(0, 8)}…{e.address.slice(-4)}</span>
                </span>
                <button type="button" className="underline" onClick={() => save(entries.filter((x) => x.address !== e.address))}>remove</button>
              </div>
            ))}
            <div className="grid grid-cols-[1fr_90px_auto] gap-1.5">
              <input className="inp" placeholder="0x… address" value={na} onChange={(e) => setNa(e.target.value.trim())} data-testid="cp-address" />
              <input className="inp" placeholder="label" value={nl} onChange={(e) => setNl(e.target.value)} data-testid="cp-label" />
              <button type="button" className="btn btn-line btn-xs" disabled={!isAddr(na)} onClick={() => save([...entries, { address: na, label: nl || "desk" }])} data-testid="cp-add">
                Add
              </button>
            </div>
            {msg ? <p className={msg.ok ? "note" : "rq-alert"} data-testid="cp-msg">{msg.text}</p> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
