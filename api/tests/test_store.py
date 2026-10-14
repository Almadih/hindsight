"""Runs store.py's SQL on real SQLite (what D1 is) through a minimal stand-in for the D1 binding."""

import asyncio
import pathlib
import sqlite3

from review.store import DAY, PER_DAY, PER_MINUTE, allow_analysis


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
