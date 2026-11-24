import { Chess } from "chess.js";
import { parseInfo, type EngineLine } from "./uci.ts";
import { hasWasmSimd } from "./simd.ts";

export type PositionEval = { fen: string; lines: EngineLine[] };

export type AnalysisQuality = "quick" | "standard" | "deep";

export const QUALITY_DEPTH: Record<AnalysisQuality, number> = {
  quick: 14,
  standard: 16,
  deep: 18,
};

/** Read saved analysis quality safely; falls back to "standard" if storage is blocked or invalid. */
export function readQuality(): AnalysisQuality {
  if (typeof window === "undefined") return "standard";
  try {
    const v = localStorage.getItem("hindsight_quality");
    return v && v in QUALITY_DEPTH ? (v as AnalysisQuality) : "standard";
  } catch {
    return "standard";
  }
}

const SIMD_ENGINE_URL = "/stockfish/stockfish-19-lite-single.js";
const ASM_ENGINE_URL = "/stockfish/stockfish-19-asm.js";
const PV_MAX = 20; // the API caps PVs at 40 moves
const MAX_MS = 5000; // per-position backstop; typical positions finish in 0.1–2s at depth 16
const PV2_DEPTH = 12;
const PV2_NODES = 40_000;
const TILE_SIZE = 4; // 4 contiguous plies/tile balances local TT reuse and load balance across workers
const MATE_CP = 10_000;
const HUMAN_MATE = 3;
const LONG_MATE_CP = 1000;

export type SearchOptions = {
  depth: number;
  nodes?: number;
  movetimeMs: number;
  multiPv: number;
  searchmoves?: string[];
};

/** Abstract pool interface so analyzePositions can be driven by Web Workers, Node child processes, or fakes. */
export interface EnginePool {
  readonly workerCount: number;
  runExclusive<T>(body: () => Promise<T>): Promise<T>;
  clearAll(): Promise<void>;
  search(workerId: number, fen: string, opts: SearchOptions): Promise<EngineLine[]>;
  stopAll(): void;
}

function pass1Nodes(depth: number): number | undefined {
  return depth <= 14 ? 150_000 : depth <= 16 ? 400_000 : undefined;
}

function scoreToCp(cp: number | undefined, mate: number | undefined): number {
  if (mate !== undefined) {
    if (mate === 0) return -MATE_CP;
    return mate > 0 ? MATE_CP - 10 * mate : -(MATE_CP - 10 * Math.abs(mate));
  }
  return cp ?? 0;
}

function perceivedCp(cp: number | undefined, mate: number | undefined): number {
  if (mate !== undefined && Math.abs(mate) > HUMAN_MATE) {
    return mate > 0 ? LONG_MATE_CP : -LONG_MATE_CP;
  }
  return scoreToCp(cp, mate);
}

function winPct(cp: number): number {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

/** All legal moves in standard UCI notation (preserving castling and expanding promotions). */
export function legalUcis(chess: Chess): string[] {
  return chess.moves({ verbose: true }).map((m) => m.from + m.to + (m.promotion ?? ""));
}

/** 4-field FEN cache key when halfmove clock < 80 (safe from 50-move rule effects), else null. */
export function fenDedupKey(fen: string): string | null {
  const parts = fen.trim().split(/\s+/);
  if (parts.length < 5 || !/^\d+$/.test(parts[4])) return null;
  const halfmoves = Number(parts[4]);
  if (halfmoves >= 80) return null;
  return `${parts[0]} ${parts[1]} ${parts[2]} ${parts[3]}`;
}

/** Derives a forced position's eval from the child position reached by playing its only legal move. */
export function deriveForcedEval(
  fen: string,
  forcedUci: string,
  childEval: PositionEval,
  { childCheckmate, childDraw }: { childCheckmate: boolean; childDraw: boolean },
): PositionEval {
  const child = childEval.lines[0];
  const pv = [forcedUci, ...(child ? child.pv : [])].slice(0, PV_MAX);
  if (childCheckmate) {
    return { fen, lines: [{ uci: forcedUci, mate: 1, pv }] };
  }
  if (childDraw || !child) {
    return { fen, lines: [{ uci: forcedUci, cp: 0, pv }] };
  }
  if (child.mate !== undefined) {
    const m = child.mate;
    // Child mate < 0 means opponent is mated in |m| after our move, so we mate in |m| + 1.
    return { fen, lines: [{ uci: forcedUci, mate: m > 0 ? -m : -m + 1, pv }] };
  }
  return { fen, lines: [{ uci: forcedUci, cp: -(child.cp ?? 0), pv }] };
}

/** True when the backend's classification or Retry flow needs a 2nd engine line at this ply. */
export function needsSecondLine({
  bestBefore,
  bestAfter,
  afterCheckmate,
  afterDraw,
  playedBest,
  isRecapture,
}: {
  bestBefore: EngineLine;
  bestAfter: EngineLine | undefined;
  afterCheckmate: boolean;
  afterDraw: boolean;
  playedBest: boolean;
  isRecapture: boolean;
}): boolean {
  const mateBefore = bestBefore.mate;
  const mateAfter = afterCheckmate || afterDraw ? undefined : bestAfter?.mate;
  const cpBefore = scoreToCp(bestBefore.cp, mateBefore);
  const cpAfter = afterCheckmate ? -MATE_CP : afterDraw ? 0 : scoreToCp(bestAfter?.cp, mateAfter);

  const feltBefore = perceivedCp(cpBefore, mateBefore);
  const feltAfter = afterCheckmate ? -MATE_CP : afterDraw ? 0 : perceivedCp(cpAfter, mateAfter);
  const wBefore = winPct(feltBefore);
  const wAfter = 100 - winPct(feltAfter);
  const dw = Math.max(0, wBefore - wAfter);

  if (playedBest) {
    // Brilliant/great checks use PV2 (non-forced check evasions with pv_gap >= 16%, mate sacrifices).
    return !afterCheckmate && !isRecapture && (wBefore < 98.0 || (mateBefore !== undefined && mateBefore > 0));
  }

  // Retry & classification thresholds aligned with api/src/review/classify.py.
  if (dw >= 5.0) return true;
  const afterIsMate = afterCheckmate || mateAfter !== undefined;
  const cpLoss = mateBefore !== undefined && afterIsMate ? Math.max(0, cpBefore + cpAfter) : Math.max(0, feltBefore + feltAfter);
  if (wBefore < 20.0 && cpLoss >= 50) return true;

  if (mateBefore !== undefined && mateBefore > 0 && mateBefore <= 2) {
    const keptFastMate =
      mateBefore === 1
        ? afterCheckmate
        : afterCheckmate || (mateAfter !== undefined && mateAfter < 0 && -mateAfter <= 3);
    if (!keptFastMate) return true;
  }

  // Walked into a human-visible mate (<= 3 moves) when not already getting mated.
  if (
    mateAfter !== undefined &&
    mateAfter > 0 &&
    mateAfter <= HUMAN_MATE &&
    !(mateBefore !== undefined && mateBefore < 0) &&
    wBefore >= 15.0
  ) {
    return true;
  }

  return false;
}

function playedMove(before: Chess, after: Chess): { uci: string; to: string; isCapture: boolean } | null {
  const targetBoardTurn = after.fen().split(" ").slice(0, 2).join(" ");
  for (const m of before.moves({ verbose: true })) {
    before.move(m);
    const matches = before.fen().split(" ").slice(0, 2).join(" ") === targetBoardTurn;
    before.undo();
    if (matches) {
      return {
        uci: m.from + m.to + (m.promotion ?? ""),
        to: m.to,
        isCapture: m.isCapture(),
      };
    }
  }
  return null;
}

/** One single-threaded Stockfish web worker, driven one command/response at a time. */
class Engine {
  private worker: Worker;
  private onLine: ((line: string) => void) | null = null;
  private fail: ((err: unknown) => void) | null = null;
  private earlyError: Error | null = null;
  private initialized = false;
  private currentMultiPv: number | null = null;
  private searching = false;
  dead = false;

  constructor(engineUrl: string = SIMD_ENGINE_URL) {
    this.worker = new Worker(engineUrl);
    this.worker.onmessage = (e) => this.onLine?.(String(e.data));
    this.worker.onerror = (e) => {
      const err = new Error(e.message || "Stockfish failed to load");
      this.earlyError = err;
      this.dead = true;
      this.fail?.(err);
    };
  }

  private until(prefix: string, send: string[], onLine?: (line: string) => void, timeoutMs = 15_000) {
    return new Promise<void>((resolve, reject) => {
      if (this.dead) return reject(this.earlyError ?? new Error("Stockfish worker terminated"));
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
        this.fail = null;
        this.onLine = null;
        reject(err);
      };
      this.onLine = (line) => {
        onLine?.(line);
        if (line.startsWith(prefix)) {
          clearTimeout(timer);
          this.fail = null;
          this.onLine = null;
          resolve();
        }
      };
      for (const cmd of send) this.worker.postMessage(cmd);
    });
  }

  private async ensureReady(multiPv: number): Promise<void> {
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

  async clear(): Promise<void> {
    if (!this.initialized) return;
    await this.until("readyok", ["ucinewgame", "isready"]);
  }

  async search(fen: string, opts: SearchOptions): Promise<EngineLine[]> {
    await this.ensureReady(opts.multiPv);
    const byPv = new Map<number, EngineLine>();
    let stopped = false;
    const parts = [`go depth ${opts.depth}`];
    if (opts.nodes !== undefined) parts.push(`nodes ${opts.nodes}`);
    parts.push(`movetime ${opts.movetimeMs}`);
    if (opts.searchmoves?.length) parts.push(`searchmoves ${opts.searchmoves.join(" ")}`);

    this.searching = true;
    try {
      await this.until("bestmove", [`position fen ${fen}`, parts.join(" ")], (line) => {
        const info = parseInfo(line);
        if (!info) return;
        byPv.set(info.multipv, { uci: info.uci, cp: info.cp, mate: info.mate, pv: info.pv.slice(0, PV_MAX) });
        if (!stopped && info.multipv === 1 && info.mate !== undefined && info.depth >= Math.min(2 * Math.abs(info.mate), 10)) {
          stopped = true;
          this.worker.postMessage("stop");
        }
      });
    } finally {
      this.searching = false;
    }
    return [...byPv.entries()].sort(([a], [b]) => a - b).map(([, line]) => line);
  }

  stop(): void {
    if (this.searching && !this.dead) {
      this.worker.postMessage("stop");
    }
  }

  terminate(reason: unknown): void {
    if (this.dead) return;
    this.dead = true;
    this.worker.terminate();
    this.fail?.(reason);
  }
}

class WebEnginePool implements EnginePool {
  private workers: Engine[] = [];
  private workerCtor: typeof Worker | undefined;
  private engineUrl = "";
  private activeCount = 0;
  private queue: Promise<void> = Promise.resolve();

  get workerCount(): number {
    return this.activeCount;
  }

  configure(size: number, engineUrl: string): void {
    if (typeof Worker === "undefined") {
      throw new Error("Web Workers are not available in this environment");
    }
    if (this.workerCtor !== Worker || this.engineUrl !== engineUrl) {
      this.dispose(new Error("Engine pool reconfigured"));
      this.workerCtor = Worker;
      this.engineUrl = engineUrl;
    }
    this.workers = this.workers.filter((w) => !w.dead);
    while (this.workers.length < size) {
      this.workers.push(new Engine(engineUrl));
    }
    this.activeCount = size;
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
    await Promise.all(this.workers.slice(0, this.activeCount).map((w) => w.clear()));
  }

  async search(workerId: number, fen: string, opts: SearchOptions): Promise<EngineLine[]> {
    const engine = this.workers[workerId];
    if (!engine || engine.dead) {
      throw new Error(`Worker ${workerId} is unavailable`);
    }
    try {
      return await engine.search(fen, opts);
    } catch (err) {
      engine.terminate(err);
      this.evict(engine);
      throw err;
    }
  }

  stopAll(): void {
    for (const w of this.workers) w.stop();
  }

  terminateActive(reason: unknown): void {
    for (const w of this.workers.splice(0)) {
      w.terminate(reason);
    }
    this.activeCount = 0;
  }

  private evict(engine: Engine): void {
    const idx = this.workers.indexOf(engine);
    if (idx >= 0) this.workers.splice(idx, 1);
  }

  dispose(reason: unknown = new Error("Engine pool disposed")): void {
    this.terminateActive(reason);
    this.workerCtor = undefined;
    this.engineUrl = "";
  }
}

const warmPool = new WebEnginePool();

/** Terminates all warm Web Workers in the module-level pool. */
export function disposeEnginePool(): void {
  warmPool.dispose();
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
    /** Each position as it finishes; workers finish out of order. */
    onPosition?: (index: number, ev: PositionEval) => void;
    signal?: AbortSignal;
    /** Optional custom pool backend (used by benchmarks and tests). */
    pool?: EnginePool;
  } = {},
): Promise<PositionEval[]> {
  const depth = opts.depth ?? (opts.quality && QUALITY_DEPTH[opts.quality]) ?? QUALITY_DEPTH.standard;
  const { multiPv = 2, onPosition, signal, pool } = opts;
  signal?.throwIfAborted();
  if (fens.length === 0) return [];

  const useWarmPool = !pool;
  let activePool: EnginePool;
  if (pool) {
    activePool = pool;
  } else {
    const isSimd = await hasWasmSimd();
    signal?.throwIfAborted();
    const engineUrl = isSimd ? SIMD_ENGINE_URL : ASM_ENGINE_URL;
    const size = opts.concurrency ?? recommendedConcurrency(fens.length);
    warmPool.configure(size, engineUrl);
    activePool = warmPool;
  }

  return activePool.runExclusive(async () => {
    signal?.throwIfAborted();

    let aborted = false;
    let rejectAbort: ((err: unknown) => void) | null = null;
    const abortPromise = new Promise<never>((_, reject) => {
      rejectAbort = reject;
    });
    const onAbort = () => {
      if (aborted) return;
      aborted = true;
      const reason = signal?.reason ?? new Error("analysis stopped");
      if (useWarmPool) warmPool.terminateActive(reason);
      else activePool.stopAll();
      rejectAbort?.(reason);
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    const raceAbort = <T>(p: Promise<T>): Promise<T> => (signal ? Promise.race([p, abortPromise]) : p);

    try {
      await raceAbort(activePool.clearAll());

      const positions: (Chess | null)[] = new Array(fens.length);
      const allLegalUcis: (string[] | null)[] = new Array(fens.length);
      const results: (PositionEval | null)[] = new Array(fens.length).fill(null);

      const forcedIndices: number[] = [];
      const terminalIndices: number[] = [];
      const firstByKey = new Map<string, number>();
      const followersByFirst = new Map<number, number[]>();
      const toSearch: number[] = [];

      for (let i = 0; i < fens.length; i++) {
        let pos: Chess | null = null;
        try {
          pos = new Chess(fens[i]);
        } catch {
          pos = null;
        }
        positions[i] = pos;

        if (!pos) {
          allLegalUcis[i] = null;
          toSearch.push(i);
          continue;
        }

        const ucis = legalUcis(pos);
        allLegalUcis[i] = ucis;

        if (pos.isCheckmate() || pos.isStalemate()) {
          results[i] = { fen: fens[i], lines: [] };
          terminalIndices.push(i);
        } else if (pos.isInsufficientMaterial()) {
          const uci = ucis[0];
          results[i] = { fen: fens[i], lines: uci ? [{ uci, cp: 0, pv: [uci] }] : [] };
          terminalIndices.push(i);
        } else if (i < fens.length - 1 && ucis.length === 1) {
          forcedIndices.push(i);
        } else {
          const key = fenDedupKey(fens[i]);
          const first = key !== null ? firstByKey.get(key) : undefined;
          if (first !== undefined) {
            const list = followersByFirst.get(first);
            if (list) list.push(i);
            else followersByFirst.set(first, [i]);
          } else {
            if (key !== null) firstByKey.set(key, i);
            toSearch.push(i);
          }
        }
      }

      const twoPass = multiPv === 2 && fens.length > 1;
      const tiles: number[][] = [];
      for (let start = 0; start < toSearch.length; start += TILE_SIZE) {
        tiles.push(toSearch.slice(start, start + TILE_SIZE));
      }

      if (tiles.length > 0) {
        const nodesCap = pass1Nodes(depth);
        const pass1MultiPv = twoPass ? 1 : multiPv;
        const nWorkers = Math.min(activePool.workerCount, Math.max(1, tiles.length));
        let nextTile = 0;

        await raceAbort(
          Promise.all(
            Array.from({ length: nWorkers }, async (_, w) => {
              while (!aborted && nextTile < tiles.length) {
                const tile = tiles[nextTile++];
                for (const idx of tile) {
                  if (aborted) return;
                  const lines = await activePool.search(w, fens[idx], {
                    depth,
                    nodes: nodesCap,
                    movetimeMs: MAX_MS,
                    multiPv: pass1MultiPv,
                  });
                  if (aborted) return;
                  const ev: PositionEval = { fen: fens[idx], lines };
                  results[idx] = ev;
                  onPosition?.(idx, ev);
                  const followers = followersByFirst.get(idx);
                  if (followers) {
                    for (const dupIdx of followers) {
                      const dupEv: PositionEval = { fen: fens[dupIdx], lines };
                      results[dupIdx] = dupEv;
                      onPosition?.(dupIdx, dupEv);
                    }
                  }
                }
              }
            }),
          ),
        );
      }

      // Resolve forced moves right-to-left so consecutive forced sequences chain cleanly.
      for (let k = forcedIndices.length - 1; k >= 0; k--) {
        const j = forcedIndices[k];
        const childPos = positions[j + 1];
        results[j] = deriveForcedEval(fens[j], allLegalUcis[j]![0], results[j + 1]!, {
          childCheckmate: childPos?.isCheckmate() ?? false,
          childDraw: childPos ? childPos.isStalemate() || childPos.isInsufficientMaterial() : false,
        });
      }
      for (const j of forcedIndices) {
        onPosition?.(j, results[j]!);
      }
      for (const j of terminalIndices) {
        onPosition?.(j, results[j]!);
      }

      if (twoPass) {
        const candidates: Array<{ idx: number; pv1: EngineLine; others: string[] }> = [];
        let prevTo: string | null = null;
        for (let i = 0; i < fens.length - 1; i++) {
          const posBefore = positions[i];
          const posAfter = positions[i + 1];
          const ucis = allLegalUcis[i];
          if (!posBefore || !posAfter || !ucis) {
            prevTo = null;
            continue;
          }
          const played = playedMove(posBefore, posAfter);
          const isRecapture = Boolean(played && played.isCapture && prevTo !== null && played.to === prevTo);
          prevTo = played?.to ?? null;
          if (!played || ucis.length < 2) continue;

          const evBefore = results[i]!;
          if (evBefore.lines.length !== 1) continue;
          const pv1 = evBefore.lines[0];
          const childEv = results[i + 1]!;
          if (
            !needsSecondLine({
              bestBefore: pv1,
              bestAfter: childEv.lines[0],
              afterCheckmate: posAfter.isCheckmate(),
              afterDraw: posAfter.isStalemate() || posAfter.isInsufficientMaterial(),
              playedBest: played.uci === pv1.uci,
              isRecapture,
            })
          ) {
            continue;
          }
          const others = ucis.filter((u) => u !== pv1.uci);
          if (others.length > 0) candidates.push({ idx: i, pv1, others });
        }

        if (candidates.length > 0) {
          let nextCand = 0;
          const p2Workers = Math.min(activePool.workerCount, candidates.length);
          await raceAbort(
            Promise.all(
              Array.from({ length: p2Workers }, async (_, w) => {
                while (!aborted && nextCand < candidates.length) {
                  const { idx, pv1, others } = candidates[nextCand++];
                  const lines2 = await activePool.search(w, fens[idx], {
                    depth: PV2_DEPTH,
                    nodes: PV2_NODES,
                    movetimeMs: MAX_MS,
                    multiPv: 1,
                    searchmoves: others,
                  });
                  if (aborted) return;
                  if (lines2.length > 0) {
                    results[idx] = { fen: fens[idx], lines: [pv1, lines2[0]] };
                  }
                }
              }),
            ),
          );
        }
      }

      return results.map((r) => r!);
    } catch (err) {
      if (useWarmPool && !aborted) {
        warmPool.terminateActive(err);
      }
      throw err;
    } finally {
      signal?.removeEventListener("abort", onAbort);
    }
  });
}
