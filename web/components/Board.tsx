"use client";

import { useEffect, useRef } from "react";
import { Chessboard, defaultArrowOptions } from "react-chessboard";
import { PIECES } from "@/lib/pieces";
import { BADGE } from "@/lib/review";
import type { Badge, ReviewMove } from "@/lib/types";
import { BadgeIcon } from "./BadgeIcon";
import { MoveFX, type FxIntensity } from "./MoveFX";

const LIGHT = { backgroundColor: "#ebecd0" };
const DARK = { backgroundColor: "#739552" };
const BEST_ARROW = "#81b64c";
const ARROWS = { ...defaultArrowOptions, arrowWidthDenominator: 3.6, opacity: 0.92 };
const SHAKE: Partial<Record<Badge, number>> = { blunder: 1, miss: 0.7, mistake: 0.55 };
const QUIET = new Set<Badge>(["best", "excellent", "good", "book"]);

type Props = {
  fen: string;
  flipped: boolean;
  /** The move that led to `fen`, decorated with its badge; null for the start position and for variations. */
  move: Pick<ReviewMove, "ply" | "san" | "uci" | "badge" | "bestUci"> | null;
  /** Retry mode: return true to accept the dropped move. */
  onMove?: (from: string, to: string) => boolean;
  /** Move effects; `prevFen` is the position before `move`. */
  fx?: { intensity: FxIntensity; prevFen: string };
  /** Unique per page when several boards are shown. */
  id?: string;
};

/** Board at one ply: the played move tinted by its badge, badge on the target square, best move as an arrow. */
export function Board({ fen, flipped, move, onMove, fx, id = "review-board" }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const from = move?.uci.slice(0, 2);
  const to = move?.uci.slice(2, 4);
  const tint = move && { backgroundColor: `color-mix(in srgb, ${BADGE[move.badge].color} 50%, transparent)` };
  const showBest = move?.bestUci && move.bestUci !== move.uci && move.badge !== "book";
  const epic = fx?.intensity === "epic";
  // On the landing replay, key verdicts land oversized and break out of their square.
  const big = epic && move && !QUIET.has(move.badge);
  // The badge overhangs its square's top-right corner, which the board clips on its own top row and right
  // column; there it tucks inside the corner instead. Edges are visual, so flipping is accounted for.
  const onTop = to ? to[1] === (flipped ? "1" : "8") : false;
  const onRight = to ? to[0] === (flipped ? "a" : "h") : false;
  const badgeBox = [
    onTop ? "top-[2%]" : big ? "-top-[34%]" : "-top-[14%]",
    onRight ? "right-[2%]" : big ? "-right-[34%]" : "-right-[14%]",
    big && !(onTop || onRight) ? "w-[68%]" : big ? "w-[54%]" : "w-[44%]",
  ].join(" ");

  // Bad verdicts shake the board. WAAPI, so the board itself never remounts mid-animation.
  const shake = epic && move && SHAKE[move.badge] ? `${move.ply}:${SHAKE[move.badge]}` : null;
  useEffect(() => {
    if (!shake || !wrap.current || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const s = Number(shake.split(":")[1]);
    wrap.current.animate(
      [0, -12, 10, -8, 6, -3, 0].map((x, i) => ({ transform: `translateX(${x * s}px) rotate(${i % 6 ? (i % 2 ? 0.6 : -0.6) * s : 0}deg)` })),
      { duration: 460, easing: "cubic-bezier(0.3, 0.7, 0.4, 1)" },
    );
  }, [shake]);

  return (
    <div ref={wrap} className="relative">
      <Chessboard
        options={{
          id,
          pieces: PIECES,
          position: fen,
          boardOrientation: flipped ? "black" : "white",
          allowDragging: Boolean(onMove),
          onPieceDrop: ({ sourceSquare, targetSquare }) => Boolean(onMove && targetSquare && onMove(sourceSquare, targetSquare)),
          animationDurationInMs: epic ? 260 : 180,
          lightSquareStyle: LIGHT,
          darkSquareStyle: DARK,
          arrowOptions: ARROWS,
          arrows: showBest ? [{ startSquare: move.bestUci!.slice(0, 2), endSquare: move.bestUci!.slice(2, 4), color: BEST_ARROW }] : [],
          // A custom squareRenderer replaces the wrapper that would apply `squareStyles`, so tint here instead.
          squareRenderer: ({ square, children }) => (
            <div className="relative size-full" style={tint && (square === from || square === to) ? tint : undefined}>
              {children}
              {move && square === to && (
                <BadgeIcon
                  key={move.ply}
                  badge={move.badge}
                  size={40}
                  className={`${epic ? "badge-slam" : "badge-pop"} pointer-events-none absolute z-30 h-auto min-w-5 ${badgeBox}`}
                />
              )}
            </div>
          ),
        }}
      />
      {fx && move && <MoveFX key={move.ply} move={move} prevFen={fx.prevFen} fen={fen} flipped={flipped} intensity={fx.intensity} />}
    </div>
  );
}
