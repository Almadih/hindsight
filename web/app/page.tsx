"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { fetchGames, type Platform } from "@/lib/api";
import type { GameSummary } from "@/lib/types";

const field = "rounded-md border border-line bg-bg px-3 py-2 placeholder:text-muted focus-visible:border-accent";
const primary = "rounded-md bg-accent px-5 py-2 font-semibold text-[#141311] hover:brightness-110 disabled:opacity-50";

export default function Home() {
  const router = useRouter();
  const [pgn, setPgn] = useState("");
  const [platform, setPlatform] = useState<Platform>("chesscom");
  const [username, setUsername] = useState("");
  const [games, setGames] = useState<GameSummary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function review(game: string) {
    sessionStorage.setItem("pgn", game);
    router.push("/review");
  }

  async function loadGames(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      setGames(await fetchGames(platform, username.trim()));
    } catch (err) {
      setGames(null);
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-2xl space-y-10 px-5 py-12 sm:py-20">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Game Review</h1>
        <p className="text-muted">Stockfish runs in your browser, then every move gets a verdict.</p>
      </div>

      <form onSubmit={loadGames} className="space-y-3">
        <h2 className="font-semibold">Your recent games</h2>
        <div className="flex flex-wrap gap-2">
          <label className="sr-only" htmlFor="platform">Platform</label>
          <select id="platform" value={platform} onChange={(e) => setPlatform(e.target.value as Platform)} className={field}>
            <option value="chesscom">Chess.com</option>
            <option value="lichess">Lichess</option>
          </select>
          <label className="sr-only" htmlFor="username">Username</label>
          <input
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            required
            pattern="[A-Za-z0-9_\-]{1,30}"
            className={`${field} min-w-0 flex-1`}
          />
          <button disabled={loading} className={primary}>
            {loading ? "Loading…" : "Find games"}
          </button>
        </div>
        {error && <p role="alert" className="text-sm text-[#ff7769]">{error}</p>}
        {games && games.length === 0 && <p className="text-sm text-muted">No standard games in the last two months.</p>}
        {games && games.length > 0 && (
          <ul className="max-h-[50dvh] divide-y divide-line overflow-y-auto rounded-md border border-line bg-surface">
            {games.map((g) => (
              <li key={g.id}>
                <button type="button" onClick={() => review(g.pgn)} className="flex w-full items-baseline justify-between gap-4 px-4 py-2.5 text-left hover:bg-raised">
                  <span className="min-w-0 truncate">
                    {g.white.name} <span className="text-muted tabular-nums">({g.white.rating ?? "?"})</span>
                    <span className="text-muted"> vs </span>
                    {g.black.name} <span className="text-muted tabular-nums">({g.black.rating ?? "?"})</span>
                  </span>
                  <span className="shrink-0 text-sm text-muted tabular-nums">
                    {g.result} · {g.timeClass} · {new Date(g.endTime).toLocaleDateString()}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </form>

      <form onSubmit={(e) => { e.preventDefault(); review(pgn); }} className="space-y-3">
        <h2 className="font-semibold">Or paste a PGN</h2>
        <label className="sr-only" htmlFor="pgn">PGN</label>
        <textarea id="pgn" value={pgn} onChange={(e) => setPgn(e.target.value)} required rows={8} className={`${field} w-full font-mono text-sm`} />
        <button className={primary}>Review game</button>
      </form>
    </main>
  );
}
