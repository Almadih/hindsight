// Self-check for web chess/review helpers: `node lib/followup.check.ts` (Node 24 strips the types).
import assert from "node:assert/strict";
import { analyzePositions, type AnalysisQuality } from "./engine/pool.ts";
import { parseInfo } from "./engine/uci.ts";
import { parsePgn, reportPgn, START_FEN } from "./pgn.ts";
import { capturedPieces, decidingMoments, followUpLine, isForced, isGoodRetry, keyMoments, originalGameUrl, personalize, whiteWinPct } from "./review.ts";
import type { ReviewMove } from "./types.ts";

// Scholar's mate: the line stops at mate even though the PV goes on.
const mate = followUpLine("r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4", ["h5f7", "e8f7", "a2a3"]);
assert.deepEqual(mate.sans, ["Qxf7#"]);

// Winning a queen: stop once the recapture sequence is over, not mid-exchange.
const win = followUpLine("4k3/8/8/3q4/4P3/8/8/4K3 w - - 0 1", ["e4d5", "e8d7", "e1e2", "d7d6", "e2e3", "d6d5"]);
assert.deepEqual(win.sans, ["exd5"]);

// Mid-exchange: Nxd5 grabs the queen but exd5 is coming, so the line runs until the recapture.
const trade = followUpLine("4k3/8/4p3/3q4/8/2N5/8/4K3 w - - 0 1", ["c3d5", "e6d5", "e1e2", "e8d7"]);
assert.deepEqual(trade.sans, ["Nxd5", "exd5"]);

// Nothing decisive: 4 plies, not the whole 6-ply PV.
const quiet = followUpLine("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", ["e2e4", "e7e5", "g1f3", "b8c6", "f1b5", "a7a6"]);
assert.equal(quiet.sans.length, 4);
assert.equal(quiet.fens.length, 5);
// Quiet line that ends on a capture: show the recapture too (7. exd5 Nxd5 8. O-O Bxc3 9. bxc3).
const recapture = followUpLine("r1bqk2r/ppp2ppp/2n2n2/3p4/1b2P3/2NB1N2/PPPP1PPP/R1BQK2R w KQkq - 0 7", ["e4d5", "f6d5", "e1g1", "b4c3", "b2c3", "e8g8"]);
assert.deepEqual(recapture.sans, ["exd5", "Nxd5", "O-O", "Bxc3", "bxc3"]);
// The real 7.Bd2 case: the recapture comes after an in-between move, at ply 7.
const pv = ["e4d5", "f6d5", "e1g1", "b4c3", "d1e2", "c8e6", "b2c3", "d8f6", "c1d2", "e8c8"];
const bd2 = "r1bqk2r/ppp2ppp/2n2n2/3p4/1b1PPp2/2NB1N2/PPP3PP/R1BQK2R w KQkq - 0 7";
assert.deepEqual(followUpLine(bd2, pv).sans, ["exd5", "Nxd5", "O-O", "Bxc3", "Qe2+", "Be6", "bxc3"]);

// PV too short to win the piece back: stop before it was lost.
assert.deepEqual(followUpLine(bd2, pv.slice(0, 5)).sans, ["exd5", "Nxd5", "O-O"]);
// personalize: the coach's "Name's" becomes "your" when Name is you, capitalised at a sentence start.
assert.equal(personalize("Almadih_desu2's Bd2 allows Bxc3. It hangs Almadih_desu2's knight.", "Almadih_desu2"), "Your Bd2 allows Bxc3. It hangs your knight.");
assert.equal(personalize("Count (Isouard)'s move.", "Count (Isouard)"), "Your move.");
assert.equal(personalize("Brian's Nf5 forks the queen.", "an"), "Brian's Nf5 forks the queen.");
assert.equal(personalize("Hikaru's Bxb3+ wins.", null), "Hikaru's Bxb3+ wins.");

// parsePgn and reportPgn: round-trip standard and custom-FEN games cleanly.
const parsed = parsePgn('[White "A"]\n[Black "B"]\n\n1. e4 {note} e5 (1... c5) 2. Nf3 *');
assert.deepEqual(parsed.sans, ["e4", "e5", "Nf3"]);
assert.equal(parsed.fens.length, 4);
assert.equal(parsed.fens[0], START_FEN);
const rebuilt = parsePgn(reportPgn({ White: "A", Black: "B" }, parsed.sans));
assert.deepEqual(rebuilt.fens, parsed.fens);

// parseInfo: parses cp/mate and ignores bounds or empty PVs.
assert.equal(parseInfo("info depth 5 score cp 10 lowerbound pv e2e4"), null);
assert.equal(parseInfo("info depth 5 score cp 10 pv "), null);
const uciInfo = parseInfo("info depth 16 multipv 2 score cp -35 pv e7e5 g1f3");
assert.deepEqual(uciInfo, { multipv: 2, depth: 16, uci: "e7e5", pv: ["e7e5", "g1f3"], cp: -35 });
const mateInfo = parseInfo("info depth 8 score mate -3 pv h7h8");
assert.deepEqual(mateInfo, { multipv: 1, depth: 8, uci: "h7h8", pv: ["h7h8"], mate: -3 });

// whiteWinPct, capturedPieces, keyMoments, decidingMoments, isGoodRetry.
assert.ok(Math.abs(whiteWinPct({ evalWhite: 0, mateWhite: null }) - 50) < 1e-9);
assert.equal(whiteWinPct({ evalWhite: 0, mateWhite: -2 }), 0);
assert.equal(whiteWinPct({ evalWhite: 1, mateWhite: 0 }), 100);
assert.deepEqual(capturedPieces("rnb1kbnr/pppppppp/8/8/8/8/PPPPPPP1/RNBQKBN1 w kq - 0 1"), { white: ["bQ"], black: ["wR", "wP"] });
assert.equal(capturedPieces("QQ6/8/8/8/8/8/8/k6K w - - 0 1").black.includes("wQ"), false);
assert.ok(capturedPieces("QQ6/8/8/8/8/8/8/k6K w - - 0 1").white.includes("bQ"));

const sampleMoves: Pick<ReviewMove, "ply" | "badge" | "wBefore" | "wAfter" | "color" | "alternatives">[] = [
  { ply: 1, badge: "book", wBefore: 52, wAfter: 52, color: "white", alternatives: [] },
  { ply: 2, badge: "mistake", wBefore: 48, wAfter: 30, color: "black", alternatives: [{ uci: "e7e5", san: "e5", w: 48 }, { uci: "c7c5", san: "c5", w: 46.5 }] },
  { ply: 3, badge: "brilliant", wBefore: 70, wAfter: 70, color: "white", alternatives: [] },
];
assert.deepEqual(keyMoments(sampleMoves).map((m) => m.ply), [2, 3]);
assert.equal(decidingMoments(sampleMoves, "white").mine, true);
assert.equal(isGoodRetry(sampleMoves[1] as ReviewMove, "e7e5"), true);
assert.equal(isGoodRetry(sampleMoves[1] as ReviewMove, "c7c5"), true);
assert.equal(isGoodRetry(sampleMoves[1] as ReviewMove, "a7a6"), false);

// Forced: Kxg2 is White's only legal move; a lone promotion still leaves four choices.
assert.equal(isForced("7k/8/8/8/8/8/6q1/7K w - - 0 1"), true);
assert.equal(isForced("7k/P7/8/8/8/8/5q2/7K w - - 0 1"), false);
assert.equal(isForced(START_FEN), false);

// Worker pool: out-of-order completion, early mate stop, invalid quality fallback, and abort cleanup.
{
  const savedWorker = globalThis.Worker;
  const sent: string[][] = [];
  let terminated = 0;

  class FakeWorker {
    onmessage: ((e: { data: string }) => void) | null = null;
    onerror: ((e: { message: string }) => void) | null = null;
    private log: string[] = [];
    private currentFen = "";
    constructor() {
      sent.push(this.log);
    }
    postMessage(cmd: string) {
      this.log.push(cmd);
      const emit = (data: string, ms = 0) => setTimeout(() => this.onmessage?.({ data }), ms);
      if (cmd === "uci") emit("uciok");
      else if (cmd === "isready") emit("readyok");
      else if (cmd.startsWith("position fen ")) this.currentFen = cmd.slice("position fen ".length);
      else if (cmd.startsWith("go ")) {
        assert.ok(cmd.includes("depth 16"), `expected fallback depth 16, got: ${cmd}`);
        if (this.currentFen === "fen-slow") {
          emit("info depth 16 multipv 1 score cp 25 pv e2e4 e7e5", 30);
          emit("bestmove e2e4", 35);
        } else if (this.currentFen === "fen-mate") {
          emit("info depth 4 multipv 1 score mate 2 pv h5f7", 5);
        } else {
          // Hang until aborted in the abort test.
        }
      } else if (cmd === "stop") {
        emit("bestmove h5f7");
      }
    }
    terminate() {
      terminated++;
    }
  }

  globalThis.Worker = FakeWorker as unknown as typeof Worker;
  try {
    const order: number[] = [];
    const res = await analyzePositions(["fen-slow", "fen-mate"], {
      concurrency: 2,
      quality: "bogus" as AnalysisQuality,
      onPosition: (i) => order.push(i),
    });
    assert.deepEqual(order, [1, 0]); // mate position finishes before slow position
    assert.equal(res[0].lines[0].cp, 25);
    assert.equal(res[1].lines[0].mate, 2);
    assert.ok(sent.some((cmds) => cmds.includes("stop"))); // early mate stop triggered
    assert.equal(terminated, 2);

    const ac = new AbortController();
    const p = analyzePositions(["fen-hang"], { concurrency: 1, signal: ac.signal });
    setTimeout(() => ac.abort(new Error("cancelled")), 15);
    await assert.rejects(p, /cancelled/);
    assert.equal(terminated, 3);
  } finally {
    globalThis.Worker = savedWorker;
  }
}

// originalGameUrl: allows verified Chess.com & Lichess game URLs only.
assert.deepEqual(originalGameUrl({ Site: "Chess.com", Link: "https://www.chess.com/game/live/123456" }), {
  url: "https://www.chess.com/game/live/123456",
  label: "Chess.com",
});
assert.deepEqual(originalGameUrl({ Site: "https://lichess.org/AbCdEfGh" }), {
  url: "https://lichess.org/AbCdEfGh",
  label: "Lichess",
});
assert.equal(originalGameUrl({ Site: "Paris FRA" }), null);
assert.equal(originalGameUrl({ Link: "javascript:alert(1)" }), null);
assert.equal(originalGameUrl({ Link: "http://www.chess.com/game/live/123" }), null);
assert.equal(originalGameUrl({ Link: "https://evil.example/game/live/123" }), null);
assert.equal(originalGameUrl({ Site: "https://www.chess.com/member/hikaru" }), null);

console.log("followUpLine ok");
