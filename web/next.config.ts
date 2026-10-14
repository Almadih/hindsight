import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

const base: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

// Production is a static export served by the Python Worker (api/); rewrites aren't allowed with
// `output: "export"`, so only the dev server proxies /api to `pywrangler dev`.
export default function config(phase: string): NextConfig {
  if (phase === PHASE_DEVELOPMENT_SERVER) {
    return { ...base, rewrites: async () => [{ source: "/api/:path*", destination: "http://localhost:8787/api/:path*" }] };
  }
  return { ...base, output: "export" };
}
