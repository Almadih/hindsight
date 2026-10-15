---
target: review screen
total_score: 28
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/home/almadih/Desktop/Work/personal/chess.com-game-review-v3/web/components/Review.tsx"
target_fingerprint: "sha256:f204bb757236770a86d879d5f6c6b8acfc80760472b9137798bf4042d2092fd0"
target_path: /home/almadih/Desktop/Work/personal/chess.com-game-review-v3/web/components/Review.tsx
timestamp: 2026-10-15T08-05-51Z
slug: web-components-review-tsx
---
# Critique: review screen (web/components/Review.tsx), round 3
Method: dual-agent (A design review, B detector + browser), isolated.

Design specificity: authored. The key-moment spine now runs end to end (Your key moments -> "Key moment n of 4" -> Finish review -> "That's what decided it"). Generic parts: the stats block (rings, 10-row verdict table, phases) and a thin end card with no takeaway.

Heuristics (28/40, was 29): status 3, match 3, control 3, consistency 3, error prevention 2 (-1: misleading best line, follow-up on mate/Best replays the move), recognition 3, flexibility 3, minimalism 3, recovery 3, help 2.

Detector: CLI 1 (bounce-easing EvalBar.tsx:21, intentional). Overlay 2 on every state (bounce-easing, Geist overused-font; false positives) plus new flat-type-hierarchy on the end card (h2 16px = body). Contrast all pass (muted 5.39:1 on panel, blunder 5.08:1). Smallest text 11px. No overflow at 390px. Tap targets 28-36px tall.

Prior issues: retry spoiler fixed; phone jump partly (Summary yes, sticky Next/Prev/list/graph no); key moments + ending fixed; mid-exchange line still open (in-between move before the recapture defeats the capture-only extension); desktop summary fixed.

Priority issues:
1. [P1] Engine line still ends a piece down: 7.Bd2 -> exd5 Nxd5 O-O Bxc3, recapture comes after an in-between move. Fix: compare material at the cutoff with the start; extend until restored or cut before the capture. Eval bar frozen during the line. (harden)
2. [P1] Phone: sticky Next/Prev key moment and the step buttons don't bring the board back (toNext/toPrev call go, not showBoard); active list row hides under the sticky bar. (adapt)
3. [P1] Keyboard/screen reader: 32 unlabelled react-chessboard tab stops before the panel even in game mode; game-mode MoveCard has no live region; no text position. (audit)
4. [P2] Solved retry not remembered (Retry stays primary); wrong try gets a hint but no reason. (clarify)
5. [P2] End card has no lesson; with "me" set the opponent's game-deciding swing is dropped for a minor own inaccuracy. (distill/delight)

Persona red flags: Jordan (misleading line, raw -6.0, third-person coach about "you", follow-up on checkmate); Alex (graph dots no tooltip, no refutation, eval bar frozen in line); Casey (sticky Next leaves board off-screen, 36px targets, Copy link/Back at page bottom, buried Start CTA duplicates sticky bar); Sam (32 unlabelled tab stops, no announcements, mouse-only graph).

Minor: full opening name on 1.e4; three labels for the follow-up action; EvalGraph off-system greys; end-card h2 same size as body; "Check it in my browser" 12px; Summary gist leaks the hidden coach sentence.

Questions: Should the post-solve line show the opponent's punishment of the game move? Should key moments always include the opponent's most decisive swing? Should the end card be one sentence?
