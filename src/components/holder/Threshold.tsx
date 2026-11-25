"use client";

import { fromUnits } from "@/lib/otc/netmath";
import { useJson } from "@/lib/useJson";

/** The live threshold (0.1 % of totalSupply) read from the token, or "Unlocks at launch" before it exists. */
export function Threshold() {
  const { data, error } = useJson<{ token: string | null; supply: string | null; threshold: string | null; block: number | null; checkedAt: number; note: string | null }>("/api/holder", 60_000);
  return (
    <div className="note" data-testid="threshold">
      {data ? (
        data.token && data.threshold ? (
          <>
            Threshold now: <b>{fromUnits(BigInt(data.threshold), 18, 4)}</b> of {fromUnits(BigInt(data.supply ?? "0"), 18, 0)} supply, read at block {data.block?.toLocaleString("en-US")}, {new Date(data.checkedAt).toISOString().slice(11, 19)} UTC.
          </>
        ) : (
          <>Holder tier: {data.note ?? "Unlocks at launch."} The free tier works fully today.</>
        )
      ) : error ? (
        `Threshold unavailable: ${error}`
      ) : (
        "Reading the token…"
      )}
    </div>
  );
}
