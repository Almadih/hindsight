import chess

from .eco_data import BOOK


def opening_name(board: chess.Board) -> str | None:
    return BOOK.get(board.epd())
