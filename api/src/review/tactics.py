"""Deterministic tactical facts for key moves (plan.md §4.3), fed to the coach and used as its fallback text."""

import chess

from .classify import VALUE, _threats, capture_gain as _capture_gain, is_sacrifice, see as _see

KEY_BADGES = {"blunder", "miss", "mistake", "inaccuracy", "brilliant", "great"}
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


def _material(board: chess.Board, color: chess.Color) -> int:
    return sum(VALUE[p.piece_type] for p in board.piece_map().values() if p.color == color and p.piece_type != chess.KING)


def _won_label(before: chess.Board, after: chess.Board, side: chess.Color, net_gain: int) -> str:
    opp = not side
    opp_lost = {pt: len(before.pieces(pt, opp)) - len(after.pieces(pt, opp)) for pt in (chess.QUEEN, chess.ROOK, chess.BISHOP, chess.KNIGHT, chess.PAWN)}
    my_lost = {pt: len(before.pieces(pt, side)) - len(after.pieces(pt, side)) for pt in (chess.QUEEN, chess.ROOK, chess.BISHOP, chess.KNIGHT, chess.PAWN)}
    if net_gain >= 9:
        return "the queen" if opp_lost[chess.QUEEN] > 0 else "decisive material"
    if net_gain == 2 and opp_lost[chess.ROOK] > 0 and (my_lost[chess.BISHOP] + my_lost[chess.KNIGHT]) > 0:
        return "the exchange"
    if net_gain >= 5 and opp_lost[chess.ROOK] > 0:
        gone_rooks = [sq for sq in before.pieces(chess.ROOK, opp) if not (after.piece_type_at(sq) == chess.ROOK and after.color_at(sq) == opp)]
        return f"the rook on {chess.square_name(gone_rooks[0])}" if len(gone_rooks) == 1 else "the rook"
    if net_gain in (3, 4):
        if opp_lost[chess.BISHOP] > 0 and opp_lost[chess.KNIGHT] <= 0:
            return "the bishop"
        if opp_lost[chess.KNIGHT] > 0 and opp_lost[chess.BISHOP] <= 0:
            return "the knight"
        if opp_lost[chess.BISHOP] > 0:
            return "the bishop"
        if opp_lost[chess.KNIGHT] > 0:
            return "the knight"
    if net_gain == 1:
        return "a pawn"
    return "material"


def motifs(board: chess.Board, move: chess.Move, *, check_sacrifice: bool = True) -> list[str]:
    """What a move does tactically: mate, checks, fork, pin, skewer, discovered attack, sacrifice."""
    san = board.san(move)
    after = board.copy(stack=False)
    after.push(move)
    if after.is_checkmate():
        return [f"{san} is checkmate"]
    them = not board.turn
    facts = []

    has_disc_check = False
    if after.is_check():
        checkers = after.checkers()
        if len(checkers) >= 2:
            facts.append(f"{san} delivers double check")
            has_disc_check = True
        elif move.to_square not in checkers:
            sq = next(iter(checkers))
            facts.append(f"{san} unleashes a discovered check from the {_piece(after, sq)}")
            has_disc_check = True

    # Fork: the moved piece hits two non-pawn targets that are the king, worth more than it, or undefended.
    mover_pt = after.piece_type_at(move.to_square)
    value = VALUE[mover_pt]
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

    # Pressure on an existing pin
    for sq in pinned_before:
        if after.is_pinned(them, sq) and (sq in after.attacks(move.to_square)) and (sq not in board.attacks(move.from_square)):
            facts.append(f"{san} adds pressure to the pinned {_piece(after, sq)}")
            break

    # Skewer: slider attacks a valuable piece with a lesser piece behind it on the same ray.
    if mover_pt in (chess.BISHOP, chess.ROOK, chess.QUEEN):
        for first_sq in after.attacks(move.to_square):
            first_pt = after.piece_type_at(first_sq)
            if after.color_at(first_sq) != them or first_pt not in (chess.KING, chess.QUEEN, chess.ROOK):
                continue
            if after.is_pinned(them, first_sq):
                continue
            beyond = sorted(
                (sq for sq in chess.SquareSet(chess.ray(move.to_square, first_sq)) if chess.between(move.to_square, sq) & chess.BB_SQUARES[first_sq]),
                key=lambda s: chess.square_distance(move.to_square, s),
            )
            second_sq = next((sq for sq in beyond if after.piece_at(sq) is not None), None)
            if second_sq is None or after.color_at(second_sq) != them:
                continue
            second_pt = after.piece_type_at(second_sq)
            if second_pt != chess.PAWN and VALUE[first_pt] > VALUE[second_pt]:
                if (VALUE[second_pt] >= value or not after.attackers(them, second_sq)) and (
                    first_pt == chess.KING or VALUE[first_pt] > value or not after.attackers(them, first_sq)
                ):
                    facts.append(
                        f"{san} skewers the {NAME[first_pt]} on {chess.square_name(first_sq)} and the {NAME[second_pt]} on {chess.square_name(second_sq)}"
                    )
                    break

    # Discovered attack (when no discovered/double check already fired)
    if not has_disc_check:
        for s, p in after.piece_map().items():
            if p.color != board.turn or p.piece_type not in (chess.BISHOP, chess.ROOK, chess.QUEEN) or s == move.to_square:
                continue
            if not (board.attacks(s) & chess.BB_SQUARES[move.from_square]):
                continue
            found = False
            for t in after.attacks(s) & ~board.attacks(s):
                pt = after.piece_type_at(t)
                if after.color_at(t) == them and pt is not None and pt != chess.PAWN and VALUE[pt] >= 3:
                    if _see(after, t) > 0 or VALUE[pt] > VALUE[p.piece_type] or not after.attackers(them, t):
                        facts.append(f"{san} uncovers an attack on the {_piece(after, t)}")
                        found = True
                        break
            if found:
                break

    if check_sacrifice and is_sacrifice(board, move):
        facts.append(f"{san} offers material")
    return facts


def _analyze_pv(board: chess.Board, pv: list[str] | None, side: chess.Color, max_plies: int = 6) -> dict | None:
    """Walk an engine PV up to `max_plies` (extending through pending captures up to 8) and summarize material/motifs."""
    if not pv:
        return None
    b = board.copy(stack=False)
    sans: list[str] = []
    promoted = False
    mated = False
    key_tactic: tuple[str, str] | None = None
    last_to: chess.Square | None = None

    for idx, uci in enumerate(pv[:8]):
        m = parse_move(b, uci)
        if m is None:
            break
        if idx >= max_plies and not (last_to is not None and b.is_capture(m) and m.to_square == last_to):
            break
        mover = b.turn
        m_san = b.san(m)
        if mover == side and idx in (0, 2) and key_tactic is None:
            for f in motifs(b, m, check_sacrifice=False):
                if any(k in f for k in ("forks ", "pins ", "skewers ", "double check", "discovered check")):
                    key_tactic = (m_san, f)
                    break
        if mover == side and m.promotion:
            promoted = True
        last_to = m.to_square
        b.push(m)
        sans.append(m_san)
        if b.is_checkmate() and mover == side:
            mated = True
            break

    if not sans:
        return None
    net_gain = (_material(b, side) - _material(b, not side)) - (_material(board, side) - _material(board, not side))
    return {
        "board": b,
        "sans": sans,
        "net_gain": net_gain,
        "won": _won_label(board, b, side, net_gain),
        "promoted": promoted,
        "mated": mated,
        "key_tactic": key_tactic,
    }


def _is_passed_pawn(board: chess.Board, sq: chess.Square, color: chess.Color) -> bool:
    f, r = chess.square_file(sq), chess.square_rank(sq)
    opp_pawns = board.pieces(chess.PAWN, not color)
    for op in opp_pawns:
        of, orank = chess.square_file(op), chess.square_rank(op)
        if abs(of - f) <= 1 and ((color == chess.WHITE and orank > r) or (color == chess.BLACK and orank < r)):
            return False
    return True


def _positional_cue(board: chess.Board, move: chess.Move, best: chess.Move, phase: str | None) -> str | None:
    """Fallback concrete positional cue when a bad move has no tactical facts."""
    best_san = board.san(best)
    mover = board.turn
    if board.is_castling(best) and not board.is_castling(move):
        return f"{best_san} would have castled the king to safety"

    best_pt = board.piece_type_at(best.from_square)
    if best.from_square in _threatened(board, mover) and move.from_square != best.from_square and best_pt is not None:
        return f"{best_san} would have moved the threatened {NAME[best_pt]} on {chess.square_name(best.from_square)} to safety"

    if best_pt == chess.PAWN and _is_passed_pawn(board, best.from_square, mover):
        return f"{best_san} advances the passed pawn"

    home_rank = 0 if mover == chess.WHITE else 7
    move_pt = board.piece_type_at(move.from_square)
    if (
        phase == "opening"
        and best_pt in (chess.KNIGHT, chess.BISHOP)
        and chess.square_rank(best.from_square) == home_rank
        and not (move_pt in (chess.KNIGHT, chess.BISHOP) and chess.square_rank(move.from_square) == home_rank)
    ):
        return f"{best_san} develops the {NAME[best_pt]} to {chess.square_name(best.to_square)}"

    if best_pt == chess.ROOK:
        seventh = 6 if mover == chess.WHITE else 1
        if chess.square_rank(best.to_square) == seventh:
            return f"{best_san} puts the rook on the 7th rank"
        dest_file = chess.square_file(best.to_square)
        if dest_file != chess.square_file(best.from_square):
            if not any(chess.square_file(p) == dest_file for p in board.pieces(chess.PAWN, mover)):
                return f"{best_san} activates the rook on the {chess.FILE_NAMES[dest_file]}-file"

    if phase == "endgame" and best_pt == chess.KING:
        dist = lambda sq: abs(chess.square_file(sq) - 3.5) + abs(chess.square_rank(sq) - 3.5)
        if dist(best.to_square) < dist(best.from_square):
            return f"{best_san} activates the king for the endgame"
    return None


def describe(
    board: chess.Board,
    move: chess.Move,
    badge: str,
    best_uci: str | None,
    reply_uci: str | None,
    mate_before: int | None,
    mate_after: int | None,
    best_pv: list[str] | None = None,
    reply_pv: list[str] | None = None,
    phase: str | None = None,
) -> list[str]:
    """Facts for one key move. `board` is the position before `move`; `reply_uci` is the opponent's best answer to it.

    Mate counts are from the side to move's perspective (positive: that side mates).
    """
    if badge not in KEY_BADGES:
        return []
    mover = board.turn
    san = board.san(move)
    if badge in GOOD_BADGES:
        # What a strong move leads to, so the coach can explain the point, not just the motif.
        facts = motifs(board, move)
        after = board.copy(stack=False)
        after.push(move)
        reply = parse_move(after, reply_uci)
        has_mate_fact = mate_after is not None and mate_after < 0 and not after.is_checkmate()
        if has_mate_fact:
            facts.append(f"it forces {_mate(-mate_after)}")
        before_threats = _threatened(board, mover)
        after_threats = _threatened(after, mover)
        if move.from_square in before_threats and move.to_square not in after_threats:
            pt = board.piece_type_at(move.from_square)
            if pt is not None:
                facts.append(f"{san} saves the {NAME[pt]} from {chess.square_name(move.from_square)}")
        else:
            for sq in sorted(before_threats):
                if sq != move.from_square and sq not in after_threats and after.piece_type_at(sq) not in (None, chess.PAWN, chess.KING):
                    facts.append(f"{san} defends the {_piece(after, sq)}")
                    break
        if best_pv and best_pv[0] == move.uci():
            bpv = _analyze_pv(board, best_pv, mover)
            if bpv:
                if bpv["promoted"]:
                    facts.append(f"{san} clears the way for pawn promotion")
                elif bpv["net_gain"] >= 2 and not has_mate_fact:
                    facts.append(f"{san} wins {bpv['won']} with best play")
        if reply:
            facts.append(f"the best answer is {after.san(reply)}")
        return list(dict.fromkeys(facts))[:4]

    after = board.copy(stack=False)
    after.push(move)
    captured = VALUE[chess.PAWN] if board.is_en_passant(move) else (VALUE[board.piece_type_at(move.to_square)] if board.piece_type_at(move.to_square) else 0)
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

    # Abandoned defender on pawns (non-pawns are already caught above as hanging pieces).
    if not any(f.endswith(" hanging") for f in facts) and not board.is_check():
        null_before = board.copy(stack=False)
        null_before.push(chess.Move.null())
        for sq in board.pieces(chess.PAWN, mover):
            if (board.attacks(move.from_square) & chess.BB_SQUARES[sq]) and not (after.attacks(move.to_square) & chess.BB_SQUARES[sq]):
                if _see(after, sq) > 0 and _see(null_before, sq) <= 0:
                    facts.append(f"{san} pulls a defender away from the pawn on {chess.square_name(sq)}")
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
        if not any(f.startswith("it allows ") for f in facts) and reply_pv:
            ref = _analyze_pv(after, reply_pv, not mover)
            if ref:
                eff_gain = ref["net_gain"] - captured
                won_str = ref["won"] if captured == 0 else _won_label(board, ref["board"], not mover, eff_gain)
                if ref["promoted"]:
                    facts.append(f"it allows {reply_san}, leading to pawn promotion")
                elif eff_gain >= 2 or (eff_gain == 1 and badge != "inaccuracy"):
                    if ref["key_tactic"] and ref["key_tactic"][0] != reply_san:
                        facts.append(f"it allows {reply_san} followed by {ref['key_tactic'][0]}, winning {won_str}")
                    else:
                        facts.append(f"it allows {reply_san}, winning {won_str}")
                else:
                    king_sq = after.king(mover)
                    back_rank = 0 if mover == chess.WHITE else 7
                    if king_sq is not None and chess.square_rank(king_sq) == back_rank and after.gives_check(reply) and chess.square_rank(reply.to_square) == back_rank:
                        facts.append(f"it leaves the back rank vulnerable to {reply_san}")
                    elif ref["key_tactic"] and ref["key_tactic"][0] == reply_san:
                        t_fact = ref["key_tactic"][1]
                        if t_fact.startswith(reply_san + " "):
                            facts.append(f"it allows {reply_san}, which {t_fact[len(reply_san) + 1:]}")
                        else:
                            facts.append(f"it allows {t_fact}")

    if best and best != move:
        if missed_mate:
            facts.append(f"{board.san(best)} would have started {_mate(mate_before)}")
        else:
            facts.extend(motifs(board, best, check_sacrifice=False))
            if not any("would have won" in f or "would have started" in f or "misses the recapture" in f for f in facts) and best_pv:
                bpv = _analyze_pv(board, best_pv, mover)
                if bpv:
                    if bpv["promoted"]:
                        facts.append(f"{board.san(best)} leads to pawn promotion")
                    elif bpv["net_gain"] >= 2 or (bpv["net_gain"] == 1 and badge != "inaccuracy"):
                        facts.append(f"{board.san(best)} would have won {bpv['won']}")

    if not facts and best and best != move:
        if cue := _positional_cue(board, move, best, phase):
            facts.append(cue)

    return list(dict.fromkeys(facts))[:4]
