"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { BadgeIcon } from "@/components/BadgeIcon";
import { Board } from "@/components/Board";
import { EvalBar } from "@/components/EvalBar";
import { EvalGraph } from "@/components/EvalGraph";
import { CoachCard } from "@/components/landing/CoachCard";
import { GameFinder } from "@/components/landing/GameFinder";
import { GameList } from "@/components/landing/GameList";
import { VerdictLadder } from "@/components/landing/VerdictLadder";
import { DEMO } from "@/lib/demo-game";
import { Icon } from "@/components/Icon";
import { BADGE, NOTABLE } from "@/lib/review";
import { playMove, primeSounds } from "@/lib/sfx";
import type { GameSummary } from "@/lib/types";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const LAST = DEMO.moves.length;
// Tempo: book moves rattle off, ordinary moves stay brisk, verdicts worth reading linger.
const BOOK_MS = 520;
const STEP_MS = 820;
const KEY_MS = 3400;
const END_MS = 5600;
// Reduced motion shows one still frame: the game's most famous moment.
const STILL_PLY = DEMO.moves.findIndex((m) => m.san === "Qb8+") + 1;
const PRIORITY = ["blunder", "miss", "mistake", "brilliant", "great"];
// The three coached moments that decided the game, in game order.
const TURNING = DEMO.moves
  .filter((m) => m.coach && PRIORITY.includes(m.badge))
  .sort((a, b) => PRIORITY.indexOf(a.badge) - PRIORITY.indexOf(b.badge))
  .slice(0, 3)
  .sort((a, b) => a.ply - b.ply);

const REDUCED = "(prefers-reduced-motion: reduce)";
const subscribeReduced = (cb: () => void) => {
  const mq = matchMedia(REDUCED);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};

function holdFor(ply: number) {
  const m = DEMO.moves[ply - 1];
  if (ply === LAST) return END_MS;
  if (!m) return STEP_MS;
  if (m.badge === "book") return BOOK_MS;
  return NOTABLE.has(m.badge) || m.coach ? KEY_MS : STEP_MS;
}

export default function Home() {
  const router = useRouter();
  const reduced = useSyncExternalStore(subscribeReduced, () => matchMedia(REDUCED).matches, () => false);
  const [step, setStep] = useState(0);
  const [held, setHeld] = useState(false);
  const [found, setFound] = useState<{ games: GameSummary[]; username: string } | null>(null);
  // Off by default every visit; the toggle click doubles as the gesture browsers require before audio.
  const [sound, setSound] = useState(false);
  const ply = reduced ? STILL_PLY : step;

  useEffect(() => {
    if (reduced || held) return;
    const t = setTimeout(() => setStep((p) => (p >= LAST ? 0 : p + 1)), holdFor(step));
    return () => clearTimeout(t);
  }, [step, held, reduced]);

  const move = ply ? DEMO.moves[ply - 1] : null;

  useEffect(() => {
    if (sound && move) playMove(move);
  }, [sound, move]);
  const review = (pgn: string) => {
    sessionStorage.setItem("pgn", pgn);
    router.push("/review");
  };
  const toFinder = () => {
    window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
    document.getElementById("username")?.focus({ preventScroll: true });
  };

  return (
    <>
      <section className="mx-auto grid w-full max-w-[1400px] gap-x-12 gap-y-6 px-4 pt-5 pb-14 sm:px-8 lg:min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(340px,420px)] lg:grid-rows-[auto_auto_1fr] lg:pb-8">
        <header className="flex items-baseline justify-between gap-4 lg:col-span-2">
          <p className="text-2xl font-extrabold tracking-[-0.04em]">Hindsight</p>
          <div className="flex items-center gap-4">
            <p className="hidden text-sm text-muted sm:block">Free · No account · Chess.com & Lichess</p>
            <button
              onClick={() => {
                if (!sound) primeSounds();
                setSound(!sound);
              }}
              aria-pressed={sound}
              className="flex items-center gap-2 rounded-full bg-raised px-3 py-1.5 text-sm font-semibold text-muted hover:text-fg aria-pressed:text-fg"
            >
              <Icon name={sound ? "soundOn" : "soundOff"} size={18} />
              {sound ? "Sound on" : "Sound off"}
            </button>
          </div>
        </header>

        <div className="lg:col-start-2 lg:row-start-2 lg:pt-8">
          <h1 className="text-[clamp(2.4rem,5.4vw,5.25rem)] leading-[0.95] font-extrabold tracking-[-0.04em] text-balance">Every move, judged.</h1>
          <p className="mt-5 hidden max-w-[34ch] text-lg text-pretty text-muted sm:block">
            See where your game turned: every move rated, mistakes explained, the better move on the board.
          </p>
        </div>

        <div
          className="relative lg:col-start-1 lg:row-span-2 lg:row-start-2 lg:self-center"
          onMouseEnter={() => setHeld(true)}
          onMouseLeave={() => setHeld(false)}
          onFocus={() => setHeld(true)}
          onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setHeld(false)}
        >
          <div className="mx-auto flex w-full max-w-[calc(100dvh-7.5rem)] gap-2">
            <EvalBar ev={move ?? DEMO.start} flipped={false} />
            <div className="min-w-0 flex-1 shadow-[0_24px_70px_rgba(0,0,0,0.5)]" aria-label="Demo review of the Opera Game" role="img">
              <Board fen={move?.fen ?? START_FEN} flipped={false} move={move} fx={{ intensity: "epic", prevFen: ply > 1 ? DEMO.moves[ply - 2].fen : START_FEN }} />
            </div>
          </div>
          <div className="relative z-40 mx-auto mt-4 max-w-[calc(100dvh-7.5rem)] lg:absolute lg:inset-x-0 lg:bottom-[5%] lg:mt-0 lg:px-[7%] lg:pl-[calc(7%+2.25rem)]">
            <GameFinder onGames={(games, username) => setFound({ games, username })} onPgn={review} />
          </div>
        </div>

        <aside className="flex min-h-0 flex-col gap-4 lg:col-start-2 lg:row-start-3 lg:max-h-[calc(100dvh-22rem)]">
          {found ? (
            <GameList games={found.games} username={found.username} onPick={review} onClose={() => setFound(null)} />
          ) : (
            <>
              {/* Graph first: the coach card changes height per move, and a control must not move under the cursor. */}
              <EvalGraph
                report={DEMO}
                ply={ply}
                onSelect={(p) => {
                  setStep(p);
                  setHeld(true);
                }}
                className="h-16 shrink-0"
              />
              <CoachCard move={move} totalPlies={LAST} opening={DEMO.opening} />
              <p className="text-sm text-muted">
                A real Hindsight review of the Opera Game: Paul Morphy vs the Duke of Brunswick and Count Isouard, Paris 1858. Accuracy{" "}
                <span className="font-semibold text-fg tabular-nums">{DEMO.accuracy.white}</span> vs{" "}
                <span className="font-semibold text-fg tabular-nums">{DEMO.accuracy.black}</span>. Click the graph to jump.
              </p>
            </>
          )}
        </aside>
      </section>

      <section className="mx-auto w-full max-w-[1400px] px-4 pt-20 pb-16 sm:px-8 lg:pt-28">
        <h2 className="text-[clamp(2rem,3.6vw,3.25rem)] leading-none font-extrabold tracking-[-0.035em]">Where the game turned</h2>
        <p className="mt-4 max-w-[52ch] text-lg text-pretty text-muted">
          The graph is White&rsquo;s chance of winning, move by move. The review finds the moments that moved it and tells you why.
        </p>
        <EvalGraph report={DEMO} ply={ply} onSelect={(p) => setStep(p)} className="mt-10 h-44 sm:h-56" />
        <ol className="mt-8 grid gap-8 md:grid-cols-3">
          {TURNING.map((m) => (
            <li key={m.ply} className="border-t-2 pt-5" style={{ borderColor: BADGE[m.badge].color }}>
              <div className="mb-5 max-w-[300px]">
                <Board id={`turning-${m.ply}`} fen={m.fen} flipped={false} move={m} />
              </div>
              <p className="flex items-center gap-3 text-xl font-bold">
                <BadgeIcon badge={m.badge} size={30} />
                <span>
                  <span className="tabular-nums">
                    {Math.ceil(m.ply / 2)}.{m.color === "black" ? ".." : ""}
                  </span>{" "}
                  {m.san} <span style={{ color: BADGE[m.badge].color }}>{BADGE[m.badge].phrase}</span>
                </span>
              </p>
              <p className="mt-3 text-pretty text-fg/85">{m.coach}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto w-full max-w-[1400px] px-4 pt-20 pb-16 sm:px-8 lg:pt-28">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div>
            <h2 className="text-[clamp(2rem,3.6vw,3.25rem)] leading-none font-extrabold tracking-[-0.035em] text-balance">Ten verdicts, one scale</h2>
            <p className="mt-4 max-w-[38ch] text-lg text-pretty text-muted">
              Every move gets one, measured by how much of your winning chances it kept or gave away.
            </p>
          </div>
          <VerdictLadder />
        </div>
      </section>

      <section className="mx-auto w-full max-w-[1400px] px-4 pt-20 pb-24 sm:px-8 lg:pt-32">
        <div className="flex flex-col items-start gap-8 border-t border-line pt-14 md:flex-row md:items-end md:justify-between">
          <h2 className="text-[clamp(2.5rem,5vw,4.5rem)] leading-[0.95] font-extrabold tracking-[-0.04em] text-balance">Your last game is waiting.</h2>
          <button onClick={toFinder} className="shrink-0 rounded-lg bg-accent px-7 py-4 text-lg font-bold text-[#141311] hover:brightness-110">
            Find my games
          </button>
        </div>
      </section>

      <footer className="mx-auto w-full max-w-[1400px] px-4 pb-10 text-sm text-muted sm:px-8">
        <p className="max-w-[80ch] text-pretty">
          Hindsight is an independent project, not affiliated with or endorsed by Chess.com or Lichess. Reviews are shared: once a game has been reviewed, anyone can open
          it. Sounds from Pixabay. Chess pieces: Staunty by sadsnake1,{" "}
          <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" className="underline decoration-line underline-offset-4 hover:text-fg">
            CC BY-NC-SA 4.0
          </a>
          .
        </p>
      </footer>
    </>
  );
}
