import { parseInfo, type EngineLine } from "./uci";

export type PositionEval = { fen: string; lines: EngineLine[] };

const ENGINE_URL = "/stockfish/stockfish-19-lite-single.js";
const PV_MAX = 20; // the API caps PVs at 40 moves
const MAX_MS = 5000; // per-position backstop; typical positions finish in 0.1–2s at depth 16

/** One single-threaded Stockfish web worker, driven one command/response at a time. */
class Engine {
  private worker = new Worker(ENGINE_URL);
  private onLine: ((line: string) => void) | null = null;
  private fail: ((err: unknown) => void) | null = null;
  private earlyError: Error | null = null;

  constructor() {
    this.worker.onmessage = (e) => this.onLine?.(String(e.data));
    this.worker.onerror = (e) => {
      const err = new Error(e.message || "Stockfish failed to load");
      this.earlyError = err;
      this.fail?.(err);
    };
  }

  private until(prefix: string, send: string[], onLine?: (line: string) => void, timeoutMs = 15000) {
    return new Promise<void>((resolve, reject) => {
      if (this.earlyError) return reject(this.earlyError);
      let timer: ReturnType<typeof setTimeout> | undefined;
      if (timeoutMs) {
        timer = setTimeout(() => {
          this.fail = null;
          this.onLine = null;
          reject(new Error(`Stockfish timed out waiting for ${prefix}`));
        }, timeoutMs);
      }
      this.fail = (err) => {
        clearTimeout(timer);
        reject(err);
      };
      this.onLine = (line) => {
        onLine?.(line);
        if (line.startsWith(prefix)) {
          clearTimeout(timer);
          resolve();
        }
      };
      send.forEach((cmd) => this.worker.postMessage(cmd));
    });
  }

  async init(multiPv: number) {
    await this.until("uciok", ["uci"]);
    await this.until("readyok", [`setoption name MultiPV value ${multiPv}`, "isready"]);
  }

  async evaluate(fen: string, depth: number): Promise<EngineLine[]> {
    const byPv = new Map<number, EngineLine>();
    let stopped = false;
    await this.until("bestmove", [`position fen ${fen}`, `go depth ${depth} movetime ${MAX_MS}`], (line) => {
      const info = parseInfo(line);
      if (!info) return;
      byPv.set(info.multipv, { uci: info.uci, cp: info.cp, mate: info.mate, pv: info.pv.slice(0, PV_MAX) });
      // Once PV1 is a mate the search has fully seen, more depth only burns time on lines 2–3
      // (a mate-in-1 position took ~28s to reach depth 16 with MultiPV 3).
      if (!stopped && info.multipv === 1 && info.mate !== undefined && info.depth >= 2 * Math.abs(info.mate)) {
        stopped = true;
        this.worker.postMessage("stop");
      }
    });
    // Game-over positions report no PV, so they come back with no lines; the API scores those itself.
    return [...byPv.entries()].sort(([a], [b]) => a - b).map(([, line]) => line);
  }

  terminate(reason: unknown) {
    this.worker.terminate();
    this.fail?.(reason);
  }
}

/** Evaluate every position across a small worker pool. Results keep the input order. */
export async function analyzePositions(
  fens: string[],
  opts: {
    depth?: number;
    multiPv?: number;
    onProgress?: (done: number, total: number) => void;
    /** Each position as it finishes; workers finish out of order. */
    onPosition?: (index: number, ev: PositionEval) => void;
    signal?: AbortSignal;
  } = {},
): Promise<PositionEval[]> {
  const { depth = 16, multiPv = 3, onProgress, onPosition, signal } = opts;
  signal?.throwIfAborted();
  const size = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1, fens.length));
  const engines = Array.from({ length: size }, () => new Engine());
  const stop = () => engines.forEach((e) => e.terminate(signal?.reason ?? new Error("analysis stopped")));
  signal?.addEventListener("abort", stop);

  const results: PositionEval[] = new Array(fens.length);
  let next = 0;
  let done = 0;
  try {
    await Promise.all(
      engines.map(async (engine) => {
        await engine.init(multiPv);
        while (next < fens.length) {
          const i = next++;
          results[i] = { fen: fens[i], lines: await engine.evaluate(fens[i], depth) };
          onPosition?.(i, results[i]);
          onProgress?.(++done, fens.length);
        }
      }),
    );
    return results;
  } finally {
    signal?.removeEventListener("abort", stop);
    stop();
  }
}
