---
target: review screen
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 3
target_identity: "file:/home/almadih/Desktop/Work/personal/chess.com-game-review-v3/web/components/Review.tsx"
target_fingerprint: "sha256:0290622171c7258312c952ba338633cfb94dafd64cc454ec671e456c5f6d2111"
target_path: /home/almadih/Desktop/Work/personal/chess.com-game-review-v3/web/components/Review.tsx
timestamp: 2026-10-14T18-03-33Z
slug: web-components-review-tsx
closed: true
---
# Critique: review screen (web/components/Review.tsx)
Assessments A (design review) and B (detector + browser) ran as isolated sub-agents.

Design specificity: grounded (board carries the verdict: badge on target square, verdict tint, best-move arrow; warm graphite ladder), but stops at Chess.com parity; nothing designs for "know the 2-3 moments that decided the game".

Heuristics (24/40): status 3, real-world match 2, control 3, consistency 3, error prevention 2, recognition 2, flexibility 2, minimalism 3, error recovery 3, help 1.

Detector (browser): eval-bar label 10px (EvalBar.tsx:23); low contrast: zero counts 3.8:1 and blunder red 4.3:1 (SummaryCard.tsx:64/71), selected move eval 3.6:1 (MoveList.tsx:34); bounce-easing on eval bar (intentional, user-requested energy); overused-font Geist (false positive: design system). CLI scan clean. Board coordinate labels/unnamed pieces come from react-chessboard.

Priority issues:
1. [P0] Phone horizontal overflow (scrollWidth 532 at 390): Review.tsx main grid has no base column template; truncate opening line forces 520px track. Fix: grid-cols-[minmax(0,1fr)] / min-w-0 aside; same in AnalysisLive.tsx. (adapt)
2. [P1] No turning-point surface: Summary is rings + ~15 numbers per player; Moves is a flat 47-button list. Fix: "Key moments" block (2-3 biggest swings per side, jump), Next/Previous mistake (N/P), Start review jumps to first key moment. (distill/layout)
3. [P1] Retry gives away its answer: "Show follow-up" before "Retry"; eval bar shows post-mistake eval in retry/line modes; drag-only; plain-text success. Fix: Retry first/primary, follow-up after attempt or "Show answer", pre-move eval in retry, click-to-move, Best badge pop on success, numbered + steppable follow-up line. (harden/delight)
4. [P1] Phone controls ~1200px below board; keyboard-only hint. Fix: below lg, sticky nav + move card directly under board, swipe to step, "Tap ›" hint. (adapt)
5. [P2] Numbers without meaning: "M4" without side, "-0.0", "93.6% accuracy" on Best moves, unexplained Game rating/eval, verdict ladder not linked; contrast/size items above. (clarify)

Persona red flags: beginner (White always at bottom, rings + red blunder count first, opaque evals, no "your 3 mistakes"); 1800 player (no next-mistake jump, tiny dot targets without tooltips, unsteppable follow-up); phone (overflow, distant nav, drag-only retry, keyboard hint).

Minor: Summary clipped at 808px-tall desktop; move list ~5 rows; opening truncated without tooltip; #8a857d ring colour off-system; tablist arrow keys hijacked; shortcuts force Moves tab; AnalysisLive hard-coded orientation, no-op graph cursor, progress overstates, no cancel; Re-analyze has no confirmation and spends the rate limit.

Questions: Should the Summary be the key moments? Should the review page borrow the landing's epic tier for the 1-2 decisive moments?
