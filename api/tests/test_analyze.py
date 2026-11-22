import io

import chess.pgn
import pytest
from pydantic import ValidationError

from review.analyze import AnalysisError, Line, PositionEval, analyze, parse_game

OPERA = """[Event "Paris"]
[White "Paul Morphy"]
[Black "Duke Karl / Count Isouard"]
[Result "1-0"]

1.e4 e5 2.Nf3 d6 3.d4 Bg4 4.dxe5 Bxf3 5.Qxf3 dxe5 6.Bc4 Nf6 7.Qb3 Qe7 8.Nc3 c6
9.Bg5 b5 10.Nxb5 cxb5 11.Bxb5+ Nbd7 12.O-O-O Rd8 13.Rxd7 Rxd7 14.Rd1 Qe6
15.Bxd7+ Nxd7 16.Qb8+ Nxb8 17.Rd8# 1-0"""


def synthetic_evals(pgn: str) -> list[dict]:
    """Every position scored 0.00 with the played move as PV1; the final mate gets no lines, like Stockfish."""
    game = chess.pgn.read_game(io.StringIO(pgn))
    board, moves, evals = game.board(), list(game.mainline_moves()), []
    for m in moves:
        evals.append({"fen": board.fen(), "lines": [{"uci": m.uci(), "cp": 0, "pv": [m.uci()]}]})
        board.push(m)
    evals.append({"fen": board.fen(), "lines": []})
    return evals


def run(pgn: str, evals: list[dict]) -> dict:
    return analyze(parse_game(pgn), [PositionEval(**e) for e in evals])


def test_opera_game_report():
    report = run(OPERA, synthetic_evals(OPERA))
    moves = report["moves"]
    assert len(moves) == 33
    assert [m["badge"] for m in moves[:4]] == ["book"] * 4
    assert report["opening"]
    qb8 = next(m for m in moves if m["san"] == "Qb8+")
    assert qb8["badge"] == "brilliant"
    assert moves[-1]["san"] == "Rd8#" and moves[-1]["badge"] == "best"
    assert moves[-1]["mateWhite"] == 0 and moves[-1]["evalWhite"] == 100
    assert report["accuracy"]["white"] == pytest.approx(100, abs=0.1)
    assert report["headers"]["White"] == "Paul Morphy"


def test_eval_count_mismatch():
    with pytest.raises(AnalysisError, match="expected 34 evals"):
        run(OPERA, synthetic_evals(OPERA)[:-1])


def test_fen_mismatch():
    evals = synthetic_evals(OPERA)
    evals[3]["fen"] = chess.STARTING_FEN
    with pytest.raises(AnalysisError, match="FEN mismatch"):
        run(OPERA, evals)


def test_missing_lines_on_live_position():
    evals = synthetic_evals(OPERA)
    evals[5]["lines"] = []
    with pytest.raises(AnalysisError, match="missing engine lines"):
        run(OPERA, evals)


def test_bad_pgn():
    with pytest.raises(AnalysisError):
        parse_game("1. e4 Ke7 2. Qh5 Kxh5")


def test_hash_ignores_headers_but_not_moves(monkeypatch):
    base = parse_game(OPERA).hash
    assert parse_game(OPERA.replace("Paul Morphy", "Someone Else")).hash == base
    assert parse_game(OPERA.replace("17.Rd8#", "17.Rd7")).hash != base
    monkeypatch.setattr("review.analyze.ANALYSIS_VERSION", "test")
    assert parse_game(OPERA).hash != base


def test_illegal_engine_move_rejected():
    evals = synthetic_evals(OPERA)
    evals[2]["lines"][0]["uci"] = "e2e5"
    with pytest.raises(AnalysisError, match="illegal engine move"):
        run(OPERA, evals)


def test_report_has_alternatives_tactics_and_elo():
    report = run(OPERA, synthetic_evals(OPERA))
    assert report["moves"][0]["alternatives"] == [{"uci": "e2e4", "san": "e4", "w": 50.0}]
    assert any("offers material" in f for f in next(m for m in report["moves"] if m["san"] == "Nxb5")["tactics"])
    assert set(report["elo"]) == {"white", "black"}
    assert len(report["hash"]) == 64


def test_extreme_cp_rejected():
    with pytest.raises(ValidationError):
        Line(uci="e2e4", cp=-200_000, pv=["e2e4"])
    with pytest.raises(ValidationError):
        Line(uci="e2e4", cp=200_000, pv=["e2e4"])


def test_extreme_mate_rejected():
    with pytest.raises(ValidationError):
        Line(uci="e2e4", mate=-200_000, pv=["e2e4"])
    with pytest.raises(ValidationError):
        Line(uci="e2e4", mate=2000, pv=["e2e4"])


BACK_RANK = """[FEN "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1"]
[SetUp "1"]

1. h3 h6"""


def _badge_after(before: dict, after: dict) -> str:
    """Badge for White's 1.h3 given White's score before it and Black's score after it."""
    board = chess.Board("6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1")
    evals = [{"fen": board.fen(), "lines": [{"uci": "a1a8", "pv": ["a1a8"], **before}]}]
    board.push_uci("h2h3")
    evals.append({"fen": board.fen(), "lines": [{"uci": "h7h6", "pv": ["h7h6"], **after}]})
    board.push_uci("h7h6")
    evals.append({"fen": board.fen(), "lines": [{"uci": "a1a8", "pv": ["a1a8"], "cp": 0}]})
    return run(BACK_RANK, evals)["moves"][0]["badge"]


def test_missing_a_long_mate_is_judged_like_a_big_advantage():
    assert _badge_after({"mate": 3}, {"cp": -600}) == "miss"  # a mate in 3 is there to be seen
    assert _badge_after({"mate": 4}, {"cp": -600}) == "inaccuracy"  # past the horizon: judged as +6 vs a won game
    assert _badge_after({"mate": 12}, {"cp": -600}) == "inaccuracy"
    assert _badge_after({"mate": 20}, {"cp": -1500}) == "excellent"


def test_allowing_a_long_mate_is_judged_like_a_lost_position():
    assert _badge_after({"cp": -300}, {"mate": 3}) == "blunder"  # walks into a visible mate
    assert _badge_after({"cp": -300}, {"mate": 15}) == "mistake"  # already worse; the mate is beyond the horizon
    assert _badge_after({"cp": 100}, {"mate": 15}) == "blunder"  # throwing away an equal game is still a blunder
    assert _badge_after({"mate": -20}, {"mate": 3}) != "blunder"  # already being mated
