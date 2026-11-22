import { BADGE, badgeText, gist, personalize } from "@/lib/review";
import type { Report, ReviewMove, Side } from "@/lib/types";
import { BadgeIcon } from "./BadgeIcon";

type Props = {
  report: Report;
  names: Record<Side, string>;
  me: Side | null;
  myName: string | null;
  moments: ReviewMove[];
  onJump: (ply: number) => void;
  onSummary: () => void;
  onStep: () => void;
};

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

/** End-of-review recap shown after the final key moment. */
export function ReviewRecap({ report, names, me, myName, moments, onJump, onSummary, onStep }: Props) {
  return (
    <section
      aria-labelledby="end-title"
      aria-live="polite"
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg bg-raised border border-line/60"
    >
      <div className="shrink-0 p-3.5 pb-2.5 border-b border-line/40">
        <h2 id="end-title" className="text-base lg:text-lg font-bold tracking-tight text-fg">
          That’s what decided it
        </h2>
        <p className="mt-1 text-xs sm:text-sm text-pretty leading-relaxed text-muted">
          {takeaway(report, names, me)}
        </p>
      </div>
      <ol className="min-h-0 flex-1 overflow-y-auto p-2 space-y-1">
        {moments.map((m) => (
          <li key={m.ply}>
            <button
              onClick={() => onJump(m.ply)}
              className="group flex w-full items-start gap-2.5 rounded-md p-2 text-left text-xs sm:text-sm transition-colors hover:bg-line/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
            >
              <BadgeIcon badge={m.badge} size={20} className="mt-0.5 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="font-semibold tabular-nums text-fg">
                  {Math.ceil(m.ply / 2)}.{m.color === "black" ? ".." : ""} {m.san}
                </span>{" "}
                <span style={{ color: badgeText(m.badge) }} className="font-medium">
                  {BADGE[m.badge].phrase}
                </span>
                {m.coach && (
                  <span className="mt-0.5 block text-pretty text-muted text-xs leading-normal">
                    {gist(personalize(m.coach, myName))}
                  </span>
                )}
              </span>
              <span className="shrink-0 self-center text-muted/40 group-hover:text-muted transition-colors text-xs font-mono" aria-hidden="true">
                ›
              </span>
            </button>
          </li>
        ))}
      </ol>
      <div className="shrink-0 flex flex-wrap gap-2 p-3 border-t border-line/40 bg-surface/40">
        <button
          onClick={onSummary}
          className="rounded-md bg-accent px-3 py-2 text-xs sm:text-sm font-bold text-[#141311] shadow-sm transition hover:brightness-110 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Back to summary
        </button>
        <button
          onClick={onStep}
          className="rounded-md bg-raised px-3 py-2 text-xs sm:text-sm font-semibold text-fg border border-line/60 transition hover:bg-line active:scale-[0.99] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
        >
          Keep stepping through the game
        </button>
      </div>
    </section>
  );
}
