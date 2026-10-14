import pytest

from review.winprob import game_accuracy, move_accuracy, score_to_cp, win_pct


def test_win_pct_even_and_symmetric():
    assert win_pct(0) == 50
    assert win_pct(300) == pytest.approx(100 - win_pct(-300))
    assert win_pct(10000) > 99.9


def test_mate_scores():
    assert score_to_cp(None, 1) == 9990
    assert score_to_cp(None, -3) == -9970
    assert score_to_cp(None, 0) == -10000
    assert score_to_cp(55, None) == 55


def test_move_accuracy_bounds():
    assert move_accuracy(0) == pytest.approx(100, abs=0.01)
    assert move_accuracy(100) == 0
    assert move_accuracy(5) > move_accuracy(10)


def test_game_accuracy_punishes_blunders():
    assert game_accuracy([]) is None
    assert game_accuracy([90, 90]) == pytest.approx(90)
    assert game_accuracy([100, 100, 10]) < 70
