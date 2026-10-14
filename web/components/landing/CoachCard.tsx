import type { CSSProperties } from "react";
import { BADGE, formatEval, whiteWinPct } from "@/lib/review";
import type { Badge, ReviewMove, WhiteEval } from "@/lib/types";
import { BadgeIcon } from "../BadgeIcon";

type Move = Pick<ReviewMove, "ply" | "color" | "san" | "badge" | "coach"> & WhiteEval;

type Props = { move: Move | null; totalPlies: number; opening: string };

const QUIET = new Set<Badge>(["best", "excellent", "good", "book"]);

/** The replay's narrator: the current verdict, plus the coach's note from the real review on key moments. */
export function CoachCard({ move, totalPlies, opening }: Props) {
  if (!move) {
    return (
      <div className="rounded-xl bg-raised p-5" aria-live="polite">
        <p className="text-xl font-bold">The review starts at move one.</p>
        <p className="mt-2 text-muted">Watch each move get its verdict.</p>
      </div>
    );
  }
  const moveNo = Math.ceil(move.ply / 2);
  const label = `${moveNo}.${move.color === "black" ? ".." : ""}`;
  const detail =
    move.coach ??
    (move.badge === "book"
      ? opening
      : `Move ${moveNo} of ${Math.ceil(totalPlies / 2)}. White's winning chances: ${Math.round(whiteWinPct(move))}%.`);
  return (
    // Keyed per move so the line rises in each time, and key verdicts flash the card in their colour.
    <div
      key={move.ply}
      className={`rounded-xl bg-raised p-5 ${QUIET.has(move.badge) ? "" : "fx-card-flash"}`}
      style={{ "--fx": BADGE[move.badge].color } as CSSProperties}
      aria-live="polite"
    >
      <div className="fx-rise flex items-center gap-3">
        <BadgeIcon badge={move.badge} size={34} className="badge-pop shrink-0" />
        <p className="min-w-0 flex-1 text-xl font-bold" style={{ color: BADGE[move.badge].color }}>
          <span className="text-fg tabular-nums">{label}</span> {move.san} {BADGE[move.badge].phrase}
        </p>
        <span className="rounded-md bg-bg px-2 py-1 text-sm font-bold tabular-nums">{formatEval(move)}</span>
      </div>
      <p className={`fx-rise mt-3 leading-relaxed text-pretty [animation-delay:70ms] ${move.coach ? "text-base text-fg/90" : "text-muted"}`}>{detail}</p>
    </div>
  );
}
