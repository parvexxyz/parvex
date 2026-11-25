import { BRAND } from "@/config/brand";

/*
 * Where a holder session may be signed for: a FIXED list from config, never the request's Host or X-Forwarded-Host header.
 *   - the brand domain and its www host;
 *   - while the domain is not live, the deployment's own *.vercel.app hosts as set by the platform (VERCEL_PROJECT_PRODUCTION_URL,
 *     VERCEL_URL: environment, not request data);
 *   - off Vercel only (a local run): localhost / 127.0.0.1 on this project's ports 6700-6704.
 */
export const LOCAL_PORTS = [6700, 6701, 6702, 6703, 6704];

export function allowedDomains(env: Record<string, string | undefined> = process.env): string[] {
  const list = [BRAND.domain, `www.${BRAND.domain}`];
  for (const v of [env.VERCEL_PROJECT_PRODUCTION_URL, env.VERCEL_URL]) if (v && /^[a-z0-9.-]+\.vercel\.app$/.test(v)) list.push(v);
  if (!env.VERCEL) for (const p of LOCAL_PORTS) list.push(`localhost:${p}`, `127.0.0.1:${p}`);
  return list;
}
