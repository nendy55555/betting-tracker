"""
test_budget_and_status.py — tests for /api/budget and scraper exit-code status.

Covers:
  - /api/budget with no state file → returns ok with zero usage
  - /api/budget with valid state → reflects today's credits_used + remaining
  - /api/budget with corrupt JSON → no 500, returns empty state
  - /api/budget with stale (yesterday) state → today shows zero
  - _exit_info maps known codes to readable slugs
  - _exit_info falls back to 'unknown' for out-of-range codes
  - Scraper endpoint with mocked subprocess surfaces status block
"""

import json
import os
from datetime import date, timedelta
from unittest.mock import patch, MagicMock

import pytest


@pytest.fixture
def client(sample_tracker_path, monkeypatch, tmp_path):
    """Flask test client with a scratch ODDS_STATE_FILE per test."""
    import server as srv

    monkeypatch.setattr(srv, "TRACKER_PATH", sample_tracker_path)
    monkeypatch.setattr(srv, "ODDS_STATE_FILE", str(tmp_path / "odds_api_state.json"))
    srv._xlsx_cache["settled"] = None
    srv._xlsx_cache["open"]    = None
    srv._xlsx_cache["mtime"]   = 0.0

    srv.app.config["TESTING"] = True
    with srv.app.test_client() as c:
        yield c


class TestExitInfoHelper:
    def test_success_code_maps_to_success_slug(self):
        import server as srv
        info = srv._exit_info(0)
        assert info["ok"] is True
        assert info["slug"] == "success"

    def test_auth_code_maps_to_auth_slug(self):
        import server as srv
        info = srv._exit_info(1)
        assert info["slug"] == "auth"
        assert info["ok"] is False
        assert "credentials" in info["label"].lower()

    def test_budget_code_5_maps_to_budget_slug(self):
        import server as srv
        info = srv._exit_info(5)
        assert info["slug"] == "budget"
        assert "budget" in info["label"].lower()

    def test_excel_code_4_mentions_excel(self):
        import server as srv
        info = srv._exit_info(4)
        assert info["slug"] == "excel"
        assert "excel" in info["label"].lower()

    def test_unknown_code_falls_back(self):
        import server as srv
        info = srv._exit_info(99)
        assert info["slug"] == "unknown"
        assert info["code"] == 99
        assert info["ok"] is False


class TestBudgetEndpoint:
    def test_no_state_file_returns_ok_zero_usage(self, client):
        r = client.get("/api/budget")
        assert r.status_code == 200
        data = r.get_json()
        assert data["ok"] is True
        assert data["today"]["credits_used"] == 0
        assert data["remaining_in_cap"] == 1000
        assert data["pct_used"] == 0
        assert data["state_file_present"] is False

    def test_valid_state_reflects_today_usage(self, client, tmp_path):
        import server as srv
        today = date.today().isoformat()
        with open(srv.ODDS_STATE_FILE, "w") as f:
            json.dump({
                "daily": {today: {"credits_used": 250, "last_remaining": 19750}},
                "total_last_remaining": 19750,
                "last_call_ts": "2026-04-20T12:00:00",
            }, f)

        r = client.get("/api/budget")
        data = r.get_json()
        assert data["today"]["credits_used"] == 250
        assert data["remaining_in_cap"] == 750
        assert data["pct_used"] == 25
        assert data["total_last_remaining"] == 19750
        assert data["state_file_present"] is True

    def test_stale_state_from_yesterday_shows_zero_today(self, client):
        import server as srv
        yesterday = (date.today() - timedelta(days=1)).isoformat()
        with open(srv.ODDS_STATE_FILE, "w") as f:
            json.dump({"daily": {yesterday: {"credits_used": 999, "last_remaining": 1}}}, f)

        r = client.get("/api/budget")
        data = r.get_json()
        assert data["today"]["credits_used"] == 0
        assert data["remaining_in_cap"] == 1000

    def test_corrupt_json_does_not_500(self, client):
        import server as srv
        with open(srv.ODDS_STATE_FILE, "w") as f:
            f.write("{ not valid json")
        r = client.get("/api/budget")
        assert r.status_code == 200
        data = r.get_json()
        assert data["ok"] is True
        assert data["today"]["credits_used"] == 0

    def test_string_credits_tolerated(self, client):
        """refresh_game_odds writes strings occasionally; endpoint must not crash."""
        import server as srv
        today = date.today().isoformat()
        with open(srv.ODDS_STATE_FILE, "w") as f:
            json.dump({"daily": {today: {"credits_used": "42", "last_remaining": "19958"}}}, f)
        r = client.get("/api/budget")
        data = r.get_json()
        assert data["today"]["credits_used"] == 42

    def test_over_cap_clamps_remaining_at_zero(self, client):
        import server as srv
        today = date.today().isoformat()
        with open(srv.ODDS_STATE_FILE, "w") as f:
            json.dump({"daily": {today: {"credits_used": 1500, "last_remaining": 18500}}}, f)
        r = client.get("/api/budget")
        data = r.get_json()
        assert data["remaining_in_cap"] == 0
        assert data["pct_used"] == 100


class TestScraperStatusSurfacing:
    def test_locks25_surfaces_status_block(self, client, monkeypatch):
        """When subprocess returns a non-zero code, the status block carries slug + label."""
        import server as srv

        fake_result = MagicMock()
        fake_result.returncode = 1  # auth failure
        fake_result.stderr = "bad password"
        fake_result.stdout = ""

        monkeypatch.setattr(srv.subprocess, "run", lambda *a, **k: fake_result)
        monkeypatch.setattr(srv.os.path, "exists", lambda p: True)

        r = client.post("/api/refresh/locks25")
        assert r.status_code == 200
        data = r.get_json()
        assert "status" in data
        assert data["status"]["slug"] == "auth"
        assert data["status"]["ok"] is False
        assert data["status"]["code"] == 1

    def test_locks25_success_reports_success_slug(self, client, monkeypatch):
        import server as srv
        fake_result = MagicMock()
        fake_result.returncode = 0
        fake_result.stderr = ""
        fake_result.stdout = "ok"
        monkeypatch.setattr(srv.subprocess, "run", lambda *a, **k: fake_result)
        monkeypatch.setattr(srv.os.path, "exists", lambda p: True)

        r = client.post("/api/refresh/locks25")
        data = r.get_json()
        assert data["status"]["slug"] == "success"
        assert data["status"]["ok"] is True

    def test_bovada_surfaces_excel_lock_code(self, client, monkeypatch):
        import server as srv
        fake_result = MagicMock()
        fake_result.returncode = 4  # excel locked
        fake_result.stderr = "file is open in excel"
        fake_result.stdout = ""
        monkeypatch.setattr(srv.subprocess, "run", lambda *a, **k: fake_result)
        monkeypatch.setattr(srv.os.path, "exists", lambda p: True)

        r = client.post("/api/refresh/bovada")
        data = r.get_json()
        assert data["status"]["slug"] == "excel"
        assert "excel" in data["status"]["label"].lower()

    def test_clv_refresh_surfaces_budget_code(self, client, monkeypatch):
        import server as srv
        fake_result = MagicMock()
        fake_result.returncode = 5  # budget cap
        fake_result.stderr = ""
        fake_result.stdout = "budget exceeded"
        monkeypatch.setattr(srv.subprocess, "run", lambda *a, **k: fake_result)

        r = client.post("/api/clv/refresh", json={})
        data = r.get_json()
        assert data["status"]["slug"] == "budget"
        assert data["status"]["ok"] is False
