import Link from "next/link";
import { ArticleShell, A, H2, P, SECTION } from "@/components/ArticleShell";
import { QUALITY_DEPTH } from "@/lib/engine/pool";
import { APK_URL, pageMeta } from "@/lib/site";

const PATH = "/how-to-review-a-chess-game";
const TITLE = "How to review a chess game";
const DESCRIPTION =
  "How to review a chess game for free: load your Chess.com or Lichess game, read the graph, find the turning point and learn the better move. No account.";

export const metadata = pageMeta(PATH, TITLE, DESCRIPTION);

export default function HowToReviewAChessGame() {
  return (
    <ArticleShell path={PATH} title={TITLE} description={DESCRIPTION} modified="2026-11-23" updated="November 2026">
      <section className={SECTION}>
        <p className={P}>
          A good review takes ten minutes and shows you the one or two moments that decided the game. Hindsight Chess does this for free, with no account, for
          games from Chess.com and Lichess. Here is the whole flow, step by step.
        </p>
      </section>

      <section className={SECTION}>
        <h2 className={H2}>1. Find your game</h2>
        <p className={P}>
          On the <Link href="/" className={A}>home page</Link>, pick <strong>Chess.com</strong> or <strong>Lichess</strong>, type your username and press{" "}
          <strong>Review my games</strong>. You get a list of your recent standard games from the last two months, each marked Won, Lost or Draw. Click one to
          start.
        </p>
        <p className={P}>
          Played somewhere else, or want a game from over the board? Choose <strong>or paste a PGN</strong>, paste the game and press{" "}
          <strong>Review this game</strong>. A game you have already reviewed shows <strong>Reviewed</strong> with its accuracy, and opens at once.
        </p>
      </section>

      <section className={SECTION}>
        <h2 className={H2}>2. Let the engine run</h2>
        <p className={P}>
          Stockfish 19 checks every position of the game inside your browser. Nothing is uploaded to a queue. A progress bar shows the move it is on, and the
          engine&rsquo;s favourite move so far.
        </p>
        <p className={P}>
          The <strong>Engine depth</strong> menu on the review page sets how deep it searches: Quick (depth {QUALITY_DEPTH.quick}), Standard (depth{" "}
          {QUALITY_DEPTH.standard}) or Deep (depth {QUALITY_DEPTH.deep}). Standard is the default. Deeper is slower and a little more accurate. You can run up
          to 60 new reviews a day; reopening one you have already reviewed is free.
        </p>
      </section>

      <section className={SECTION}>
        <h2 className={H2}>3. Read the graph</h2>
        <p className={P}>
          The graph shows White&rsquo;s chance of winning after every move. Up means White is doing better, down means Black is. A steady line is a quiet game. A
          sharp drop is a mistake. Click anywhere on the graph to jump to that move. The bar beside the board shows the same evaluation for the move you are on.
        </p>
      </section>

      <section className={SECTION}>
        <h2 className={H2}>4. Jump to the key moments</h2>
        <p className={P}>
          Open the <strong>Summary</strong> tab. It lists the key moments of the game: your costliest errors, plus any great or brilliant moves. Press{" "}
          <strong>Start with the first key moment</strong>, then use <strong>Next key moment</strong> and <strong>Previous key moment</strong> to walk through
          them. After the last one, <strong>Finish review</strong> gives you a recap. On a keyboard, <kbd>N</kbd> and <kbd>P</kbd> do the same, and the arrow keys
          step one move at a time.
        </p>
      </section>

      <section className={SECTION}>
        <h2 className={H2}>5. Read each verdict</h2>
        <p className={P}>
          Every move gets one of ten verdicts, from Brilliant to Blunder, based on how much of your winning chances it kept. A card under the board gives the
          verdict and the evaluation, and on key moments a short coach note explains what happened. The notes are written by AI, so treat them as a second
          opinion.
        </p>
        <p className={P}>
          Brilliant is the rarest, and it has strict rules: see <Link href="/brilliant-move" className={A}>what makes a move brilliant</Link>. The full ladder,
          with the exact thresholds, is on <Link href="/how-it-works" className={A}>how it works</Link>.
        </p>
      </section>

      <section className={SECTION}>
        <h2 className={H2}>6. Compare with the better move</h2>
        <p className={P}>
          On a mistake or blunder, the better move stays hidden at first, so you can look for it yourself. Press <strong>Retry this move</strong>, then play
          your answer on the board. A wrong try gets a hint and the winning chances it keeps. When you are done, press <strong>Show answer</strong> to see the
          engine&rsquo;s arrow and the coach note, then <strong>Play the best line</strong> to watch the line play out.
        </p>
      </section>

      <section className={SECTION}>
        <h2 className={H2}>7. Check your accuracy</h2>
        <p className={P}>
          The Summary tab also shows an accuracy score for each player, a game rating estimated from it, and your moves counted by verdict. Accuracy is the
          average quality of your moves, with one blunder still counting. <Link href="/chess-accuracy" className={A}>How chess accuracy works</Link> explains the
          maths.
        </p>
      </section>

      <section className={SECTION}>
        <h2 className={H2}>8. Share it, redo it, take it with you</h2>
        <p className={P}>
          Press <strong>Share</strong> to copy a link to the review. <strong>Re-analyze</strong> runs the engine again, for instance at a deeper setting.{" "}
          <strong>Your player page</strong> collects your games. Prefer your phone? There is a{" "}
          <a href={APK_URL} className={A}>
            free Android app
          </a>{" "}
          too.
        </p>
      </section>

      <section className={SECTION}>
        <h2 className={H2}>Tips for learning from a review</h2>
        <ul className={`${P} list-disc space-y-2 pl-6`}>
          <li>Review soon after you play, while you still remember what you were thinking.</li>
          <li>Start at the first big drop in the graph. Later errors often follow from it.</li>
          <li>Find your own better move before you look at the engine line.</li>
          <li>Pick one lesson per game, not every flagged move.</li>
        </ul>
      </section>
    </ArticleShell>
  );
}
