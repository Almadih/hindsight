"""Move classification matrix (plan.md §4.2)."""

from dataclasses import dataclass

import chess

VALUE = {chess.PAWN: 1, chess.KNIGHT: 3, chess.BISHOP: 3, chess.ROOK: 5, chess.QUEEN: 9, chess.KING: 100}  # king can only take undefended pieces


@dataclass
class MoveFacts:
    """Everything the badge rules need, all from the mover's point of view."""

    w_before: float  # win% before the move, assuming best play
    w_after: float  # win% after the played move
    played_best: bool  # played the engine's PV1
    pv_gap: float | None  # win% gap between PV1 and PV2, None if only one legal/known line
    in_book: bool
    sacrifice: bool
    opp_win_lost: float | None  # opponent's win% lost on the previous ply
    had_mate: bool  # mover had a forced mate before the move
    has_mate: bool  # mover still has a forced mate after the move
    into_mate: bool  # opponent has a forced mate after the move
    was_mated: bool  # mover was already being mated before the move

    @property
    def win_lost(self) -> float:
        return max(0.0, self.w_before - self.w_after)


def classify(f: MoveFacts) -> str:
    if f.in_book:
        return "book"
    dw = f.win_lost
    if f.into_mate and not f.was_mated:
        return "blunder"
    # Punishing chances: the opponent just blundered, or we had mate, and we let it slip.
    if (f.opp_win_lost is not None and f.opp_win_lost >= 15 and dw >= 10) or (f.had_mate and not f.has_mate):
        return "miss"
    # Calibration (scripts/calibrate) showed Brilliant and Great firing several times a game; both now demand
    # the engine's own top move, and Great a 40-point gap to the next-best line.
    if f.played_best and f.sacrifice and f.w_before < 85:
        return "brilliant"
    if f.played_best and f.pv_gap is not None and f.pv_gap >= 40:
        return "great"
    if f.played_best or dw < 1:
        return "best"
    if dw < 3:
        return "excellent"
    if dw < 5:
        return "good"
    if dw < 10:
        return "inaccuracy"
    if dw < 20:
        return "mistake"
    return "blunder"


def _hanging(board: chess.Board, sq: chess.Square) -> bool:
    """Piece on sq can be won: attacked and undefended, or attacked by something cheaper."""
    piece = board.piece_at(sq)
    attackers = board.attackers(not piece.color, sq)
    if not attackers:
        return False
    if not board.attackers(piece.color, sq):
        return True
    return min(VALUE[board.piece_type_at(a)] for a in attackers) < VALUE[piece.piece_type]


def is_sacrifice(board: chess.Board, move: chess.Move) -> bool:
    """Move leaves a non-pawn piece en prise that wasn't en prise before, net of anything it captured."""
    mover = board.turn
    captured = VALUE[chess.PAWN] if board.is_en_passant(move) else VALUE.get(board.piece_type_at(move.to_square), 0)
    hanging_before = {
        sq for sq, p in board.piece_map().items() if p.color == mover and p.piece_type not in (chess.PAWN, chess.KING) and _hanging(board, sq)
    }
    after = board.copy(stack=False)
    after.push(move)
    if after.is_checkmate():
        return False
    for sq, p in after.piece_map().items():
        if p.color != mover or p.piece_type in (chess.PAWN, chess.KING) or not _hanging(after, sq):
            continue
        if sq == move.to_square:
            if VALUE[p.piece_type] > captured:
                return True
        elif sq not in hanging_before:
            return True
    return False
