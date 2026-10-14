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

CREATE INDEX IF NOT EXISTS idx_players ON analyzed_games(white_username, black_username);

-- One row per new analysis, for the per-IP limits in store.allow_analysis. Rows older than a day are pruned.
CREATE TABLE IF NOT EXISTS analysis_requests (
    ip TEXT NOT NULL,
    created_at INTEGER NOT NULL          -- unix seconds
);

CREATE INDEX IF NOT EXISTS idx_requests_ip ON analysis_requests(ip, created_at);
CREATE INDEX IF NOT EXISTS idx_requests_time ON analysis_requests(created_at);
