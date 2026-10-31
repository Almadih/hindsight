import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { Chess } from "chess.js";
import { parseInfo, type EngineLine } from "../../lib/engine/uci.ts";

const DEPTH = 16;
const MULTIPV = 3;
const MAX_MS = 3000;
const PV_MAX = 20;
const ENGINES = 4;

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

  async init() {
    await this.until("uciok", ["uci"]);
    await this.until("readyok", [`setoption name MultiPV value ${MULTIPV}`, "isready"]);
  }

  async evaluate(fen: string): Promise<EngineLine[]> {
    const byPv = new Map<number, EngineLine>();
    let stopped = false;
    await this.until("bestmove", [`position fen ${fen}`, `go depth ${DEPTH} movetime ${MAX_MS}`], (line) => {
      const info = parseInfo(line);
      if (!info) return;
      byPv.set(info.multipv, { uci: info.uci, cp: info.cp, mate: info.mate, pv: info.pv.slice(0, PV_MAX) });
      if (!stopped && info.multipv === 1 && info.mate !== undefined && info.depth >= 2 * Math.abs(info.mate)) {
        stopped = true;
        this.send("stop");
      }
    });
    return [...byPv.entries()].sort(([a], [b]) => a - b).map(([, l]) => l);
  }

  kill() {
    this.proc.kill();
  }
}

async function main() {
  const pgns = JSON.parse(readFileSync("/tmp/chesscom_samples/pgns.json", "utf8"));
  const enginePath = createRequire(import.meta.url)("stockfish").findEngine("lite-single");
  const engines = Array.from({ length: ENGINES }, () => new Engine(enginePath));
  await Promise.all(engines.map((e) => e.init()));

  const allEvals: Record<string, any[]> = {};
  for (const [gid, pgn] of Object.entries(pgns)) {
    const chess = new Chess();
    chess.loadPgn(pgn as string);
    const moves = chess.history({ verbose: true });
    const fens = [moves[0].before, ...moves.map((m) => m.after)];
    const evals = new Array(fens.length);
    let next = 0;
    const started = Date.now();
    await Promise.all(
      engines.map(async (e) => {
        while (next < fens.length) {
          const i = next++;
          evals[i] = { fen: fens[i], lines: await e.evaluate(fens[i]) };
        }
      })
    );
    allEvals[gid] = evals;
    console.log(`Evaluated ${evals.length} positions for ${gid} in ${((Date.now() - started) / 1000).toFixed(1)}s.`);
  }

  engines.forEach((e) => e.kill());
  writeFileSync("/tmp/chesscom_samples/evals.json", JSON.stringify(allEvals, null, 2));
  console.log("All evals written to /tmp/chesscom_samples/evals.json");
}

main().catch(console.error);
