"""Move classification matrix (plan.md §4.2)."""

from dataclasses import dataclass

import chess

VALUE = {chess.PAWN: 1, chess.KNIGHT: 3, chess.BISHOP: 3, chess.ROOK: 5, chess.QUEEN: 9, chess.KING: 100}  # king can only take undefended pieces


@dataclass
class MoveFacts:
    """Everything the badge rules need, all from the mover's point of view."""

    w_before: float  # win% before the move, assuming best play
    w_after: float  # win% after the played move
    played_best: bool  # played the engine's PV1 (or tied within 5cp, or delivered checkmate)
    pv_gap: float | None  # win% gap between PV1 and PV2, None if only one legal/known line
    in_book: bool
    sacrifice: bool
    opp_win_lost: float | None  # opponent's win% lost on the previous ply (0 if opponent played best/book/forced)
    had_mate: bool  # mover had a forced mate a human could see (<= HUMAN_MATE moves) before the move
    has_mate: bool  # mover still has a forced mate (any length) after the move
    into_mate: bool  # opponent has a forced mate a human could see (<= HUMAN_MATE moves) after the move
    was_mated: bool  # mover was already being mated before the move
    is_recapture: bool = False  # direct recapture on the square the opponent just moved to / captured on
    was_in_check: bool = False  # mover was in check before this move
    cp_loss: int = 0  # centipawn loss from best engine score
    best_mate: int | None = None  # mate in N before move (positive for mover)
    after_mate: int | None = None  # mate in N after move (positive for mover, negative if mover mated)
    is_forced: bool = False  # only one legal move in the position
    is_free_capture: bool = False  # routine winning capture (undefended piece, or Queen taken by a lesser piece)
    is_game_over_draw: bool = False  # move ended the game in a draw (e.g. stalemate)
    continuing_mate: bool = False  # mover already had a forced mate on their previous turn

    @property
    def win_lost(self) -> float:
        return max(0.0, self.w_before - self.w_after)


def _not_effortlessly_won(f: MoveFacts, limit: float) -> bool:
    """True if the position isn't already trivially winning without this move.

    Uses PV2's win% when available so forced-mate sacrifices (like Qb8+ or Rh8+ where PV1 is 100%
    only because of the sacrifice itself) still qualify when PV2 is not already crushing.
    """
    if f.pv_gap is not None:
        return (f.w_before - f.pv_gap) < limit
    return f.w_before < limit


def classify(f: MoveFacts) -> str:
    if f.in_book:
        return "book"
    if f.is_forced:
        return "best"

    dw = f.win_lost

    # The engine's own #1 move (or tie within 5cp / checkmate) is never an error, even under horizon noise.
    if f.played_best:
        if f.sacrifice and dw < 5.0 and f.w_after >= 45.0 and _not_effortlessly_won(f, 85.0):
            return "brilliant"
        req_gap = 16.0 if f.was_in_check else 10.0
        if (
            not f.is_recapture
            and not f.is_free_capture
            and not f.continuing_mate
            and f.after_mate != 0
            and f.pv_gap is not None
            and f.pv_gap >= req_gap
            and f.w_after >= 35.0
            and _not_effortlessly_won(f, 75.0)
            and dw < 10.0
        ):
            return "great"
        return "best"

    # Longer mates aren't special here: their win% already says the position is lost (or won).
    if f.into_mate and not f.was_mated and f.w_before >= 15.0:
        return "blunder"

    # Stalemating or forcing a draw from a winning position is always a blunder.
    if f.is_game_over_draw and f.w_before >= 75.0:
        return "blunder"

    # Missing a fast mate (M1 not checkmating, or M2 dropping out of human-visible mate range)
    if f.best_mate == 1 and f.after_mate != 0:
        return "blunder" if f.w_after < 35.0 else "miss"
    if f.best_mate == 2:
        kept_short_mate = f.has_mate and f.after_mate is not None and 0 <= f.after_mate <= 3
        if not kept_short_mate:
            return "blunder" if f.w_after < 35.0 else "miss"

    # Punishing chances: missed a visible mate, or failed to punish an opponent's slip when we had a real advantage
    if f.had_mate and not f.has_mate:
        return "blunder" if (f.w_after < 35.0 and dw >= 28.0) else "miss"

    if f.opp_win_lost is not None and f.opp_win_lost >= 10.0 and dw >= 10.0 and f.w_before >= 55.0:
        if f.w_after >= 35.0:
            return "miss"
        return "blunder" if dw >= 28.0 else "mistake"

    # Missed a unique winning tactical shot even without an immediate opponent slip on the prior ply.
    if f.pv_gap is not None and f.pv_gap >= 18.0 and dw >= 12.0 and f.w_before >= 65.0 and f.w_after >= 35.0:
        return "miss"

    if dw >= 28.0:
        return "blunder"

    # Near-best sound sacrifice (within 1.5% win% of PV1)
    if f.sacrifice and dw < 1.5 and f.w_after >= 50.0 and _not_effortlessly_won(f, 85.0):
        return "brilliant"

    # In losing positions (w_before in [3, 20), roughly -4 to -9), win% compresses; evaluate by centipawn loss.
    # Below 3% (worse than -10 pawns) or already mated, engine noise dominates so we avoid error spam.
    if 3.0 <= f.w_before < 20.0 and not f.was_mated:
        if f.cp_loss >= 600:
            return "blunder"
        if f.cp_loss >= 100:
            return "mistake"
        if f.cp_loss >= 50:
            return "inaccuracy"

    if dw < 3.0:
        return "excellent"
    if dw < 5.0:
        return "good"
    if dw < 10.0:
        return "inaccuracy"
    if dw < 28.0:
        return "mistake"
    return "blunder"


def see(board: chess.Board, sq: chess.Square) -> int:
    """Material the side to move nets by capturing on `sq`, both sides recapturing with their cheapest piece
    while it pays. Built on legal moves, so pins, pin-breaks, x-rays, and promotions count accurately."""
    target = board.piece_type_at(sq)
    if target is None:
        return 0
    captures = [m for m in board.legal_moves if m.to_square == sq]
    if not captures:
        return 0
    first = min(
        captures,
        key=lambda m: (VALUE[board.piece_type_at(m.from_square)], -(VALUE[m.promotion] if m.promotion else 0)),
    )
    after = board.copy(stack=False)
    after.push(first)
    promo_gain = (VALUE[first.promotion] - VALUE[chess.PAWN]) if first.promotion else 0
    return max(0, VALUE[target] + promo_gain - see(after, sq))


def capture_gain(board: chess.Board, move: chess.Move) -> int:
    """Net material for the side to move from `move` once exchanges on `move.to_square` settle."""
    target = board.piece_type_at(move.to_square)
    if target is None:
        if board.is_en_passant(move):
            after = board.copy(stack=False)
            after.push(move)
            return VALUE[chess.PAWN] - see(after, move.to_square)
        return 0
    after = board.copy(stack=False)
    after.push(move)
    promo_gain = (VALUE[move.promotion] - VALUE[chess.PAWN]) if move.promotion else 0
    return VALUE[target] + promo_gain - see(after, move.to_square)


def _unpinned_attackers(board: chess.Board, color: chess.Color, sq: chess.Square) -> list[chess.Square]:
    """Pieces of `color` attacking `sq` that aren't pinned away from it."""
    return [
        a
        for a in board.attackers(color, sq)
        if not board.is_pinned(color, a) or (board.pin_mask(color, a) & chess.BB_SQUARES[sq])
    ]


def _static_threat(board: chess.Board, sq: chess.Square) -> int:
    """X-ray-aware swap-list static SEE fallback when `board` is in check (null move is illegal)."""
    p = board.piece_at(sq)
    if not p:
        return 0
    b = board.copy(stack=False)
    turn = not p.color
    on_sq = VALUE[p.piece_type]
    gains: list[int] = []
    promo_rank = chess.square_rank(sq) in (0, 7)

    while True:
        attackers = _unpinned_attackers(b, turn, sq)
        if not attackers:
            break
        from_sq = min(attackers, key=lambda a: VALUE[b.piece_type_at(a)])
        capturer = b.piece_at(from_sq)
        if capturer.piece_type == chess.KING:
            b.remove_piece_at(from_sq)
            if b.is_attacked_by(not turn, sq):
                break
            gains.append(on_sq - gains[-1] if gains else on_sq)
            break
        promo = (VALUE[chess.QUEEN] - VALUE[chess.PAWN]) if (promo_rank and capturer.piece_type == chess.PAWN) else 0
        gains.append((on_sq + promo) - gains[-1] if gains else (on_sq + promo))
        b.remove_piece_at(from_sq)
        placed = chess.Piece(chess.QUEEN, turn) if promo else capturer
        b.set_piece_at(sq, placed)
        on_sq = VALUE[placed.piece_type]
        turn = not turn

    if not gains:
        return 0
    for i in range(len(gains) - 1, 0, -1):
        gains[i - 1] = -max(-gains[i - 1], gains[i])
    return max(0, gains[0])


def _threats(board: chess.Board, color: chess.Color) -> dict[chess.Square, int]:
    """Map of `color`'s non-pawn piece squares to opponent SEE if it were opponent's turn."""
    if board.turn == color:
        if board.is_check():
            return {
                sq: t
                for sq, p in board.piece_map().items()
                if p.color == color
                and p.piece_type not in (chess.PAWN, chess.KING)
                and (t := _static_threat(board, sq)) > 0
            }
        b = board.copy(stack=False)
        b.push(chess.Move.null())
    else:
        b = board
    out: dict[chess.Square, int] = {}
    for sq, p in b.piece_map().items():
        if p.color == color and p.piece_type not in (chess.PAWN, chess.KING):
            loss = see(b, sq)
            if loss > 0:
                out[sq] = loss
    return out


def _has_safe_escape(board: chess.Board, sq: chess.Square) -> bool:
    """True if the piece on `sq` has at least one legal move that doesn't lose material on its target square."""
    for m in board.legal_moves:
        if m.from_square != sq:
            continue
        cap = VALUE[chess.PAWN] if board.is_en_passant(m) else VALUE.get(board.piece_type_at(m.to_square), 0)
        b2 = board.copy(stack=False)
        b2.push(m)
        if b2.is_checkmate() or see(b2, m.to_square) <= cap:
            return True
    return False


def _is_doomed_in_check(board: chess.Board, orig_sq: chess.Square, min_loss: int) -> bool:
    """True if `board` is in check and every legal evasion still loses at least `min_loss` on `orig_sq`."""
    for m in board.legal_moves:
        cap = VALUE[chess.PAWN] if board.is_en_passant(m) else VALUE.get(board.piece_type_at(m.to_square), 0)
        b2 = board.copy(stack=False)
        b2.push(m)
        if b2.is_checkmate():
            return False
        track_sq = m.to_square if m.from_square == orig_sq else orig_sq
        if see(b2, track_sq) - cap < min_loss:
            return False
    return True


def _can_escape_saving(board: chess.Board, from_sq: chess.Square, other_sq: chess.Square, min_loss: int) -> bool:
    """True if `from_sq` has a safe move that also keeps `other_sq` from losing `>= min_loss`."""
    for m in board.legal_moves:
        if m.from_square != from_sq:
            continue
        cap = VALUE[chess.PAWN] if board.is_en_passant(m) else VALUE.get(board.piece_type_at(m.to_square), 0)
        b2 = board.copy(stack=False)
        b2.push(m)
        if b2.is_checkmate():
            return True
        if see(b2, m.to_square) <= cap and see(b2, other_sq) - cap < min_loss:
            return True
    return False


def is_free_capture(board: chess.Board, move: chess.Move) -> bool:
    """Routine winning capture: undefended non-pawn piece, or capturing a Queen with a lesser piece."""
    target = board.piece_type_at(move.to_square)
    if target is None or target == chess.PAWN:
        return False
    mover = board.piece_type_at(move.from_square)
    if target == chess.QUEEN and mover != chess.QUEEN and capture_gain(board, move) >= 4:
        return True
    if board.attackers(not board.turn, move.to_square):
        return False
    after = board.copy(stack=False)
    after.push(move)
    return see(after, move.to_square) == 0


def is_sacrifice(board: chess.Board, move: chess.Move) -> bool:
    """Move genuinely risks at least an exchange (>= 2 points on the square, net loss >= 1 after what was captured)
    on a non-pawn piece, excluding trades, promotions, trapped-piece desperados, and immediate counter-captures."""
    mover = board.turn
    opp = not mover
    after = board.copy(stack=False)
    after.push(move)
    if after.is_checkmate() or after.is_stalemate() or after.is_insufficient_material():
        return False

    captured = VALUE[chess.PAWN] if board.is_en_passant(move) else VALUE.get(board.piece_type_at(move.to_square), 0)
    threat_before = _threats(board, mover)
    from_loss_before = threat_before.get(move.from_square, 0)
    from_trapped = from_loss_before > 0 and not _has_safe_escape(board, move.from_square)
    opp_threats_on_after = _threats(after, opp)

    for sq, p in after.piece_map().items():
        if p.color != mover or p.piece_type in (chess.PAWN, chess.KING):
            continue
        opp_see = see(after, sq)
        # Require at least an exchange (>= 2) at stake on `sq` so piece trades that drop a pawn (SEE == 1) don't count.
        if opp_see < 2:
            continue

        if sq == move.to_square:
            if move.promotion:
                continue
            net_loss = opp_see - captured
            if net_loss < 1:
                continue
            if from_trapped and net_loss <= from_loss_before:
                continue
            if board.is_check() and _is_doomed_in_check(board, move.from_square, net_loss):
                continue
        else:
            prev_loss = threat_before.get(sq, 0)
            net_loss = opp_see - captured
            if prev_loss >= opp_see or net_loss < 1:
                continue
            if board.is_check() and _is_doomed_in_check(board, sq, net_loss):
                continue
            if from_loss_before >= net_loss and not _can_escape_saving(board, move.from_square, sq, net_loss):
                continue

        # Simulate opponent accepting with their cheapest legal capture on `sq`.
        opp_caps = [m for m in after.legal_moves if m.to_square == sq]
        if not opp_caps:
            continue
        opp_cap = min(
            opp_caps,
            key=lambda m: (VALUE[after.piece_type_at(m.from_square)], -(VALUE[m.promotion] if m.promotion else 0)),
        )
        after_cap = after.copy(stack=False)
        after_cap.push(opp_cap)
        if after_cap.is_checkmate():
            continue

        # Filter out mutual trades and simple discovered attacks where mover immediately recoups the lost piece
        # on another square without needing `opp_cap` to deflect a defender (true deflections like Bxf7+ Kxf7 Qxd8
        # still pass). Skipping the recapture on `sq` forfeits `VALUE[p]`, not just `opp_see`.
        full_loss = max(net_loss, VALUE[p.piece_type] - captured)
        counter_trade = False
        for reply in after_cap.legal_moves:
            if reply.to_square == sq or not after_cap.is_capture(reply):
                continue
            gain = capture_gain(after_cap, reply)
            if gain < full_loss:
                continue
            target_sq = reply.to_square
            if gain == full_loss:
                counter_trade = True
                break
            if opp_threats_on_after.get(target_sq, 0) >= full_loss:
                counter_trade = True
                break
            if after.is_check() and after.attackers(mover, target_sq) and not (after.attackers(opp, target_sq) & chess.BB_SQUARES[opp_cap.from_square]):
                counter_trade = True
                break
            # Relative pin: opp_cap vacated a ray blocker between a slider and target_sq, immediately dropping target_sq.
            if chess.between(reply.from_square, target_sq) & chess.BB_SQUARES[opp_cap.from_square]:
                counter_trade = True
                break
        if not counter_trade:
            return True
    return False
