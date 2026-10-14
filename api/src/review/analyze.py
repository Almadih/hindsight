"""PGN + client engine evals -> full game review report."""

import io
from collections import Counter

import chess
import chess.pgn
from pydantic import BaseModel, Field, model_validator

from .classify import MoveFacts, classify, is_sacrifice
from .openings import opening_name
from .winprob import MATE_CP, game_accuracy, move_accuracy, score_to_cp, win_pct

MAX_PLIES = 600
PHASES = ("opening", "middlegame", "endgame")


class Line(BaseModel):
    uci: str | None = Field(None, max_length=5)
    cp: int | None = None
    mate: int | None = None
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
    evals: list[PositionEval] = Field(max_length=MAX_PLIES + 1)


class AnalysisError(ValueError):
    pass


def _position_cp(board: chess.Board, ev: PositionEval) -> int:
    """Side-to-move score; game-over positions are scored here rather than trusted from the client."""
    if board.is_checkmate():
        return -MATE_CP
    if board.is_game_over():
        return 0
    if not ev.lines:
        raise AnalysisError(f"missing engine lines for {board.fen()}")
    return score_to_cp(ev.lines[0].cp, ev.lines[0].mate)


def _best_mate(board: chess.Board, ev: PositionEval) -> int | None:
    if board.is_game_over() or not ev.lines:
        return None
    return ev.lines[0].mate


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


def analyze(req: AnalyzeRequest) -> dict:
    game = chess.pgn.read_game(io.StringIO(req.pgn))
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
    if len(req.evals) != len(moves) + 1:
        raise AnalysisError(f"expected {len(moves) + 1} evals, got {len(req.evals)}")

    def check_fen(b: chess.Board, ev: PositionEval):
        # Compare placement + side to move only: en passant and move counters differ between chess libraries.
        if ev.fen.split()[:2] != b.fen().split()[:2]:
            raise AnalysisError(f"eval FEN mismatch at {b.fen()}")

    check_fen(board, req.evals[0])
    cp_before = _position_cp(board, req.evals[0])
    start = _white_eval(board, cp_before, _best_mate(board, req.evals[0]))

    out_moves = []
    accs = {chess.WHITE: [], chess.BLACK: []}
    phase_accs = {c: {p: [] for p in PHASES} for c in chess.COLORS}
    counts = {c: Counter() for c in chess.COLORS}
    opening = None
    prev_win_lost = None

    for i, move in enumerate(moves):
        ev_before, ev_after = req.evals[i], req.evals[i + 1]
        mover = board.turn
        phase = _phase(board)
        san = board.san(move)
        sacrifice = is_sacrifice(board, move)
        mate_before = _best_mate(board, ev_before)

        board.push(move)
        check_fen(board, ev_after)
        cp_after = _position_cp(board, ev_after)  # opponent's perspective
        mate_after = _best_mate(board, ev_after)
        name = opening_name(board)
        opening = name or opening

        lines = ev_before.lines
        facts = MoveFacts(
            w_before=win_pct(cp_before),
            w_after=100 - win_pct(cp_after),
            played_best=bool(lines) and lines[0].uci == move.uci(),
            pv_gap=(
                win_pct(score_to_cp(lines[0].cp, lines[0].mate)) - win_pct(score_to_cp(lines[1].cp, lines[1].mate))
                if len(lines) >= 2
                else None
            ),
            in_book=name is not None,
            sacrifice=sacrifice,
            opp_win_lost=prev_win_lost,
            had_mate=mate_before is not None and mate_before > 0,
            has_mate=board.is_checkmate() or (mate_after is not None and mate_after < 0),
            into_mate=mate_after is not None and mate_after > 0,
            was_mated=mate_before is not None and mate_before < 0,
        )
        badge = classify(facts)
        acc = move_accuracy(facts.win_lost)
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
                "bestUci": lines[0].uci if lines else None,
                "bestPv": lines[0].pv if lines else [],
                **_white_eval(board, cp_after, mate_after),
            }
        )
        prev_win_lost = facts.win_lost
        cp_before = cp_after

    def side(c: chess.Color) -> str:
        return "white" if c == chess.WHITE else "black"

    return {
        "headers": dict(game.headers),
        "opening": opening,
        "start": start,
        "moves": out_moves,
        "accuracy": {
            "white": _round(game_accuracy(accs[chess.WHITE])),
            "black": _round(game_accuracy(accs[chess.BLACK])),
            "phases": {side(c): {p: _round(game_accuracy(phase_accs[c][p])) for p in PHASES} for c in chess.COLORS},
        },
        "counts": {side(c): dict(counts[c]) for c in chess.COLORS},
    }
