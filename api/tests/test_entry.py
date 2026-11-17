"""Route-level tests for api/src/entry.py with stubbed D1, KV, AI, and workers bindings."""

import asyncio
import json
import sys
import types
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

# `workers` imports Pyodide's `js` module at import time; provide minimal stubs for CPython pytest.
if "workers" not in sys.modules:
    workers_mod = types.ModuleType("workers")
    workers_mod.fetch = None
    asgi_mod = types.ModuleType("workers.asgi")
    asgi_mod.entrypoint = lambda app: app
    asgi_mod.env = None
    sys.modules["workers"] = workers_mod
    sys.modules["workers.asgi"] = asgi_mod

import entry  # noqa: E402
from review.analyze import AnalyzeRequest, PositionEval, parse_game  # noqa: E402
from review.store import PER_MINUTE  # noqa: E402
from test_analyze import OPERA, synthetic_evals  # noqa: E402
from test_store import FakeD1  # noqa: E402

MINI_PGN = '[White "Alice"]\n[Black "Bob"]\n[Result "1-0"]\n\n1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0'


class FakeKV:
    def __init__(self):
        self.data: dict[str, str] = {}

    async def get(self, key: str):
        return self.data.get(key)

    async def put(self, key: str, value: str, opts=None):
        self.data[key] = value

    async def delete(self, key: str):
        self.data.pop(key, None)


class FakeAI:
    def __init__(self):
        self.calls = 0

    async def run(self, model, inputs):
        self.calls += 1
        return {"response": {"comments": []}}


def _env():
    return SimpleNamespace(DB=FakeD1(), CACHE=FakeKV(), AI=FakeAI())


def _req(ip="1.2.3.4"):
    return SimpleNamespace(headers={"cf-connecting-ip": ip})


def test_analyze_lifecycle_cache_rate_limit_and_fresh():
    env = _env()
    evals = [PositionEval(**e) for e in synthetic_evals(OPERA)]

    # Uncached without evals -> 404
    with pytest.raises(HTTPException) as exc:
        asyncio.run(entry.analyze_game(AnalyzeRequest(pgn=OPERA), _req(), env=env))
    assert exc.value.status_code == 404

    # First analysis runs coach AI, stores in D1, and returns report
    report = asyncio.run(entry.analyze_game(AnalyzeRequest(pgn=OPERA, evals=evals), _req(), env=env))
    assert report["hash"] == parse_game(OPERA).hash
    assert env.AI.calls == 1

    # Cache hit without evals returns stored review without consuming AI or rate limit
    cached = asyncio.run(entry.analyze_game(AnalyzeRequest(pgn=OPERA), _req(), env=env))
    assert cached["hash"] == report["hash"]
    assert env.AI.calls == 1

    # Fresh re-analysis skips cache, AI, and D1 write
    fresh = asyncio.run(entry.analyze_game(AnalyzeRequest(pgn=OPERA, evals=evals, fresh=True), _req(), env=env))
    assert fresh["hash"] == report["hash"]
    assert env.AI.calls == 1

    # Exceeding PER_MINUTE triggers 429
    for _ in range(PER_MINUTE - 2):
        asyncio.run(entry.analyze_game(AnalyzeRequest(pgn=OPERA, evals=evals, fresh=True), _req(), env=env))
    with pytest.raises(HTTPException) as limited:
        asyncio.run(entry.analyze_game(AnalyzeRequest(pgn=OPERA, evals=evals, fresh=True), _req(), env=env))
    assert limited.value.status_code == 429


def test_player_renamed_account_and_cache_invalidation(monkeypatch):
    env = _env()
    h = parse_game(OPERA).hash
    games = [
        {
            "id": "1",
            "url": "https://lichess.org/1",
            "pgn": OPERA,
            "white": {"name": "OldHandle", "rating": 1500},
            "black": {"name": "Opponent", "rating": 1500},
            "result": "1-0",
            "timeClass": "blitz",
            "endTime": 1000,
            "hash": h,
        }
    ]

    async def fake_fetch_games(fetch_fn, platform, username):
        return games

    monkeypatch.setattr(entry, "fetch_games", fake_fetch_games)
    env.CACHE.data[f"games:lichess:alice"] = json.dumps(games)

    # Seed a stored review for OPERA (headers: Paul Morphy vs Duke Karl / Count Isouard)
    evals = [PositionEval(**e) for e in synthetic_evals(OPERA)]
    asyncio.run(entry.analyze_game(AnalyzeRequest(pgn=OPERA, evals=evals), _req(), env=env))

    # Neither player name in `games[0]` matches "Alice", so reviewed must stay None (not Opponent's accuracy).
    profile = asyncio.run(entry.player("lichess", "Alice", env=env))
    assert profile["games"][0]["reviewed"] is None
    assert "player_summary:alice" in env.CACHE.data

    # Analyzing a game with White="Alice" invalidates Alice's cached player summary.
    mini_evals = [PositionEval(**e) for e in synthetic_evals(MINI_PGN)]
    asyncio.run(entry.analyze_game(AnalyzeRequest(pgn=MINI_PGN, evals=mini_evals), _req(), env=env))
    assert "player_summary:alice" not in env.CACHE.data
