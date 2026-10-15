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
// Quiet line that ends on a capture: show the recapture too (7. exd5 Nxd5 8. O-O Bxc3 9. bxc3).
const recapture = followUpLine("r1bqk2r/ppp2ppp/2n2n2/3p4/1b2P3/2NB1N2/PPPP1PPP/R1BQK2R w KQkq - 0 7", ["e4d5", "f6d5", "e1g1", "b4c3", "b2c3", "e8g8"]);
assert.deepEqual(recapture.sans, ["exd5", "Nxd5", "O-O", "Bxc3", "bxc3"]);
// The real 7.Bd2 case: the recapture comes after an in-between move, at ply 7.
const pv = ["e4d5", "f6d5", "e1g1", "b4c3", "d1e2", "c8e6", "b2c3", "d8f6", "c1d2", "e8c8"];
const bd2 = "r1bqk2r/ppp2ppp/2n2n2/3p4/1b1PPp2/2NB1N2/PPP3PP/R1BQK2R w KQkq - 0 7";
assert.deepEqual(followUpLine(bd2, pv).sans, ["exd5", "Nxd5", "O-O", "Bxc3", "Qe2+", "Be6", "bxc3"]);

// PV too short to win the piece back: stop before it was lost.
assert.deepEqual(followUpLine(bd2, pv.slice(0, 5)).sans, ["exd5", "Nxd5", "O-O"]);
console.log("followUpLine ok");
