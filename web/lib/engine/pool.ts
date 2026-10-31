import { parseInfo, type EngineLine } from "./uci";
import { hasWasmSimd } from "./simd";

export type PositionEval = { fen: string; lines: EngineLine[] };

export type AnalysisQuality = "quick" | "standard" | "deep";

export const QUALITY_DEPTH: Record<AnalysisQuality, number> = {
  quick: 14,
  standard: 16,
  deep: 18,
};

const SIMD_ENGINE_URL = "/stockfish/stockfish-19-lite-single.js";
const ASM_ENGINE_URL = "/stockfish/stockfish-19-asm.js";
const PV_MAX = 20; // the API caps PVs at 40 moves
const MAX_MS = 5000; // per-position backstop; typical positions finish in 0.1–2s at depth 16

/** One single-threaded Stockfish web worker, driven one command/response at a time. */
class Engine {
  private worker: Worker;
  private onLine: ((line: string) => void) | null = null;
  private fail: ((err: unknown) => void) | null = null;
  private earlyError: Error | null = null;

  constructor(engineUrl: string = SIMD_ENGINE_URL) {
    this.worker = new Worker(engineUrl);
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
    await this.until("readyok", [
      `setoption name MultiPV value ${multiPv}`,
      "setoption name Hash value 16",
      "isready",
    ]);
  }

  async evaluate(fen: string, depth: number): Promise<EngineLine[]> {
    const byPv = new Map<number, EngineLine>();
    let stopped = false;
    await this.until("bestmove", [`position fen ${fen}`, `go depth ${depth} movetime ${MAX_MS}`], (line) => {
      const info = parseInfo(line);
      if (!info) return;
      byPv.set(info.multipv, { uci: info.uci, cp: info.cp, mate: info.mate, pv: info.pv.slice(0, PV_MAX) });
      // Once PV1 is a mate the search has fully seen, more depth only burns time on lines 2–3
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

/** Determines optimal worker concurrency based on device cores and platform. */
export function recommendedConcurrency(fensCount: number): number {
  if (typeof navigator === "undefined") return 2;
  const hc = navigator.hardwareConcurrency || 2;
  const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  // Mobile devices frequently throttle down reported cores to 2 or 4.
  // 2-3 workers is optimal for mobile battery/heat balance while staying 2x faster than 1 thread.
  const cap = isMobile ? Math.min(3, Math.max(2, hc)) : Math.min(6, Math.max(2, hc - 1));
  return Math.max(1, Math.min(cap, fensCount));
}

/** Evaluate every position across a tuned worker pool. Results keep the input order. */
export async function analyzePositions(
  fens: string[],
  opts: {
    depth?: number;
    quality?: AnalysisQuality;
    multiPv?: number;
    concurrency?: number;
    onProgress?: (done: number, total: number) => void;
    /** Each position as it finishes; workers finish out of order. */
    onPosition?: (index: number, ev: PositionEval) => void;
    signal?: AbortSignal;
  } = {},
): Promise<PositionEval[]> {
  const depth = opts.depth ?? (opts.quality ? QUALITY_DEPTH[opts.quality] : QUALITY_DEPTH.standard);
  const { multiPv = 3, onProgress, onPosition, signal } = opts;
  signal?.throwIfAborted();

  const isSimd = await hasWasmSimd();
  const engineUrl = isSimd ? SIMD_ENGINE_URL : ASM_ENGINE_URL;

  const size = opts.concurrency ?? recommendedConcurrency(fens.length);
  const engines = Array.from({ length: size }, () => new Engine(engineUrl));
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
