import { Chess } from "chess.js";

/**
 * Parse a PGN into the FEN of every position (start, then one per ply) plus chess.js's re-exported PGN.
 * Send the re-export to the API: python-chess is stricter about layout (e.g. tags on one line),
 * and this guarantees both sides replay the exact game the engine analyzed. Throws on invalid PGN.
 */
export function parsePgn(input: string): { pgn: string; fens: string[]; sans: string[]; headers: Record<string, string> } {
  const chess = new Chess();
  chess.loadPgn(input);
  const moves = chess.history({ verbose: true });
  if (!moves.length) throw new Error("PGN has no moves");
  const headers = Object.fromEntries(Object.entries(chess.getHeaders()).filter(([, v]) => v != null)) as Record<string, string>;
  return { pgn: chess.pgn(), fens: [moves[0].before, ...moves.map((m) => m.after)], sans: moves.map((m) => m.san), headers };
}

export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

/** Rebuild a game's PGN from a stored review, for reviews opened by link (no PGN in this tab). */
export function reportPgn(headers: Record<string, string>, sans: string[]): string {
  const chess = new Chess(headers.FEN ?? START_FEN);
  for (const san of sans) chess.move(san);
  for (const [k, v] of Object.entries(headers)) chess.setHeader(k, v);
  return chess.pgn();
}
