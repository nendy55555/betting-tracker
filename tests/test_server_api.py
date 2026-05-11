"""
test_server_api.py — smoke tests for the Flask API against a fixture workbook.

Covers:
  - /api/status returns ok
  - /api/bets returns expected rows from the fixture xlsx
  - /api/open-bets returns expected open rows
  - Error-code contract: missing xlsx → XLSX_MISSING + 503
  - Error-code contract: locked xlsx → XLSX_LOCKED + 503
"""

import os
import pytest


@pytest.fixture
def client(sample_tracker_path, monkeypatch):
    """Flask test client bound to the fixture workbook.
    Also resets the module-level mtime cache between tests."""
    import server as srv

    monkeypatch.setattr(srv, "TRACKER_PATH", sample_tracker_path)
    srv._xlsx_cache["settled"]  = None
    srv._xlsx_cache["open"]     = None
    srv._xlsx_cache["mtime"]    = 0.0

    srv.app.config["TESTING"] = True
    with srv.app.test_client() as c:
        yield c


def test_status_returns_ok(client):
    r = client.get("/api/status")
    assert r.status_code == 200
    data = r.get_json()
    assert data["ok"] is True
    assert "cache" in data


def test_api_bets_returns_fixture_rows(client):
    r = client.get("/api/bets")
    assert r.status_code == 200
    data = r.get_json()
    assert data["ok"] is True
    assert data["count"] == 3  # three SAMPLE_SETTLED rows
    txids = {b["txId"] for b in data["bets"]}
    assert txids == {"600000001", "600000002", "600000003"}


def test_api_bets_normalizes_sport(client):
    r = client.get("/api/bets")
    bets = r.get_json()["bets"]
    sports = {b["sport"] for b in bets}
    assert sports == {"NBA", "NFL"}


def test_api_bets_maps_status_to_result_code(client):
    r = client.get("/api/bets")
    bets = {b["txId"]: b for b in r.get_json()["bets"]}
    assert bets["600000001"]["result"] == "W"
    assert bets["600000002"]["result"] == "L"
    assert bets["600000003"]["result"] == "W"


def test_api_bets_parses_win_loss_to_float(client):
    r = client.get("/api/bets")
    bets = {b["txId"]: b for b in r.get_json()["bets"]}
    # Fixture has -100 for the lost NFL bet
    assert bets["600000002"]["winLoss"] == -100
    assert bets["600000001"]["winLoss"] == pytest.approx(45.45)


def test_api_open_bets_returns_fixture_rows(client):
    r = client.get("/api/open-bets")
    assert r.status_code == 200
    data = r.get_json()
    assert data["ok"] is True
    assert data["count"] == 1
    assert data["bets"][0]["sport"] == "NBA"


def test_missing_xlsx_returns_xlsx_missing_code(sample_tracker_path, monkeypatch, tmp_path):
    """Point TRACKER_PATH at a non-existent file and confirm the error contract."""
    import server as srv
    missing = tmp_path / "does_not_exist.xlsx"
    monkeypatch.setattr(srv, "TRACKER_PATH", str(missing))
    srv._xlsx_cache["settled"] = None
    srv._xlsx_cache["mtime"]   = 0.0

    srv.app.config["TESTING"] = True
    with srv.app.test_client() as c:
        r = c.get("/api/bets")
    assert r.status_code == 503
    data = r.get_json()
    assert data["ok"] is False
    assert data["code"] == "XLSX_MISSING"


def test_locked_xlsx_returns_xlsx_locked_code(sample_tracker_path, monkeypatch):
    """Simulate a PermissionError from openpyxl and confirm it maps to XLSX_LOCKED."""
    import server as srv
    monkeypatch.setattr(srv, "TRACKER_PATH", sample_tracker_path)

    def _raise(*args, **kwargs):
        raise PermissionError("Excel has the file open.")
    monkeypatch.setattr(srv.openpyxl, "load_workbook", _raise)

    srv._xlsx_cache["settled"] = None
    srv._xlsx_cache["mtime"]   = 0.0

    srv.app.config["TESTING"] = True
    with srv.app.test_client() as c:
        r = c.get("/api/bets")
    assert r.status_code == 503
    data = r.get_json()
    assert data["code"] == "XLSX_LOCKED"
