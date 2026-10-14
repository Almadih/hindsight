import { BADGE, formatEval, uciToSan } from "@/lib/review";
import type { ReviewMove } from "@/lib/types";
import { BadgeIcon } from "./BadgeIcon";

/** What the board is showing: the game itself, the engine's line being played out, or a retry attempt. */
export type Mode =
  | { kind: "game" }
  | { kind: "line"; fens: string[]; sans: string[]; index: number }
  | { kind: "retry"; fen: string; feedback: { ok: boolean; san: string } | null };

const RETRY_BADGES = new Set(["inaccuracy", "mistake", "miss", "blunder"]);

type Props = {
  move: ReviewMove | null;
  fenBefore: string;
  opening: string | null;
  mode: Mode;
  onFollowUp: () => void;
  onRetry: () => void;
  onExit: () => void;
};

const action = "rounded bg-bg px-3 py-1.5 text-sm font-semibold hover:bg-[#3d3a35]";

/** What happened on the current ply, the coach's take, and ways to dig in: replay the best line or retry the move. */
export function MoveCard({ move, fenBefore, opening, mode, onFollowUp, onRetry, onExit }: Props) {
  if (!move) {
    return (
      <div className="flex min-h-16 items-center rounded-md bg-raised px-3 py-2 text-sm text-muted">
        Starting position. Use ← → to step through the game.
      </div>
    );
  }
  const side = move.color === "white" ? "White" : "Black";

  if (mode.kind === "retry") {
    const { feedback } = mode;
    return (
      <div className="space-y-2 rounded-md bg-raised px-3 py-2.5" aria-live="polite">
        <p className="font-semibold" style={{ color: feedback ? (feedback.ok ? BADGE.best.color : BADGE.mistake.color) : undefined }}>
          {!feedback ? `Find a better move for ${side}` : feedback.ok ? `Nice! ${feedback.san} works.` : `${feedback.san} isn’t it. Try again.`}
        </p>
        <p className="text-sm text-muted">{feedback?.ok ? "That’s what the engine wanted." : "Drag a piece on the board."}</p>
        <div className="flex flex-wrap gap-2">
          {!feedback?.ok && (
            <button onClick={onFollowUp} className={action}>
              Show answer
            </button>
          )}
          <button onClick={onExit} className={action}>
            Back to game
          </button>
        </div>
      </div>
    );
  }

  if (mode.kind === "line") {
    return (
      <div className="space-y-2 rounded-md bg-raised px-3 py-2.5" aria-live="polite">
        <p className="font-semibold">Best line</p>
        <p className="text-sm text-muted">
          {mode.sans.map((san, i) => (
            <span key={i} className={i < mode.index ? "font-semibold text-fg" : undefined}>
              {i ? " " : ""}
              {san}
            </span>
          ))}
        </p>
        <button onClick={onExit} className={action}>
          Back to game
        </button>
      </div>
    );
  }

  const best = move.bestUci && move.bestUci !== move.uci && move.badge !== "book" ? uciToSan(fenBefore, move.bestUci) : null;
  return (
    <div className="space-y-2 rounded-md bg-raised px-3 py-2.5">
      <div className="flex items-center gap-3">
        <BadgeIcon badge={move.badge} size={28} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold" style={{ color: BADGE[move.badge].color }}>
            {move.san} {BADGE[move.badge].phrase}
          </p>
          <p className="truncate text-sm text-muted">
            {best ? `Best was ${best}` : move.badge === "book" && opening ? opening : `${move.accuracy}% accuracy`}
          </p>
        </div>
        <span className="rounded bg-bg px-2 py-0.5 text-sm font-semibold tabular-nums">{formatEval(move)}</span>
      </div>
      {move.coach && <p className="text-sm leading-relaxed text-pretty">{move.coach}</p>}
      {move.badge !== "book" && (move.bestPv.length > 0 || RETRY_BADGES.has(move.badge)) && (
        <div className="flex flex-wrap gap-2">
          {move.bestPv.length > 0 && (
            <button onClick={onFollowUp} className={action}>
              Show follow-up
            </button>
          )}
          {RETRY_BADGES.has(move.badge) && move.alternatives.length > 0 && (
            <button onClick={onRetry} className={action}>
              Retry
            </button>
          )}
        </div>
      )}
    </div>
  );
}
