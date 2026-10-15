import type { PositionEval } from "./engine/pool";
import type { GameSummary, PlayerProfile, Report } from "./types";

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    // FastAPI sends a string for our own errors and a list for request validation errors.
    throw new ApiError(typeof body?.detail === "string" ? body.detail : `Request failed (${res.status})`, res.status);
  }
  return body as T;
}

export type Platform = "chesscom" | "lichess";

export async function fetchGames(platform: Platform, username: string): Promise<GameSummary[]> {
  const { games } = await request<{ games: GameSummary[] }>(`/api/games/${platform}/${encodeURIComponent(username)}`);
  return games;
}

export function fetchPlayer(platform: Platform, username: string): Promise<PlayerProfile> {
  return request<PlayerProfile>(`/api/player/${platform}/${encodeURIComponent(username)}`);
}

/** A stored review by its game hash (share links), or null if there is none. */
export async function getReview(hash: string): Promise<Report | null> {
  try {
    return await request<Report>(`/api/review/${encodeURIComponent(hash)}`);
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 422)) return null;
    throw err;
  }
}

/** The shared cached review for this game, or null if nobody has analyzed it yet. */
export async function cachedReview(pgn: string): Promise<Report | null> {
  try {
    return await analyzeGame(pgn);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

/** `fresh` re-analyzes privately: the shared cached review is neither used nor changed. */
export function analyzeGame(pgn: string, evals?: PositionEval[], fresh = false): Promise<Report> {
  return request<Report>("/api/analyze", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pgn, evals, fresh }),
  });
}
