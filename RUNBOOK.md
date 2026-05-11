# Betting Tracker — Runbook

> **Purpose:** operational reference for running, fixing, and extending the tracker **without** a Claude assistant. Written for Thomas.
> **Audience:** you, six months from now, at 11pm with a broken scraper.
> **Last updated:** 2026-04-20 (Hardening Pass)

---

## 0. The 30-second version

1. `python3 server.py` — local API on `http://localhost:5001`.
2. Open `betting-tracker.html` in Chrome.
3. Scrapers & odds refresh: buttons in the dashboard, or the commands in §4.
4. If anything breaks: §6 Troubleshooting, then `docs/agent/DEBUG.md`.

---

## 1. Daily routine

| When | What | How |
|---|---|---|
| Morning | Scrape settled bets | Dashboard → "Refresh Locks25" / "Refresh Bovada" |
| Morning | Pull closing-line odds | Dashboard → "Refresh CLV Odds" (caps at 1000 Odds API credits/day) |
| Anytime | Log new bet | Paste slip into chat widget, or type `Lakers -4.5 (-110) $50` |
| Anytime | Update result | Edit row in `Betting_Tracker.xlsx` → refresh dashboard |
| Weekly | Check health | `python3 -m pytest tests/ -q` — 76 passing (119 total across all suites) |

---

## 2. First-time setup (fresh machine)

```bash
# 1. Clone / copy the folder
cd "/Users/thomasnendick/Documents/Claude/Projects/Betting Tracker/Betting Tracker"

# 2. Python deps (pinned in requirements.txt)
python3 -m pip install -r requirements.txt

# 3. Dev deps (pytest) — optional but strongly recommended
python3 -m pip install -r requirements-dev.txt

# 4. Fill in .env (copy from .env.example first)
cp .env.example .env
open .env  # paste your Locks25 + Bovada creds + Odds API key

# 5. Start the server (port 5001)
python3 server.py
```

**Estimated time:** ~5 minutes.

---

## 3. Starting the server

```bash
cd "/Users/thomasnendick/Documents/Claude/Projects/Betting Tracker/Betting Tracker"
python3 server.py
```

**Expected time:** <2 seconds to first log line.
**Success signal:** `* Running on http://127.0.0.1:5001`.
**Leave it running** in its own terminal tab — do NOT close it while using the dashboard.

---

## 4. Running the scrapers & odds refresh

All scrapers support `--dry-run`, `--verbose`, and return **deterministic exit codes** (see §5). Run from the project root.

```bash
cd "/Users/thomasnendick/Documents/Claude/Projects/Betting Tracker/Betting Tracker"

# Locks25 — settled & open bets
python3 refresh_locks25.py
# Expected time: 30–60s. Opens Chrome, logs in, scrapes Bet History.

# Bovada — same thing for Bovada
python3 refresh_bovada.py
# Expected time: 30–60s.

# Game odds (CLV) — The Odds API, $30/mo plan
python3 refresh_game_odds.py
# Expected time: 10–30s. Hard capped at 1000 credits/day; will refuse further calls.

# Preview mode — no writes, no credits burned
python3 refresh_game_odds.py --dry-run --verbose
```

---

## 5. Exit codes — what the scraper told you

Every scraper + `refresh_game_odds.py` returns one of:

| Code | Meaning | First thing to check |
|---|---|---|
| 0 | Success | — |
| 1 | Auth failure (bad creds, expired key) | `.env` values; sportsbook password change |
| 2 | Scrape failure (timeout, DOM change) | Site layout changed? Run `--verbose` |
| 3 | Browser / Chrome not found | `chrome_preflight` can't find Chrome — set `CHROME_BINARY=/path/to/chrome` in `.env` |
| 4 | Excel file locked (you have it open) | Close `Betting_Tracker.xlsx` in Excel |
| 5 | Odds API budget cap hit | Wait until midnight OR raise `--budget-cap` (default 1000/day) |

**Check last exit code:** `echo $?` right after a run.

---

## 6. Troubleshooting — fastest paths

### Dashboard loads but shows no bets
1. Is the server running? `curl -s http://localhost:5001/api/status`
   Expected: `{"ok":true,...}`
2. If `503` with code `XLSX_MISSING`: file moved. Check `Betting_Tracker.xlsx` is at project root.
3. If `503` with code `XLSX_LOCKED`: close Excel.
4. Otherwise: `docs/agent/DEBUG.md` → "Dashboard shows stale / wrong data".

### Scraper hangs forever
- Kill with `Ctrl-C`. Retry with `--verbose`.
- Chrome headless sometimes wedges; close all Chrome windows, retry.
- If repeated, check sportsbook reachability: `curl -I https://locks25.ag/`

### Chat widget says "Daily cap reached"
- You hit 30 Claude calls today. Local analyzer still works — ask `record on NBA?`, `biggest win?`, etc.
- Resets at midnight local time.
- To check: DevTools console → `btChatDiagnostics()` returns budget state.

### Chat says "Claude API key is invalid"
- Key expired or revoked. Update in dashboard Settings.
- You can continue without a key — local analyzer covers most questions.

### Odds refresh says "budget cap exceeded"
- Normal safety behaviour. Default cap is 1000/day to protect the $30/mo plan.
- Override once: `python3 refresh_game_odds.py --budget-cap 2000`.
- State lives in `odds_api_state.json` (gitignored). Delete it to reset.

### Tests fail after a code change
```bash
cd "/Users/thomasnendick/Documents/Claude/Projects/Betting Tracker/Betting Tracker"
python3 -m pytest tests/ -v --basetemp=/tmp/btpytest    # 76 pytest tests
node tests/test_chat_dispatch.js                          # 21 static Node tests
node tests/test_status_panel.js                           #  9 status-panel tests
# jsdom integration — requires one-time `npm install --prefix tests` for jsdom:
NODE_PATH=tests/node_modules node tests/test_chat_dispatch_jsdom.js  # 13 tests
```
**Expected time:** <1 second total. **119 tests** should pass.

---

## 7. Swapping Claude tiers (chat widget)

The chat widget defaults to Haiku 4.5 (cheapest). If quality degrades and you have budget to spend, edit **one line** in `js/chat.js`:

```js
// Line 12 of js/chat.js — swap this value:
var BT_CLAUDE_MODEL = 'claude-haiku-4-5-20251001';   // default (~$0.80 / 1M in)
// var BT_CLAUDE_MODEL = 'claude-sonnet-4-20250514'; // ~5× cost
// var BT_CLAUDE_MODEL = 'claude-opus-4-1-20250805'; // ~15× cost
```

Hard-reload the dashboard (Cmd-Shift-R). Daily cap (`BT_CLAUDE_DAILY_CAP`, default 30) is enforced regardless of tier.

---

## 8. Data hygiene

**Excel is the source of truth.** Three rules:

1. Never delete rows — append or update `Status` / `P/L` in place.
2. Close Excel before running scrapers (locked file → exit code 4).
3. Backups live in `hardening-backups/before/` — safe to prune if >6 months old.

**Data file layout** (see `docs/agent/reference/data-models.md` for the full schema):

- `Betting_Tracker.xlsx` — two sheets: `Bet History` (settled, data starts row 4) and `Open Bets`.
- `closing_lines.json` — per-event CLV data, keyed by event ID.
- `upcoming_games_cache.json` — ESPN schedule (refreshed by cron at 02:30).
- `odds_api_state.json` — today's Odds API credit usage (rolling 90-day window).

---

## 9. What was hardened in the 2026-04-20 pass

Short version so you remember what protections are in place:

- **Chat widget:** default Haiku 4.5, 30 calls/day cap, persistent localStorage cache (50-entry LRU), local-first dispatch so `hi` / `record?` / `biggest win?` never hit the API.
- **Scrapers:** shared `scraper_common.py`, structured exceptions, exit codes, retry w/ backoff, Chrome preflight, `--dry-run`.
- **Odds API:** hard daily budget cap (1000 credits), persisted state, refuses further calls past cap.
- **Server:** real `FileNotFoundError` / `PermissionError` surfacing as `XLSX_MISSING` / `XLSX_LOCKED` error codes (was silently returning empty).
- **Tests:** 82 total (61 pytest + 21 Node). Run them before trusting a change.
- **Deps:** pinned in `requirements.txt` / `requirements-dev.txt`.

Full history: `docs/agent/decisions/adr-log.md` ADR-001 → ADR-007 and `docs/agent/CHANGELOG.md`.

---

## 10. Where to look when in doubt

| Question | File |
|---|---|
| How is data shaped? | `docs/agent/reference/data-models.md` |
| What does endpoint X do? | `docs/agent/reference/api-schema.md` |
| Why did we choose library Y? | `docs/agent/decisions/adr-log.md` |
| Known bugs / workarounds | `docs/agent/DEBUG.md` |
| How do I deploy / cron? | `docs/agent/DEPLOY.md` |
| High-level architecture | `docs/agent/ARCH.md` |
| Quick orientation (new session) | `docs/agent/QUICKSTART.md` |

---

## 11. "I can't figure this out" escape hatch

Before you spend money on Claude:

1. Search this repo for the error string.
2. Check `docs/agent/DEBUG.md`.
3. Run the test suite — it covers most error paths:
   ```bash
   python3 -m pytest tests/ -v --basetemp=/tmp/btpytest
   node tests/test_chat_dispatch.js
   node tests/test_status_panel.js
   NODE_PATH=tests/node_modules node tests/test_chat_dispatch_jsdom.js
   ```
4. Check `docs/agent/CHANGELOG.md` for recent changes.
5. If truly stuck and have budget: `POST-MAX-PLAYBOOK.md` §3 covers when to spend a Claude call and how to prompt efficiently.
