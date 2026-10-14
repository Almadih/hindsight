import type { GameSummary } from "@/lib/types";

type Props = { games: GameSummary[]; username: string; onPick: (pgn: string) => void; onClose: () => void };

function outcome(g: GameSummary, username: string): { label: string; tone: string } {
  const lower = username.toLowerCase();
  const asWhite = g.white.name.toLowerCase() === lower;
  const asBlack = g.black.name.toLowerCase() === lower;
  if (g.result === "1/2-1/2") return { label: "Draw", tone: "text-muted" };
  if (!asWhite && !asBlack) return { label: g.result, tone: "text-muted" };
  const won = (asWhite && g.result === "1-0") || (asBlack && g.result === "0-1");
  return won ? { label: "Won", tone: "text-accent" } : { label: "Lost", tone: "text-danger" };
}

/** Recent games for a username; picking one starts its review. */
export function GameList({ games, username, onPick, onClose }: Props) {
  return (
    <div className="flex min-h-0 flex-col rounded-xl bg-raised">
      <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
        <h2 className="font-bold">
          Recent games for <span className="text-accent">{username}</span>
        </h2>
        <button onClick={onClose} className="text-sm font-semibold text-muted hover:text-fg">
          Back to the demo
        </button>
      </div>
      <ul className="min-h-0 flex-1 divide-y divide-line overflow-y-auto border-t border-line">
        {games.map((g) => {
          const o = outcome(g, username);
          return (
            <li key={g.id}>
              <button onClick={() => onPick(g.pgn)} className="grid w-full grid-cols-[1fr_auto] items-center gap-x-4 px-5 py-3 text-left hover:bg-line">
                <span className="min-w-0 truncate font-semibold">
                  {g.white.name} <span className="font-normal text-muted tabular-nums">{g.white.rating ?? ""}</span>
                  <span className="font-normal text-muted"> vs </span>
                  {g.black.name} <span className="font-normal text-muted tabular-nums">{g.black.rating ?? ""}</span>
                </span>
                <span className={`text-sm font-bold ${o.tone}`}>{o.label}</span>
                <span className="text-sm text-muted tabular-nums">
                  {g.timeClass} · {new Date(g.endTime).toLocaleDateString()}
                </span>
                <span className="text-sm font-semibold text-muted">Review →</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
