import { defaultPieces } from "react-chessboard";
import type { Side } from "@/lib/types";

type Props = { side: Side; name: string; rating?: string; material: number; captured: string[] };

export function PlayerBar({ side, name, rating, material, captured }: Props) {
  const lead = side === "white" ? material : -material;
  return (
    <div className="flex h-8 items-center gap-2.5 text-sm">
      <span
        aria-hidden="true"
        className={`size-5 shrink-0 rounded-[3px] ${side === "white" ? "bg-[#f1efea]" : "bg-[#403d39] ring-1 ring-line ring-inset"}`}
      />
      <span className="truncate font-semibold">{name}</span>
      {rating && <span className="text-muted tabular-nums">({rating})</span>}
      <span className="ml-auto flex min-w-0 items-center" aria-label={`Captured: ${captured.length} pieces`}>
        {captured.map((code, i) => (
          // Same-type pieces overlap like a stack; a new type gets a little air.
          <span key={i} className={`size-4 shrink-0 ${i && captured[i - 1] === code ? "-ml-2" : i ? "ml-0.5" : ""}`} aria-hidden="true">
            {defaultPieces[code]()}
          </span>
        ))}
        {lead > 0 && <span className="ml-1.5 text-muted tabular-nums">+{lead}</span>}
      </span>
    </div>
  );
}
