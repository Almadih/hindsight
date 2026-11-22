"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnalysisLive } from "@/components/AnalysisLive";
import { Review } from "@/components/Review";
import { analyzeGame, cachedReview, getReview } from "@/lib/api";
import { analyzePositions, readQuality, type PositionEval } from "@/lib/engine/pool";
import { parsePgn, reportPgn, START_FEN } from "@/lib/pgn";
import type { Report } from "@/lib/types";

type State =
  | { stage: "lookup" }
  | { stage: "engine" | "server"; game: { fens: string[]; sans: string[]; headers: Record<string, string> }; evals: (PositionEval | undefined)[] }
  // shared: came from the shared store, not this browser's engine. linkable: stored, so /review?g=<hash> opens it.
  | { stage: "done"; report: Report; startFen: string; shared: boolean; linkable: boolean }
  | { stage: "error"; message: string };

export default function ReviewPage() {
  const [state, setState] = useState<State>({ stage: "lookup" });
  // True after the user asks to re-check a shared review with their own engine; runId forces re-runs on repeat clicks.
  const [{ fresh, runId }, setRun] = useState({ fresh: false, runId: 0 });

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
          try {
            sessionStorage.setItem("pgn", reportPgn(report.headers, report.moves.map((m) => m.san)));
          } catch {}
          return setState({ stage: "done", report, startFen: report.headers.FEN ?? START_FEN, shared: true, linkable: true });
        }

        let input: string | null = null;
        try {
          input = sessionStorage.getItem("pgn");
        } catch {}
        if (!input) throw new Error("No game to review yet. Pick a game or paste a PGN first.");
        const { pgn, fens, sans, headers } = parsePgn(input);
        const game = { fens, sans, headers };
        // Someone may already have reviewed this exact game: skip the engine entirely.
        const cached = fresh ? null : await cachedReview(pgn);
        if (cached) return setState({ stage: "done", report: cached, startFen: fens[0], shared: true, linkable: true });
        if (ctrl.signal.aborted) return;
        const live: (PositionEval | undefined)[] = new Array(fens.length);
        setState({ stage: "engine", game, evals: [...live] });
        const quality = readQuality();
        const evals = await analyzePositions(fens, {
          signal: ctrl.signal,
          quality,
          onPosition: (i, ev) => {
            live[i] = ev;
            setState({ stage: "engine", game, evals: [...live] });
          },
        });
        setState({ stage: "server", game, evals });
        // Fresh re-analyses are private: never stored, so they get no link.
        setState({ stage: "done", report: await analyzeGame(pgn, evals, fresh), startFen: fens[0], shared: false, linkable: !fresh });
      } catch (err) {
        if (!ctrl.signal.aborted) setState({ stage: "error", message: (err as Error).message });
      }
    })();
    return () => ctrl.abort();
  }, [fresh, runId]);

  // Put the stored review's address in the URL so refresh, bookmarks and sharing all work.
  const linkHash = state.stage === "done" && state.linkable ? state.report.hash : null;
  useEffect(() => {
    if (linkHash) {
      const q = new URLSearchParams(location.search);
      q.set("g", linkHash);
      history.replaceState(null, "", `/review?${q.toString()}`);
    }
  }, [linkHash]);

  if (state.stage === "done") {
    return (
      <Review
        key={String(fresh)}
        report={state.report}
        startFen={state.startFen}
        shared={state.shared}
        shareUrl={state.linkable ? `${location.origin}/review?g=${state.report.hash}` : undefined}
        initialPly={Number(new URLSearchParams(location.search).get("ply")) || undefined}
        onReanalyze={() => {
          setState({ stage: "lookup" });
          setRun((r) => ({ fresh: true, runId: r.runId + 1 }));
        }}
      />
    );
  }

  if (state.stage === "engine" || state.stage === "server") {
    return <AnalysisLive {...state.game} evals={state.evals} classifying={state.stage === "server"} />;
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
            <p className="font-semibold">Looking for an existing review…</p>
            <progress className="h-2 w-full" aria-label="Looking for an existing review" />
          </>
        )}
      </div>
    </main>
  );
}
