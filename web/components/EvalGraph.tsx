"use client";

import { Area, AreaChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BADGE, NOTABLE, whiteWinPct } from "@/lib/review";
import type { Report } from "@/lib/types";

type Point = { ply: number; w: number; color?: string };

/** White's win% across the game; click to jump to a ply. Notable moves get a dot in their badge colour. */
export function EvalGraph({ report, ply, onSelect }: { report: Report; ply: number; onSelect: (ply: number) => void }) {
  const data: Point[] = [
    { ply: 0, w: whiteWinPct(report.start) },
    ...report.moves.map((m) => ({
      ply: m.ply,
      w: whiteWinPct(m),
      color: NOTABLE.has(m.badge) && m.badge !== "book" ? BADGE[m.badge].color : undefined,
    })),
  ];

  return (
    <div className="h-24 overflow-hidden rounded-md bg-[#403d39]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 4, right: 4, bottom: 4, left: 4 }}
          onClick={(s) => s.activeTooltipIndex != null && onSelect(Number(s.activeTooltipIndex))}
          className="cursor-pointer"
          accessibilityLayer={false}
        >
          <XAxis dataKey="ply" type="number" domain={[0, data.length - 1]} hide />
          <YAxis domain={[0, 100]} hide />
          <Tooltip content={() => null} cursor={{ stroke: "#8a857d", strokeWidth: 1 }} />
          <ReferenceLine y={50} stroke="#6b665f" strokeDasharray="2 3" />
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
