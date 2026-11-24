"""Shared review cache in D1 (schema: api/schema.sql). `db` is the env.DB binding."""

import json

PER_MINUTE = 5
PER_DAY = 60
REPORTS_PER_DAY = 10
DAY = 86_400


def platform_of(headers: dict) -> str:
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


async def player_reviews(db, platform: str, username: str, limit: int = 50) -> list[dict]:
    """Stored reviews on `platform` where `username` played either side, newest first (case-insensitive)."""
    result = await (
        db.prepare(
            "SELECT game_hash, white_username, black_username, created_at, report_json FROM analyzed_games"
            " WHERE platform = ?1 AND (white_username = ?2 COLLATE NOCASE OR black_username = ?2 COLLATE NOCASE)"
            " ORDER BY created_at DESC LIMIT ?3"
        )
        .bind(platform, username, limit)
        .all()
    )
    return result["results"]


async def stored_accuracies(db, hashes: list[str]) -> dict[str, dict]:
    """{hash: {"white": acc, "black": acc}} for the hashes that have a stored review."""
    if not hashes:
        return {}
    marks = ",".join("?" * len(hashes))
    result = await db.prepare(f"SELECT game_hash, white_accuracy, black_accuracy FROM analyzed_games WHERE game_hash IN ({marks})").bind(*hashes).all()
    return {r["game_hash"]: {"white": r["white_accuracy"], "black": r["black_accuracy"]} for r in result["results"]}


async def allow_analysis(db, ip: str, now: int, force_prune: bool = False) -> bool:
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
    if allowed and (force_prune or now % 10 == 0):
        await db.prepare("DELETE FROM analysis_requests WHERE created_at <= ?").bind(now - DAY).run()
    return allowed


async def claim_ai_slot(db, game_hash: str, now: int, cap: int, force_prune: bool = False) -> bool:
    """Atomically claim one Workers AI call for `game_hash` if the rolling 24h cap has room."""
    result = await (
        db.prepare(
            "INSERT OR IGNORE INTO ai_calls (game_hash, created_at) SELECT ?1, ?2"
            " WHERE (SELECT COUNT(*) FROM ai_calls WHERE created_at > ?2 - ?3) < ?4"
        )
        .bind(game_hash, now, DAY, cap)
        .run()
    )
    claimed = result["meta"]["changes"] == 1
    if claimed and (force_prune or now % 10 == 0):
        await db.prepare("DELETE FROM ai_calls WHERE created_at <= ?").bind(now - DAY).run()
    return claimed


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
            platform_of(h),
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


async def add_coach_report(db, game_hash: str, ply: int, reason: str, ip: str, now: int) -> bool:
    """Record a user report on an AI coach note if `ip` is under the daily limit; False means rate limited."""
    result = await (
        db.prepare(
            "INSERT INTO coach_reports (game_hash, ply, reason, ip, created_at) SELECT ?1, ?2, ?3, ?4, ?5"
            " WHERE (SELECT COUNT(*) FROM coach_reports WHERE ip = ?4 AND created_at > ?5 - ?6) < ?7"
        )
        .bind(game_hash, ply, reason, ip, now, DAY, REPORTS_PER_DAY)
        .run()
    )
    return result["meta"]["changes"] == 1
