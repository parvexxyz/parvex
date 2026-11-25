import { QUOTE_TOKENS } from "@/config/dex";
import { ERC20_ABI } from "@/lib/abi";
import { allowPublic, tooMany } from "@/lib/guard";
import { reads } from "@/lib/server/chainread";
import { fail, ok } from "@/lib/server/respond";
import { getStore } from "@/lib/server/store";
import { readBoard } from "@/lib/server/stocks";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/*
 * GET /api/assets → what a Parvex mandate may trade on Robinhood Chain mainnet, read live:
 *   - assets: Robinhood stock tokens proven on chain (proxy code hash + beacon slot + minted supply), with their Chainlink feeds;
 *   - quotes: USDG and WETH at their fixed addresses, symbol() and decimals() read now (a mismatch drops the token).
 * The CDN may keep it 10 s; the stock board itself refreshes at most every 45 s and never caches a failed read.
 */
export async function GET(request: Request) {
  if (!(await allowPublic(getStore(), request, "assets", 60, 1200))) return tooMany();
  try {
    const [board, meta] = await Promise.all([
      readBoard(),
      reads(QUOTE_TOKENS.flatMap((t) => [{ to: t.address, abi: ERC20_ABI, fn: "symbol" }, { to: t.address, abi: ERC20_ABI, fn: "decimals" }])),
    ]);
    if (!board.stocks.length) return fail(new Error("no board"));
    const quotes = QUOTE_TOKENS.map((t, i) => {
      const sym = meta[2 * i];
      const dec = meta[2 * i + 1];
      const okSym = sym.kind === "ok" && sym.value === t.symbol;
      const okDec = dec.kind === "ok" && Number(dec.value) === t.decimals;
      return { ...t, checked: okSym && okDec, readNow: sym.kind === "ok" && dec.kind === "ok" };
    });
    return ok({ stocks: board.stocks, quotes, ethUsd: board.ethUsd, head: board.head, readAt: board.readAt, complete: board.complete, candidates: board.candidates, unknown: board.unknown });
  } catch (e) {
    return fail(e);
  }
}
