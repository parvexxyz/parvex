"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NAV } from "@/config/nav";
import { Wordmark } from "@/components/site/Mark";
import { CloseIcon } from "@/components/site/Icons";
import { NavWallet } from "@/components/wallet/WalletButton";
import { CaBox } from "@/components/site/CaCopy";
import { useFocusTrap } from "@/components/site/useFocusTrap";

/* The reference's header: wordmark left; a dark nav pill of mono links, a light Connect button and the neon action right.
   Fixed; slides away while scrolling down and comes back on the way up (transform .2s). */
export function SiteHeader() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [hide, setHide] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    let last = window.scrollY;
    const on = () => {
      const y = window.scrollY;
      setScrolled(y > 40);
      if (Math.abs(y - last) > 6) setHide(y > last && y > 160);
      last = y;
    };
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <>
      <header className={`hd ${hide && !open ? "hide" : ""} ${scrolled ? "scrolled" : ""}`} data-testid="header">
        <div className="wrap">
          <div className="hd-bar">
            <Link href="/" aria-label="Parvex home" className="shrink-0">
              <Wordmark size={26} />
            </Link>
            <nav aria-label="Main" className="hd-nav">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} aria-current={path === n.href || path.startsWith(`${n.href}/`) ? "page" : undefined}>
                  {n.label}
                </Link>
              ))}
            </nav>
            <div className="ml-auto flex min-w-0 items-center gap-2 lg:ml-1">
              <NavWallet label="Connect wallet" />
              <Link href="/terminal" className="btn btn-neon hidden lg:inline-flex">
                Open terminal
              </Link>
              <button type="button" className="rq-iconbtn lg:hidden" aria-label="Open the menu" aria-expanded={open} onClick={() => setOpen(true)} data-testid="menu-open">
                <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
                  <circle cx="5" cy="5" r="1.8" fill="currentColor" />
                  <circle cx="13" cy="5" r="1.8" fill="currentColor" />
                  <circle cx="5" cy="13" r="1.8" fill="currentColor" />
                  <circle cx="13" cy="13" r="1.8" fill="currentColor" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </header>
      {open ? <MobileMenu onClose={() => setOpen(false)} path={path} /> : null}
    </>
  );
}

function MobileMenu({ onClose, path }: { onClose: () => void; path: string }) {
  const trap = useRef<HTMLDivElement>(null);
  useFocusTrap(trap, true, onClose);
  return createPortal(
    <div className="hd-menu" role="dialog" aria-modal="true" aria-label="Menu" ref={trap} data-testid="menu">
      <div className="wrap flex h-[82px] items-center justify-between">
        <span className="text-[var(--text)]">
          <Wordmark size={24} />
        </span>
        <button type="button" className="rq-iconbtn" aria-label="Close the menu" onClick={onClose}>
          <CloseIcon size={16} />
        </button>
      </div>
      <nav className="wrap mt-2" aria-label="Main">
        {[{ href: "/", label: "Home" }, ...NAV].map((n) => (
          <Link key={n.href} href={n.href} onClick={onClose} className="big" aria-current={path === n.href ? "page" : undefined}>
            {n.label}
          </Link>
        ))}
      </nav>
      <div className="sheet wrap mt-8 grid gap-3 pb-10" style={{ background: "transparent" }}>
        <Link href="/terminal" className="btn btn-neon w-full" onClick={onClose}>
          Open terminal
        </Link>
        <CaBox testid="menu-ca" />
      </div>
    </div>,
    document.body,
  );
}
