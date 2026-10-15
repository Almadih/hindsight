"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { PositionEval } from "@/lib/engine/pool";
import { capturedPieces, formatEval, materialDiff, uciToSan } from "@/lib/review";
import type { Side, WhiteEval } from "@/lib/types";
import { Board } from "./Board";
import { EvalBar } from "./EvalBar";
import { EvalGraph } from "./EvalGraph";
import { PlayerBar } from "./PlayerBar";

const STEP_MS = 120; // how fast the board catches up with the engine

type Props = {
  fens: string[];
  sans: string[];
  headers: Record<string, string>;
  /** Sparse: workers finish positions out of order. */
  evals: (PositionEval | undefined)[];
  /** True once the engine is done and the server is classifying. */
  classifying: boolean;
};

/** Engine score for one position, from White's side. */
function whiteEval(ev: PositionEval | undefined): WhiteEval {
  const best = ev?.lines[0];
  if (!ev || !best) return { evalWhite: 0, mateWhite: null };
  const sign = ev.fen.split(" ")[1] === "w" ? 1 : -1;
  if (best.mate !== undefined) return { evalWhite: sign * (best.mate > 0 ? 100 : -100), mateWhite: sign * best.mate };
  return { evalWhite: (sign * (best.cp ?? 0)) / 100, mateWhite: null };
}

/**
 * The wait, made watchable: the board walks through the game as the engine finishes each position,
 * with the engine's preferred move, the eval bar and the graph filling in live.
 */
export function AnalysisLive({ fens, sans, headers, evals, classifying }: Props) {
  // Positions 0..frontier-1 are all evaluated; the board only ever shows those.
  let frontier = 0;
  while (frontier < fens.length && evals[frontier]) frontier++;
  // Count only the contiguous prefix: workers finish out of order, so "done" alone overstates progress.
  const done = frontier;
  const [view, setView] = useState(0);

  useEffect(() => {
    if (view >= frontier - 1) return;
    const t = setTimeout(() => setView((v) => v + 1), STEP_MS);
    return () => clearTimeout(t);
  }, [view, frontier]);

  const shown = Math.min(view, Math.max(0, frontier - 1));
  const fen = fens[shown];
  const ev = evals[shown];
  const best = ev?.lines[0]?.uci;
  const bestSan = best ? uciToSan(fen, best) : null;
  const names: Record<Side, string> = { white: headers.White || "White", black: headers.Black || "Black" };
  const ratings: Record<Side, string | undefined> = { white: headers.WhiteElo, black: headers.BlackElo };
  const material = materialDiff(fen);
  const captured = capturedPieces(fen);
  const graph = {
    start: whiteEval(evals[0]),
    moves: Array.from({ length: Math.max(0, frontier - 1) }, (_, i) => ({ ply: i + 1, badge: "best" as const, ...whiteEval(evals[i + 1]) })),
  };
  const moveLabel = shown ? `${Math.ceil(shown / 2)}.${shown % 2 ? "" : ".."} ${sans[shown - 1]}` : "the start";

  return (
    <main className="mx-auto grid w-full max-w-[1240px] grid-cols-[minmax(0,1fr)] gap-5 p-3 sm:p-5 lg:h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]">
      <section className="mx-auto flex w-full max-w-[calc(100dvh-6rem)] flex-col gap-1.5 lg:self-center" aria-label="Board">
        <PlayerBar side="black" name={names.black} rating={ratings.black} material={material} captured={captured.black} />
        <div className="flex gap-2">
          <EvalBar ev={whiteEval(ev)} flipped={false} />
          <div className="min-w-0 flex-1 shadow-[0_6px_24px_rgba(0,0,0,0.35)]">
            <Board fen={fen} flipped={false} move={null} hintUci={best} />
          </div>
        </div>
        <PlayerBar side="white" name={names.white} rating={ratings.white} material={material} captured={captured.white} />
      </section>

      <aside className="flex min-w-0 flex-col gap-4 rounded-lg bg-surface p-4 lg:my-5">
        <header className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold text-balance">
              {names.white} vs {names.black}
            </h1>
            <p className="text-sm text-muted">Reviewing in your browser</p>
          </div>
          <Link href="/" className="rounded px-2 py-1.5 text-sm font-semibold text-muted hover:bg-raised hover:text-fg">
            Cancel
          </Link>
        </header>

        <div className="space-y-3 rounded-md bg-raised p-4" aria-live="polite">
          <p className="font-semibold">{classifying ? "Judging every move and writing coach notes…" : `Analyzing move ${Math.ceil(done / 2)} of ${Math.ceil((fens.length - 1) / 2)}`}</p>
          <progress className="h-2 w-full" aria-label="Analysis progress" value={classifying ? undefined : done} max={fens.length} />
          <p className="text-sm text-muted">
            {bestSan ? (
              <>
                After <span className="font-semibold text-fg">{moveLabel}</span> the engine wants <span className="font-semibold text-accent">{bestSan}</span>{" "}
                <span className="tabular-nums">({formatEval(whiteEval(ev))})</span>
              </>
            ) : (
              "Warming up the engine…"
            )}
          </p>
        </div>

        <EvalGraph report={graph} ply={shown} className="h-24" />
        <p className="text-sm text-pretty text-muted">
          Stockfish is checking every position. The verdicts arrive together when it finishes; a game this long takes about{" "}
          {Math.max(10, Math.round(fens.length * 0.45))} seconds.
        </p>
      </aside>
    </main>
  );
}
