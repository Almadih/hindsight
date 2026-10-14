"use client";

import { useState, type FormEvent } from "react";
import { fetchGames, type Platform } from "@/lib/api";
import type { GameSummary } from "@/lib/types";

type Props = {
  onGames: (games: GameSummary[], username: string) => void;
  onPgn: (pgn: string) => void;
  inputId?: string;
};

const PLATFORMS: { id: Platform; label: string }[] = [
  { id: "chesscom", label: "Chess.com" },
  { id: "lichess", label: "Lichess" },
];

/** The one action on the page: find your games by username, or paste a PGN. */
export function GameFinder({ onGames, onPgn, inputId = "username" }: Props) {
  const [platform, setPlatform] = useState<Platform>("chesscom");
  const [username, setUsername] = useState("");
  const [pasting, setPasting] = useState(false);
  const [pgn, setPgn] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function find(e: FormEvent) {
    e.preventDefault();
    const name = username.trim();
    setLoading(true);
    setError(null);
    try {
      const games = await fetchGames(platform, name);
      if (games.length === 0) setError(`No standard games for ${name} in the last two months.`);
      else onGames(games, name);
    } catch (err) {
      setError((err as Error).message === "player not found" ? `No ${platform === "chesscom" ? "Chess.com" : "Lichess"} player called ${name}.` : (err as Error).message);
    } finally {
      setLoading(false);
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
              Use a username instead
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={find} className="space-y-2.5">
          <div role="radiogroup" aria-label="Where you play" className="flex gap-1 text-sm font-semibold">
            {PLATFORMS.map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={platform === p.id}
                onClick={() => setPlatform(p.id)}
                className="rounded-md px-3 py-1 text-muted hover:text-fg aria-checked:bg-raised aria-checked:text-fg"
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label htmlFor={inputId} className="sr-only">
              {platform === "chesscom" ? "Chess.com" : "Lichess"} username
            </label>
            <input
              id={inputId}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={`Your ${platform === "chesscom" ? "Chess.com" : "Lichess"} username`}
              required
              pattern="[A-Za-z0-9_\-]{1,30}"
              title="Letters, numbers, - and _ only"
              autoComplete="username"
              spellCheck={false}
              className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-4 py-3 text-base placeholder:text-muted focus-visible:border-accent"
            />
            <button disabled={loading} className="rounded-lg bg-accent px-6 py-3 font-bold text-[#141311] hover:brightness-110 disabled:opacity-60">
              {loading ? "Finding games…" : "Review my games"}
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
            <button type="button" onClick={() => setPasting(true)} className="shrink-0 font-semibold text-muted underline decoration-line underline-offset-4 hover:text-fg">
              or paste a PGN
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
