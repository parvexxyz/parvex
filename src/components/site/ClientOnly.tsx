"use client";

import { useEffect, useState } from "react";

/* Renders its children after hydration only (they read the clock and this browser's storage). `fallback` shows meanwhile. */
export function ClientOnly({ children, fallback = null }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  const [ok, setOk] = useState(false);
  useEffect(() => setOk(true), []);
  return ok ? <>{children}</> : <>{fallback}</>;
}
