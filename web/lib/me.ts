import type { Side } from "./types";

// Usernames the visitor looked up, remembered on this device only, so reviews can show their side.
const KEY = "hindsight:me";
const MAX = 5;

export function myUsernames(): string[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function rememberMe(username: string) {
  const name = username.toLowerCase();
  localStorage.setItem(KEY, JSON.stringify([name, ...myUsernames().filter((n) => n !== name)].slice(0, MAX)));
}

/** Which side "you" played in a game, from its PGN headers, or null if neither player is remembered. */
export function mySide(headers: Record<string, string>): Side | null {
  const mine = new Set(myUsernames());
  if (mine.has((headers.White ?? "").toLowerCase())) return "white";
  if (mine.has((headers.Black ?? "").toLowerCase())) return "black";
  return null;
}
