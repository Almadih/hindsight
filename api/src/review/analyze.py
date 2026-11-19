"""PGN + client engine evals -> full game review report."""

import hashlib
import io
from collections import Counter
from dataclasses import dataclass

import chess
import chess.pgn
from pydantic import BaseModel, Field, model_validator

from .classify import MoveFacts, classify, is_sacrifice
from .elo import estimate
from .openings import opening_name
from .tactics import describe, parse_move
from .winprob import HUMAN_MATE, MATE_CP, game_accuracy, move_accuracy, perceived_cp, score_to_cp, win_pct

MAX_PLIES = 600
# Part of every game hash: bump it whenever classification output changes so stale cached reviews are never served.
ANALYSIS_VERSION = "6"
PHASES = ("opening", "middlegame", "endgame")


class Line(BaseModel):
    uci: str | None = Field(None, max_length=5)
    cp: int | None = Field(None, ge=-100_000, le=100_000)
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
    # Omitted on the first request: the client only runs Stockfish if no cached review exists.
    evals: list[PositionEval] | None = Field(None, max_length=MAX_PLIES + 1)
    # Re-analysis in the user's own browser: skip the shared cache entirely, neither reading nor writing it.
    fresh: bool = False


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
    cp_before = _position_cp(board, evals[0])
    start = _white_eval(board, cp_before, _best_mate(board, evals[0]))

    out_moves = []
    accs = {chess.WHITE: [], chess.BLACK: []}
    phase_accs = {c: {p: [] for p in PHASES} for c in chess.COLORS}
    counts = {c: Counter() for c in chess.COLORS}
    opening = None
    prev_win_lost = None

    for i, move in enumerate(moves):
        ev_before, ev_after = evals[i], evals[i + 1]
        mover = board.turn
        phase = _phase(board)
        san = board.san(move)
        sacrifice = is_sacrifice(board, move)
        mate_before = _best_mate(board, ev_before)
        before = board.copy(stack=1)  # describe() checks the last move for missed recaptures
        lines = ev_before.lines
        alternatives = [
            {"uci": line.uci, "san": board.san(chess.Move.from_uci(line.uci)), "w": _round(win_pct(score_to_cp(line.cp, line.mate)))}
            for line in lines
        ]

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
        _check_eval(board, ev_after)
        cp_after = _position_cp(board, ev_after)  # opponent's perspective
        mate_after = _best_mate(board, ev_after)
        name = opening_name(board)
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

        facts = MoveFacts(
            w_before=win_pct(felt_before),
            w_after=100 - win_pct(felt_after),
            played_best=played_best,
            pv_gap=(
                win_pct(perceived_cp(lines[0].cp, lines[0].mate)) - win_pct(perceived_cp(lines[1].cp, lines[1].mate))
                if len(lines) >= 2
                else None
            ),
            in_book=name is not None,
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
        )
        badge = classify(facts)
        acc = 100.0 if (facts.in_book or facts.played_best) else move_accuracy(facts.win_lost)
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
                "alternatives": alternatives,
                "tactics": describe(
                    before,
                    move,
                    badge,
                    lines[0].uci if lines else None,
                    ev_after.lines[0].uci if ev_after.lines else None,
                    mate_before,
                    mate_after,
                ),
                **_white_eval(board, cp_after, mate_after),
            }
        )
        prev_win_lost = facts.win_lost
        cp_before = cp_after

    def side(c: chess.Color) -> str:
        return "white" if c == chess.WHITE else "black"

    white_acc = game_accuracy(accs[chess.WHITE])
    black_acc = game_accuracy(accs[chess.BLACK])
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
        "elo": {"white": estimate(white_acc, game.headers.get("WhiteElo")), "black": estimate(black_acc, game.headers.get("BlackElo"))},
    }
