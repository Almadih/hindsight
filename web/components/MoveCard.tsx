import { BADGE, formatEval, uciToSan } from "@/lib/review";
import type { ReviewMove } from "@/lib/types";
import { BadgeIcon } from "./BadgeIcon";

/** What happened on the current ply, in one line, plus the engine's preferred move when it differs. */
export function MoveCard({ move, fenBefore, opening }: { move: ReviewMove | null; fenBefore: string; opening: string | null }) {
  if (!move) {
    return (
      <div className="flex min-h-16 items-center rounded-md bg-raised px-3 py-2 text-sm text-muted">
        Starting position. Use ← → to step through the game.
      </div>
    );
  }
  const best = move.bestUci && move.bestUci !== move.uci && move.badge !== "book" ? uciToSan(fenBefore, move.bestUci) : null;

  return (
    <div className="flex min-h-16 items-center gap-3 rounded-md bg-raised px-3 py-2">
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
  );
}
