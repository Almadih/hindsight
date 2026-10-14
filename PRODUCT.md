# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Anyone who plays chess online, from beginners to strong players. They have just played a game on Chess.com or Lichess (or have a PGN from anywhere) and want to understand what happened: where it turned, what they missed, what they should have played. Language must stay plain and approachable; no prior engine or notation expertise assumed beyond reading moves.

## Product Purpose

A free game review in the style players already know from Chess.com's Game Review: paste a PGN or enter a Chess.com / Lichess username, pick a game, and get every move classified (Book, Brilliant, Great, Best, Excellent, Good, Inaccuracy, Mistake, Miss, Blunder), accuracy per player and per phase, a single-game rating estimate, an evaluation graph, coach comments on the key moments, the engine's short follow-up line, and a chance to retry mistakes on the board. Success: a player finishes a review knowing the two or three moments that decided their game.

## Positioning

Free and account-free, for both Chess.com and Lichess games, with the review format players already recognise. Independent: inspired by Chess.com's Game Review, not affiliated with or endorsed by Chess.com or Lichess.

## Operating Context

- Entry points: a Chess.com or Lichess username (recent games are fetched and listed) or a pasted PGN.
- First review of a game takes roughly 20–45 seconds of engine analysis plus a few seconds for coach notes; reviews are then shared, so reopening a game anyone has reviewed is near-instant.
- Users can re-run a shared review with their own analysis if they doubt it.
- Desktop is the primary review environment; phones must work for the full flow.

## Capabilities and Constraints

- Live at https://chess-review.almadih.workers.dev (Cloudflare Workers: Python API + static Next.js export).
- Per-IP limits on new analyses (5/minute, 30/day) and a daily ceiling on AI coach calls; past the ceiling, coach comments fall back to deterministic tactical facts.
- Only standard chess (no variants).
- Board pieces: Staunty set by sadsnake1, CC BY-NC-SA 4.0 — requires attribution and keeps the product non-commercial while it is used.
- Chess.com's own piece art and annotation icons must not be copied; our annotation icons are original drawings in a familiar visual language.

## Brand Commitments

- Name: **Hindsight** — provisional, proposed during the landing page work; the owner may rename it.
- Must state plainly that the product is independent and not affiliated with Chess.com or Lichess.

## Evidence on Hand

- Confirmed claims: free, no account required; works with Chess.com and Lichess games; not affiliated with Chess.com.
- Not confirmed for marketing use: "the engine runs on your device" (true technically, but not approved as a claim).
- No testimonials, user counts, ratings, press, or benchmarks exist. Do not fabricate any.

## Product Principles

1. Explain, don't just score: every number should lead to a moment the player can look at.
2. Familiar first: match the review vocabulary players already know rather than inventing new terms.
3. Zero friction to the first review: no account, no setup, one input.
4. Honest about what it is: independent, free, and transparent about where reviews come from.
