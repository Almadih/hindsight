import { Chess } from "chess.js";
import type { Badge, ReviewMove, WhiteEval } from "./types";

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

const START_COUNT: Record<string, number> = { q: 1, r: 2, b: 2, n: 2, p: 8 };

/** Pieces each side has captured, as react-chessboard piece codes ("bQ", "wP"…), most valuable first. */
export function capturedPieces(fen: string): { white: string[]; black: string[] } {
  const count: Record<string, number> = {};
  for (const ch of fen.split(" ")[0]) count[ch] = (count[ch] ?? 0) + 1;
  const missing = (color: "w" | "b") =>
    Object.entries(START_COUNT).flatMap(([t, n]) => {
      // Promotions can push a count above the start; never show a negative capture.
      const left = count[color === "w" ? t.toUpperCase() : t] ?? 0;
      return Array<string>(Math.max(0, n - left)).fill(`${color}${t.toUpperCase()}`);
    });
  return { white: missing("b"), black: missing("w") };
}

/** Retry verdict: the engine's best move, or another top line within 2% win of it. */
export function isGoodRetry(move: ReviewMove, uci: string): boolean {
  const best = move.alternatives[0];
  const alt = move.alternatives.find((a) => a.uci === uci);
  return Boolean(best && alt && best.w - alt.w < 2);
}

const LINE_MAX = 6; // plies: never look further than three moves each
const LINE_QUIET = 4; // plies shown when nothing decisive happens

/**
 * The short, high-impact part of an engine line, the way a coach would show it: up to checkmate, a promotion,
 * or a settled material win (≥2 points, exchange finished); otherwise just the first 4 plies.
 */
export function followUpLine(fen: string, pv: string[]): { fens: string[]; sans: string[] } {
  const chess = new Chess(fen);
  const sign = chess.turn() === "w" ? 1 : -1;
  const start = materialDiff(fen) * sign;
  const fens = [fen];
  const sans: string[] = [];
  for (const uci of pv.slice(0, LINE_MAX)) {
    let move;
    try {
      move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    } catch {
      break;
    }
    fens.push(chess.fen());
    sans.push(move.san);
    const next = pv[sans.length];
    const exchangeOver = !next || !chess.get(next.slice(2, 4) as Parameters<typeof chess.get>[0]);
    if (chess.isCheckmate() || move.promotion || (materialDiff(chess.fen()) * sign - start >= 2 && exchangeOver)) {
      return { fens, sans };
    }
  }
  return { fens: fens.slice(0, LINE_QUIET + 1), sans: sans.slice(0, LINE_QUIET) };
}
