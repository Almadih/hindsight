# Chess Game Review Platform — Architecture & Implementation Plan (`plan.md`)

## 1. Project Overview
A full-featured chess game analysis web application modeled after **Chess.com's Game Review**. Users can either paste a raw PGN or enter their **Chess.com / Lichess username** to fetch their game history, run deep engine analysis, and receive a full interactive breakdown featuring:
- **CAPS-style Accuracy Scores** ($0\text{–}100\%$) for both players and per game phase (Opening, Middlegame, Endgame).
- **Move Classifications** (`Book`, `Brilliant !!`, `Great !`, `Best`, `Excellent`, `Good`, `Inaccuracy ?!`, `Mistake ?`, `Miss`, `Blunder ??`).
- **Single-Game Performance ELO Estimation**.
- **Tactical Insights & Virtual Coach Commentary** (detecting pins, forks, sacrifices, missed mates, and hanging pieces, paired with LLM-generated explanations).
- **Chess.com-Inspired Split-Pane UI** (Evaluation bar, interactive board with SVG arrows/badges, coach card, retry-mistake mode, and clickable evaluation graph).

---

## 2. System Architecture (Hybrid Edge + Client Model)

To achieve **zero server compute cost for Stockfish** while maintaining full access to Python's rich chess ecosystem (`python-chess`), the architecture splits raw engine evaluation and tactical classification across the browser and **Cloudflare Python Workers**.


```

+-------------------------------------------------------------------------+
|                           BROWSER (Frontend)                            |
|  Next.js (React + TS) | react-chessboard | chess.js | Recharts          |
|                                                                         |
|  [ Web Worker Pool (2-4 threads) ]                                      |
|  -> Runs stockfish.wasm (NNUE Lite) at Depth 16-18, MultiPV = 3         |
|  -> Emits { fen, cp, mate, multipv: [pv1, pv2, pv3] } for every ply     |
+------------------------------------+------------------------------------+
|
POST /api/analyze (PGN + Raw Evals)
|
v
+-------------------------------------------------------------------------+
|                    CLOUDFLARE PYTHON WORKER (Backend)                   |
|  FastAPI + python-chess (Pyodide Runtime via uv & pywrangler)           |
|                                                                         |
|  1. Game Fetcher Proxy: Fetches & caches Chess.com / Lichess archives   |
|  2. Opening Book Matcher: Checks FENs against ECO database in KV        |
|  3. Move Classifier: Computes Win%, Accuracy, ELO, & Move Badges        |
|  4. Tactical Heuristics: Uses python-chess bitboards (pins, forks,      |
|     sacrifices, hanging pieces, forced mates)                           |
|  5. AI Coach: Calls Cloudflare Workers AI for critical move summaries   |
+-----------------+------------------+------------------+-----------------+
|                  |                  |
v                  v                  v
+-----------------+  +---------------+  +---------------+
|  Cloudflare D1  |  | Cloudflare KV |  |  Workers AI   |
| (SQLite Store)  |  | (Cache & ECO) |  | (Llama 3.1 /  |
| Analyzed Games  |  | Opening Book  |  |  Coach Text)  |
+-----------------+  +---------------+  +---------------+

```

---

## 3. Tech Stack

### Frontend
- **Framework:** Next.js (App Router, TypeScript) deployed on Cloudflare Pages/Workers.
- **Board UI:** `react-chessboard` (or `chessground`) with custom SVG layers for move arrows and top-right square classification badges (`!!`, `!`, `?`, `??`).
- **Client Chess State:** `chess.js` (move validation, variation tree exploration, PGN traversal).
- **Client Engine:** `stockfish.wasm` (running inside Web Workers with `MultiPV=3`).
- **Styling & Charts:** Tailwind CSS + Recharts (interactive evaluation area chart).

### Backend (Cloudflare Edge)
- **Runtime:** Cloudflare Python Workers (`Pyodide` / Python 3.12+).
- **Framework & Tooling:** `FastAPI` + `python-chess`, managed via `uv` and `pywrangler`.
- **Database:** **Cloudflare D1** (serverless SQLite) for storing analyzed game reports so no game is ever analyzed twice.
- **Caching & Static Data:** **Cloudflare KV** for caching Chess.com/Lichess monthly archives and storing the ECO Opening Book FEN dictionary.
- **LLM Coach:** **Cloudflare Workers AI** (`@cf/meta/llama-3.1-8b-instruct`) bound directly via `env.AI.run()`.

---

## 4. Core Algorithms & Feature Specifications

### 4.1 Win Probability & Accuracy Math
1. **Centipawns to Win Percentage ($W\%$):**
   $$W\% = 50 + 50 \times \left( \frac{2}{1 + e^{-0.00368208 \times cp}} - 1 \right)$$
   *(Mate scores are mapped to $\pm 10000\text{ cp}$ scaled by distance to mate).*
2. **Win Probability Lost ($\Delta W$):**
   $$\Delta W = \max(0, W_{\text{before}} - W_{\text{after}})$$
3. **Move Accuracy ($0\text{–}100$):**
   $$\text{Accuracy} = 103.1668 \times e^{-0.04354 \times \Delta W} - 3.1669$$
4. **Game & Phase Accuracy:** Weighted harmonic/arithmetic mean of move accuracies across Opening (moves 1–12), Middlegame, and Endgame (when minor/major piece count $\le 6$).

### 4.2 Move Classification Matrix (`python-chess` + Engine MultiPV)
| Badge | Symbol | Trigger Logic |
| :--- | :---: | :--- |
| **Book** | `📖` | Position FEN (stripped of move counters) exists in the ECO Opening Book KV store. |
| **Brilliant** | `!!` | Top move ($\Delta W < 2\%$) + **Material Sacrifice** (piece moved to a square attacked by a lower-value piece or leaves a friendly piece undefended via `board.attackers()`) + Position was not already overwhelmingly won ($W_{\text{before}} < 85\%$). |
| **Great Move** | `!` | Player played `PV1`, and the **MultiPV gap** between `PV1` and `PV2` is $\ge 20\%$ Win Probability (found the *only* winning or saving move). |
| **Best** | `★` | Player played the engine's `#1` choice (`PV1`) or $\Delta W < 1\%$. |
| **Excellent** | `👍` | $1\% \le \Delta W < 3\%$. |
| **Good** | `✓` | $3\% \le \Delta W < 5\%$. |
| **Inaccuracy** | `?!` | $5\% \le \Delta W < 10\%$. |
| **Mistake** | `?` | $10\% \le \Delta W < 20\%$. |
| **Blunder** | `??` | $\Delta W \ge 20\%$ (or throws away a forced mate / steps into a forced mate). |
| **Miss** | `❌` | Opponent blundered on the immediately preceding ply ($\Delta W_{\text{opp}} \ge 15\%$), and the player failed to play the punishing tactical line ($\Delta W \ge 10\%$). |

### 4.3 Tactical Insight Detector (`python-chess`)
Before passing key moves to the AI Coach, `python-chess` extracts deterministic facts by comparing the board state across the engine's `PV1` line (3–4 plies deep):
- **Hanging Piece:** `len(board.attackers(enemy, sq)) > len(board.attackers(ally, sq))`
- **Pin Detection:** `board.is_pinned(color, square)`
- **Fork Detection:** A single moved piece attacks $\ge 2$ enemy pieces of higher value or undefended status.
- **Missed Mate:** `eval_before.is_mate()` vs `not eval_after.is_mate()`.

### 4.4 Single-Game ELO Estimation
- Anchors to the player's actual rating from the PGN headers (or `1200` default for anonymous PGNs).
- Computes **Average Centipawn Loss (ACPL)** and **Position Complexity** (average spread between `PV1` and `PV3`).
- Maps performance against an empirical sigmoid curve and clamps within $\pm 600$ ELO of the base rating.

---

## 5. API Endpoints & D1 Database Schema

### API Routes (FastAPI on Cloudflare Worker)
- `GET /api/games/{platform}/{username}` — Fetches recent games from Chess.com (`api.chess.com/pub/player/{user}/games/archives`) or Lichess, cached in Cloudflare KV.
- `GET /api/review/{game_hash}` — Checks D1 for an existing analyzed report.
- `POST /api/analyze` — Accepts `{ pgn, evals[] }`, runs `python-chess` classification + Workers AI coach generation, stores the result in D1, and returns the full JSON report.

### Cloudflare D1 Schema (`schema.sql`)
```sql
CREATE TABLE IF NOT EXISTS analyzed_games (
    game_hash TEXT PRIMARY KEY,          -- SHA-256 of normalized PGN moves
    platform TEXT,                       -- 'chesscom' | 'lichess' | 'custom'
    white_username TEXT,
    black_username TEXT,
    white_elo INTEGER,
    black_elo INTEGER,
    white_accuracy REAL,
    black_accuracy REAL,
    white_est_elo INTEGER,
    black_est_elo INTEGER,
    pgn TEXT NOT NULL,
    report_json TEXT NOT NULL,           -- Full move-by-move classifications & coach comments
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_players ON analyzed_games(white_username, black_username);

```

---

## 6. UI/UX Layout Specification

* **Left/Center Viewport (Board Area):**
* Vertical **Evaluation Bar** (smooth CSS height transition, flips automatically when board flips).
* **Chessboard** with custom SVG overlay (Green arrow = Best move, Red/Orange arrow = Played blunder, Top-right square badge = Move classification icon).
* Top/Bottom **Player Bars** (Avatar, username, rating, material difference `+3`, captured piece icons).


* **Right Viewport (Review Sidebar):**
* **View 1: Summary Report Card:** Dual accuracy rings, Move Classification count table (`!!`, `!`, `★`, `?`, `??`), Est. Game Rating badges, and Phase ratings (`Opening`, `Middlegame`, `Endgame`).
* **View 2: Interactive Coach & Move List:**
* **Coach Header:** Avatar + speech bubble with tactical insight + `[Show Follow-Up]` (plays out `PV1` on the board) and `[Retry Move]` buttons.
* **Move Table:** 2-column scrollable move history with color-coded badges and eval scores (`+1.4`).
* **Eval Graph:** Clickable area chart at the bottom showing game momentum and blunder spikes.





---

## 7. Phased Implementation Roadmap

* **Phase 1: Backend Foundation (`pywrangler` + `python-chess`)**
* Initialize Cloudflare Python Worker with FastAPI and `python-chess`.
* Build `/api/games/{platform}/{username}` fetcher for Chess.com and Lichess.
* Set up D1 database and KV namespace bindings in `wrangler.toml`.


* **Phase 2: Client Engine Pipeline (`stockfish.wasm`)**
* Build the Next.js Web Worker manager that loads `stockfish.wasm`, parses a PGN with `chess.js`, and evaluates every position at `MultiPV = 3`, streaming progress (`0–100%`).


* **Phase 3: Classification & Tactical Engine**
* Implement Win%, CAPS Accuracy, ELO estimation, and move badge rules in Python.
* Load ECO opening book into KV and implement `Brilliant !!` / `Great !` / `Miss` detectors.


* **Phase 4: Coach AI Integration**
* Connect `env.AI.run("@cf/meta/llama-3.1-8b-instruct")` to turn structured `python-chess` tactical facts on key blunders/brilliancies into concise coach commentary.


* **Phase 5: Chess.com-Style Frontend UI**
* Build the split-pane layout, Evaluation Bar, SVG arrow/badge overlays on `react-chessboard`, Evaluation Graph, and interactive `Show Follow-Up` / `Retry` modes.
