import Link from "next/link";
import { A, ArticleShell, H2, P, SECTION } from "@/components/ArticleShell";
import { VerdictLadder } from "@/components/landing/VerdictLadder";
import { DEMO } from "@/lib/demo-game";
import { QUALITY_DEPTH } from "@/lib/engine/pool";
import { BADGE } from "@/lib/review";
import { pageMeta, REPO_URL } from "@/lib/site";

const PATH = "/how-it-works";
const TITLE = "How Hindsight Chess reviews a game";
const DESCRIPTION =
  "How Hindsight turns Stockfish 19 scores into winning chances, move verdicts and accuracy, with worked examples and how it compares with Chess.com.";

export const metadata = pageMeta(PATH, "How it works", DESCRIPTION);

// Worked examples from the Opera Game demo; wBefore/wAfter are the mover's winning chances.
const byPly = (ply: number) => DEMO.moves.find((m) => m.ply === ply)!;
const MISTAKE = byPly(18);
const BRILLIANT = byPly(19);
const label = (m: typeof MISTAKE) => `${Math.ceil(m.ply / 2)}.${m.color === "black" ? ".." : ""} ${m.san}`;
const lost = (m: typeof MISTAKE) => (m.wBefore - m.wAfter).toFixed(1);

export default function HowItWorks() {
  return (
    <ArticleShell path={PATH} title={TITLE} description={DESCRIPTION} modified="2026-11-23" updated="November 2026">
      <section className={SECTION}>
        <h2 className={H2}>Engine</h2>
        <p className={P}>
          Stockfish 19 runs in your browser, so nothing is queued. You can start up to 60 new reviews a day; opening a game someone already reviewed is free. Quick,
          standard and deep reviews search to depth {QUALITY_DEPTH.quick}, {QUALITY_DEPTH.standard} and {QUALITY_DEPTH.deep}.
        </p>
      </section>

      <section className={SECTION}>
        <h2 className={H2}>Winning chances</h2>
        <p className={P}>The engine scores each position in centipawns (cp). Hindsight turns that into a chance of winning:</p>
        <p className="mt-4 font-mono text-base text-fg">win% = 50 + 50 &middot; (2 / (1 + e^(&minus;0.00368208 &middot; cp)) &minus; 1)</p>
        <p className={P}>
          A move is judged by how much of your winning chances it kept. In the Opera Game, Black&rsquo;s {label(MISTAKE)} took Black from {MISTAKE.wBefore}% to{" "}
          {MISTAKE.wAfter}%: {lost(MISTAKE)} points lost, which lands in the {BADGE[MISTAKE.badge].label} band below.
        </p>
      </section>

      <section className={SECTION}>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div>
            <h2 className={H2}>Verdicts</h2>
            <p className="mt-4 max-w-[38ch] text-lg text-pretty text-muted">Ten verdicts, by winning chances lost.</p>
            <p className="mt-4 max-w-[38ch] text-lg text-pretty text-muted">
              Morphy&rsquo;s reply {label(BRILLIANT)} kept White at {BRILLIANT.wAfter}% while offering the knight, so it is{" "}
              <Link href="/brilliant-move" className={A}>
                Brilliant
              </Link>
              .
            </p>
          </div>
          <VerdictLadder />
        </div>
      </section>

      <section className={SECTION}>
        <h2 className={H2}>Accuracy</h2>
        <p className={P}>
          Each move&rsquo;s accuracy falls as it loses winning chances. Game accuracy is 90% the plain mean of those and 10% the harmonic mean, so one blunder still
          counts. Morphy finished the demo game at {DEMO.accuracy.white}, his opponents at {DEMO.accuracy.black}.
        </p>
        <p className={P}>
          The curve is fitted against Chess.com&rsquo;s own accuracies on 30 rated games across five rating bands. The mean error is 3.7 points.{" "}
          <Link href="/chess-accuracy" className={A}>
            See the numbers per rating band
          </Link>
          .
        </p>
      </section>

      <section className={SECTION}>
        <h2 className={H2}>Limits</h2>
        <p className={P}>
          Browser engines search shallower than a desktop Stockfish. There is no volatility weighting. The coach comments are written by AI, so read them as a
          second opinion, not a verdict.
        </p>
      </section>

      <section className={SECTION}>
        <h2 className={H2}>Who builds this</h2>
        <p className={P}>
          Hindsight is built and maintained by{" "}
          <a href="https://almadih.dev" className={A}>
            Almadih
          </a>
          . The code, including every threshold on this page, is{" "}
          <a href={REPO_URL} className={A}>
            open source on GitHub
          </a>
          .
        </p>
      </section>
    </ArticleShell>
  );
}
