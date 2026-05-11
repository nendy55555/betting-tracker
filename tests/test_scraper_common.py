"""
test_scraper_common.py — tests for shared scraper utilities.

Covers:
  - Error class hierarchy and exit codes
  - Chrome preflight (mocked filesystem checks)
  - require_env raises ScraperAuthError on missing values
  - with_retry retries the right number of times then raises
  - save_xlsx_safely surfaces PermissionError as ScraperExcelError
  - run_scraper maps exception types to exit codes
"""

import os
import pytest
from unittest.mock import patch, MagicMock
from selenium.common.exceptions import TimeoutException

from scraper_common import (
    ScraperError, ScraperBrowserError, ScraperAuthError,
    ScraperTimeoutError, ScraperDOMError, ScraperExcelError,
    chrome_preflight, with_retry, save_xlsx_safely,
    require_env, run_scraper, build_arg_parser,
)


class TestErrorHierarchy:
    def test_all_inherit_from_base(self):
        for cls in (ScraperBrowserError, ScraperAuthError, ScraperTimeoutError,
                    ScraperDOMError, ScraperExcelError):
            assert issubclass(cls, ScraperError)

    def test_exit_codes_are_distinct_for_actionable_classes(self):
        assert ScraperAuthError.exit_code == 1
        assert ScraperTimeoutError.exit_code == 2
        assert ScraperDOMError.exit_code == 2  # both surface as "scrape failed"
        assert ScraperBrowserError.exit_code == 3
        assert ScraperExcelError.exit_code == 4


class TestChromePreflight:
    def test_finds_chrome_via_env_override(self, tmp_path, monkeypatch):
        fake = tmp_path / "fake-chrome"
        fake.write_text("")
        monkeypatch.setenv("CHROME_BINARY", str(fake))
        assert chrome_preflight() == str(fake)

    def test_env_override_missing_raises(self, monkeypatch):
        monkeypatch.setenv("CHROME_BINARY", "/nonexistent/path/chrome")
        with pytest.raises(ScraperBrowserError, match="does not exist"):
            chrome_preflight()

    def test_no_chrome_anywhere_raises(self, monkeypatch):
        monkeypatch.delenv("CHROME_BINARY", raising=False)
        with patch("scraper_common.os.path.exists", return_value=False), \
             patch("scraper_common.shutil.which", return_value=None):
            with pytest.raises(ScraperBrowserError, match="Chrome not found"):
                chrome_preflight()


class TestRequireEnv:
    def test_returns_values_when_present(self, monkeypatch):
        monkeypatch.setenv("TEST_USER", "alice")
        monkeypatch.setenv("TEST_PASS", "secret")
        u, p = require_env("TEST_USER", "TEST_PASS")
        assert (u, p) == ("alice", "secret")

    def test_raises_with_all_missing_in_message(self, monkeypatch):
        monkeypatch.delenv("MISSING_A", raising=False)
        monkeypatch.delenv("MISSING_B", raising=False)
        with pytest.raises(ScraperAuthError) as exc:
            require_env("MISSING_A", "MISSING_B")
        assert "MISSING_A" in str(exc.value)
        assert "MISSING_B" in str(exc.value)

    def test_blank_value_treated_as_missing(self, monkeypatch):
        monkeypatch.setenv("BLANK_KEY", "   ")
        with pytest.raises(ScraperAuthError, match="BLANK_KEY"):
            require_env("BLANK_KEY")


class TestWithRetry:
    def test_returns_immediately_on_success(self):
        calls = {"n": 0}

        @with_retry(retries=3, base_delay=0.01)
        def fn():
            calls["n"] += 1
            return "ok"

        assert fn() == "ok"
        assert calls["n"] == 1

    def test_retries_then_succeeds(self):
        calls = {"n": 0}

        @with_retry(retries=3, base_delay=0.01)
        def fn():
            calls["n"] += 1
            if calls["n"] < 2:
                raise TimeoutException("transient")
            return "recovered"

        assert fn() == "recovered"
        assert calls["n"] == 2

    def test_exhausts_retries_then_raises_scraper_timeout(self):
        calls = {"n": 0}

        @with_retry(retries=3, base_delay=0.01)
        def fn():
            calls["n"] += 1
            raise TimeoutException("permanent")

        with pytest.raises(ScraperTimeoutError, match="failed after 3 attempts"):
            fn()
        assert calls["n"] == 3

    def test_non_transient_exception_not_caught(self):
        @with_retry(retries=3, base_delay=0.01)
        def fn():
            raise ValueError("not transient")

        with pytest.raises(ValueError):
            fn()


class TestSaveXlsxSafely:
    def test_saves_to_real_path(self, tmp_path):
        import openpyxl
        wb = openpyxl.Workbook()
        path = tmp_path / "out.xlsx"
        save_xlsx_safely(wb, str(path))
        assert path.exists()

    def test_permission_error_becomes_scraper_excel_error(self, tmp_path):
        wb = MagicMock()
        wb.save.side_effect = PermissionError("locked")
        path = tmp_path / "out.xlsx"
        with pytest.raises(ScraperExcelError, match="open in Excel"):
            save_xlsx_safely(wb, str(path))


class TestRunScraper:
    def test_zero_on_success(self, monkeypatch):
        monkeypatch.setattr("scraper_common.chrome_preflight", lambda: "/fake/chrome")
        rc = run_scraper("test", lambda args: None, ["--no-preflight"])
        assert rc == 0

    def test_auth_error_returns_1(self):
        def raises_auth(args):
            raise ScraperAuthError("bad creds")
        rc = run_scraper("test", raises_auth, ["--no-preflight"])
        assert rc == 1

    def test_browser_error_returns_3(self):
        def raises_browser(args):
            raise ScraperBrowserError("no chrome")
        rc = run_scraper("test", raises_browser, ["--no-preflight"])
        assert rc == 3

    def test_excel_error_returns_4(self):
        def raises_excel(args):
            raise ScraperExcelError("locked")
        rc = run_scraper("test", raises_excel, ["--no-preflight"])
        assert rc == 4

    def test_unexpected_exception_returns_2(self):
        def raises_unknown(args):
            raise RuntimeError("???")
        rc = run_scraper("test", raises_unknown, ["--no-preflight"])
        assert rc == 2


class TestBuildArgParser:
    def test_default_flags_present(self):
        p = build_arg_parser("x")
        ns = p.parse_args([])
        assert ns.dry_run is False
        assert ns.verbose is False
        assert ns.no_preflight is False

    def test_dry_run_flag(self):
        p = build_arg_parser("x")
        ns = p.parse_args(["--dry-run"])
        assert ns.dry_run is True
