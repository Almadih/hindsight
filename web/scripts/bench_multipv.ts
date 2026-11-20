// Times a full-game analysis with the web engine (Stockfish 19 lite single WASM) at a given depth for several MultiPV values.
// Mirrors web/lib/engine/pool.ts: Hash 16, movetime cap 5000, mate early stop, engines pull from a shared index.
// Run from web/: node --no-warnings scripts/bench_multipv.ts <game.pgn> [depth=14] [engines=1,6] [pvs=2,3] [rounds=2]
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { Chess } from "chess.js";
import { parseInfo } from "../lib/engine/uci.ts";

const [pgnPath, depthArg = "14", enginesArg = "1,6", pvsArg = "2,3", roundsArg = "2"] = process.argv.slice(2);
const DEPTH = Number(depthArg);
const MAX_MS = 5000;

class Engine {
  private proc: ChildProcess;
  private buf = "";
  private onLine: ((line: string) => void) | null = null;

  constructor(path: string) {
    this.proc = spawn(process.execPath, [path], { stdio: ["pipe", "pipe", "ignore"] });
    this.proc.stdout!.on("data", (chunk: Buffer) => {
      this.buf += chunk.toString();
      let i;
      while ((i = this.buf.indexOf("\n")) >= 0) {
        const line = this.buf.slice(0, i).trim();
        this.buf = this.buf.slice(i + 1);
        this.onLine?.(line);
      }
    });
  }

  private send(cmd: string) {
    this.proc.stdin!.write(cmd + "\n");
  }

  private until(prefix: string, cmds: string[], onLine?: (l: string) => void) {
    return new Promise<void>((resolve) => {
      this.onLine = (l) => {
        onLine?.(l);
        if (l.startsWith(prefix)) resolve();
      };
      cmds.forEach((c) => this.send(c));
    });
  }

  async init(multiPv: number) {
    await this.until("uciok", ["uci"]);
    await this.until("readyok", ["setoption name Hash value 16", `setoption name MultiPV value ${multiPv}`, "isready"]);
  }

  // Returns ms spent and whether the movetime cap (not depth) ended the search.
  async evaluate(fen: string) {
    let stopped = false;
    let maxDepth = 0;
    const t0 = performance.now();
    await this.until("bestmove", [`position fen ${fen}`, `go depth ${DEPTH} movetime ${MAX_MS}`], (line) => {
      const info = parseInfo(line);
      if (!info) return;
      if (info.multipv === 1) maxDepth = Math.max(maxDepth, info.depth);
      if (!stopped && info.multipv === 1 && info.mate !== undefined && info.depth >= 2 * Math.abs(info.mate)) {
        stopped = true;
        this.send("stop");
      }
    });
    return { ms: performance.now() - t0, capped: !stopped && maxDepth < DEPTH };
  }

  kill() {
    this.proc.kill();
  }
}

const chess = new Chess();
chess.loadPgn(readFileSync(pgnPath, "utf8"));
const replay = new Chess();
const fens = [replay.fen()];
for (const m of chess.history()) {
  replay.move(m);
  fens.push(replay.fen());
}
const enginePath = createRequire(import.meta.url)("stockfish").findEngine("lite-single");

async function run(multiPv: number, n: number) {
  // Fresh engines per run so no transposition table carries over between runs.
  const engines = Array.from({ length: n }, () => new Engine(enginePath));
  await Promise.all(engines.map((e) => e.init(multiPv)));
  const perPos: number[] = new Array(fens.length);
  let capped = 0;
  let next = 0;
  const t0 = performance.now();
  await Promise.all(
    engines.map(async (e) => {
      while (next < fens.length) {
        const i = next++;
        const r = await e.evaluate(fens[i]);
        perPos[i] = r.ms;
        if (r.capped) capped++;
      }
    }),
  );
  const total = (performance.now() - t0) / 1000;
  engines.forEach((e) => e.kill());
  const sorted = [...perPos].sort((a, b) => a - b);
  return { total, median: sorted[Math.floor(sorted.length / 2)], max: sorted[sorted.length - 1], capped };
}

console.log(`positions=${fens.length} depth=${DEPTH} movetime cap=${MAX_MS}ms`);
for (const n of enginesArg.split(",").map(Number)) {
  for (let round = 1; round <= Number(roundsArg); round++) {
    const pvs = pvsArg.split(",").map(Number);
    // Alternate order each round so warm-up/thermal effects don't favour one setting.
    for (const pv of round % 2 ? pvs : [...pvs].reverse()) {
      const r = await run(pv, n);
      console.log(`engines=${n} multipv=${pv} round=${round} total=${r.total.toFixed(1)}s median=${r.median.toFixed(0)}ms max=${r.max.toFixed(0)}ms capped=${r.capped}`);
    }
  }
}
