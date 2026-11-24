// Benchmarks Stockfish analysis optimizations (Before vs After production analyzePositions)
// across 3 representative games, depths (Quick/Standard/Deep), concurrency (1 & 4),
// cold vs warm pool, and backend classification/Elo parity.
//
// Run from web/:
//   node --no-warnings scripts/bench_optimization.ts
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { Chess } from "chess.js";
import {
  analyzePositions,
  fenDedupKey,
  legalUcis,
  type EnginePool,
  type PositionEval,
  type SearchOptions,
} from "../lib/engine/pool.ts";
import { parseInfo, type EngineLine } from "../lib/engine/uci.ts";

const MAX_MS = 5000;
const PV_MAX = 20;
const ROUNDS = 2;

const GAMES = [
  { name: "short", label: "Short (35p, 1 forced)", path: "../promo/games/brilliants.clean.pgn" },
  { name: "medium", label: "Medium (84p, 1 forced, mate)", path: "../promo/games/rPBjddY7.pgn" },
  { name: "long", label: "Long (110p, 7 dups, mate)", path: "../promo/games/XPz027nS.pgn" },
] as const;

type PosTiming = {
  ms: number;
  capped: boolean;
  isPass2: boolean;
};

type WorkBreakdown = {
  totalPositions: number;
  terminalOrInsuff: number;
  forcedDerived: number;
  dedupSkipped: number;
  pass1Searched: number;
  pass2Candidates: number;
};

type RunMetrics = {
  totalSec: number;
  medianMs: number;
  p95Ms: number;
  maxMs: number;
  cappedHits: number;
  breakdown: WorkBreakdown;
  evals: PositionEval[];
};

const enginePath: string = createRequire(import.meta.url)("stockfish").findEngine("lite-single");

function loadGameFens(pgnPath: string): { pgn: string; fens: string[] } {
  const pgn = readFileSync(path.resolve(pgnPath), "utf8");
  const chess = new Chess();
  chess.loadPgn(pgn);
  const replay = new Chess();
  const fens = [replay.fen()];
  for (const m of chess.history()) {
    replay.move(m);
    fens.push(replay.fen());
  }
  return { pgn, fens };
}

function countPreclassified(fens: string[]): { terminalOrInsuff: number; forcedDerived: number; dedupSkipped: number } {
  let terminalOrInsuff = 0;
  let forcedDerived = 0;
  let dedupSkipped = 0;
  const seen = new Set<string>();
  for (let i = 0; i < fens.length; i++) {
    const chess = new Chess(fens[i]);
    if (chess.isCheckmate() || chess.isStalemate() || chess.isInsufficientMaterial()) {
      terminalOrInsuff++;
      continue;
    }
    if (i < fens.length - 1 && legalUcis(chess).length === 1) {
      forcedDerived++;
      continue;
    }
    const key = fenDedupKey(fens[i]);
    if (key) {
      if (seen.has(key)) {
        dedupSkipped++;
        continue;
      }
      seen.add(key);
    }
  }
  return { terminalOrInsuff, forcedDerived, dedupSkipped };
}

class NodeStockfishWorker {
  private proc: ChildProcess;
  private buf = "";
  private onLine: ((line: string) => void) | null = null;
  private dead = false;
  initialized = false;
  private currentMultiPv: number | null = null;

  constructor() {
    this.proc = spawn(process.execPath, [enginePath], { stdio: ["pipe", "pipe", "ignore"] });
    this.proc.stdout!.on("data", (chunk: Buffer) => {
      this.buf += chunk.toString();
      let i: number;
      while ((i = this.buf.indexOf("\n")) >= 0) {
        const line = this.buf.slice(0, i).trim();
        this.buf = this.buf.slice(i + 1);
        if (line) this.onLine?.(line);
      }
    });
  }

  send(cmd: string) {
    if (!this.dead) this.proc.stdin!.write(cmd + "\n");
  }

  until(prefix: string, cmds: string[], onLine?: (l: string) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.dead) return reject(new Error("Worker terminated"));
      this.onLine = (l) => {
        onLine?.(l);
        if (l.startsWith(prefix)) {
          this.onLine = null;
          resolve();
        }
      };
      cmds.forEach((c) => this.send(c));
    });
  }

  async ensureReady(multiPv: number) {
    if (!this.initialized) {
      await this.until("uciok", ["uci"]);
      await this.until("readyok", [
        "setoption name Hash value 16",
        `setoption name MultiPV value ${multiPv}`,
        "isready",
      ]);
      this.initialized = true;
      this.currentMultiPv = multiPv;
    } else if (this.currentMultiPv !== multiPv) {
      await this.until("readyok", [`setoption name MultiPV value ${multiPv}`, "isready"]);
      this.currentMultiPv = multiPv;
    }
  }

  async clear() {
    if (!this.initialized) return;
    await this.until("readyok", ["ucinewgame", "isready"]);
  }

  async evaluateBefore(fen: string, depth: number): Promise<{ lines: EngineLine[]; timing: PosTiming }> {
    await this.ensureReady(2);
    const byPv = new Map<number, EngineLine>();
    let stopped = false;
    let maxDepth = 0;
    const t0 = performance.now();
    await this.until("bestmove", [`position fen ${fen}`, `go depth ${depth} movetime ${MAX_MS}`], (line) => {
      const info = parseInfo(line);
      if (!info) return;
      if (info.multipv === 1) maxDepth = Math.max(maxDepth, info.depth);
      byPv.set(info.multipv, { uci: info.uci, cp: info.cp, mate: info.mate, pv: info.pv.slice(0, PV_MAX) });
      if (!stopped && info.multipv === 1 && info.mate !== undefined && info.depth >= 2 * Math.abs(info.mate)) {
        stopped = true;
        this.send("stop");
      }
    });
    const ms = performance.now() - t0;
    const lines = [...byPv.entries()].sort(([a], [b]) => a - b).map(([, l]) => l);
    return { lines, timing: { ms, capped: !stopped && maxDepth < depth, isPass2: false } };
  }

  async searchAfter(fen: string, opts: SearchOptions): Promise<{ lines: EngineLine[]; timing: PosTiming }> {
    await this.ensureReady(opts.multiPv);
    const byPv = new Map<number, EngineLine>();
    let stopped = false;
    let maxDepth = 0;
    const parts = [`go depth ${opts.depth}`];
    if (opts.nodes !== undefined) parts.push(`nodes ${opts.nodes}`);
    parts.push(`movetime ${opts.movetimeMs}`);
    if (opts.searchmoves?.length) parts.push(`searchmoves ${opts.searchmoves.join(" ")}`);

    const t0 = performance.now();
    await this.until("bestmove", [`position fen ${fen}`, parts.join(" ")], (line) => {
      const info = parseInfo(line);
      if (!info) return;
      if (info.multipv === 1) maxDepth = Math.max(maxDepth, info.depth);
      byPv.set(info.multipv, { uci: info.uci, cp: info.cp, mate: info.mate, pv: info.pv.slice(0, PV_MAX) });
      if (
        !stopped &&
        info.multipv === 1 &&
        info.mate !== undefined &&
        info.depth >= Math.min(2 * Math.abs(info.mate), 10)
      ) {
        stopped = true;
        this.send("stop");
      }
    });
    const ms = performance.now() - t0;
    const lines = [...byPv.entries()].sort(([a], [b]) => a - b).map(([, l]) => l);
    return {
      lines,
      timing: {
        ms,
        capped: !stopped && maxDepth < opts.depth && ms >= opts.movetimeMs - 50,
        isPass2: Boolean(opts.searchmoves?.length),
      },
    };
  }

  kill() {
    this.dead = true;
    this.proc.kill();
  }
}

class NodeEnginePool implements EnginePool {
  readonly workerCount: number;
  private workers: NodeStockfishWorker[];
  private queue: Promise<void> = Promise.resolve();
  timings: PosTiming[] = [];

  constructor(workerCount: number) {
    this.workerCount = workerCount;
    this.workers = Array.from({ length: workerCount }, () => new NodeStockfishWorker());
  }

  resetTimings() {
    this.timings = [];
  }

  runExclusive<T>(body: () => Promise<T>): Promise<T> {
    const next = this.queue.then(body, body);
    this.queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  async clearAll(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.clear()));
  }

  async search(workerId: number, fen: string, opts: SearchOptions): Promise<EngineLine[]> {
    const w = this.workers[workerId];
    if (!w) throw new Error(`Worker ${workerId} unavailable`);
    const res = await w.searchAfter(fen, opts);
    this.timings.push(res.timing);
    return res.lines;
  }

  stopAll(): void {
    for (const w of this.workers) w.send("stop");
  }

  dispose(): void {
    for (const w of this.workers) w.kill();
  }
}

function summarizeTimings(timings: PosTiming[]): { medianMs: number; p95Ms: number; maxMs: number; cappedHits: number } {
  if (timings.length === 0) return { medianMs: 0, p95Ms: 0, maxMs: 0, cappedHits: 0 };
  const sorted = timings.map((t) => t.ms).sort((a, b) => a - b);
  const medianMs = sorted[Math.floor(sorted.length / 2)];
  const p95Ms = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
  const maxMs = sorted[sorted.length - 1];
  const cappedHits = timings.filter((t) => t.capped).length;
  return { medianMs, p95Ms, maxMs, cappedHits };
}

/** Pre-optimization baseline: cold workers, 1-by-1 stealing, MultiPV=2 everywhere, no caps/skips. */
async function runBefore(fens: string[], depth: number, concurrency: number): Promise<RunMetrics> {
  const size = Math.max(1, Math.min(concurrency, fens.length));
  const t0 = performance.now();
  const workers = Array.from({ length: size }, () => new NodeStockfishWorker());
  const evals: PositionEval[] = new Array(fens.length);
  const timings: PosTiming[] = new Array(fens.length);
  let next = 0;

  try {
    await Promise.all(
      workers.map(async (w) => {
        await w.ensureReady(2);
        while (next < fens.length) {
          const i = next++;
          const r = await w.evaluateBefore(fens[i], depth);
          evals[i] = { fen: fens[i], lines: r.lines };
          timings[i] = r.timing;
        }
      }),
    );
  } finally {
    workers.forEach((w) => w.kill());
  }

  const totalSec = (performance.now() - t0) / 1000;
  return {
    totalSec,
    ...summarizeTimings(timings),
    breakdown: {
      totalPositions: fens.length,
      terminalOrInsuff: 0,
      forcedDerived: 0,
      dedupSkipped: 0,
      pass1Searched: fens.length,
      pass2Candidates: fens.length,
    },
    evals,
  };
}

/** Production analyzePositions driven via NodeEnginePool. */
async function runAfter(
  fens: string[],
  depth: number,
  concurrency: number,
  existingPool?: NodeEnginePool,
): Promise<RunMetrics> {
  const size = Math.max(1, Math.min(concurrency, fens.length));
  const pre = countPreclassified(fens);
  const t0 = performance.now();
  const pool = existingPool ?? new NodeEnginePool(size);
  pool.resetTimings();
  try {
    const evals = await analyzePositions(fens, { depth, multiPv: 2, concurrency: size, pool });
    const totalSec = (performance.now() - t0) / 1000;
    const pass1Searched = pool.timings.filter((t) => !t.isPass2).length;
    const pass2Candidates = pool.timings.filter((t) => t.isPass2).length;
    return {
      totalSec,
      ...summarizeTimings(pool.timings),
      breakdown: {
        totalPositions: fens.length,
        ...pre,
        pass1Searched,
        pass2Candidates,
      },
      evals,
    };
  } finally {
    if (!existingPool) pool.dispose();
  }
}

type ParityReport = {
  whiteAccBefore: number;
  whiteAccAfter: number;
  blackAccBefore: number;
  blackAccAfter: number;
  whiteEloBefore: number | null;
  whiteEloAfter: number | null;
  blackEloBefore: number | null;
  blackEloAfter: number | null;
  totalMoves: number;
  identicalBadges: number;
  agreementPct: number;
  diffs: Array<{
    ply: number;
    san: string;
    before: string;
    after: string;
    wBeforeB: number;
    wBeforeA: number;
    wAfterB: number;
    wAfterA: number;
  }>;
};

function checkParity(pgn: string, beforeEvals: PositionEval[], afterEvals: PositionEval[]): ParityReport {
  const py = path.resolve("../api/.venv/bin/python");
  const script = `
import json, sys
from review.analyze import PositionEval, analyze, parse_game

payload = json.load(sys.stdin)
parsed = parse_game(payload["pgn"])
b_evals = [PositionEval(**e) for e in payload["before"]]
a_evals = [PositionEval(**e) for e in payload["after"]]

rb = analyze(parsed, evals=b_evals)
ra = analyze(parsed, evals=a_evals)

diffs = []
identical = 0
for mb, ma in zip(rb["moves"], ra["moves"]):
    if mb["badge"] == ma["badge"]:
        identical += 1
    else:
        diffs.append({
            "ply": mb["ply"],
            "san": mb["san"],
            "before": mb["badge"],
            "after": ma["badge"],
            "wBeforeB": mb["wBefore"],
            "wBeforeA": ma["wBefore"],
            "wAfterB": mb["wAfter"],
            "wAfterA": ma["wAfter"],
        })

total = len(rb["moves"])
print(json.dumps({
    "whiteAccBefore": rb["accuracy"]["white"],
    "whiteAccAfter": ra["accuracy"]["white"],
    "blackAccBefore": rb["accuracy"]["black"],
    "blackAccAfter": ra["accuracy"]["black"],
    "whiteEloBefore": rb["elo"]["white"],
    "whiteEloAfter": ra["elo"]["white"],
    "blackEloBefore": rb["elo"]["black"],
    "blackEloAfter": ra["elo"]["black"],
    "totalMoves": total,
    "identicalBadges": identical,
    "agreementPct": round(100.0 * identical / total, 2) if total else 100.0,
    "diffs": diffs,
}))
`;
  const res = spawnSync(py, ["-c", script], {
    input: JSON.stringify({ pgn, before: beforeEvals, after: afterEvals }),
    env: { ...process.env, PYTHONPATH: path.resolve("../api/src") },
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  if (res.status !== 0) {
    throw new Error(`Python parity check failed (status=${res.status}): ${res.stderr}`);
  }
  return JSON.parse(res.stdout.trim()) as ParityReport;
}

function avg(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function fmtSummary(label: string, beforeRuns: RunMetrics[], afterRuns: RunMetrics[]) {
  const bSec = avg(beforeRuns.map((r) => r.totalSec));
  const aSec = avg(afterRuns.map((r) => r.totalSec));
  const speedup = bSec / aSec;
  const pctRed = ((bSec - aSec) / bSec) * 100;
  const aMed = avg(afterRuns.map((r) => r.medianMs));
  const aP95 = avg(afterRuns.map((r) => r.p95Ms));
  const aMax = Math.max(...afterRuns.map((r) => r.maxMs));
  const bMed = avg(beforeRuns.map((r) => r.medianMs));
  const bP95 = avg(beforeRuns.map((r) => r.p95Ms));
  const bMax = Math.max(...beforeRuns.map((r) => r.maxMs));
  const bCap = beforeRuns.map((r) => r.cappedHits).join("/");
  const aCap = afterRuns.map((r) => r.cappedHits).join("/");
  const bd = afterRuns[0].breakdown;
  const p2Pct = ((bd.pass2Candidates / Math.max(1, bd.totalPositions - 1)) * 100).toFixed(1);
  console.log(
    `${label} | Before=${bSec.toFixed(2)}s (med=${bMed.toFixed(0)}ms p95=${bP95.toFixed(0)}ms max=${bMax.toFixed(0)}ms cap=${bCap}) | ` +
      `After=${aSec.toFixed(2)}s (med=${aMed.toFixed(0)}ms p95=${aP95.toFixed(0)}ms max=${aMax.toFixed(0)}ms cap=${aCap}) | ` +
      `${speedup.toFixed(2)}x (-${pctRed.toFixed(1)}%) | ` +
      `plies=${bd.totalPositions} term=${bd.terminalOrInsuff} forced=${bd.forcedDerived} dedup=${bd.dedupSkipped} p1=${bd.pass1Searched} p2=${bd.pass2Candidates}(${p2Pct}%)`,
  );
}

async function runAlternating(fens: string[], depth: number, concurrency: number) {
  const beforeRuns: RunMetrics[] = [];
  const afterRuns: RunMetrics[] = [];
  for (let round = 1; round <= ROUNDS; round++) {
    if (round % 2 === 1) {
      beforeRuns.push(await runBefore(fens, depth, concurrency));
      afterRuns.push(await runAfter(fens, depth, concurrency));
    } else {
      afterRuns.push(await runAfter(fens, depth, concurrency));
      beforeRuns.push(await runBefore(fens, depth, concurrency));
    }
  }
  return { beforeRuns, afterRuns };
}

async function main() {
  const parityOnly = process.argv.includes("--parity-only");
  const loaded = GAMES.map((g) => ({ ...g, ...loadGameFens(g.path) }));
  console.log(`Engine: ${enginePath} (Hash=16, rounds=${ROUNDS}, alternating before/after)\n`);

  if (parityOnly) {
    console.log("=== Quality / Classification Parity (Standard d16 -> api/src/review/analyze.py) ===");
    for (const g of loaded) {
      const before = await runBefore(g.fens, 16, 4);
      const after = await runAfter(g.fens, 16, 4);
      const p = checkParity(g.pgn, before.evals, after.evals);
      console.log(
        `${g.name} (${g.label}): ` +
          `W_acc=${p.whiteAccBefore}->${p.whiteAccAfter} (${(p.whiteAccAfter - p.whiteAccBefore).toFixed(2)}), ` +
          `B_acc=${p.blackAccBefore}->${p.blackAccAfter} (${(p.blackAccAfter - p.blackAccBefore).toFixed(2)}), ` +
          `W_elo=${p.whiteEloBefore}->${p.whiteEloAfter}, B_elo=${p.blackEloBefore}->${p.blackEloAfter}, ` +
          `badges=${p.identicalBadges}/${p.totalMoves} (${p.agreementPct}%)`,
      );
      for (const d of p.diffs) {
        console.log(
          `  diff ply ${d.ply} (${d.san}): ${d.before} -> ${d.after} ` +
            `(wBefore: ${d.wBeforeB}->${d.wBeforeA}, wAfter: ${d.wAfterB}->${d.wAfterA})`,
        );
      }
    }
    return;
  }

  console.log("=== 1. Standard (depth=16), concurrency=4 across 3 games ===");
  const parityInputs: Array<{ name: string; label: string; pgn: string; before: PositionEval[]; after: PositionEval[] }> = [];
  let medD16C4: { beforeRuns: RunMetrics[]; afterRuns: RunMetrics[] } | null = null;
  for (const g of loaded) {
    const res = await runAlternating(g.fens, 16, 4);
    fmtSummary(`${g.name.padEnd(7)} d16 c4`, res.beforeRuns, res.afterRuns);
    parityInputs.push({
      name: g.name,
      label: g.label,
      pgn: g.pgn,
      before: res.beforeRuns[0].evals,
      after: res.afterRuns[0].evals,
    });
    if (g.name === "medium") medD16C4 = res;
  }

  console.log("\n=== 2. Medium game (84p) concurrency=1 vs concurrency=4 (depth=16) ===");
  const med = loaded.find((g) => g.name === "medium")!;
  const medD16C1 = await runAlternating(med.fens, 16, 1);
  fmtSummary("medium  d16 c1", medD16C1.beforeRuns, medD16C1.afterRuns);
  if (medD16C4) fmtSummary("medium  d16 c4", medD16C4.beforeRuns, medD16C4.afterRuns);

  console.log("\n=== 3. Medium game (84p) across Quick (d14), Standard (d16), Deep (d18), concurrency=4 ===");
  const medD14C4 = await runAlternating(med.fens, 14, 4);
  fmtSummary("medium  d14 c4", medD14C4.beforeRuns, medD14C4.afterRuns);
  if (medD16C4) fmtSummary("medium  d16 c4", medD16C4.beforeRuns, medD16C4.afterRuns);
  const medD18C4 = await runAlternating(med.fens, 18, 4);
  fmtSummary("medium  d18 c4", medD18C4.beforeRuns, medD18C4.afterRuns);

  console.log("\n=== 4. Cold pool vs Warm pool (Medium game d16 c4) ===");
  const coldTimes: number[] = [];
  const warmTimes: number[] = [];
  for (let round = 1; round <= ROUNDS; round++) {
    const pool = new NodeEnginePool(4);
    try {
      const cold = await runAfter(med.fens, 16, 4, pool);
      const warm = await runAfter(med.fens, 16, 4, pool);
      coldTimes.push(cold.totalSec);
      warmTimes.push(warm.totalSec);
      console.log(
        `round=${round}: cold=${cold.totalSec.toFixed(2)}s (med=${cold.medianMs.toFixed(0)}ms) | ` +
          `warm=${warm.totalSec.toFixed(2)}s (med=${warm.medianMs.toFixed(0)}ms) | ` +
          `saved=${(cold.totalSec - warm.totalSec).toFixed(2)}s`,
      );
    } finally {
      pool.dispose();
    }
  }
  console.log(
    `avg: cold=${avg(coldTimes).toFixed(2)}s | warm=${avg(warmTimes).toFixed(2)}s | ` +
      `warm speedup=${(avg(coldTimes) / avg(warmTimes)).toFixed(2)}x`,
  );

  console.log("\n=== 5. Quality / Classification Parity (Standard d16 -> api/src/review/analyze.py) ===");
  for (const item of parityInputs) {
    const p = checkParity(item.pgn, item.before, item.after);
    console.log(
      `${item.name} (${item.label}): ` +
        `W_acc=${p.whiteAccBefore}->${p.whiteAccAfter} (${(p.whiteAccAfter - p.whiteAccBefore).toFixed(2)}), ` +
        `B_acc=${p.blackAccBefore}->${p.blackAccAfter} (${(p.blackAccAfter - p.blackAccBefore).toFixed(2)}), ` +
        `W_elo=${p.whiteEloBefore}->${p.whiteEloAfter}, B_elo=${p.blackEloBefore}->${p.blackEloAfter}, ` +
        `badges=${p.identicalBadges}/${p.totalMoves} (${p.agreementPct}%)`,
    );
    for (const d of p.diffs) {
      console.log(
        `  diff ply ${d.ply} (${d.san}): ${d.before} -> ${d.after} ` +
          `(wBefore: ${d.wBeforeB}->${d.wBeforeA}, wAfter: ${d.wAfterB}->${d.wAfterA})`,
      );
    }
  }
}

await main();
