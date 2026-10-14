---
name: Hindsight
description: Free chess game review; every move judged on a warm graphite board-room.
colors:
  graphite-ground: "#1c1b19"
  graphite-surface: "#262421"
  graphite-raised: "#312e2a"
  graphite-line: "#3d3a35"
  bone-text: "#eceae6"
  ash-muted: "#a8a39b"
  board-green-accent: "#81b64c"
  accent-ink: "#141311"
  danger: "#ff7769"
  board-light: "#ebecd0"
  board-dark: "#739552"
  eval-white: "#f1efea"
  eval-track: "#403d39"
  move-current: "#4b4844"
  badge-brilliant: "#26c2a3"
  badge-great: "#749bbf"
  badge-best: "#81b64c"
  badge-excellent: "#96bc4b"
  badge-good: "#97af8b"
  badge-book: "#b39572"
  badge-inaccuracy: "#f7c631"
  badge-mistake: "#ffa459"
  badge-miss: "#ff7769"
  badge-blunder: "#fa412d"
typography:
  display:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "clamp(2.4rem, 5.4vw, 5.25rem)"
    fontWeight: 800
    lineHeight: 0.95
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "clamp(2rem, 3.6vw, 3.25rem)"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.035em"
  wordmark:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 800
    letterSpacing: "-0.04em"
  title:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.4
  lede:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.55
  body:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.625
  label:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.43
    fontFeature: "\"tnum\""
  mono:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "0.875rem"
    fontWeight: 400
rounded:
  bar: "3px"
  sm: "4px"
  md: "6px"
  lg: "8px"
  xl: "12px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "20px"
  xl: "32px"
  gutter-mobile: "16px"
  gutter: "32px"
  section: "80px"
  section-lg: "112px"
components:
  button-primary:
    backgroundColor: "{colors.board-green-accent}"
    textColor: "{colors.accent-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "12px 24px"
  button-primary-large:
    backgroundColor: "{colors.board-green-accent}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.lg}"
    padding: "16px 28px"
  button-pill-toggle:
    backgroundColor: "{colors.graphite-raised}"
    textColor: "{colors.ash-muted}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "6px 12px"
  segment-option:
    textColor: "{colors.ash-muted}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "4px 12px"
  segment-option-selected:
    backgroundColor: "{colors.graphite-raised}"
    textColor: "{colors.bone-text}"
    rounded: "{rounded.md}"
    padding: "4px 12px"
  input-field:
    backgroundColor: "{colors.graphite-surface}"
    textColor: "{colors.bone-text}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "12px 16px"
  game-finder-dock:
    backgroundColor: "{colors.graphite-ground}"
    rounded: "{rounded.xl}"
    padding: "16px"
  coach-card:
    backgroundColor: "{colors.graphite-raised}"
    textColor: "{colors.bone-text}"
    rounded: "{rounded.xl}"
    padding: "20px"
  move-card:
    backgroundColor: "{colors.graphite-raised}"
    rounded: "{rounded.md}"
    padding: "10px 12px"
  review-panel:
    backgroundColor: "{colors.graphite-surface}"
    rounded: "{rounded.lg}"
    padding: "16px"
  eval-chip:
    backgroundColor: "{colors.graphite-ground}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "4px 8px"
  eval-bar:
    backgroundColor: "{colors.eval-track}"
    rounded: "{rounded.bar}"
    width: "28px"
  annotation-badge:
    rounded: "{rounded.full}"
    textColor: "#ffffff"
    size: "20px"
---

# Design System: Hindsight

## Overview

**Creative North Star: "The Board Is the Brightest Thing in the Room"**

Hindsight lives in a warm graphite room where the green-and-cream board, the Staunty pieces and the review's annotation badges carry all the light. Every surface around the board steps up in small tonal increments of the same brown-black, so the eye goes to the board, then to the verdict colour, then to the words. The type is Geist at heavy display weight with tight tracking, plain and confident, with tabular numerals wherever a number can change.

The landing page is the review screen performing: a real reviewed game replays itself, badges slam onto squares, the eval bar swings and a coach card narrates. The review page is the same world at working volume: same board, same badges, same cards, quieter motion. Density is moderate. Panels are compact and functional, and the open space belongs to the board.

Annotation badges are flat by the user's explicit request. Chess.com's own piece art and icons are never copied; the pieces are Staunty (CC BY-NC-SA 4.0, credited in the footer) and sounds come from Pixabay.

**Key Characteristics:**
- Warm graphite tonal stack (ground, surface, raised, line); no cool greys.
- The ten badge colours are the only saturated colour besides the board-green accent.
- Flat badge discs with white SVG-path glyphs.
- Geist 800 display with negative tracking; tabular numerals on every eval, rating, accuracy and move number.
- Two motion tiers: "epic" on the landing replay, "subtle" on the review page; reduced motion collapses both to still frames.
- Sound is opt-in on every visit.

## Colors

A warm graphite neutral ladder holds back so the board's green-and-cream and the badge palette can speak.

### Primary
- **Board Green** (board-green-accent): the one interactive accent. Primary buttons, focus outlines, caret, selection tint (45% mix), the eval graph's current-ply line and the best-move arrow. It is the same green as the "Best" badge, so the action colour reads as the board's own colour.
- **Accent Ink** (accent-ink): near-black text on Board Green buttons.

### Secondary: the verdict palette
- **Brilliant** (badge-brilliant), **Great** (badge-great), **Best** (badge-best), **Excellent** (badge-excellent), **Good** (badge-good), **Book** (badge-book), **Inaccuracy** (badge-inaccuracy), **Mistake** (badge-mistake), **Miss** (badge-miss), **Blunder** (badge-blunder). Defined once in `web/lib/review.ts` and used for badge discs, the move-square tint (50% mix), eval-graph dots, verdict phrases in coach text, the turning-point top rules, the card flash and every move effect (`--fx`). Miss red also marks errors and "Lost" results. Blunder red is the check pulse and the Checkmate stamp.

### Tertiary: the board
- **Board Cream** (board-light) and **Board Green Dark** (board-dark): the board squares. They appear nowhere else.
- **Eval White** (eval-white) on **Eval Track** (eval-track): the eval bar and eval graph fill. The track also serves as Black's swatch in player bars.

### Neutral
- **Graphite Ground** (graphite-ground): page background, eval chips and the game-finder dock (at 92% opacity).
- **Graphite Surface** (graphite-surface): the review side panel and input fields.
- **Graphite Raised** (graphite-raised): cards (coach, move, game list), selected segments, the sound pill and nav buttons.
- **Graphite Line** (graphite-line): 1px borders, dividers, underline decoration, scrollbar thumb and the hover state on raised rows.
- **Move Current** (move-current): the selected row in the move list.
- **Bone** (bone-text): primary text.
- **Ash** (ash-muted): secondary text, placeholders and unselected controls.

### Named Rules
**The Verdict Owns Colour Rule.** Saturated colour beyond the board means a verdict. Never use a badge colour decoratively. When a badge colour appears, it names that badge.

**The Warm Ladder Rule.** Depth comes from stepping ground, surface, raised, line. Every new neutral is a warm brown-black on this ladder, never a neutral or cool grey.

## Typography

**Display Font:** Geist (via next/font, fallback system-ui, sans-serif)
**Body Font:** Geist
**Label/Mono Font:** Geist Mono, used only for PGN input

**Character:** One grotesque family worked from 400 to 800. Display lines are extra-bold and tightly tracked, like a scoresheet stamped in ink. Everything else stays plain.

### Hierarchy
- **Display** (800, clamp 2.4 to 5.25rem, 0.95): the landing headline only ("Every move, judged."). The closing call to action uses the same treatment at clamp 2.5 to 4.5rem.
- **Headline** (800, clamp 2 to 3.25rem, 1): landing section heads.
- **Wordmark** (800, 1.5rem, -0.04em): "Hindsight", top-left, set as text.
- **Title** (700, 1.25rem): verdict lines ("4. dxe5 is best") in the coach card and turning-point captions. The verdict phrase takes its badge colour; the move number stays Bone.
- **Lede** (400, 1.125rem, muted): section intros, held to 34 to 52ch.
- **Body** (400, 1rem, 1.625): coach notes and rules, `text-pretty`.
- **Label** (600, 0.875rem): controls, segments, meta lines and the eval chip.

### Named Rules
**The Tabular Rule.** Any number that changes or gets compared (eval, accuracy, rating, move number, percentage lost) is set with tabular numerals.

## Layout

The landing page is a 1400px max container with 16px gutters (32px from `sm`). On large screens it becomes two columns, `minmax(0,1fr)` and `minmax(340px,420px)`, at full viewport height. The board column is capped at `100dvh - 7.5rem` so the board is roughly viewport height. The game-finder dock floats over the board's lower ranks (bottom 5%, inset 7%). Below `lg` it stacks under the board. Later sections sit at 80px top padding (112 to 128px on `lg`), separated by space, a 2px badge-coloured top rule or a 1px line.

The review page is 1240px max, with a board column capped at `100dvh - 6rem` and a 320 to 380px side panel. It fills the viewport on `lg` and stacks on phones, with the move list scrolling inside itself and never moving the page.

The eval bar sits flush left of the board with an 8px gap, at a constant 28px width. Rhythm is 4/8/16/20/32: 20px pads cards, 16px pads panels and docks.

## Elevation & Depth

Mostly flat tonal layering. Shadows are reserved for the board and the things that float over it.

### Shadow Vocabulary
- **Landing board** (`0 24px 70px rgba(0,0,0,0.5)`): lifts the replay board off the ground.
- **Review board** (`0 6px 24px rgba(0,0,0,0.35)`): the same lift at working volume.
- **Floating dock** (`0 18px 50px rgba(0,0,0,0.55)` + 1px white/8% ring): the game finder riding the board.
- **Checkmate stamp** (`0 12px 40px rgba(0,0,0,0.5)`).
- **Verdict flash** (3px ring + 40px glow in the verdict colour, fading over 900ms): coach card on key verdicts. Motion only, not a resting state.

### Named Rules
**The Only-the-Board-Floats Rule.** Cards, panels and rows rest flat on the warm ladder. Only the board and what rides on it cast a shadow.

## Shapes

Gentle, small radii: 4px for tight controls and move cells, 6px for segments, move cards and the eval chip, 8px for inputs, buttons and the review panel, 12px for the coach card, game list and finder dock. The eval bar is a near-square 3px. Badges and the sound toggle are full circles or pills. The board itself is square-cornered. Move effects (sweep, sparks, rings) are clipped to the board's edge.

## Components

### Annotation Badge (signature)
- **Form:** a solid disc in the verdict colour with a bold white glyph, on a 20×20 viewBox. Glyphs are SVG paths (bang, query, star, thumb, check, book, cross) and are never live text, so they render identically on every OS.
- **Flat:** no highlight, rim, gradient or shadow. This is an explicit user decision.
- **On the board:** placed on the move's target square at 44% of the square, overhanging the square's top-right corner. On the visual top row or right column (orientation-aware), where the board clips, it tucks inside the corner instead. On the landing replay, key verdicts land larger (54 to 68%).
- **Sizes elsewhere:** 20px in move lists, 30px in turning-point captions, 34px in the coach card, 40px in the verdict ladder.

### Board
- Cream and green squares with Staunty pieces. The played move's from and to squares are tinted with the verdict colour at 50%. The best move is drawn as a Board Green arrow at 92% opacity (except on book moves).

### Eval Bar and Eval Graph
- **Bar:** 28px, Eval White fill on Eval Track. It grows from White's side and swings with a 700ms overshoot ease. A 10px tabular label sits at the leading side.
- **Graph:** a white area on the track, a dashed 50% midline, verdict-coloured dots on notable moves and a 2px Board Green line at the current ply. Clicking it jumps to that ply.

### Buttons
- **Primary:** Board Green, Accent Ink, bold, 8px radius, 12×24px (16×28px for the closing call to action). Hover brightens by 110%. Disabled is 60% opacity.
- **Pill toggle:** the sound switch, Raised pill, Ash text going Bone when pressed, with a stroke icon.
- **Text action:** Ash semibold going Bone on hover, optionally underlined with a Line-coloured decoration and 4px offset.
- **Icon nav (review):** Raised 4px tiles in a five-column row, hover to Line. 2px-stroke 24px SVG icons.

### Segmented Control
- Ash labels on a transparent (dock) or Ground (review tabs) track. The selected option fills with Raised and turns Bone. Implemented as radios or tabs.

### Inputs / Fields
- Surface fill, 1px Line border, 8px radius, 12×16px, Ash placeholder, accent caret. On focus the border turns Board Green, plus the global 2px Board Green outline with 2px offset. Errors appear as Miss-red text under the field with `role="alert"`.

### Cards
- **Coach card:** Raised, 12px, 20px padding, live region. Badge, coloured verdict line, then an eval chip (Ground, 6px, tabular) on one row, with the note below. Each move re-keys the card so the line rises in. Non-quiet verdicts flash the card in their colour.
- **Move card (review):** Raised, 6px, compact.
- **Game list:** Raised, 12px, Line-divided rows that hover to Line, with Won in Board Green and Lost in Miss red.

### Verdict Ladder
- Ten verdicts as one vertical scale with 40px badges on a 2px gradient spine (Brilliant to Inaccuracy to Blunder). Labels are in badge colour, with a tabular "winning chances lost" column. Book sits below a Line rule, off the scale.

### Motion
- **Epic tier (landing replay only):** the badge slams in (560ms, rotate and overshoot). The move gets a trail on its origin square, a flash and a double impact ring on its target, and the captured piece shatters. Brilliant and Great add a light sweep and 12 sparks. Blunder, Mistake and Miss shake the board through WAAPI (460ms, scaled 1 / 0.7 / 0.55), so the board never remounts. Check pulses the king red. Mate pulses the king, dims the board and stamps "Checkmate". All effects are clipped to the board. Replay tempo: book 520ms, ordinary 820ms, key verdicts 3.4s, end 5.6s. Hover or focus pauses the replay.
- **Subtle tier (review page):** badge-pop (320ms ease-out-expo), a soft impact ring, a flash, shatter and the check/mate pulse. No slam, sweep, sparks, shake or stamp.
- **Reduced motion:** badge and card animations stop, every `fx-*` layer is hidden and the eval bar stops transitioning. The landing page shows one still frame (Qb8+).
- **Sound:** off by default on every visit. The toggle click is the audio gesture. Each move plays a move or capture sound, then a verdict layer: check ping, sparkle on Brilliant or Great, bass impact on Blunder, Mistake or Miss, impact plus chime on mate.

## Do's and Don'ts

### Do:
- **Do** pull every verdict colour, label and phrase from `BADGE` in `web/lib/review.ts`. Never re-type hexes.
- **Do** keep badges flat: a solid disc and white SVG-path glyph, with no highlight, rim or shadow.
- **Do** overhang the board badge at the target square's top-right, and tuck it inside on the visual top row or right column.
- **Do** use the epic motion tier only on the landing replay, and the subtle tier on the review page. Gate every effect behind reduced motion.
- **Do** keep sound off until the visitor turns it on, every visit.
- **Do** set changing numbers in tabular numerals.
- **Do** credit Staunty (CC BY-NC-SA 4.0) and Pixabay wherever the pieces and sounds ship.

### Don't:
- **Don't** copy Chess.com's piece art, badge icons or other icons. Draw original glyphs.
- **Don't** render badge glyphs as text characters ("!!", "?", "★"). They are paths.
- **Don't** let move effects spill past the board's edge.
- **Don't** add shadows to cards, panels or rows. Only the board and what floats on it are lifted.
- **Don't** use badge colours for anything that isn't that verdict.
- **Don't** introduce cool or neutral greys. Neutrals stay on the warm graphite ladder.
