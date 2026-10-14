// Mirrors api/src/review/analyze.py and fetchers.py.

export type Badge =
  | "book" | "brilliant" | "great" | "best" | "excellent" | "good" | "inaccuracy" | "mistake" | "miss" | "blunder";
export type Phase = "opening" | "middlegame" | "endgame";
export type Side = "white" | "black";

export type WhiteEval = { evalWhite: number; mateWhite: number | null };

export type ReviewMove = WhiteEval & {
  ply: number;
  color: Side;
  san: string;
  uci: string;
  fen: string;
  badge: Badge;
  phase: Phase;
  wBefore: number;
  wAfter: number;
  accuracy: number;
  bestUci: string | null;
  bestPv: string[];
};

export type Report = {
  headers: Record<string, string>;
  opening: string | null;
  start: WhiteEval;
  moves: ReviewMove[];
  accuracy: Record<Side, number | null> & { phases: Record<Side, Record<Phase, number | null>> };
  counts: Record<Side, Partial<Record<Badge, number>>>;
};

export type Player = { name: string; rating: number | null };
export type GameSummary = {
  id: string;
  url: string;
  pgn: string;
  white: Player;
  black: Player;
  result: string;
  timeClass: string | null;
  endTime: number;
};
