// Calibration data: real Chess.com games (with Chess.com's own accuracies) analysed with exactly the app's
// engine settings, written as JSONL for api/scripts/calibrate/fit.py.
// Run from web/: node --no-warnings scripts/calibrate/collect.ts [targetPerBand]
import { spawn, type ChildProcess } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { Chess } from "chess.js";
import { parseInfo, type EngineLine } from "../../lib/engine/uci.ts";

const OUT_DIR = new URL("../../../api/scripts/calibrate/data/", import.meta.url).pathname;
const OUT = `${OUT_DIR}games.jsonl`;
const UA = "chess-game-review/0.2 (+https://chess-review.almadih.workers.dev) calibration";
const PER_BAND = Number(process.argv[2] ?? 6);
const ENGINES = 4;
// Mirror of web/lib/engine/pool.ts settings: keep them identical or the calibration is meaningless.
const DEPTH = 16;
const MULTIPV = 3;
const MAX_MS = 5000;
const PV_MAX = 20;
const BANDS = [0, 1000, 1500, 2000, 2500, 4000];

type Game = { url: string; pgn: string; accuracies: { white: number; black: number }; white: { rating: number }; black: { rating: number }; rules: string; rated: boolean; time_class: string };

async function getJson(url: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }
    if (!res.ok) return null;
    return res.json();
  }
  return null;
}

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

function band(rating: number) {
  return BANDS.findIndex((b, i) => rating >= b && rating < BANDS[i + 1]);
}

async function candidatePlayers(): Promise<string[]> {
  const names = new Set<string>();
  for (const title of ["GM", "IM"]) for (const p of ((await getJson(`https://api.chess.com/pub/titled/${title}`))?.players ?? []).slice(0, 40)) names.add(p);
  for (const country of ["US", "IN", "GB", "DE", "BR", "PH", "FR", "EG"]) {
    const list: string[] = (await getJson(`https://api.chess.com/pub/country/${country}/players`))?.players ?? [];
    for (let i = 0; i < 60 && list.length; i++) names.add(list[Math.floor(Math.random() * list.length)]);
  }
  return [...names].sort(() => Math.random() - 0.5);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const done = new Set<string>();
  const perBand = BANDS.slice(0, -1).map(() => 0);
  if (existsSync(OUT)) {
    for (const line of readFileSync(OUT, "utf8").split("\n").filter(Boolean)) {
      const row = JSON.parse(line);
      done.add(row.url);
      perBand[band((row.ratings.white + row.ratings.black) / 2)]++;
    }
  }
  const enginePath = createRequire(import.meta.url)("stockfish").findEngine("lite-single");
  const engines = Array.from({ length: ENGINES }, () => new Engine(enginePath));
  await Promise.all(engines.map((e) => e.init()));

  for (const player of await candidatePlayers()) {
    if (perBand.every((n) => n >= PER_BAND)) break;
    const archives: string[] = (await getJson(`https://api.chess.com/pub/player/${player}/games/archives`))?.archives ?? [];
    if (!archives.length) continue;
    const games: Game[] = (await getJson(archives[archives.length - 1]))?.games ?? [];
    const game = games
      .reverse()
      .find((g) => g.rules === "chess" && g.rated && g.accuracies && ["blitz", "rapid"].includes(g.time_class) && !done.has(g.url));
    if (!game) continue;
    const b = band((game.white.rating + game.black.rating) / 2);
    if (b < 0 || perBand[b] >= PER_BAND) continue;

    const chess = new Chess();
    try {
      chess.loadPgn(game.pgn);
    } catch {
      continue;
    }
    const moves = chess.history({ verbose: true });
    if (moves.length < 20) continue;
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
      }),
    );
    appendFileSync(
      OUT,
      JSON.stringify({ url: game.url, pgn: chess.pgn(), evals, chesscom: game.accuracies, ratings: { white: game.white.rating, black: game.black.rating }, timeClass: game.time_class }) + "\n",
    );
    done.add(game.url);
    perBand[b]++;
    console.log(`band ${BANDS[b]}+ ${perBand[b]}/${PER_BAND}  ${fens.length} positions in ${((Date.now() - started) / 1000).toFixed(0)}s  ${game.url}`);
  }
  engines.forEach((e) => e.kill());
  console.log("per band:", perBand.join(" "), "→", OUT);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
