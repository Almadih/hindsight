import Link from "next/link";
import { A, ArticleShell, H2, P, SECTION } from "@/components/ArticleShell";
import { DEMO } from "@/lib/demo-game";
import { pageMeta } from "@/lib/site";

const TITLE = "How chess accuracy works";
const DESCRIPTION =
  "How chess accuracy is calculated from engine scores, and how Hindsight's accuracy for Chess.com and Lichess games compares with Chess.com's own numbers.";

export const metadata = pageMeta("/chess-accuracy", TITLE, DESCRIPTION);

// Same curve as api/src/review/winprob.py move_accuracy, used only to render the worked example.
const moveAccuracy = (lost: number) => Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * 2.7 * Math.max(0, lost)) - 3.1669));

// Output of api/scripts/calibrate/fit.py: Hindsight minus Chess.com accuracy, mean per rating band.
const BANDS = [
  ["0–999", 13, "+3.9"],
  ["1000–1499", 12, "−1.6"],
  ["1500–1999", 11, "+0.9"],
  ["2000–2499", 10, "−1.8"],
  ["2500+", 14, "−3.2"],
] as const;

const TH = "border-b border-line px-4 py-3 text-left font-bold";
const TD = "border-b border-line px-4 py-3";

export default function ChessAccuracy() {
  const move = DEMO.moves.find((m) => m.ply === 18)!;
  const lost = move.wBefore - move.wAfter;

  return (
    <ArticleShell path="/chess-accuracy" title={TITLE} description={DESCRIPTION} modified="2026-11-23" updated="November 2026">
      <section className={SECTION}>
        <h2 className={H2}>What accuracy measures</h2>
        <p className={P}>
          Accuracy is a score from 0 to 100 for how close your moves were to the engine&rsquo;s best. It is not the share of moves that were best. A move that is
          slightly worse than the top choice costs a little. A blunder costs a lot.
        </p>
        <p className={P}>
          Hindsight computes it for both Chess.com and Lichess games, in your browser, with Stockfish 19.
        </p>
      </section>

      <section className={SECTION}>
        <h2 className={H2}>From engine score to winning chances</h2>
        <p className={P}>
          The engine scores each position in centipawns. Hindsight converts that score into a chance of winning, from 0 to 100%. The same 100 centipawns matter much
          less when you are already winning by a rook than when the game is level. The exact formula is on the{" "}
          <Link href="/how-it-works" className={A}>
            how it works
          </Link>{" "}
          page.
        </p>
        <p className={P}>For every move, Hindsight compares your winning chances before the move with those after it. The drop is the winning chances you lost.</p>
      </section>

      <section className={SECTION}>
        <h2 className={H2}>Move accuracy</h2>
        <p className={P}>Each move gets its own accuracy from the winning chances it lost, in percentage points:</p>
        <p className="mt-4 font-mono text-base text-fg">accuracy = 103.1668 &middot; e^(&minus;0.04354 &middot; 2.7 &middot; lost) &minus; 3.1669</p>
        <p className={P}>
          It is clamped to 0&ndash;100. Losing nothing gives 100. The score falls fast at first and then flattens, so the first few points you give away hurt
          more than the last few. The 2.7 is a scale fitted against Chess.com&rsquo;s numbers.
        </p>
      </section>

      <section className={SECTION}>
        <h2 className={H2}>Game accuracy</h2>
        <p className={P}>
          Game accuracy combines your move accuracies: 90% is the plain mean and 10% is the harmonic mean. The harmonic mean is dragged down hard by any single low
          value. That is why one blunder in an otherwise clean game still shows up in the final number.
        </p>
        <p className={P}>There is no volatility weighting, so quiet and sharp positions count the same.</p>
      </section>

      <section className={SECTION}>
        <h2 className={H2}>A worked example</h2>
        <p className={P}>
          Take the Opera Game, Morphy against the Duke of Brunswick and Count Isouard, Paris 1858. On move {Math.ceil(move.ply / 2)}, Black plays{" "}
          {Math.ceil(move.ply / 2)}&hellip;{move.san}. Black&rsquo;s winning chances fall from {move.wBefore}% to {move.wAfter}%. That is {lost.toFixed(1)} points
          lost, a {move.badge}, and the move scores an accuracy of about {moveAccuracy(lost).toFixed(0)}.
        </p>
        <p className={P}>
          Over the whole game, White finishes at {DEMO.accuracy.white}% accuracy and Black at {DEMO.accuracy.black}%. The gap comes from how much each side lost move by move. Moves like this one pull Black&rsquo;s average down.
        </p>
      </section>

      <section className={SECTION}>
        <h2 className={H2}>How it compares with Chess.com</h2>
        <p className={P}>
          The curve was fitted against Chess.com&rsquo;s own accuracies on 30 rated games, 60 player-games, across five rating bands. Overall, Hindsight is within
          3.7 points of Chess.com on average, with a bias of &minus;0.4.
        </p>
        <div className="mt-6 max-w-[60ch] overflow-x-auto">
          <table className="w-full text-left text-base">
            <caption className="pb-3 text-left text-sm text-muted">Hindsight minus Chess.com accuracy, mean per rating band, in points</caption>
            <thead>
              <tr>
                <th scope="col" className={TH}>
                  Rating
                </th>
                <th scope="col" className={TH}>
                  Player-games
                </th>
                <th scope="col" className={TH}>
                  Mean difference
                </th>
              </tr>
            </thead>
            <tbody>
              {BANDS.map(([band, n, diff]) => (
                <tr key={band}>
                  <th scope="row" className={`${TD} font-normal`}>
                    {band}
                  </th>
                  <td className={TD}>{n}</td>
                  <td className={`${TD} font-mono`}>{diff}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={P}>
          Under 1000, Hindsight is slightly generous. At 2500 and above it is slightly strict. In between it is close. Treat any accuracy as a few points of
          noise either way, and compare games scored the same way.
        </p>
      </section>

      <section className={SECTION}>
        <h2 className={H2}>Accuracy is not rating</h2>
        <p className={P}>
          Accuracy depends on how hard the position was. A quiet game where every move is obvious can score high for any player. A tactical game with few good
          moves scores lower for everyone. Two players with the same accuracy can be very different strengths.
        </p>
      </section>

      <section className={SECTION}>
        <h2 className={H2}>Keep reading</h2>
        <p className={P}>
          See what separates the top verdict from the rest in{" "}
          <Link href="/brilliant-move" className={A}>
            what makes a move brilliant
          </Link>
          , or follow{" "}
          <Link href="/how-to-review-a-chess-game" className={A}>
            how to review a chess game
          </Link>{" "}
          to use these numbers on your own games.
        </p>
      </section>
    </ArticleShell>
  );
}
