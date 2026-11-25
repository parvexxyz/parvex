import { BRAND, CHAIN } from "@/config/brand";
import { NETWORKS, settlerOf } from "@/config/contracts";

export const dynamic = "force-static";

export function GET() {
  const lines = [
    `# ${BRAND.name}`,
    "",
    `> ${BRAND.slogan} ${BRAND.tagline} A buyer and a seller each enter a mandate (asset, amount, price limit, expiry) on ${CHAIN.name} (chain ${CHAIN.id}). The engine matches mandates, a deterministic rule-based agent (no language model) trades counter-offers inside both limits, and every condition is shown with its numbers: the buyer's maximum total, the seller's minimum net after fees. Both wallets sign EIP-712 orders with the exact terms; ParvexMandateSettler moves both legs with transferFrom in one transaction or nothing, never holds a balance and charges no fee. checkDeal returns a reason bitmask before anything is sent. Prototype; no token needed. Not affiliated with Robinhood.`,
    "",
    `Terminal: ${BRAND.url}/terminal`,
    `Dashboard (offers, approvals, settlement proofs): ${BRAND.url}/dashboard`,
    `Method, net math and reason bits: ${BRAND.url}/method`,
    `Assets API (JSON, proven stock tokens + quotes): ${BRAND.url}/api/assets`,
    `Settlement proofs API (JSON): ${BRAND.url}/api/desk?net=mainnet|testnet`,
    `ParvexMandateSettler on ${NETWORKS.mainnet.name}: ${settlerOf("mainnet") ?? "not deployed yet"}`,
    `ParvexMandateSettler on ${NETWORKS.testnet.name}: ${settlerOf("testnet") ?? "not deployed yet"}`,
    "",
  ];
  return new Response(lines.join("\n"), { headers: { "content-type": "text/plain; charset=utf-8" } });
}
