import type { Metadata } from "next";
import Link from "next/link";
import { VerdictLadder } from "@/components/landing/VerdictLadder";
import { QUALITY_DEPTH } from "@/lib/engine/pool";

export const metadata: Metadata = {
  title: "How it works",
  alternates: { canonical: "/how-it-works" },
};

const H2 = "text-[clamp(2rem,3.6vw,3.25rem)] leading-none font-extrabold tracking-[-0.035em] text-balance";
const P = "mt-4 max-w-[60ch] text-lg text-pretty text-muted";
const SECTION = "pt-16 lg:pt-24";

export default function HowItWorks() {
  return (
    <main className="mx-auto w-full max-w-[1400px] px-4 pt-5 pb-24 sm:px-8">
      <Link href="/" className="text-sm text-muted underline decoration-line underline-offset-4 hover:text-fg">
        &larr; Hindsight
      </Link>
      <h1 className="mt-10 text-[clamp(2.4rem,5.4vw,5.25rem)] leading-[0.95] font-extrabold tracking-[-0.04em] text-balance">
        How Hindsight Chess reviews a game
      </h1>
      <p className="mt-3 text-sm text-muted">Updated November 2026.</p>

      <section className={SECTION}>
        <h2 className={H2}>Engine</h2>
        <p className={P}>
          Stockfish 19 runs in your browser, so nothing is queued and there is no cap. Quick, standard and deep reviews search to depth {QUALITY_DEPTH.quick},{" "}
          {QUALITY_DEPTH.standard} and {QUALITY_DEPTH.deep}.
        </p>
      </section>

      <section className={SECTION}>
        <h2 className={H2}>Winning chances</h2>
        <p className={P}>The engine scores each position in centipawns (cp). Hindsight turns that into a chance of winning:</p>
        <p className="mt-4 font-mono text-base text-fg">win% = 50 + 50 &middot; (2 / (1 + e^(&minus;0.00368208 &middot; cp)) &minus; 1)</p>
        <p className={P}>A move is judged by how much of your winning chances it kept.</p>
      </section>

      <section className={SECTION}>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div>
            <h2 className={H2}>Verdicts</h2>
            <p className="mt-4 max-w-[38ch] text-lg text-pretty text-muted">Ten verdicts, by winning chances lost.</p>
          </div>
          <VerdictLadder />
        </div>
      </section>

      <section className={SECTION}>
        <h2 className={H2}>Accuracy</h2>
        <p className={P}>
          Each move&rsquo;s accuracy falls as it loses winning chances. Game accuracy is 90% the plain mean of those and 10% the harmonic mean, so one blunder still
          counts.
        </p>
        <p className={P}>
          The curve is fitted against Chess.com&rsquo;s own accuracies on 30 rated games across five rating bands. The mean error is 3.7 points.
        </p>
      </section>

      <section className={SECTION}>
        <h2 className={H2}>Limits</h2>
        <p className={P}>
          Browser engines search shallower than a desktop Stockfish. There is no volatility weighting. The coach comments are written by AI, so read them as a
          second opinion, not a verdict.
        </p>
      </section>

      <div className="mt-16 flex items-center gap-6 border-t border-line pt-10 lg:mt-24">
        <Link href="/" className="rounded-lg bg-accent px-7 py-4 text-lg font-bold text-[#141311] hover:brightness-110">
          Review my games
        </Link>
        <Link href="/" className="text-muted underline decoration-line underline-offset-4 hover:text-fg">
          Back to home
        </Link>
      </div>
    </main>
  );
}
