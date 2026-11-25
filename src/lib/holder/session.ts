import { getAddress, recoverMessageAddress, type Hex } from "viem";

/*
 * Holder session without any server secret, as an EIP-4361 (Sign-In with Ethereum) message, so wallets that know the format warn
 * when the domain does not match the page. The wallet signs ONE message (personal_sign, no gas). The signed message is the bearer
 * credential: the browser keeps it in sessionStorage and sends it with every holder request, and the server re-verifies on EVERY
 * request: signature, a domain and URI from a FIXED allowlist (config, never the request's Host header), chain id 4663, version 1,
 * issued-at / expiration (at most 4 h). Signing out records the nonce as revoked until it expires (KV when configured, memory
 * otherwise), so a dropped session cannot be replayed. EOA only in v1 (no ERC-1271 for sessions).
 */

export const SESSION_CHAIN_ID = 4663;
export const MAX_SESSION_SECONDS = 4 * 3600;
export const STATEMENT = "Sign in to Parvex to read your $PARVEX holder tier. This costs no gas and moves nothing.";

export type SessionFields = { domain: string; uri: string; address: string; chainId: number; nonce: string; issuedAt: number; expiresAt: number };

const iso = (t: number) => new Date(t * 1000).toISOString();

export function buildSessionMessage(f: SessionFields) {
  return [
    `${f.domain} wants you to sign in with your Ethereum account:`,
    getAddress(f.address),
    "",
    STATEMENT,
    "",
    `URI: ${f.uri}`,
    "Version: 1",
    `Chain ID: ${f.chainId}`,
    `Nonce: ${f.nonce}`,
    `Issued At: ${iso(f.issuedAt)}`,
    `Expiration Time: ${iso(f.expiresAt)}`,
  ].join("\n");
}

export function parseSessionMessage(m: string): SessionFields | null {
  const lines = m.split("\n");
  if (lines.length !== 11) return null;
  const head = /^(\S+) wants you to sign in with your Ethereum account:$/.exec(lines[0]);
  if (!head || !/^0x[0-9a-fA-F]{40}$/.test(lines[1])) return null;
  const get = (k: string) => {
    const l = lines.find((x) => x.startsWith(`${k}: `));
    return l ? l.slice(k.length + 2) : null;
  };
  const uri = get("URI");
  const chainId = Number(get("Chain ID"));
  const nonce = get("Nonce");
  const issuedAt = Date.parse(get("Issued At") ?? "") / 1000;
  const expiresAt = Date.parse(get("Expiration Time") ?? "") / 1000;
  if (get("Version") !== "1" || !uri || !nonce || !/^[0-9a-zA-Z]{16,64}$/.test(nonce) || !Number.isFinite(chainId) || !Number.isFinite(issuedAt) || !Number.isFinite(expiresAt)) return null;
  const f: SessionFields = { domain: head[1], uri, address: lines[1].toLowerCase(), chainId, nonce, issuedAt, expiresAt };
  // Exactly the canonical text: nothing extra can ride along.
  return buildSessionMessage(f) === m ? f : null;
}

export type SessionCheck = { ok: true; address: string; expiresAt: number; nonce: string } | { ok: false; reason: string };

/** Verifies a signed session against a fixed list of allowed domains (host[:port]) at `now` (unix seconds). */
export async function verifySession(message: string, signature: string, allowed: readonly string[], now: number, revoked?: (nonce: string) => Promise<boolean>): Promise<SessionCheck> {
  if (typeof message !== "string" || message.length > 1200 || typeof signature !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(signature)) return { ok: false, reason: "Malformed session." };
  const f = parseSessionMessage(message);
  if (!f) return { ok: false, reason: "Not a Parvex sign-in message (EIP-4361)." };
  if (!allowed.includes(f.domain)) return { ok: false, reason: `Signed for ${f.domain}, which is not this site.` };
  let uriHost = "";
  try {
    const u = new URL(f.uri);
    uriHost = u.host;
    if (u.protocol !== "https:" && !/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(u.host)) return { ok: false, reason: "The URI must be https." };
  } catch {
    return { ok: false, reason: "Bad URI." };
  }
  if (uriHost !== f.domain) return { ok: false, reason: "URI and domain differ." };
  if (f.chainId !== SESSION_CHAIN_ID) return { ok: false, reason: `Signed for chain ${f.chainId}, not ${SESSION_CHAIN_ID}.` };
  if (f.expiresAt <= f.issuedAt || f.expiresAt - f.issuedAt > MAX_SESSION_SECONDS) return { ok: false, reason: "Session lifetime above 4 h." };
  if (f.issuedAt > now + 300) return { ok: false, reason: "Session issued in the future." };
  if (now > f.expiresAt) return { ok: false, reason: "Session expired. Sign in again." };
  let signer: string;
  try {
    signer = await recoverMessageAddress({ message, signature: signature as Hex });
  } catch {
    return { ok: false, reason: "Bad signature." };
  }
  if (signer.toLowerCase() !== f.address) return { ok: false, reason: "The signature is not from this wallet." };
  if (revoked && (await revoked(f.nonce))) return { ok: false, reason: "This session was signed out." };
  return { ok: true, address: f.address, expiresAt: f.expiresAt, nonce: f.nonce };
}

/** Fields for a new session on the page's own origin (the server still checks it against its allowlist). */
export function newSessionFields(origin: string, address: string, now: number, hours = 4): SessionFields {
  const u = new URL(origin);
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return { domain: u.host, uri: `${u.protocol}//${u.host}`, address: address.toLowerCase(), chainId: SESSION_CHAIN_ID, nonce: Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(""), issuedAt: now, expiresAt: now + Math.min(hours, 4) * 3600 };
}
