import type { Metadata } from "next";

export const SITE = "https://hindsight.almadih.dev";
export const SITE_NAME = "Hindsight Chess";
export const APK_URL = "https://github.com/Almadih/hindsight/releases/latest/download/hindsight.apk";
export const RELEASES_URL = "https://github.com/Almadih/hindsight/releases/latest";
export const REPO_URL = "https://github.com/Almadih/hindsight";
export const AUTHOR_ID = `${SITE}/#author`;
// app/opengraph-image.png; a page's own openGraph object drops the inherited image, so pages pass it back.
const OG_IMAGE = { url: "/opengraph-image.png", width: 1200, height: 630 };

/** Per-page metadata. Next replaces a nested openGraph object instead of merging it, so every field is set here. */
export function pageMeta(path: string, title: string, description: string): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { type: "article", siteName: SITE_NAME, url: path, title: `${title} · ${SITE_NAME}`, description, images: [OG_IMAGE] },
    twitter: { card: "summary_large_image", images: [OG_IMAGE.url] },
  };
}

/** TechArticle + BreadcrumbList for an explainer page; `modified` is the date its content last changed. */
export function articleLd(path: string, headline: string, description: string, modified: string) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "TechArticle",
        headline,
        description,
        url: `${SITE}${path}`,
        dateModified: modified,
        inLanguage: "en",
        author: { "@id": AUTHOR_ID },
        publisher: { "@id": AUTHOR_ID },
        isPartOf: { "@type": "WebSite", name: SITE_NAME, url: SITE },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: SITE },
          { "@type": "ListItem", position: 2, name: headline, item: `${SITE}${path}` },
        ],
      },
    ],
  };
}
