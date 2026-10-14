"""Shared review cache in D1 (schema: api/schema.sql). `db` is the env.DB binding."""

import json

PER_MINUTE = 5
PER_DAY = 30
DAY = 86_400


def _platform(headers: dict) -> str:
    site = headers.get("Site", "").lower()
    return "chesscom" if "chess.com" in site else "lichess" if "lichess" in site else "custom"


def _int(value: str | None) -> int | None:
    try:
        return int(value) if value else None
    except ValueError:
        return None


async def get_review(db, game_hash: str) -> dict | None:
    row = await db.prepare("SELECT report_json FROM analyzed_games WHERE game_hash = ?").bind(game_hash).first()
    return json.loads(row["report_json"]) if row else None


async def allow_analysis(db, ip: str, now: int) -> bool:
    """Record a new analysis for `ip` if it is under both limits; False means rate limited.

    Check and insert are one statement, so concurrent requests can't both slip under the limit.
    """
    result = await (
        db.prepare(
            "INSERT INTO analysis_requests (ip, created_at) SELECT ?1, ?2"
            " WHERE (SELECT COUNT(*) FROM analysis_requests WHERE ip = ?1 AND created_at > ?2 - 60) < ?3"
            " AND (SELECT COUNT(*) FROM analysis_requests WHERE ip = ?1 AND created_at > ?2 - ?5) < ?4"
        )
        .bind(ip, now, PER_MINUTE, PER_DAY, DAY)
        .run()
    )
    allowed = result["meta"]["changes"] == 1
    if allowed:
        await db.prepare("DELETE FROM analysis_requests WHERE created_at <= ?").bind(now - DAY).run()
    return allowed


async def reviews_last_day(db) -> int:
    """New shared reviews in the past 24 hours: each one cost one coach AI call."""
    row = await db.prepare("SELECT COUNT(*) AS n FROM analyzed_games WHERE created_at > datetime('now', '-1 day')").first()
    return row["n"] if row else 0


async def put_review(db, report: dict, pgn: str) -> None:
    """First writer wins: a concurrent duplicate analysis is simply dropped."""
    h = report["headers"]
    await (
        db.prepare(
            "INSERT OR IGNORE INTO analyzed_games (game_hash, platform, white_username, black_username, white_elo, black_elo,"
            " white_accuracy, black_accuracy, white_est_elo, black_est_elo, pgn, report_json)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(
            report["hash"],
            _platform(h),
            h.get("White"),
            h.get("Black"),
            _int(h.get("WhiteElo")),
            _int(h.get("BlackElo")),
            report["accuracy"]["white"],
            report["accuracy"]["black"],
            report["elo"]["white"],
            report["elo"]["black"],
            pgn,
            json.dumps(report, separators=(",", ":")),
        )
        .run()
    )
