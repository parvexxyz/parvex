// Checks behind scripts/verify-deployment.mjs, free of I/O so they can be tested with a fake chain.
//
// How it decides that an address runs this repository's ParvexMandateSettler:
//   - Runtime code is compared byte for byte with src/lib/contracts/artifacts.json (`npm run contracts:artifacts -- --check`
//     proves that file is a fresh forge build), except the two immutable words, which are checked by value instead:
//     _cachedChainId must be the chain's id and _cachedDomain the EIP-712 domain separator for this chain and this address.
//   - The creation transaction is required (no tx => FAIL, never MATCH). It must have succeeded, created exactly the address
//     checked, have no recipient, and carry exactly this build's creation code (no constructor arguments).
// Every check fails closed: an RPC error, an empty or malformed answer is a FAIL, never a skip.
import { encodeAbiParameters, keccak256, toHex } from "viem";

/** Robinhood Chain mainnet and Robinhood Chain Testnet. */
export const CHAIN_IDS = { 4663: "Robinhood Chain", 46630: "Robinhood Chain Testnet" };
export const NAME = "ParvexMandateSettler";

const isAddr = (v) => typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v);
const isHex = (v) => typeof v === "string" && /^0x([0-9a-fA-F]{2})*$/.test(v);
const isTx = (v) => typeof v === "string" && /^0x[0-9a-fA-F]{64}$/.test(v);
const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

/** EIP-712 domain separator of the settler at `address` on `chainId` (same fields as the contract). */
export function domainSeparator(chainId, address) {
  const h = (s) => keccak256(toHex(s));
  return keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "bytes32" }, { type: "bytes32" }, { type: "uint256" }, { type: "address" }],
      [h("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"), h("Parvex Mandate Settler"), h("1"), BigInt(chainId), address],
    ),
  );
}

/**
 * Compares deployed runtime `code` with the build. Immutable ranges are masked for the byte comparison and their deployed
 * values are returned so the caller can check them. Returns { same, immutables: { name: hexWord } } or { same: false }.
 */
export function match(ART, name, code) {
  const a = ART[name];
  if (!a) return { same: false };
  const want = a.runtime.slice(2);
  const got = String(code).toLowerCase().replace(/^0x/, "");
  if (got.length !== want.length) return { same: false };
  let w = want;
  let g = got;
  const immutables = {};
  for (const r of a.immutables) {
    const s = r.start * 2;
    const l = r.length * 2;
    immutables[r.name] = `0x${got.slice(s, s + l)}`;
    w = w.slice(0, s) + "0".repeat(l) + w.slice(s + l);
    g = g.slice(0, s) + "0".repeat(l) + g.slice(s + l);
  }
  return { same: w === g, immutables };
}

/** input: { settler, settlerTx, rpc, ART }. Returns { ok, lines, chainId }. */
export async function verifyDeployment({ settler, settlerTx, rpc, ART }) {
  const lines = [];
  let failed = false;
  let chainId = 0;
  const ok = (m) => lines.push(`OK   ${m}`);
  const fail = (m) => {
    failed = true;
    lines.push(`FAIL ${m}`);
  };
  const done = () => ({ ok: !failed, lines, chainId });

  try {
    chainId = Number(BigInt(await rpc("eth_chainId", [])));
    if (!CHAIN_IDS[chainId]) {
      fail(`chain id ${chainId}, expected 4663 (Robinhood Chain) or 46630 (Robinhood Chain Testnet)`);
      return done();
    }
    ok(`chain id ${chainId} (${CHAIN_IDS[chainId]})`);
  } catch (e) {
    fail(`chain id unreadable: ${e.message}`);
    return done();
  }
  if (!isAddr(settler)) {
    fail("give --settler <address>");
    return done();
  }
  try {
    const c = await rpc("eth_getCode", [settler, "latest"]);
    if (!isHex(c) || c.length <= 2) throw new Error(`no code at ${settler}`);
    const m = match(ART, NAME, c);
    if (!m.same) fail(`${NAME} at ${settler}: runtime differs from this build`);
    else {
      ok(`${NAME} at ${settler}: runtime matches this build outside the two immutable words`);
      const cid = m.immutables._cachedChainId;
      const dom = m.immutables._cachedDomain;
      if (cid && BigInt(cid) === BigInt(chainId)) ok(`immutable _cachedChainId = ${chainId}`);
      else fail(`immutable _cachedChainId = ${cid}, expected ${chainId}`);
      if (dom && same(dom, domainSeparator(chainId, settler))) ok("immutable _cachedDomain = EIP-712 domain of this chain and address");
      else fail(`immutable _cachedDomain = ${dom}, not the domain of this chain and address`);
    }
  } catch (e) {
    fail(`${NAME}: ${e.message}`);
  }
  if (!isTx(settlerTx)) {
    fail(`${NAME}: no valid creation tx given; runtime alone is not a full match`);
    return done();
  }
  try {
    const [t, rc] = await Promise.all([rpc("eth_getTransactionByHash", [settlerTx]), rpc("eth_getTransactionReceipt", [settlerTx])]);
    if (!t || !rc) fail(`${NAME}: creation tx ${settlerTx} not found`);
    else if (rc.status !== "0x1") fail(`${NAME}: creation tx failed`);
    else if (!same(rc.contractAddress, settler)) fail(`${NAME}: tx created ${rc.contractAddress}, not ${settler}`);
    else if (t.to) fail(`${NAME}: tx has a recipient, not a deployment`);
    else if (String(t.input).toLowerCase() === ART[NAME].creation.toLowerCase()) ok(`${NAME}: creation input is exactly this build's creation code`);
    else fail(`${NAME}: creation input differs from this build`);
  } catch (e) {
    fail(`${NAME}: creation tx unreadable: ${e.message}`);
  }
  return done();
}
