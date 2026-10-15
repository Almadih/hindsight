import Link from "next/link";
import { BADGE, BADGE_ORDER, badgeText, keyMoments } from "@/lib/review";
import type { Phase, Report, Side } from "@/lib/types";
import { BadgeIcon } from "./BadgeIcon";

const PHASES: { key: Phase; label: string }[] = [
  { key: "opening", label: "Opening" },
  { key: "middlegame", label: "Middlegame" },
  { key: "endgame", label: "Endgame" },
];

function AccuracyRing({ value, side }: { value: number | null; side: Side }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 64 64" className="size-16" role="img" aria-label={`${side} accuracy ${value ?? "unknown"}`}>
      <circle cx="32" cy="32" r={r} fill="none" stroke="#3d3a35" strokeWidth="6" />
      <circle
        cx="32"
        cy="32"
        r={r}
        fill="none"
        stroke={side === "white" ? "#f1efea" : "#a8a39b"}
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={`${((value ?? 0) / 100) * c} ${c}`}
        className="ring-fill"
        transform="rotate(-90 32 32)"
      />
      <text x="32" y="33" textAnchor="middle" dominantBaseline="central" fill="#eceae6" fontSize="16" fontWeight="700" className="tabular-nums">
        {value === null ? "–" : value.toFixed(1)}
      </text>
    </svg>
  );
}

/** The coach's first sentence, as a one-line gist. */
function gist(text: string | null | undefined): string | null {
  if (!text) return null;
  const first = text.split(/(?<=[.!?])\s/)[0];
  return first.length > 110 ? `${first.slice(0, 107)}…` : first;
}

type Props = { report: Report; names: Record<Side, string>; me: Side | null; onJump: (ply: number) => void };

/** The game in one screen: the moments that decided it first, then accuracy, rating and every verdict count. */
export function SummaryCard({ report, names, me, onJump }: Props) {
  const { accuracy, counts, elo } = report;
  // When we know who "you" are, lead with your moments; fall back to both sides if you had none.
  const mine = me ? keyMoments(report.moves.filter((m) => m.color === me)) : [];
  const moments = mine.length ? mine : keyMoments(report.moves);
  return (
    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1 text-sm">
      {moments.length > 0 && (
        <section aria-labelledby="key-moments">
          <h2 id="key-moments" className="mb-2 font-semibold">
            {mine.length ? "Your key moments" : "Key moments"}
          </h2>
          <ol className="space-y-1.5">
            {moments.map((m, i) => (
              <li key={m.ply} className="fx-rise" style={{ animationDelay: `${i * 60}ms` }}>
                <button onClick={() => onJump(m.ply)} className="flex w-full items-start gap-3 rounded-md bg-raised px-3 py-2.5 text-left hover:bg-line">
                  <BadgeIcon badge={m.badge} size={26} className="mt-0.5 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">
                      <span className="tabular-nums">
                        {Math.ceil(m.ply / 2)}.{m.color === "black" ? ".." : ""}
                      </span>{" "}
                      {m.san} <span style={{ color: badgeText(m.badge) }}>{BADGE[m.badge].phrase}</span>
                    </span>
                    <span className="mt-0.5 block text-pretty text-muted">{gist(m.coach) ?? BADGE[m.badge].rule}</span>
                  </span>
                  <span className="shrink-0 self-center text-muted" aria-hidden="true">
                    ›
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-2 gap-y-1.5 text-center">
        <div className="flex flex-col items-center gap-1">
          <AccuracyRing value={accuracy.white} side="white" />
          <span className="max-w-full truncate font-semibold">{me === "white" ? `${names.white} (you)` : names.white}</span>
        </div>
        <span className="text-xs text-muted">Accuracy</span>
        <div className="flex flex-col items-center gap-1">
          <AccuracyRing value={accuracy.black} side="black" />
          <span className="max-w-full truncate font-semibold">{me === "black" ? `${names.black} (you)` : names.black}</span>
        </div>
        <span className="rounded bg-raised py-1 text-base font-semibold tabular-nums">{elo.white ?? "–"}</span>
        <span className="text-xs text-muted">Game rating</span>
        <span className="rounded bg-raised py-1 text-base font-semibold tabular-nums">{elo.black ?? "–"}</span>
        <p className="col-span-3 text-xs text-pretty text-muted">The rating each player performed at in this game, estimated from accuracy.</p>
      </div>

      <table className="w-full">
        <caption className="sr-only">Move classifications</caption>
        <tbody>
          {BADGE_ORDER.map((b, i) => {
            const w = counts.white[b] ?? 0;
            const k = counts.black[b] ?? 0;
            const cell = (n: number) => (
              <td className={`w-12 py-1 text-center font-semibold tabular-nums ${n ? "" : "text-muted"}`} style={{ color: n ? badgeText(b) : undefined }}>
                {n}
              </td>
            );
            return (
              // Rows rise in one after another when the verdicts arrive (35ms apart, 350ms in all).
              <tr key={b} className="fx-rise" style={{ animationDelay: `${i * 35}ms` }}>
                {cell(w)}
                <th scope="row" className="py-1 font-normal">
                  <span className={`flex items-center justify-center gap-2 ${w || k ? "" : "text-muted"}`}>
                    <BadgeIcon badge={b} size={18} className={w || k ? "" : "opacity-50"} />
                    <span className="w-20 text-left">{BADGE[b].label}</span>
                  </span>
                </th>
                {cell(k)}
              </tr>
            );
          })}
        </tbody>
      </table>
      <Link href="/#verdicts" className="block text-center text-xs font-semibold text-muted underline decoration-line underline-offset-4 hover:text-fg">
        What do the verdicts mean?
      </Link>

      <table className="w-full border-t border-line">
        <caption className="sr-only">Accuracy by game phase</caption>
        <tbody>
          {PHASES.map(({ key, label }) => (
            <tr key={key}>
              <td className="w-12 pt-2 text-center tabular-nums">{accuracy.phases.white[key]?.toFixed(0) ?? "–"}</td>
              <th scope="row" className="pt-2 text-center font-normal text-muted">
                {label}
              </th>
              <td className="w-12 pt-2 text-center tabular-nums">{accuracy.phases.black[key]?.toFixed(0) ?? "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
