import chess
import pytest

from review.classify import MoveFacts, classify, is_free_capture, is_sacrifice


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
        (False, 4.9, "good"),
        (False, 5.0, "inaccuracy"),
        (False, 9.9, "inaccuracy"),
        (False, 10.0, "mistake"),
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
    assert classify(facts(60, 59.5, sacrifice=True)) == "brilliant"  # sound sacrifice (dw < 1.5, w_after >= 50) is brilliant
    assert classify(facts(99, 99, sacrifice=True, played_best=True)) == "best"  # w_before >= 85 (without pv_gap) is already won
    assert classify(facts(60, 50, sacrifice=True)) == "mistake"


def test_great_only_move():
    assert classify(facts(50, 50, played_best=True, pv_gap=25)) == "great"
    assert classify(facts(50, 50, played_best=True, pv_gap=10)) == "great"
    assert classify(facts(50, 50, played_best=True, pv_gap=9)) == "best"
    assert classify(facts(50, 50, played_best=True, pv_gap=25, is_recapture=True)) == "best"
    # Non-forced check evasions qualify as great when pv_gap >= 16 (e.g. Rg7, Rd6, Kf2)
    assert classify(facts(50, 50, played_best=True, pv_gap=16, was_in_check=True)) == "great"
    assert classify(facts(50, 50, played_best=True, pv_gap=15, was_in_check=True)) == "best"


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


def test_false_brilliant_regressions_from_real_games():
    # Pinned defender unpinned by the capture: Qc7 offers a queen trade (Qxc7 Rxc7), NOT a sacrifice
    b = chess.Board("4kb1r/p2r1ppp/2Q1p3/q7/3P4/P1P3P1/3K1P1P/R6R b k - 0 18")
    assert not is_sacrifice(b, b.parse_san("Qc7"))

    # Winning exchange/material trade on target square: Rxf8+ takes knight (3), Bxf8 Qxf8 loses only 2 -> net +1
    b = chess.Board("4Rn1k/6r1/pp5p/2b2Q1P/8/1BP5/PP1q1PP1/6K1 w - - 8 39")
    assert not is_sacrifice(b, b.parse_san("Rxf8+"))

    # Piece trade that only drops a pawn (Bxg4 fxg4 Nxg4, SEE == 1), NOT a piece/exchange sacrifice
    b = chess.Board("r4r2/1pkbq2p/3p1n2/p1pP1p1P/n1P1p3/4N1PB/1B2QP2/R3K2R b KQ - 1 22")
    assert not is_sacrifice(b, b.parse_san("Ng4"))
    b = chess.Board("r4rk1/1p1bbp1p/p3pp2/5q2/PnBPN2R/1Q3N2/1P3PPP/R5K1 w - - 6 18")
    assert not is_sacrifice(b, b.parse_san("Nc5"))

    # Mutual equal counter-attack: Rg2 leaves Nf7 hanging while attacking undefended Ng4 (Kxf7 Rxg4 = 3 for 3)
    b = chess.Board("5k2/pp2pN1p/6p1/3r4/6n1/8/5R1P/1K5R w - - 0 28")
    assert not is_sacrifice(b, b.parse_san("Rg2"))

    # Discovered attack on higher-value piece: Nfd5 uncovers Rf8 on Qf3 (cxd5 Rxf3 wins queen for rook)
    b = chess.Board("r4rk1/1p2q1p1/5n1p/p3b3/1nPpP3/BN1N1QP1/7P/R4RK1 b - - 1 23")
    assert not is_sacrifice(b, b.parse_san("Nfd5"))

    # Discovered attack with check onto undefended queen: Nxh5+ (Rxh5 Qxc7 immediately wins queen)
    b = chess.Board("7r/p1q2pk1/6p1/1p5p/1P2pN2/P5QP/2P2PP1/6K1 w - - 0 26")
    assert not is_sacrifice(b, b.parse_san("Nxh5+"))

    # Capturing enemy queen while leaving a minor piece hanging wins +6 material, NOT a sacrifice
    b = chess.Board("3qk3/8/8/8/4n3/8/4N3/3Q2K1 w - - 0 1")
    assert not is_sacrifice(b, b.parse_san("Qxd8+"))

    # Trapped & attacked knight desperado (a8 knight attacked by Rc8, c7 defended by Rc8, b6 by c7 -> no safe square)
    b = chess.Board("N1r4k/1pp5/1p6/8/8/8/8/6K1 w - - 0 1")
    assert not is_sacrifice(b, b.parse_san("Nxb6"))


def test_real_sacrifices_still_detected():
    # Forced-mate rook sacrifice (Game 2: Rh8+ Kxh8 fxg7+)
    b = chess.Board("1R6/5ppk/p4P1p/4P3/8/5Q1P/1Pqr3r/5RK1 w - - 5 39")
    assert is_sacrifice(b, b.parse_san("Rh8+"))

    # Deflection knight sacrifice (Game 16: Nxf6+ Rxf6 Rxd8+)
    b = chess.Board("3r1rk1/pb5p/1pn2pp1/2pNnN2/4P3/1P4P1/P2R1PBP/3R2K1 w - - 0 25")
    assert is_sacrifice(b, b.parse_san("Nxf6+"))

    # True king deflection sacrifice (Bxf7+ Kxf7 Qxd8: Ke8 was defending Qd8 before Kxf7)
    b = chess.Board("3qk2r/5ppp/8/8/2B5/8/5PPP/3Q2K1 w k - 0 1")
    assert is_sacrifice(b, b.parse_san("Bxf7+"))

    # Classic Greek Gift (Bxh7+ Kxh7)
    b = chess.Board("r1bq1rk1/ppp2ppp/2n1pn2/3p4/3P4/2NBPN2/PPP2PPP/R2QK2R w KQ - 0 8")
    assert is_sacrifice(b, b.parse_san("Bxh7+"))

    # Exchange sacrifice for a pawn (Rxc3 bxc3)
    b = chess.Board("2r3k1/5ppp/8/8/8/2N5/1PP2PPP/3R2K1 b - - 0 1")
    assert is_sacrifice(b, b.parse_san("Rxc3"))


def test_brilliant_forced_mate_and_already_won_rules():
    # Forced-mate sacrifice where PV1=100% ONLY because of the sacrifice (PV2=32%) IS brilliant
    assert classify(facts(100.0, 100.0, sacrifice=True, played_best=True, pv_gap=68.0)) == "brilliant"
    # Sacrifice when PV2 is ALREADY effortlessly winning (88%) is NOT brilliant
    assert classify(facts(92.0, 92.0, sacrifice=True, played_best=True, pv_gap=4.0)) == "best"
    # Non-best move losing 2.5% win is NOT brilliant (must be played_best or within 1.5%)
    assert classify(facts(75.0, 72.5, sacrifice=True, played_best=False)) == "excellent"
    # Defensive/drawing sacrifice holding equality (w_after=48%) IS brilliant
    assert classify(facts(50.0, 48.0, sacrifice=True, played_best=True, pv_gap=30.0)) == "brilliant"
    # Desperation sacrifice while still losing (w_after=30%) is NOT brilliant
    assert classify(facts(32.0, 30.0, sacrifice=True, played_best=True, pv_gap=20.0)) == "best"


def test_forced_and_best_moves_immune_to_horizon_errors():
    # Only legal move is always best, never blunder/great/brilliant even with huge eval noise
    assert classify(facts(50.0, 10.0, is_forced=True, into_mate=True)) == "best"
    assert classify(facts(60.0, 60.0, is_forced=True, played_best=True, sacrifice=True, pv_gap=40.0)) == "best"
    # Engine's #1 choice (played_best) is never called blunder/miss even if next-ply horizon drops 35%
    assert classify(facts(60.0, 25.0, played_best=True)) == "best"
    assert classify(facts(47.0, 31.0, played_best=True, pv_gap=26.0)) == "best"  # dw=16 horizon drop -> best, not great


def test_great_move_filters():
    # Free undefended capture is routine best, not great
    assert classify(facts(80.0, 80.0, played_best=True, pv_gap=55.0, is_free_capture=True)) == "best"
    # Finding "least losing" move when still dead lost (w_after=25) is best, not great
    assert classify(facts(25.0, 25.0, played_best=True, pv_gap=22.0)) == "best"
    # Not great when PV2 is already clearly winning (pv2=78%)
    assert classify(facts(97.0, 97.0, played_best=True, pv_gap=19.0)) == "best"


def test_miss_stalemate_and_garbage_time_edge_cases():
    # Stalemating from a winning position / forced mate is a blunder, NOT a miss
    assert classify(facts(100.0, 50.0, had_mate=True, has_mate=False, is_game_over_draw=True)) == "blunder"
    assert classify(facts(100.0, 50.0, best_mate=1, after_mate=None, is_game_over_draw=True)) == "blunder"
    # Missing M1 and blundering into a lost position is a blunder, not a miss
    assert classify(facts(100.0, 15.0, best_mate=1, after_mate=None)) == "blunder"
    # Delaying M2 to M2 (still forced mate in 2) is NOT a miss
    assert classify(facts(100.0, 100.0, best_mate=2, after_mate=2, has_mate=True)) == "excellent"
    # Already losing (w_before < 50) and getting worse after opponent's slip is mistake/blunder, NOT a miss
    assert classify(facts(34.0, 16.0, opp_win_lost=25.0)) == "mistake"
    assert classify(facts(52.0, 25.0, opp_win_lost=25.0)) == "mistake"
    # Garbage-time (-15 pawns, w_before=0.3%) eval drift of 150cp is NOT a mistake/blunder
    assert classify(facts(0.3, 0.2, cp_loss=150)) == "excellent"
    assert classify(facts(0.2, 0.0, cp_loss=700)) == "excellent"
    # Dropping from a dead-equal position (w_before=50) after opp dropped from winning is inaccuracy/mistake, not miss
    assert classify(facts(50.0, 42.0, opp_win_lost=25.9)) == "inaccuracy"
    assert classify(facts(50.0, 36.4, opp_win_lost=25.9)) == "mistake"
    assert classify(facts(50.0, 35.0, opp_win_lost=25.9)) == "mistake"


def test_in_check_static_see_and_exchange_sac_counter_trade():
    # In check from Qh4+, c3 knight is already lost to 2 attackers (Bg7, Ne4) vs 1 defender (Bd2):
    # stepping out of check with Kd1 is NOT a sacrifice.
    b = chess.Board("4k3/6b1/8/8/4n2q/2N5/3B4/4K3 w - - 0 1")
    assert b.is_check()
    assert not is_sacrifice(b, b.parse_san("Kd1"))

    # True exchange sacrifice Re5 (defended by d4, attacked by Bb8 -> opp_see=2, full value=5):
    # having an unrelated minor-piece capture (bxa5, gain=3 < 5) does NOT offset forfeiting the rook recapture.
    b = chess.Board("1b2k3/8/8/n7/1P1P4/8/8/4R1K1 w - - 0 1")
    assert is_sacrifice(b, b.parse_san("Re5"))


def test_only_move_forced_mate_is_great_except_mate_in_one():
    # Only-move mate-in-2 setup (PV2 is only 50% equal) qualifies as great
    assert classify(facts(100.0, 100.0, played_best=True, pv_gap=50.0, best_mate=2, after_mate=1)) == "great"
    # Delivering mate-in-1 checkmate stays best, not great
    assert classify(facts(100.0, 100.0, played_best=True, pv_gap=50.0, best_mate=1, after_mate=0)) == "best"


def test_in_check_xray_battery_not_false_sacrifice():
    from review.classify import _static_threat

    # Doubled rooks (Rc8 + Rc7) x-ray attacking defended Rc3 (defended by Rc1) while in check from Qh4+:
    # Rc3 is already lost before Kd1, so stepping out of check is NOT a sacrifice.
    b = chess.Board("2r1k3/2r5/8/8/7q/2R5/8/2R1K3 w - - 0 1")
    assert b.is_check()
    assert _static_threat(b, chess.C3) == 5
    assert not is_sacrifice(b, b.parse_san("Kd1"))

    # Diagonal battery (Qa6 + Bb5) x-ray attacking defended Nd3 (defended by Bc2) while in check from Re8+:
    # Nd3 is already lost before Kf2, so stepping out of check is NOT a sacrifice.
    b = chess.Board("4r1k1/8/q7/1b6/8/3N4/2B5/4K3 w - - 0 1")
    assert b.is_check()
    assert _static_threat(b, chess.D3) == 3
    assert not is_sacrifice(b, b.parse_san("Kf2"))

    # X-ray battery defenders (Rc2 + Rc1) protect Nc3 against doubled rooks (Rc8 + Rc7) while in check:
    # Nc3 is initially safe (threat == 0), so abandoning c3 with Rf2 IS a genuine sacrifice.
    b = chess.Board("2r1k3/2r5/8/8/7q/2N5/2R5/2R1K3 w - - 0 1")
    assert b.is_check()
    assert _static_threat(b, chess.C3) == 0
    assert is_sacrifice(b, b.parse_san("Rf2"))

    # King cannot capture onto a square x-rayed through the king itself (Rc8 x-rays c4 through Kc5).
    b = chess.Board("2r1k3/8/8/2K5/2r5/8/8/8 b - - 0 1")
    assert _static_threat(b, chess.C4) == 0

    # Pawn promotion into an x-ray-defended square (Rb8 + Qa8) while Black king on h8 is in check from Bb2+.
    # exd8=Q (+5+8) Rxd8 (-9); White Rd1 stops because Qa8 x-ray defends d8 -> net +4.
    b = chess.Board("qr1r3k/4P2p/8/8/8/8/1B3PPP/3R2K1 b - - 0 1")
    assert b.is_check()
    assert _static_threat(b, chess.D8) == 4

    # On-ray pinned attacker (Rc7 pinned along c-file to Kc8 by Rc1) CAN capture Qc3; off-ray pinned Qc8 behind Rc7 CANNOT.
    b = chess.Board("2k5/2r5/8/8/7q/2Q5/8/2R1K3 w - - 0 1")
    assert b.is_check()
    assert _static_threat(b, chess.C3) == 4
    b = chess.Board("k1q4R/2r5/8/8/7q/2N5/8/2R1K3 w - - 0 1")
    assert b.is_check()
    assert _static_threat(b, chess.C3) == 0


def test_doomed_in_check_and_fork_escape_not_false_sacrifice():
    # Ke1 in check from Re8+; Bd2 is defended only by Ke1 and attacked by Rd8, while Ba4 covers d1.
    # Every legal evasion (Kf1, Kf2, Be3) loses Bd2, so none of them is a sacrifice.
    b = chess.Board("3rr1k1/5ppp/8/8/b7/8/3B2PP/4K3 w - - 0 1")
    assert b.is_check()
    for san in ("Kf1", "Kf2", "Be3"):
        assert not is_sacrifice(b, b.parse_san(san))

    # Inescapable fork: Nd4 forks Qe2 and Re6 (defended by Qe2); e1 is occupied and e3/e4/e5/diagonals are blocked/covered.
    # Saving the Queen with Qf2 drops the lesser piece (Re6) — a fork escape, NOT a sacrifice.
    b = chess.Board("6k1/6pp/4Rp2/3p4/3n1p2/3P1P2/4Q1PP/4K3 w - - 0 1")
    assert not is_sacrifice(b, b.parse_san("Qf2"))

    # When a safe square DOES keep both pieces defended (Qd2), voluntarily abandoning Ra2 with Qf3 still counts.
    b = chess.Board("6k1/5ppp/8/8/8/2n5/R3Q1PP/6K1 w - - 0 1")
    assert not is_sacrifice(b, b.parse_san("Qd2"))
    assert is_sacrifice(b, b.parse_san("Qf3"))


def test_chesscom_alignment_regressions():
    # Relative-pin pseudo-sacrifice (G15 ply 33 Nc5): d6 is pinned to Qc7 by Bf4 (dxc5 Bxc7), NOT a sacrifice.
    b = chess.Board("r2r2k1/p1q1ppbp/1nppb1p1/8/N3PB2/1P6/P1PQBPPP/3RR1K1 w - - 5 17")
    assert not is_sacrifice(b, b.parse_san("Nc5"))

    # Routine winning Queen capture by a Rook (G17 ply 65 Rxd5) is filtered out of Great via is_free_capture.
    b_q = chess.Board("3r2r1/4kp1R/5p2/p1Rqp3/1n6/4QN2/1P3PPP/5bK1 w - - 0 33")
    assert is_free_capture(b_q, b_q.parse_san("Rxd5"))

    # Tactical exchange capture (G27 ply 42 Nxf1) is NOT filtered out by is_free_capture.
    b_ex = chess.Board("2k3rr/ppp1qp2/3p3p/8/3PPQ2/1BP1n3/P1P2K2/R1B2R2 b - - 6 21")
    assert not is_free_capture(b_ex, b_ex.parse_san("Nxf1"))

    # Continuation checks inside an already-forced mating net (G02 fxg7+, Qxf7+) stay best, not great.
    assert classify(facts(97.5, 97.5, played_best=True, pv_gap=97.5, best_mate=7, after_mate=6, continuing_mate=True)) == "best"
    assert classify(facts(97.5, 97.5, played_best=True, pv_gap=97.5, best_mate=7, after_mate=6, continuing_mate=False)) == "great"

    # Missed unique winning shot (pv_gap >= 18, dw >= 12, w_before >= 65, w_after >= 35) is a miss even with opp_win_lost=0.
    assert classify(facts(73.9, 49.0, pv_gap=19.2, opp_win_lost=0.0)) == "miss"
    assert classify(facts(86.3, 58.7, pv_gap=20.6, opp_win_lost=3.8)) == "miss"
    # Turning a winning shot into a lost position (w_after < 35) stays blunder/mistake, not miss.
    assert classify(facts(73.9, 30.0, pv_gap=19.2, opp_win_lost=0.0)) == "blunder"
