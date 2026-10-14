import type { PositionEval } from "./engine/pool";
import type { GameSummary, Report } from "./types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    // FastAPI sends a string for our own errors and a list for request validation errors.
    throw new Error(typeof body?.detail === "string" ? body.detail : `Request failed (${res.status})`);
  }
  return body as T;
}

export type Platform = "chesscom" | "lichess";

export async function fetchGames(platform: Platform, username: string): Promise<GameSummary[]> {
  const { games } = await request<{ games: GameSummary[] }>(`/api/games/${platform}/${encodeURIComponent(username)}`);
  return games;
}

export function analyzeGame(pgn: string, evals: PositionEval[]): Promise<Report> {
  return request<Report>("/api/analyze", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pgn, evals }),
  });
}
