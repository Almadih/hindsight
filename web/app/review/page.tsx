"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Review } from "@/components/Review";
import { analyzeGame } from "@/lib/api";
import { analyzePositions } from "@/lib/engine/pool";
import { parsePgn } from "@/lib/pgn";
import type { Report } from "@/lib/types";

type State =
  | { stage: "engine"; done: number; total: number }
  | { stage: "server" }
  | { stage: "done"; report: Report; startFen: string }
  | { stage: "error"; message: string };

export default function ReviewPage() {
  const [state, setState] = useState<State>({ stage: "engine", done: 0, total: 0 });

  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        const input = sessionStorage.getItem("pgn");
        if (!input) throw new Error("No game to review yet. Pick a game or paste a PGN first.");
        const { pgn, fens } = parsePgn(input);
        setState({ stage: "engine", done: 0, total: fens.length });
        const evals = await analyzePositions(fens, {
          signal: ctrl.signal,
          onProgress: (done, total) => setState({ stage: "engine", done, total }),
        });
        setState({ stage: "server" });
        setState({ stage: "done", report: await analyzeGame(pgn, evals), startFen: fens[0] });
      } catch (err) {
        if (!ctrl.signal.aborted) setState({ stage: "error", message: (err as Error).message });
      }
    })();
    return () => ctrl.abort();
  }, []);

  if (state.stage === "done") return <Review report={state.report} startFen={state.startFen} />;

  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <div className="w-full max-w-sm space-y-3">
        {state.stage === "error" ? (
          <>
            <p role="alert" className="font-semibold">Couldn’t review this game</p>
            <p className="text-sm text-muted">{state.message}</p>
            <Link href="/" className="inline-block rounded-md bg-accent px-4 py-2 text-sm font-semibold text-[#141311] hover:brightness-110">
              Choose another game
            </Link>
          </>
        ) : (
          <>
            <p className="font-semibold">{state.stage === "server" ? "Classifying moves…" : "Analyzing with Stockfish…"}</p>
            <progress
              className="h-2 w-full"
              aria-label="Analysis progress"
              value={state.stage === "server" ? 1 : state.done}
              max={state.stage === "server" ? 1 : state.total || 1}
            />
            <p className="text-sm text-muted tabular-nums">
              {state.stage === "engine" && state.total > 0 ? `${state.done} of ${state.total} positions` : " "}
            </p>
          </>
        )}
      </div>
    </main>
  );
}
