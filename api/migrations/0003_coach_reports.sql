-- Add coach_reports table for user-submitted flags on AI-generated coach notes.
-- Apply remotely: npx wrangler d1 execute DB --remote --file migrations/0003_coach_reports.sql
CREATE TABLE IF NOT EXISTS coach_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_hash TEXT NOT NULL,
    ply INTEGER NOT NULL,
    reason TEXT NOT NULL,
    ip TEXT NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_coach_reports_ip ON coach_reports(ip, created_at);
