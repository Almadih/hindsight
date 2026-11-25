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
from review.store import PER_MINUTE, REPORTS_PER_DAY  # noqa: E402
from test_analyze import OPERA, synthetic_evals  # noqa: E402
from test_store import FakeD1  # noqa: E402

MINI_PGN = '[Site "https://lichess.org/mini"]\n[White "Alice"]\n[Black "Bob"]\n[Result "1-0"]\n\n1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0'
CUSTOM_PGN = '[Site "Custom"]\n[White "Alice"]\n[Black "Bob"]\n[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1'


class FakeKV:
    def __init__(self):
        self.data: dict[str, str] = {}
        self.ttls: dict[str, int | None] = {}

    async def get(self, key: str):
        return self.data.get(key)

    async def put(self, key: str, value: str, opts=None):
        self.data[key] = value
        self.ttls[key] = opts.get("expirationTtl") if isinstance(opts, dict) else None

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
    assert "player_summary:lichess:alice" in env.CACHE.data

    # Custom PGN with White="Alice" does not invalidate or pollute Lichess player history.
    custom_evals = [PositionEval(**e) for e in synthetic_evals(CUSTOM_PGN)]
    asyncio.run(entry.analyze_game(AnalyzeRequest(pgn=CUSTOM_PGN, evals=custom_evals), _req(), env=env))
    assert "player_summary:lichess:alice" in env.CACHE.data

    # Analyzing a Lichess game with White="Alice" invalidates Alice's Lichess cached player summary.
    mini_evals = [PositionEval(**e) for e in synthetic_evals(MINI_PGN)]
    asyncio.run(entry.analyze_game(AnalyzeRequest(pgn=MINI_PGN, evals=mini_evals), _req(), env=env))
    assert "player_summary:lichess:alice" not in env.CACHE.data


def test_games_skips_hashing_and_player_hashes_lazily(monkeypatch):
    env = _env()
    raw = [
        {
            "id": "1",
            "url": "https://lichess.org/1",
            "pgn": MINI_PGN,
            "white": {"name": "Alice", "rating": 1500},
            "black": {"name": "Bob", "rating": 1500},
            "result": "1-0",
            "timeClass": "blitz",
            "endTime": 1000,
        }
    ]

    async def fake_fetch_games(fetch_fn, platform, username):
        return [dict(g) for g in raw]

    monkeypatch.setattr(entry, "fetch_games", fake_fetch_games)
    res = asyncio.run(entry.games("lichess", "Alice", env=env))
    assert "hash" not in res["games"][0]

    profile = asyncio.run(entry.player("lichess", "Alice", env=env))
    assert profile["games"][0]["hash"] == parse_game(MINI_PGN).hash
    assert json.loads(env.CACHE.data["games:lichess:alice"])[0]["hash"] == parse_game(MINI_PGN).hash


def test_game_by_url_success_and_cache_hit(monkeypatch):
    env = _env()
    calls = []

    async def fake_fetch_game_by_url(fetch_fn, ref):
        calls.append(ref)
        return {
            "pgn": MINI_PGN,
            "url": ref.canonical_url,
            "platform": ref.platform,
            "white": {"name": "Alice", "rating": 1500},
            "black": {"name": "Bob", "rating": 1480},
            "result": "1-0",
            "timeClass": "blitz",
        }

    monkeypatch.setattr(entry, "fetch_game_by_url", fake_fetch_game_by_url)

    res = asyncio.run(entry.game_by_url(entry.GameByUrlRequest(url="https://lichess.org/HqjDTU4A"), env=env))
    assert res == {
        "pgn": MINI_PGN,
        "url": "https://lichess.org/HqjDTU4A",
        "platform": "lichess",
        "white": {"name": "Alice", "rating": 1500},
        "black": {"name": "Bob", "rating": 1480},
        "result": "1-0",
        "timeClass": "blitz",
        "hash": parse_game(MINI_PGN).hash,
    }
    assert len(res["hash"]) == 64
    assert len(calls) == 1
    assert "game_url:lichess:game:HqjDTU4A" in env.CACHE.data
    assert env.CACHE.ttls["game_url:lichess:game:HqjDTU4A"] == 3600

    # Different URL form for the same game hits KV cache without calling upstream.
    cached = asyncio.run(entry.game_by_url(entry.GameByUrlRequest(url="lichess.org/HqjDTU4A1234/black#20"), env=env))
    assert cached == res
    assert len(calls) == 1


def test_game_by_url_invalid_not_found_and_unparseable(monkeypatch):
    env = _env()
    called = False

    async def fake_fetch_game_by_url(fetch_fn, ref):
        nonlocal called
        called = True
        if ref.game_id == "404":
            raise entry.UpstreamError(404, "Game not found")
        if ref.game_id == "960":
            raise entry.UpstreamError(422, "Only standard chess games are supported")
        return {
            "pgn": '[White "A"]\n[Black "B"]\n\n*',
            "url": ref.canonical_url,
            "platform": ref.platform,
            "white": {"name": "A", "rating": None},
            "black": {"name": "B", "rating": None},
            "result": "*",
            "timeClass": None,
        }

    monkeypatch.setattr(entry, "fetch_game_by_url", fake_fetch_game_by_url)

    # Invalid / SSRF URL fails before any upstream call.
    with pytest.raises(HTTPException) as bad:
        asyncio.run(entry.game_by_url(entry.GameByUrlRequest(url="https://evil.com/game/live/123"), env=env))
    assert bad.value.status_code == 422
    assert bad.value.detail == "Paste a Chess.com or Lichess game link"
    assert not called

    # 404 propagates as "Game not found" and is not cached.
    with pytest.raises(HTTPException) as missing:
        asyncio.run(entry.game_by_url(entry.GameByUrlRequest(url="https://www.chess.com/game/live/404"), env=env))
    assert missing.value.status_code == 404
    assert missing.value.detail == "Game not found"
    assert "game_url:chesscom:live:404" not in env.CACHE.data

    # Non-standard variant propagates 422.
    with pytest.raises(HTTPException) as variant:
        asyncio.run(entry.game_by_url(entry.GameByUrlRequest(url="https://www.chess.com/game/live/960"), env=env))
    assert variant.value.status_code == 422
    assert variant.value.detail == "Only standard chess games are supported"

    # Empty/unparseable PGN caught by parse_game -> 422 and not cached.
    with pytest.raises(HTTPException) as empty:
        asyncio.run(entry.game_by_url(entry.GameByUrlRequest(url="https://www.chess.com/game/live/123"), env=env))
    assert empty.value.status_code == 422
    assert empty.value.detail == "Could not read moves from that game"
    assert "game_url:chesscom:live:123" not in env.CACHE.data


def test_report_coach_validation_and_rate_limit():
    env = _env()
    h = "a" * 64
    res = asyncio.run(entry.report_coach(entry.CoachReportRequest(game_hash=h, ply=5, reason="Offensive"), _req(), env=env))
    assert res == {"ok": True}

    with pytest.raises(HTTPException) as blank:
        asyncio.run(entry.report_coach(entry.CoachReportRequest(game_hash=h, ply=5, reason="   "), _req(), env=env))
    assert blank.value.status_code == 422

    for _ in range(REPORTS_PER_DAY - 1):
        asyncio.run(entry.report_coach(entry.CoachReportRequest(game_hash=h, ply=5, reason="Inaccurate"), _req(), env=env))
    with pytest.raises(HTTPException) as limited:
        asyncio.run(entry.report_coach(entry.CoachReportRequest(game_hash=h, ply=5, reason="Inaccurate"), _req(), env=env))
    assert limited.value.status_code == 429


def test_app_config_defaults_and_cache_header():
    env = _env()
    res = asyncio.run(entry.app_config(env=env))
    assert res.status_code == 200
    assert res.headers["cache-control"] == "public, max-age=300"
    assert json.loads(res.body) == entry.DEFAULT_APP_CONFIG["android"]

    ios_res = asyncio.run(entry.app_config(platform="ios", env=env))
    assert ios_res.status_code == 200
    assert ios_res.headers["cache-control"] == "public, max-age=300"
    assert json.loads(ios_res.body) == entry.DEFAULT_APP_CONFIG["ios"]


def test_app_config_kv_override_and_sanitization():
    env = _env()
    env.CACHE.data["app_config:android"] = json.dumps(
        {
            "latest_version": "1.2.0",
            "min_version": 100,
            "title": "Update available",
            "message": "Please update.",
            "unknown_key": "ignored",
        }
    )
    res = asyncio.run(entry.app_config(platform="android", env=env))
    body = json.loads(res.body)
    assert body == {
        "latest_version": "1.2.0",
        "min_version": "0.0.0",
        "title": "Update available",
        "message": "Please update.",
        "store_url": "https://github.com/Almadih/hindsight/releases/latest/download/hindsight.apk",
    }
    assert "unknown_key" not in body


def test_app_config_malformed_and_non_dict_fail_open():
    env = _env()
    env.CACHE.data["app_config:android"] = "{not valid json"
    res = asyncio.run(entry.app_config(platform="android", env=env))
    assert res.status_code == 200
    assert json.loads(res.body) == entry.DEFAULT_APP_CONFIG["android"]

    env.CACHE.data["app_config:ios"] = json.dumps(["not", "a", "dict"])
    ios_res = asyncio.run(entry.app_config(platform="ios", env=env))
    assert ios_res.status_code == 200
    assert json.loads(ios_res.body) == entry.DEFAULT_APP_CONFIG["ios"]
