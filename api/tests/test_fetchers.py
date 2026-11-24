import asyncio
import json

import chess
import pytest

from review.analyze import parse_game
from review.fetchers import (
    GameRef,
    UpstreamError,
    decode_tcn,
    fetch_game_by_url,
    fetch_games,
    parse_chesscom,
    parse_chesscom_game,
    parse_game_url,
    parse_lichess,
    parse_lichess_game,
)


def test_parse_chesscom_filters_variants_and_sorts():
    month = {
        "games": [
            {"url": "https://www.chess.com/game/live/1", "pgn": "1. e4 *", "rules": "chess", "end_time": 100, "time_class": "blitz",
             "white": {"username": "a", "rating": 1500, "result": "win"}, "black": {"username": "b", "rating": 1400, "result": "resigned"}},
            {"url": "https://www.chess.com/game/live/2", "pgn": "1. e4 *", "rules": "chess960", "end_time": 300,
             "white": {"username": "a"}, "black": {"username": "b"}},
            {"url": "https://www.chess.com/game/live/3", "pgn": "1. d4 *", "rules": "chess", "end_time": 200,
             "white": {"username": "a", "result": "agreed"}, "black": {"username": "b", "result": "agreed"}},
        ]
    }
    games = parse_chesscom([month])
    assert [g["id"] for g in games] == ["3", "1"]
    assert games[0]["result"] == "1/2-1/2" and games[1]["result"] == "1-0"
    assert games[1]["endTime"] == 100_000


def test_parse_lichess_handles_ai_and_variants():
    rows = [
        {"id": "abc", "variant": "standard", "speed": "rapid", "lastMoveAt": 5, "winner": "black", "pgn": "1. e4 *",
         "players": {"white": {"user": {"name": "me"}, "rating": 1800}, "black": {"aiLevel": 3}}},
        {"id": "zzz", "variant": "atomic", "pgn": "1. e4 *", "players": {}},
    ]
    games = parse_lichess("\n".join(json.dumps(r) for r in rows) + "\n")
    assert len(games) == 1
    assert games[0]["result"] == "0-1"
    assert games[0]["black"]["name"] == "Stockfish level 3"


def test_fetch_games_chesscom_concurrent():
    calls = []

    class FakeResp:
        def __init__(self, data, status=200):
            self.data = data
            self.status = status

        async def json(self):
            return self.data

    async def fake_fetch(url, headers=None):
        calls.append(url)
        if "archives" in url:
            return FakeResp({"archives": ["https://api.chess.com/pub/player/bob/games/2026/09", "https://api.chess.com/pub/player/bob/games/2026/10"]})
        return FakeResp({"games": [{"url": f"{url}/1", "pgn": "1. e4 *", "rules": "chess", "end_time": 100, "white": {"username": "bob"}, "black": {"username": "alice"}}]})

    games = asyncio.run(fetch_games(fake_fetch, "chesscom", "bob"))
    assert len(games) == 2
    assert len(calls) == 3


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        # Lichess shapes (preserving case, truncating 12-char IDs to 8 chars)
        ("https://lichess.org/HqjDTU4A", GameRef("lichess", "game", "HqjDTU4A")),
        ("lichess.org/HqjDTU4A", GameRef("lichess", "game", "HqjDTU4A")),
        ("http://www.lichess.org/HqjDTU4A1234", GameRef("lichess", "game", "HqjDTU4A")),
        ("https://m.lichess.org/HqjDTU4A/black#42", GameRef("lichess", "game", "HqjDTU4A")),
        ("https://lichess.org/HqjDTU4A/white?ref=share", GameRef("lichess", "game", "HqjDTU4A")),
        ("https://lichess.org/game/export/HqjDTU4A", GameRef("lichess", "game", "HqjDTU4A")),
        ("https://lichess.org/game/export/HqjDTU4A1234.pgn?clocks=false", GameRef("lichess", "game", "HqjDTU4A")),
        ("https://lichess.org/game/HqjDTU4A", GameRef("lichess", "game", "HqjDTU4A")),
        # Chess.com shapes (live, daily, legacy, analysis, locales, mobile, no scheme)
        ("https://www.chess.com/game/live/185338359716", GameRef("chesscom", "live", "185338359716")),
        ("chess.com/game/daily/1034198172", GameRef("chesscom", "daily", "1034198172")),
        ("https://m.chess.com/live/game/185338359716?username=foo#move=10", GameRef("chesscom", "live", "185338359716")),
        ("https://www.chess.com/daily/game/1034198172", GameRef("chesscom", "daily", "1034198172")),
        ("https://www.chess.com/analysis/game/live/185338359716", GameRef("chesscom", "live", "185338359716")),
        ("https://www.chess.com/analysis/game/daily/1034198172/review", GameRef("chesscom", "daily", "1034198172")),
        ("https://www.chess.com/es/game/live/185338359716", GameRef("chesscom", "live", "185338359716")),
        ("https://www.chess.com/pt-br/analysis/game/live/185338359716", GameRef("chesscom", "live", "185338359716")),
        ("  HTTPS://WWW.CHESS.COM/game/live/42/  ", GameRef("chesscom", "live", "42")),
    ],
)
def test_parse_game_url_valid(raw, expected):
    assert parse_game_url(raw) == expected


@pytest.mark.parametrize(
    "raw",
    [
        "",
        "   ",
        "not a url",
        "hikaru",
        "https://evil.com/game/live/185338359716",
        "https://chess.com.evil.com/game/live/185338359716",
        "https://evil.chess.com/game/live/185338359716",
        "https://lichess.org.evil.com/HqjDTU4A",
        "https://chess.com@evil.com/game/live/185338359716",
        "https://user:pass@www.chess.com/game/live/185338359716",
        "https://chess.com\\@evil.com/game/live/185338359716",
        "https://www.chess.com:8080/game/live/185338359716",
        "chess.com:8080/game/live/185338359716",
        "http://127.0.0.1/game/live/185338359716",
        "http://[::1]/game/live/185338359716",
        "file:///etc/passwd",
        "javascript:alert(1)",
        "ftp://www.chess.com/game/live/185338359716",
        "//www.chess.com/game/live/185338359716",
        "https://www.chess.com/member/hikaru",
        "https://www.chess.com/game/live/abc123",
        "https://www.chess.com/game/live/123/../456",
        "https://www.chess.com/game/computer/12345",
        "https://lichess.org/training",
        "https://lichess.org/analysis",
        "https://lichess.org/@/DrNykterstein",
        "https://lichess.org/short",
        "https://lichess.org/123456789",
        "https://lichess.org/HqjDTU4A/invalid",
        "https://www.chess.com/game/live/123\nfoo",
    ],
)
def test_parse_game_url_rejects_ssrf_and_invalid(raw):
    assert parse_game_url(raw) is None


def test_decode_tcn_real_live_game_with_castling_and_promotion():
    # Real Chess.com live game 185338359716: 149 plies, includes 11... O-O, 12. O-O-O, 72. d8=Q, 75. Bf6#.
    tcn = (
        "mC0Kgv5Qbs!TfHZRsJTCltCTcM90J070HQXQdl3VMF8!ec45px6SoESijr2MvMVMlM!?MT0TFT?3cjirkrWGda5HTM95aqGyMuyrhbRJtBKC"
        "jsrjqiHrskrtij54jX4ibjiyXYyAkbtdbidhEM3UirhxrixhYXh?XzAsjr?4ijsrjr4arjaOzrOWrPWYjr1TMTUTrzTSzIY6PQ6QIQS0QY0S"
        "Y7SR78RS87SRuDRS7YSLDuLSYQS0QJ0ZJCZSBJSRuDRZJRZ7CK78nv89KS98DM89RZ92Z~23703!01!?MT"
    )
    moves = decode_tcn(tcn, chess.Board())
    assert len(moves) == 149
    board = chess.Board()
    sans = []
    for m in moves:
        sans.append(board.san(m))
        board.push(m)
    assert sans[21] == "O-O"
    assert sans[22] == "O-O-O"
    assert sans[142] == "d8=Q"
    assert sans[-1] == "Bf6#"
    assert board.is_checkmate()


def test_decode_tcn_underpromotions_and_black_capture_promotion():
    # White a7-a8=Q (W~), b7-b8=N (X^), g7-g8=R (2_), h7-h8=B (3#)
    board = chess.Board("8/PP4PP/8/8/8/8/8/4K2k w - - 0 1")
    for pair, expected_uci in [("W~", "a7a8q"), ("X^", "b7b8n"), ("2_", "g7g8r"), ("3#", "h7h8b")]:
        moves = decode_tcn(pair, board)
        assert [m.uci() for m in moves] == [expected_uci]

    # Black b2xa1=N: b2 is index 9 ('j'), Knight capture-left delta=-1 -> '(' (index 67)
    b_black = chess.Board("4k3/8/8/8/8/8/1p6/R3K3 b - - 0 1")
    moves = decode_tcn("j(", b_black)
    assert [m.uci() for m in moves] == ["b2a1n"]

    # Crazyhouse drop (from_idx > 63, e.g. '&' = index 79) must be rejected as non-standard.
    with pytest.raises(UpstreamError) as exc:
        decode_tcn("&C", chess.Board())
    assert exc.value.status == 422
    assert exc.value.args[0] == "Only standard chess games are supported"


def test_parse_chesscom_game_live_and_daily():
    live_payload = {
        "game": {
            "type": "chess",
            "typeName": "Standard Chess",
            "moveList": "mC0Kgv5Q",
            "isFinished": True,
            "colorOfWinner": "white",
            "timeControl": {"baseMs": 180000, "incrementMs": 2000},
            "pgnHeaders": {
                "Event": "Live Chess",
                "Site": "Chess.com",
                "Date": "2026.10.14",
                "White": "NovicaZ",
                "Black": "Opponent",
                "Result": "1-0",
                "WhiteElo": 1532,
                "BlackElo": 1537,
                "TimeControl": "180+2",
                "SetUp": "1",
                "FEN": chess.STARTING_FEN,
            },
        },
        "players": {
            "bottom": {"color": "white", "username": "NovicaZ", "rating": 1532},
            "top": {"color": "black", "username": "Opponent", "rating": 1537},
        },
    }
    res = parse_chesscom_game(live_payload, "live", "185338359716")
    assert res["platform"] == "chesscom"
    assert res["url"] == "https://www.chess.com/game/live/185338359716"
    assert res["white"] == {"name": "NovicaZ", "rating": 1532}
    assert res["black"] == {"name": "Opponent", "rating": 1537}
    assert res["result"] == "1-0"
    assert res["timeClass"] == "blitz"
    parsed = parse_game(res["pgn"])
    assert [m.uci() for m in parsed.moves] == ["e2e4", "e7e5", "g1f3", "b8c6"]
    assert parsed.game.headers["Site"] == "Chess.com"
    assert parsed.game.headers["WhiteElo"] == "1532"

    daily_payload = {
        "game": {
            "type": "chess",
            "typeName": "Standard Chess",
            "moveList": "mC0K",
            "isFinished": True,
            "daysPerTurn": 7,
            "pgnHeaders": {
                "Event": "Let\\'s Play!",
                "Site": "Chess.com",
                "Date": "2026.09.24",
                "White": "erik",
                "Black": "crkanoff",
                "Result": "0-1",
                "WhiteElo": 1493,
                "BlackElo": 1489,
                "TimeControl": "1/604800",
            },
        },
        "players": {},
    }
    daily = parse_chesscom_game(daily_payload, "daily", "1034198172")
    assert daily["timeClass"] == "daily"
    assert daily["result"] == "0-1"
    assert daily["url"] == "https://www.chess.com/game/daily/1034198172"
    daily_parsed = parse_game(daily["pgn"])
    assert daily_parsed.game.headers["Event"] == "Let's Play!"


def test_parse_chesscom_game_rejects_variants_and_empty():
    with pytest.raises(UpstreamError) as exc:
        parse_chesscom_game({"game": {"type": "chess960", "moveList": "mC0K"}}, "live", "1")
    assert exc.value.status == 422
    assert "standard chess" in str(exc.value).lower()

    with pytest.raises(UpstreamError) as exc2:
        parse_chesscom_game({"game": {"type": "chess", "moveList": ""}}, "live", "1")
    assert exc2.value.status == 422
    assert str(exc2.value) == "Could not read moves from that game"

    with pytest.raises(UpstreamError) as exc3:
        parse_chesscom_game({}, "live", "1")
    assert exc3.value.status == 404
    assert str(exc3.value) == "Game not found"


def test_parse_lichess_game_standard_variants_and_results():
    pgn = '[Site "https://lichess.org/HqjDTU4A"]\n[White "Alice"]\n[Black "Bob"]\n[Result "1-0"]\n\n1. e4 e5 1-0'
    res = parse_lichess_game(
        {
            "id": "HqjDTU4A",
            "variant": "standard",
            "speed": "blitz",
            "status": "resign",
            "winner": "white",
            "players": {
                "white": {"user": {"name": "Alice"}, "rating": 2100},
                "black": {"user": {"name": "Bob"}, "rating": 2050},
            },
            "pgn": pgn,
        },
        "HqjDTU4A",
    )
    assert res["platform"] == "lichess"
    assert res["url"] == "https://lichess.org/HqjDTU4A"
    assert res["white"] == {"name": "Alice", "rating": 2100}
    assert res["black"] == {"name": "Bob", "rating": 2050}
    assert res["result"] == "1-0"
    assert res["timeClass"] == "blitz"
    assert len(parse_game(res["pgn"]).moves) == 2

    draw = parse_lichess_game({"variant": "standard", "status": "draw", "players": {}, "pgn": pgn}, "HqjDTU4A")
    assert draw["result"] == "1/2-1/2"
    assert draw["white"] == {"name": "Anonymous", "rating": None}

    ongoing = parse_lichess_game({"variant": "standard", "status": "started", "players": {}, "pgn": pgn}, "HqjDTU4A")
    assert ongoing["result"] == "*"

    with pytest.raises(UpstreamError) as exc:
        parse_lichess_game({"variant": "atomic", "pgn": pgn}, "HqjDTU4A")
    assert exc.value.status == 422
    assert str(exc.value) == "Only standard chess games are supported"


def test_fetch_game_by_url_uses_hardcoded_templates_and_maps_errors():
    seen = []

    class FakeResp:
        def __init__(self, status=200, data=None, bad_json=False):
            self.status = status
            self._data = data
            self._bad_json = bad_json

        async def json(self):
            if self._bad_json:
                raise ValueError("not json")
            return self._data

    async def fake_fetch(url, headers=None):
        seen.append((url, headers))
        if "callback/live/game/404" in url:
            return FakeResp(status=404)
        if "callback/daily/game/503" in url:
            return FakeResp(status=503)
        if "game/export/BadJson1" in url:
            return FakeResp(status=200, bad_json=True)
        return FakeResp(
            status=200,
            data={
                "variant": "standard",
                "speed": "rapid",
                "winner": "black",
                "players": {"white": {"user": {"name": "W"}, "rating": 1500}, "black": {"user": {"name": "B"}, "rating": 1600}},
                "pgn": "1. e4 e5 0-1",
            },
        )

    res = asyncio.run(fetch_game_by_url(fake_fetch, GameRef("lichess", "game", "HqjDTU4A")))
    assert res["result"] == "0-1"
    assert seen[0][0] == "https://lichess.org/game/export/HqjDTU4A?pgnInJson=true&clocks=false&evals=false"
    assert seen[0][1]["Accept"] == "application/json"

    with pytest.raises(UpstreamError) as exc404:
        asyncio.run(fetch_game_by_url(fake_fetch, GameRef("chesscom", "live", "404")))
    assert exc404.value.status == 404
    assert str(exc404.value) == "Game not found"
    assert seen[1][0] == "https://www.chess.com/callback/live/game/404"

    with pytest.raises(UpstreamError) as exc502:
        asyncio.run(fetch_game_by_url(fake_fetch, GameRef("chesscom", "daily", "503")))
    assert exc502.value.status == 502
    assert seen[2][0] == "https://www.chess.com/callback/daily/game/503"

    with pytest.raises(UpstreamError) as exc_bad:
        asyncio.run(fetch_game_by_url(fake_fetch, GameRef("lichess", "game", "BadJson1")))
    assert exc_bad.value.status == 502

