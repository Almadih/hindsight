import json

from review.fetchers import parse_chesscom, parse_lichess


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
