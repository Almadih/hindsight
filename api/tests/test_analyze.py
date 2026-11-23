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


def test_duplicate_and_unsorted_multipv_normalized():
    # Engine stopped mid-iteration emitted duplicate UCI and out-of-order scores
    pgn = """[FEN "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1"]
[SetUp "1"]

1. Ra8# 1-0"""
    board = chess.Board("6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1")
    fen0 = board.fen()
    board.push_uci("a1a8")
    fen1 = board.fen()
    evals = [
        {
            "fen": fen0,
            "lines": [
                {"uci": "h2h3", "cp": 0, "pv": ["h2h3"]},
                {"uci": "a1a8", "mate": 1, "pv": ["a1a8"]},
                {"uci": "h2h3", "cp": 10, "pv": ["h2h3"]},
            ],
        },
        {"fen": fen1, "lines": []},
    ]
    report = run(pgn, evals)
    m = report["moves"][0]
    assert m["bestUci"] == "a1a8"
    assert [a["uci"] for a in m["alternatives"]] == ["a1a8", "h2h3"]
    assert m["badge"] == "best"


def test_repeated_opening_position_is_not_book():
    pgn = "1. e4 e5 2. Nf3 Nc6 3. Ng1 Nb8 4. Nf3 Nc6 *"
    evals = synthetic_evals(pgn)
    evals[-1]["lines"] = [{"uci": "f1b5", "cp": 0, "pv": ["f1b5"]}]
    report = run(pgn, evals)
    # 1.e4 e5 2.Nf3 Nc6 are book; retreating back to an already-seen EPD (3...Nb8 / 4.Nf3 / 4...Nc6) must NOT be book
    assert [m["badge"] for m in report["moves"][:4]] == ["book"] * 4
    assert report["moves"][5]["badge"] != "book"  # 3...Nb8 repeats position after 1...e5
    assert report["moves"][6]["badge"] != "book"  # 4.Nf3 repeats position after 2.Nf3
    assert report["moves"][7]["badge"] != "book"  # 4...Nc6 repeats position after 2...Nc6


def test_horizon_drop_on_best_move_does_not_cause_false_miss_next_ply():
    # White plays engine's #1 move (played_best), but next-ply horizon drops 20%. Black then makes a mistake (-12.8%).
    # Black must get "mistake" (dw=12.8), NOT "miss" (White didn't slip on their best move!).
    pgn = """[FEN "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1"]
[SetUp "1"]

1. Kf2 Kd7"""
    b = chess.Board("4k3/8/8/8/8/8/4P3/4K3 w - - 0 1")
    f0 = b.fen()
    b.push_uci("e1f2")
    f1 = b.fen()
    b.push_uci("e8d7")
    f2 = b.fen()
    evals = [
        {"fen": f0, "lines": [{"uci": "e1f2", "cp": 150, "pv": ["e1f2"]}]},
        {"fen": f1, "lines": [{"uci": "e8e7", "cp": 60, "pv": ["e8e7"]}]},  # Black better (+60) -> White dropped ~20% on PV1
        {"fen": f2, "lines": [{"uci": "f2e3", "cp": 80, "pv": ["f2e3"]}]},  # Black dropped from +60 (55.5%) to -80 (42.7%), dw=12.8%
    ]
    report = run(pgn, evals)
    assert report["moves"][0]["badge"] == "best"
    assert report["moves"][1]["badge"] == "mistake"


def test_stalemate_from_forced_mate_is_blunder():
    pgn = """[FEN "7k/5Q2/4K3/8/8/8/8/8 w - - 0 1"]
[SetUp "1"]

1. Kf6 1/2-1/2"""
    b = chess.Board("7k/5Q2/4K3/8/8/8/8/8 w - - 0 1")
    f0 = b.fen()
    b.push_uci("e6f6")  # stalemate!
    f1 = b.fen()
    evals = [
        {"fen": f0, "lines": [{"uci": "f7g7", "mate": 1, "pv": ["f7g7"]}]},
        {"fen": f1, "lines": []},
    ]
    report = run(pgn, evals)
    assert report["moves"][0]["badge"] == "blunder"


def test_checkmate_is_always_best_even_if_not_pv1():
    # Two mate-in-1 moves exist; engine only reported one, player played the other -> still "best"
    pgn = """[FEN "6k1/5ppp/8/8/8/8/5PPP/R2Q2K1 w - - 0 1"]
[SetUp "1"]

1. Ra8# 1-0"""
    b = chess.Board("6k1/5ppp/8/8/8/8/5PPP/R2Q2K1 w - - 0 1")
    f0 = b.fen()
    b.push_uci("a1a8")
    f1 = b.fen()
    evals = [
        {"fen": f0, "lines": [{"uci": "d1d8", "mate": 1, "pv": ["d1d8"]}]},
        {"fen": f1, "lines": []},
    ]
    report = run(pgn, evals)
    assert report["moves"][0]["badge"] == "best"
    assert report["moves"][0]["accuracy"] == 100.0


def test_equally_fast_forced_mate_outside_multipv2_is_best():
    # MultiPV=2 reported two mate-in-2 moves; player found a 3rd mate-in-2 (or faster) -> still best + 100%
    pgn = """[FEN "6k1/5ppp/8/8/8/8/5PPP/R2Q2K1 w - - 0 1"]
[SetUp "1"]

1. Ra7"""
    b = chess.Board("6k1/5ppp/8/8/8/8/5PPP/R2Q2K1 w - - 0 1")
    f0 = b.fen()
    b.push_uci("a1a7")
    f1 = b.fen()
    evals = [
        {
            "fen": f0,
            "lines": [
                {"uci": "d1d7", "mate": 2, "pv": ["d1d7"]},
                {"uci": "d1b3", "mate": 2, "pv": ["d1b3"]},
            ],
        },
        {"fen": f1, "lines": [{"uci": "g8f8", "mate": -1, "pv": ["g8f8"]}]},
    ]
    report = run(pgn, evals)
    assert report["moves"][0]["badge"] == "best"
    assert report["moves"][0]["accuracy"] == 100.0


def test_threefold_repetition_from_winning_position_is_blunder():
    # White has mate in 2 on move 5, but plays 5.Qg2+ reaching the same position a 3rd time (auto-draw on Chess.com).
    pgn = """[FEN "6k1/5p1p/8/8/8/8/5Q2/6K1 w - - 0 1"]
[SetUp "1"]

1. Qg2+ Kh8 2. Qf2 Kg8 3. Qg2+ Kh8 4. Qf2 Kg8 5. Qg2+ 1/2-1/2"""
    b = chess.Board("6k1/5p1p/8/8/8/8/5Q2/6K1 w - - 0 1")
    moves = ["f2g2", "g8h8", "g2f2", "h8g8", "f2g2", "g8h8", "g2f2", "h8g8", "f2g2"]
    evals = []
    for uci in moves:
        fen = b.fen()
        if b.turn == chess.WHITE:
            best = "f2a7" if b.piece_at(chess.F2) else "g2a8"
            evals.append({"fen": fen, "lines": [{"uci": best, "mate": 2, "pv": [best]}]})
        else:
            evals.append({"fen": fen, "lines": [{"uci": uci, "mate": -2, "pv": [uci]}]})
        b.push_uci(uci)
    evals.append({"fen": b.fen(), "lines": [{"uci": "g8h8", "cp": 0, "pv": ["g8h8"]}]})
    assert b.is_repetition(3)
    report = run(pgn, evals)
    assert report["moves"][-1]["badge"] == "blunder"


def test_midgame_unclaimed_threefold_repetition_is_not_blunder():
    # OTB-style unclaimed 3-fold repetition on move 5 (ply 9), after which the game continues.
    pgn = """[FEN "6k1/5p1p/8/8/8/8/5Q2/6K1 w - - 0 1"]
[SetUp "1"]

1. Qg2+ Kh8 2. Qf2 Kg8 3. Qg2+ Kh8 4. Qf2 Kg8 5. Qg2+ Kh8 6. Qa8+"""
    b = chess.Board("6k1/5p1p/8/8/8/8/5Q2/6K1 w - - 0 1")
    moves = ["f2g2", "g8h8", "g2f2", "h8g8", "f2g2", "g8h8", "g2f2", "h8g8", "f2g2", "g8h8", "g2a8"]
    evals = []
    for uci in moves:
        fen = b.fen()
        if b.turn == chess.WHITE:
            evals.append({"fen": fen, "lines": [{"uci": uci, "cp": 800, "pv": [uci]}]})
        else:
            evals.append({"fen": fen, "lines": [{"uci": uci, "cp": -800, "pv": [uci]}]})
        b.push_uci(uci)
    evals.append({"fen": b.fen(), "lines": [{"uci": "h8g7", "cp": -900, "pv": ["h8g7"]}]})
    report = run(pgn, evals)
    # 5.Qg2+ (index 8) is a mid-game unclaimed 3-fold repetition, NOT a terminal draw blunder
    assert report["moves"][8]["badge"] == "best"
    assert report["moves"][8]["evalWhite"] == 8.0


def test_terminal_threefold_repetition_overrides_standalone_fen_eval_and_scores_draw():
    from review.analyze import _game_scores

    # No Result header ("*"), and Stockfish evaluates standalone FENs without history so evals[-1] still says mate: -1!
    pgn = """[FEN "6k1/5p1p/8/8/8/8/5Q2/6K1 w - - 0 1"]
[SetUp "1"]

1. Qg2+ Kh8 2. Qf2 Kg8 3. Qg2+ Kh8 4. Qf2 Kg8 5. Qg2+"""
    b = chess.Board("6k1/5p1p/8/8/8/8/5Q2/6K1 w - - 0 1")
    moves = ["f2g2", "g8h8", "g2f2", "h8g8", "f2g2", "g8h8", "g2f2", "h8g8", "f2g2"]
    evals = []
    for uci in moves:
        fen = b.fen()
        if b.turn == chess.WHITE:
            best = "f2a7" if b.piece_at(chess.F2) else "g2a8"
            evals.append({"fen": fen, "lines": [{"uci": best, "mate": 2, "pv": [best]}]})
        else:
            evals.append({"fen": fen, "lines": [{"uci": uci, "mate": -2, "pv": [uci]}]})
        b.push_uci(uci)
    # Standalone FEN without repetition history still sees forced mate in 1 for White (mate: -1 for Black)
    evals.append({"fen": b.fen(), "lines": [{"uci": "g8h8", "mate": -1, "pv": ["g8h8"]}]})
    assert b.is_repetition(3)
    assert _game_scores(b, "*") == {chess.WHITE: 0.5, chess.BLACK: 0.5}
    assert _game_scores(b, None) == {chess.WHITE: 0.5, chess.BLACK: 0.5}

    report = run(pgn, evals)
    last = report["moves"][-1]
    assert last["badge"] == "blunder"
    assert last["wAfter"] == 50.0
    assert last["evalWhite"] == 0.0
    assert last["mateWhite"] is None
    assert last["accuracy"] < 50.0

    # Even if standalone-FEN Stockfish listed the repeating move itself as PV1 (+800), it is still a blunder
    # AND bestUci / alternatives must promote the non-repeating PV2 instead of recommending the blunder itself!
    evals[-2]["lines"] = [{"uci": "f2g2", "cp": 800, "pv": ["f2g2"]}, {"uci": "f2a7", "cp": 780, "pv": ["f2a7"]}]
    evals[-1]["lines"] = [{"uci": "g8h8", "cp": -800, "pv": ["g8h8"]}]
    report2 = run(pgn, evals)
    last2 = report2["moves"][-1]
    assert last2["badge"] == "blunder"
    assert last2["accuracy"] < 50.0
    assert last2["bestUci"] == "f2a7"
    assert [a["uci"] for a in last2["alternatives"]] == ["f2a7", "f2g2"]
    assert last2["alternatives"][1]["w"] == 50.0

    # If the best non-repeating alternative (PV2) is only equal (+20), repeating is NOT a blunder.
    evals[-2]["lines"] = [{"uci": "f2g2", "cp": 800, "pv": ["f2g2"]}, {"uci": "f2f1", "cp": 20, "pv": ["f2f1"]}]
    report3 = run(pgn, evals)
    last3 = report3["moves"][-1]
    assert last3["badge"] == "excellent"
    assert last3["bestUci"] == "f2f1"

    # Single-line eval where only the repeating move was returned (+800): blunder with bestUci=None (not the blunder).
    evals[-2]["lines"] = [{"uci": "f2g2", "cp": 800, "pv": ["f2g2"]}]
    report4 = run(pgn, evals)
    last4 = report4["moves"][-1]
    assert last4["badge"] == "blunder"
    assert last4["bestUci"] is None
    assert last4["bestPv"] == []
    assert last4["alternatives"] == [{"uci": "f2g2", "san": "Qg2+", "w": 50.0}]

    # Terminal 3-fold repetition with empty evals[-1].lines succeeds without raising "missing engine lines".
    evals[-2]["lines"] = [{"uci": "f2a7", "mate": 2, "pv": ["f2a7"]}]
    evals[-1]["lines"] = []
    report5 = run(pgn, evals)
    assert report5["moves"][-1]["badge"] == "blunder"
    assert report5["moves"][-1]["evalWhite"] == 0.0


def test_terminal_fifty_move_draw_from_winning_position_is_blunder():
    from review.analyze import _game_scores

    # halfmove_clock=99: White has a winning queen + pawn, but plays quiet 1.Kf2 hitting 50-move draw (halfmove=100).
    pgn = """[FEN "6k1/8/8/8/8/8/5QP1/6K1 w - - 99 60"]
[SetUp "1"]

60. Kf1"""
    b = chess.Board("6k1/8/8/8/8/8/5QP1/6K1 w - - 99 60")
    f0 = b.fen()
    b.push_uci("g1f1")
    f1 = b.fen()
    assert b.is_fifty_moves()
    assert _game_scores(b, "*") == {chess.WHITE: 0.5, chess.BLACK: 0.5}

    evals = [
        {"fen": f0, "lines": [{"uci": "g2g3", "cp": 900, "pv": ["g2g3"]}]},
        # Standalone FEN eval ignores 50-move draw or reports winning score
        {"fen": f1, "lines": [{"uci": "g8h8", "cp": -900, "pv": ["g8h8"]}]},
    ]
    report = run(pgn, evals)
    last = report["moves"][-1]
    assert last["badge"] == "blunder"
    assert last["wAfter"] == 50.0
    assert last["evalWhite"] == 0.0
    assert last["accuracy"] < 50.0


def test_terminal_threefold_repetition_from_losing_position_is_not_blunder():
    # Losing side forces a 3-fold perpetual draw: saving a lost game is NOT a blunder.
    pgn = """[FEN "6k1/5p1p/8/8/8/8/5Q2/6K1 w - - 0 1"]
[SetUp "1"]

1. Qg2+ Kh8 2. Qf2 Kg8 3. Qg2+ Kh8 4. Qf2 Kg8 5. Qg2+ 1/2-1/2"""
    b = chess.Board("6k1/5p1p/8/8/8/8/5Q2/6K1 w - - 0 1")
    moves = ["f2g2", "g8h8", "g2f2", "h8g8", "f2g2", "g8h8", "g2f2", "h8g8", "f2g2"]
    evals = []
    for uci in moves:
        fen = b.fen()
        cp = -500 if b.turn == chess.WHITE else 500
        evals.append({"fen": fen, "lines": [{"uci": uci, "cp": cp, "pv": [uci]}]})
        b.push_uci(uci)
    evals.append({"fen": b.fen(), "lines": [{"uci": "g8h8", "cp": 500, "pv": ["g8h8"]}]})
    report = run(pgn, evals)
    assert report["moves"][-1]["badge"] in ("best", "excellent")
    assert report["moves"][-1]["wAfter"] == 50.0
    assert report["moves"][-1]["accuracy"] == 100.0


def test_terminal_repetition_with_decisive_result_header_not_forced_draw():
    from review.analyze import _game_scores

    # Explicit 1-0 result header (e.g., Black resigned in OTB on a 3rd repetition without claiming a draw).
    pgn = """[FEN "6k1/5p1p/8/8/8/8/5Q2/6K1 w - - 0 1"]
[SetUp "1"]
[Result "1-0"]

1. Qg2+ Kh8 2. Qf2 Kg8 3. Qg2+ Kh8 4. Qf2 Kg8 5. Qg2+ 1-0"""
    b = chess.Board("6k1/5p1p/8/8/8/8/5Q2/6K1 w - - 0 1")
    moves = ["f2g2", "g8h8", "g2f2", "h8g8", "f2g2", "g8h8", "g2f2", "h8g8", "f2g2"]
    evals = []
    for uci in moves:
        fen = b.fen()
        cp = 800 if b.turn == chess.WHITE else -800
        evals.append({"fen": fen, "lines": [{"uci": uci, "cp": cp, "pv": [uci]}]})
        b.push_uci(uci)
    evals.append({"fen": b.fen(), "lines": [{"uci": "g8h8", "cp": -800, "pv": ["g8h8"]}]})
    assert _game_scores(b, "1-0") == {chess.WHITE: 1.0, chess.BLACK: 0.0}
    report = run(pgn, evals)
    assert report["moves"][-1]["badge"] == "best"
    assert report["moves"][-1]["evalWhite"] == 8.0
