// verify-lib against a fake chain built from this build's artifacts: a true deployment matches on mainnet and testnet; a foreign
// runtime, wrong immutables, a wrong chain, extra constructor bytes, a missing tx or a tx for another address each fail.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { domainSeparator, match, verifyDeployment } from "./verify-lib.mjs";

const ART = JSON.parse(readFileSync(new URL("../src/lib/contracts/artifacts.json", import.meta.url), "utf8")).contracts;
const A = (n) => "0x" + n.toString(16).padStart(40, "0");
const SET = A(0xb00c);
const TX1 = "0x" + "01".repeat(32);
const R = ART.ParvexMandateSettler;

/** The runtime a real deployment at `addr` on `chainId` would hold: immutables filled in. */
function deployed(chainId, addr, over = {}) {
  let code = R.runtime.slice(2);
  for (const r of R.immutables) {
    const v = over[r.name] ?? (r.name === "_cachedChainId" ? BigInt(chainId).toString(16).padStart(64, "0") : domainSeparator(chainId, addr).slice(2));
    code = code.slice(0, r.start * 2) + v + code.slice(r.start * 2 + r.length * 2);
  }
  return `0x${code}`;
}

function chain(over = {}) {
  const cid = over.cid ?? 4663;
  const codes = { [SET]: over.code ?? deployed(cid, SET), ...over.codes };
  const txs = { [TX1]: { input: over.input ?? R.creation, to: over.to ?? null, created: over.created ?? SET, status: over.status ?? "0x1" } };
  return async (method, params) => {
    if (method === "eth_chainId") return over.chainId ?? `0x${cid.toString(16)}`;
    if (method === "eth_getCode") return codes[params[0].toLowerCase()] ?? "0x";
    if (method === "eth_getTransactionByHash") return txs[params[0]] ? { input: txs[params[0]].input, to: txs[params[0]].to } : null;
    if (method === "eth_getTransactionReceipt") return txs[params[0]] ? { status: txs[params[0]].status, contractAddress: txs[params[0]].created } : null;
    throw new Error(`unexpected ${method}`);
  };
}
const run = (over = {}, args = {}) => verifyDeployment({ settler: SET, settlerTx: TX1, rpc: chain(over), ART, ...args });

test("the settler has exactly two named immutables and matches a filled runtime", () => {
  assert.deepEqual([...new Set(R.immutables.map((i) => i.name))].sort(), ["_cachedChainId", "_cachedDomain"]);
  assert.equal(match(ART, "ParvexMandateSettler", deployed(4663, SET)).same, true);
});

test("a true deployment matches on Robinhood Chain and on its testnet", async () => {
  const r = await run();
  assert.equal(r.ok, true, r.lines.join("\n"));
  const t = await run({ cid: 46630 });
  assert.equal(t.ok, true, t.lines.join("\n"));
});

test("every way to be wrong fails", async () => {
  const zero = "0".repeat(64);
  assert.equal((await run({ chainId: "0x1" })).ok, false);
  assert.equal((await run({ code: "0x6000" })).ok, false);
  assert.equal((await run({ code: deployed(4663, SET, { _cachedDomain: zero }) })).ok, false);
  assert.equal((await run({ code: deployed(46630, SET) })).ok, false, "testnet code on mainnet");
  assert.equal((await run({ code: deployed(4663, A(7)) })).ok, false, "domain of another address");
  assert.equal((await run({ input: R.creation + "00" })).ok, false);
  assert.equal((await run({ created: A(1) })).ok, false);
  assert.equal((await run({ status: "0x0" })).ok, false);
  assert.equal((await run({ to: A(5) })).ok, false);
  assert.equal((await run({}, { settlerTx: undefined })).ok, false);
  assert.equal((await run({}, { settler: "nope" })).ok, false);
  assert.equal((await verifyDeployment({ settler: SET, settlerTx: TX1, rpc: async () => { throw new Error("down"); }, ART })).ok, false);
});
