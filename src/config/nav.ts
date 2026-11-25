import { BRAND } from "@/config/brand";

export const NAV = [
  { href: "/terminal", label: "Terminal" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/method", label: "Method" },
  { href: "/token", label: BRAND.symbol },
] as const;

/** Every public route, for the sitemap. */
export const ROUTES = ["/", "/terminal", "/dashboard", "/method", "/token"] as const;
