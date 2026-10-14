# Hindsight

Free chess game review: paste a PGN or enter a Chess.com / Lichess username, and every move gets a verdict
(Brilliant … Blunder), with accuracy, a single-game rating estimate, coach notes, the engine's follow-up line
and a retry mode. Live at https://chess-review.almadih.workers.dev.

Stockfish runs in the browser; a Cloudflare Python Worker classifies moves, stores shared reviews in D1,
caches game lists in KV and writes coach notes with Workers AI.

## Layout

- `api/` — Python Worker (FastAPI + python-chess). Also serves the static site from `web/out`.
- `web/` — Next.js static export: landing page, review UI, Stockfish worker pool.
- `PRODUCT.md`, `DESIGN.md` — product record and design system.

## Develop

```sh
cd web && npm install && npm run build     # builds web/out (also copies Stockfish into public/)
cd ../api && uv sync && uv run pywrangler dev --port 8787
```

Restart `pywrangler dev` after every `npm run build`; rebuilding `web/out` under a running server breaks asset serving.
Local D1 needs the schema once: `uv run pywrangler d1 execute DB --local --file schema.sql`.
Workers AI always runs remotely (billed) even in local dev.

## Test

```sh
cd api && uv run pytest
cd web && npm run lint && node lib/followup.check.ts
```

## Deploy

```sh
cd web && npm run build && cd ../api && uv run pywrangler deploy
```

Schema changes: `uv run pywrangler d1 execute DB --remote --file schema.sql` (statements are idempotent).

## Third-party assets

- Chess pieces: Staunty by sadsnake1, CC BY-NC-SA 4.0 (`web/public/pieces/staunty/LICENSE.md`); non-commercial only.
- Sounds: Pixabay Content License (`web/public/sfx/LICENSE.md`).
- Opening names: lichess-org/chess-openings.

Hindsight is independent and not affiliated with Chess.com or Lichess.
