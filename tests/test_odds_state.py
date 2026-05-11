"""
test_odds_state.py — tests for the daily budget tracking in refresh_game_odds.py.

Budget math matters: if enforce_budget() is wrong, Thomas can drain the
$30/mo plan. These tests pin down the state transitions.
"""

import os
import json
from datetime import date, timedelta

import pytest

from refresh_game_odds import (
    load_state, save_state, daily_used, record_call, enforce_budget,
    OddsAPIBudgetExceeded,
)


@pytest.fixture
def isolated_state_file(tmp_path, monkeypatch):
    """Redirect STATE_FILE to a tmp path so tests don't touch the real file."""
    fake = tmp_path / "odds_api_state.json"
    monkeypatch.setattr("refresh_game_odds.STATE_FILE", str(fake))
    return str(fake)


class TestLoadState:
    def test_returns_empty_state_when_no_file(self, isolated_state_file):
        s = load_state()
        assert s == {"daily": {}, "total_last_remaining": None, "last_call_ts": None}

    def test_returns_empty_state_on_corrupt_json(self, isolated_state_file):
        with open(isolated_state_file, "w") as f:
            f.write("{ not valid json")
        s = load_state()
        assert "daily" in s


class TestRecordCall:
    def test_initial_call_sets_day_counter(self, isolated_state_file):
        s = load_state()
        record_call(s, credits_used=5, remaining=19995)
        today = date.today().isoformat()
        assert s["daily"][today]["credits_used"] == 5
        assert s["daily"][today]["last_remaining"] == 19995
        assert s["total_last_remaining"] == 19995

    def test_subsequent_calls_accumulate(self, isolated_state_file):
        s = load_state()
        record_call(s, 5, 19995)
        record_call(s, 7, 19988)
        today = date.today().isoformat()
        assert s["daily"][today]["credits_used"] == 12
        assert s["daily"][today]["last_remaining"] == 19988

    def test_string_credits_tolerated(self, isolated_state_file):
        s = load_state()
        record_call(s, "3", "19997")  # headers come as strings
        today = date.today().isoformat()
        assert s["daily"][today]["credits_used"] == 3

    def test_unparseable_values_do_not_crash(self, isolated_state_file):
        s = load_state()
        record_call(s, "?", "?")
        today = date.today().isoformat()
        assert s["daily"][today]["credits_used"] == 0

    def test_old_days_pruned_past_90(self, isolated_state_file):
        s = load_state()
        old = (date.today() - timedelta(days=120)).isoformat()
        s["daily"][old] = {"credits_used": 50, "last_remaining": 1000}
        record_call(s, 3, 19997)
        assert old not in s["daily"]


class TestEnforceBudget:
    def test_below_cap_does_not_raise(self, isolated_state_file):
        s = load_state()
        record_call(s, 500, 19500)
        enforce_budget(s, cap=1000)  # 500 < 1000

    def test_at_cap_raises(self, isolated_state_file):
        s = load_state()
        record_call(s, 1000, 19000)
        with pytest.raises(OddsAPIBudgetExceeded, match="1000/1000"):
            enforce_budget(s, cap=1000)

    def test_over_cap_raises(self, isolated_state_file):
        s = load_state()
        record_call(s, 1500, 18500)
        with pytest.raises(OddsAPIBudgetExceeded):
            enforce_budget(s, cap=1000)

    def test_fresh_day_starts_at_zero(self, isolated_state_file):
        # Simulate a previous day's usage, then enforce today.
        s = load_state()
        yesterday = (date.today() - timedelta(days=1)).isoformat()
        s["daily"][yesterday] = {"credits_used": 9999, "last_remaining": 10001}
        # Today is clean; should not raise.
        enforce_budget(s, cap=100)
        assert daily_used(s) == 0


class TestSaveState:
    def test_roundtrip(self, isolated_state_file):
        s = load_state()
        record_call(s, 7, 19993)
        save_state(s)
        reloaded = load_state()
        today = date.today().isoformat()
        assert reloaded["daily"][today]["credits_used"] == 7
