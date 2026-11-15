import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: "https://hindsight.almadih.dev/" },
    { url: "https://hindsight.almadih.dev/how-it-works" },
  ];
}
