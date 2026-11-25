"use client";

import { encodeFunctionData, type Hex } from "viem";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MandateForm } from "@/components/terminal/MandateForm";
import { useWallet } from "@/components/wallet/WalletProvider";
import { useWalletModal } from "@/components/wallet/WalletButton";
import { NETWORKS, explorerTxOn, settlerOf, type NetKey } from "@/config/contracts";
import { ERC20_ABI, ERC20_WRITE_ABI, SETTLER_ABI } from "@/lib/abi";
import { referenceGross, useAssets } from "@/lib/assets";
import { ChainError, explain, readMany, rpcCall, waitForReceipt } from "@/lib/client";
import { negotiate } from "@/lib/otc/agent";
import { decode } from "@/lib/otc/bits";
import { decodeSigned, encodeSigned, orderFor, typedData, type Order } from "@/lib/otc/eip712";
import { evaluateDeal, matchBook, pairConditions, zone } from "@/lib/otc/engine";
import { fromUnits } from "@/lib/otc/netmath";
import { PAIRS, practiceBook } from "@/lib/otc/practice";
import { addLog, loadBook, loadSigs, saveBook, saveSigs, type SignedEntry } from "@/lib/otc/store";
import type { Asset, Mandate, MandateSide } from "@/lib/otc/types";

const isAddr = (v: string) => /^0x[0-9a-fA-F]{40}$/.test(v);
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const short = (a: string) => (isAddr(a) ? `${a.slice(0, 6)}…${a.slice(-4)}` : a.replace("practice:", ""));
const ser = (o: Order) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === "bigint" ? v.toString() : v]));
const deser = (o: Record<string, unknown>): Order => decodeSigned(JSON.stringify({ v: 1, chainId: 0, settler: "", signature: "0x", order: o }))!.order;

type ChainCheck = { mask: bigint; at: number; error?: string } | null;
type Funds = { sellerBal: bigint | null; sellerAllow: bigint | null; buyerBal: bigint | null; buyerAllow: bigint | null } | null;

export function Terminal() {
  const { address, net, setNet, onChain, signTypedData, sendTransaction, switchNetwork } = useWallet();
  const { open } = useWalletModal();
  const { bases, quotes, data: assetData, error: assetError, test } = useAssets(net);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [mine, setMine] = useState<Mandate[]>([]);
  const [sigs, setSigs] = useState<SignedEntry[]>([]);
  const [sellId, setSellId] = useState<string>(PAIRS.agree[0]);
  const [buyId, setBuyId] = useState<string>(PAIRS.agree[1]);
  const [preset, setPreset] = useState<MandateSide | null>(null);
  const [practiceOk, setPracticeOk] = useState<{ seller: boolean; buyer: boolean }>({ seller: false, buyer: false });
  const [fullLimit, setFullLimit] = useState(false);
  const [check, setCheck] = useState<ChainCheck>(null);
  const [funds, setFunds] = useState<Funds>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; tx?: string } | null>(null);
  const [importText, setImportText] = useState("");
  const [exported, setExported] = useState<string | null>(null);

  useEffect(() => {
    setMine(loadBook());
    setSigs(loadSigs());
    const q = new URLSearchParams(window.location.search);
    const p = q.get("pair");
    if (p && PAIRS[p]) {
      setSellId(PAIRS[p][0]);
      setBuyId(PAIRS[p][1]);
    }
    const s = q.get("side");
    if (s === "sell" || s === "buy") setPreset(s);
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 15_000);
    return () => clearInterval(t);
  }, []);

  const settler = settlerOf(net);
  const chainId = NETWORKS[net].id;
  const samples = useMemo(() => practiceBook(net === "mainnet" && !test ? bases : [], quotes, now - (now % 3600)), [bases, quotes, net, now, test]);
  const book = useMemo(() => [...mine, ...samples], [mine, samples]);
  const sell = book.find((m) => m.id === sellId && m.side === "sell") ?? null;
  const buy = book.find((m) => m.id === buyId && m.side === "buy") ?? null;
  const candidates = useMemo(() => matchBook(book, now).slice(0, 8), [book, now]);

  const sigFor = useCallback((m: Mandate | null) => (m ? sigs.find((s) => s.mandateId === m.id && s.net === net && settler && same(s.settler, settler)) ?? null : null), [sigs, net, settler]);
  const sellSig = sigFor(sell);
  const buySig = sigFor(buy);

  const analysis = useMemo(() => {
    if (!sell || !buy) return null;
    const z = zone(sell, buy);
    const pre = pairConditions(sell, buy, now);
    const ref = referenceGross(sell.base, sell.quote, sell.amount);
    const run = negotiate(z.minGross, z.maxGross < 0n ? 0n : z.maxGross, ref);
    const locked = sellSig ? BigInt(String(sellSig.order.quoteGross)) : buySig ? BigInt(String(buySig.order.quoteGross)) : null;
    const gross = locked ?? (run.agreed ? run.gross : z.maxGross > 0n ? z.maxGross : 1n);
    const ev = evaluateDeal(sell, buy, gross, now);
    return { z, pre, ref, run, gross, locked, ev };
  }, [sell, buy, now, sellSig, buySig]);

  // Log each negotiation once per pair and price.
  const logKey = analysis && sell && buy ? `${sell.id}|${buy.id}|${analysis.gross}` : "";
  useEffect(() => {
    if (!analysis || !sell || !buy) return;
    const t = `${sell.label} ↔ ${buy.label}`;
    if (analysis.run.agreed && analysis.ev.mask === 0n) addLog({ kind: "agreed", net: "practice", title: t, detail: `Agent agreed ${fromUnits(analysis.gross, sell.quote.decimals)} ${sell.quote.symbol} gross in ${analysis.run.rounds.length} steps` });
    else if (!analysis.run.agreed) addLog({ kind: "no-deal", net: "practice", title: t, detail: analysis.run.reason });
    else addLog({ kind: "refused", net: "practice", title: t, detail: decode(analysis.ev.mask).map((b) => b.label).join(", "), mask: analysis.ev.mask.toString() });
    setPracticeOk({ seller: false, buyer: false });
    setCheck(null);
    setMsg(null);
    setExported(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logKey]);

  const qd = sell?.quote.decimals ?? 6;
  const qs = sell?.quote.symbol ?? "";
  const Q = (v: bigint) => `${fromUnits(v, qd, 6)} ${qs}`;
  const realPair = Boolean(sell && buy && isAddr(sell.maker) && isAddr(buy.maker));
  const iAmSeller = Boolean(address && sell && same(sell.maker, address));
  const iAmBuyer = Boolean(address && buy && same(buy.maker, address));

  /** The order each side signs for the current deal (exact terms, counterparty locked when the other maker is a wallet). */
  const orderOf = useCallback(
    (m: Mandate, other: Mandate): Order | null => {
      if (!analysis || !isAddr(m.maker)) return null;
      const existing = sigFor(m);
      if (existing) return deser(existing.order);
      return orderFor(m, analysis.gross, { sellerNet: analysis.ev.n.sellerNet, buyerTotal: analysis.ev.n.buyerTotal }, BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 1000)), isAddr(other.maker) ? other.maker : null, fullLimit);
    },
    [analysis, sigFor, fullLimit],
  );

  // Live funds for real makers on the selected network.
  useEffect(() => {
    setFunds(null);
    if (!sell || !buy || !settler || !realPair) return;
    let dead = false;
    readMany(
      [
        { to: sell.base.address, abi: ERC20_ABI, fn: "balanceOf", args: [sell.maker] },
        { to: sell.base.address, abi: ERC20_ABI, fn: "allowance", args: [sell.maker, settler] },
        { to: sell.quote.address, abi: ERC20_ABI, fn: "balanceOf", args: [buy.maker] },
        { to: sell.quote.address, abi: ERC20_ABI, fn: "allowance", args: [buy.maker, settler] },
      ],
      net,
    )
      .then((r) => {
        if (!dead) setFunds({ sellerBal: (r[0] as bigint) ?? null, sellerAllow: (r[1] as bigint) ?? null, buyerBal: (r[2] as bigint) ?? null, buyerAllow: (r[3] as bigint) ?? null });
      })
      .catch(() => {});
    return () => {
      dead = true;
    };
  }, [sell, buy, settler, realPair, net, busy]);

  function addMandate(m: Mandate) {
    const next = [m, ...mine];
    setMine(next);
    saveBook(next);
    if (m.side === "sell") setSellId(m.id);
    else setBuyId(m.id);
    addLog({ kind: "offer", net: "practice", title: `New mandate: ${m.label}`, detail: `${m.side === "sell" ? "min net" : "max total"} ${fromUnits(m.limit, m.quote.decimals)} ${m.quote.symbol}, expires ${new Date(m.expiry * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC` });
  }
  function removeMandate(id: string) {
    const next = mine.filter((m) => m.id !== id);
    setMine(next);
    saveBook(next);
  }

  async function sign(side: "seller" | "buyer") {
    if (!sell || !buy || !analysis || !settler) return;
    const m = side === "seller" ? sell : buy;
    const o = orderOf(m, side === "seller" ? buy : sell);
    if (!o) return;
    if (!address) return open();
    if (!onChain) return switchNetwork();
    setBusy(`sign-${side}`);
    setMsg(null);
    try {
      const signature = await signTypedData(typedData(chainId, settler, o));
      const entry: SignedEntry = { mandateId: m.id, net, chainId, settler, order: ser(o), signature, at: Date.now(), how: "signature" };
      const next = [...sigs.filter((s) => !(s.mandateId === m.id && s.net === net)), entry];
      setSigs(next);
      saveSigs(next);
      addLog({ kind: "signed", net, title: `${side === "seller" ? "Seller" : "Buyer"} signed ${m.label}`, detail: `gross ${Q(o.quoteGross)}, signed limit ${Q(o.limitQuote)}, nonce ${o.nonce}` });
      setMsg({ ok: true, text: `Signed as ${side}. ${side === "seller" ? "Export it for the buyer, or let them sign here." : "Run the on-chain check, then settle."}` });
    } catch (e) {
      setMsg({ ok: false, text: explain(e) });
    } finally {
      setBusy(null);
    }
  }

  async function sendAndWait(label: string, to: string, data: Hex) {
    const hash = await sendTransaction({ to, data });
    setMsg({ ok: true, text: `${label}: sent, waiting for the block…`, tx: hash });
    const rc = await waitForReceipt(hash, 180_000, net);
    if (!rc.ok) throw new Error(`${label} reverted.`);
    return hash;
  }

  async function approveToken(side: "seller" | "buyer") {
    if (!sell || !buy || !analysis || !settler) return;
    if (!address) return open();
    if (!onChain) return switchNetwork();
    const token = side === "seller" ? sell.base : sell.quote;
    const amount = side === "seller" ? sell.amount : analysis.ev.n.buyerTotal;
    setBusy(`allow-${side}`);
    try {
      const hash = await sendAndWait(`Approve ${token.symbol}`, token.address, encodeFunctionData({ abi: ERC20_WRITE_ABI, functionName: "approve", args: [settler as Hex, amount] }));
      addLog({ kind: "allowance", net, title: `Approved ${fromUnits(amount, token.decimals)} ${token.symbol} for the settler`, detail: "exact amount, not unlimited", tx: hash });
      setMsg({ ok: true, text: `Allowance set: exactly ${fromUnits(amount, token.decimals)} ${token.symbol}.`, tx: hash });
    } catch (e) {
      setMsg({ ok: false, text: explain(e) });
    } finally {
      setBusy(null);
    }
  }

  function pairArgs(): [Order, Hex, Order, Hex] | null {
    if (!sell || !buy) return null;
    const so = orderOf(sell, buy);
    const bo = orderOf(buy, sell);
    if (!so || !bo) return null;
    return [so, (sellSig?.signature ?? "0x") as Hex, bo, (buySig?.signature ?? "0x") as Hex];
  }

  async function runCheck() {
    const args = pairArgs();
    if (!args || !settler) return;
    setBusy("check");
    try {
      const raw = await rpcCall<Hex>("eth_call", [{ to: settler, data: encodeFunctionData({ abi: SETTLER_ABI, functionName: "checkDeal", args }) }, "latest"], net);
      const mask = BigInt(raw.slice(0, 66));
      setCheck({ mask, at: Date.now() });
      if (mask !== 0n) addLog({ kind: "refused", net, title: `On-chain check: ${sell!.label} ↔ ${buy!.label}`, detail: decode(mask).map((b) => b.label).join(", "), mask: mask.toString() });
    } catch (e) {
      setCheck({ mask: -1n, at: Date.now(), error: e instanceof ChainError ? e.message : explain(e) });
    } finally {
      setBusy(null);
    }
  }

  async function settle() {
    const args = pairArgs();
    if (!args || !settler || !sell || !buy || !analysis) return;
    if (!address) return open();
    if (!onChain) return switchNetwork();
    setBusy("settle");
    try {
      const hash = await sendAndWait("Settle", settler, encodeFunctionData({ abi: SETTLER_ABI, functionName: "settle", args }));
      addLog({ kind: "settled", net, title: `Settled ${sell.label} ↔ ${buy.label}`, detail: `gross ${Q(analysis.gross)}, seller net ${Q(analysis.ev.n.sellerNet)}, buyer total ${Q(analysis.ev.n.buyerTotal)}`, tx: hash });
      setMsg({ ok: true, text: "Settled. Both legs moved in this transaction; the proof is on the dashboard.", tx: hash });
      setCheck(null);
    } catch (e) {
      setMsg({ ok: false, text: explain(e) });
    } finally {
      setBusy(null);
    }
  }

  async function approveOnChain(side: "seller" | "buyer") {
    if (!sell || !buy || !settler) return;
    const m = side === "seller" ? sell : buy;
    const o = orderOf(m, side === "seller" ? buy : sell);
    if (!o) return;
    if (!address) return open();
    if (!onChain) return switchNetwork();
    setBusy(`onchain-${side}`);
    try {
      const hash = await sendAndWait("Approve order", settler, encodeFunctionData({ abi: SETTLER_ABI, functionName: "approveOrder", args: [o] }));
      const entry: SignedEntry = { mandateId: m.id, net, chainId, settler, order: ser(o), signature: "0x", at: Date.now(), how: "on-chain approval" };
      const next = [...sigs.filter((s) => !(s.mandateId === m.id && s.net === net)), entry];
      setSigs(next);
      saveSigs(next);
      addLog({ kind: "approved", net, title: `${side === "seller" ? "Seller" : "Buyer"} approved ${m.label} on chain`, detail: `gross ${Q(o.quoteGross)}`, tx: hash });
    } catch (e) {
      setMsg({ ok: false, text: explain(e) });
    } finally {
      setBusy(null);
    }
  }

  function exportOrder(side: "seller" | "buyer") {
    const s = side === "seller" ? sellSig : buySig;
    if (!s || !settler) return;
    const text = encodeSigned(deser(s.order), s.signature, s.chainId, s.settler);
    setExported(text);
    navigator.clipboard?.writeText(text).catch(() => {});
  }

  async function importOrder() {
    setMsg(null);
    const d = decodeSigned(importText.trim());
    if (!d) return setMsg({ ok: false, text: "That is not a Parvex signed order (JSON from Export)." });
    if (d.chainId !== chainId || !settler || !same(d.settler, settler)) return setMsg({ ok: false, text: `This order is for chain ${d.chainId} and settler ${short(d.settler)}; the terminal is on ${NETWORKS[net].name}${settler ? ` with settler ${short(settler)}` : " with no settler"}.` });
    const o = d.order;
    const known = [...bases, ...quotes];
    const meta = async (addr: string): Promise<Asset> => {
      const k = known.find((a) => same(a.address, addr));
      if (k) return k;
      const [sym, dec] = await readMany([{ to: addr, abi: ERC20_ABI, fn: "symbol" }, { to: addr, abi: ERC20_ABI, fn: "decimals" }], net);
      return { address: addr.toLowerCase(), symbol: String(sym ?? "?"), name: String(sym ?? "?"), decimals: Number(dec ?? 18), proof: "read on chain at import", usd: null };
    };
    try {
      const [base, quote] = await Promise.all([meta(o.base), meta(o.quote)]);
      const id = `imp-${o.maker.slice(2, 8)}-${o.nonce}`;
      const m: Mandate = {
        id,
        label: `${o.side === 0 ? "Sell" : "Buy"} ${fromUnits(o.baseAmount, base.decimals)} ${base.symbol} (signed by ${short(o.maker)})`,
        maker: o.maker.toLowerCase(),
        side: o.side === 0 ? "sell" : "buy",
        base,
        quote,
        amount: o.baseAmount,
        limit: o.limitQuote,
        feeBps: o.feeBps,
        feeRecipient: o.feeBps > 0 ? o.feeRecipient.toLowerCase() : "",
        counterparty: /^0x0{40}$/.test(o.counterparty) ? null : o.counterparty.toLowerCase(),
        expiry: Number(o.expiry),
        createdAt: Math.floor(Date.now() / 1000),
        source: "you",
      };
      const nextBook = [m, ...mine.filter((x) => x.id !== id)];
      setMine(nextBook);
      saveBook(nextBook);
      const entry: SignedEntry = { mandateId: id, net, chainId, settler, order: ser(o), signature: d.signature, at: Date.now(), how: "imported" };
      const nextSigs = [...sigs.filter((s) => s.mandateId !== id), entry];
      setSigs(nextSigs);
      saveSigs(nextSigs);
      if (m.side === "sell") setSellId(id);
      else setBuyId(id);
      setImportText("");
      addLog({ kind: "signed", net, title: `Imported a signed order from ${short(o.maker)}`, detail: `${m.label}, gross ${fromUnits(o.quoteGross, quote.decimals)} ${quote.symbol}` });
      setMsg({ ok: true, text: "Imported. Its price is locked by the signature; pick or create your side with the same asset and amount." });
    } catch (e) {
      setMsg({ ok: false, text: explain(e) });
    }
  }

  function practiceSettle() {
    if (!sell || !buy || !analysis) return;
    addLog({ kind: "practice-settled", net: "practice", title: `Practice settlement: ${sell.label} ↔ ${buy.label}`, detail: `gross ${Q(analysis.gross)}, seller net ${Q(analysis.ev.n.sellerNet)}, buyer total ${Q(analysis.ev.n.buyerTotal)}` });
    setMsg({ ok: true, text: "Practice settlement recorded on the dashboard. On chain, this is one settle() transaction moving both legs." });
    setPracticeOk({ seller: false, buyer: false });
  }

  // ------------------------------------------------------------------ render

  const scale = (() => {
    if (!analysis) return null;
    const pts = [analysis.z.minGross, analysis.z.maxGross > 0n ? analysis.z.maxGross : analysis.z.minGross, analysis.gross, ...(analysis.ref ? [analysis.ref] : [])];
    let lo = pts.reduce((a, b) => (b < a ? b : a));
    let hi = pts.reduce((a, b) => (b > a ? b : a));
    const pad = (hi - lo) / 5n + 1n;
    lo -= pad;
    hi += pad;
    const at = (v: bigint) => Number(((v - lo) * 10000n) / (hi - lo)) / 100;
    return { at };
  })();

  const preOk = analysis ? analysis.pre.every((c) => c.ok) : false;
  const dealOk = analysis ? analysis.ev.mask === 0n : false;

  return (
    <div className="grid gap-3" data-testid="terminal">
      <div className="pane flex flex-wrap items-center gap-3 px-3 py-2.5">
        <div className="seg" role="tablist" aria-label="Network">
          {(["mainnet", "testnet"] as NetKey[]).map((k) => (
            <button key={k} type="button" role="tab" aria-selected={net === k} onClick={() => setNet(k)} data-testid={`net-${k}`}>
              {NETWORKS[k].name}
            </button>
          ))}
        </div>
        <span className="small muted">
          Settler on {NETWORKS[net].name}:{" "}
          {settler ? (
            <b className="code" data-testid="settler-addr">
              {short(settler)}
            </b>
          ) : (
            <b data-testid="settler-none">not deployed yet: practice mode only</b>
          )}
        </span>
        <span className="small muted ml-auto">
          {test ? "Local test chain" : assetData ? `Assets live at block ${assetData.head?.toLocaleString("en-US")}` : assetError ? `Asset list unavailable (${assetError}); fixture addresses with sample prices` : "Reading assets…"}
        </span>
      </div>

      <div className="term">
        {/* ---------------- left: book ---------------- */}
        <div className="grid gap-3">
          <div className="pane">
            <div className="pane-h">
              <span>Mandate book</span>
              <span className="badge sample">Samples marked</span>
            </div>
            <div className="max-h-[420px] overflow-y-auto">
              <table className="tbl" data-testid="book">
                <thead>
                  <tr>
                    <th>Side</th>
                    <th>Mandate</th>
                    <th className="text-right">Limit / unit</th>
                  </tr>
                </thead>
                <tbody>
                  {book.map((m) => {
                    const per = m.amount > 0n ? (m.limit * 10n ** BigInt(m.base.decimals)) / m.amount : 0n;
                    const sel = m.id === sellId || m.id === buyId;
                    return (
                      <tr key={m.id} className={`click ${sel ? "sel" : ""}`} onClick={() => (m.side === "sell" ? setSellId(m.id) : setBuyId(m.id))} data-testid={`book-${m.id}`}>
                        <td className={m.side === "sell" ? "side-sell" : "side-buy"}>{m.side.toUpperCase()}</td>
                        <td>
                          <span className="block leading-tight">{m.label}</span>
                          <span className="text-[11px] text-[var(--text-2)]">
                            {short(m.maker)} · {now > m.expiry ? "expired" : `${Math.round((m.expiry - now) / 60)} min`} {m.source === "sample" ? "· sample" : ""}
                            {m.source === "you" ? (
                              <button type="button" className="ml-1 underline" onClick={(e) => (e.stopPropagation(), removeMandate(m.id))}>
                                remove
                              </button>
                            ) : null}
                          </span>
                        </td>
                        <td className="num text-right">
                          {fromUnits(per, m.quote.decimals, 2)} {m.quote.symbol}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <div className="pane">
            <div className="pane-h">
              <span>Matches</span>
              <span className="text-[11px]">{candidates.filter((c) => c.blocked.length === 0).length} open</span>
            </div>
            <div className="pane-b grid gap-1.5">
              {candidates.map((c) => (
                <button
                  key={`${c.sell.id}-${c.buy.id}`}
                  type="button"
                  className={`flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-left text-[12px] ${c.sell.id === sellId && c.buy.id === buyId ? "border-[var(--text)]" : "border-[var(--sline)]"}`}
                  onClick={() => {
                    setSellId(c.sell.id);
                    setBuyId(c.buy.id);
                  }}
                >
                  <span className="min-w-0 truncate">
                    {c.sell.base.symbol} · {short(c.sell.maker)} → {short(c.buy.maker)}
                  </span>
                  <span className={c.blocked.length ? "side-sell shrink-0" : "side-buy shrink-0"}>{c.blocked.length ? `${c.blocked.length} blocked` : "match"}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="pane">
            <div className="pane-h">New mandate</div>
            <div className="pane-b">
              <MandateForm net={net} bases={bases} quotes={quotes} address={address} preset={preset} onAdd={addMandate} />
            </div>
          </div>
        </div>

        {/* ---------------- center: match, agent, deal check ---------------- */}
        <div className="grid gap-3">
          {!sell || !buy || !analysis ? (
            <div className="pane pane-b small">Pick one SELL and one BUY mandate in the book.</div>
          ) : (
            <>
              <div className="pane" data-testid="pair">
                <div className="pane-h">
                  <span>
                    Match · {fromUnits(sell.amount, sell.base.decimals)} {sell.base.symbol} / {qs}
                  </span>
                  {sell.source === "sample" || buy.source === "sample" ? <span className="badge sample">Sample data</span> : <span className="badge live">Your mandates</span>}
                </div>
                <div className="pane-b grid gap-3">
                  <div className="grid grid-cols-1 gap-2 text-[13px] sm:grid-cols-2">
                    <div>
                      <span className="side-sell mono text-[11px]">Seller</span> {sell.label}
                      <br />
                      <span className="text-[var(--text-2)]">min net {Q(sell.limit)} · fee {sell.feeBps} bps</span>
                    </div>
                    <div>
                      <span className="side-buy mono text-[11px]">Buyer</span> {buy.label}
                      <br />
                      <span className="text-[var(--text-2)]">max total {Q(buy.limit)} · fee {buy.feeBps} bps</span>
                    </div>
                  </div>
                  {scale ? (
                    <div>
                      <div className="zone" aria-label="Zone of agreement">
                        {analysis.z.overlap ? <span className="in" style={{ left: `${scale.at(analysis.z.minGross)}%`, width: `${Math.max(0.5, scale.at(analysis.z.maxGross) - scale.at(analysis.z.minGross))}%` }} /> : null}
                        <span className="pin" style={{ left: `${scale.at(analysis.gross)}%` }} title="deal price" />
                        {analysis.ref ? <span className="pin" style={{ left: `${scale.at(analysis.ref)}%`, background: "#8a9180", width: 1 }} title="feed price" /> : null}
                      </div>
                      <div className="mt-1.5 flex flex-wrap justify-between gap-2 text-[11.5px] text-[var(--text-2)] num">
                        <span>seller min gross {Q(analysis.z.minGross)}</span>
                        <span>{analysis.ref ? `feed ${Q(analysis.ref)}` : "no feed price for this pair"}</span>
                        <span>buyer max gross {analysis.z.maxGross > 0n ? Q(analysis.z.maxGross) : "none"}</span>
                      </div>
                    </div>
                  ) : null}
                  <div>
                    {analysis.pre.map((c) => (
                      <div key={c.key} className="cond">
                        <span className={c.ok ? "ok" : "no"}>{c.ok ? "✓" : "✗"}</span>
                        <span>
                          {c.title}
                          <span className="d block">{c.detail}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="pane" data-testid="agent">
                <div className="pane-h">
                  <span>Agent rounds · rule-based</span>
                  <span className="text-[11px]">{analysis.locked !== null ? "price locked by a signature" : analysis.run.agreed ? "agreed" : "no agreement"}</span>
                </div>
                <div className="pane-b">
                  <div key={logKey}>
                    {analysis.run.rounds.map((r, i) => (
                      <div key={i} className="round-row" style={{ "--i": i } as React.CSSProperties}>
                        <span className="text-[var(--text-2)]">r{r.round}</span>
                        <span className={r.by === "seller" ? "side-sell" : "side-buy"}>{r.by}</span>
                        <span className="min-w-0 text-[var(--text-2)]">{r.rule}</span>
                        <span className="text-right">{fromUnits(r.offer, qd, 2)}</span>
                      </div>
                    ))}
                  </div>
                  <p className={`verdict mt-3 ${analysis.run.agreed ? "ok" : "no"}`} data-testid="agent-outcome">
                    {analysis.run.agreed ? `Agreed at ${Q(analysis.run.gross)} gross, accepted by the ${analysis.run.by}.` : analysis.run.reason}
                    {analysis.locked !== null ? ` Signed terms fix the price at ${Q(analysis.locked)}.` : ""}
                  </p>
                  <p className="small muted mt-2">Each agent sees only its own limit and the other side&apos;s last offer. It proposes; it never signs.</p>
                </div>
              </div>

              <div className="pane" data-testid="deal-check">
                <div className="pane-h">
                  <span>Deal check at {Q(analysis.gross)}</span>
                  <span className="text-[11px]">same rules as checkDeal</span>
                </div>
                <div className="pane-b">
                  {analysis.ev.rows.map((c) => (
                    <div key={c.key} className="cond">
                      <span className={c.ok ? "ok" : "no"}>{c.ok ? "✓" : "✗"}</span>
                      <span>
                        {c.title}
                        <span className="d block">{c.detail}</span>
                      </span>
                    </div>
                  ))}
                  <p className={`verdict mt-3 ${dealOk ? "ok" : "no"}`} data-testid="deal-verdict">
                    {dealOk ? "Accepted: every term holds. Both sides can review and authorize." : `Refused: ${decode(analysis.ev.mask).map((b) => b.label).join("; ")}.`}
                  </p>
                </div>
              </div>
            </>
          )}
        </div>

        {/* ---------------- right: review & authorize ---------------- */}
        <div className="grid gap-3">
          {sell && buy && analysis ? (
            <div className="pane" data-testid="review">
              <div className="pane-h">
                <span>Review &amp; authorize</span>
                <span className="text-[11px]">{realPair && settler ? NETWORKS[net].short : "practice"}</span>
              </div>
              <div className="pane-b grid gap-3">
                {(["seller", "buyer"] as const).map((side) => {
                  const m = side === "seller" ? sell : buy;
                  const s = side === "seller" ? sellSig : buySig;
                  return (
                    <div key={side} className="rounded-md border border-[var(--sline)] p-2.5" data-testid={`review-${side}`}>
                      <p className="mono flex items-center justify-between text-[11px]">
                        <span className={side === "seller" ? "side-sell" : "side-buy"}>{side}</span>
                        <span>{short(m.maker)}</span>
                      </p>
                      {side === "seller" ? (
                        <>
                          <div className="kv"><span>Gives</span><span>{fromUnits(sell.amount, sell.base.decimals)} {sell.base.symbol}</span></div>
                          <div className="kv"><span>Fee {sell.feeBps} bps</span><span>− {Q(analysis.ev.n.sellerFee)}</span></div>
                          <div className="kv big"><span>Receives net</span><span data-testid="seller-net">{Q(analysis.ev.n.sellerNet)}</span></div>
                        </>
                      ) : (
                        <>
                          <div className="kv"><span>Receives</span><span>{fromUnits(buy.amount, buy.base.decimals)} {buy.base.symbol}</span></div>
                          <div className="kv"><span>Fee {buy.feeBps} bps</span><span>+ {Q(analysis.ev.n.buyerFee)}</span></div>
                          <div className="kv big"><span>Pays total</span><span data-testid="buyer-total">{Q(analysis.ev.n.buyerTotal)}</span></div>
                        </>
                      )}
                      <div className="kv"><span>Expires</span><span>{new Date(m.expiry * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC</span></div>
                      {realPair && funds ? (
                        <div className="kv">
                          <span>{side === "seller" ? `Balance / allowance ${sell.base.symbol}` : `Balance / allowance ${qs}`}</span>
                          <span className="num">
                            {side === "seller"
                              ? `${funds.sellerBal !== null ? fromUnits(funds.sellerBal, sell.base.decimals, 4) : "?"} / ${funds.sellerAllow !== null ? fromUnits(funds.sellerAllow, sell.base.decimals, 4) : "?"}`
                              : `${funds.buyerBal !== null ? fromUnits(funds.buyerBal, qd, 4) : "?"} / ${funds.buyerAllow !== null ? fromUnits(funds.buyerAllow, qd, 4) : "?"}`}
                          </span>
                        </div>
                      ) : null}
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {!realPair || !settler ? (
                          <button type="button" className="btn btn-line btn-xs" disabled={!dealOk} onClick={() => setPracticeOk((p) => ({ ...p, [side]: !p[side] }))} data-testid={`practice-auth-${side}`}>
                            {practiceOk[side] ? "Authorized (practice) ✓" : "Authorize (practice)"}
                          </button>
                        ) : s ? (
                          <>
                            <span className="badge live" data-testid={`signed-${side}`}>{s.how}</span>
                            {s.how === "signature" ? (
                              <button type="button" className="btn btn-line btn-xs" onClick={() => exportOrder(side)} data-testid={`export-${side}`}>
                                Export
                              </button>
                            ) : null}
                          </>
                        ) : (side === "seller" ? iAmSeller : iAmBuyer) ? (
                          <>
                            <button type="button" className="btn btn-neon btn-xs" disabled={!dealOk || busy !== null} onClick={() => sign(side)} data-testid={`sign-${side}`}>
                              {busy === `sign-${side}` ? "Sign in wallet…" : "Sign order"}
                            </button>
                            <button type="button" className="btn btn-line btn-xs" disabled={!dealOk || busy !== null} onClick={() => approveOnChain(side)}>
                              Approve by tx
                            </button>
                          </>
                        ) : (
                          <span className="small muted">Only {short(m.maker)} can authorize. {address ? "" : "Connect that wallet."}</span>
                        )}
                        {realPair && settler && (side === "seller" ? iAmSeller : iAmBuyer) ? (
                          <button type="button" className="btn btn-line btn-xs" disabled={busy !== null} onClick={() => approveToken(side)} data-testid={`allow-${side}`}>
                            {busy === `allow-${side}` ? "…" : `Allow ${side === "seller" ? sell.base.symbol : qs}`}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}

                <label className="flex items-start gap-2 text-[12px] text-[var(--text-2)]">
                  <input type="checkbox" checked={fullLimit} onChange={(e) => setFullLimit(e.target.checked)} className="mt-0.5" />
                  Sign my full mandate limit instead of this deal&apos;s exact number (reveals your limit to whoever holds the order).
                </label>

                {!realPair || !settler ? (
                  <>
                    <button type="button" className="btn btn-neon btn-sm w-full" disabled={!(practiceOk.seller && practiceOk.buyer && dealOk)} onClick={practiceSettle} data-testid="practice-settle">
                      Settle (practice)
                    </button>
                    <p className="small muted">
                      Practice: nothing is signed or sent. {settler ? "With your wallet as one maker and a counterparty's address as the other, this pane signs EIP-712 orders and settles on chain." : `No settler is deployed on ${NETWORKS[net].name} yet, so on-chain settlement is off here.`}
                    </p>
                  </>
                ) : (
                  <>
                    <div className="flex gap-2">
                      <button type="button" className="btn btn-line btn-sm flex-1" disabled={busy !== null} onClick={runCheck} data-testid="chain-check">
                        {busy === "check" ? "Checking…" : "Check on chain"}
                      </button>
                      <button type="button" className="btn btn-neon btn-sm flex-1" disabled={busy !== null || !sellSig || !buySig || !dealOk} onClick={settle} data-testid="settle">
                        {busy === "settle" ? "Settling…" : "Settle"}
                      </button>
                    </div>
                    {check ? (
                      <div className={`verdict ${check.mask === 0n ? "ok" : "no"}`} data-testid="chain-verdict">
                        {check.error
                          ? `Check failed: ${check.error}`
                          : check.mask === 0n
                            ? "checkDeal = 0: the settler would accept this pair now."
                            : `checkDeal refused (${check.mask.toString()}): ${decode(check.mask).map((b) => b.label).join("; ")}.`}
                        {check.mask > 0n ? <span className="mt-1 block text-[12px]">Site check: {analysis.ev.mask === 0n ? "terms OK" : decode(analysis.ev.mask).map((b) => b.key).join(", ")}. Chain-only bits: signatures, nonces, balances, allowances.</span> : null}
                      </div>
                    ) : null}
                  </>
                )}
                {msg ? (
                  <p className={msg.ok ? "note" : "rq-alert"} role="status" data-testid="term-msg">
                    {msg.text}{" "}
                    {msg.tx ? (
                      <a className="underline" href={explorerTxOn(net, msg.tx)} target="_blank" rel="noreferrer">
                        View tx
                      </a>
                    ) : null}
                  </p>
                ) : null}
                {exported ? (
                  <label className="field">
                    <span>Signed order (copied) · send it to the counterparty</span>
                    <textarea className="inp" readOnly value={exported} data-testid="exported" />
                  </label>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="pane">
            <div className="pane-h">Import a signed order</div>
            <div className="pane-b grid gap-2">
              <textarea className="inp" placeholder='{"v":1,"chainId":4663,…}' value={importText} onChange={(e) => setImportText(e.target.value)} data-testid="import-text" />
              <button type="button" className="btn btn-line btn-sm" onClick={importOrder} disabled={!importText.trim()} data-testid="import-go">
                Import
              </button>
              <p className="small muted">An order from the other side, exported from their terminal. Its terms are fixed by their signature.</p>
            </div>
          </div>

          <div className="note" data-testid="preok">
            {preOk ? "These mandates can be negotiated." : "These mandates cannot be matched as they are: see the red conditions."} No order leaves this browser unless you export it. No token is needed.
          </div>
        </div>
      </div>
    </div>
  );
}
