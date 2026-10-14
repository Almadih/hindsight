import { BADGE, BADGE_ORDER } from "@/lib/review";
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
    <svg viewBox="0 0 64 64" className="size-20" role="img" aria-label={`${side} accuracy ${value ?? "unknown"}`}>
      <circle cx="32" cy="32" r={r} fill="none" stroke="#3d3a35" strokeWidth="6" />
      <circle
        cx="32"
        cy="32"
        r={r}
        fill="none"
        stroke={side === "white" ? "#f1efea" : "#8a857d"}
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={`${((value ?? 0) / 100) * c} ${c}`}
        className="ring-fill"
        transform="rotate(-90 32 32)"
      />
      <text x="32" y="33" textAnchor="middle" dominantBaseline="central" fill="#eceae6" fontSize="15" fontWeight="700" className="tabular-nums">
        {value === null ? "–" : value.toFixed(1)}
      </text>
    </svg>
  );
}

export function SummaryCard({ report, names }: { report: Report; names: Record<Side, string> }) {
  const { accuracy, counts, elo } = report;
  return (
    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto text-sm">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center">
        <div className="flex flex-col items-center gap-1">
          <AccuracyRing value={accuracy.white} side="white" />
          <span className="max-w-full truncate font-semibold">{names.white}</span>
        </div>
        <span className="text-xs text-muted">Accuracy</span>
        <div className="flex flex-col items-center gap-1">
          <AccuracyRing value={accuracy.black} side="black" />
          <span className="max-w-full truncate font-semibold">{names.black}</span>
        </div>
        <span className="rounded bg-raised py-1 text-base font-semibold tabular-nums">{elo.white ?? "–"}</span>
        <span className="text-xs text-muted">Game rating</span>
        <span className="rounded bg-raised py-1 text-base font-semibold tabular-nums">{elo.black ?? "–"}</span>
      </div>

      <table className="w-full">
        <caption className="sr-only">Move classifications</caption>
        <tbody>
          {BADGE_ORDER.map((b, i) => {
            const w = counts.white[b] ?? 0;
            const k = counts.black[b] ?? 0;
            return (
              // Rows rise in one after another when the verdicts arrive (35ms apart, 350ms in all).
              <tr key={b} className={`fx-rise ${w || k ? "" : "opacity-45"}`} style={{ animationDelay: `${i * 35}ms` }}>
                <td className="w-12 py-1 text-center font-semibold tabular-nums" style={{ color: w ? BADGE[b].color : undefined }}>{w}</td>
                <th scope="row" className="py-1 font-normal">
                  <span className="flex items-center justify-center gap-2">
                    <BadgeIcon badge={b} size={18} />
                    <span className="w-20 text-left">{BADGE[b].label}</span>
                  </span>
                </th>
                <td className="w-12 py-1 text-center font-semibold tabular-nums" style={{ color: k ? BADGE[b].color : undefined }}>{k}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <table className="w-full border-t border-line">
        <caption className="sr-only">Accuracy by game phase</caption>
        <tbody>
          {PHASES.map(({ key, label }) => (
            <tr key={key}>
              <td className="w-12 pt-2 text-center tabular-nums">{accuracy.phases.white[key]?.toFixed(0) ?? "–"}</td>
              <th scope="row" className="pt-2 text-center font-normal text-muted">{label}</th>
              <td className="w-12 pt-2 text-center tabular-nums">{accuracy.phases.black[key]?.toFixed(0) ?? "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
