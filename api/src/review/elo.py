"""Single-game rating estimate (plan.md §4.4)."""

import math

DEFAULT_RATING = 1200
MAX_SWING = 600

# Expected game accuracy at a rating: ~60% at 600, 75% at 1500, ~91% at 2500.
# shortcut: uncalibrated curve picked by hand; fit it to real (rating, accuracy) pairs once D1 has enough reviews.
_LOW, _SPAN, _MID, _SCALE = 55.0, 40.0, 1500.0, 450.0


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
