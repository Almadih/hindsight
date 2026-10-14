import { formatEval, whiteWinPct } from "@/lib/review";
import type { WhiteEval } from "@/lib/types";

/** Vertical win-probability bar; White's share grows from White's side of the board. */
export function EvalBar({ ev, flipped }: { ev: WhiteEval; flipped: boolean }) {
  const white = whiteWinPct(ev);
  const whiteAhead = white >= 50;
  // Label sits at the leading side's end of the bar.
  const labelAtBottom = whiteAhead !== flipped;

  return (
    <div
      role="meter"
      aria-label="Evaluation"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(white)}
      aria-valuetext={formatEval(ev)}
      className={`relative flex w-7 shrink-0 overflow-hidden rounded-[3px] bg-[#403d39] ${flipped ? "flex-col" : "flex-col-reverse"}`}
    >
      <div className="bg-[#f1efea] transition-[height] duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)] motion-reduce:transition-none" style={{ height: `${white}%` }} />
      <span
        className={`absolute inset-x-0 text-center text-[10px] font-semibold tabular-nums ${labelAtBottom ? "bottom-1" : "top-1"} ${
          whiteAhead ? "text-[#2b2926]" : "text-[#f1efea]"
        }`}
      >
        {formatEval(ev)}
      </span>
    </div>
  );
}
