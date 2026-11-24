// Self-check for web chess/review helpers: `node lib/followup.check.ts` (Node 24 strips the types).
import assert from "node:assert/strict";
import { Chess } from "chess.js";
import {
  analyzePositions,
  deriveForcedEval,
  disposeEnginePool,
  fenDedupKey,
  legalUcis,
  needsSecondLine,
  type AnalysisQuality,
  type EnginePool,
  type SearchOptions,
} from "./engine/pool.ts";
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

// Worker pool: out-of-order completion, early mate stop, warm reuse, ucinewgame, disposeEnginePool, and abort cleanup.
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
        } else if (this.currentFen === "fen-fast") {
          emit("info depth 16 multipv 1 score cp 10 pv d2d4 d7d5", 5);
          emit("bestmove d2d4", 8);
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
    // 5 positions -> 2 tiles ([0..3], [4]) so 2 workers run in parallel and tile 1 (mate) finishes before tile 0 (slow).
    const res = await analyzePositions(["fen-slow", "fen-fast", "fen-fast", "fen-fast", "fen-mate"], {
      concurrency: 2,
      quality: "bogus" as AnalysisQuality,
      onPosition: (i) => order.push(i),
    });
    assert.equal(order[0], 4); // mate position in tile 1 finishes before slow position in tile 0
    assert.equal(res[0].lines[0].cp, 25);
    assert.equal(res[4].lines[0].mate, 2);
    assert.ok(sent.some((cmds) => cmds.includes("stop"))); // early mate stop triggered
    assert.equal(terminated, 0); // warm pool keeps workers alive after completion
    assert.equal(sent.length, 2);

    // Second run reuses warm workers, sends ucinewgame, and skips redundant MultiPV setoption.
    const res2 = await analyzePositions(["fen-fast", "fen-fast", "fen-fast", "fen-fast", "fen-slow"], { concurrency: 2 });
    assert.equal(res2[0].lines[0].cp, 10);
    assert.equal(res2[4].lines[0].cp, 25);
    assert.equal(sent.length, 2); // no new workers spawned
    assert.ok(sent.every((cmds) => cmds.includes("ucinewgame")));
    assert.equal(sent[0].filter((c) => c.startsWith("setoption name MultiPV")).length, 1);

    // Explicit disposal terminates warm workers.
    disposeEnginePool();
    assert.equal(terminated, 2);

    // Abort terminates and evicts affected worker.
    const ac = new AbortController();
    const p = analyzePositions(["fen-hang"], { concurrency: 1, signal: ac.signal });
    setTimeout(() => ac.abort(new Error("cancelled")), 15);
    await assert.rejects(p, /cancelled/);
    assert.equal(terminated, 3);
  } finally {
    disposeEnginePool();
    globalThis.Worker = savedWorker;
  }
}

// legalUcis: castling & 4-way promotion expansion.
{
  const castlePos = new Chess("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
  const castleUcis = legalUcis(castlePos);
  assert.ok(castleUcis.includes("e1g1"));
  assert.ok(castleUcis.includes("e1c1"));

  const promoPos = new Chess("7k/P7/8/8/8/8/8/7K w - - 0 1");
  const promoUcis = legalUcis(promoPos);
  assert.deepEqual(
    promoUcis.filter((u) => u.startsWith("a7a8")).sort(),
    ["a7a8b", "a7a8n", "a7a8q", "a7a8r"],
  );
}

// fenDedupKey: 4-field key below 80 halfmoves, null at >=80 or malformed.
assert.equal(fenDedupKey("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1"), "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3");
assert.equal(fenDedupKey("8/8/8/8/8/8/8/k6K w - - 79 50"), "8/8/8/8/8/8/8/k6K w - -");
assert.equal(fenDedupKey("8/8/8/8/8/8/8/k6K w - - 80 50"), null);
assert.equal(fenDedupKey("bad fen"), null);

// deriveForcedEval: mate+1 math, draw, cp negation, PV_MAX=20 truncation, and chaining.
{
  const longPv = Array.from({ length: 25 }, (_, i) => `a${(i % 7) + 1}a${(i % 7) + 2}`);
  const dCheckmate = deriveForcedEval("f1", "g1g2", { fen: "f2", lines: [] }, { childCheckmate: true, childDraw: false });
  assert.deepEqual(dCheckmate.lines[0], { uci: "g1g2", mate: 1, pv: ["g1g2"] });

  const dDraw = deriveForcedEval("f1", "g1g2", { fen: "f2", lines: [{ uci: "e7e5", cp: 120, pv: ["e7e5"] }] }, { childCheckmate: false, childDraw: true });
  assert.deepEqual(dDraw.lines[0], { uci: "g1g2", cp: 0, pv: ["g1g2", "e7e5"] });

  // Child mate -2 (opponent mated in 2) => mover mates in 3.
  const dWinMate = deriveForcedEval("f1", "g1g2", { fen: "f2", lines: [{ uci: "e7e5", mate: -2, pv: longPv }] }, { childCheckmate: false, childDraw: false });
  assert.equal(dWinMate.lines[0].mate, 3);
  assert.equal(dWinMate.lines[0].pv.length, 20);
  assert.equal(dWinMate.lines[0].pv[0], "g1g2");

  // Child mate +2 (opponent mates in 2) => mover gets mated in 2 (-2).
  const dLoseMate = deriveForcedEval("f1", "g1g2", { fen: "f2", lines: [{ uci: "e7e5", mate: 2, pv: ["e7e5"] }] }, { childCheckmate: false, childDraw: false });
  assert.equal(dLoseMate.lines[0].mate, -2);

  // Chaining two forced moves right-to-left: -40 cp -> +40 cp -> -40 cp.
  const child = { fen: "f3", lines: [{ uci: "a2a3", cp: -40, pv: ["a2a3"] }] };
  const forced2 = deriveForcedEval("f2", "b2b3", child, { childCheckmate: false, childDraw: false });
  assert.equal(forced2.lines[0].cp, 40);
  const forced1 = deriveForcedEval("f1", "c2c3", forced2, { childCheckmate: false, childDraw: false });
  assert.equal(forced1.lines[0].cp, -40);
  assert.deepEqual(forced1.lines[0].pv, ["c2c3", "b2b3", "a2a3"]);
}

// needsSecondLine: aligned with api/src/review/classify.py.
{
  // Played best: needs PV2 in equal/non-crushing position, skips recapture and >=98% non-mate.
  assert.equal(
    needsSecondLine({
      bestBefore: { uci: "e2e4", cp: 30, pv: ["e2e4"] },
      bestAfter: { uci: "e7e5", cp: -30, pv: ["e7e5"] },
      afterCheckmate: false,
      afterDraw: false,
      playedBest: true,
      isRecapture: false,
    }),
    true,
  );
  assert.equal(
    needsSecondLine({
      bestBefore: { uci: "e2e4", cp: 30, pv: ["e2e4"] },
      bestAfter: { uci: "e7e5", cp: -30, pv: ["e7e5"] },
      afterCheckmate: false,
      afterDraw: false,
      playedBest: true,
      isRecapture: true,
    }),
    false,
  );
  assert.equal(
    needsSecondLine({
      bestBefore: { uci: "e2e4", cp: 1500, pv: ["e2e4"] },
      bestAfter: { uci: "e7e5", cp: -1500, pv: ["e7e5"] },
      afterCheckmate: false,
      afterDraw: false,
      playedBest: true,
      isRecapture: false,
    }),
    false,
  );
  // Mate sacrifice (mateBefore > 0) still needs PV2 for brilliant/great even though wBefore is 100%.
  assert.equal(
    needsSecondLine({
      bestBefore: { uci: "h5f7", mate: 3, pv: ["h5f7"] },
      bestAfter: { uci: "e8f7", mate: -2, pv: ["e8f7"] },
      afterCheckmate: false,
      afterDraw: false,
      playedBest: true,
      isRecapture: false,
    }),
    true,
  );

  // !playedBest: inaccuracy cutoff dw >= 5.0%.
  assert.equal(
    needsSecondLine({
      bestBefore: { uci: "e2e4", cp: 100, pv: ["e2e4"] },
      bestAfter: { uci: "e7e5", cp: 0, pv: ["e7e5"] }, // wBefore ~59.1%, wAfter ~50% => dw ~9.1% >= 5
      afterCheckmate: false,
      afterDraw: false,
      playedBest: false,
      isRecapture: false,
    }),
    true,
  );
  assert.equal(
    needsSecondLine({
      bestBefore: { uci: "e2e4", cp: 20, pv: ["e2e4"] },
      bestAfter: { uci: "e7e5", cp: -10, pv: ["e7e5"] }, // dw < 1%
      afterCheckmate: false,
      afterDraw: false,
      playedBest: false,
      isRecapture: false,
    }),
    false,
  );

  // !playedBest: walked into human-visible mate (mateAfter <= 3) when wBefore >= 15% and not already mated.
  assert.equal(
    needsSecondLine({
      bestBefore: { uci: "e2e4", cp: 0, pv: ["e2e4"] },
      bestAfter: { uci: "d8h4", mate: 2, pv: ["d8h4"] },
      afterCheckmate: false,
      afterDraw: false,
      playedBest: false,
      isRecapture: false,
    }),
    true,
  );
}

// End-to-end analyzePositions with fake EnginePool: tile-4, dedup, forced derivation, terminal/insufficient skip, Pass 2 searchmoves.
{
  const chess = new Chess();
  const fens: string[] = [chess.fen()];
  const playSan = (san: string) => {
    chess.move(san);
    fens.push(chess.fen());
  };
  // 1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. Ng1 Nb8 5. Nf3 Nc6 (dedup!)
  for (const m of ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "Ng1", "Nb8", "Nf3", "Nc6"]) playSan(m);
  // Add a forced position followed by an insufficient-material position and a checkmate position.
  const forcedFen = "7k/8/8/8/8/8/6q1/7K w - - 0 1"; // Kxg2 is forced
  const insuffFen = "7k/8/8/8/8/8/6K1/8 b - - 0 1"; // K vs K insufficient material
  const mateFen = "r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4"; // checkmate
  const allFens = [...fens, forcedFen, insuffFen, mateFen];

  const searches: Array<{ workerId: number; fen: string; opts: SearchOptions }> = [];
  let clearCalls = 0;
  const fakePool: EnginePool = {
    workerCount: 2,
    async runExclusive(body) {
      return body();
    },
    async clearAll() {
      clearCalls++;
    },
    async search(workerId, fen, opts) {
      searches.push({ workerId, fen, opts });
      if (opts.searchmoves) {
        return [{ uci: opts.searchmoves[0], cp: -120, pv: [opts.searchmoves[0]] }];
      }
      // Return a blunder-inducing eval on ply 0 (e2e4 was played, return d2d4 as best with +150 cp) so Pass 2 triggers on ply 0.
      if (fen === allFens[0]) {
        return [{ uci: "d2d4", cp: 150, pv: ["d2d4"] }];
      }
      return [{ uci: legalUcis(new Chess(fen))[0], cp: 0, pv: [legalUcis(new Chess(fen))[0]] }];
    },
    stopAll() {},
  };

  const emitted = new Set<number>();
  const out = await analyzePositions(allFens, {
    depth: 14,
    multiPv: 2,
    pool: fakePool,
    onPosition: (i) => emitted.add(i),
  });

  assert.equal(clearCalls, 1);
  assert.equal(out.length, allFens.length);
  assert.equal(emitted.size, allFens.length);

  // Insufficient material gets 1 legal 0-cp line without searching.
  const insuffIdx = allFens.length - 2;
  assert.equal(out[insuffIdx].lines.length, 1);
  assert.equal(out[insuffIdx].lines[0].cp, 0);

  // Checkmate gets 0 lines without searching.
  const mateIdx = allFens.length - 1;
  assert.deepEqual(out[mateIdx].lines, []);

  // Forced move (Kxg2 -> insufficient material draw) derived as 0 cp without searching forcedFen.
  const forcedIdx = allFens.length - 3;
  assert.equal(out[forcedIdx].lines[0].uci, "h1g2");
  assert.equal(out[forcedIdx].lines[0].cp, 0);
  assert.equal(searches.some((s) => s.fen === forcedFen || s.fen === insuffFen || s.fen === mateFen), false);

  // Deduplication: allFens[8] and allFens[10] match earlier 4-field FENs (allFens[4] and allFens[6] etc.).
  const pass1Searches = searches.filter((s) => !s.opts.searchmoves);
  assert.ok(pass1Searches.every((s) => s.opts.nodes === 150_000 && s.opts.multiPv === 1));
  assert.ok(pass1Searches.length < fens.length); // duplicates skipped

  // Pass 2 ran with searchmoves excluding PV1 ("d2d4") on ply 0.
  const pass2Searches = searches.filter((s) => Boolean(s.opts.searchmoves));
  assert.ok(pass2Searches.length >= 1);
  const ply0P2 = pass2Searches.find((s) => s.fen === allFens[0]);
  assert.ok(ply0P2);
  assert.equal(ply0P2.opts.depth, 12);
  assert.equal(ply0P2.opts.nodes, 40_000);
  assert.equal(ply0P2.opts.searchmoves?.includes("d2d4"), false);
  assert.equal(out[0].lines.length, 2);
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
