import { Chess } from "chess.js";
import { BADGE, badgeText, canRetry, describeEval, formatEval, personalize, uciToSan } from "@/lib/review";
import type { ReviewMove } from "@/lib/types";
import { BadgeIcon } from "./BadgeIcon";

/** What the board is showing: the game itself, the engine's line being played out, or a retry attempt. */
export type Mode =
  | { kind: "game" }
  | { kind: "line"; fens: string[]; sans: string[]; index: number; playing: boolean }
  | { kind: "retry"; fen: string; feedback: { ok: boolean; san: string; uci: string } | null }
  | { kind: "end" };

const PIECE: Record<string, string> = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };

type Props = {
  move: ReviewMove | null;
  fenBefore: string;
  opening: string | null;
  mode: Mode;
  /** On a retry-able error, the answer (best move, arrow, coach note) stays hidden until this is true. */
  revealed: boolean;
  /** You already found the move on this ply in a retry. */
  solved: boolean;
  /** Your name when you played this game, so coach notes can say "your" instead of it. */
  you: string | null;
  /** Set when this ply is one of the key moments: 1-based position and how many there are. */
  moment: { index: number; total: number } | null;
  onReveal: () => void;
  onFollowUp: () => void;
  onRetry: () => void;
  onExit: () => void;
  /** Show position `index` of the engine line (0 = before its first move); also stops autoplay. */
  onLineStep: (index: number) => void;
};

// 44px tall on phones (thumb targets), compact on desktop.
const primary = "rounded bg-accent px-3 py-3 text-sm font-bold text-[#141311] hover:brightness-110 lg:py-1.5";
const secondary = "rounded bg-bg px-3 py-3 text-sm font-semibold hover:bg-line lg:py-1.5";

/** Move numbers for a line starting at `fen`: "19… Rxg2+ 20. Kxg2 Ne5". */
function numbered(fen: string, sans: string[]): string[] {
  const [, turn, , , , full] = fen.split(" ");
  let moveNo = Number(full) || 1;
  let white = turn === "w";
  return sans.map((san, i) => {
    const label = white ? `${moveNo}. ${san}` : i === 0 ? `${moveNo}… ${san}` : san;
    if (!white) moveNo += 1;
    white = !white;
    return label;
  });
}

/** What happened on the current ply, the coach's take, and ways to dig in: retry the move or see the best line. */
export function MoveCard({ move, fenBefore, opening, mode, revealed, solved, you, moment, onReveal, onFollowUp, onRetry, onExit, onLineStep }: Props) {
  if (!move) {
    return (
      <div className="flex min-h-16 items-center rounded-md bg-raised px-3 py-2 text-sm text-muted">
        Starting position. Tap › (or press →) to step through the game, or jump to the key moments.
      </div>
    );
  }
  const side = move.color === "white" ? "White" : "Black";

  if (mode.kind === "retry") {
    const { feedback } = mode;
    // After a wrong try, name the piece the best move uses (and its square, so it's never ambiguous): a nudge, not the answer.
    const piece = move.bestUci && new Chess(fenBefore).get(move.bestUci.slice(0, 2) as Parameters<Chess["get"]>[0]);
    // Why it falls short, when we know: it's the game move, or one of the engine's lines with fewer winning chances.
    const alt = feedback && move.alternatives.find((a) => a.uci === feedback.uci);
    const top = move.alternatives[0];
    const why = !feedback || feedback.ok ? "" : feedback.uci === move.uci ? "That’s the game move again. " : alt && top ? `It keeps ${Math.round(alt.w)}% winning chances; the best keeps ${Math.round(top.w)}%. ` : "";
    const hint = feedback && !feedback.ok ? `${why}${piece ? `Hint: move the ${PIECE[piece.type]} on ${move.bestUci!.slice(0, 2)}.` : "Try another move."}` : null;
    return (
      <div className="space-y-2 rounded-md bg-raised px-3 py-2.5" aria-live="polite">
        <div className="flex items-center gap-2.5">
          {feedback?.ok && <BadgeIcon key={feedback.san} badge="best" size={26} className="badge-pop shrink-0" />}
          <p className={`font-semibold ${feedback && !feedback.ok ? "text-danger" : ""}`} style={feedback?.ok ? { color: badgeText("best") } : undefined}>
            {!feedback ? `Find a better move for ${side}` : feedback.ok ? `Nice! ${feedback.san} works.` : `${feedback.san} isn’t it. Try again.`}
          </p>
        </div>
        <p className="text-sm text-muted">
          {feedback?.ok ? "That’s the move the engine wanted." : (hint ?? "Drag a piece, or tap it and then tap where it should go.")}
        </p>
        <div className="flex flex-wrap gap-2">
          <button onClick={onExit} className={feedback?.ok ? primary : secondary}>
            Back to game
          </button>
          <button onClick={onFollowUp} className={secondary}>
            {feedback?.ok ? "Play the best line" : "Show answer"}
          </button>
        </div>
      </div>
    );
  }

  if (mode.kind === "line") {
    const labels = numbered(mode.fens[0], mode.sans);
    return (
      <div className="space-y-2 rounded-md bg-raised px-3 py-2.5" aria-live="polite">
        <p className="font-semibold">The engine’s line</p>
        <p className="flex flex-wrap gap-x-1.5 gap-y-1 text-sm">
          {labels.map((label, i) => (
            <button
              key={i}
              onClick={() => onLineStep(i + 1)}
              aria-current={i + 1 === mode.index ? "step" : undefined}
              className={`rounded px-1 tabular-nums hover:bg-line aria-[current=step]:bg-[#4b4844] ${i < mode.index ? "font-semibold text-fg" : "text-muted"}`}
            >
              {label}
            </button>
          ))}
        </p>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => onLineStep(0)} className={secondary}>
            Replay
          </button>
          <button onClick={onExit} className={secondary}>
            Back to game
          </button>
        </div>
      </div>
    );
  }

  const best = move.bestUci && move.bestUci !== move.uci && move.badge !== "book" ? uciToSan(fenBefore, move.bestUci) : null;
  const evalText = move.mateWhite !== null ? describeEval(move) : formatEval(move);
  const bad = canRetry(move);
  // Don't spoil the puzzle: the best move and the coach's explanation wait until you try or ask.
  const hidden = bad && !revealed && !solved;
  // After a best move the line continues from it ("what comes next"); otherwise it replays the better move.
  const playedBest = move.bestUci === move.uci;
  const hasLine = move.mateWhite !== 0 && move.bestPv.length > (playedBest ? 1 : 0);
  const sub = hidden ? BADGE[move.badge].rule : best ? `Best was ${best}` : move.badge === "book" && opening ? opening : BADGE[move.badge].rule;
  return (
    // Polite live region: stepping with the arrows or N/P reads out the new move and verdict.
    <div className="space-y-2 rounded-md bg-raised px-3 py-2.5" aria-live="polite">
      <div className="flex items-center gap-3">
        <BadgeIcon badge={move.badge} size={28} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold" style={{ color: badgeText(move.badge) }}>
            {move.san} {BADGE[move.badge].phrase}
          </p>
          <p className="text-sm text-muted">
            {moment && (
              <span className="text-fg">
                Key moment {moment.index} of {moment.total} ·{" "}
              </span>
            )}
            {solved && <span style={{ color: badgeText("best") }}>Solved · </span>}
            {sub}
          </p>
        </div>
        <span className="shrink-0 rounded bg-bg px-2 py-0.5 text-sm font-semibold tabular-nums" title={describeEval(move)}>
          {evalText}
          <span className="sr-only"> ({describeEval(move)})</span>
        </span>
      </div>
      {move.coach && !hidden && <p className="text-sm leading-relaxed text-pretty">{personalize(move.coach, you)}</p>}
      {move.badge !== "book" && (bad || hasLine) && (
        <div className="flex flex-wrap gap-2">
          {/* Retry comes first on errors: seeing the answer before trying would spoil the puzzle. */}
          {bad && (
            <button onClick={onRetry} className={solved ? secondary : primary}>
              Retry this move
            </button>
          )}
          {hidden ? (
            <button onClick={onReveal} className={secondary}>
              Show answer
            </button>
          ) : (
            hasLine && (
              <button onClick={onFollowUp} className={secondary}>
                {playedBest ? "What comes next" : "Play the best line"}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
