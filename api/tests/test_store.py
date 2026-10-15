"""Runs store.py's SQL on real SQLite (what D1 is) through a minimal stand-in for the D1 binding."""

import asyncio
import pathlib
import sqlite3

from review.store import DAY, PER_DAY, PER_MINUTE, allow_analysis, player_reviews, stored_accuracies


class FakeD1:
    def __init__(self):
        self.conn = sqlite3.connect(":memory:")
        self.conn.executescript((pathlib.Path(__file__).parent.parent / "schema.sql").read_text())

    def prepare(self, sql):
        db = self

        class Stmt:
            args = ()

            def bind(self, *args):
                self.args = args
                return self

            async def run(self):
                cur = db.conn.execute(sql, self.args)
                return {"meta": {"changes": cur.rowcount}}

            async def all(self):
                cur = db.conn.execute(sql, self.args)
                cols = [c[0] for c in cur.description]
                return {"results": [dict(zip(cols, r)) for r in cur.fetchall()]}

        return Stmt()

    def count(self, ip):
        return self.conn.execute("SELECT COUNT(*) FROM analysis_requests WHERE ip = ?", (ip,)).fetchone()[0]


def allow(db, ip, now):
    return asyncio.run(allow_analysis(db, ip, now))


def test_per_minute_limit_and_reset():
    db = FakeD1()
    assert all(allow(db, "1.1.1.1", 1000) for _ in range(PER_MINUTE))
    assert not allow(db, "1.1.1.1", 1000)
    assert allow(db, "2.2.2.2", 1000)  # other clients are unaffected
    assert allow(db, "1.1.1.1", 1061)  # a minute later
    assert db.count("1.1.1.1") == PER_MINUTE + 1  # the rejected request was not recorded


def test_per_day_limit_and_pruning():
    db = FakeD1()
    t = 0
    for _ in range(PER_DAY):
        assert allow(db, "1.1.1.1", t)
        t += 61
    assert not allow(db, "1.1.1.1", t)
    assert allow(db, "1.1.1.1", DAY + 61)  # the oldest request has aged out
    assert db.count("1.1.1.1") <= PER_DAY  # rows older than a day are deleted


def add_review(db, h, white, black, created, wa=90.0, ba=70.0):
    db.conn.execute(
        "INSERT INTO analyzed_games (game_hash, white_username, black_username, white_accuracy, black_accuracy, pgn, report_json, created_at)"
        " VALUES (?, ?, ?, ?, ?, '', '{}', ?)",
        (h, white, black, wa, ba, created),
    )


def test_player_reviews_case_insensitive_newest_first():
    db = FakeD1()
    add_review(db, "a", "Hikaru", "x", "2026-10-01 10:00:00")
    add_review(db, "b", "y", "hikaru", "2026-10-03 10:00:00")
    add_review(db, "c", "y", "z", "2026-10-04 10:00:00")
    rows = asyncio.run(player_reviews(db, "HIKARU"))
    assert [r["game_hash"] for r in rows] == ["b", "a"]


def test_stored_accuracies_only_known_hashes():
    db = FakeD1()
    add_review(db, "a", "w", "b", "2026-10-01 10:00:00", 88.5, 71.0)
    assert asyncio.run(stored_accuracies(db, ["a", "missing"])) == {"a": {"white": 88.5, "black": 71.0}}
    assert asyncio.run(stored_accuracies(db, [])) == {}
