# Hardening Pass CHANGELOG

> One entry per atomic change. Most recent at the top.
> Format: date · scope · what · why · rollback-source.
> Backups of originals live in `hardening-backups/before/` (kept flat with dotted paths, e.g. `js.chat.js`).

## 2026-04-20

- **odds** · Added daily budget cap (`--budget-cap`, default 1000), persistent `odds_api_state.json`, OddsAPIAuthError on 401, OddsAPIBudgetExceeded on 429, retry on 5xx + network errors, `--dry-run` and `--verbose` flags in `refresh_game_odds.py`. · Caps blast radius if cron loops or auth is misconfigured against the paid plan. · rollback: `hardening-backups/before/refresh_game_odds.py`.
- **scrapers** · Added `scraper_common.py` (Chrome preflight, structured ScraperError subclasses, `with_retry` decorator, `save_xlsx_safely`, `run_scraper` runner with deterministic exit codes 1=auth/2=scrape/3=browser/4=excel). Routed `refresh_locks25.py` and `refresh_bovada.py` through it; both gain `--dry-run`, `--verbose`, `--no-preflight` flags and lazy credential validation. · Replaces cryptic Selenium tracebacks; lets server.py distinguish failure modes. · rollback: `hardening-backups/before/refresh_locks25.py`, `refresh_bovada.py`; delete `scraper_common.py`.
- **server** · Added `_excel_error_payload()`, `_preflight()`, `_pick_port()` (env override + free-port scan 5001–5005). `/api/bets` and `/api/open-bets` now return structured error codes (XLSX_LOCKED / XLSX_MISSING / XLSX_ERROR). · Surfaces the most common failures to the dashboard instead of 500s. · rollback: `hardening-backups/before/server.py`.
- **chat** · Rewrote `js/chat.js`: BT_CLAUDE_MODEL=Haiku 4.5, daily 30-call cap, persistent LRU cache (FNV-1a hash key), local-first dispatch (handleConversation + analyzeQuery before askClaude). Added `btChatDiagnostics()` and Node module export guard. Settings copy in `betting-tracker.html` updated to mention Haiku/30-cap. ADR-006 documents the change. · ~85% fewer API calls + 5× cheaper per call. · rollback: `hardening-backups/before/js.chat.js`.
- **deps** · Pinned `requirements.txt` (Flask 3.0.3, openpyxl 3.1.5, selenium 4.25.0, etc.) and `requirements-dev.txt` (pytest 8.3.3). Added `.env.example`. · Reproducible installs. · rollback: delete the files.
- **cleanup** · Moved 6 dead artefacts into `hardening-backups/before/dead/`: `betting-tracker.html.bak`, `betting-tracker.html.bak2`, `Betting_Tracker.xlsx.bak.nfl_import`, `test_changes.html`, `test_changes.js`, `odds_history_test.json` · Frees ~620 KB, removes confusion for future sessions. · rollback: move files back to the project root.
- **docs** · Added `docs/agent/AUDIT.md` with pipeline map, Claude call-site classification, dead-code list, assumption inventory. · Hardening queue ordering depends on it. · rollback: delete the file.
- **env** · Expanded `.gitignore` to cover pytest, venv, `.bak*`, `.vscode/`, etc. · Makes future `git init` clean. · rollback: `hardening-backups/before/.gitignore` (original was 4 lines).
- **docs** · Added `docs/agent/HARDENING-INVENTORY.md` · Phase 1 output of the pre-Max-downgrade hardening pass. · rollback: delete the file.
- **docs** · Added `docs/agent/CHANGELOG.md` · This file. Records every change in the pass for reversibility. · rollback: delete the file.
