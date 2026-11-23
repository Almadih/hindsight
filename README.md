# Hindsight Chess

**Live: [hindsight.almadih.dev](https://hindsight.almadih.dev)** · [How it works](https://hindsight.almadih.dev/how-it-works) · **[Android app (APK)](https://github.com/Almadih/hindsight/releases/latest/download/hindsight.apk)**

![Hindsight Chess](web/app/opengraph-image.png)

Free chess game review: paste a PGN or enter a Chess.com / Lichess username, and every move gets a verdict
(Brilliant … Blunder), with accuracy, a single-game rating estimate, coach notes, the engine's follow-up line
and a retry mode. No account, up to 60 new reviews a day.

Stockfish runs in the browser (or natively in the Android app); a Cloudflare Python Worker classifies moves, stores shared reviews in D1,
caches game lists in KV and writes coach notes with Workers AI.

## Android app

Review games on your phone: the same verdicts, accuracy, coach notes and retry mode, with Stockfish running
natively on the device. Free and no account. It opens shared `hindsight.almadih.dev/review` and `/player` links
straight in the app.

Install: download [`hindsight.apk`](https://github.com/Almadih/hindsight/releases/latest/download/hindsight.apk)
from the [latest release](https://github.com/Almadih/hindsight/releases/latest) and allow installs from your browser
when Android asks. It isn't on Google Play.

## Blog posts

- [Building Hindsight: A Free, Edge-Powered Chess Game Review Platform](https://blog.almadih.dev/posts/building-hindsight-free-chess-game-review)
- [From 108 Seconds to 3.4: Making Hindsight's On-Device Chess Analysis 32× Faster](https://blog.almadih.dev/posts/hindsight-mobile-analysis-32x-faster)

## Layout

- `api/` — Python Worker (FastAPI + python-chess). Also serves the static site from `web/out`.
- `web/` — Next.js static export: landing page, review UI, Stockfish worker pool.
- `mobile/` — Flutter Android app. Talks to the live API; Stockfish is compiled into the app (`android/app/src/main/cpp`, CMake/NDK) and driven over FFI by a native worker pool.
- `PRODUCT.md`, `DESIGN.md` — product record and design system.

## Develop

```sh
cd web && npm install && npm run build     # builds web/out (also copies Stockfish into public/)
cd ../api && uv sync && uv run pywrangler dev --port 8787
```

Restart `pywrangler dev` after every `npm run build`; rebuilding `web/out` under a running server breaks asset serving.
Local D1 needs the schema once: `uv run pywrangler d1 execute DB --local --file schema.sql`.
Workers AI always runs remotely (billed) even in local dev.

Mobile (Flutter, Android SDK and NDK; the app uses the production API):

```sh
cd mobile && flutter pub get && flutter run      # on a connected device or emulator
```

## Test

```sh
cd api && uv run pytest
cd web && npm run lint && node lib/followup.check.ts
cd mobile && flutter analyze && flutter test
```

## Deploy

```sh
cd web && npm run build && cd ../api && uv run pywrangler deploy
```

Schema changes: `uv run pywrangler d1 execute DB --remote --file schema.sql` (statements are idempotent).

Pushes to `main` deploy automatically (`.github/workflows/deploy.yml`, needs the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repository secrets). It also applies new files in `api/migrations` with `pywrangler d1 migrations apply DB --remote`.

Android releases: bump `version` in `mobile/pubspec.yaml` and push a `v*` tag (e.g. `v1.0.8`). `.github/workflows/mobile.yml`
analyzes, tests, builds a release-signed APK and attaches it to the GitHub release as `hindsight.apk`, so the
`releases/latest/download/hindsight.apk` link always serves the newest build. Needs the `ANDROID_KEYSTORE_BASE64`,
`ANDROID_KEYSTORE_PASSWORD` and `ANDROID_KEY_ALIAS` repository secrets.

## Third-party assets

- Chess pieces: Staunty by sadsnake1, CC BY-NC-SA 4.0 (`web/public/pieces/staunty/LICENSE.md`); non-commercial only.
- Sounds: Chess piece movement sound effects (`web/public/sfx/LICENSE.md`).
- Opening names: lichess-org/chess-openings.

Hindsight is independent and not affiliated with Chess.com or Lichess.
