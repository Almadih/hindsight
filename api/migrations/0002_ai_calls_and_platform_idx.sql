-- Atomic AI call dedup/cap table and platform-scoped player lookup indexes.
-- Applied by the deploy workflow (pywrangler d1 migrations apply DB --remote). Safe to re-run.
CREATE INDEX IF NOT EXISTS idx_platform_white ON analyzed_games(platform, white_username COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_platform_black ON analyzed_games(platform, black_username COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS ai_calls (
    game_hash TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_calls_time ON ai_calls(created_at);
