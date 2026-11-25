"use client";

import { useState } from "react";
import { useWallet } from "@/components/wallet/WalletProvider";
import { useWalletModal } from "@/components/wallet/WalletButton";
import { NETWORKS, explorerAddressOn, explorerTxOn, type NetKey } from "@/config/contracts";
import { explain, waitForReceipt } from "@/lib/client";
import artifacts from "@/lib/contracts/artifacts.json";

/** 25 Nov 2026: the creation transaction used 1,733,680 gas on the E2E chain (id 4663); 7,861 bytes of runtime code. */
export const DEPLOY_GAS = "about 1.73 million";

export function DeployPanel() {
  const { address, onChain, sendTransaction, switchNetwork, net, setNet } = useWallet();
  const { open } = useWalletModal();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [done, setDone] = useState<{ address: string; tx: string; block: number; net: NetKey } | null>(null);
  const art = artifacts.contracts.ParvexMandateSettler;
  const t = NETWORKS[net];

  async function deploy() {
    if (!address) return open();
    if (!onChain) return switchNetwork();
    setBusy(true);
    setMsg(null);
    try {
      const hash = await sendTransaction({ data: art.creation as `0x${string}` });
      setMsg(`Sent ${hash}. Waiting for the block…`);
      const rc = await waitForReceipt(hash, 300_000, net);
      if (!rc.ok || !rc.contractAddress) throw new Error("The deployment reverted.");
      setDone({ address: rc.contractAddress, tx: hash, block: rc.blockNumber, net });
      setMsg(null);
    } catch (e) {
      setMsg(explain(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="pane" data-testid="deploy-panel">
        <div className="pane-h">ParvexMandateSettler</div>
        <div className="pane-b grid gap-3">
          <div className="seg" role="tablist" aria-label="Network">
            {(["mainnet", "testnet"] as NetKey[]).map((k) => (
              <button key={k} type="button" role="tab" aria-selected={net === k} onClick={() => setNet(k)} data-testid={`deploy-net-${k}`}>
                {NETWORKS[k].name}
              </button>
            ))}
          </div>
          <p className="small muted">No constructor arguments, no owner of the contract. Creation code sha256 {art.sha256.slice(0, 16)}…</p>
          <button type="button" className="btn btn-neon w-full" disabled={busy} onClick={deploy} data-testid="deploy-submit">
            {!address ? "Connect wallet" : !onChain ? `Switch to ${t.name}` : busy ? "Confirm in wallet…" : `Deploy on ${t.name}`}
          </button>
          {msg ? (
            <p className="rq-alert" role="status">
              {msg}
            </p>
          ) : null}
          {done ? (
            <div className="text-[13px] leading-relaxed" data-testid="deploy-done">
              <p className="font-semibold">Deployed on {NETWORKS[done.net].name}.</p>
              <p className="break-all">
                Address <a className="underline" href={explorerAddressOn(done.net, done.address)} target="_blank" rel="noreferrer">{done.address}</a>
                <br />
                Tx <a className="underline" href={explorerTxOn(done.net, done.tx)} target="_blank" rel="noreferrer">{done.tx}</a> · block {done.block}
              </p>
              <p className="mt-2">
                Paste into src/config/contracts.ts under {done.net}:{" "}
                <code className="code">{`settler: "${done.address}", block: ${done.block}, tx: "${done.tx}"`}</code>. Then run{" "}
                <code className="code">npm run verify-deployment -- --settler {done.address} --settler-tx {done.tx}</code> (VERIFY_RPC_URL = {NETWORKS[done.net].rpc}) and verify the source with the kit in referensi/explorer.
              </p>
            </div>
          ) : null}
        </div>
      </div>
      <div className="pane">
        <div className="pane-h">Before you deploy</div>
        <ul className="pane-b small grid list-disc gap-2 pl-8">
          <li>The settler never holds a balance and has no payable function or receive(). It moves tokens only with transferFrom, under each maker&apos;s own allowance, in the transaction that settles both legs.</li>
          <li>It has unit, fuzz, invariant and Robinhood Chain fork tests and a written self-review, but no outside security review yet. Start on the testnet, then small amounts.</li>
          <li>Measured deploy gas: {DEPLOY_GAS}, paid in ETH.</li>
        </ul>
      </div>
    </div>
  );
}
