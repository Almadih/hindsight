import { Chess } from "chess.js";
import type { Badge, WhiteEval } from "./types";

/** Display order, best to worst. */
export const BADGE_ORDER: Badge[] = [
  "brilliant", "great", "best", "excellent", "good", "book", "inaccuracy", "mistake", "miss", "blunder",
];

export const BADGE: Record<Badge, { label: string; phrase: string; color: string }> = {
  brilliant: { label: "Brilliant", phrase: "is brilliant", color: "#26c2a3" },
  great: { label: "Great", phrase: "is a great move", color: "#749bbf" },
  best: { label: "Best", phrase: "is best", color: "#81b64c" },
  excellent: { label: "Excellent", phrase: "is excellent", color: "#96bc4b" },
  good: { label: "Good", phrase: "is good", color: "#97af8b" },
  book: { label: "Book", phrase: "is a book move", color: "#b39572" },
  inaccuracy: { label: "Inaccuracy", phrase: "is an inaccuracy", color: "#f7c631" },
  mistake: { label: "Mistake", phrase: "is a mistake", color: "#ffa459" },
  miss: { label: "Miss", phrase: "is a miss", color: "#ff7769" },
  blunder: { label: "Blunder", phrase: "is a blunder", color: "#fa412d" },
};

/** Badges worth flagging in the move list and on the graph; the rest are the quiet majority. */
export const NOTABLE = new Set<Badge>(["brilliant", "great", "book", "inaccuracy", "mistake", "miss", "blunder"]);

/** White's win% for the eval bar and graph, using the same curve as the API. */
export function whiteWinPct({ evalWhite, mateWhite }: WhiteEval): number {
  if (mateWhite !== null) return mateWhite > 0 || (mateWhite === 0 && evalWhite > 0) ? 100 : 0;
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * evalWhite * 100)) - 1);
}

export function formatEval({ evalWhite, mateWhite }: WhiteEval): string {
  if (mateWhite === 0) return evalWhite > 0 ? "1-0" : "0-1";
  if (mateWhite !== null) return `M${Math.abs(mateWhite)}`;
  return `${evalWhite > 0 ? "+" : ""}${evalWhite.toFixed(1)}`;
}

const PIECE_VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };

/** White material minus Black material, from the FEN's piece placement. */
export function materialDiff(fen: string): number {
  let diff = 0;
  for (const ch of fen.split(" ")[0]) {
    const v = PIECE_VALUE[ch.toLowerCase()];
    if (v) diff += ch === ch.toUpperCase() ? v : -v;
  }
  return diff;
}

export function uciToSan(fen: string, uci: string): string | null {
  try {
    return new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san;
  } catch {
    return null;
  }
}
