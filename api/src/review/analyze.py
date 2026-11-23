"""PGN + client engine evals -> full game review report."""

import hashlib
import io
from collections import Counter
from dataclasses import dataclass

import chess
import chess.pgn
from pydantic import BaseModel, Field, model_validator

from .classify import MoveFacts, classify, is_free_capture, is_sacrifice
from .elo import estimate
from .openings import opening_name
from .tactics import describe, parse_move
from .winprob import HUMAN_MATE, MATE_CP, game_accuracy, move_accuracy, perceived_cp, score_to_cp, win_pct

MAX_PLIES = 600
# Part of every game hash: bump it whenever classification output changes so stale cached reviews are never served.
ANALYSIS_VERSION = "8"
PHASES = ("opening", "middlegame", "endgame")


class Line(BaseModel):
    uci: str | None = Field(None, max_length=5)
    cp: int | None = Field(None, ge=-100_000, le=100_000)
    mate: int | None = Field(None, ge=-999, le=999)
    pv: list[str] = Field(default_factory=list, max_length=40)

    @model_validator(mode="after")
    def _has_score(self):
        if self.cp is None and self.mate is None:
            raise ValueError("line needs cp or mate")
        return self


class PositionEval(BaseModel):
    """Engine lines for one position, scores from the side to move's perspective, best line first."""

    fen: str = Field(max_length=100)
    lines: list[Line] = Field(max_length=3)


class AnalyzeRequest(BaseModel):
    pgn: str = Field(max_length=50_000)
    # Omitted on the first request: the client only runs Stockfish if no cached review exists.
    evals: list[PositionEval] | None = Field(None, max_length=MAX_PLIES + 1)
    # Re-analysis in the user's own browser: skip the shared cache entirely, neither reading nor writing it.
    fresh: bool = False


class AnalysisError(ValueError):
    pass


def _normalize_lines(lines: list[Line]) -> list[Line]:
    """Deduplicate engine lines by UCI (keeping highest score) and sort best-first.

    Stockfish stopped mid-iteration can emit duplicate UCIs or out-of-order MultiPV scores.
    """
    best_by_uci: dict[str, Line] = {}
    for line in lines:
        key = line.uci or ""
        prev = best_by_uci.get(key)
        if prev is None or score_to_cp(line.cp, line.mate) > score_to_cp(prev.cp, prev.mate):
            best_by_uci[key] = line
    return sorted(best_by_uci.values(), key=lambda l: score_to_cp(l.cp, l.mate), reverse=True)


def _position_cp(board: chess.Board, lines: list[Line]) -> int:
    """Side-to-move score; game-over positions are scored here rather than trusted from the client."""
    if board.is_checkmate():
        return -MATE_CP
    if board.is_game_over():
        return 0
    if not lines:
        raise AnalysisError(f"missing engine lines for {board.fen()}")
    return score_to_cp(lines[0].cp, lines[0].mate)


def _best_mate(board: chess.Board, lines: list[Line]) -> int | None:
    if board.is_game_over() or not lines:
        return None
    return lines[0].mate


def _is_terminal_draw(board: chess.Board, is_last_move: bool, header_result: str | None) -> bool:
    """True if `board` ended the game in a draw (forced game-over draw, or terminal 3-fold/50-move draw)."""
    if board.is_checkmate():
        return False
    if board.is_game_over():
        return True
    if is_last_move and header_result not in ("1-0", "0-1"):
        return board.is_repetition(3) or board.is_fifty_moves()
    return False


def _game_scores(final_board: chess.Board, header_result: str | None) -> dict[chess.Color, float | None]:
    if final_board.is_checkmate():
        winner = not final_board.turn
        return {winner: 1.0, final_board.turn: 0.0}
    if final_board.is_game_over():
        return {chess.WHITE: 0.5, chess.BLACK: 0.5}
    if header_result == "1-0":
        return {chess.WHITE: 1.0, chess.BLACK: 0.0}
    if header_result == "0-1":
        return {chess.WHITE: 0.0, chess.BLACK: 1.0}
    if header_result == "1/2-1/2":
        return {chess.WHITE: 0.5, chess.BLACK: 0.5}
    if final_board.is_repetition(3) or final_board.is_fifty_moves():
        return {chess.WHITE: 0.5, chess.BLACK: 0.5}
    return {chess.WHITE: None, chess.BLACK: None}


def _phase(board: chess.Board) -> str:
    pieces = sum(len(board.pieces(pt, c)) for pt in (chess.KNIGHT, chess.BISHOP, chess.ROOK, chess.QUEEN) for c in chess.COLORS)
    if pieces <= 6:
        return "endgame"
    return "opening" if board.fullmove_number <= 12 else "middlegame"


def _white_eval(board: chess.Board, cp: int, mate: int | None) -> dict:
    sign = 1 if board.turn == chess.WHITE else -1
    if board.is_checkmate():
        mate = 0
    return {"evalWhite": round(sign * cp / 100, 2), "mateWhite": None if mate is None else sign * mate}


def _round(x: float | None) -> float | None:
    return None if x is None else round(x, 1)


@dataclass
class ParsedGame:
    game: chess.pgn.Game
    moves: list[chess.Move]
    hash: str


def parse_game(pgn: str) -> ParsedGame:
    game = chess.pgn.read_game(io.StringIO(pgn))
    if game is None:
        raise AnalysisError("no game found in PGN")
    if game.errors:
        raise AnalysisError(f"invalid PGN: {game.errors[0]}")
    board = game.board()
    if type(board) is not chess.Board:
        raise AnalysisError("only standard chess is supported")
    moves = list(game.mainline_moves())
    if not moves:
        raise AnalysisError("PGN has no moves")
    if len(moves) > MAX_PLIES:
        raise AnalysisError(f"game too long (max {MAX_PLIES} plies)")
    # Same moves from the same start = same game, whatever the headers say.
    start = " ".join(board.fen().split()[:3])
    key = f"{ANALYSIS_VERSION}|{start}|{' '.join(m.uci() for m in moves)}"
    return ParsedGame(game, moves, hashlib.sha256(key.encode()).hexdigest())


def _check_eval(board: chess.Board, ev: PositionEval):
    # Compare placement + side to move only: en passant and move counters differ between chess libraries.
    if ev.fen.split()[:2] != board.fen().split()[:2]:
        raise AnalysisError(f"eval FEN mismatch at {board.fen()}")
    # Reviews are shared, so reject obviously bogus engine output. Fake scores on legal moves still get through:
    # first writer wins for a game hash (accepted risk, see plan).
    for line in ev.lines:
        if parse_move(board, line.uci) is None:
            raise AnalysisError(f"illegal engine move {line.uci} at {board.fen()}")


def analyze(parsed: ParsedGame, evals: list[PositionEval]) -> dict:
    game, moves = parsed.game, parsed.moves
    board = game.board()
    if len(evals) != len(moves) + 1:
        raise AnalysisError(f"expected {len(moves) + 1} evals, got {len(evals)}")

    _check_eval(board, evals[0])
    lines = _normalize_lines(evals[0].lines)
    cp_before = _position_cp(board, lines)
    mate_before = _best_mate(board, lines)
    start = _white_eval(board, cp_before, mate_before)

    out_moves = []
    accs = {chess.WHITE: [], chess.BLACK: []}
    phase_accs = {c: {p: [] for p in PHASES} for c in chess.COLORS}
    counts = {c: Counter() for c in chess.COLORS}
    opening = None
    prev_win_lost = None
    prev_had_mate = {chess.WHITE: False, chess.BLACK: False}
    seen_epds = {board.epd()}
    header_result = game.headers.get("Result")

    for i, move in enumerate(moves):
        ev_after = evals[i + 1]
        mover = board.turn
        phase = _phase(board)
        san = board.san(move)
        is_forced = board.legal_moves.count() == 1
        sacrifice = False if is_forced else is_sacrifice(board, move)
        free_capture = False if is_forced else is_free_capture(board, move)
        before = board.copy(stack=1)  # describe() checks the last move for missed recaptures

        was_in_check = board.is_check()
        is_recap = False
        if board.move_stack:
            prev_move = board.peek()
            if board.is_capture(move) and move.to_square == prev_move.to_square:
                is_recap = True

        played_best = False
        if lines:
            if lines[0].uci == move.uci():
                played_best = True
            elif len(lines) > 1:
                top_cp = score_to_cp(lines[0].cp, lines[0].mate)
                for line in lines[1:]:
                    if line.uci == move.uci():
                        if abs(top_cp - score_to_cp(line.cp, line.mate)) <= 5:
                            played_best = True
                        break

        board.push(move)
        if board.is_checkmate():
            played_best = True
        _check_eval(board, ev_after)
        lines_after = _normalize_lines(ev_after.lines)
        is_draw = _is_terminal_draw(board, i == len(moves) - 1, header_result)
        best_line = lines[0] if lines else None
        if is_draw:
            cp_after, mate_after = 0, None
            # Standalone-FEN Stockfish lacks move history and can mis-score a terminal 3-fold/50-move draw.
            if not is_forced and any(l.uci == move.uci() for l in lines):
                if len(lines) >= 2:
                    lines = sorted(
                        (Line(uci=move.uci(), cp=0, pv=[move.uci()]) if l.uci == move.uci() else l for l in lines),
                        key=lambda l: score_to_cp(l.cp, l.mate),
                        reverse=True,
                    )
                    best_line = lines[0]
                    cp_before = score_to_cp(best_line.cp, best_line.mate)
                    mate_before = best_line.mate
                    played_best = best_line.uci == move.uci() or abs(cp_before) <= 5
                elif cp_before > 50:
                    played_best = False
                    best_line = None
                    lines = [Line(uci=move.uci(), cp=0, pv=[move.uci()])]
        else:
            cp_after = _position_cp(board, lines_after)  # opponent's perspective
            mate_after = _best_mate(board, lines_after)

        alternatives = [
            {"uci": line.uci, "san": before.san(chess.Move.from_uci(line.uci)), "w": _round(win_pct(score_to_cp(line.cp, line.mate)))}
            for line in lines
        ]

        epd = board.epd()
        name = opening_name(board)
        # Never mark a repeated/undeveloped position as a book move.
        in_book = name is not None and epd not in seen_epds
        seen_epds.add(epd)
        if in_book:
            opening = name or opening

        # Badges judge the position as a player sees it: mates past HUMAN_MATE count as a decisive edge.
        felt_before = perceived_cp(cp_before, mate_before)
        felt_after = perceived_cp(cp_after, mate_after)  # opponent's perspective
        after_is_mate = board.is_checkmate() or mate_after is not None
        if mate_before is not None and after_is_mate:
            cp_loss = max(0, score_to_cp(cp_before, mate_before) + score_to_cp(cp_after, mate_after))  # mate to mate: compare distances
        else:
            cp_loss = max(0, felt_before + felt_after)
        after_mate = 0 if board.is_checkmate() else (-mate_after if mate_after is not None else None)
        if mate_before is not None and mate_before > 0 and after_mate is not None and 0 <= after_mate <= mate_before - 1:
            played_best = True
        pv_gap = (
            max(0.0, win_pct(perceived_cp(lines[0].cp, lines[0].mate)) - win_pct(perceived_cp(lines[1].cp, lines[1].mate)))
            if len(lines) >= 2
            else None
        )

        facts = MoveFacts(
            w_before=win_pct(felt_before),
            w_after=100 - win_pct(felt_after),
            played_best=played_best,
            pv_gap=pv_gap,
            in_book=in_book,
            sacrifice=sacrifice,
            opp_win_lost=prev_win_lost,
            had_mate=mate_before is not None and 0 < mate_before <= HUMAN_MATE,
            has_mate=board.is_checkmate() or (mate_after is not None and mate_after < 0),
            into_mate=mate_after is not None and 0 < mate_after <= HUMAN_MATE,
            was_mated=mate_before is not None and mate_before < 0,
            is_recapture=is_recap,
            was_in_check=was_in_check,
            cp_loss=cp_loss,
            best_mate=mate_before,
            after_mate=after_mate,
            is_forced=is_forced,
            is_free_capture=free_capture,
            is_game_over_draw=is_draw,
            continuing_mate=mate_before is not None and mate_before > 0 and prev_had_mate[mover],
        )
        badge = classify(facts)
        acc = 100.0 if (facts.in_book or facts.played_best or facts.is_forced) else move_accuracy(facts.win_lost)
        accs[mover].append(acc)
        phase_accs[mover][phase].append(acc)
        counts[mover][badge] += 1

        out_moves.append(
            {
                "ply": i + 1,
                "color": "white" if mover == chess.WHITE else "black",
                "san": san,
                "uci": move.uci(),
                "fen": board.fen(),
                "badge": badge,
                "phase": phase,
                "wBefore": _round(facts.w_before),
                "wAfter": _round(facts.w_after),
                "accuracy": _round(acc),
                "bestUci": best_line.uci if best_line else None,
                "bestPv": best_line.pv if best_line else [],
                "alternatives": alternatives,
                "tactics": describe(
                    before,
                    move,
                    badge,
                    best_line.uci if best_line else None,
                    None if is_draw else (lines_after[0].uci if lines_after else None),
                    mate_before,
                    mate_after,
                ),
                **_white_eval(board, cp_after, mate_after),
            }
        )
        # Horizon noise on a best, book, or forced move is not an opponent slip for the next ply's Miss check.
        prev_win_lost = 0.0 if (facts.played_best or facts.in_book or facts.is_forced) else facts.win_lost
        prev_had_mate[mover] = (mate_before is not None and mate_before > 0) or (after_mate is not None and after_mate >= 0)
        lines = lines_after
        cp_before = cp_after
        mate_before = mate_after

    def side(c: chess.Color) -> str:
        return "white" if c == chess.WHITE else "black"

    white_acc = game_accuracy(accs[chess.WHITE])
    black_acc = game_accuracy(accs[chess.BLACK])
    scores = _game_scores(board, header_result)
    time_control = game.headers.get("TimeControl")

    def _elo_for(c: chess.Color) -> int | None:
        my_acc = white_acc if c == chess.WHITE else black_acc
        opp_acc = black_acc if c == chess.WHITE else white_acc
        my_hdr = game.headers.get("WhiteElo" if c == chess.WHITE else "BlackElo")
        opp_hdr = game.headers.get("BlackElo" if c == chess.WHITE else "WhiteElo")
        nonbook = len(accs[c]) - counts[c]["book"]
        best_n = counts[c]["best"] + counts[c]["great"] + counts[c]["brilliant"]
        err_n = counts[c]["blunder"] + counts[c]["mistake"] + counts[c]["miss"]
        return estimate(
            my_acc,
            my_hdr,
            opp_elo=opp_hdr,
            opp_accuracy=opp_acc,
            result=scores[c],
            best_rate=(best_n / nonbook) if nonbook > 0 else None,
            error_rate=(err_n / nonbook) if nonbook > 0 else None,
            nonbook_moves=nonbook,
            time_control=time_control,
        )

    return {
        "hash": parsed.hash,
        "headers": dict(game.headers),
        "opening": opening,
        "start": start,
        "moves": out_moves,
        "accuracy": {
            "white": _round(white_acc),
            "black": _round(black_acc),
            "phases": {side(c): {p: _round(game_accuracy(phase_accs[c][p])) for p in PHASES} for c in chess.COLORS},
        },
        "counts": {side(c): dict(counts[c]) for c in chess.COLORS},
        "elo": {"white": _elo_for(chess.WHITE), "black": _elo_for(chess.BLACK)},
    }
