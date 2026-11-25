"use client";

import { useEffect, useState } from "react";
import { NETWORKS, type NetKey } from "@/config/contracts";
import { ERC20_ABI } from "@/lib/abi";
import { readMany } from "@/lib/client";
import { MAX_FEE_BPS, fromUnits, toUnits } from "@/lib/otc/netmath";
import type { Asset, Mandate, MandateSide } from "@/lib/otc/types";

const isAddr = (v: string) => /^0x[0-9a-fA-F]{40}$/.test(v);

/**
 * New mandate: side, asset, quote, amount, limit per unit (turned into the total the contract checks: the seller's minimum net,
 * the buyer's maximum total), own fee, counterparty lock, expiry. The maker is the connected wallet, a counterparty's address you
 * enter for a quote you received (only they can sign it), or a practice name.
 */
export function MandateForm({ net, bases, quotes, address, preset, onAdd }: { net: NetKey; bases: Asset[]; quotes: Asset[]; address: string | null; preset: MandateSide | null; onAdd: (m: Mandate) => void }) {
  const [side, setSide] = useState<MandateSide>(preset ?? "sell");
  const [baseAddr, setBaseAddr] = useState("");
  const [quoteAddr, setQuoteAddr] = useState("");
  const [custom, setCustom] = useState("");
  const [customAsset, setCustomAsset] = useState<Asset | null>(null);
  const [amount, setAmount] = useState("10");
  const [price, setPrice] = useState("");
  const [fee, setFee] = useState("0");
  const [feeTo, setFeeTo] = useState("");
  const [cp, setCp] = useState("");
  const [mins, setMins] = useState("120");
  const [maker, setMaker] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [reading, setReading] = useState(false);

  useEffect(() => {
    if (preset) setSide(preset);
  }, [preset]);
  useEffect(() => {
    if (!baseAddr && bases[0]) setBaseAddr(bases[0].address);
    if (!quoteAddr && quotes[0]) setQuoteAddr(quotes[0].address);
  }, [bases, quotes, baseAddr, quoteAddr]);
  useEffect(() => {
    setMaker(address ?? "practice:you");
  }, [address]);

  const allBases = customAsset ? [customAsset, ...bases] : bases;
  const base = allBases.find((b) => b.address === baseAddr) ?? null;
  const quote = quotes.find((q) => q.address === quoteAddr) ?? null;

  async function readCustom() {
    setErr(null);
    if (!isAddr(custom)) return setErr("Paste a token address (0x + 40 hex).");
    setReading(true);
    try {
      const [sym, dec] = await readMany(
        [
          { to: custom, abi: ERC20_ABI, fn: "symbol" },
          { to: custom, abi: ERC20_ABI, fn: "decimals" },
        ],
        net,
      );
      if (typeof sym !== "string" || dec === null || dec === undefined) throw new Error(`No ERC-20 symbol/decimals at that address on ${NETWORKS[net].name}.`);
      const a: Asset = { address: custom.toLowerCase(), symbol: sym.slice(0, 12), name: `${sym.slice(0, 12)} (pasted)`, decimals: Number(dec), proof: `symbol() and decimals() read on ${NETWORKS[net].name}; not proven to be anything else`, usd: null };
      setCustomAsset(a);
      setBaseAddr(a.address);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Read failed.");
    } finally {
      setReading(false);
    }
  }

  function add() {
    setErr(null);
    if (!base || !quote) return setErr("Pick an asset and a quote token.");
    const amt = toUnits(amount, base.decimals);
    const per = toUnits(price, quote.decimals);
    if (!amt || amt <= 0n) return setErr("Amount must be above zero.");
    if (per === null || per <= 0n) return setErr("Enter your limit price per unit.");
    const bps = Number(fee);
    if (!Number.isInteger(bps) || bps < 0 || bps > MAX_FEE_BPS) return setErr(`Fee must be a whole number of basis points from 0 to ${MAX_FEE_BPS}.`);
    if (bps > 0 && !isAddr(feeTo)) return setErr("A fee needs the address that receives it.");
    if (cp && !isAddr(cp)) return setErr("Counterparty must be an address, or empty for anyone.");
    if (!(isAddr(maker) || maker.startsWith("practice:"))) return setErr("Maker must be an address or a practice name.");
    const m = Number(mins);
    if (!Number.isFinite(m) || m < 1 || m > 60 * 24 * 30) return setErr("Expiry: 1 minute to 30 days.");
    const limit = (amt * per) / 10n ** BigInt(base.decimals);
    const now = Math.floor(Date.now() / 1000);
    onAdd({
      id: `m-${now}-${Math.floor(Math.random() * 1e6)}`,
      label: `${side === "sell" ? "Sell" : "Buy"} ${fromUnits(amt, base.decimals)} ${base.symbol}`,
      maker: maker.startsWith("practice:") ? maker : maker.toLowerCase(),
      side,
      base,
      quote,
      amount: amt,
      limit,
      feeBps: bps,
      feeRecipient: bps > 0 ? feeTo.toLowerCase() : "",
      counterparty: cp ? cp.toLowerCase() : null,
      expiry: now + Math.round(m * 60),
      createdAt: now,
      source: "you",
    });
  }

  const amt = base ? toUnits(amount, base.decimals) : null;
  const per = quote ? toUnits(price, quote.decimals) : null;
  const total = base && quote && amt && per ? (amt * per) / 10n ** BigInt(base.decimals) : null;

  return (
    <div className="grid gap-2.5" data-testid="mandate-form">
      <div className="seg w-full" role="tablist" aria-label="Side">
        {(["sell", "buy"] as MandateSide[]).map((s) => (
          <button key={s} type="button" role="tab" aria-selected={side === s} className="flex-1" onClick={() => setSide(s)} data-testid={`form-side-${s}`}>
            {s === "sell" ? "Sell" : "Buy"}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="field">
          <span>Asset</span>
          <select className="inp" value={baseAddr} onChange={(e) => setBaseAddr(e.target.value)} data-testid="form-base">
            {allBases.map((b) => (
              <option key={b.address} value={b.address}>
                {b.symbol}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Paid in</span>
          <select className="inp" value={quoteAddr} onChange={(e) => setQuoteAddr(e.target.value)} data-testid="form-quote">
            {quotes.map((q) => (
              <option key={q.address} value={q.address}>
                {q.symbol}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex gap-2">
        <input className="inp" placeholder="or paste any token address" value={custom} onChange={(e) => setCustom(e.target.value.trim())} aria-label="Token address" data-testid="form-custom" />
        <button type="button" className="btn btn-line btn-xs shrink-0" onClick={readCustom} disabled={reading}>
          {reading ? "…" : "Read"}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="field">
          <span>Amount ({base?.symbol ?? "asset"})</span>
          <input className="inp" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} data-testid="form-amount" />
        </label>
        <label className="field">
          <span>{side === "sell" ? "Min net" : "Max total"} per unit</span>
          <input className="inp" inputMode="decimal" value={price} placeholder={quote?.symbol} onChange={(e) => setPrice(e.target.value)} data-testid="form-price" />
        </label>
      </div>
      <p className="small muted" data-testid="form-total">
        {total !== null && quote
          ? side === "sell"
            ? `You receive at least ${fromUnits(total, quote.decimals)} ${quote.symbol} after your fee.`
            : `You pay at most ${fromUnits(total, quote.decimals)} ${quote.symbol} including your fee.`
          : "The limit is checked as a total, in the quote token's own units."}
      </p>
      <div className="grid grid-cols-[80px_1fr] gap-2">
        <label className="field">
          <span>Your fee bps</span>
          <input className="inp" inputMode="numeric" value={fee} onChange={(e) => setFee(e.target.value)} data-testid="form-fee" />
        </label>
        <label className="field">
          <span>Fee goes to</span>
          <input className="inp" placeholder="0x… your broker or desk" value={feeTo} onChange={(e) => setFeeTo(e.target.value.trim())} disabled={fee === "0"} />
        </label>
      </div>
      <label className="field">
        <span>Only trade with (optional)</span>
        <input className="inp" placeholder="0x… counterparty" value={cp} onChange={(e) => setCp(e.target.value.trim())} data-testid="form-cp" />
      </label>
      <div className="grid grid-cols-[110px_1fr] gap-2">
        <label className="field">
          <span>Valid (min)</span>
          <input className="inp" inputMode="numeric" value={mins} onChange={(e) => setMins(e.target.value)} />
        </label>
        <label className="field">
          <span>Maker</span>
          <input className="inp" value={maker} onChange={(e) => setMaker(e.target.value.trim())} data-testid="form-maker" />
        </label>
      </div>
      <p className="small muted">Maker: your connected wallet, a counterparty&apos;s address for a quote they sent you (only they can sign it), or a practice name.</p>
      {err ? <p className="rq-alert">{err}</p> : null}
      <button type="button" className="btn btn-neon btn-sm w-full" onClick={add} data-testid="form-add">
        Add mandate
      </button>
    </div>
  );
}
