"use client";

import { Chess } from "chess.js";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { mySide } from "@/lib/me";
import { BADGE, badgeText, canRetry, capturedPieces, decidingMoments, followUpLine, gist, isGoodRetry, materialDiff, personalize } from "@/lib/review";
import type { Report, ReviewMove, Side } from "@/lib/types";
import { BadgeIcon } from "./BadgeIcon";
import { Board } from "./Board";
import { EvalBar } from "./EvalBar";
import { EvalGraph } from "./EvalGraph";
import { Icon } from "./Icon";
import { MoveCard, type Mode } from "./MoveCard";
import { MoveList } from "./MoveList";
import { PlayerBar } from "./PlayerBar";
import { SummaryCard } from "./SummaryCard";
import { playMove, primeSounds } from "@/lib/sfx";

type Tab = "summary" | "moves";

const LINE_STEP_MS = 700;
const GAME: Mode = { kind: "game" };
const END: Mode = { kind: "end" };

type Props = {
  report: Report;
  startFen: string;
  /** Came from the shared cache (someone else's browser analyzed it), so offer a private re-check. */
  shared: boolean;
  /** Set when the review is stored and can be opened by link. */
  shareUrl?: string;
  /** Open at this ply on the Moves tab (share links to one moment, e.g. a player page's mistake example). */
  initialPly?: number;
  onReanalyze: () => void;
};

export function Review({ report, startFen, shared, shareUrl, initialPly, onReanalyze }: Props) {
  // Which side "you" played, from usernames remembered on this device (Review only renders client-side).
  const [me] = useState(() => mySide(report.headers));
  const site = (report.headers.Site ?? "").toLowerCase();
  const platform = site.includes("chess.com") ? "chesscom" : site.includes("lichess") ? "lichess" : null;
  const myName = me ? report.headers[me === "white" ? "White" : "Black"] : null;
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
  const [ply, setPly] = useState(() => Math.max(0, Math.min(report.moves.length, initialPly ?? 0)));
  const [flipped, setFlipped] = useState(me === "black");
  const [tab, setTab] = useState<Tab>(initialPly ? "moves" : "summary");
  const [mode, setMode] = useState<Mode>(GAME);
  const [picked, setPicked] = useState<string | null>(null);
  const [confirmReanalyze, setConfirmReanalyze] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [sound, setSound] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return sessionStorage.getItem("sound") === "1";
    } catch {
      return false;
    }
  });
  const toggleSound = () => {
    if (!sound) primeSounds();
    const next = !sound;
    setSound(next);
    try {
      sessionStorage.setItem("sound", next ? "1" : "0");
    } catch {}
  };
  useEffect(() => {
    if (sound) primeSounds();
  }, [sound]);
  // Plies whose retry you solved: they stay revealed and the card says so.
  const [solved, setSolved] = useState<ReadonlySet<number>>(new Set());
  const last = report.moves.length;
  const { moments, mine } = decidingMoments(report.moves, me);
  const momentPlies = moments.map((m) => m.ply);

  // On phones the board sits above the panel; after navigating from far down the page, bring it back into view.
  const boardRef = useRef<HTMLElement>(null);
  const showBoard = () => {
    const el = boardRef.current;
    if (el && el.getBoundingClientRect().top < 0) {
      el.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    }
  };
  // Any navigation leaves a follow-up line, retry or the end card and returns to the game.
  const go = (p: number) => {
    setMode(GAME);
    setPicked(null);
    setRevealed(false);
    setPly(Math.max(0, Math.min(last, p)));
    setTab("moves");
    showBoard();
  };
  // Next/Previous walk the key moments only; after the last one the review ends on a recap.
  const nextMoment = mode.kind === "end" ? undefined : momentPlies.find((p) => p > ply);
  const prevMoment = mode.kind === "end" ? momentPlies.at(-1) : [...momentPlies].reverse().find((p) => p < ply);
  const canFinish = mode.kind !== "end" && nextMoment === undefined && moments.length > 0;
  const toNext = () => {
    if (nextMoment !== undefined) go(nextMoment);
    else if (canFinish) {
      setMode(END);
      setTab("moves");
      showBoard();
    }
  };
  const toPrev = () => prevMoment !== undefined && go(prevMoment);

  // Keyboard: arrows/Home/End step, N/P walk the key moments, F flips, Escape leaves a retry, line or the recap. Ignored while typing or on the tabs.
  // Re-subscribed every render so the handler always sees the current ply and mode.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (target?.closest("input, textarea, select, [role=tablist]") || e.ctrlKey || e.metaKey || e.altKey) return;
      const step = { ArrowLeft: -1, ArrowRight: 1, Home: -Infinity, End: Infinity }[e.key];
      const key = e.key.toLowerCase();
      if (step !== undefined) {
        e.preventDefault();
        go(ply + step);
      } else if (key === "n") toNext();
      else if (key === "p") toPrev();
      else if (key === "f") setFlipped((f) => !f);
      else if (key === "s") toggleSound();
      else if (e.key === "Escape" && mode.kind !== "game") {
        setPicked(null);
        if (mode.kind !== "end") setRevealed(true);
        setMode(GAME);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Play the engine line out one move at a time, until the user steps it by hand.
  useEffect(() => {
    if (mode.kind !== "line" || !mode.playing || mode.index >= mode.fens.length - 1) return;
    const t = setTimeout(() => setMode({ ...mode, index: mode.index + 1 }), LINE_STEP_MS);
    return () => clearTimeout(t);
  }, [mode]);

  const move = ply ? report.moves[ply - 1] : null;
  const fenBefore = ply > 1 ? report.moves[ply - 2].fen : startFen;
  const evalBefore = ply > 1 ? report.moves[ply - 2] : report.start;

  useEffect(() => {
    if (sound && move && mode.kind === "game") playMove(move);
  }, [sound, move, mode.kind]);

  useEffect(() => {
    if (sound && mode.kind === "line" && mode.index > 0) {
      const san = mode.sans[mode.index - 1];
      if (san) playMove({ san });
    }
  }, [sound, mode]);
  const fen = mode.kind === "line" ? mode.fens[mode.index] : mode.kind === "retry" ? mode.fen : (move?.fen ?? startFen);
  const { headers } = report;
  const names: Record<Side, string> = { white: headers.White || "White", black: headers.Black || "Black" };
  const ratings: Record<Side, string | undefined> = { white: headers.WhiteElo, black: headers.BlackElo };
  const material = materialDiff(fen);
  const captured = capturedPieces(fen);

  const isRevealed = revealed || solved.has(ply);
  const followUp = () => {
    if (!move) return;
    setRevealed(true);
    // After a best move, show what comes next from it; otherwise replay the better move from before it.
    const line = move.bestUci === move.uci ? followUpLine(move.fen, move.bestPv.slice(1)) : followUpLine(fenBefore, move.bestPv);
    setMode({ kind: "line", ...line, index: 0, playing: true });
  };
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
    if (ok) setSolved((s) => new Set(s).add(ply));
    setMode({ kind: "retry", fen: ok ? chess.fen() : mode.fen, feedback: { ok, san: played.san, uci: played.lan } });
    if (sound) playMove({ san: played.san, badge: ok ? "great" : "mistake" });
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

  // A solved retry lands the Best badge on the board like any reviewed move. On an unsolved error the
  // best-move arrow stays hidden so the board doesn't give the retry away.
  const onGame = mode.kind === "game" || mode.kind === "end";
  const boardMove =
    onGame
      ? move && canRetry(move) && !isRevealed
        ? { ...move, bestUci: null }
        : move
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

  const start = () => go(moments[0]?.ply ?? 1);
  const startLabel = moments.length ? "Start with the first key moment" : "Start review";
  // Controls are 44px tall on phones (thumb targets) and compact on desktop.
  const startButton = "rounded-md bg-accent py-3 font-semibold text-[#141311] hover:brightness-110 lg:py-2.5";
  const navButton = "flex items-center justify-center gap-1.5 rounded bg-raised py-3 text-sm font-semibold hover:bg-line disabled:opacity-40 lg:py-2";
  // Two rows: walk the key moments on top, single-step and flip below.
  const navRows = (titles: boolean) => (
    <>
      <div className="grid grid-cols-2 gap-1">
        <button onClick={toPrev} disabled={prevMoment === undefined} className={navButton} title={titles ? "Previous key moment (P)" : undefined}>
          <Icon name="prev" size={18} />
          Previous key moment
        </button>
        <button onClick={toNext} disabled={nextMoment === undefined && !canFinish} className={navButton} title={titles ? (canFinish ? "Finish the review (N)" : "Next key moment (N)") : undefined}>
          {canFinish ? "Finish review" : "Next key moment"}
          <Icon name="next" size={18} />
        </button>
      </div>
      <div className="grid grid-cols-[1fr_1fr_auto_auto] gap-1">
        <button onClick={() => go(ply - 1)} aria-label="Previous move" title={titles ? "Previous move (←)" : undefined} className={navButton}>
          <Icon name="prev" />
        </button>
        <button onClick={() => go(ply + 1)} aria-label="Next move" title={titles ? "Next move (→)" : undefined} className={navButton}>
          <Icon name="next" />
        </button>
        <button onClick={() => setFlipped((f) => !f)} aria-label="Flip board" title={titles ? "Flip board (F)" : undefined} className={`${navButton} px-3`}>
          <Icon name="flip" />
        </button>
        <button
          onClick={toggleSound}
          aria-label={sound ? "Sound on" : "Sound off"}
          aria-pressed={sound}
          title={titles ? (sound ? "Sound on (S)" : "Sound off (S)") : undefined}
          className={`${navButton} px-3 aria-pressed:text-accent`}
        >
          <Icon name={sound ? "soundOn" : "soundOff"} size={18} />
        </button>
      </div>
    </>
  );

  return (
    <main className="mx-auto grid w-full max-w-[1240px] grid-cols-[minmax(0,1fr)] gap-4 p-3 pb-32 sm:p-5 sm:pb-32 lg:h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)] lg:gap-5 lg:pb-5">
      <section
        ref={boardRef}
        className="mx-auto scroll-mt-3 flex w-full max-w-[calc(100dvh-6rem)] flex-col gap-1.5 lg:self-center"
        aria-label="Board"
        onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
        onTouchEnd={onTouchEnd}
      >
        <PlayerBar side={top} name={me === top ? `${names[top]} (you)` : names[top]} rating={ratings[top]} material={material} captured={captured[top]} />
        <div className="flex gap-2">
          {/* During a retry or an engine line the bar shows the position being explored, not the played move. */}
          <EvalBar ev={onGame ? (move ?? report.start) : evalBefore} flipped={flipped} />
          <div className="min-w-0 flex-1 shadow-[0_6px_24px_rgba(0,0,0,0.35)]">
            <Board
              fen={fen}
              flipped={flipped}
              move={boardMove}
              onMove={mode.kind === "retry" ? tryMove : undefined}
              onSquareClick={mode.kind === "retry" ? tapSquare : undefined}
              // In a retry, mark the opponent's move you're answering.
              lastUci={mode.kind === "retry" && !mode.feedback?.ok && ply > 1 ? report.moves[ply - 2].uci : undefined}
              selected={mode.kind === "retry" ? picked : null}
              fx={{ intensity: "subtle", prevFen: fenBefore }}
            />
          </div>
        </div>
        <PlayerBar side={bottom} name={me === bottom ? `${names[bottom]} (you)` : names[bottom]} rating={ratings[bottom]} material={material} captured={captured[bottom]} />
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
            {me && (
              <p className="mt-1 text-sm">
                You played {me === "white" ? "White" : "Black"}
                {platform && myName && (
                  <>
                    {" · "}
                    <Link href={`/player?p=${platform}&u=${encodeURIComponent(myName)}`} className="font-semibold text-accent hover:underline">
                      Your player page
                    </Link>
                  </>
                )}
              </p>
            )}
            <p className="mt-1 text-sm text-muted">
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
          <button
            onClick={toggleSound}
            aria-pressed={sound}
            aria-label={sound ? "Sound on" : "Sound off"}
            title={sound ? "Sound on (S)" : "Sound off (S)"}
            className="rounded p-1.5 text-muted hover:bg-raised hover:text-fg aria-pressed:text-accent"
          >
            <Icon name={sound ? "soundOn" : "soundOff"} size={18} />
          </button>
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
              className="rounded px-3 py-3 text-muted hover:text-fg aria-selected:bg-raised aria-selected:text-fg lg:py-1.5"
            >
              {t === "summary" ? "Summary" : "Moves"}
            </button>
          ))}
        </div>

        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="order-2 flex min-h-0 flex-1 flex-col gap-3 lg:order-none">
          {tab === "summary" ? (
            <>
              <SummaryCard report={report} names={names} me={me} moments={moments} mine={mine} solved={solved} onJump={go} />
              {/* Phones get this in the sticky bar instead, within thumb reach. */}
              <button onClick={start} className={`${startButton} hidden lg:block`}>
                {startLabel}
              </button>
            </>
          ) : mode.kind === "end" ? (
            <section aria-labelledby="end-title" aria-live="polite" className="space-y-3 rounded-md bg-raised px-3 py-3">
              <div>
                <h2 id="end-title" className="text-xl font-bold">
                  That’s what decided it
                </h2>
                <p className="mt-1 text-sm text-pretty">{takeaway(report, names, me)}</p>
              </div>
              <ol className="space-y-1">
                {moments.map((m) => (
                  <li key={m.ply}>
                    <button onClick={() => go(m.ply)} className="flex w-full items-start gap-2.5 rounded px-2 py-3 text-left text-sm hover:bg-line lg:py-1.5">
                      <BadgeIcon badge={m.badge} size={20} className="mt-0.5 shrink-0" />
                      <span className="min-w-0">
                        <span className="font-semibold tabular-nums">
                          {Math.ceil(m.ply / 2)}.{m.color === "black" ? ".." : ""} {m.san}
                        </span>{" "}
                        <span style={{ color: badgeText(m.badge) }}>{BADGE[m.badge].phrase}</span>
                        {m.coach && <span className="mt-0.5 block text-pretty text-muted">{gist(personalize(m.coach, myName))}</span>}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => {
                    setMode(GAME);
                    setTab("summary");
                  }}
                  className="rounded bg-accent px-3 py-3 text-sm font-bold text-[#141311] hover:brightness-110 lg:py-1.5"
                >
                  Back to summary
                </button>
                <button onClick={() => go(ply + 1)} className="rounded bg-bg px-3 py-3 text-sm font-semibold hover:bg-line lg:py-1.5">
                  Keep stepping through the game
                </button>
              </div>
            </section>
          ) : (
            <>
              <MoveCard
                move={move}
                fenBefore={fenBefore}
                opening={report.opening}
                mode={mode}
                revealed={isRevealed}
                solved={solved.has(ply)}
                you={myName}
                moment={momentPlies.includes(ply) ? { index: momentPlies.indexOf(ply) + 1, total: momentPlies.length } : null}
                onReveal={() => setRevealed(true)}
                onFollowUp={followUp}
                onRetry={retry}
                onExit={() => {
                  setPicked(null);
                  setRevealed(true);
                  setMode(GAME);
                }}
                onLineStep={(index) => mode.kind === "line" && setMode({ ...mode, index, playing: index === 0 })}
              />
              <MoveList moves={report.moves} ply={ply} onSelect={go} />
            </>
          )}
        </div>

        {/* Desktop navigation; phones get the sticky bar below instead. */}
        {/* Hidden on the Summary tab to give the key moments the height; the summary has its own start button. */}
        <nav aria-label="Move navigation" className={`order-5 hidden gap-1 lg:order-none ${tab === "moves" ? "lg:grid" : ""}`}>
          {navRows(true)}
          <p className="pt-1 text-center text-xs text-muted">
            <kbd>←</kbd> <kbd>→</kbd> step · <kbd>N</kbd> <kbd>P</kbd> key moments · <kbd>F</kbd> flip · <kbd>S</kbd> sound · <kbd>Esc</kbd> back to the game
          </p>
        </nav>
      </aside>

      <nav
        aria-label="Move navigation"
        className="fixed inset-x-0 bottom-0 z-50 grid gap-1 border-t border-line bg-surface/95 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:hidden"
      >
        {tab === "summary" ? (
          <button onClick={start} className={startButton}>
            {startLabel}
          </button>
        ) : (
          navRows(false)
        )}
      </nav>
    </main>
  );
}

/** How the game ended and the single biggest swing, in plain words, from your side when we know it. */
function takeaway(report: Report, names: Record<Side, string>, me: Side | null): string {
  const result = report.headers.Result;
  const winner: Side | null = result === "1-0" ? "white" : result === "0-1" ? "black" : null;
  const ended = result === "1/2-1/2" ? "The game ended in a draw." : !winner ? "" : me ? (me === winner ? "You won." : "You lost.") : `${names[winner]} won.`;
  const swing = report.moves.reduce<ReviewMove | null>((a, m) => (!a || m.wBefore - m.wAfter > a.wBefore - a.wAfter ? m : a), null);
  const lost = swing ? Math.round(swing.wBefore - swing.wAfter) : 0;
  if (!swing || lost < 10) return `${ended} No single move decided it; these were the turning points.`.trim();
  const who = swing.color === me ? "you" : names[swing.color];
  return `${ended} The biggest swing was ${Math.ceil(swing.ply / 2)}.${swing.color === "black" ? ".." : ""} ${swing.san}, where ${who} gave away ${lost}% winning chances.`.trim();
}
