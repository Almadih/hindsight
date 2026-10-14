"use client";

import { Chess } from "chess.js";
import Link from "next/link";
import { useEffect, useState } from "react";
import { capturedPieces, followUpLine, isGoodRetry, materialDiff } from "@/lib/review";
import type { Report, Side } from "@/lib/types";
import { Board } from "./Board";
import { EvalBar } from "./EvalBar";
import { EvalGraph } from "./EvalGraph";
import { Icon } from "./Icon";
import { MoveCard, type Mode } from "./MoveCard";
import { MoveList } from "./MoveList";
import { PlayerBar } from "./PlayerBar";
import { SummaryCard } from "./SummaryCard";

type Tab = "summary" | "moves";

const LINE_STEP_MS = 700;
const GAME: Mode = { kind: "game" };

export function Review({ report, startFen }: { report: Report; startFen: string }) {
  const [ply, setPly] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [tab, setTab] = useState<Tab>("summary");
  const [mode, setMode] = useState<Mode>(GAME);
  const last = report.moves.length;
  // Any navigation leaves a follow-up line or retry and returns to the game.
  const go = (p: number) => {
    setMode(GAME);
    setPly(Math.max(0, Math.min(last, p)));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select")) return;
      const step = { ArrowLeft: -1, ArrowRight: 1, Home: -Infinity, End: Infinity }[e.key];
      if (step !== undefined) {
        e.preventDefault();
        setMode(GAME);
        setPly((p) => Math.max(0, Math.min(last, p + step)));
        setTab("moves");
      } else if (e.key === "f") {
        setFlipped((f) => !f);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [last]);

  // Play the engine line out one move at a time.
  useEffect(() => {
    if (mode.kind !== "line" || mode.index >= mode.fens.length - 1) return;
    const t = setTimeout(() => setMode({ ...mode, index: mode.index + 1 }), LINE_STEP_MS);
    return () => clearTimeout(t);
  }, [mode]);

  const move = ply ? report.moves[ply - 1] : null;
  const fenBefore = ply > 1 ? report.moves[ply - 2].fen : startFen;
  const fen = mode.kind === "line" ? mode.fens[mode.index] : mode.kind === "retry" ? mode.fen : (move?.fen ?? startFen);
  const { headers } = report;
  const names: Record<Side, string> = { white: headers.White || "White", black: headers.Black || "Black" };
  const ratings: Record<Side, string | undefined> = { white: headers.WhiteElo, black: headers.BlackElo };
  const material = materialDiff(fen);
  const captured = capturedPieces(fen);

  const followUp = () => move && setMode({ kind: "line", ...followUpLine(fenBefore, move.bestPv), index: 0 });
  const retry = () => setMode({ kind: "retry", fen: fenBefore, feedback: null });
  const tryMove = (from: string, to: string): boolean => {
    if (!move || mode.kind !== "retry" || mode.feedback?.ok) return false;
    const chess = new Chess(mode.fen);
    let played;
    try {
      played = chess.move({ from, to, promotion: "q" });
    } catch {
      return false; // illegal: the piece snaps back
    }
    const ok = isGoodRetry(move, played.lan);
    setMode({ kind: "retry", fen: ok ? chess.fen() : mode.fen, feedback: { ok, san: played.san } });
    return ok;
  };
  const [top, bottom]: Side[] = flipped ? ["white", "black"] : ["black", "white"];
  const selectFromSidebar = (p: number) => {
    go(p);
    setTab("moves");
  };

  return (
    <main className="mx-auto grid w-full max-w-[1240px] gap-5 p-3 sm:p-5 lg:h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]">
      <section className="mx-auto flex w-full max-w-[calc(100dvh-6rem)] flex-col gap-1.5 lg:self-center" aria-label="Board">
        <PlayerBar side={top} name={names[top]} rating={ratings[top]} material={material} captured={captured[top]} />
        <div className="flex gap-2">
          <EvalBar ev={move ?? report.start} flipped={flipped} />
          <div className="min-w-0 flex-1 shadow-[0_6px_24px_rgba(0,0,0,0.35)]">
            <Board fen={fen} flipped={flipped} move={mode.kind === "game" ? move : null} onMove={mode.kind === "retry" ? tryMove : undefined} />
          </div>
        </div>
        <PlayerBar side={bottom} name={names[bottom]} rating={ratings[bottom]} material={material} captured={captured[bottom]} />
      </section>

      <aside className="flex min-h-[520px] flex-col gap-4 rounded-lg bg-surface p-4 lg:my-5 lg:min-h-0">
        <header className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold text-balance">
              {names.white} vs {names.black}
            </h1>
            <p className="truncate text-sm text-muted">
              {headers.Result && headers.Result !== "*" ? `${headers.Result} · ` : ""}
              {report.opening ?? "Unknown opening"}
            </p>
          </div>
          <Link href="/" className="rounded p-1.5 text-muted hover:bg-raised hover:text-fg" aria-label="Review another game" title="Review another game">
            <Icon name="back" />
          </Link>
        </header>

        <EvalGraph report={report} ply={ply} onSelect={selectFromSidebar} />

        <div role="tablist" aria-label="Review views" className="grid grid-cols-2 gap-1 rounded-md bg-bg p-1 text-sm font-semibold">
          {(["summary", "moves"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              id={`tab-${t}`}
              aria-selected={tab === t}
              aria-controls={`panel-${t}`}
              onClick={() => setTab(t)}
              className="rounded px-3 py-1.5 text-muted hover:text-fg aria-selected:bg-raised aria-selected:text-fg"
            >
              {t === "summary" ? "Summary" : "Moves"}
            </button>
          ))}
        </div>

        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="flex min-h-0 flex-1 flex-col gap-3">
          {tab === "summary" ? (
            <>
              <SummaryCard report={report} names={names} />
              <button onClick={() => selectFromSidebar(1)} className="rounded-md bg-accent py-2.5 font-semibold text-[#141311] hover:brightness-110">
                Start review
              </button>
            </>
          ) : (
            <>
              <MoveCard
                move={move}
                fenBefore={fenBefore}
                opening={report.opening}
                mode={mode}
                onFollowUp={followUp}
                onRetry={retry}
                onExit={() => setMode(GAME)}
              />
              <MoveList moves={report.moves} ply={ply} onSelect={go} />
            </>
          )}
        </div>

        <nav aria-label="Move navigation" className="grid grid-cols-5 gap-1">
          {(
            [
              ["first", "First move", () => go(0)],
              ["prev", "Previous move", () => go(ply - 1)],
              ["next", "Next move", () => go(ply + 1)],
              ["last", "Last move", () => go(last)],
            ] as const
          ).map(([icon, label, onClick]) => (
            <button
              key={icon}
              onClick={() => {
                onClick();
                setTab("moves");
              }}
              aria-label={label}
              title={label}
              className="flex justify-center rounded bg-raised py-2 hover:bg-[#3d3a35]"
            >
              <Icon name={icon} />
            </button>
          ))}
          <button onClick={() => setFlipped((f) => !f)} aria-label="Flip board" title="Flip board (F)" className="flex justify-center rounded bg-raised py-2 hover:bg-[#3d3a35]">
            <Icon name="flip" />
          </button>
        </nav>
      </aside>
    </main>
  );
}
