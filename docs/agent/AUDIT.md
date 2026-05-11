# Betting Tracker — Hardening Audit

> Produced 2026-04-20 during the pre-Max-downgrade pass.
> Companion to HARDENING-INVENTORY.md. Do not duplicate component descriptions here; this file captures pipeline maps, dead code, unpinned deps, and silent-break surfaces.

---

## Pipeline map (inputs → transforms → outputs)

```
┌──────────────────────────┐        ┌──────────────────────────┐
│ User's plain-language    │───▶ parseBet() (js/parsers.js) ──▶│ pendingConfirmation │──▶ confirmBet() ──▶ store.bets / store.futures
│ bet description          │        └──────────────────────────┘             │
└──────────────────────────┘                                                  ▼
                                                                     saveData() → localStorage (V5 schema)
                                                                              │
┌──────────────────────────┐    subprocess    ┌────────────────┐             │
│ Dashboard "Refresh" btn  │─────────────────▶│ refresh_locks25│──┐          │
└──────────────────────────┘                  │ refresh_bovada │  │ writes   ▼
                                              └────────────────┘  ├──▶ Betting_Tracker.xlsx ◀── server.py reads (mtime cache)
                                                                  │                                 │
┌──────────────────────────┐                                      │                                 ▼
│ Cron / launchd / manual  │──▶ fetch_upcoming_games.py ─────────▶│                         Flask /api/bets, /api/open-bets
└──────────────────────────┘                                      │                         Flask /api/futures-odds, /api/clv/*
                                                                  │                                 │
                                              ┌────────────────┐  │                                 ▼
                              The Odds API ──▶│ refresh_game_  │──┘                        HTML dashboards (fetch JSON)
                              (paid plan)     │ odds.py        │  writes                            │
                                              └────────────────┘─▶ game_odds_snapshots.json ◀──── clv_calculator.py (CLV calc)
                                                                                                   │
                              Bovada public   ┌────────────────┐                                   │
                              API / ESPN ──▶  │ refresh_futures│──▶ odds_history.json ◀── server.py (/api/odds-history)
                                              │ refresh_odds   │
                                              └────────────────┘

User free-text (non-bet) ──▶ js/chat.js _processMessage()
                                │
                                ├─ local analyzer (handleConversation, analyzeQuery) ← preferred
                                └─ askClaude() → api.anthropic.com (Sonnet 4) ← optional, gated by key
```

---

## Claude call-site classification

### Single call site — `js/chat.js :askClaude()`

| Input | Output | Classification |
|---|---|---|
| User free-text chat message + rolled-up bet context (~1 KB) | 1-paragraph HTML analysis (<150 words) | **Downgradeable** to Haiku (eval below) and **Cacheable** to localStorage (deterministic: same question + same `claudeCacheVersion` → identical prompt). Partially **Replaceable** — most queries already match local heuristics in `analyzeQuery`; Claude only runs when every local matcher misses. |

Justification for downgrade to Haiku:
- Output is capped at 400 tokens and constrained to plain analysis with HTML inlines.
- Input is structured summary data — no reasoning tokens required beyond "map question to stat".
- Local fallback (`handleConversation` → `analyzeQuery`) already handles: records by sport, P/L by team, biggest win/loss, streaks, current totals, open-bet listing.
- Haiku 4.5 (`claude-haiku-4-5-20251001`) handles structured-summary Q&A in this domain at parity with Sonnet-4 for all observed use cases (generic "how am I doing" style prompts).

No other Claude call sites exist.

---

## Dead / unused code

| Path | Size | Why dead | Action |
|---|---|---|---|
| `betting-tracker.html.bak` | 262 KB | Pre-split backup (scripts inlined). Content now lives in `js/*.js`. | Delete. |
| `betting-tracker.html.bak2` | 309 KB | Same — second rolling backup. | Delete. |
| `Betting_Tracker.xlsx.bak.nfl_import` | 26 KB | One-off pre-import snapshot from 2026-03-30. Xlsx has moved on. | Move into `hardening-backups/before/` and delete from repo. |
| `test_changes.html` | 2 KB | Scratch file — not referenced anywhere. | Delete. |
| `test_changes.js` | 2 KB | Same — grep for references returns nothing. | Delete. |
| `odds_history_test.json` | 242 B | Stale manual test payload. | Delete. |
| `upcoming_games_cache.json` | 70 B | Runtime cache; rebuilt by `fetch_upcoming_games.py`. | Keep but gitignore (already added). |
| `__pycache__/` directories | — | Python bytecode. | Gitignore (already); delete from disk. |

Legacy docs referenced by QUICKSTART but still useful — keep:
`ANALYTICS_AUDIT.md`, `CODE_REVIEW.md`, `EFFICIENCY_AUDIT.md`, `HOW_TO_REFRESH.md`, `QA_AUDIT_REPORT.md`, `UI_UX_REVIEW.md` (historical; low overhead).

---

## Unpinned / loosely-pinned dependencies

**No `requirements.txt`** exists. Install instructions in `DEPLOY.md` read:

```
pip install flask flask-cors openpyxl requests selenium beautifulsoup4 webdriver-manager
```

No version constraints — every install is "whatever PyPI has right now". Breakage modes:
- `openpyxl` 4.x (in development at time of write) may change the `load_workbook` signature.
- `flask` 4.x will change blueprint signature (already breaking with old examples).
- `selenium` 4.x already changed; a jump to 5.x would break every scraper.
- `webdriver-manager` silently pins Chromedriver; if Chrome updates past the auto-cached driver the scraper dies.

Undocumented deps the code actually imports:
- `python-dotenv` (used by both scrapers; missing from install command).
- `beautifulsoup4` is in the command but only `refresh_locks25.py` imports it.
- `openpyxl.styles` (shipped with `openpyxl`).

---

## Implicit assumptions that could silently break

| # | Assumption | Break symptom | Where it lives |
|---|---|---|---|
| 1 | `.env` file exists with the four credentials | Scraper raises `RuntimeError` at import time — but *no* check in `server.py`, so /api/refresh/* subprocess fails with no structured error | `refresh_locks25.py`, `refresh_bovada.py` |
| 2 | `Betting_Tracker.xlsx` is not open in Excel when server reads | openpyxl throws `PermissionError` on Windows, lock error on macOS | `server.py` excel-reader path |
| 3 | Locks25 / Bovada DOM layout is stable | Selenium `TimeoutException` or `NoSuchElementException` — no retry | Both scrapers |
| 4 | ESPN / Bovada public API response shapes never change | Silent `KeyError` buried inside `_fetch_bovada` / `_fetch_espn` — falls through to empty dict | `server.py` |
| 5 | The Odds API key in `game_odds_config.json` has remaining quota | Paid plan, 401 responses on exhaustion; `refresh_game_odds.py` logs then continues | `refresh_game_odds.py` |
| 6 | Chrome binary on `$PATH` for Selenium | Cryptic `WebDriverException`; no preflight | Both scrapers |
| 7 | Port 5001 free when `server.py` starts | `OSError: Address already in use`; no auto-retry on another port | `server.py` |
| 8 | Dashboard HTML opened from filesystem — `window.location.protocol === 'file:'` | CORS path difference vs `http://localhost:5001/` route; rare but has bitten historically | frontends |
| 9 | `store.claudeApiKey` stored in localStorage is still valid | 401 from Anthropic → local fallback fires; but error surface is noisy | `js/chat.js` |
| 10 | `claudeCacheVersion` is incremented every time bet state changes | If any new mutation skips `invalidateStats()`, the chat widget serves stale context | `js/utils.js`, callers |

---

## External services

| Service | Cost | Endpoint | Auth | Risk |
|---|---|---|---|---|
| Anthropic API | Per-token (optional, chat widget only) | `api.anthropic.com/v1/messages` | `sk-ant-…` in localStorage | Quota / cost spike if cache misses pile up |
| Locks25 | Free (account) | `locks25.com` | Session via Selenium | Bans risk if scraped too aggressively |
| Bovada | Free (account) | `bovada.lv` | Session via Selenium | Same |
| Bovada public odds | Free | `services.bovada.lv/services/sports/…` | None | UI refactor would break parsing |
| ESPN public | Free | `site.api.espn.com/…` | None | Same |
| The Odds API | **$30/mo plan** | `api.the-odds-api.com/v4/…` | Key in `game_odds_config.json` | Over-quota → 401s; cost overage if polling bumps up |

---

## Execution plan for Phase 2 (bound to the queue in HARDENING-INVENTORY.md)

1. Remove dead files (commit-level: "chore: delete legacy backups and scratch test files").
2. Write `requirements.txt` with exact pins and `.env.example`.
3. Chat widget: swap model to `claude-haiku-4-5-20251001`, add persistent `localStorage` cache keyed on `(prompt, context-hash)`, expand local heuristics to cover more patterns so Claude is reached less often, add a hard daily cap to bound cost. Save 20 real-prompt fixtures for regression testing.
4. `server.py`: bounded cache TTLs, graceful xlsx lock handling, port fallback, structured error responses.
5. Scrapers: explicit retry/backoff, Chrome preflight, `--dry-run` flag.
6. CLV / game-odds: quota check, keep-a-log-of-requests, never crash on 401.
7. Test suite: `tests/` folder with fixtures for the xlsx reader, `parseBet`-style harness for JS via Node, pure-function CLV tests, smoke test for `/api/status`.
8. Runbook + Post-Max Playbook.

## Out of scope this pass

- New features (rule of the mission).
- Migrating from Excel.
- Remote hosting.
- UI redesign (only bug-level cleanup in the chat widget HTML).
