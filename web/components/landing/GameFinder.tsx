"use client";

import { useState, useSyncExternalStore, type FormEvent } from "react";
import { fetchGameByUrl, fetchGames, type Platform } from "@/lib/api";
import { myUsernames, rememberMe } from "@/lib/me";
import type { GameSummary } from "@/lib/types";

type Props = {
  onGames: (games: GameSummary[], username: string, platform: Platform) => void;
  onPgn: (pgn: string) => void;
  inputId?: string;
};

type Mode = Platform | "link";

const MODES: { id: Mode; label: string }[] = [
  { id: "chesscom", label: "Chess.com" },
  { id: "lichess", label: "Lichess" },
  { id: "link", label: "Game link" },
];

const USERNAME_RE = /^[A-Za-z0-9_-]{1,30}$/;
const GAME_URL_RE = /(?:chess\.com|lichess\.org)\//i;

/** The one action on the page: find your games by username, paste a game link, or paste a PGN. */
export function GameFinder({ onGames, onPgn, inputId = "username" }: Props) {
  const [mode, setMode] = useState<Mode>("chesscom");
  // The last username looked up on this device fills the field until the visitor types (empty while pre-rendering).
  const remembered = useSyncExternalStore(
    () => () => {},
    () => myUsernames()[0] ?? "",
    () => "",
  );
  const [typed, setUsername] = useState<string | null>(null);
  const username = typed ?? remembered;
  const [link, setLink] = useState("");
  const [pasting, setPasting] = useState(false);
  const [pgn, setPgn] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isLink = mode === "link";
  const platformLabel = mode === "chesscom" ? "Chess.com" : "Lichess";

  async function resolveLink(rawUrl: string) {
    const trimmed = rawUrl.trim();
    if (!trimmed) {
      setError("Paste a Chess.com or Lichess game link");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetchGameByUrl(trimmed);
      if (!res.pgn) throw new Error("Could not read moves from that game");
      onPgn(res.pgn);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function find(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    if (mode === "link") {
      await resolveLink(link);
      return;
    }
    const name = username.trim();
    if (GAME_URL_RE.test(name)) {
      setMode("link");
      setLink(name);
      await resolveLink(name);
      return;
    }
    if (!USERNAME_RE.test(name)) {
      setError("Letters, numbers, - and _ only");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const games = await fetchGames(mode, name);
      if (games.length === 0) setError(`No standard games for ${name} in the last two months.`);
      else {
        rememberMe(name);
        onGames(games, name, mode);
      }
    } catch (err) {
      setError((err as Error).message === "player not found" ? `No ${mode === "chesscom" ? "Chess.com" : "Lichess"} player called ${name}.` : (err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function handleInputChange(value: string) {
    if (isLink) {
      setLink(value);
    } else if (GAME_URL_RE.test(value)) {
      setMode("link");
      setLink(value);
      setError(null);
    } else {
      setUsername(value);
    }
  }

  return (
    <div className="rounded-xl bg-bg/92 p-3 shadow-[0_18px_50px_rgba(0,0,0,0.55)] ring-1 ring-white/8 sm:p-4">
      {pasting ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onPgn(pgn);
          }}
          className="space-y-2"
        >
          <label htmlFor="pgn" className="text-sm font-semibold">
            Paste a PGN
          </label>
          <textarea
            id="pgn"
            value={pgn}
            onChange={(e) => setPgn(e.target.value)}
            required
            rows={5}
            autoFocus
            placeholder={'[Event "…"]\n1. e4 e5 2. Nf3 …'}
            className="w-full resize-none rounded-lg border border-line bg-surface p-3 font-mono text-sm placeholder:text-muted focus-visible:border-accent"
          />
          <div className="flex items-center gap-3">
            <button className="rounded-lg bg-accent px-5 py-2.5 font-bold text-[#141311] hover:brightness-110">Review this game</button>
            <button type="button" onClick={() => setPasting(false)} className="text-sm font-semibold text-muted hover:text-fg">
              {isLink ? "Use a game link instead" : "Use a username instead"}
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={find} className="space-y-2.5">
          <div role="radiogroup" aria-label="How to find your game" className="flex flex-wrap gap-1 text-sm font-semibold">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={mode === m.id}
                onClick={() => {
                  setMode(m.id);
                  setError(null);
                }}
                className="rounded-md px-3 py-2.5 text-muted hover:text-fg aria-checked:bg-raised aria-checked:text-fg"
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label htmlFor={inputId} className="sr-only">
              {isLink ? "Chess.com or Lichess game link" : `${platformLabel} username`}
            </label>
            <input
              id={inputId}
              type="text"
              value={isLink ? link : username}
              onChange={(e) => handleInputChange(e.target.value)}
              placeholder={isLink ? "https://chess.com/game/live/… or lichess.org/…" : `Your ${platformLabel} username`}
              required
              autoComplete={isLink ? "off" : "username"}
              spellCheck={false}
              className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-4 py-3 text-base placeholder:text-muted focus-visible:border-accent"
            />
            <button disabled={loading} className="shrink-0 rounded-lg bg-accent px-6 py-3 font-bold text-[#141311] hover:brightness-110 disabled:opacity-60">
              {loading ? (isLink ? "Fetching game…" : "Finding games…") : isLink ? "Review this game" : "Review my games"}
            </button>
          </div>
          <div className="flex items-center justify-between gap-3 text-sm">
            {error ? (
              <p role="alert" className="text-danger">
                {error}
              </p>
            ) : (
              <p className="text-muted">Free. No account.</p>
            )}
            <button type="button" onClick={() => setPasting(true)} className="shrink-0 py-2 font-semibold text-muted underline decoration-line underline-offset-4 hover:text-fg">
              or paste a PGN
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
