"use client";

import { useCallback, useEffect, useState } from "react";
import { useWallet } from "@/components/wallet/WalletProvider";
import { storageKey } from "@/config/storage";
import { buildSessionMessage, newSessionFields } from "@/lib/holder/session";

/*
 * The signed holder session (bearer credential, sessionStorage only: gone when the tab closes) and the tier the server reads for it.
 * Shared by the holder panel, the board and the counterparty list through a window event.
 */

export type Session = { message: string; signature: string; address: string; expiresAt: number };
export type TierView = {
  address: string;
  tier: "free" | "holder";
  token: string | null;
  balance: string | null;
  supply: string | null;
  threshold: string | null;
  sharePct: number | null;
  block: number | null;
  checkedAt: number;
  note: string | null;
  quotas: { liveOrders: number; savedCounterparties: number };
  persistent: boolean;
};

const KEY = storageKey("session");
const EVT = "px-session";

function load(): Session | null {
  try {
    const s = JSON.parse(window.sessionStorage.getItem(KEY) ?? "null") as Session | null;
    return s && s.expiresAt > Date.now() / 1000 ? s : null;
  } catch {
    return null;
  }
}

export function useHolder() {
  const { address, signMessage } = useWallet();
  const [session, setSession] = useState<Session | null>(null);
  const [tier, setTier] = useState<TierView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const read = () => {
      const s = load();
      setSession(s && address && s.address === address.toLowerCase() ? s : null);
    };
    read();
    window.addEventListener(EVT, read);
    return () => window.removeEventListener(EVT, read);
  }, [address]);

  const refresh = useCallback(async (s: Session | null = session) => {
    if (!s) return setTier(null);
    const res = await fetch("/api/holder", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ session: { message: s.message, signature: s.signature } }) });
    const j = await res.json().catch(() => null);
    if (!res.ok) {
      setError(j?.error ?? `Tier check failed (${res.status}).`);
      setTier(null);
      return;
    }
    setError(null);
    setTier(j as TierView);
  }, [session]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const signIn = useCallback(async () => {
    if (!address) return;
    setBusy(true);
    setError(null);
    try {
      const f = newSessionFields(window.location.origin, address, Math.floor(Date.now() / 1000));
      const message = buildSessionMessage(f);
      const signature = await signMessage(message);
      const s: Session = { message, signature, address: f.address, expiresAt: f.expiresAt };
      try {
        window.sessionStorage.setItem(KEY, JSON.stringify(s));
      } catch {
        // storage blocked: the session lives in memory for this page
      }
      setSession(s);
      window.dispatchEvent(new Event(EVT));
      await refresh(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Signing failed.");
    } finally {
      setBusy(false);
    }
  }, [address, signMessage, refresh]);

  const signOut = useCallback(() => {
    // Revoke on the server too, so the signed message cannot be replayed until it expires.
    if (session) fetch("/api/holder", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "signout", session: { message: session.message, signature: session.signature } }) }).catch(() => {});
    try {
      window.sessionStorage.removeItem(KEY);
    } catch {}
    setSession(null);
    setTier(null);
    window.dispatchEvent(new Event(EVT));
  }, [session]);

  /** POST with the session attached. */
  const call = useCallback(
    async (url: string, body: Record<string, unknown>) => {
      if (!session) throw new Error("Sign a holder session first.");
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, session: { message: session.message, signature: session.signature } }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error ?? `Request failed (${res.status}).`);
      return j;
    },
    [session],
  );

  return { address, session, tier, busy, error, signIn, signOut, refresh, call };
}
