import chess

from review.tactics import describe, motifs


def board(fen_or_moves: str) -> chess.Board:
    if "/" in fen_or_moves:
        return chess.Board(fen_or_moves)
    b = chess.Board()
    for san in fen_or_moves.split():
        b.push_san(san)
    return b


def test_knight_fork():
    b = board("r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1")
    assert "Nc7+ forks the king and the rook" in motifs(b, b.parse_san("Nc7+"))


def test_fork_two_rooks():
    b = board("k2r1r2/8/8/6N1/8/8/8/7K w - - 0 1")
    assert motifs(b, b.parse_san("Ne6")) == ["Ne6 forks the two rooks"]



def test_new_pin():
    b = board("4k3/8/2n5/8/8/8/8/4KB2 w - - 0 1")
    assert motifs(b, b.parse_san("Bb5")) == ["Bb5 pins the knight on c6 to the king"]


def test_blunder_hangs_queen():
    b = board("4k3/8/8/3q4/8/4P3/8/4K3 b - - 0 1")
    facts = describe(b, b.parse_san("Qd4"), "blunder", None, "e3d4", None, None)
    assert facts == ["Qd4 leaves the queen on d4 hanging", "it allows exd4, winning the queen"]


def test_blunder_into_mate():
    b = board("e4 e5 Qh5 Nc6 Bc4")
    facts = describe(b, b.parse_san("Nf6"), "blunder", "g7g6", "h5f7", None, 1)
    assert "it allows mate in 1, starting with Qxf7#" in facts


def test_missed_mate():
    b = board("e4 e5 Qh5 Nc6 Bc4 Nf6")
    facts = describe(b, b.parse_san("d3"), "miss", "h5f7", None, 1, None)
    assert facts == ["Qxf7# would have started mate in 1"]


def test_quiet_badges_get_no_facts():
    b = board("e4 e5")
    assert describe(b, b.parse_san("Nf3"), "best", "g1f3", None, None, None) == []


def test_attacking_a_pawn_is_not_a_fork():
    b = board("4k3/p4q2/8/8/8/8/8/3RK3 w - - 0 1")
    assert not any("forks" in f for f in motifs(b, b.parse_san("Rd7")))


def test_good_move_facts_include_what_it_leads_to():
    b = board("e4 e5 Nf3 d6 d4 Bg4 dxe5 Bxf3 Qxf3 dxe5 Bc4 Nf6 Qb3 Qe7 Nc3 c6 Bg5 b5 Nxb5 cxb5 Bxb5+ Nbd7 O-O-O Rd8 Rxd7 Rxd7 Rd1 Qe6 Bxd7+ Nxd7")
    facts = describe(b, b.parse_san("Qb8+"), "brilliant", "b3b8", "d7b8", 2, -1)
    assert "it forces mate in 1" in facts
    assert "the best answer is Nxb8" in facts


def test_blunder_that_skips_a_recapture_says_so():
    # Real game: 13...Rxd1 took a knight; 14. Bf4?? doesn't take back (Stockfish: Rxd1 +5.4, then 14...Bxf2+ 15. Kh1 Rxa1).
    b = board(
        "d4 d5 c4 dxc4 e4 Nf6 Nc3 Nc6 Nf3 Nxd4 Nxd4 e5 Nf3 Qxd1+ Nxd1 Nxe4 Bxc4 Bc5 O-O Be6 Bxe6 fxe6 Nxe5 O-O-O Nf7 Rxd1"
    )
    facts = describe(b, b.parse_san("Bf4"), "blunder", "f1d1", "c5f2", None, None)
    # Bxf2+ really wins the pawn: Kxf2 is covered by Ne4 and the f1 rook is pinned.
    # The a1 rook is not "hanging": ...Rxa1 Rxa1 is only a trade.
    assert facts == ["Bf4 misses the recapture Rxd1", "it allows Bxf2+, winning the pawn"]


def test_capture_that_can_be_taken_back_is_not_called_winning():
    # After 1. Ke2?? Nxc3+ 2. bxc3 it's a knight trade, not a knight won.
    b = board("4k3/8/8/3n4/8/2N5/1P6/4K3 w - - 0 1")
    assert describe(b, b.parse_san("Ke2"), "blunder", None, "d5c3", None, None) == []


def test_quiet_move_on_the_square_is_not_a_missed_recapture():
    # Real game: 10...g6 was a pawn move, so Bxg6 isn't a recapture.
    b = board("d4 d5 Bf4 Nc6 e3 a6 Nf3 Nf6 Bd3 h6 h3 e6 O-O Bd6 Ne5 Bxe5 dxe5 Nd7 Qh5 g6")
    facts = describe(b, b.parse_san("Qe2"), "miss", "d3g6", None, None, None)
    assert not any("recapture" in f for f in facts)


def test_capturing_into_a_recapture_is_a_trade_not_a_hanging_piece():
    # Real game: 15...Nxc3 16. dxc3 is knight for knight.
    b = board("e4 e5 Nf3 Nf6 Nc3 Nc6 Bc4 Bc5 O-O d6 a3 Bg4 b4 Bd4 h3 Bxf3 Qxf3 Qe7 Bb2 O-O-O b5 Na5 Bd3 Qe6 a4 d5 exd5 Nxd5 Rab1")
    assert describe(b, b.parse_san("Nxc3"), "blunder", None, "d2c3", None, None) == []


def test_best_move_that_wins_material_says_what_it_wins():
    b = board("4k3/8/8/3n4/4P3/8/8/4K3 w - - 0 1")
    assert describe(b, b.parse_san("Kf2"), "blunder", "e4d5", None, None, None) == ["exd5 would have won the knight"]


def test_defended_piece_attacked_by_something_cheaper_is_hanging():
    # 1. Nc3?? lets ...d4 hit it; the knight can be taken by a pawn even though b2 defends it.
    b = board("4k3/8/8/8/3p4/8/1P6/1N2K3 w - - 0 1")
    facts = describe(b, b.parse_san("Nc3"), "blunder", None, "d4c3", None, None)
    assert facts == ["Nc3 leaves the knight on c3 hanging", "it allows dxc3, winning material"]


def test_long_mates_are_not_counted():
    b = board("e4 e5 Qh5 Nc6 Bc4")
    facts = describe(b, b.parse_san("Nf6"), "blunder", "g7g6", "h5f7", None, 9)
    assert "it allows a forced mate, starting with Qxf7#" in facts


def test_already_hanging_piece_while_in_check_not_blamed_on_evasion():
    # White is in check from Qh4+, and Rc3 is ALREADY lost to doubled rooks (Rc8 + Rc7 vs Rc1).
    b = board("2r1k3/2r5/8/8/7q/2R5/8/2R1K3 w - - 0 1")
    facts = describe(b, b.parse_san("Kd1"), "blunder", "e1f1", "c7c3", None, None)
    assert not any("leaves the rook on c3 hanging" in f for f in facts)


def test_skewer_discovered_check_double_check_and_discovered_attack():
    # Skewer: Re1+ skewers king on e6 and queen on e8
    b_skewer = board("4q3/8/4k3/8/8/8/8/R5K1 w - - 0 1")
    assert "Re1+ skewers the king on e6 and the queen on e8" in motifs(b_skewer, b_skewer.parse_san("Re1+"))

    # Discovered check & double check
    b_disc = board("4k3/8/8/8/4N3/8/8/4R2K w - - 0 1")
    assert "Nc5+ unleashes a discovered check from the rook on e1" in motifs(b_disc, b_disc.parse_san("Nc5+"))
    assert "Nf6+ delivers double check" in motifs(b_disc, b_disc.parse_san("Nf6+"))

    # Discovered attack (non-check)
    b_att = board("6k1/3q4/8/8/3N4/8/8/3R2K1 w - - 0 1")
    assert "Nb5 uncovers an attack on the queen on d7" in motifs(b_att, b_att.parse_san("Nb5"))


def test_adds_pressure_to_existing_pin_and_saves_threatened_piece():
    # Opera Game 14. Rd1 adds pressure to Black's pinned rook on d7
    b = board("e4 e5 Nf3 d6 d4 Bg4 dxe5 Bxf3 Qxf3 dxe5 Bc4 Nf6 Qb3 Qe7 Nc3 c6 Bg5 b5 Nxb5 cxb5 Bxb5+ Nbd7 O-O-O Rd8 Rxd7 Rxd7")
    assert "Rd1 adds pressure to the pinned rook on d7" in motifs(b, b.parse_san("Rd1"))

    # Great move saving a threatened piece (Nd2 is undefended and attacked by Rd4)
    b_save = board("4k3/8/8/8/3r4/8/3N4/6K1 w - - 0 1")
    facts = describe(b_save, b_save.parse_san("Nf3"), "great", "d2f3", None, None, None)
    assert "Nf3 saves the knight from d2" in facts


def test_multipv_refutation_missed_win_back_rank_and_trade_guard():
    # Back-rank check vulnerability (1.h3?? allows 1...Rb1+ 2.Kh2)
    b_rank = board("1r4k1/5ppp/8/8/8/8/4RPPP/6K1 w - - 0 1")
    facts_br = describe(b_rank, b_rank.parse_san("h3"), "blunder", "e2e8", "b8b1", None, None, reply_pv=["b8b1", "g1h2"])
    assert "it leaves the back rank vulnerable to Rb1+" in facts_br

    # Multi-ply material win via refutation (non-capture first move -> fork winning the rook)
    b_nf = board("4k3/8/8/8/3n4/8/8/R3K3 w - - 0 1")
    facts_nf = describe(
        b_nf,
        b_nf.parse_san("Kd1"),
        "mistake",
        "e1f1",
        "d4b3",
        None,
        None,
        reply_pv=["d4b3", "d1c2", "b3a1"],
    )
    assert "it allows Nb3, winning the rook on a1" in facts_nf

    # Capture-trade guard: 1.Bxf6 Bxf6 is a trade, NOT winning the bishop
    b_trade2 = board("4k3/6p1/5n2/8/3B4/8/8/4K3 w - - 0 1")
    facts_trade2 = describe(
        b_trade2,
        b_trade2.parse_san("Bxf6"),
        "mistake",
        "d4c3",
        "g7f6",
        None,
        None,
        reply_pv=["g7f6"],
    )
    assert not any("winning" in f for f in facts_trade2)


def test_abandoned_defender_positional_cues_and_inaccuracy():
    # Abandoned pawn defender (Ke8 on g8 so Re2 is not check)
    b_pawn = board("6k1/8/8/3r4/8/3P4/3R4/4K3 w - - 0 1")
    facts_pawn = describe(b_pawn, b_pawn.parse_san("Re2"), "inaccuracy", "d2e2", None, None, None)
    assert "Re2 pulls a defender away from the pawn on d3" in facts_pawn

    # Positional cue: castling
    b_castle = board("4k3/8/8/8/8/8/8/4K2R w K - 0 1")
    assert describe(b_castle, b_castle.parse_san("Kf1"), "mistake", "e1g1", None, None, None, phase="opening") == [
        "O-O would have castled the king to safety"
    ]

    # Positional cue: opening development
    b_dev = board("rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2")
    assert describe(b_dev, b_dev.parse_san("a3"), "inaccuracy", "g1f3", None, None, None, phase="opening") == [
        "Nf3 develops the knight to f3"
    ]

    # Positional cue: endgame king activation
    b_eg = board("8/8/8/8/8/8/8/4K2k w - - 0 1")
    assert describe(b_eg, b_eg.parse_san("Kf1"), "mistake", "e1e2", None, None, None, phase="endgame") == [
        "Ke2 activates the king for the endgame"
    ]
