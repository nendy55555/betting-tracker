"""
scraper_common.py
─────────────────
Shared utilities for refresh_locks25.py and refresh_bovada.py.

Provides:
  - Structured error classes with exit codes (server.py distinguishes failure modes)
  - Chrome preflight check (avoids cryptic WebDriverException)
  - Retry/backoff decorator for transient Selenium errors
  - --dry-run / --verbose / --no-preflight CLI flags
  - Safe xlsx save (clear error when file is open in Excel)
  - run_scraper() runner that maps exceptions to exit codes

Exit codes (used by server.py subprocess handler):
  0 — success
  1 — auth failure (credentials missing or rejected)
  2 — scrape failure (DOM change, timeout)
  3 — browser failure (Chrome missing, driver init failed)
  4 — excel write failure (file locked, permission denied)
130 — interrupted (Ctrl-C)
"""

import argparse
import functools
import logging
import os
import shutil
import sys
import time

from selenium.common.exceptions import (
    ElementClickInterceptedException,
    NoSuchElementException,
    StaleElementReferenceException,
    TimeoutException,
    WebDriverException,
)


# ─────────────────────────────────────────────────────────────────────────────
# ERROR CLASSES
# ─────────────────────────────────────────────────────────────────────────────
class ScraperError(Exception):
    """Base class for scraper failures. exit_code drives the process exit status."""
    exit_code = 2


class ScraperBrowserError(ScraperError):
    """Chrome binary missing or webdriver init failed."""
    exit_code = 3


class ScraperAuthError(ScraperError):
    """Credentials missing from .env or login form rejected them."""
    exit_code = 1


class ScraperTimeoutError(ScraperError):
    """Page load or WebDriverWait timed out."""
    exit_code = 2


class ScraperDOMError(ScraperError):
    """Expected DOM element not found — likely site UI changed."""
    exit_code = 2


class ScraperExcelError(ScraperError):
    """Excel file locked, missing, or write failed."""
    exit_code = 4


# ─────────────────────────────────────────────────────────────────────────────
# CHROME PREFLIGHT
# ─────────────────────────────────────────────────────────────────────────────
_CHROME_CANDIDATES = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
]


def chrome_preflight():
    """
    Verify Chrome is installed before Selenium tries to launch it.
    Returns the resolved Chrome binary path, or raises ScraperBrowserError.
    Honors CHROME_BINARY env var as an override.
    """
    override = os.environ.get("CHROME_BINARY", "").strip()
    if override:
        if os.path.exists(override):
            return override
        raise ScraperBrowserError(
            f"CHROME_BINARY={override!r} does not exist. "
            f"Unset it or point it at a real Chrome binary."
        )

    for path in _CHROME_CANDIDATES:
        if os.path.exists(path):
            return path

    for name in ("google-chrome", "chromium", "chromium-browser", "chrome"):
        which = shutil.which(name)
        if which:
            return which

    raise ScraperBrowserError(
        "Chrome not found. Install from https://www.google.com/chrome/ "
        "or set CHROME_BINARY in .env to the full binary path."
    )


# ─────────────────────────────────────────────────────────────────────────────
# RETRY / BACKOFF
# ─────────────────────────────────────────────────────────────────────────────
_TRANSIENT = (
    TimeoutException,
    ElementClickInterceptedException,
    StaleElementReferenceException,
)


def with_retry(retries=3, base_delay=1.0, backoff=1.6, exceptions=None):
    """
    Decorator: retry a function on transient Selenium errors with exponential backoff.
    On final failure, re-raises the original error wrapped in ScraperTimeoutError.
    """
    if exceptions is None:
        exceptions = _TRANSIENT

    def decorator(fn):
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            last_err = None
            delay = base_delay
            for attempt in range(1, retries + 1):
                try:
                    return fn(*args, **kwargs)
                except exceptions as e:
                    last_err = e
                    logging.warning(
                        "%s attempt %d/%d failed: %s",
                        fn.__name__, attempt, retries, type(e).__name__,
                    )
                    if attempt < retries:
                        time.sleep(delay)
                        delay *= backoff
            raise ScraperTimeoutError(
                f"{fn.__name__} failed after {retries} attempts: {last_err}"
            ) from last_err
        return wrapper
    return decorator


# ─────────────────────────────────────────────────────────────────────────────
# CLI
# ─────────────────────────────────────────────────────────────────────────────
def build_arg_parser(description):
    """Standard CLI flags for both scrapers."""
    p = argparse.ArgumentParser(description=description)
    p.add_argument(
        "--dry-run", action="store_true",
        help="Run scrape but do not write to Excel.",
    )
    p.add_argument(
        "--verbose", "-v", action="store_true",
        help="Print DEBUG-level logging.",
    )
    p.add_argument(
        "--no-preflight", action="store_true",
        help="Skip Chrome preflight check (use only if the check misfires).",
    )
    return p


# ─────────────────────────────────────────────────────────────────────────────
# EXCEL SAVE
# ─────────────────────────────────────────────────────────────────────────────
def save_xlsx_safely(wb, path):
    """
    Save xlsx with a clear, actionable error if the file is locked
    (typically because Excel has it open).
    """
    if not os.path.exists(os.path.dirname(path)):
        raise ScraperExcelError(f"Output directory does not exist: {path}")
    try:
        wb.save(path)
    except PermissionError as e:
        raise ScraperExcelError(
            f"Cannot save {path}: file is open in Excel or permission denied. "
            f"Close the file in Excel and rerun. ({e})"
        ) from e
    except OSError as e:
        raise ScraperExcelError(
            f"Cannot save {path}: {e}"
        ) from e


# ─────────────────────────────────────────────────────────────────────────────
# RUNNER
# ─────────────────────────────────────────────────────────────────────────────
def run_scraper(name, main_fn, argv=None):
    """
    Standard entry point. Parses CLI, runs preflight, calls main_fn(args),
    and maps any ScraperError to its exit_code. Returns the exit code.

    main_fn signature: main_fn(args) -> None
    """
    parser = build_arg_parser(f"{name} scraper")
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format=f"[{name}] %(asctime)s %(levelname)s %(message)s",
        datefmt="%H:%M:%S",
    )

    try:
        if not args.no_preflight:
            chrome_path = chrome_preflight()
            logging.debug("Chrome binary: %s", chrome_path)

        main_fn(args)
        return 0

    except ScraperError as e:
        logging.error("%s: %s", type(e).__name__, e)
        return e.exit_code
    except KeyboardInterrupt:
        logging.error("Interrupted by user.")
        return 130
    except Exception as e:  # noqa: BLE001
        logging.exception("Unexpected error: %s", e)
        return 2


# ─────────────────────────────────────────────────────────────────────────────
# CREDENTIAL HELPER
# ─────────────────────────────────────────────────────────────────────────────
def require_env(*names):
    """
    Look up each env var. If any are missing or blank, raise ScraperAuthError
    with a single message listing all missing keys. Returns a tuple of values
    in the same order as the input names.
    """
    missing = [n for n in names if not os.environ.get(n, "").strip()]
    if missing:
        raise ScraperAuthError(
            f"Missing required .env values: {', '.join(missing)}. "
            f"Copy .env.example to .env and fill them in."
        )
    return tuple(os.environ[n] for n in names)
