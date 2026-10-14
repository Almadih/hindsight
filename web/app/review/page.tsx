"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Review } from "@/components/Review";
import { analyzeGame, cachedReview, getReview } from "@/lib/api";
import { analyzePositions } from "@/lib/engine/pool";
import { parsePgn, reportPgn, START_FEN } from "@/lib/pgn";
import type { Report } from "@/lib/types";

type State =
  | { stage: "lookup" }
  | { stage: "engine"; done: number; total: number }
  | { stage: "server" }
  // shared: came from the shared store, not this browser's engine. linkable: stored, so /review?g=<hash> opens it.
  | { stage: "done"; report: Report; startFen: string; shared: boolean; linkable: boolean }
  | { stage: "error"; message: string };

export default function ReviewPage() {
  const [state, setState] = useState<State>({ stage: "lookup" });
  // True after the user asks to re-check a shared review with their own engine.
  const [fresh, setFresh] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        // Share links: /review?g=<hash> opens a stored review with no PGN and no engine run.
        const hash = new URLSearchParams(location.search).get("g");
        if (hash && !fresh) {
          const report = await getReview(hash);
          if (!report) throw new Error("This review isn't available. Pick a game or paste a PGN.");
          // Keep the game in this tab so "Re-analyze in my browser" works for linked reviews too.
          sessionStorage.setItem("pgn", reportPgn(report.headers, report.moves.map((m) => m.san)));
          return setState({ stage: "done", report, startFen: report.headers.FEN ?? START_FEN, shared: true, linkable: true });
        }

        const input = sessionStorage.getItem("pgn");
        if (!input) throw new Error("No game to review yet. Pick a game or paste a PGN first.");
        const { pgn, fens } = parsePgn(input);
        // Someone may already have reviewed this exact game: skip the engine entirely.
        const cached = fresh ? null : await cachedReview(pgn);
        if (cached) return setState({ stage: "done", report: cached, startFen: fens[0], shared: true, linkable: true });
        if (ctrl.signal.aborted) return;
        setState({ stage: "engine", done: 0, total: fens.length });
        const evals = await analyzePositions(fens, {
          signal: ctrl.signal,
          onProgress: (done, total) => setState({ stage: "engine", done, total }),
        });
        setState({ stage: "server" });
        // Fresh re-analyses are private: never stored, so they get no link.
        setState({ stage: "done", report: await analyzeGame(pgn, evals, fresh), startFen: fens[0], shared: false, linkable: !fresh });
      } catch (err) {
        if (!ctrl.signal.aborted) setState({ stage: "error", message: (err as Error).message });
      }
    })();
    return () => ctrl.abort();
  }, [fresh]);

  // Put the stored review's address in the URL so refresh, bookmarks and sharing all work.
  const linkHash = state.stage === "done" && state.linkable ? state.report.hash : null;
  useEffect(() => {
    if (linkHash) history.replaceState(null, "", `/review?g=${linkHash}`);
  }, [linkHash]);

  if (state.stage === "done") {
    return (
      <Review
        key={String(fresh)}
        report={state.report}
        startFen={state.startFen}
        shared={state.shared}
        shareUrl={state.linkable ? `${location.origin}/review?g=${state.report.hash}` : undefined}
        onReanalyze={() => {
          setState({ stage: "engine", done: 0, total: 0 });
          setFresh(true);
        }}
      />
    );
  }

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
            <p className="font-semibold">{
                { lookup: "Looking for an existing review…", engine: "Analyzing with Stockfish…", server: "Classifying moves and writing coach notes…" }[
                  state.stage
                ]
              }</p>
            <progress
              className="h-2 w-full"
              aria-label="Analysis progress"
              value={state.stage === "engine" ? state.done : state.stage === "server" ? 1 : undefined}
              max={state.stage === "engine" ? state.total || 1 : 1}
            />
            <p className="text-sm text-muted tabular-nums">
              {state.stage === "engine" && state.total > 0 ? `${state.done} of ${state.total} positions` : " "}
            </p>
          </>
        )}
      </div>
    </main>
  );
}
