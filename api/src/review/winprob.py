"""Win probability and CAPS-style accuracy math (plan.md §4.1).

All scores are from the perspective of the side to move unless a name says otherwise.
"""

import math

MATE_CP = 10000


def score_to_cp(cp: int | None, mate: int | None) -> int:
    """Engine score -> centipawns. Mate in N maps to ±(10000 - 10·N) so shorter mates score higher."""
    if mate is not None:
        if mate == 0:  # side to move is checkmated
            return -MATE_CP
        return int(math.copysign(MATE_CP - 10 * abs(mate), mate))
    return cp or 0


def win_pct(cp: float) -> float:
    return 50 + 50 * (2 / (1 + math.exp(-0.00368208 * cp)) - 1)


# Fitted 2026-10-15 against Chess.com's own accuracies on 30 rated games across five rating bands
# (scripts/calibrate): bias +4.5 -> -0.4, mean error 7.0 -> 4.1 points. Re-run fit.py when the engine changes.
LOSS_SCALE = 2.2  # how hard a lost winning chance counts against move accuracy
HARMONIC_WEIGHT = 0.1  # share of the harmonic mean in game accuracy (the rest is the plain mean)


def move_accuracy(win_lost: float) -> float:
    return max(0.0, min(100.0, 103.1668 * math.exp(-0.04354 * LOSS_SCALE * max(0.0, win_lost)) - 3.1669))


def game_accuracy(accuracies: list[float]) -> float | None:
    """Blend of the arithmetic and harmonic means: one blunder pulls the score down harder than a plain average."""
    # shortcut: no Lichess-style volatility weighting; add it if scores feel too flat across sharp games.
    if not accuracies:
        return None
    arith = sum(accuracies) / len(accuracies)
    harmonic = len(accuracies) / sum(1 / max(a, 1.0) for a in accuracies)
    return (1 - HARMONIC_WEIGHT) * arith + HARMONIC_WEIGHT * harmonic
