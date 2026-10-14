import type { CSSProperties } from "react";
import { PIECES } from "@/lib/pieces";
import { BADGE } from "@/lib/review";
import type { Badge } from "@/lib/types";

export type FxIntensity = "epic" | "subtle";

type Props = {
  move: { ply: number; uci: string; san: string; badge: Badge };
  /** Position before the move, to know what got captured. */
  prevFen: string;
  /** Position after the move, to find the king in check or mate. */
  fen: string;
  flipped: boolean;
  intensity: FxIntensity;
};

const SPARKS = 12;
const GOOD = new Set<Badge>(["brilliant", "great"]);

/** Board percentage box for a square, honouring orientation. */
function squareBox(square: string, flipped: boolean): CSSProperties {
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]);
  const col = flipped ? 7 - file : file;
  const row = flipped ? rank - 1 : 8 - rank;
  return { left: `${col * 12.5}%`, top: `${row * 12.5}%`, width: "12.5%", height: "12.5%" };
}

/** Piece code ("wQ") on a square of a FEN, or null. */
function pieceAt(fen: string, square: string): string | null {
  const rows = fen.split(" ")[0].split("/");
  const row = rows[8 - Number(square[1])];
  let file = 0;
  for (const ch of row) {
    if (/\d/.test(ch)) file += Number(ch);
    else {
      if (file === square.charCodeAt(0) - 97) return `${ch === ch.toUpperCase() ? "w" : "b"}${ch.toUpperCase()}`;
      file += 1;
    }
  }
  return null;
}

function kingSquare(fen: string, color: "w" | "b"): string | null {
  const rows = fen.split(" ")[0].split("/");
  for (let r = 0; r < 8; r++) {
    let file = 0;
    for (const ch of rows[r]) {
      if (/\d/.test(ch)) file += Number(ch);
      else {
        if (ch === (color === "w" ? "K" : "k")) return `${String.fromCharCode(97 + file)}${8 - r}`;
        file += 1;
      }
    }
  }
  return null;
}

/**
 * One move's worth of effects over the board, remounted per ply so every CSS animation replays:
 * impact ring on the landing square, the captured piece shattering, check and mate on the king,
 * and on the epic setting a light sweep and sparks for brilliant/great moves.
 */
export function MoveFX({ move, prevFen, fen, flipped, intensity }: Props) {
  const from = move.uci.slice(0, 2);
  const to = move.uci.slice(2, 4);
  const color = BADGE[move.badge].color;
  const captured = pieceAt(prevFen, to);
  const mate = move.san.endsWith("#");
  const check = move.san.endsWith("+") || mate;
  const victimKing = check ? kingSquare(fen, fen.split(" ")[1] as "w" | "b") : null;
  const epic = intensity === "epic";
  const key = epic && move.badge !== "book";

  return (
    // Clipped to the board: the sweep and sparks must never spill over the page (or scroll it sideways on phones).
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden" aria-hidden="true" style={{ "--fx": color } as CSSProperties}>
      {epic && <div className="fx-trail absolute" style={squareBox(from, flipped)} />}
      <div className="absolute" style={squareBox(to, flipped)}>
        <div className="fx-flash absolute inset-0" />
        <div className={`absolute inset-0 rounded-full ${epic ? "fx-impact" : "fx-impact-soft"}`} />
        {epic && key && <div className="fx-impact fx-impact-late absolute inset-0 rounded-full" />}
        {captured && <div className="fx-shatter absolute inset-0">{PIECES[captured]()}</div>}
        {epic && GOOD.has(move.badge) &&
          Array.from({ length: SPARKS }, (_, i) => (
            <span key={i} className="fx-spark absolute top-1/2 left-1/2" style={{ "--a": `${(360 / SPARKS) * i + 8}deg`, "--d": `${120 + (i % 3) * 45}%` } as CSSProperties} />
          ))}
      </div>
      {victimKing && (
        <div className="absolute" style={squareBox(victimKing, flipped)}>
          <div className={mate ? "fx-mate-king absolute inset-0" : "fx-check absolute inset-0"} />
        </div>
      )}
      {epic && GOOD.has(move.badge) && <div className="fx-sweep absolute inset-0" />}
      {epic && mate && (
        <>
          <div className="fx-dim absolute inset-0" />
          <div className="absolute inset-0 grid place-items-center">
            <span className="fx-stamp rounded-lg bg-[#fa412d] px-[4%] py-[1.5%] text-[clamp(1.5rem,6vw,4.5rem)] font-black tracking-[-0.03em] text-white shadow-[0_12px_40px_rgba(0,0,0,0.5)]">
              Checkmate
            </span>
          </div>
        </>
      )}
    </div>
  );
}
