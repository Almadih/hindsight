from review.elo import MAX_RATED_RATING, MAX_UNRATED_RATING, MIN_RATING, estimate, expected_accuracy


def test_estimate_bounds_and_direction():
    assert estimate(None, "1500") is None
    # Strictly monotonic in accuracy across the entire 40..99% spectrum (no flat 2020 ceiling!)
    for header in (None, "1500", "2800"):
        vals = [estimate(a, header) for a in (40, 55, 65, 75, 85, 92, 99)]
        assert all(MIN_RATING <= v <= MAX_RATED_RATING for v in vals)
        assert vals[0] < vals[1] < vals[2] < vals[3] < vals[4] < vals[5] < vals[6]
    # Floor at 100 (never negative) and ceiling bounded
    assert estimate(0, "200") == MIN_RATING
    assert estimate(0, None) == MIN_RATING
    assert estimate(100, None) <= MAX_UNRATED_RATING
    assert estimate(100, "3200") <= MAX_RATED_RATING


def test_bad_or_out_of_range_header_falls_back_to_unrated():
    assert estimate(75, "?") == estimate(75, None)
    assert estimate(75, "-") == estimate(75, None)
    assert estimate(75, "0") == estimate(75, None)
    assert estimate(75, "-200") == estimate(75, None)
    assert estimate(75, "99999") == estimate(75, None)


def test_gm_games_reflect_gm_level_not_old_ceiling():
    # A 2800 GM winning with 91% accuracy must rate near/above 3000, not get dragged down to 2200
    gm_win = estimate(91.0, "2800", opp_elo="2800", opp_accuracy=84.0, result=1.0, best_rate=0.68, error_rate=0.02, nonbook_moves=40)
    assert 2950 <= gm_win <= 3300
    # A 2800 GM winning a sharp 78% vs 75% tactical battle stays near GM level
    gm_sharp = estimate(78.0, "2800", opp_elo="2800", opp_accuracy=75.0, result=1.0, best_rate=0.55, error_rate=0.08, nonbook_moves=45)
    assert 2500 <= gm_sharp <= 2900


def test_unrated_covers_full_strength_range():
    # Beginner blunderfest vs masterwork without Elo headers
    low = estimate(42.0, None, opp_accuracy=50.0, best_rate=0.20, error_rate=0.35, result=0.0, nonbook_moves=25)
    mid = estimate(73.0, None, opp_accuracy=73.0, best_rate=0.45, error_rate=0.10, result=0.5, nonbook_moves=30)
    high = estimate(96.0, None, opp_accuracy=88.0, best_rate=0.75, error_rate=0.0, result=1.0, nonbook_moves=30)
    assert 100 <= low <= 500
    assert 1100 <= mid <= 1650
    assert 2600 <= high <= MAX_UNRATED_RATING


def test_result_quality_and_mismatch_behavior():
    # Equal opponent, same accuracy: win > draw > loss
    loss = estimate(76.0, "1500", opp_elo="1500", opp_accuracy=76.0, result=0.0, nonbook_moves=30)
    draw = estimate(76.0, "1500", opp_elo="1500", opp_accuracy=76.0, result=0.5, nonbook_moves=30)
    win = estimate(76.0, "1500", opp_elo="1500", opp_accuracy=76.0, result=1.0, nonbook_moves=30)
    assert loss < draw < win

    # Huge rating mismatch: an 864 losing with 67% to a 2681 must NOT get a free 1400+ rating
    underdog_loss = estimate(67.0, "864", opp_elo="2681", opp_accuracy=78.0, result=0.0, nonbook_moves=24)
    assert 600 <= underdog_loss <= 1050

    # Lucky flag win (much lower accuracy than opponent) is still penalized below baseline
    lucky_win = estimate(60.0, "1500", opp_elo="1500", opp_accuracy=82.0, result=1.0, best_rate=0.30, error_rate=0.25, nonbook_moves=30)
    assert lucky_win < 1250

    # Unlucky high-accuracy loss still gets a strong performance rating
    unlucky_loss = estimate(92.0, "1500", opp_elo="1500", opp_accuracy=88.0, result=0.0, best_rate=0.68, error_rate=0.02, nonbook_moves=30)
    assert unlucky_loss >= 1850


def test_short_game_and_book_only_dampening():
    # 0 non-book moves (100% book) produces zero swing away from match anchor / default
    assert estimate(100.0, "1400", opp_elo="1400", result=0.5, nonbook_moves=0) == 1400
    assert estimate(100.0, None, result=0.5, nonbook_moves=0) == 1200
    # 3-move Scholar's Mate swings much less than a 30-move 95% masterpiece
    short_win = estimate(95.0, "1000", opp_elo="1000", opp_accuracy=55.0, result=1.0, nonbook_moves=3)
    full_win = estimate(95.0, "1000", opp_elo="1000", opp_accuracy=75.0, result=1.0, nonbook_moves=30)
    assert short_win < full_win


def test_expected_accuracy_is_monotonic():
    accs = [expected_accuracy(r) for r in (200, 600, 1000, 1400, 1800, 2200, 2600, 3000)]
    assert all(accs[i] < accs[i + 1] for i in range(len(accs) - 1))
    # Faster time controls expect slightly lower average accuracy at the same rating
    assert expected_accuracy(1800, "60") < expected_accuracy(1800, "180") < expected_accuracy(1800, "600")


def test_smoothness_and_monotonicity_no_step_cliffs():
    from review.elo import _anchored_elo

    # Sweep accuracy in 0.5% steps across wins, draws, losses, and rating mismatches:
    # must be strictly non-decreasing with no abrupt step cliffs (like the old +/-180 jump at acc = opp_acc +/- 3).
    for pe, oe in ((1500, 1500), (1800, 1400), (800, 2400), (2800, 2800)):
        for res in (0.0, 0.5, 1.0):
            prev = None
            for a2 in range(0, 201):
                acc = a2 * 0.5
                cur = _anchored_elo(acc, pe, oe, 80.0, 0.45, 0.10, res, 30, "300")
                if prev is not None:
                    assert cur >= prev - 1e-9
                    assert (cur - prev) <= 35.0  # <= 70 Elo per 1% acc everywhere
                prev = cur


def test_beginner_separation_and_mismatch_favorite_and_time_controls():
    # 300-rated winner playing normal 55% blitz must NOT collapse into the 100 floor alongside the loser
    b_win = estimate(54.7, "297", opp_elo="284", opp_accuracy=52.4, result=1.0, best_rate=0.35, error_rate=0.25, nonbook_moves=16, time_control="300")
    b_loss = estimate(52.4, "284", opp_elo="297", opp_accuracy=54.7, result=0.0, best_rate=0.25, error_rate=0.30, nonbook_moves=16, time_control="300")
    assert b_win >= 250
    assert b_win > b_loss

    # 2681 beating an 864 in 3+0 blitz with 78% accuracy stays realistic (not dragged to 1900 like match-avg anchor)
    fav_win = estimate(78.2, "2681", opp_elo="864", opp_accuracy=66.6, result=1.0, best_rate=0.58, error_rate=0.04, nonbook_moves=24, time_control="180")
    assert 2400 <= fav_win <= 2800

    # High-Elo Blitz winners playing ~82-85% accuracy shouldn't inflate +350 above their rating,
    # and equal-accuracy wins/losses stay within ~120 Elo (matching Chess.com's small result spread).
    eq_w = estimate(82.0, "2900", opp_elo="2900", opp_accuracy=82.0, result=1.0, best_rate=0.55, error_rate=0.06, nonbook_moves=35, time_control="180")
    eq_l = estimate(82.0, "2900", opp_elo="2900", opp_accuracy=82.0, result=0.0, best_rate=0.55, error_rate=0.06, nonbook_moves=35, time_control="180")
    assert 2750 <= eq_w <= 3000
    assert 0 < (eq_w - eq_l) <= 120

    # Same 82% accuracy in 1+0 Bullet rates higher than in 10+0 Rapid
    bullet = estimate(82.0, "2000", opp_elo="2000", opp_accuracy=80.0, result=1.0, nonbook_moves=30, time_control="60")
    rapid = estimate(82.0, "2000", opp_elo="2000", opp_accuracy=80.0, result=1.0, nonbook_moves=30, time_control="600")
    assert bullet > rapid


def test_unrated_calibrated_with_anchored_across_tiers():
    # Typical games at each rating tier should align closely between headerless (unrated) and anchored models.
    for tc in ("600", "300", "60"):
        prev_unr = 0
        for rating in (400, 800, 1200, 1600, 2000, 2400, 2800):
            ea = expected_accuracy(rating, tc)
            eb = max(0.20, min(0.80, (ea - 30.0) / 100.0))
            ee = max(0.0, min(0.45, (90.0 - ea) / 140.0))
            unr = estimate(ea, None, opp_accuracy=ea, result=0.5, best_rate=eb, error_rate=ee, nonbook_moves=30, time_control=tc)
            anc = estimate(ea, str(rating), opp_elo=str(rating), opp_accuracy=ea, result=0.5, best_rate=eb, error_rate=ee, nonbook_moves=30, time_control=tc)
            assert unr > prev_unr
            prev_unr = unr
            tol = 80 if rating <= 2400 else 220
            assert abs(unr - anc) <= tol, f"tc={tc} rating={rating}: unrated={unr} vs anchored={anc}"


def test_unrated_monotonicity_and_smoothness():
    from review.elo import _intrinsic_elo

    # Smoothly non-decreasing across accuracy in 0.5% steps for all time controls
    for tc in (None, "60", "180", "600"):
        prev = None
        for a2 in range(0, 201):
            cur = _intrinsic_elo(a2 * 0.5, 75.0, 0.45, 0.10, 0.5, 30, tc)
            if prev is not None:
                assert cur >= prev - 1e-9
                assert (cur - prev) <= 30.0
            prev = cur

    # Monotonic in best_rate, -error_rate, opp_accuracy, result, and faster time control
    assert _intrinsic_elo(75.0, 75.0, 0.30, 0.10, 0.5, 30) < _intrinsic_elo(75.0, 75.0, 0.50, 0.10, 0.5, 30) < _intrinsic_elo(75.0, 75.0, 0.70, 0.10, 0.5, 30)
    assert _intrinsic_elo(75.0, 75.0, 0.45, 0.25, 0.5, 30) < _intrinsic_elo(75.0, 75.0, 0.45, 0.10, 0.5, 30) < _intrinsic_elo(75.0, 75.0, 0.45, 0.02, 0.5, 30)
    assert _intrinsic_elo(75.0, 60.0, 0.45, 0.10, 0.5, 30) < _intrinsic_elo(75.0, 75.0, 0.45, 0.10, 0.5, 30) < _intrinsic_elo(75.0, 90.0, 0.45, 0.10, 0.5, 30)
    assert _intrinsic_elo(75.0, 75.0, 0.45, 0.10, 0.0, 30) < _intrinsic_elo(75.0, 75.0, 0.45, 0.10, 0.5, 30) < _intrinsic_elo(75.0, 75.0, 0.45, 0.10, 1.0, 30)
    assert _intrinsic_elo(75.0, 75.0, 0.45, 0.10, 0.5, 30, "600") < _intrinsic_elo(75.0, 75.0, 0.45, 0.10, 0.5, 30, "180") < _intrinsic_elo(75.0, 75.0, 0.45, 0.10, 0.5, 30, "60")
