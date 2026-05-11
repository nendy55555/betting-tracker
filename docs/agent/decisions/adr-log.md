# Architecture Decision Records

> Full history of significant decisions. Active constraints summary is in `DECISIONS.md`.

---

## ADR-001 — Excel as data store

**Date:** Project start (pre-2026)
**Status:** Active

**Problem:** Need to persist bet history. Thomas wants to view and edit the data directly outside the app.

**Options considered:**
- SQLite database
- JSON file
- Excel spreadsheet

**Decision:** Excel (`.xlsx` via openpyxl). Thomas views and edits the file directly in Excel. A database would be opaque. JSON lacks the columnar view.

**Consequences:** Server must use openpyxl. File locking is possible when Excel has the file open. No SQL queries — all filtering is done in Python after reading rows.

---

## ADR-002 — Single-file HTML dashboard

**Date:** Project start (pre-2026)
**Status:** Active

**Problem:** Need a dashboard UI with no deployment overhead.

**Options considered:**
- React/Next.js app
- Vanilla HTML + JS single file
- Jupyter notebook

**Decision:** Single vanilla HTML file. Opens directly in browser with no build step. No npm, no server for the frontend.

**Consequences:** All JS in one file. Chart.js loaded from CDN. No TypeScript. Code can get large — currently 3,000+ lines. Must not introduce build-step dependencies.

---

## ADR-003 — Flask local server as data bridge

**Date:** ~early 2026
**Status:** Active

**Problem:** The original dashboard used `localStorage` for state (V5 schema). This broke import workflows and made Claude's data entry unreliable. Needed a persistent, file-backed data store.

**Options considered:**
- Keep localStorage, add export/import
- Use a local SQLite database with a REST API
- Use Excel + Flask server

**Decision:** Flask server reading Excel. Excel satisfies ADR-001. Flask is lightweight, no deployment needed.

**Consequences:** Server must be running for the dashboard to work. Added `server.py`. Retired the localStorage V5 schema.

---

## ADR-004 — Selenium for sportsbook scraping

**Date:** ~early 2026
**Status:** Active

**Problem:** Need to pull bet data from Locks25 and Bovada. Neither offers a public API.

**Options considered:**
- Manual data entry (Thomas pastes slips)
- HTTP scraping with requests/BeautifulSoup
- Selenium headless browser

**Decision:** Selenium. Both sportsbooks require login and render content via JavaScript — HTTP scraping would miss most data.

**Consequences:** Chrome must be installed. `webdriver-manager` handles driver versioning. Scrapers are fragile to UI changes.

---

## ADR-005 — Bovada public API for futures odds

**Date:** ~early 2026
**Status:** Active

**Problem:** Dashboard needs championship futures odds for the Futures tab. No auth-required API previously existed.

**Options considered:**
- Manual entry
- ESPN API (free, no auth)
- Bovada public JSON API (free, no auth)

**Decision:** Bovada primary, ESPN fallback. Bovada's `/services/sports/event/v2/events/A/description/*` endpoints return clean American odds JSON with no authentication. ESPN is less reliable for odds data.

**Consequences:** 15-minute in-memory cache to limit external calls. Daily snapshot persisted to `odds_history.json` for line movement tracking.

---

## ADR-006 — Chat widget: Haiku default, local-first dispatch, daily cap

**Date:** 2026-04-20 (pre-Max-downgrade hardening pass)
**Status:** Active

**Problem:** The in-dashboard chat widget was the only runtime Claude call site. Default model was `claude-sonnet-4-20250514`, and every non-bet message went straight to Claude when the user had a key — local handlers were only consulted on API error. Post-Max, this kills the budget in days.

**Options considered:**
- Remove the Claude integration entirely. Ships a simpler app but loses free-text Q&A.
- Keep Sonnet 4, add a daily cap and cache. Conservative; still expensive per call.
- Downgrade to Haiku 4.5, add a persistent cache, and flip dispatch order to local-first.

**Decision:** Haiku 4.5 (`claude-haiku-4-5-20251001`) + local-first. `handleConversation` and `analyzeQuery` run before `askClaude`; Claude is reached only when both return null. Daily cap of 30 calls/day is a hard cost ceiling. Persistent LRU cache in `localStorage` (key = FNV-1a hash of prompt + context). Model name is a single constant (`BT_CLAUDE_MODEL`) at the top of `js/chat.js` so switching tiers is a one-line edit.

**Consequences:**
- Expected API call volume drops ~85% (greetings, record/team/sport questions now local).
- Per-call cost drops ~5x (Haiku vs. Sonnet 4).
- Quality risk: Haiku may be weaker on nuanced analysis. Mitigation: runbook documents how to bump to Sonnet 4 in one line if the user notices degradation.
- Cache key now includes context hash, so stale responses can't bleed across sessions with different bet states.
- 20 fixture prompts saved in `tests/fixtures/chat-prompts.json` for regression / tier-comparison.

**Rollback:** Restore `hardening-backups/before/js.chat.js`. The original behavior (Sonnet 4, no cap, no persistent cache, Claude-first) returns.

---

## ADR-007 — Scraper hardening + Odds API budget cap

**Date:** 2026-04-20 (pre-Max-downgrade hardening pass)
**Status:** Active

**Problem:** Two failure modes were silent or destructive:
1. Selenium scrapers (`refresh_locks25.py`, `refresh_bovada.py`) raised on import if .env was missing, caught generic exceptions in login, and crashed cryptically when Chrome wasn't installed. The Flask server had no way to distinguish auth failure from DOM breakage in subprocess output.
2. `refresh_game_odds.py` calls a paid endpoint ($30/mo, 20K credit plan). A misconfigured cron, infinite loop, or panicking caller could drain the plan in hours. Auth failures (401) were logged but not escalated.

**Options considered:**
- Leave as-is and rely on the user to read logs.
- Add a global try/except in each script.
- Extract a small shared module (`scraper_common.py`) with structured errors + decorators, plus a per-script budget for the paid API.

**Decision:** Build `scraper_common.py` with `ScraperError` subclasses (`ScraperAuthError`, `ScraperBrowserError`, `ScraperTimeoutError`, `ScraperDOMError`, `ScraperExcelError`), a Chrome preflight check, a `with_retry` decorator, a safe `save_xlsx_safely` helper, and a `run_scraper` runner that maps exceptions to deterministic exit codes (1=auth, 2=scrape, 3=browser, 4=excel). Both scrapers route their `__main__` through it.

For the paid Odds API: add `OddsAPIBudgetExceeded` and `OddsAPIAuthError`, persist daily usage to `odds_api_state.json`, and enforce a hard `--budget-cap` (default 1000/day) before each call. 401 responses fail fast; 429 responses raise a budget-exceeded halt.

**Consequences:**
- Server.py subprocess handlers can now switch on exit code instead of grep-ing stdout.
- A cron loop calling `refresh_game_odds.py` repeatedly can spend at most `--budget-cap` per UTC day. Default cap (1000) leaves ~30% headroom over normal use (~660/day on the 20K/mo plan).
- New `--dry-run` flag on all three scripts lets Thomas test scraper logic without touching the xlsx or burning credits.
- New persistent state file (`odds_api_state.json`) is gitignored.

**Rollback:** Restore `hardening-backups/before/refresh_locks25.py`, `refresh_bovada.py`, `refresh_game_odds.py`. Delete `scraper_common.py`. Original behavior (no preflight, no retry, no budget cap, RuntimeError on import) returns.
