import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

export const dynamic = "force-static";

// lastModified is the date each page's content last changed: bump it by hand when you edit that page.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE}/`, lastModified: "2026-11-23" },
    { url: `${SITE}/how-it-works`, lastModified: "2026-11-23" },
    { url: `${SITE}/how-to-review-a-chess-game`, lastModified: "2026-11-23" },
    { url: `${SITE}/brilliant-move`, lastModified: "2026-11-23" },
    { url: `${SITE}/chess-accuracy`, lastModified: "2026-11-23" },
  ];
}
