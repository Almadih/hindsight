"use client";

import { Chess } from "chess.js";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { capturedPieces, followUpLine, isGoodRetry, isNotableMove, keyMoments, materialDiff } from "@/lib/review";
import type { Badge, Report, Side } from "@/lib/types";
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
// The moments worth a full-strength board reaction; everything else stays on the quiet tier.
const DECISIVE = new Set<Badge>(["brilliant", "great", "blunder", "miss"]);

type Props = {
  report: Report;
  startFen: string;
  /** Came from the shared cache (someone else's browser analyzed it), so offer a private re-check. */
  shared: boolean;
  /** Set when the review is stored and can be opened by link. */
  shareUrl?: string;
  onReanalyze: () => void;
};

export function Review({ report, startFen, shared, shareUrl, onReanalyze }: Props) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const copyLink = async () => {
    if (!shareUrl) return;
    let ok = false;
    try {
      // writeText can hang rather than reject (hidden tab, pending permission), so cap the wait.
      await Promise.race([
        navigator.clipboard.writeText(shareUrl),
        new Promise((_, reject) => setTimeout(() => reject(new Error("clipboard timeout")), 1000)),
      ]);
      ok = true;
    } catch {
      // Clipboard API refused or stalled (no focus, no permission, insecure context): fall back to a selected textarea.
      const area = Object.assign(document.createElement("textarea"), { value: shareUrl });
      area.style.cssText = "position:fixed;opacity:0";
      document.body.append(area);
      area.select();
      ok = document.execCommand("copy");
      area.remove();
    }
    setCopyState(ok ? "copied" : "failed");
    setTimeout(() => setCopyState("idle"), 2500);
  };
  const [ply, setPly] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [tab, setTab] = useState<Tab>("summary");
  const [mode, setMode] = useState<Mode>(GAME);
  const [picked, setPicked] = useState<string | null>(null);
  const [confirmReanalyze, setConfirmReanalyze] = useState(false);
  const last = report.moves.length;
  const moments = keyMoments(report.moves);
  const notable = report.moves.filter(isNotableMove).map((m) => m.ply);

  // Any navigation leaves a follow-up line or retry and returns to the game.
  const go = (p: number) => {
    setMode(GAME);
    setPicked(null);
    setPly(Math.max(0, Math.min(last, p)));
    setTab("moves");
  };
  const nextKey = (from: number) => notable.find((p) => p > from);
  const prevKey = (from: number) => [...notable].reverse().find((p) => p < from);

  // Keyboard: arrows/Home/End step, N/P jump between key moves, F flips. Ignored while typing or on the tabs.
  useEffect(() => {
    const keys = report.moves.filter(isNotableMove).map((m) => m.ply);
    const onKey = (e: KeyboardEvent) => {
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (target?.closest("input, textarea, select, [role=tablist]") || e.ctrlKey || e.metaKey || e.altKey) return;
      const step = { ArrowLeft: -1, ArrowRight: 1, Home: -Infinity, End: Infinity }[e.key];
      const key = e.key.toLowerCase();
      const jump = (dir: 1 | -1) =>
        setPly((p) => (dir > 0 ? keys.find((q) => q > p) : [...keys].reverse().find((q) => q < p)) ?? p);
      if (step !== undefined) {
        e.preventDefault();
        setPly((p) => Math.max(0, Math.min(last, p + step)));
      } else if (key === "n") jump(1);
      else if (key === "p") jump(-1);
      else if (key === "f") return setFlipped((f) => !f);
      else return;
      setMode(GAME);
      setPicked(null);
      setTab("moves");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [last, report.moves]);

  // Play the engine line out one move at a time, until the user steps it by hand.
  useEffect(() => {
    if (mode.kind !== "line" || !mode.playing || mode.index >= mode.fens.length - 1) return;
    const t = setTimeout(() => setMode({ ...mode, index: mode.index + 1 }), LINE_STEP_MS);
    return () => clearTimeout(t);
  }, [mode]);

  const move = ply ? report.moves[ply - 1] : null;
  const fenBefore = ply > 1 ? report.moves[ply - 2].fen : startFen;
  const evalBefore = ply > 1 ? report.moves[ply - 2] : report.start;
  const fen = mode.kind === "line" ? mode.fens[mode.index] : mode.kind === "retry" ? mode.fen : (move?.fen ?? startFen);
  const { headers } = report;
  const names: Record<Side, string> = { white: headers.White || "White", black: headers.Black || "Black" };
  const ratings: Record<Side, string | undefined> = { white: headers.WhiteElo, black: headers.BlackElo };
  const material = materialDiff(fen);
  const captured = capturedPieces(fen);

  const followUp = () => move && setMode({ kind: "line", ...followUpLine(fenBefore, move.bestPv), index: 0, playing: true });
  const retry = () => {
    setPicked(null);
    setMode({ kind: "retry", fen: fenBefore, feedback: null });
  };
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
    setMode({ kind: "retry", fen: ok ? chess.fen() : mode.fen, feedback: { ok, san: played.san, uci: played.lan } });
    return ok;
  };
  // Tap-to-move for phones and keyboards: tap your piece, then its destination.
  const tapSquare = (square: string) => {
    if (mode.kind !== "retry" || mode.feedback?.ok) return;
    const piece = new Chess(mode.fen).get(square as Parameters<Chess["get"]>[0]);
    const mine = piece && piece.color === mode.fen.split(" ")[1];
    if (picked && !mine) {
      setPicked(null);
      tryMove(picked, square);
    } else setPicked(mine ? square : null);
  };

  // A solved retry lands the Best badge on the board like any reviewed move.
  const boardMove =
    mode.kind === "game"
      ? move
      : mode.kind === "retry" && mode.feedback?.ok
        ? { ply: 10_000 + ply, san: mode.feedback.san, uci: mode.feedback.uci, badge: "best" as const, bestUci: null }
        : null;
  const [top, bottom]: Side[] = flipped ? ["white", "black"] : ["black", "white"];

  // Swipe the board to step through moves on phones.
  const touch = useRef<{ x: number; y: number } | null>(null);
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touch.current;
    touch.current = null;
    if (!start || mode.kind === "retry") return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    if (Math.abs(dx) > 48 && Math.abs(dx) > 1.5 * Math.abs(dy)) go(ply + (dx < 0 ? 1 : -1));
  };

  const navButton = "flex items-center justify-center gap-1.5 rounded bg-raised py-2 text-sm font-semibold hover:bg-line disabled:opacity-40";
  // Two rows: jump between key moves on top, single-step and flip below.
  const navRows = (titles: boolean) => (
    <>
      <div className="grid grid-cols-2 gap-1">
        <button onClick={() => go(prevKey(ply) ?? ply)} disabled={prevKey(ply) === undefined} className={navButton} title={titles ? "Previous key move (P)" : undefined}>
          <Icon name="prev" size={18} />
          Previous key move
        </button>
        <button onClick={() => go(nextKey(ply) ?? ply)} disabled={nextKey(ply) === undefined} className={navButton} title={titles ? "Next key move (N)" : undefined}>
          Next key move
          <Icon name="next" size={18} />
        </button>
      </div>
      <div className="grid grid-cols-[1fr_1fr_auto] gap-1">
        <button onClick={() => go(ply - 1)} aria-label="Previous move" title={titles ? "Previous move (←)" : undefined} className={navButton}>
          <Icon name="prev" />
        </button>
        <button onClick={() => go(ply + 1)} aria-label="Next move" title={titles ? "Next move (→)" : undefined} className={navButton}>
          <Icon name="next" />
        </button>
        <button onClick={() => setFlipped((f) => !f)} aria-label="Flip board" title={titles ? "Flip board (F)" : undefined} className={`${navButton} px-3`}>
          <Icon name="flip" />
        </button>
      </div>
    </>
  );

  return (
    <main className="mx-auto grid w-full max-w-[1240px] grid-cols-[minmax(0,1fr)] gap-4 p-3 pb-32 sm:p-5 sm:pb-32 lg:h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)] lg:gap-5 lg:pb-5">
      <section
        className="mx-auto flex w-full max-w-[calc(100dvh-6rem)] flex-col gap-1.5 lg:self-center"
        aria-label="Board"
        onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
        onTouchEnd={onTouchEnd}
      >
        <PlayerBar side={top} name={names[top]} rating={ratings[top]} material={material} captured={captured[top]} />
        <div className="flex gap-2">
          {/* During a retry or an engine line the bar shows the position being explored, not the played move. */}
          <EvalBar ev={mode.kind === "game" ? (move ?? report.start) : evalBefore} flipped={flipped} />
          <div className="min-w-0 flex-1 shadow-[0_6px_24px_rgba(0,0,0,0.35)]">
            <Board
              fen={fen}
              flipped={flipped}
              move={boardMove}
              onMove={mode.kind === "retry" ? tryMove : undefined}
              onSquareClick={mode.kind === "retry" ? tapSquare : undefined}
              selected={mode.kind === "retry" ? picked : null}
              fx={{ intensity: boardMove && DECISIVE.has(boardMove.badge) ? "epic" : "subtle", prevFen: fenBefore }}
            />
          </div>
        </div>
        <PlayerBar side={bottom} name={names[bottom]} rating={ratings[bottom]} material={material} captured={captured[bottom]} />
      </section>

      {/* On phones the order is: what you need while stepping (tabs, card, list), then the graph and the game header. */}
      <aside className="flex min-w-0 flex-col gap-4 rounded-lg bg-surface p-4 lg:my-5 lg:min-h-0">
        <header className="order-4 flex items-start gap-3 lg:order-none">
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold text-balance">
              {names.white} vs {names.black}
            </h1>
            <p className="truncate text-sm text-muted" title={report.opening ?? undefined}>
              {headers.Result && headers.Result !== "*" ? `${headers.Result} · ` : ""}
              {report.opening ?? "Unknown opening"}
            </p>
            <p className="mt-1 text-xs text-muted">
              {!shared ? (
                "Analyzed in your browser"
              ) : confirmReanalyze ? (
                <>
                  Run your own analysis? It takes about a minute and counts toward today’s limit.{" "}
                  <button onClick={onReanalyze} className="font-semibold text-fg underline decoration-line underline-offset-2 hover:decoration-fg">
                    Yes, re-analyze
                  </button>{" "}
                  <button onClick={() => setConfirmReanalyze(false)} className="font-semibold underline decoration-line underline-offset-2 hover:text-fg">
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  Shared review.{" "}
                  <button onClick={() => setConfirmReanalyze(true)} className="font-semibold text-fg underline decoration-line underline-offset-2 hover:decoration-fg">
                    Check it in my browser
                  </button>
                </>
              )}
            </p>
          </div>
          {shareUrl && (
            <button
              onClick={copyLink}
              className="flex shrink-0 items-center gap-1.5 rounded px-2 py-1.5 text-sm font-semibold text-muted hover:bg-raised hover:text-fg"
              aria-live="polite"
            >
              <Icon name="link" size={18} />
              {{ idle: "Copy link", copied: "Copied", failed: "Copy the address bar" }[copyState]}
            </button>
          )}
          <Link href="/" className="rounded p-1.5 text-muted hover:bg-raised hover:text-fg" aria-label="Review another game" title="Review another game">
            <Icon name="back" />
          </Link>
        </header>

        <div className="order-3 lg:order-none">
          <EvalGraph report={report} ply={ply} onSelect={go} />
        </div>

        <div
          role="tablist"
          aria-label="Review views"
          className="order-1 grid grid-cols-2 gap-1 rounded-md bg-bg p-1 text-sm font-semibold lg:order-none"
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
              e.preventDefault();
              const next = tab === "summary" ? "moves" : "summary";
              setTab(next);
              document.getElementById(`tab-${next}`)?.focus();
            }
          }}
        >
          {(["summary", "moves"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              id={`tab-${t}`}
              aria-selected={tab === t}
              aria-controls={`panel-${t}`}
              tabIndex={tab === t ? 0 : -1}
              onClick={() => setTab(t)}
              className="rounded px-3 py-1.5 text-muted hover:text-fg aria-selected:bg-raised aria-selected:text-fg"
            >
              {t === "summary" ? "Summary" : "Moves"}
            </button>
          ))}
        </div>

        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="order-2 flex min-h-0 flex-1 flex-col gap-3 lg:order-none">
          {tab === "summary" ? (
            <>
              <SummaryCard report={report} names={names} onJump={go} />
              <button onClick={() => go(moments[0]?.ply ?? 1)} className="rounded-md bg-accent py-2.5 font-semibold text-[#141311] hover:brightness-110">
                {moments.length ? "Start with the first key moment" : "Start review"}
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
                onExit={() => {
                  setPicked(null);
                  setMode(GAME);
                }}
                onLineStep={(index) => mode.kind === "line" && setMode({ ...mode, index, playing: index === 0 })}
              />
              <MoveList moves={report.moves} ply={ply} onSelect={go} />
            </>
          )}
        </div>

        {/* Desktop navigation; phones get the sticky bar below instead. */}
        <nav aria-label="Move navigation" className="order-5 hidden gap-1 lg:order-none lg:grid">
          {navRows(true)}
        </nav>
      </aside>

      <nav
        aria-label="Move navigation"
        className="fixed inset-x-0 bottom-0 z-50 grid gap-1 border-t border-line bg-surface/95 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:hidden"
      >
        {navRows(false)}
      </nav>
    </main>
  );
}
