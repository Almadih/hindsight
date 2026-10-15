"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { GameList } from "@/components/landing/GameList";
import { fetchPlayer, type Platform } from "@/lib/api";
import type { PlayerProfile } from "@/lib/types";

type State = { stage: "loading" } | { stage: "error"; message: string } | { stage: "done"; profile: PlayerProfile };

const RESULT_TONE = { won: "text-accent", lost: "text-danger", draw: "text-muted", unknown: "text-muted" } as const;

export default function PlayerPage() {
  const router = useRouter();
  const [state, setState] = useState<State>({ stage: "loading" });

  useEffect(() => {
    (async () => {
      const q = new URLSearchParams(location.search);
      const platform = q.get("p");
      const username = q.get("u");
      try {
        if ((platform !== "chesscom" && platform !== "lichess") || !username) throw new Error("This link is missing a platform or username.");
        setState({ stage: "done", profile: await fetchPlayer(platform as Platform, username) });
      } catch (err) {
        setState({ stage: "error", message: (err as Error).message === "player not found" ? "No player with that name." : (err as Error).message });
      }
    })();
  }, []);

  if (state.stage !== "done") {
    return (
      <main className="grid min-h-dvh place-items-center p-6">
        <div className="w-full max-w-sm space-y-3">
          {state.stage === "error" ? (
            <>
              <p role="alert" className="font-semibold">Couldn’t load this player</p>
              <p className="text-sm text-muted">{state.message}</p>
              <Link href="/" className="inline-block rounded-md bg-accent px-4 py-2 text-sm font-semibold text-[#141311] hover:brightness-110">
                Find a player
              </Link>
            </>
          ) : (
            <>
              <p className="font-semibold">Loading player…</p>
              <progress className="h-2 w-full" aria-label="Loading player" />
            </>
          )}
        </div>
      </main>
    );
  }

  const { profile } = state;
  const { history, themes } = profile;
  const accs = history.map((g) => g.accuracy).filter((a): a is number => a !== null);
  const avg = accs.length ? accs.reduce((a, b) => a + b, 0) / accs.length : null;
  // Oldest to newest for the trend; the history list stays newest first.
  const trend = [...history].reverse().map((g, i) => ({ i: i + 1, ...g }));
  const review = (pgn: string) => {
    sessionStorage.setItem("pgn", pgn);
    router.push("/review");
  };

  return (
    <main className="mx-auto w-full max-w-[1100px] space-y-10 px-4 py-8 sm:px-8 sm:py-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/" className="text-sm font-semibold text-muted hover:text-fg">
            ← Hindsight
          </Link>
          <h1 className="mt-2 text-[clamp(2rem,4.5vw,3.5rem)] leading-none font-extrabold tracking-[-0.04em] break-all">{profile.username}</h1>
          <p className="mt-2 text-muted">{profile.platform === "chesscom" ? "Chess.com" : "Lichess"}</p>
        </div>
        <dl className="flex gap-6 text-right">
          <div>
            <dt className="text-sm text-muted">Reviewed games</dt>
            <dd className="text-2xl font-bold tabular-nums">{history.length}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Average accuracy</dt>
            <dd className="text-2xl font-bold tabular-nums">{avg === null ? "–" : avg.toFixed(1)}</dd>
          </div>
        </dl>
      </header>

      {history.length === 0 ? (
        <p className="rounded-xl bg-surface p-5 text-pretty text-muted">
          No reviewed games yet. Pick one of the recent games below; once it’s reviewed, its accuracy and mistakes show up here.
        </p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <section aria-labelledby="trend" className="rounded-xl bg-surface p-5">
            <h2 id="trend" className="font-semibold">
              Accuracy, game by game
            </h2>
            <p className="text-sm text-muted">Oldest on the left. Hover a point for the game.</p>
            <div className="mt-4 h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                  <CartesianGrid stroke="#3d3a35" strokeDasharray="2 4" vertical={false} />
                  <XAxis dataKey="i" tick={{ fill: "#a8a39b", fontSize: 12 }} tickLine={false} axisLine={{ stroke: "#3d3a35" }} />
                  <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={{ fill: "#a8a39b", fontSize: 12 }} tickLine={false} axisLine={false} />
                  <Tooltip
                    cursor={{ stroke: "#a8a39b", strokeWidth: 1 }}
                    content={({ active, payload }) => {
                      const g = active && payload?.[0]?.payload;
                      if (!g) return null;
                      return (
                        <div className="rounded-md bg-raised px-3 py-2 text-sm shadow-[0_6px_20px_rgba(0,0,0,0.4)]">
                          <p className="font-semibold">vs {g.opponent}</p>
                          <p className="text-muted">
                            <span className={RESULT_TONE[g.result as keyof typeof RESULT_TONE]}>{g.result}</span> · accuracy{" "}
                            <span className="text-fg tabular-nums">{g.accuracy ?? "–"}</span>
                            {g.estElo ? (
                              <>
                                {" "}
                                · game rating <span className="text-fg tabular-nums">{g.estElo}</span>
                              </>
                            ) : null}
                          </p>
                        </div>
                      );
                    }}
                  />
                  <Line type="monotone" dataKey="accuracy" stroke="#81b64c" strokeWidth={2} dot={{ r: 4, fill: "#81b64c", stroke: "#262421", strokeWidth: 2 }} activeDot={{ r: 6 }} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section aria-labelledby="themes" className="rounded-xl bg-surface p-5">
            <h2 id="themes" className="font-semibold">
              Your common mistakes
            </h2>
            {themes.length === 0 ? (
              <p className="mt-2 text-sm text-muted">No pattern yet: no recurring tactical slips in the reviewed games.</p>
            ) : (
              <ol className="mt-3 space-y-2">
                {themes.map((t) => (
                  <li key={t.label} className="flex items-center gap-3 rounded-md bg-raised px-3 py-2.5">
                    <span className="w-8 shrink-0 text-center text-lg font-bold tabular-nums">{t.count}</span>
                    <span className="min-w-0 flex-1 font-semibold">{t.label}</span>
                    <Link href={`/review?g=${t.example.hash}&ply=${t.example.ply}`} className="shrink-0 text-sm font-semibold text-accent hover:underline">
                      See one →
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      )}

      {history.length > 0 && (
        <section aria-labelledby="history">
          <h2 id="history" className="mb-3 font-semibold">
            Reviewed games
          </h2>
          <ul className="divide-y divide-line overflow-hidden rounded-xl bg-surface">
            {history.map((g) => (
              <li key={g.hash}>
                <Link href={`/review?g=${g.hash}`} className="grid grid-cols-[1fr_auto] items-center gap-x-4 px-5 py-3 hover:bg-raised">
                  <span className="min-w-0 truncate font-semibold">
                    vs {g.opponent} <span className="font-normal text-muted">as {g.side}</span>
                  </span>
                  <span className={`text-sm font-bold ${RESULT_TONE[g.result]}`}>{g.result === "unknown" ? "–" : g.result}</span>
                  <span className="text-sm text-muted tabular-nums">
                    accuracy <span className="text-fg">{g.accuracy ?? "–"}</span>
                    {g.estElo ? ` · game rating ${g.estElo}` : ""}
                  </span>
                  <span className="text-sm font-semibold text-muted">Open →</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="recent" className="max-h-[70dvh]">
        <h2 id="recent" className="sr-only">
          Recent games
        </h2>
        <GameList games={profile.games} username={profile.username} onPick={review} title="Recent games" />
      </section>

      <p className="text-sm text-pretty text-muted">
        Only games reviewed on Hindsight count here. Reviews are shared, so anyone can see this page. Hindsight is not affiliated with Chess.com or Lichess.
      </p>
    </main>
  );
}
