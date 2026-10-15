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
  /** Engine's top lines from the position before the move; w = mover's win%. */
  alternatives: { uci: string; san: string; w: number }[];
  tactics: string[];
  coach?: string | null;
};

export type Report = {
  hash: string;
  headers: Record<string, string>;
  opening: string | null;
  start: WhiteEval;
  moves: ReviewMove[];
  accuracy: Record<Side, number | null> & { phases: Record<Side, Record<Phase, number | null>> };
  counts: Record<Side, Partial<Record<Badge, number>>>;
  elo: Record<Side, number | null>;
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
  /** Review hash for this game (null if the PGN can't be parsed). */
  hash?: string | null;
  /** Set on the player page when someone already reviewed this game. */
  reviewed?: { accuracy: number | null } | null;
};

export type PlayerGame = {
  hash: string;
  date: string;
  side: Side;
  opponent: string;
  result: "won" | "lost" | "draw" | "unknown";
  accuracy: number | null;
  estElo: number | null;
  counts: Partial<Record<Badge, number>>;
};

export type PlayerProfile = {
  username: string;
  platform: "chesscom" | "lichess";
  games: GameSummary[];
  history: PlayerGame[];
  themes: { label: string; count: number; example: { hash: string; ply: number } }[];
};
