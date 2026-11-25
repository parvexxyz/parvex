import type { Metadata } from "next";
import { BRAND, CHAIN, hasGithub } from "@/config/brand";

export const HOME_TITLE = `${BRAND.name} | ${BRAND.slogan.replace(/\.$/, "")}`;
export const HOME_DESCRIPTION = `OTC negotiation terminal for ${BRAND.chainName}: buyer and seller mandates with price limits and expiry, a rule-based agent that counters inside both limits, net-after-fee checks with every number shown, and one atomic, non-custodial swap both wallets sign.`;

/**
 * Per-route metadata in one shape: a unique title, a description written for
 * the search result, a canonical URL on the production domain, and matching
 * Open Graph / X cards. The share image comes from the opengraph-image and
 * twitter-image files in src/app, which every route inherits.
 */
export function pageMeta({
  path,
  title,
  description,
  noindex = false,
  type = "website",
}: {
  path: string;
  title: string;
  description: string;
  noindex?: boolean;
  type?: "website" | "article";
}): Metadata {
  const url = `${BRAND.url}${path === "/" ? "" : path}`;
  // Child routes that set openGraph replace the inherited file-based image, so name it explicitly.
  const images = [{ url: "/opengraph-image.jpg?v=7cf95f7a", width: 1200, height: 630, alt: `Parvex share card: neon green ribbons on black, the line Agree inside your limits. Settle in one swap., and the Parvex mark.` }];
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    openGraph: { type, url, siteName: BRAND.name, title, description, locale: "en_US", images },
    twitter: { card: "summary_large_image", site: BRAND.xHandle, creator: BRAND.xHandle, title, description, images: [{ url: "/twitter-image.jpg?v=7cf95f7a", alt: `Parvex share card: neon green ribbons on black, the line Agree inside your limits. Settle in one swap., and the Parvex mark.` }] },
    robots: noindex ? { index: false, follow: true } : undefined,
  };
}

export type Crumb = { name: string; path: string };

export function breadcrumbLd(trail: Crumb[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [{ name: "Home", path: "/" }, ...trail].map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: `${BRAND.url}${c.path === "/" ? "" : c.path}`,
    })),
  };
}

export function faqLd(items: { q: string; a: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((i) => ({ "@type": "Question", name: i.q, acceptedAnswer: { "@type": "Answer", text: i.a } })),
  };
}

export const siteLd = [
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${BRAND.url}/#org`,
    name: BRAND.name,
    url: BRAND.url,
    logo: `${BRAND.url}/icon.png`,
    // Only real profiles: the GitHub link joins once the public repository exists.
    sameAs: [BRAND.x, ...(hasGithub ? [BRAND.github] : [])],
    description: BRAND.description,
  },
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${BRAND.url}/#site`,
    name: BRAND.name,
    url: BRAND.url,
    inLanguage: "en",
    publisher: { "@id": `${BRAND.url}/#org` },
  },
];

export const appLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: BRAND.name,
  url: BRAND.url,
  applicationCategory: "FinanceApplication",
  operatingSystem: "Any (web browser)",
  description: `OTC negotiation terminal on ${CHAIN.name}: mandates with price limits, a rule-based counter-offer agent, net-after-fee checks and one atomic swap signed by both wallets.`,
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  publisher: { "@id": `${BRAND.url}/#org` },
};

/** Serialise JSON-LD for a script tag; "<" is escaped so a value can never close the tag. */
export function ldJson(data: unknown) {
  return { __html: JSON.stringify(data).replace(/</g, "\\u003c") };
}
