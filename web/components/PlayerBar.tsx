import type { Side } from "@/lib/types";

export function PlayerBar({ side, name, rating, material }: { side: Side; name: string; rating?: string; material: number }) {
  const lead = side === "white" ? material : -material;
  return (
    <div className="flex h-8 items-center gap-2.5 text-sm">
      <span
        aria-hidden="true"
        className={`size-5 rounded-[3px] ${side === "white" ? "bg-[#f1efea]" : "bg-[#403d39] ring-1 ring-line ring-inset"}`}
      />
      <span className="truncate font-semibold">{name}</span>
      {rating && <span className="text-muted tabular-nums">({rating})</span>}
      {lead > 0 && <span className="ml-auto text-muted tabular-nums">+{lead}</span>}
    </div>
  );
}
