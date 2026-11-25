"use client";

import { encodeFunctionData, type Hex } from "viem";
import { useEffect, useMemo, useState } from "react";
import { useWallet } from "@/components/wallet/WalletProvider";
import { useWalletModal } from "@/components/wallet/WalletButton";
import { NETWORKS, explorerAddressOn, explorerTxOn, settlerOf, type NetKey } from "@/config/contracts";
import { SETTLER_ABI } from "@/lib/abi";
import { useAssets } from "@/lib/assets";
import { explain, waitForReceipt } from "@/lib/client";
import { decodeSigned } from "@/lib/otc/eip712";
import { fromUnits } from "@/lib/otc/netmath";
import { addLog, clearLog, loadLog, loadSigs, type LogEntry, type SignedEntry } from "@/lib/otc/store";
import { useJson } from "@/lib/useJson";

type Proof = { dealId: string; seller: string; buyer: string; base: string; quote: string; baseAmount: string; quoteGross: string; sellerNet: string | null; sellerFee: string | null; buyerFee: string | null; settledBy: string | null; index: number; block: number; tx: string };
type DeskEvent = { name: string; maker: string; nonce: string | null; orderHash: string | null; block: number; tx: string };
type Desk = { deployed: boolean; settler: string | null; head: number | null; proofs: Proof[]; events: DeskEvent[]; scanned: { fromBlock: number; toBlock: number; gaps: [number, number][]; complete: boolean } | null };

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const KIND: Record<LogEntry["kind"], string> = {
  offer: "Offer",
  agreed: "Agreed",
  "no-deal": "No deal",
  refused: "Refused",
  signed: "Signed",
  approved: "Approved",
  allowance: "Allowance",
  settled: "Settled",
  "practice-settled": "Practice",
  cancelled: "Cancelled",
};

export function Dashboard() {
  const { address, net, setNet, onChain, sendTransaction, switchNetwork } = useWallet();
  const { open } = useWalletModal();
  const [tick, setTick] = useState(0);
  const desk = useJson<Desk>(`/api/desk?net=${net}${tick ? `&fresh=${tick}` : ""}`, 15_000);
  const { bases, quotes } = useAssets(net);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [sigs, setSigs] = useState<SignedEntry[]>([]);
  const [filter, setFilter] = useState<"all" | "offers" | "approvals" | "refusals" | "settled">("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const read = () => {
      setLog(loadLog().slice().reverse());
      setSigs(loadSigs().slice().reverse());
    };
    read();
    window.addEventListener("px-log", read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener("px-log", read);
      window.removeEventListener("storage", read);
    };
  }, []);

  const tokens = useMemo(() => new Map([...bases, ...quotes].map((a) => [a.address.toLowerCase(), a])), [bases, quotes]);
  const amt = (token: string, raw: string | null) => {
    if (raw === null) return "…";
    const t = tokens.get(token.toLowerCase());
    return t ? `${fromUnits(BigInt(raw), t.decimals, 4)} ${t.symbol}` : `${raw} units of ${short(token)}`;
  };
  const settler = settlerOf(net);
  const shown = log.filter((e) =>
    filter === "all" ? true : filter === "offers" ? ["offer", "agreed", "no-deal"].includes(e.kind) : filter === "approvals" ? ["signed", "approved", "allowance", "cancelled"].includes(e.kind) : filter === "refusals" ? e.kind === "refused" : ["settled", "practice-settled"].includes(e.kind),
  );
  const mySigs = sigs.filter((s) => s.net === net && address && String(s.order.maker).toLowerCase() === address.toLowerCase());

  async function send(label: string, data: Hex) {
    if (!settler) return;
    if (!address) return open();
    if (!onChain) return switchNetwork();
    setBusy(label);
    setMsg(null);
    try {
      const hash = await sendTransaction({ to: settler, data });
      const rc = await waitForReceipt(hash, 180_000, net);
      if (!rc.ok) throw new Error(`${label} reverted.`);
      addLog({ kind: "cancelled", net, title: label, detail: `by ${short(address)}`, tx: hash });
      setTick(Date.now());
      setMsg(`${label}: confirmed in block ${rc.blockNumber}.`);
    } catch (e) {
      setMsg(explain(e));
    } finally {
      setBusy(null);
    }
  }

  const d = desk.data;
  return (
    <div className="grid gap-4" data-testid="dashboard">
      <div className="pane flex flex-wrap items-center gap-3 px-3 py-2.5">
        <div className="seg" role="tablist" aria-label="Network">
          {(["mainnet", "testnet"] as NetKey[]).map((k) => (
            <button key={k} type="button" role="tab" aria-selected={net === k} onClick={() => setNet(k)}>
              {NETWORKS[k].name}
            </button>
          ))}
        </div>
        <span className="small muted">
          {settler ? (
            <>
              Settler{" "}
              <a className="underline" href={explorerAddressOn(net, settler)} target="_blank" rel="noreferrer">
                {short(settler)}
              </a>
              {d?.scanned ? ` · logs read from block ${d.scanned.fromBlock.toLocaleString("en-US")} to ${d.scanned.toBlock.toLocaleString("en-US")}${d.scanned.complete ? "" : ` · ${d.scanned.gaps.length} unread ranges`}` : ""}
            </>
          ) : (
            `No settler deployed on ${NETWORKS[net].name} yet: no proofs to read. Practice results below stay in this browser.`
          )}
        </span>
      </div>

      <div className="pane" data-testid="proofs">
        <div className="pane-h">
          <span>Settlement proofs · from chain logs</span>
          {settler ? <span className="badge live">Live from chain</span> : <span className="text-[11px]">not deployed</span>}
        </div>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>#</th>
                <th>Seller → Buyer</th>
                <th>Asset</th>
                <th className="text-right">Gross</th>
                <th className="text-right">Seller net</th>
                <th className="text-right">Fees (seller / buyer)</th>
                <th>Tx</th>
              </tr>
            </thead>
            <tbody>
              {(d?.proofs ?? []).map((p) => (
                <tr key={p.dealId} data-testid="proof-row">
                  <td>{p.index}</td>
                  <td className="code">
                    {short(p.seller)} → {short(p.buyer)}
                  </td>
                  <td>{amt(p.base, p.baseAmount)}</td>
                  <td className="text-right">{amt(p.quote, p.quoteGross)}</td>
                  <td className="text-right">{amt(p.quote, p.sellerNet)}</td>
                  <td className="text-right">
                    {amt(p.quote, p.sellerFee)} / {amt(p.quote, p.buyerFee)}
                  </td>
                  <td>
                    <a className="underline" href={explorerTxOn(net, p.tx)} target="_blank" rel="noreferrer">
                      block {p.block.toLocaleString("en-US")}
                    </a>
                  </td>
                </tr>
              ))}
              {!d?.proofs?.length ? (
                <tr>
                  <td colSpan={7} className="text-[var(--text-2)]">
                    {desk.error ? `Could not read the settler's logs: ${desk.error}` : settler ? (d ? "No settlement yet on this network." : "Reading logs…") : "Nothing to show until the settler is deployed on this network."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="pane" data-testid="local-log">
          <div className="pane-h">
            <span>Offers, approvals, refusals · this browser</span>
            <button type="button" className="underline" onClick={clearLog}>
              clear
            </button>
          </div>
          <div className="pane-b">
            <div className="seg mb-3 flex-wrap" role="tablist" aria-label="Filter">
              {(["all", "offers", "approvals", "refusals", "settled"] as const).map((f) => (
                <button key={f} type="button" role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}>
                  {f[0].toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
            <div className="max-h-[520px] overflow-y-auto">
              {shown.slice(0, 120).map((e, i) => (
                <div key={i} className="cond">
                  <span className={e.kind === "refused" || e.kind === "no-deal" ? "no" : "ok"}>{e.kind === "refused" || e.kind === "no-deal" ? "✗" : "•"}</span>
                  <span>
                    <span className="mono mr-2 text-[10.5px]">
                      {KIND[e.kind]} · {e.net}
                    </span>
                    {e.title}
                    <span className="d block">
                      {e.detail} · {new Date(e.at).toISOString().slice(11, 19)} UTC
                      {e.tx && e.net !== "practice" ? (
                        <>
                          {" "}
                          ·{" "}
                          <a className="underline" href={explorerTxOn(e.net as NetKey, e.tx)} target="_blank" rel="noreferrer">
                            tx
                          </a>
                        </>
                      ) : null}
                    </span>
                  </span>
                </div>
              ))}
              {!shown.length ? <p className="small muted">Nothing yet. Open the terminal and pick a pair: every negotiation, refusal and signature lands here.</p> : null}
            </div>
            <p className="small muted mt-3">A refused deal never reaches the chain (a reverted transaction leaves no log), so refusals are kept here from the terminal&apos;s checks.</p>
          </div>
        </div>

        <div className="grid content-start gap-4">
          <div className="pane" data-testid="my-orders">
            <div className="pane-h">Your signed orders on {NETWORKS[net].short}</div>
            <div className="pane-b grid gap-2">
              {!address ? (
                <button type="button" className="btn btn-line btn-sm" onClick={open}>
                  Connect wallet
                </button>
              ) : !mySigs.length ? (
                <p className="small muted">No orders signed by {short(address)} in this browser.</p>
              ) : (
                mySigs.slice(0, 12).map((s, i) => {
                  const o = decodeSigned(JSON.stringify({ v: 1, chainId: 0, settler: "", signature: "0x", order: s.order }))!.order;
                  return (
                    <div key={i} className="flex items-center justify-between gap-2 border-b border-[var(--sline)] pb-2 text-[12.5px]">
                      <span>
                        {o.side === 0 ? "Sell" : "Buy"} · nonce {o.nonce.toString().slice(-6)} · {s.how}
                      </span>
                      <button type="button" className="btn btn-line btn-xs" disabled={busy !== null} onClick={() => send("Cancel order", encodeFunctionData({ abi: SETTLER_ABI, functionName: "cancelOrder", args: [o] }))}>
                        Cancel
                      </button>
                    </div>
                  );
                })
              )}
              {address && settler ? (
                <button type="button" className="btn btn-dark btn-sm mt-2" style={{ color: "#fff" }} disabled={busy !== null} onClick={() => send("Cancel all my orders so far", encodeFunctionData({ abi: SETTLER_ABI, functionName: "cancelUpTo", args: [BigInt(Date.now()) * 1000n + 1000n] }))} data-testid="cancel-all">
                  {busy ? "Confirm in wallet…" : "Cancel all my orders so far"}
                </button>
              ) : null}
              {msg ? <p className="note">{msg}</p> : null}
              <p className="small muted">Nonces are time-based, so cancel-all voids every order you signed before this moment, effective for any later transaction.</p>
            </div>
          </div>
          <div className="pane">
            <div className="pane-h">Cancellations &amp; approvals · chain</div>
            <div className="pane-b">
              {(d?.events ?? []).slice(0, 20).map((e, i) => (
                <div key={i} className="kv">
                  <span>
                    {e.name} · {short(e.maker)}
                  </span>
                  <span>
                    <a className="underline" href={explorerTxOn(net, e.tx)} target="_blank" rel="noreferrer">
                      {e.block.toLocaleString("en-US")}
                    </a>
                  </span>
                </div>
              ))}
              {!d?.events?.length ? <p className="small muted">None on this network.</p> : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
