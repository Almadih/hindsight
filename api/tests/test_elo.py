from review.elo import estimate


def test_estimate_bounds_and_direction():
    assert estimate(None, "1500") is None
    assert estimate(60, None) == 1000  # the fitted curve's midpoint
    assert estimate(99, "1000") == 1600  # capped at +600
    assert estimate(40, "2000") == 1400  # capped at -600
    assert estimate(55, "1500") < estimate(62, "1500") < estimate(70, "1500")


def test_bad_header_falls_back_to_default():
    assert estimate(75, "?") == estimate(75, None)
