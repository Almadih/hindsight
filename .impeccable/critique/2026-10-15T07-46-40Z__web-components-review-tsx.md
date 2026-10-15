---
target: review screen
total_score: 29
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:/home/almadih/Desktop/Work/personal/chess.com-game-review-v3/web/components/Review.tsx"
target_fingerprint: "sha256:9ea0e5e93841ad9d6df447f2bf5cab202026c108e4103e7a41e811ac8e5620bb"
target_path: /home/almadih/Desktop/Work/personal/chess.com-game-review-v3/web/components/Review.tsx
timestamp: 2026-10-15T07-46-40Z
slug: web-components-review-tsx
---
# Critique: review screen (web/components/Review.tsx), round 2
Method: dual-agent (A design review, B detector + browser), isolated.

Design specificity: authored for this product (board carries the verdict, verdict-only colour, "Your key moments", side flip). The side panel is still a Chess.com-shaped widget stack; nothing is shaped around "the 2-3 moments that decided it" from start to end.

Heuristics (29/40, was 24): status 3 (=), match 3 (+1), control 3 (=), consistency 3 (=), error prevention 3 (+1), recognition 3 (+1), flexibility 3 (+1), minimalism 3 (=), recovery 3 (=), help 2 (+1).

Detector: CLI 1 finding (bounce-easing EvalBar.tsx:21, intentional). Browser overlay 2 (bounce-easing, overused-font Geist), both false positives. Previous 10px label, 3.8:1 zero counts, 4.3:1 blunder red, 3.6:1 selected eval all resolved (now 11px, 6.17, 5.08-5.82, 7.57). 390px: no overflow in Summary, Moves, mistake or Retry states.

Prior priority issues: P0 phone overflow fixed; P1 turning points mostly fixed; P1 retry spoiler partly fixed; P1 phone controls fixed; P2 numbers mostly fixed.

Priority issues:
1. [P1] Retry still spoiled: best-move arrow (Board showBest) and "Best was X" (MoveCard.tsx:119) show before the user chooses Retry. Fix: hide both on retry-able moves until attempt, Show answer, or leaving the move. (harden)
2. [P1] Phone: jumping to a key moment from Summary leaves the board off-screen (top -488px). Fix: scroll the board into view on small screens in go() when jumping from Summary/list. (adapt)
3. [P2] "Key moments" (max 4) vs "Next key move" (~12 notable moves) are different sets; review has no ending. Fix: primary nav steps key moments with "3 of 4"; end card "That's what decided it". (distill, delight)
4. [P2] Engine line can stop mid-exchange (followUpLine quiet cutoff ignores pending recapture: 8...Bxc3 without bxc3 looks like losing a knight); wrong retry gives no reason. Fix: apply exchangeOver before quiet cutoff; one-line "why" on wrong try. (clarify)
5. [P3] Desktop summary box shows 1 moment at 859px tall; page scrolls ~180px because the sr-only caption escapes the non-positioned scroll container. Fix: `relative` on SummaryCard root; give the panel height back. (layout)

Persona red flags: Jordan (raw evals +24.5, M4 without side, misleading line, no closure); Alex (no my-mistakes-only stepping, graph dots no tooltip, dead key-move buttons on clean games); Casey (board off-screen after jump, targets 28-36px < 44px, Copy link/Back at page bottom); Sam (game-mode move changes not announced, no text position, shortcuts only in hover titles).

Minor: EvalGraph off-system greys #8a857d/#6b665f; "Check it in my browser" 12px micro-copy; vague brilliant-move gist; no shortcut sheet; Summary/key-moment mismatch with me-set and zero own moments (Review.tsx:73 CTA says Start review).

Questions: Should Moves step only the deciding moments by default? Should the review end on one sentence naming what decided the game? Should the arrow ever appear on a mistake before the player has tried?
