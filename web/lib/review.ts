import { Chess } from "chess.js";
import type { Badge, ReviewMove, Side, WhiteEval } from "./types";

/** Display order, best to worst. */
export const BADGE_ORDER: Badge[] = [
  "brilliant", "great", "best", "excellent", "good", "book", "inaccuracy", "mistake", "miss", "blunder",
];

// `rule`: plain-language versions of api/src/review/classify.py; keep them in step.
export const BADGE: Record<Badge, { label: string; phrase: string; color: string; rule: string }> = {
  brilliant: { label: "Brilliant", phrase: "is brilliant", color: "#26c2a3", rule: "The best move, and it gives up material to get there." },
  great: { label: "Great", phrase: "is a great move", color: "#749bbf", rule: "The only move that keeps your chances. Everything else loses ground." },
  best: { label: "Best", phrase: "is best", color: "#81b64c", rule: "Exactly what the engine would play." },
  excellent: { label: "Excellent", phrase: "is excellent", color: "#96bc4b", rule: "Almost as good as the best move." },
  good: { label: "Good", phrase: "is good", color: "#97af8b", rule: "A solid move that costs you a little." },
  book: { label: "Book", phrase: "is a book move", color: "#b39572", rule: "Known opening theory." },
  inaccuracy: { label: "Inaccuracy", phrase: "is an inaccuracy", color: "#f7c631", rule: "A small slip." },
  mistake: { label: "Mistake", phrase: "is a mistake", color: "#ffa459", rule: "A real error your opponent can use." },
  miss: { label: "Miss", phrase: "is a miss", color: "#ff7769", rule: "Your opponent slipped and you didn’t punish it." },
  blunder: { label: "Blunder", phrase: "is a blunder", color: "#fa412d", rule: "Throws the game away, or walks into mate." },
};

/** Verdict colour lifted toward white so small text clears 4.5:1 on the dark surfaces; discs keep the true colour. */
export const badgeText = (badge: Badge) => `color-mix(in srgb, ${BADGE[badge].color} 72%, white)`;

const KEY_SCORE: Partial<Record<Badge, number>> = { brilliant: 40, great: 18 };
const BAD = new Set<Badge>(["blunder", "miss", "mistake", "inaccuracy"]);

/**
 * The moments that decided the game: brilliant and great moves plus the costliest errors, at most `limit`,
 * in game order. Errors score by the winning chances they gave away.
 */
export function keyMoments<M extends Pick<ReviewMove, "ply" | "badge" | "wBefore" | "wAfter">>(moves: M[], limit = 4): M[] {
  return moves
    .map((m) => ({ m, score: KEY_SCORE[m.badge] ?? (BAD.has(m.badge) ? m.wBefore - m.wAfter : 0) }))
    .filter((x) => x.score >= 5)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.m)
    .sort((a, b) => a.ply - b.ply);
}

/**
 * Your key moments when we know your side, plus the opponent's single biggest swing if it outranks one of
 * yours (a game they threw is still what decided it). Both sides' when your side is unknown or you had none.
 */
export function decidingMoments<M extends Pick<ReviewMove, "ply" | "badge" | "wBefore" | "wAfter" | "color">>(moves: M[], me: Side | null) {
  const own = me ? moves.filter((m) => m.color === me) : [];
  const theirs = keyMoments(moves.filter((m) => m.color !== me), 1);
  const picked = me ? keyMoments([...own, ...theirs]) : [];
  const mine = picked.some((m) => m.color === me);
  return { moments: mine ? picked : keyMoments(moves), mine };
}

/** The coach's first sentence, as a one-line gist. */
export function gist(text: string | null | undefined): string | null {
  if (!text) return null;
  const first = text.split(/(?<=[.!?])\s/)[0];
  return first.length > 110 ? `${first.slice(0, 107)}…` : first;
}

/** Coach notes name both players; when one of them is you, "Hikaru's Bxb3+" reads "Your Bxb3+". */
export function personalize(text: string, you: string | null): string {
  if (!you) return text;
  const name = you.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(`${name}['’]s\\b`, "g"), "your").replace(/(^|[.!?]\s+)your/g, "$1Your");
}

/** Errors with an engine alternative can be retried on the board. */
export const canRetry = (m: Pick<ReviewMove, "badge" | "alternatives">) => BAD.has(m.badge) && m.alternatives.length > 0;

/** The evaluation in words, for people who don't read engine numbers. */
export function describeEval({ evalWhite, mateWhite }: WhiteEval): string {
  if (mateWhite === 0) return evalWhite > 0 ? "White has checkmated" : "Black has checkmated";
  if (mateWhite !== null) return `${mateWhite > 0 ? "White" : "Black"} mates in ${Math.abs(mateWhite)}`;
  const pawns = Math.abs(evalWhite);
  if (pawns < 0.3) return "Equal position";
  const side = evalWhite > 0 ? "White" : "Black";
  return pawns < 1 ? `${side} is slightly better` : pawns < 3 ? `${side} is better` : `${side} is winning`;
}

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
  // Never show "-0.0": a near-zero eval is just equal.
  if (Math.abs(evalWhite) < 0.05) return "0.0";
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

/** Shown in place of the badge's wording when the mover had exactly one legal move. */
export const FORCED = { phrase: "is the only legal move", rule: "Forced: there was no other move to play." };

export function isForced(fenBefore: string): boolean {
  try {
    return new Chess(fenBefore).moves().length === 1;
  } catch {
    return false;
  }
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
const LINE_REACH = 8; // plies a line may run on to finish a trade (7.Bd2: ...Bxc3 Qe2 Be6 bxc3)

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
  for (const uci of pv.slice(0, LINE_REACH)) {
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
    const decisive = chess.isCheckmate() || move.promotion || (materialDiff(chess.fen()) * sign - start >= 2 && exchangeOver);
    if (decisive && sans.length <= LINE_MAX) {
      return { fens, sans };
    }
  }
  // Never stop mid-trade or behind: run on while a capture is pending or the side to move is down on where it
  // started (Bxc3 without the later bxc3 looks like the best line loses a knight).
  const behind = (i: number) => materialDiff(fens[i]) * sign < start;
  const capturePending = (i: number) => Boolean(new Chess(fens[i]).get(pv[i].slice(2, 4) as Parameters<typeof chess.get>[0]));
  let n = Math.min(LINE_QUIET, sans.length);
  while (n < sans.length && (behind(n) || capturePending(n))) n++;
  // Still behind when the PV runs out: end before the material went rather than show a losing-looking line.
  while (n > 1 && behind(n)) n--;
  return { fens: fens.slice(0, n + 1), sans: sans.slice(0, n) };
}
