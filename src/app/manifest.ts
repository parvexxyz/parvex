import type { MetadataRoute } from "next";
import { BRAND } from "@/config/brand";

// Install metadata with the placeholder tile (neon ground, black mark).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${BRAND.name}: OTC negotiation terminal`,
    short_name: BRAND.name,
    description: `OTC negotiation with clear limits and wallet approval on ${BRAND.chainName}.`,
    start_url: "/",
    display: "standalone",
    background_color: "#050605",
    theme_color: "#050605",
    icons: [
      { src: "/icon.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
