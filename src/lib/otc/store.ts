"use client";

import { storageKey } from "@/config/storage";
import type { NetKey } from "@/config/contracts";
import type { Asset, Mandate } from "./types";

/*
 * What the terminal keeps in this browser only: your mandates, the orders you signed or imported, and a log of offers, refusals,
 * approvals and settlements (the dashboard reads it). Nothing here is sent to a server. Blocked storage reads as empty.
 */

const K_BOOK = storageKey("book");
const K_SIGS = storageKey("sigs");
const K_LOG = storageKey("log");

const big = (_: string, v: unknown) => (typeof v === "bigint" ? { $b: v.toString() } : v);
const unbig = (_: string, v: unknown) => (v && typeof v === "object" && "$b" in (v as object) ? BigInt((v as { $b: string }).$b) : v);

function load<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw, unbig) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value, big));
  } catch {
    // storage blocked: the session still works, it just is not kept
  }
}

export const loadBook = () => load<Mandate[]>(K_BOOK, []);
export const saveBook = (b: Mandate[]) => save(K_BOOK, b.filter((m) => m.source !== "sample"));

export type SignedEntry = { mandateId: string; net: NetKey; chainId: number; settler: string; order: Record<string, unknown>; signature: string; at: number; how: "signature" | "on-chain approval" | "imported" };
export const loadSigs = () => load<SignedEntry[]>(K_SIGS, []);
export const saveSigs = (s: SignedEntry[]) => save(K_SIGS, s.slice(-200));

export type LogKind = "offer" | "agreed" | "no-deal" | "refused" | "signed" | "approved" | "allowance" | "settled" | "practice-settled" | "cancelled";
export type LogEntry = { at: number; kind: LogKind; net: NetKey | "practice"; title: string; detail: string; tx?: string; mask?: string };
export const loadLog = () => load<LogEntry[]>(K_LOG, []);
export function addLog(e: Omit<LogEntry, "at">) {
  const list = loadLog();
  list.push({ ...e, at: Date.now() });
  save(K_LOG, list.slice(-300));
  window.dispatchEvent(new Event("px-log"));
}
export const clearLog = () => {
  save(K_LOG, []);
  window.dispatchEvent(new Event("px-log"));
};

export const assetKey = (a: Asset) => a.address.toLowerCase();
