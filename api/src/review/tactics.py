"""Deterministic tactical facts for key moves (plan.md §4.3), fed to the coach and used as its fallback text."""

import chess

from .classify import VALUE, _threats, capture_gain as _capture_gain, is_sacrifice, see as _see

KEY_BADGES = {"blunder", "miss", "mistake", "brilliant", "great"}
GOOD_BADGES = {"brilliant", "great"}
NAME = {chess.PAWN: "pawn", chess.KNIGHT: "knight", chess.BISHOP: "bishop", chess.ROOK: "rook", chess.QUEEN: "queen", chess.KING: "king"}


def parse_move(board: chess.Board, uci: str | None) -> chess.Move | None:
    """A move from client engine output, or None if it isn't legal in this position."""
    try:
        move = chess.Move.from_uci(uci) if uci else None
    except ValueError:
        return None
    return move if move and move in board.legal_moves else None


def _pieces(board: chess.Board, color: chess.Color) -> list[chess.Square]:
    """Knights, bishops, rooks and queens: the pieces worth talking about."""
    return [sq for sq, p in board.piece_map().items() if p.color == color and p.piece_type not in (chess.PAWN, chess.KING)]


def _piece(board: chess.Board, sq: chess.Square) -> str:
    return f"{NAME[board.piece_type_at(sq)]} on {chess.square_name(sq)}"


def _wins(board: chess.Board, move: chess.Move, gain: int) -> str:
    """'the knight' when the captured piece is won outright, 'material' when the exchanges only net part of it."""
    return f"the {NAME[board.piece_type_at(move.to_square)]}" if gain >= VALUE[board.piece_type_at(move.to_square)] else "material"


def _mate(n: int) -> str:
    # Past 5 moves a depth-16 search rarely has the shortest mate, so its count isn't worth quoting.
    return f"mate in {n}" if n <= 5 else "a forced mate"


def _threatened(board: chess.Board, color: chess.Color) -> set[chess.Square]:
    """Pieces of `color` the opponent could win right now if it were their move."""
    return set(_threats(board, color))


def motifs(board: chess.Board, move: chess.Move) -> list[str]:
    """What a move does tactically: mate, fork, a new pin, a sacrifice."""
    san = board.san(move)
    after = board.copy(stack=False)
    after.push(move)
    if after.is_checkmate():
        return [f"{san} is checkmate"]
    them = not board.turn
    facts = []

    # Fork: the moved piece hits two non-pawn targets that are the king, worth more than it, or undefended.
    value = VALUE[after.piece_type_at(move.to_square)]
    targets = sorted(
        (
            after.piece_type_at(sq)
            for sq in after.attacks(move.to_square)
            if after.color_at(sq) == them
            and after.piece_type_at(sq) != chess.PAWN
            and (after.piece_type_at(sq) == chess.KING or VALUE[after.piece_type_at(sq)] > value or not after.attackers(them, sq))
        ),
        key=lambda t: -VALUE[t],
    )
    if len(targets) >= 2:
        if targets[0] == targets[1]:
            facts.append(f"{san} forks the two {NAME[targets[0]]}s")
        else:
            facts.append(f"{san} forks the {NAME[targets[0]]} and the {NAME[targets[1]]}")

    pinned_before = {sq for sq in _pieces(board, them) if board.is_pinned(them, sq)}
    pinned = [sq for sq in _pieces(after, them) if after.is_pinned(them, sq) and sq not in pinned_before]
    if pinned:
        facts.append(f"{san} pins the {_piece(after, pinned[0])} to the king")

    if is_sacrifice(board, move):
        facts.append(f"{san} offers material")
    return facts


def describe(
    board: chess.Board,
    move: chess.Move,
    badge: str,
    best_uci: str | None,
    reply_uci: str | None,
    mate_before: int | None,
    mate_after: int | None,
) -> list[str]:
    """Facts for one key move. `board` is the position before `move`; `reply_uci` is the opponent's best answer to it.

    Mate counts are from the side to move's perspective (positive: that side mates).
    """
    if badge not in KEY_BADGES:
        return []
    if badge in GOOD_BADGES:
        # What a strong move leads to, so the coach can explain the point, not just the motif.
        facts = motifs(board, move)
        after = board.copy(stack=False)
        after.push(move)
        reply = parse_move(after, reply_uci)
        if mate_after is not None and mate_after < 0 and not after.is_checkmate():
            facts.append(f"it forces {_mate(-mate_after)}")
        if reply:
            facts.append(f"the best answer is {after.san(reply)}")
        return facts

    san = board.san(move)
    mover = board.turn
    after = board.copy(stack=False)
    after.push(move)
    captured = VALUE[board.piece_type_at(move.to_square)] if board.piece_type_at(move.to_square) else 0
    facts = []

    best = parse_move(board, best_uci)
    missed_mate = mate_before is not None and mate_before > 0
    if best and best != move and not missed_mate:
        gain = _capture_gain(board, best)
        if gain > 0:
            prev = board.copy()
            last = prev.pop() if prev.move_stack else None
            if last and prev.is_capture(last) and last.to_square == best.to_square:
                if move.to_square != best.to_square:
                    facts.append(f"{san} misses the recapture {board.san(best)}")
            else:
                facts.append(f"{board.san(best)} would have won {_wins(board, best, gain)}")

    before = _threatened(board, mover)
    for sq in _pieces(after, mover):
        # A piece that just captured and gets taken back is a trade, not a loss.
        loss = _see(after, sq) - (captured if sq == move.to_square else 0)
        if loss > 0 and sq not in before:
            facts.append(f"{san} leaves the {_piece(after, sq)} hanging")
            break

    reply = parse_move(after, reply_uci)
    if reply:
        reply_san = after.san(reply)
        if mate_after is not None and mate_after > 0:
            facts.append(f"it allows {_mate(mate_after)}, starting with {reply_san}")
        elif after.is_capture(reply):
            gain = _capture_gain(after, reply) - (captured if reply.to_square == move.to_square else 0)
            if gain > 0:
                facts.append(f"it allows {reply_san}, winning {_wins(after, reply, gain)}")

    if best and best != move:
        if missed_mate:
            facts.append(f"{board.san(best)} would have started {_mate(mate_before)}")
        else:
            facts.extend(f for f in motifs(board, best) if not f.endswith("offers material"))
    return facts
