import { CHAIN, isAddress } from "@/config/brand";

/*
 * Networks a deal can settle on, and Parvex's own contract on each. Not deployed yet on either: the owner deploys it from /deploy
 * (localhost only) to the network of their choice, pastes the three values below and runs
 * `npm run verify-deployment -- --settler <address> --settler-tx <tx>` (VERIFY_RPC_URL = that network's RPC).
 *   settler  ParvexMandateSettler (+ internal library ParvexNetMath, inlined, nothing to link): EIP-712 orders, checkDeal reason bits,
 *            settle() moves both legs with transferFrom in one transaction, cancel / cancelUpTo, on-chain order approval.
 *            No owner, no admin, no fee for Parvex, no upgrade, never holds a balance.
 *
 * Robinhood Chain Testnet was proven from this machine on 25 Nov 2026: https://rpc.testnet.chain.robinhood.com answered eth_chainId
 * 0xb626 (46630) and a head block of 157,667,566; https://explorer.testnet.chain.robinhood.com serves a Blockscout API (/api/v2/stats).
 * The testnet RPC answers CORS for any origin, so the browser reads it directly.
 */

export type NetKey = "mainnet" | "testnet";

export const NETWORKS = {
  mainnet: {
    key: "mainnet" as NetKey,
    id: CHAIN.id,
    hex: CHAIN.hex,
    name: CHAIN.name,
    short: "Mainnet",
    rpc: CHAIN.rpc,
    explorer: CHAIN.explorer,
    testnet: false,
  },
  testnet: {
    key: "testnet" as NetKey,
    id: 46630,
    hex: "0xb626",
    name: "Robinhood Chain Testnet",
    short: "Testnet",
    rpc: "https://rpc.testnet.chain.robinhood.com",
    explorer: "https://explorer.testnet.chain.robinhood.com",
    testnet: true,
  },
} as const;

export type Network = (typeof NETWORKS)[NetKey];
export const NET_KEYS: NetKey[] = ["mainnet", "testnet"];

export type TestToken = { address: string; symbol: string; name: string; decimals: number };
type Deployment = { settler: string; block: number; tx: string; tokens?: TestToken[] };

const DEPLOYED: Record<NetKey, Deployment> = {
  mainnet: { settler: "", block: 0, tx: "" },
  testnet: { settler: "", block: 0, tx: "" },
};

/**
 * Local tests only: NEXT_PUBLIC_PARVEX_TEST_CONTRACTS='{"mainnet":{"settler":"0x…","block":1,"tokens":[…]}}' at build time points a
 * second build at a settler (and test tokens) on an anvil chain with chain id 4663. Never set it on Vercel.
 */
function testOverride(): Record<NetKey, Deployment> | null {
  const raw = process.env.NEXT_PUBLIC_PARVEX_TEST_CONTRACTS;
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<Record<NetKey, Deployment>>;
    const out = { ...DEPLOYED };
    for (const k of NET_KEYS) if (v[k] && isAddress(v[k]!.settler)) out[k] = { ...DEPLOYED[k], ...v[k]! };
    return out;
  } catch {
    return null;
  }
}

export const DEPLOYMENTS = testOverride() ?? DEPLOYED;
export const settlerOf = (net: NetKey) => (isAddress(DEPLOYMENTS[net].settler) ? DEPLOYMENTS[net].settler : null);
export const anySettler = () => NET_KEYS.some((k) => settlerOf(k) !== null);
export const testTokens = (net: NetKey): TestToken[] => DEPLOYMENTS[net].tokens ?? [];
export const CONTRACT_NAME = "ParvexMandateSettler" as const;

export const explorerAddressOn = (net: NetKey, a: string) => `${NETWORKS[net].explorer}/address/${a}`;
export const explorerTxOn = (net: NetKey, h: string) => `${NETWORKS[net].explorer}/tx/${h}`;
export const explorerTokenOn = (net: NetKey, a: string) => `${NETWORKS[net].explorer}/token/${a}`;
