# Betting Tracker — Quickstart

> **Read this first, every session.** It is the only file loaded automatically.
> All other context is on-demand — use the routing table below.

---

## What this project is

A personal sports bet tracker. Thomas describes bets in plain language via chat; Claude handles data entry, result updates, and dashboard maintenance. The stack is a single-file HTML dashboard (`betting-tracker.html`) that talks to a local Python Flask server (`server.py`) which reads/writes `Betting_Tracker.xlsx`.

**Stack:** Vanilla HTML/JS + Chart.js (frontend) · Python Flask (API server, port 5001) · openpyxl (Excel read/write) · Selenium (sportsbook scrapers)
**Live URL:** `betting-tracker.html` opened from the filesystem — server must be running at `http://localhost:5001`

---

## Critical rules — apply to every task

- **Never delete or overwrite historical records.** Only append bets or update `result`/`settled` status on existing rows.
- **All env vars are in `reference/env-vars.md`.** Credentials are hardcoded in the scraper scripts — do not move them without flagging it.
- **Confirm bet details before writing to the Excel.** Parse the input, echo back what you understood, then write. Never guess at ambiguous fields.
- **If a bet result isn't given, leave status as pending.** Do not assume outcomes.
- **After any data write, confirm count and P&L in chat.** Show a brief summary — don't just silently update the file.

---

## Task routing

| I need to... | Read first | Read also if... |
|---|---|---|
| Add a new bet or update a result | `docs/agent/ARCH.md` | Excel schema → `reference/data-models.md` |
| Debug a server or scraper error | `docs/agent/DEBUG.md` | Env / credentials → `reference/env-vars.md` |
| Change how data flows or add a feature | `docs/agent/ARCH.md` | API shape → `reference/api-schema.md` |
| Touch any frontend function in the HTML | `reference/html-function-index.md` | Find the exact line range, then targeted read |
| Run or trigger the scrapers | `docs/agent/DEPLOY.md` | — |
| Add/change an API endpoint in server.py | `reference/api-schema.md` | `docs/agent/ARCH.md` |
| Understand the Excel schema | `reference/data-models.md` | — |
| Review prior decisions (libraries, patterns) | `docs/agent/DECISIONS.md` | Full history → `decisions/adr-log.md` |

---

## Project structure

```
Betting Tracker/
  betting-tracker.html      # PRIMARY ENTRY — single-file dashboard (open in browser)
  clv-tracker.html          # CLV (closing line value) tool — linked from header
  recap-report.html         # Session recap generator — linked from header
  archive/                  # Consolidated 2026-05-10 — old standalone pages, not in use
    index.html              #   former iframe shell
    analytics-dashboard.html
    bet-entry.html
    bet-detail.html
    parlay-ev-calc.html
  server.py                 # Flask API server — run once, leave running
  Betting_Tracker.xlsx      # Source-of-truth data store (2 sheets)
  refresh_locks25.py        # Selenium scraper — Locks25 sportsbook
  refresh_bovada.py         # Selenium scraper — Bovada sportsbook
  fetch_upcoming_games.py   # ESPN upcoming games fetcher (runs at 2:30 AM)
  upcoming_games_cache.json # Upcoming games cache (< 4 hours = fresh)
  odds_history.json         # Daily futures odds snapshots for line movement (90-day window)
  closing_lines.json        # CLV closing line data per event ID (opening + closing + Pinnacle)
  game_odds_snapshots.json  # Active game odds snapshots (rolling 7-day window)
  game_odds_config.json     # CLV pipeline config (API key, poll interval, active sports)
  refresh_game_odds.py      # Game-level odds snapshot collector (The Odds API, $30/mo plan)
  clv_calculator.py         # No-vig CLV calculation engine + bet matching
  parse_bovada_paste.py     # Manual paste parser (one-off util)
  docs/agent/               # This documentation set — for Claude
```

---

## Current state

```
Last updated:     2026-03-30
Last deployment:  Local only — no remote hosting
In-flight work:   None
Known issues:     Hardcoded credentials in scraper scripts (refresh_locks25.py, refresh_bovada.py)
Next priority:    Confirm with Thomas what to work on
```

---

## Debug-first signals

**Where errors surface first:**
- Browser console: yes — check Network tab for failed `/api/*` calls; 500s mean server-side error
- Server logs: terminal running `python server.py` — errors print there
- No remote logging — everything is local

**Most common failure patterns:**
- Server not running → dashboard shows all zeros / empty panels; fix: `python server.py`
- Excel file locked (open in Excel while server reads it) → openpyxl raises a file lock error
- Scraper fails → Selenium can't find Chrome driver, or sportsbook UI changed; check DEBUG.md

---

## What not to do

- Do not read the entire HTML file to orient — it's 3,000+ lines; use the routing table
- Do not guess at bet field values — always confirm with Thomas before writing
- Do not run scrapers without knowing the sportsbook credentials are current (see `reference/env-vars.md`)
- Do not add new Python dependencies without updating `reference/env-vars.md` and `DECISIONS.md`
