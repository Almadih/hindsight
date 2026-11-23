import Link from "next/link";
import { ArticleShell, A, H2, P, SECTION } from "@/components/ArticleShell";
import { BadgeIcon } from "@/components/BadgeIcon";
import { Board } from "@/components/Board";
import { DEMO } from "@/lib/demo-game";
import { BADGE } from "@/lib/review";
import { pageMeta } from "@/lib/site";

const TITLE = "What makes a move brilliant in chess";
const DESCRIPTION =
  "What a brilliant move in chess is, the exact test Hindsight uses to award one, and how it differs from a great move. Shown on Morphy's Opera Game.";

export const metadata = pageMeta("/brilliant-move", TITLE, DESCRIPTION);

// "9... b5" / "10. Nxb5", as the homepage writes moves.
const num = (m: { ply: number; color: string; san: string }) => `${Math.ceil(m.ply / 2)}.${m.color === "black" ? ".." : ""} ${m.san}`;

const byPly = (ply: number) => {
  const m = DEMO.moves.find((x) => x.ply === ply);
  if (!m) throw new Error(`demo ply ${ply} missing`);
  return m;
};

export default function BrilliantMove() {
  const mistake = byPly(18);
  const brilliant = byPly(19);
  const reply = byPly(20);

  return (
    <ArticleShell path="/brilliant-move" title={TITLE} description={DESCRIPTION} modified="2026-11-23" updated="November 2026">
      <section className={SECTION}>
        <h2 className={H2}>What Brilliant means here</h2>
        <p className={P}>
          A brilliant move is the best move in the position, and it gives up material to play it. It is not a flashy move, and it is not just a good one. It is a
          sound sacrifice.
        </p>
        <p className={`${P} flex items-center gap-3`}>
          <BadgeIcon badge="brilliant" size={28} />
          <span>
            <strong className="text-fg">{BADGE.brilliant.label}.</strong> {BADGE.brilliant.rule}
          </span>
        </p>
        <p className={P}>
          Hindsight Chess reviews your Chess.com and Lichess games with Stockfish 19 in your browser. The rule below is the one it applies to every move.
        </p>
      </section>

      <section className={SECTION}>
        <h2 className={H2}>The exact test</h2>
        <p className={P}>
          Winning chances come from the engine&rsquo;s centipawn score, using the formula on <Link href="/how-it-works" className={A}>how it works</Link>. A move is
          Brilliant when all of these hold:
        </p>
        <ul className="mt-4 max-w-[60ch] list-disc space-y-2 pl-6 text-lg text-muted">
          <li>It is the engine&rsquo;s best move, or ties it.</li>
          <li>It is a sacrifice: it risks at least an exchange on a piece that is not a pawn.</li>
          <li>It loses less than 5% of your winning chances.</li>
          <li>You still have at least 45% winning chances after it.</li>
          <li>
            The position was not already easily won. The engine&rsquo;s second-best line must stay under 85%, so a sacrifice is not credited when any move would
            have won.
          </li>
        </ul>
        <p className={P}>
          There is a near-best variant. A sacrifice that is not the engine&rsquo;s first choice still counts if it is within 1.5% of the best line, leaves you at
          50% or more, and passes the same &ldquo;not already won&rdquo; check.
        </p>
        <p className={P}>
          Trades, promotions, pieces that were already trapped, and sacrifices the mover wins straight back do not count as sacrifices.
        </p>
      </section>

      <section className={SECTION}>
        <h2 className={H2}>An example: Morphy&rsquo;s {num(brilliant)}</h2>
        <div className="mt-8 grid gap-10 lg:grid-cols-[360px_minmax(0,1fr)]">
          <div className="w-full max-w-[360px]">
            <Board id="brilliant-example" fen={brilliant.fen} move={brilliant} flipped={false} />
          </div>
          <div>
            <p className={`${P} mt-0`}>
              In the Opera Game (Morphy, Paris 1858), Black played {num(mistake)}, a {mistake.badge}: winning chances fell from {mistake.wBefore}% to{" "}
              {mistake.wAfter}% for Black. White answered {num(brilliant)}.
            </p>
            <p className={P}>
              Hindsight marks it {BADGE[brilliant.badge].label}. White had {brilliant.wBefore}% winning chances before the move and {brilliant.wAfter}% after, so
              nothing was lost, and the move matched the engine&rsquo;s first choice. The knight lands on a square Black can take, and Black did: {num(reply)} came
              next.
            </p>
            {brilliant.coach && <p className={P}>The coach note on the move reads: &ldquo;{brilliant.coach}&rdquo;</p>}
          </div>
        </div>
      </section>

      <section className={SECTION}>
        <h2 className={H2}>Brilliant vs Great</h2>
        <p className={P}>
          A Great move is also the engine&rsquo;s best move, but it earns its badge by being the only move that holds your position together, not by giving up
          material.
        </p>
        <ul className="mt-4 max-w-[60ch] list-disc space-y-2 pl-6 text-lg text-muted">
          <li>The second-best move is at least 10% of winning chances worse. When you are escaping check, the gap must be at least 16%.</li>
          <li>It is not a recapture and not a free capture.</li>
          <li>You have at least 35% after it, and the move loses under 10%.</li>
          <li>The position was not already easily won: the second-best line stays under 75%.</li>
        </ul>
        <p className={P}>
          The engine checks Brilliant first. If a move is a sound sacrifice, it is Brilliant. If it is only the lone good move, it is Great.
        </p>
      </section>

      <section className={SECTION}>
        <h2 className={H2}>Why brilliant moves are rare</h2>
        <p className={P}>
          Two things must be true at once. The move has to be the best one, and it has to give up material. Most best moves are quiet or win material, and most
          sacrifices are not best. Add the limits on lost chances and on already-won positions, and few moves pass.
        </p>
        <p className={P}>
          The limits also work as a guard. A sacrifice that loses 5% or more, or one you play when you were winning anyway, is not credited.
        </p>
      </section>

      <section className={SECTION}>
        <h2 className={H2}>How to find yours</h2>
        <p className={P}>
          <Link href="/" className={A}>Review a game</Link> and open the key moments. Brilliant and great moves are listed there next to your costliest errors. For the
          full routine, see <Link href="/how-to-review-a-chess-game" className={A}>how to review a chess game</Link>, and for how the rest of the verdicts feed your
          score, see <Link href="/chess-accuracy" className={A}>how chess accuracy works</Link>.
        </p>
      </section>
    </ArticleShell>
  );
}
