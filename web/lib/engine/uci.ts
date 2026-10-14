export type EngineLine = { uci: string; cp?: number; mate?: number; pv: string[] };
export type InfoLine = EngineLine & { multipv: number; depth: number };

/** Parse a UCI `info` line with a score and PV. Scores are from the side to move's perspective. */
export function parseInfo(line: string): InfoLine | null {
  // Bound scores come from aspiration-window fail highs/lows and aren't final.
  if (!line.startsWith("info ") || line.includes(" lowerbound") || line.includes(" upperbound")) return null;
  const t = line.split(" ");
  const pvAt = t.indexOf("pv");
  const scoreAt = t.indexOf("score");
  if (pvAt < 0 || scoreAt < 0) return null;
  const after = (key: string) => {
    const i = t.indexOf(key);
    return i < 0 ? undefined : Number(t[i + 1]);
  };
  const pv = t.slice(pvAt + 1);
  const value = Number(t[scoreAt + 2]);
  return {
    multipv: after("multipv") ?? 1,
    depth: after("depth") ?? 0,
    uci: pv[0],
    pv,
    ...(t[scoreAt + 1] === "mate" ? { mate: value } : { cp: value }),
  };
}
