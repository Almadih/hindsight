"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { PositionEval } from "@/lib/engine/pool";
import { mySide } from "@/lib/me";
import { capturedPieces, formatEval, materialDiff, uciToSan } from "@/lib/review";
import type { Side, WhiteEval } from "@/lib/types";
import { Board } from "./Board";
import { EvalBar } from "./EvalBar";
import { EvalGraph } from "./EvalGraph";
import { Icon } from "./Icon";
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

/** Build dense, gap-free graph points up to `graphMax` by carrying forward the last known eval across sparse gaps. */
function buildGraphMoves(evals: (PositionEval | undefined)[], graphMax: number) {
  const moves: { ply: number; badge: "best"; evalWhite: number; mateWhite: number | null }[] = [];
  let prev = whiteEval(evals[0]);
  for (let i = 0; i < graphMax; i++) {
    const point = evals[i + 1] ? whiteEval(evals[i + 1]) : prev;
    prev = point;
    moves.push({ ply: i + 1, badge: "best", ...point });
  }
  return moves;
}

/**
 * The wait, made watchable: the board walks through the game as the engine finishes each position,
 * with the engine's preferred move, the eval bar and the graph filling in live.
 */
export function AnalysisLive({ fens, sans, headers, evals, classifying }: Props) {
  // Count all evaluated positions: tile-4 + deferred forced moves finish out of order,
  // so a contiguous-prefix frontier would freeze the progress bar.
  const done = evals.filter(Boolean).length;
  // Contiguous evaluated prefix, used to let the graph lead the board cursor when available.
  let frontier = 0;
  while (frontier < fens.length && evals[frontier]) frontier++;

  const [view, setView] = useState(0);
  const [flipped, setFlipped] = useState(() => mySide(headers) === "black");

  // Advance forward-only through evaluated positions with a best move so deferred forced moves
  // never stall the board and pre-classified terminal positions (lines: []) don't hijack t=0.
  const nextEval = evals.findIndex((e, idx) => idx > view && Boolean(e?.lines.length));

  useEffect(() => {
    if (nextEval === -1) return;
    const t = setTimeout(() => setView(nextEval), STEP_MS);
    return () => clearTimeout(t);
  }, [nextEval]);

  const shown = Math.min(view, Math.max(0, fens.length - 1));
  const fen = fens[shown];
  const ev = evals[shown];
  const best = ev?.lines[0]?.uci;
  const bestSan = best ? uciToSan(fen, best) : null;
  const names: Record<Side, string> = { white: headers.White || "White", black: headers.Black || "Black" };
  const ratings: Record<Side, string | undefined> = { white: headers.WhiteElo, black: headers.BlackElo };
  const material = materialDiff(fen);
  const captured = capturedPieces(fen);

  const graphMax = Math.min(Math.max(frontier - 1, shown), Math.max(0, fens.length - 1));
  const graph = { start: whiteEval(evals[0]), moves: buildGraphMoves(evals, graphMax) };
  const totalMoves = Math.ceil((fens.length - 1) / 2);
  const currentMove = Math.min(Math.ceil(done / 2), totalMoves);
  const moveLabel = shown ? `${Math.ceil(shown / 2)}.${shown % 2 ? "" : ".."} ${sans[shown - 1]}` : "the start";

  return (
    <main className="mx-auto grid w-full max-w-[1240px] grid-cols-[minmax(0,1fr)] gap-5 p-3 sm:p-5 lg:h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]">
      <section className="mx-auto flex w-full max-w-[calc(100dvh-6rem)] flex-col gap-1.5 lg:self-center" aria-label="Board">
        <PlayerBar side={flipped ? "white" : "black"} name={names[flipped ? "white" : "black"]} rating={ratings[flipped ? "white" : "black"]} material={material} captured={captured[flipped ? "white" : "black"]} />
        <div className="flex gap-2">
          <EvalBar ev={whiteEval(ev)} flipped={flipped} />
          <div className="min-w-0 flex-1 shadow-[0_6px_24px_rgba(0,0,0,0.35)]">
            <Board fen={fen} flipped={flipped} move={null} hintUci={best} />
          </div>
        </div>
        <PlayerBar side={flipped ? "black" : "white"} name={names[flipped ? "black" : "white"]} rating={ratings[flipped ? "black" : "white"]} material={material} captured={captured[flipped ? "black" : "white"]} />
      </section>

      <aside className="flex min-w-0 flex-col gap-4 rounded-lg bg-surface p-4 lg:my-5">
        <header className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold text-balance">
              {names.white} vs {names.black}
            </h1>
            <p className="text-sm text-muted">Reviewing in your browser</p>
          </div>
          <button onClick={() => setFlipped((f) => !f)} aria-label="Flip board" title="Flip board" className="rounded px-2 py-1.5 text-muted hover:bg-raised hover:text-fg">
            <Icon name="flip" />
          </button>
          <Link href="/" className="rounded px-2 py-1.5 text-sm font-semibold text-muted hover:bg-raised hover:text-fg">
            Cancel
          </Link>
        </header>

        <div className="space-y-3 rounded-md bg-raised p-4" aria-live="polite">
          <p className="font-semibold">{classifying ? "Judging every move and writing coach notes…" : `Analyzing move ${currentMove} of ${totalMoves}`}</p>
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
          {Math.max(5, Math.round(fens.length * 0.2))} seconds.
        </p>
      </aside>
    </main>
  );
}
