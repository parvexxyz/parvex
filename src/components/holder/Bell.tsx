"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useWallet } from "@/components/wallet/WalletProvider";
import { storageKey } from "@/config/storage";
import { deriveAlerts, type Alert } from "@/lib/alerts";

/*
 * Alerts, free for everyone, web only (owner, 25 Nov 2026). Level 1: this bell, an inbox computed from public data for the
 * connected wallet (settled deals from the settler's events, matches / counter-offers / expiring orders from the board), unread
 * since your last look. Level 2: browser notifications (Notification API) while a tab of the site is open, after "Enable".
 * No email, no Telegram, no push service, nothing stored on a server.
 */

const read = (k: string): string[] => {
  try {
    return JSON.parse(window.localStorage.getItem(k) ?? "[]");
  } catch {
    return [];
  }
};
const write = (k: string, v: string[]) => {
  try {
    window.localStorage.setItem(k, JSON.stringify(v.slice(-400)));
  } catch {}
};

export function Bell() {
  const { address, net } = useWallet();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [seen, setSeen] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [perm, setPerm] = useState<string>("default");
  const btn = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState({ top: 80, right: 16 });
  const kSeen = address ? storageKey("seen", address.toLowerCase()) : "";
  const kNote = address ? storageKey("notified", address.toLowerCase()) : "";

  useEffect(() => {
    setPerm(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  }, []);
  useEffect(() => {
    setSeen(kSeen ? read(kSeen) : []);
  }, [kSeen]);

  const poll = useCallback(async () => {
    if (!address || document.visibilityState !== "visible") return;
    const [b, d] = await Promise.all([fetch(`/api/board?net=${net}`).then((r) => (r.ok ? r.json() : null)).catch(() => null), fetch(`/api/desk?net=${net}`).then((r) => (r.ok ? r.json() : null)).catch(() => null)]);
    const list = deriveAlerts(address, d?.proofs ?? [], b?.listings ?? [], Math.floor(Date.now() / 1000));
    setAlerts(list);
    if (typeof Notification !== "undefined" && Notification.permission === "granted" && kNote) {
      const done = new Set(read(kNote));
      const fresh = list.filter((a) => !done.has(a.id) && !read(kSeen).includes(a.id));
      for (const a of fresh.slice(0, 3)) {
        try {
          new Notification(`Parvex: ${a.title}`, { body: a.body, tag: a.id });
        } catch {}
      }
      write(kNote, [...done, ...fresh.map((a) => a.id)]);
    }
  }, [address, net, kNote, kSeen]);

  useEffect(() => {
    poll();
    const t = setInterval(poll, 20_000);
    window.addEventListener("px-board", poll);
    return () => {
      clearInterval(t);
      window.removeEventListener("px-board", poll);
    };
  }, [poll]);

  if (!address) return null;
  const unread = alerts.filter((a) => !seen.includes(a.id));

  function toggle() {
    const r = btn.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right) });
    if (open && kSeen) {
      const next = [...new Set([...seen, ...alerts.map((a) => a.id)])];
      setSeen(next);
      write(kSeen, next);
    }
    setOpen(!open);
  }

  return (
    <>
      <button ref={btn} type="button" className="rq-iconbtn relative" aria-label={`Alerts, ${unread.length} unread`} onClick={toggle} data-testid="bell">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
          <path d="M4 11V7a4 4 0 0 1 8 0v4l1.2 1.5H2.8zM6.5 14h3" />
        </svg>
        {unread.length ? (
          <span className="absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[var(--neon)] px-1 text-[10px] font-semibold text-black" data-testid="bell-count">
            {unread.length}
          </span>
        ) : null}
      </button>
      {open
        ? createPortal(
            <div className="rq-menu" style={{ top: pos.top, right: pos.right, width: "min(340px, calc(100vw - 16px))" }} role="dialog" aria-label="Alerts" data-testid="bell-panel">
              <p className="rq-label">Alerts · {net}</p>
              <div className="mt-2 max-h-[340px] overflow-y-auto">
                {alerts.map((a) => (
                  <Link key={a.id} href={a.href} className="rq-menu-item block" onClick={toggle} data-testid="bell-item">
                    <span className="block font-medium">
                      {!seen.includes(a.id) ? "● " : ""}
                      {a.title}
                    </span>
                    <span className="block text-[12px] text-[var(--text-2)]">{a.body}</span>
                  </Link>
                ))}
                {!alerts.length ? <p className="py-3 text-[13px] text-[var(--text-2)]">Nothing yet. Settled deals, matches, counter-offers and orders about to expire show here.</p> : null}
              </div>
              <div className="mt-3 border-t border-[var(--sline)] pt-3">
                {perm === "granted" ? (
                  <p className="text-[12px] text-[var(--text-2)]">Browser notifications on while a Parvex tab is open.</p>
                ) : perm === "denied" ? (
                  <p className="text-[12px] text-[var(--text-2)]">Browser notifications are blocked for this site in your browser settings.</p>
                ) : perm === "unsupported" ? (
                  <p className="text-[12px] text-[var(--text-2)]">This browser has no notifications.</p>
                ) : (
                  <button type="button" className="rq-btn w-full" onClick={() => Notification.requestPermission().then(setPerm)} data-testid="bell-enable">
                    Enable browser notifications
                  </button>
                )}
                <p className="mt-2 text-[11px] text-[var(--text-2)]">Free for everyone. Web only: no email, no push service. Read from public chain data and the board.</p>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
