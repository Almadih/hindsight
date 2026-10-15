"""Single-game rating estimate (plan.md §4.4)."""

import math

DEFAULT_RATING = 1200
MAX_SWING = 600

# Logistic from game accuracy to rating, fitted 2026-10-15 to 30 rated Chess.com games (scripts/calibrate).
# shortcut: one game is a weak rating signal; mean error ~620 points vs ~750 for always guessing the average.
# Refit with more games once D1 holds a few hundred reviews of rated games.
_LOW, _SPAN, _MID, _SCALE = 45.0, 30.0, 1000.0, 250.0


def _rating_for_accuracy(accuracy: float) -> float:
    a = min(max(accuracy, _LOW + 0.5), _LOW + _SPAN - 0.5)
    return _MID - _SCALE * math.log(_SPAN / (a - _LOW) - 1)


def estimate(accuracy: float | None, header_elo: str | None) -> int | None:
    """Rating this game was played at, kept within ±600 of the player's real rating (or 1200 if unknown)."""
    if accuracy is None:
        return None
    try:
        anchor = int(header_elo) if header_elo else DEFAULT_RATING
    except ValueError:  # "?" or "-" in PGN headers
        anchor = DEFAULT_RATING
    raw = _rating_for_accuracy(accuracy)
    return int(round(min(max(raw, anchor - MAX_SWING), anchor + MAX_SWING), -1))
