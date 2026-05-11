"""
test_clv_math.py — unit tests for CLV math in clv_calculator.py.

These are pure functions: no I/O, no Excel, no network. Fast and deterministic.
"""

import math
import pytest

from clv_calculator import (
    american_to_implied,
    implied_to_american,
    remove_vig_two_way,
    calculate_clv_percentage,
)


# ─── american_to_implied ─────────────────────────────────────────────────────
class TestAmericanToImplied:
    def test_even_odds(self):
        # -100 / +100 both round-trip to 50%
        assert american_to_implied(-100) == pytest.approx(0.5)
        assert american_to_implied(100)  == pytest.approx(0.5)

    def test_favorite(self):
        # -110 is 52.38%
        assert american_to_implied(-110) == pytest.approx(110 / 210, rel=1e-6)

    def test_heavy_favorite(self):
        # -500 is 83.33%
        assert american_to_implied(-500) == pytest.approx(500 / 600, rel=1e-6)

    def test_underdog(self):
        # +150 is 40%
        assert american_to_implied(150) == pytest.approx(100 / 250)

    def test_zero_returns_none(self):
        assert american_to_implied(0) is None

    def test_none_returns_none(self):
        assert american_to_implied(None) is None

    def test_string_input_parses(self):
        # Function uses float(), so numeric strings should work.
        assert american_to_implied("-110") == pytest.approx(110 / 210, rel=1e-6)


# ─── implied_to_american ─────────────────────────────────────────────────────
class TestImpliedToAmerican:
    def test_even(self):
        # 50% → pick-'em; accept either ±100
        result = implied_to_american(0.5)
        assert abs(result) == 100

    def test_roundtrip_favorite(self):
        prob = american_to_implied(-150)
        assert implied_to_american(prob) == -150

    def test_roundtrip_underdog(self):
        prob = american_to_implied(200)
        assert implied_to_american(prob) == 200

    def test_out_of_range_returns_none(self):
        assert implied_to_american(0) is None
        assert implied_to_american(1) is None
        assert implied_to_american(-0.1) is None
        assert implied_to_american(1.5) is None

    def test_none_returns_none(self):
        assert implied_to_american(None) is None


# ─── remove_vig_two_way ──────────────────────────────────────────────────────
class TestRemoveVig:
    def test_zero_vig_market(self):
        # +100 / -100 has no vig; probs stay 50/50.
        a, b = remove_vig_two_way(100, -100)
        assert a == pytest.approx(0.5)
        assert b == pytest.approx(0.5)
        assert a + b == pytest.approx(1.0)

    def test_standard_vig(self):
        # -110 / -110 market has ~4.5% vig. After removal, both sides are 50%.
        a, b = remove_vig_two_way(-110, -110)
        assert a == pytest.approx(0.5, abs=1e-6)
        assert b == pytest.approx(0.5, abs=1e-6)

    def test_asymmetric_market(self):
        # -150 / +130 — sum should be 1.0 after de-vig.
        a, b = remove_vig_two_way(-150, 130)
        assert a + b == pytest.approx(1.0, abs=1e-6)
        # Favorite has higher probability
        assert a > b

    def test_none_input_returns_none(self):
        a, b = remove_vig_two_way(None, -110)
        assert a is None and b is None


# ─── calculate_clv_percentage ────────────────────────────────────────────────
class TestCLVPercentage:
    def test_positive_clv_when_line_moves_favorably(self):
        # Bet at +200 (33.3%), closing no-vig at 40% → got worse value at bet time? No:
        # CLV% = (0.40 / 0.333 - 1) × 100 = +20.0 — they bet at better odds
        pct = calculate_clv_percentage(200, 0.40)
        assert pct == pytest.approx(20.0, rel=1e-3)

    def test_negative_clv_when_line_moves_against(self):
        # Bet at -110 (52.38%), closing at 50% → locked in worse number
        pct = calculate_clv_percentage(-110, 0.50)
        assert pct < 0
        assert pct == pytest.approx((0.50 / (110 / 210) - 1) * 100, rel=1e-3)

    def test_zero_clv_at_same_line(self):
        # Bet at -110 (0.5238), closing fair == implied → CLV ~0
        implied = american_to_implied(-110)
        pct = calculate_clv_percentage(-110, implied)
        assert pct == pytest.approx(0.0, abs=1e-9)

    def test_none_inputs_return_none(self):
        assert calculate_clv_percentage(None, 0.5) is None
        assert calculate_clv_percentage(-110, None) is None
