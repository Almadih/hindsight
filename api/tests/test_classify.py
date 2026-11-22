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
    "played_best,lost,badge",
    [
        (True, 0.0, "best"),
        (False, 0.5, "excellent"),
        (False, 1.0, "excellent"),
        (False, 2.9, "excellent"),
        (False, 3.0, "good"),
        (False, 5.9, "good"),
        (False, 6.0, "inaccuracy"),
        (False, 13.9, "inaccuracy"),
        (False, 14.0, "mistake"),
        (False, 27.9, "mistake"),
        (False, 28.0, "blunder"),
        (False, 60.0, "blunder"),
    ],
)
def test_thresholds(played_best, lost, badge):
    assert classify(facts(60, 60 - lost, played_best=played_best)) == badge


def test_book_wins_over_everything():
    assert classify(facts(60, 10, in_book=True)) == "book"


def test_brilliant_needs_sound_sacrifice_and_unwon_position():
    assert classify(facts(60, 60, sacrifice=True, played_best=True)) == "brilliant"
    assert classify(facts(60, 59.5, sacrifice=True)) == "brilliant"  # sound sacrifice (dw < 6.0, w_after >= 50) is brilliant
    assert classify(facts(99, 99, sacrifice=True, played_best=True)) == "best"  # w_before >= 98 is already won
    assert classify(facts(60, 50, sacrifice=True)) == "inaccuracy"


def test_great_only_move():
    assert classify(facts(50, 50, played_best=True, pv_gap=25)) == "great"
    assert classify(facts(50, 50, played_best=True, pv_gap=10)) == "best"
    assert classify(facts(50, 50, played_best=True, pv_gap=25, is_recapture=True)) == "best"
    assert classify(facts(50, 50, played_best=True, pv_gap=25, was_in_check=True)) == "best"


def test_miss_and_mate_rules():
    assert classify(facts(80, 65, opp_win_lost=30)) == "miss"
    assert classify(facts(80, 65, opp_win_lost=5)) == "mistake"
    assert classify(facts(99.9, 99.5, had_mate=True, has_mate=False)) == "miss"
    assert classify(facts(50, 49.5, into_mate=True)) == "blunder"
    assert classify(facts(0.1, 0.1, into_mate=True, was_mated=True, played_best=True)) == "best"
    assert classify(facts(80, 50, opp_win_lost=30)) == "miss"  # missed punishment, position still equal (w_after=50) -> miss
    assert classify(facts(80, 20, opp_win_lost=30)) == "blunder"  # turned game into completely lost -> blunder
    assert classify(facts(100, 100, best_mate=1, after_mate=4, has_mate=True)) == "miss"  # missed mate in 1 -> miss


def test_decided_position_centipawn_loss():
    # In heavily losing positions (w_before < 20), win% drop is tiny even for huge material loss
    assert classify(facts(10, 8, cp_loss=150)) == "mistake"
    assert classify(facts(10, 8, cp_loss=60)) == "inaccuracy"
    assert classify(facts(10, 9, cp_loss=10)) == "excellent"



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
    # Pinned pawn cannot legally capture: Qg3+ is not a queen sacrifice
    pinned_game = "e4 e5 Nf3 Nc6 Bc4 Nf6 d3 Bc5 c3 O-O b4 Bb6 O-O a5 b5 Ne7 Nxe5 d6 Nf3 Bg4 h3 Bh5 Bg5 Ng6 Nbd2 h6 Bxf6 Qxf6 e5 Nxe5 Qb3 Nxf3+ Nxf3 Bxf3 gxf3 Qxf3 Bd5"
    b = board_after(pinned_game)
    assert not is_sacrifice(b, b.parse_san("Qg3+"))
    # Pawn promotion into a recapture (e8=Q+ Rxe8 Rxe8) wins a rook for a pawn, not a sacrifice
    b = chess.Board("r5k1/4Pppp/8/8/8/8/5PPP/4R1K1 w - - 0 1")
    assert not is_sacrifice(b, b.parse_san("e8=Q+"))
