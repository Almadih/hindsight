import chess
import pytest

from review.classify import MoveFacts, classify, is_sacrifice


def facts(w_before=50.0, w_after=50.0, **kw):
    base = dict(
        played_best=False, pv_gap=None, in_book=False, sacrifice=False, opp_win_lost=None,
        had_mate=False, has_mate=False, into_mate=False, was_mated=False,
    )
    return MoveFacts(w_before=w_before, w_after=w_after, **(base | kw))


@pytest.mark.parametrize(
    "lost,badge",
    [(0.5, "best"), (1, "excellent"), (2.9, "excellent"), (3, "good"), (5, "inaccuracy"), (10, "mistake"), (20, "blunder"), (60, "blunder")],
)
def test_thresholds(lost, badge):
    assert classify(facts(60, 60 - lost)) == badge


def test_book_wins_over_everything():
    assert classify(facts(60, 10, in_book=True)) == "book"


def test_brilliant_needs_top_move_and_unwon_position():
    assert classify(facts(60, 60, sacrifice=True, played_best=True)) == "brilliant"
    assert classify(facts(60, 59.5, sacrifice=True)) == "best"  # a sacrifice that isn't the engine's move
    assert classify(facts(90, 90, sacrifice=True, played_best=True)) == "best"
    assert classify(facts(60, 54, sacrifice=True)) == "inaccuracy"


def test_great_only_move():
    assert classify(facts(50, 50, played_best=True, pv_gap=45)) == "great"
    assert classify(facts(50, 50, played_best=True, pv_gap=25)) == "best"


def test_miss_and_mate_rules():
    assert classify(facts(80, 65, opp_win_lost=30)) == "miss"
    assert classify(facts(80, 65, opp_win_lost=5)) == "mistake"
    assert classify(facts(99.9, 99.5, had_mate=True, has_mate=False)) == "miss"
    assert classify(facts(50, 49.5, into_mate=True)) == "blunder"
    assert classify(facts(0.1, 0.1, into_mate=True, was_mated=True)) == "best"


def board_after(san_moves: str) -> chess.Board:
    b = chess.Board()
    for san in san_moves.split():
        b.push_san(san)
    return b


def test_sacrifice_detection():
    opera = "e4 e5 Nf3 d6 d4 Bg4 dxe5 Bxf3 Qxf3 dxe5 Bc4 Nf6 Qb3 Qe7 Nc3 c6 Bg5 b5 Nxb5 cxb5 Bxb5+ Nbd7 O-O-O Rd8 Rxd7 Rxd7 Rd1 Qe6 Bxd7+ Nxd7"
    b = board_after(opera)
    assert is_sacrifice(b, b.parse_san("Qb8+"))  # queen offered to the d7 knight
    b = board_after("e4 e5 Nf3 d6 d4 Bg4 dxe5 Bxf3 Qxf3 dxe5 Bc4 Nf6 Qb3 Qe7 Nc3 c6 Bg5 b5")
    assert is_sacrifice(b, b.parse_san("Nxb5"))  # knight for a pawn
    b = board_after("e4 e5")
    assert not is_sacrifice(b, b.parse_san("Nf3"))
    b = board_after("e4 e5 Nf3 d6 d4 Bg4 dxe5")
    assert not is_sacrifice(b, b.parse_san("Bxf3"))  # even trade
