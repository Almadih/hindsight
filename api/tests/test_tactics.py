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
