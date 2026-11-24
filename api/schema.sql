-- Apply locally:  npx wrangler d1 execute DB --local --file schema.sql
CREATE TABLE IF NOT EXISTS analyzed_games (
    game_hash TEXT PRIMARY KEY,          -- SHA-256 of analysis version + start position + UCI moves
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
    report_json TEXT NOT NULL,           -- full review as returned by POST /api/analyze
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_games_created ON analyzed_games(created_at);

-- One row per new analysis, for the per-IP limits in store.allow_analysis. Rows older than a day are pruned.
CREATE TABLE IF NOT EXISTS analysis_requests (
    ip TEXT NOT NULL,
    created_at INTEGER NOT NULL          -- unix seconds
);

CREATE INDEX IF NOT EXISTS idx_requests_ip ON analysis_requests(ip, created_at);
CREATE INDEX IF NOT EXISTS idx_requests_time ON analysis_requests(created_at);

-- Player pages look reviews up by platform + username, case-insensitively.
CREATE INDEX IF NOT EXISTS idx_white_nocase ON analyzed_games(white_username COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_black_nocase ON analyzed_games(black_username COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_platform_white ON analyzed_games(platform, white_username COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_platform_black ON analyzed_games(platform, black_username COLLATE NOCASE);

-- One row per Workers AI coach call, for atomic deduplication and daily cap in store.claim_ai_slot.
CREATE TABLE IF NOT EXISTS ai_calls (
    game_hash TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL          -- unix seconds
);

CREATE INDEX IF NOT EXISTS idx_ai_calls_time ON ai_calls(created_at);

-- User reports of AI-generated coach notes (Google Play AI-Generated Content policy).
CREATE TABLE IF NOT EXISTS coach_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_hash TEXT NOT NULL,
    ply INTEGER NOT NULL,
    reason TEXT NOT NULL,
    ip TEXT NOT NULL,
    created_at INTEGER NOT NULL          -- unix seconds
);

CREATE INDEX IF NOT EXISTS idx_coach_reports_ip ON coach_reports(ip, created_at);
