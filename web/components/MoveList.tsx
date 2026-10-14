"use client";

import { useEffect, useRef } from "react";
import { formatEval, NOTABLE } from "@/lib/review";
import type { ReviewMove } from "@/lib/types";
import { BadgeIcon } from "./BadgeIcon";

export function MoveList({ moves, ply, onSelect }: { moves: ReviewMove[]; ply: number; onSelect: (ply: number) => void }) {
  const list = useRef<HTMLOListElement>(null);
  const active = useRef<HTMLButtonElement>(null);
  // Keep the current move visible by scrolling the list only; scrollIntoView would also scroll the page,
  // dragging the board off screen in the stacked mobile layout.
  useEffect(() => {
    if (!list.current || !active.current) return;
    const box = list.current.getBoundingClientRect();
    const item = active.current.getBoundingClientRect();
    if (item.top < box.top) list.current.scrollTop -= box.top - item.top;
    else if (item.bottom > box.bottom) list.current.scrollTop += item.bottom - box.bottom;
  }, [ply]);

  const rows: ReviewMove[][] = [];
  for (let i = 0; i < moves.length; i += 2) rows.push(moves.slice(i, i + 2));

  const cell = (m: ReviewMove | undefined) =>
    m ? (
      <button
        ref={m.ply === ply ? active : undefined}
        aria-current={m.ply === ply ? "step" : undefined}
        onClick={() => onSelect(m.ply)}
        className="flex min-w-0 items-center gap-1.5 rounded px-2 py-1 text-left hover:bg-raised aria-[current=step]:bg-[#4b4844]"
      >
        <span className="w-5 shrink-0">{NOTABLE.has(m.badge) && <BadgeIcon badge={m.badge} size={20} />}</span>
        <span className="truncate font-semibold">{m.san}</span>
        <span className="ml-auto text-xs text-muted tabular-nums">{formatEval(m)}</span>
      </button>
    ) : (
      <span />
    );

  return (
    <ol ref={list} className="min-h-0 flex-1 overflow-y-auto text-sm">
      {rows.map(([w, b], i) => (
        <li key={i} className="grid grid-cols-[2rem_1fr_1fr] items-center gap-1 odd:bg-white/[0.025]">
          <span className="pl-2 text-muted tabular-nums">{i + 1}.</span>
          {cell(w)}
          {cell(b)}
        </li>
      ))}
    </ol>
  );
}
