import { BADGE } from "@/lib/review";
import type { Badge } from "@/lib/types";
import { BadgeIcon } from "../BadgeIcon";

// Plain-language versions of the rules in api/src/review/classify.py; keep them in step.
// Ordered best to worst along one scale: how much of your winning chances the move gives away.
const SCALE: { badge: Badge; lost: string; rule: string }[] = [
  { badge: "brilliant", lost: "0%", rule: "The best move, and it gives up material to get there." },
  { badge: "great", lost: "0%", rule: "The only move that keeps your chances. Everything else loses ground." },
  { badge: "best", lost: "under 1%", rule: "Exactly what the engine would play." },
  { badge: "excellent", lost: "1–3%", rule: "Almost as good as the best move." },
  { badge: "good", lost: "3–5%", rule: "A solid move that costs you a little." },
  { badge: "inaccuracy", lost: "5–10%", rule: "A small slip." },
  { badge: "mistake", lost: "10–20%", rule: "A real error your opponent can use." },
  { badge: "miss", lost: "10%+", rule: "Your opponent slipped and you didn’t punish it." },
  { badge: "blunder", lost: "20%+", rule: "Throws the game away, or walks into mate." },
];

/** Every verdict as one ladder, from keeping all your chances to throwing them away; Book sits off the scale. */
export function VerdictLadder() {
  return (
    <div>
      <div className="mb-3 grid grid-cols-[2.5rem_1fr_auto] gap-4 text-sm text-muted">
        <span />
        <span>Verdict</span>
        <span className="text-right">Winning chances lost</span>
      </div>
      <ol className="relative">
        {/* The scale itself: green where you keep your chances, red where you throw them away. */}
        <span aria-hidden="true" className="absolute top-5 bottom-5 left-[1.2rem] w-0.5 bg-linear-to-b from-[#26c2a3] via-[#f7c631] to-[#fa412d]" />
        {SCALE.map(({ badge, lost, rule }) => (
          <li key={badge} className="relative grid grid-cols-[2.5rem_1fr_auto] items-center gap-4 py-3">
            <BadgeIcon badge={badge} size={40} className="relative" />
            <div className="min-w-0">
              <p className="text-lg font-bold" style={{ color: BADGE[badge].color }}>
                {BADGE[badge].label}
              </p>
              <p className="text-pretty text-muted">{rule}</p>
            </div>
            <span className="text-right text-lg font-bold tabular-nums">{lost}</span>
          </li>
        ))}
      </ol>
      <p className="mt-4 flex items-center gap-4 border-t border-line pt-4">
        <BadgeIcon badge="book" size={40} className="shrink-0" />
        <span className="text-pretty text-muted">
          <span className="font-bold" style={{ color: BADGE.book.color }}>
            Book
          </span>{" "}
          sits off the scale: known opening theory, not judged.
        </span>
      </p>
    </div>
  );
}
