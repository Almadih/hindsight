import { BADGE } from "@/lib/review";
import type { Badge } from "@/lib/types";

// Original drawings in the visual language players know from review tools: a flat coloured disc with a
// bold white glyph. 20×20 viewBox throughout; every glyph is a path, never live text, so the icon is
// identical on every OS.

// 5-point star centred in the badge.
const STAR = Array.from({ length: 10 }, (_, i) => {
  const r = i % 2 ? 2.9 : 6.4;
  const a = (Math.PI / 5) * i - Math.PI / 2;
  return `${(10 + r * Math.cos(a)).toFixed(2)},${(10.5 + r * Math.sin(a)).toFixed(2)}`;
}).join(" ");

type Mark = "bang" | "query";

// Annotation marks as glyph pairs: [mark, horizontal offset, scale].
const NOTATION: Partial<Record<Badge, [Mark, number, number][]>> = {
  brilliant: [["bang", -2.4, 0.95], ["bang", 2.4, 0.95]],
  great: [["bang", 0, 1.05]],
  inaccuracy: [["query", -2.3, 0.85], ["bang", 3.3, 0.85]],
  mistake: [["query", 0, 1.05]],
  blunder: [["query", -3, 0.8], ["query", 3, 0.8]],
};

function MarkPath({ mark, dx, s, ink }: { mark: Mark; dx: number; s: number; ink: string }) {
  return (
    <g transform={`translate(${dx} 0) translate(10 10) scale(${s}) translate(-10 -10)`}>
      {mark === "bang" ? (
        <rect x="8.75" y="4" width="2.5" height="8" rx="1.25" fill={ink} />
      ) : (
        <path d="M7.2 7.5a2.85 2.85 0 1 1 4.35 2.4c-1 .62-1.55 1.2-1.55 2.3v.5" fill="none" stroke={ink} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      )}
      <circle cx="10" cy={mark === "bang" ? 15 : 15.3} r="1.55" fill={ink} />
    </g>
  );
}

function Glyph({ badge, ink }: { badge: Badge; ink: string }) {
  const marks = NOTATION[badge];
  if (marks) {
    return (
      <>
        {marks.map(([mark, dx, s], i) => (
          <MarkPath key={i} mark={mark} dx={dx} s={s} ink={ink} />
        ))}
      </>
    );
  }
  const stroke = { fill: "none", stroke: ink, strokeWidth: 2.6, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  switch (badge) {
    case "best":
      return <polygon points={STAR} fill={ink} />;
    case "excellent":
      return <path d="M5 9.4h2.3v6.3H5zM8.4 9.4l2.3-4.6c1.1 0 1.8.8 1.6 1.9L12 9.4h2.9c.9 0 1.5.9 1.3 1.7l-1 3.7c-.2.6-.8 1-1.4 1H8.4z" fill={ink} />;
    case "good":
      return <polyline points="5.8,10.4 8.8,13.4 14.3,7.2" {...stroke} />;
    case "book":
      return <path d="M4.6 6.2c1.9-.7 3.7-.5 5.4.7 1.7-1.2 3.5-1.4 5.4-.7v8c-1.9-.6-3.7-.4-5.4.7-1.7-1.1-3.5-1.3-5.4-.7zM10 7.4v6.9" fill={ink} stroke={BADGE.book.color} strokeWidth={0.9} />;
    case "miss":
      return <path d="M6.8 6.8l6.4 6.4M13.2 6.8l-6.4 6.4" {...stroke} />;
    default:
      return null;
  }
}

export function BadgeIcon({ badge, size = 20, className }: { badge: Badge; size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} className={className} role="img" aria-label={BADGE[badge].label}>
      <circle cx="10" cy="10" r="10" fill={BADGE[badge].color} />
      <Glyph badge={badge} ink="#fff" />
    </svg>
  );
}
