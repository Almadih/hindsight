// Self-check for followUpLine: `node lib/followup.check.ts` (Node 24 strips the types).
import assert from "node:assert/strict";
import { followUpLine } from "./review.ts";

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
console.log("followUpLine ok");
