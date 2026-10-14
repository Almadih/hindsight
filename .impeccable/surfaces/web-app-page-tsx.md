---
version: 1
slug: "web-app-page-tsx"
primary_target: "web/app/page.tsx"
related_targets: []
---

# Landing page (/)

Scope: the public front door at `/`. Visitor mode: Persuade. Audience: anyone who plays online (PRODUCT.md). Action: enter a Chess.com or Lichess username (or paste a PGN) and start a review. Proof: a real Hindsight review of the Opera Game (Morphy, Paris 1858), baked from the live API; no testimonials or numbers exist and none are invented. Constraints: claims limited to free / no account / Chess.com + Lichess / not affiliated; Staunty pieces with attribution.

## Direction contract

THESIS: The landing page is the review screen performing: a large board replays a real reviewed game, badges land, the eval bar swings and the coach narrates, while the input rides the board like a player bar. It refuses the category default of headline, subcopy and button over a row of feature cards.

OWN-WORLD: The app's world: warm graphite ground (#1c1b19 / #262421 / #312e2a), the green-and-cream board with Staunty pieces, badge circles in their review colours as the only saturated colour, Geist at heavy display weight, tabular numerals.

STORY: In seconds the visitor watches a game get judged move by move, recognises the review format they know, learns it is free with no account, and types their username to see their own games.

FIRST VIEWPORT: Wordmark top-left. Eval bar flush left of a board sized to roughly the viewport height, centre-left. Right column: a display line ("Every move, judged.") and a live coach card synced to the replay. The input dock (platform switch, username field, primary button, "paste a PGN" toggle) floats across the board's lower ranks. On phones the dock sits under the board.

FORM: "The game plays itself" (the review screen in motion); position 1 on the ordered structure list; seed key 71c77fe4. Signature interaction: autoplay replay synced across board, badge, eval bar and coach card, pausing on hover or focus, static on reduced motion.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
