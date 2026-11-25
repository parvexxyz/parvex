import "server-only";
import { decodeEventLog } from "viem";
import { DEPLOYMENTS, settlerOf, type NetKey } from "@/config/contracts";
import { SETTLER_ABI } from "@/lib/abi";
import { scanBack } from "@/lib/logscan";
import { headBlock, logReader, type RawLog } from "@/lib/server/chainread";

/*
 * Settlement proofs, read from ParvexMandateSettler's logs on one network: every Settled event paired with its SettledAmounts
 * (same dealId, same transaction), plus cancellations and on-chain order approvals. A reverted settle leaves no log, which is
 * why refusals are recorded by the terminal from checkDeal before anything is sent.
 */

export type Proof = {
  dealId: string;
  seller: string;
  buyer: string;
  base: string;
  quote: string;
  baseAmount: string;
  quoteGross: string;
  sellerNet: string | null;
  sellerFee: string | null;
  buyerFee: string | null;
  settledBy: string | null;
  index: number;
  block: number;
  tx: string;
};

export type DeskEvent = { name: string; maker: string; nonce: string | null; orderHash: string | null; block: number; tx: string };

export type Desk = {
  net: NetKey;
  deployed: boolean;
  settler: string | null;
  head: number | null;
  proofs: Proof[];
  events: DeskEvent[];
  scanned: { fromBlock: number; toBlock: number; gaps: [number, number][]; complete: boolean } | null;
};

const s = (v: unknown) => (typeof v === "bigint" ? v.toString() : String(v));

export async function readDesk(net: NetKey): Promise<Desk> {
  const settler = settlerOf(net);
  if (!settler) return { net, deployed: false, settler: null, head: null, proofs: [], events: [], scanned: null };
  const head = await headBlock(net);
  const from = Math.max(0, DEPLOYMENTS[net].block);
  const scan = await scanBack<RawLog>(logReader({ address: settler, topics: [] }, 1_500_000, net), from, head, { maxCalls: 24 });
  const proofs = new Map<string, Proof>();
  const amounts = new Map<string, { sellerNet: string; sellerFee: string; buyerFee: string; settledBy: string }>();
  const events: DeskEvent[] = [];
  for (const l of scan.logs) {
    if ((l as RawLog & { removed?: boolean }).removed) continue;
    let d: { eventName: string; args: Record<string, unknown> };
    try {
      d = decodeEventLog({ abi: SETTLER_ABI, data: l.data as `0x${string}`, topics: l.topics as [`0x${string}`, ...`0x${string}`[]] }) as never;
    } catch {
      continue;
    }
    const a = d.args;
    const block = Number(BigInt(l.blockNumber));
    if (d.eventName === "Settled") {
      proofs.set(s(a.dealId), {
        dealId: s(a.dealId),
        seller: s(a.seller).toLowerCase(),
        buyer: s(a.buyer).toLowerCase(),
        base: s(a.base).toLowerCase(),
        quote: s(a.quote).toLowerCase(),
        baseAmount: s(a.baseAmount),
        quoteGross: s(a.quoteGross),
        sellerNet: null,
        sellerFee: null,
        buyerFee: null,
        settledBy: null,
        index: Number(a.index),
        block,
        tx: l.transactionHash,
      });
    } else if (d.eventName === "SettledAmounts") {
      amounts.set(s(a.dealId), { sellerNet: s(a.sellerNet), sellerFee: s(a.sellerFee), buyerFee: s(a.buyerFee), settledBy: s(a.settledBy).toLowerCase() });
    } else {
      events.push({ name: d.eventName, maker: s(a.maker).toLowerCase(), nonce: a.nonce !== undefined ? s(a.nonce) : a.minNonce !== undefined ? s(a.minNonce) : null, orderHash: a.orderHash ? s(a.orderHash) : null, block, tx: l.transactionHash });
    }
  }
  for (const [id, p] of proofs) {
    const m = amounts.get(id);
    if (m) Object.assign(p, m);
  }
  const list = [...proofs.values()].sort((x, y) => y.index - x.index).slice(0, 200);
  events.sort((x, y) => y.block - x.block);
  return { net, deployed: true, settler, head, proofs: list, events: events.slice(0, 200), scanned: { fromBlock: from, toBlock: head, gaps: scan.gaps, complete: scan.gaps.length === 0 } };
}
