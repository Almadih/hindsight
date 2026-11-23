import Link from "next/link";
import type { ReactNode } from "react";
import { JsonLd } from "./JsonLd";
import { articleLd } from "@/lib/site";

export const H2 = "text-[clamp(2rem,3.6vw,3.25rem)] leading-none font-extrabold tracking-[-0.035em] text-balance";
export const P = "mt-4 max-w-[60ch] text-lg text-pretty text-muted";
export const SECTION = "pt-16 lg:pt-24";
export const A = "underline decoration-line underline-offset-4 hover:text-fg";

const GUIDES = [
  ["/how-it-works", "How it works"],
  ["/how-to-review-a-chess-game", "How to review a chess game"],
  ["/brilliant-move", "What makes a move brilliant"],
  ["/chess-accuracy", "How chess accuracy works"],
] as const;

type Props = { path: string; title: string; description: string; modified: string; updated: string; children: ReactNode };

/** Layout for the explainer pages: back link, H1, freshness line, body, then a CTA and links to the other guides. */
export function ArticleShell({ path, title, description, modified, updated, children }: Props) {
  return (
    <main className="mx-auto w-full max-w-[1400px] px-4 pt-5 pb-24 sm:px-8">
      <JsonLd data={articleLd(path, title, description, modified)} />
      <Link href="/" className={`text-sm text-muted ${A}`}>
        &larr; Hindsight
      </Link>
      <h1 className="mt-10 text-[clamp(2.4rem,5.4vw,5.25rem)] leading-[0.95] font-extrabold tracking-[-0.04em] text-balance">{title}</h1>
      <p className="mt-3 text-sm text-muted">Updated {updated}.</p>

      {children}

      <div className="mt-16 flex flex-wrap items-center gap-6 border-t border-line pt-10 lg:mt-24">
        <Link href="/" className="rounded-lg bg-accent px-7 py-4 text-lg font-bold text-[#141311] hover:brightness-110">
          Review my games
        </Link>
        <nav aria-label="Guides" className="flex flex-wrap gap-x-6 gap-y-2 text-muted">
          {GUIDES.filter(([href]) => href !== path).map(([href, label]) => (
            <Link key={href} href={href} className={A}>
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </main>
  );
}
