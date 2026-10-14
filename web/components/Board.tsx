"use client";

import { Chessboard } from "react-chessboard";
import { BADGE } from "@/lib/review";
import type { ReviewMove } from "@/lib/types";
import { BadgeIcon } from "./BadgeIcon";

const LIGHT = { backgroundColor: "#ebecd0" };
const DARK = { backgroundColor: "#739552" };
const BEST_ARROW = "rgba(129, 182, 76, 0.9)";

/** Board at one ply: the played move tinted by its badge, badge on the target square, best move as an arrow. */
export function Board({ fen, flipped, move }: { fen: string; flipped: boolean; move: ReviewMove | null }) {
  const from = move?.uci.slice(0, 2);
  const to = move?.uci.slice(2, 4);
  const tint = move && { backgroundColor: `color-mix(in srgb, ${BADGE[move.badge].color} 50%, transparent)` };
  const showBest = move?.bestUci && move.bestUci !== move.uci && move.badge !== "book";

  return (
    <Chessboard
      options={{
        id: "review-board",
        position: fen,
        boardOrientation: flipped ? "black" : "white",
        allowDragging: false,
        animationDurationInMs: 180,
        lightSquareStyle: LIGHT,
        darkSquareStyle: DARK,
        arrows: showBest ? [{ startSquare: move.bestUci!.slice(0, 2), endSquare: move.bestUci!.slice(2, 4), color: BEST_ARROW }] : [],
        // A custom squareRenderer replaces the wrapper that would apply `squareStyles`, so tint here instead.
        squareRenderer: ({ square, children }) => (
          <div className="relative size-full" style={tint && (square === from || square === to) ? tint : undefined}>
            {children}
            {move && square === to && (
              <BadgeIcon badge={move.badge} size={40} className="pointer-events-none absolute -top-[14%] -right-[14%] z-10 h-auto w-[44%] drop-shadow-[0_2px_3px_rgba(0,0,0,0.45)]" />
            )}
          </div>
        ),
      }}
    />
  );
}
