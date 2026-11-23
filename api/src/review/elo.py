"""Single-game performance rating estimate (plan.md §4.4).

Two regimes:
- Rated games (known PGN Elo header): Chess.com-style performance rating anchored to the match level,
  comparing accuracy against the expected accuracy for that rating tier and the game's sharpness,
  combined with move-quality signals, Elo expected-score result delta, and short-game dampening.
- Unrated / headerless PGNs: intrinsic play-strength estimate over the full [100, 3300] range from
  accuracy, best-move rate, error rate, opponent accuracy, result, and move count.
"""

import math

DEFAULT_RATING = 1200
MIN_RATING = 100
MAX_UNRATED_RATING = 3300
MAX_RATED_RATING = 3400
MAX_ANCHORED_SWING = 850
MAX_OPP_ANCHOR_PULL = 200


def _parse_elo(header_elo: str | None) -> int | None:
    if not header_elo:
        return None
    try:
        val = int(header_elo)
    except ValueError:
        return None
    return val if MIN_RATING <= val <= 3600 else None


def _tc_offset(time_control: str | None) -> float:
    """Expected accuracy shift (%) by time control: faster clocks yield lower average precision."""
    if not time_control or time_control in ("-", "?"):
        return 0.0
    if "/" in time_control or ":" in time_control:
        # Daily (e.g. 1/86400) or classical multi-stage (e.g. 40/5400+30:1800+30)
        return 0.5
    parts = time_control.split("+")
    try:
        base = int(parts[0])
        inc = int(parts[1]) if len(parts) > 1 else 0
    except ValueError:
        return 0.0
    if base < 0 or inc < 0 or (base == 0 and inc == 0):
        return 0.0
    est = base + 40 * inc
    if est < 180:
        return -4.0  # bullet
    if est < 600:
        return -1.0  # blitz
    return 0.5  # rapid / classical


def expected_accuracy(elo: float, time_control: str | None = None) -> float:
    """Expected Hindsight game accuracy (%) at rating `elo` and optional PGN `TimeControl`.

    Concave saturation curve calibrated to live Chess.com Game Reviews (300–3100 Elo) and Hindsight's CAPS curve:
      200 -> 55.9%,  400 -> 60.5%,  800 -> 67.9%, 1200 -> 73.5%,
     1600 -> 77.6%, 2000 -> 80.6%, 2400 -> 82.9%, 2800 -> 84.6%, 3200 -> 85.9%
    (shifted -4.0% in Bullet, -1.0% in Blitz, +0.5% in Rapid/Classical).
    """
    return 89.5 - 39.0 * math.exp(-elo / 1350.0) + _tc_offset(time_control)


def _expected_score(elo: float, opp_elo: float) -> float:
    return 1.0 / (1.0 + 10.0 ** ((opp_elo - elo) / 400.0))


def _length_weight(nonbook_moves: int | None) -> float:
    """Dampen rating swings in ultra-short games (< 14 non-book moves); 0 non-book moves -> 0 swing."""
    if nonbook_moves is None:
        return 1.0
    if nonbook_moves <= 0:
        return 0.0
    return min(1.0, (nonbook_moves / 14.0) ** 0.75)


def _elo_from_acc(acc: float) -> float:
    """Smooth, strictly increasing inverse of `expected_accuracy` across [0, 100].

    Tracks `expected_accuracy(R) = 89.5 - 39.0 * exp(-R / 1350)` closely over 200–2400 and
    soft-saturates cleanly into [100, 3300] so extreme single-game accuracies stay well-behaved.
    """
    eps = 2.5
    x = (89.5 - acc) / eps
    if x > 30.0:
        log_gap = math.log(89.5 - acc)
    elif x < -30.0:
        log_gap = math.log(eps) + x
    else:
        log_gap = math.log(eps * math.log1p(math.exp(x)))
    raw = -1350.0 * (log_gap - math.log(39.0))

    lo_knee = 280.0
    if raw < lo_knee:
        lo_span = lo_knee - MIN_RATING
        return MIN_RATING + lo_span * math.exp((raw - lo_knee) / lo_span)

    hi_knee = 2350.0
    if raw > hi_knee:
        hi_span = (MAX_UNRATED_RATING + 50.0) - hi_knee
        d = raw - hi_knee
        return hi_knee + hi_span * (d / (d + hi_span))
    return raw


def _intrinsic_elo(
    acc: float,
    opp_accuracy: float | None = None,
    best_rate: float | None = None,
    error_rate: float | None = None,
    result: float | None = None,
    nonbook_moves: int | None = None,
    time_control: str | None = None,
) -> float:
    """Headerless (unrated) single-game strength estimate across [100, 3300].

    Maps each play-quality signal through the same accuracy-to-Elo relationship used by
    `expected_accuracy` and `_anchored_elo`, so unrated and anchored ratings stay consistent
    across tiers while remaining smooth and monotonic in every input.
    """
    tc_off = _tc_offset(time_control)
    parts: list[tuple[float, float]] = [(0.20, _elo_from_acc(acc - tc_off))]
    if best_rate is not None:
        # Inverse of `_anchored_elo`'s `exp_best = (exp_a - 30) / 100`
        parts.append((0.45, _elo_from_acc(100.0 * max(0.0, min(1.0, best_rate)) + 30.0 - tc_off)))
    if error_rate is not None:
        # Inverse of `_anchored_elo`'s `exp_err = (90 - exp_a) / 140`
        parts.append((0.20, _elo_from_acc(90.0 - 140.0 * max(0.0, min(1.0, error_rate)) - tc_off)))
    if opp_accuracy is not None:
        parts.append((0.15, _elo_from_acc(opp_accuracy - tc_off)))

    raw = sum(weight * val for weight, val in parts) / sum(weight for weight, _ in parts)
    if result is not None:
        raw += 60.0 * (result - 0.5)

    w = _length_weight(nonbook_moves)
    est = DEFAULT_RATING + w * (raw - DEFAULT_RATING)
    return max(float(MIN_RATING), min(float(MAX_UNRATED_RATING), est))


def _anchored_elo(
    acc: float,
    player_elo: int,
    opp_elo: int | None = None,
    opp_accuracy: float | None = None,
    best_rate: float | None = None,
    error_rate: float | None = None,
    result: float | None = None,
    nonbook_moves: int | None = None,
    time_control: str | None = None,
) -> float:
    """Chess.com-style Game Rating anchored to match strength + single-game performance."""
    if opp_elo is not None:
        # Gentle opponent anchor pull (max +/-50 Elo) so huge rating mismatches don't penalize a strong player
        # for beating a weak opponent or gift an underdog a free boost; result surprise handles the rating gap.
        eff_opp = max(player_elo - MAX_OPP_ANCHOR_PULL, min(player_elo + MAX_OPP_ANCHOR_PULL, opp_elo))
        game_elo = 0.75 * player_elo + 0.25 * eff_opp
    else:
        game_elo = float(player_elo)

    exp_a = expected_accuracy(game_elo, time_control)
    diff = acc - exp_a
    # Higher precision (above 65%) is harder per percentage point; keep derivative wrt `acc` strictly positive.
    slope_ref = acc if diff >= 0.0 else exp_a
    slope = 28.0 + 0.55 * max(0.0, slope_ref - 65.0)
    acc_delta = diff * slope

    # Clean-play refinement centered on expected tier rates (independent of `acc` to preserve monotonicity)
    qual_delta = 0.0
    if best_rate is not None:
        exp_best = max(0.20, min(0.80, (exp_a - 30.0) / 100.0))
        qual_delta += 380.0 * (best_rate - exp_best)
    if error_rate is not None:
        exp_err = max(0.0, min(0.45, (90.0 - exp_a) / 140.0))
        qual_delta -= 380.0 * (error_rate - exp_err)
    qual_delta = max(-180.0, min(180.0, qual_delta))

    # Elo expected-score result surprise, smoothly dampened when accuracy contradicts the outcome (flag/swindle).
    res_delta = 0.0
    if result is not None:
        real_opp = float(opp_elo) if opp_elo is not None else float(player_elo)
        res_delta = 100.0 * (result - _expected_score(float(player_elo), real_opp))
        if opp_accuracy is not None:
            if res_delta > 0.0:
                res_delta *= 0.25 + 0.75 / (1.0 + math.exp(-(acc - opp_accuracy + 2.0) / 3.0))
            elif res_delta < 0.0:
                res_delta *= 0.25 + 0.75 / (1.0 + math.exp((acc - opp_accuracy - 2.0) / 3.0))

    w_len = _length_weight(nonbook_moves)
    raw_delta = w_len * (acc_delta + qual_delta + res_delta)
    # Smooth soft saturation (tanh) bounds extreme swings without creating flat walls at low/high accuracy.
    total_delta = MAX_ANCHORED_SWING * math.tanh(raw_delta / MAX_ANCHORED_SWING)
    return max(float(MIN_RATING), min(float(MAX_RATED_RATING), game_elo + total_delta))


def estimate(
    accuracy: float | None,
    header_elo: str | None,
    *,
    opp_elo: str | None = None,
    opp_accuracy: float | None = None,
    result: float | None = None,
    best_rate: float | None = None,
    error_rate: float | None = None,
    nonbook_moves: int | None = None,
    time_control: str | None = None,
) -> int | None:
    """Single-game performance rating, rounded to the nearest 10 in [100, 3400]."""
    if accuracy is None:
        return None
    acc = max(0.0, min(100.0, float(accuracy)))
    opp_acc = None if opp_accuracy is None else max(0.0, min(100.0, float(opp_accuracy)))
    player_elo = _parse_elo(header_elo)
    parsed_opp = _parse_elo(opp_elo)

    if player_elo is not None:
        est = _anchored_elo(acc, player_elo, parsed_opp, opp_acc, best_rate, error_rate, result, nonbook_moves, time_control)
    else:
        est = _intrinsic_elo(acc, opp_acc, best_rate, error_rate, result, nonbook_moves, time_control)
    return int(round(est, -1))
