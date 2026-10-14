import { BADGE } from "@/lib/review";
import type { Badge } from "@/lib/types";

const INK = "#141311";

// 5-point star centred in the 20×20 badge.
const STAR = Array.from({ length: 10 }, (_, i) => {
  const r = i % 2 ? 2.7 : 6;
  const a = (Math.PI / 5) * i - Math.PI / 2;
  return `${(10 + r * Math.cos(a)).toFixed(2)},${(10.4 + r * Math.sin(a)).toFixed(2)}`;
}).join(" ");

const NOTATION: Partial<Record<Badge, string>> = {
  brilliant: "!!",
  great: "!",
  inaccuracy: "?!",
  mistake: "?",
  blunder: "??",
};

function Glyph({ badge }: { badge: Badge }) {
  const text = NOTATION[badge];
  if (text) {
    return (
      <text x="10" y="10.6" textAnchor="middle" dominantBaseline="central" fill={INK} fontSize={text.length > 1 ? 9.5 : 12} fontWeight={800} letterSpacing="-0.5">
        {text}
      </text>
    );
  }
  const stroke = { fill: "none", stroke: INK, strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  switch (badge) {
    case "best":
      return <polygon points={STAR} fill={INK} />;
    case "excellent":
      return <path d="M5.5 9.5h2v6h-2zM9 9.5l2-4.2c1 0 1.6.7 1.4 1.7L12 9.5h2.6c.8 0 1.4.8 1.2 1.6l-.9 3.4c-.2.6-.7 1-1.3 1H9z" fill={INK} />;
    case "good":
      return <polyline points="6,10.4 8.9,13.3 14.2,7.4" {...stroke} />;
    case "book":
      return (
        <>
          <path d="M4.8 6.4c1.9-.6 3.6-.4 5.2.7 1.6-1.1 3.3-1.3 5.2-.7v7.8c-1.9-.6-3.6-.4-5.2.7-1.6-1.1-3.3-1.3-5.2-.7z" fill={INK} />
          <path d="M10 7.3v7.4" stroke={BADGE.book.color} strokeWidth={1} />
        </>
      );
    case "miss":
      return <path d="M7 7l6 6M13 7l-6 6" {...stroke} />;
    default:
      return null;
  }
}

export function BadgeIcon({ badge, size = 20, className }: { badge: Badge; size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} className={className} role="img" aria-label={BADGE[badge].label}>
      <circle cx="10" cy="10" r="10" fill={BADGE[badge].color} />
      <Glyph badge={badge} />
    </svg>
  );
}
