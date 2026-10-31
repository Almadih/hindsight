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
    is_recapture: bool = False  # direct recapture on the square the opponent just moved to / captured on
    was_in_check: bool = False  # mover was in check before this move
    cp_loss: int = 0  # centipawn loss from best engine score
    best_mate: int | None = None  # mate in N before move (positive for mover)
    after_mate: int | None = None  # mate in N after move (positive for mover, negative if mover mated)

    @property
    def win_lost(self) -> float:
        return max(0.0, self.w_before - self.w_after)


def classify(f: MoveFacts) -> str:
    if f.in_book:
        return "book"
    dw = f.win_lost
    if f.into_mate and not f.was_mated and f.w_before >= 15.0:
        return "blunder"

    # Missing a fast mate (mate in 1 or 2) when played move does not deliver fast mate
    if f.best_mate is not None and 0 < f.best_mate <= 2:
        delivered_fast_mate = f.has_mate and (f.after_mate == 0 or (f.after_mate is not None and 0 < f.after_mate <= 1))
        if not delivered_fast_mate:
            return "miss"

    # Punishing chances: opponent slipped (>= 15% drop) or we had mate, and we let it slip
    if (f.opp_win_lost is not None and f.opp_win_lost >= 15.0 and dw >= 10.0) or (f.had_mate and not f.has_mate):
        if f.w_after >= 35.0 or dw < 28.0:
            return "miss"
        return "blunder"

    if dw >= 28.0:
        return "blunder"

    # Brilliant: sound piece sacrifice that maintains equality or winning advantage
    if f.sacrifice and (f.played_best or dw < 6.0) and f.w_after >= 50.0 and f.w_before < 98.0:
        return "brilliant"

    # Great: finding the only move in a critical position. Recaptures and check evasions are routine.
    if f.played_best and not f.is_recapture and not f.was_in_check and f.pv_gap is not None and f.pv_gap >= 18.0 and f.w_before < 98.0:
        return "great"

    if f.played_best:
        return "best"

    # In decided losing positions (w_before < 20), win% saturates near 0; evaluate mistakes by centipawn loss
    if f.w_before < 20.0:
        if f.cp_loss >= 250:
            return "blunder" if f.cp_loss >= 600 else "mistake"
        if f.cp_loss >= 100:
            return "mistake"
        if f.cp_loss >= 50:
            return "inaccuracy"

    if dw < 3.0:
        return "excellent"
    if dw < 6.0:
        return "good"
    if dw < 14.0:
        return "inaccuracy"
    if dw < 28.0:
        return "mistake"
    return "blunder"



def _attackers(board: chess.Board, attacker_color: chess.Color, sq: chess.Square) -> list[chess.Square]:
    """Pieces of attacker_color that can legally capture sq."""
    if board.turn == attacker_color:
        return [m.from_square for m in board.legal_moves if m.to_square == sq]
    attackers = []
    for a in board.attackers(attacker_color, sq):
        if board.is_pinned(attacker_color, a):
            if not (board.pin_mask(attacker_color, a) & chess.BB_SQUARES[sq]):
                continue
        attackers.append(a)
    return attackers


def _defenders(board: chess.Board, defender_color: chess.Color, sq: chess.Square) -> list[chess.Square]:
    """Pieces of defender_color that protect sq (excluding pieces pinned away from sq)."""
    defenders = []
    for d in board.attackers(defender_color, sq):
        if board.is_pinned(defender_color, d):
            if not (board.pin_mask(defender_color, d) & chess.BB_SQUARES[sq]):
                continue
        defenders.append(d)
    return defenders


def _hanging(board: chess.Board, sq: chess.Square) -> bool:
    """Piece on sq can be won: attacked and undefended, or attacked by something cheaper."""
    piece = board.piece_at(sq)
    if not piece:
        return False
    attackers = _attackers(board, not piece.color, sq)
    if not attackers:
        return False
    defenders = _defenders(board, piece.color, sq)
    if not defenders:
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
