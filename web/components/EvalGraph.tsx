"use client";

import { Area, AreaChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BADGE, describeEval, NOTABLE, whiteWinPct } from "@/lib/review";
import type { ReviewMove, WhiteEval } from "@/lib/types";

/** Just what the graph reads, so the landing page's baked demo game fits too. */
type GraphData = { start: WhiteEval; moves: (Pick<ReviewMove, "ply" | "badge" | "evalWhite" | "mateWhite"> & { san?: string })[] };

type Point = { ply: number; w: number; color?: string; label?: string };

/** White's win% across the game; click to jump to a ply. Notable moves get a dot in their badge colour. */
export function EvalGraph({
  report,
  ply,
  onSelect,
  className = "h-24",
}: {
  report: GraphData;
  ply: number;
  /** Omit for a display-only graph (no pointer cursor, no clicks). */
  onSelect?: (ply: number) => void;
  className?: string;
}) {
  const data: Point[] = [
    { ply: 0, w: whiteWinPct(report.start) },
    ...report.moves.map((m) => ({
      ply: m.ply,
      w: whiteWinPct(m),
      color: NOTABLE.has(m.badge) && m.badge !== "book" ? BADGE[m.badge].color : undefined,
      label: m.san && `${Math.ceil(m.ply / 2)}.${m.ply % 2 ? "" : ".."} ${m.san} · ${m.badge === "book" ? "Book" : BADGE[m.badge].label} · ${describeEval(m)}`,
    })),
  ];

  return (
    <div className={`${className} overflow-hidden rounded-md bg-[#403d39]`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 4, right: 4, bottom: 4, left: 4 }}
          onClick={onSelect ? (s) => s.activeTooltipIndex != null && onSelect(Number(s.activeTooltipIndex)) : undefined}
          className={onSelect ? "cursor-pointer" : undefined}
          accessibilityLayer={false}
        >
          <XAxis dataKey="ply" type="number" domain={[0, data.length - 1]} hide />
          <YAxis domain={[0, 100]} hide />
          <Tooltip
            cursor={{ stroke: "#a8a39b", strokeWidth: 1 }}
            isAnimationActive={false}
            content={({ active, payload }) => {
              const label = active && (payload?.[0]?.payload as Point | undefined)?.label;
              return label ? <p className="rounded bg-[#1c1b19] px-2 py-1 text-xs font-semibold whitespace-nowrap shadow-[0_6px_20px_rgba(0,0,0,0.4)]">{label}</p> : null;
            }}
          />
          <ReferenceLine y={50} stroke="#a8a39b" strokeOpacity={0.5} strokeDasharray="2 3" />
          <Area
            type="monotone"
            dataKey="w"
            baseValue={0}
            stroke="none"
            fill="#f1efea"
            fillOpacity={1}
            isAnimationActive={false}
            activeDot={false}
            dot={({ cx, cy, payload, index }) =>
              payload.color ? (
                <circle key={index} cx={cx} cy={cy} r={3.5} fill={payload.color} stroke="#262421" strokeWidth={1.5} />
              ) : (
                <g key={index} />
              )
            }
          />
          <ReferenceLine x={ply} stroke="#81b64c" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
