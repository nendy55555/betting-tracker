# Debugging Guide — Betting Tracker

Local reproduction procedures for the most common failure classes. Each section
names the symptom, the root cause, the fastest way to confirm it, and how to fix it.

---

## 1. "Bets disappeared after clicking Refresh Locks25 / Refresh Bovada"

**Root cause (fixed 2026-05):** `status-panel.js` used to overwrite `store.bets`
with settled-only data and wrote open bets to the nonexistent `store.openBets` field.
Now it calls `syncFromExcel()` instead.

**If this recurs, check:**

1. Open DevTools → Console tab, look for errors during the POST to
   `/api/refresh/locks25` or `/api/refresh/bovada`.
2. In the Console, run:
   ```js
   store.bets.filter(b => !b.settled).length   // should be > 0 if open bets exist
   store.futures.length                          // should be > 0 if futures exist
   ```
3. If both are 0 after a scraper refresh, `syncFromExcel()` failed silently.
   Run it manually: `syncFromExcel()` in the console and watch the Network tab.

**Recovery:** Settings panel → "Sync from Excel" button restores the full dataset.

---

## 2. "A bet auto-settled to the wrong result"

**Root cause (fixed 2026-05):** `findGameData()` in `live.js` searched all sports
simultaneously, so "Kansas" could match either the Chiefs (NFL) or the Jayhawks (NCAAMB)
depending on which ESPN endpoint responded first. Now each game is tagged with its sport
and only matched against bets of the same sport.

**If a wrong auto-settlement happens:**

1. Open the dashboard, find the affected bet in Open Bets.
2. Click Edit → reset Result to blank and Settled Date to blank → Save.
3. This writes the correction back to the Excel and re-syncs.
4. To understand what matched: in the Console run `espnGameData` and look for the
   team name from the bet's pick string. Check the `espnSport` field on the entry.

**To prevent future false matches:**
- Make sure the `sport` column in the Excel exactly matches one of: `NFL`, `NBA`,
  `NCAAMB`, `CBB`, `NCAAWB`, `MLS`, `Soccer`.
- Sports not on that list (MLB, NHL, etc.) are not covered by the ESPN scoreboard
  endpoints and will never auto-settle — that's intentional.

---

## 3. "Server won't start" / "Address already in use"

The server auto-tries ports 5001–5005. On macOS, AirPlay Receiver occupies 5001
by default (System Preferences → Sharing → AirPlay Receiver → off). On any OS,
another process may hold the port.

**Diagnosis:**

```bash
# macOS / Linux
lsof -i :5001

# Windows
netstat -ano | findstr :5001
```

**Fix options:**

```bash
# Option A — free the port
kill <PID from above>

# Option B — let the server find the next free port (already automatic)
python server.py      # will log the port it chose

# Option C — override the port directly
BETTING_TRACKER_PORT=5002 python server.py
```

The browser dashboard re-fetches the port automatically (via `user-context.js`
rewriting `localhost:5001/api/*` to a relative path) — so as long as the page is
served from the Flask server, the port shift is transparent.

---

## 4. "Excel file locked — close it in Excel and retry"

**Symptom:** Any mutation endpoint (`/api/bets/update`, `/api/settle-bet`,
`/api/refresh/*`) returns `{"code": "XLSX_LOCKED"}`.

**Cause:** The `.xlsx` file is open in Excel (or a hung Excel process holds it).

**Fix:**
1. Close the file in Excel.
2. If Excel is not open, check for a zombie process: Task Manager (Windows) or
   `ps aux | grep Excel` (macOS).
3. Kill the process, then retry.
4. As a last resort, openpyxl may have left a temp file. Look for `~$Betting_Tracker_<user>.xlsx` in the same directory and delete it.

---

## 5. "Scraper failed — what do the exit codes mean?"

Scraper scripts (`refresh_locks25.py`, `refresh_bovada.py`, `refresh_game_odds.py`)
return structured exit codes. The server logs these at WARNING level and returns them
in the `status` field of the scraper response.

| Code | Meaning | Action |
|------|---------|--------|
| 0    | Success | — |
| 1    | Auth failure (wrong credentials) | Check `.env` credentials |
| 2    | Scrape failed (site changed, captcha, timeout) | Run script manually to see full traceback |
| 3    | Browser failed to launch (Chrome not found, webdriver issue) | `pip install --upgrade webdriver-manager` |
| 4    | Excel file locked during write | Close the file in Excel |
| 5    | Daily API budget exhausted | Wait until midnight ET; check `/api/budget` |

**Run a scraper manually to see the full error:**

```bash
# Activate the virtualenv first
source .venv/bin/activate          # macOS / Linux
.\.venv\Scripts\Activate.ps1       # Windows PowerShell

python refresh_locks25.py
python refresh_bovada.py
python refresh_game_odds.py --help
```

The server's structured log (`python server.py` terminal output) also shows
the last 500 chars of stderr for any non-zero exit.

---

## 6. "Stats look wrong / P&L is off"

**Common causes:**

| Symptom | Likely cause |
|---------|-------------|
| Team leaderboard shows $0 for everyone | Was a `winLoss` mapping bug (fixed 2026-05); if it recurs, check `mapServerBet` in `sync.js` |
| Total P&L looks right but history chart is off | `settledDate` may be the import timestamp, not the game date — see `js/data.js` patch logic |
| Futures P&L doesn't match | Futures use a separate `store.futures` array; check `isFutureBet()` in `sync.js` |

**Quick stats audit via console:**

```js
// Count bets by result
store.bets.reduce((acc, b) => { acc[b.result || 'open'] = (acc[b.result||'open']||0)+1; return acc; }, {})

// Sum settled P&L manually
store.bets.filter(b=>b.settled).reduce((s,b)=>
  s + (b.result==='W' ? (b.toWin||0) : b.result==='L' ? -(b.stake||0) : 0), 0)

// Check for bets missing a txId (these can cause dedup failures)
store.bets.filter(b => !b.txId).length
```

---

## 7. "The server is running but the page shows it as offline"

The status panel polls `/api/status` every 30 seconds. The `user-context.js`
shim rewrites `http://localhost:5001/api/*` to a relative path, so:

- If the page is served from GitHub Pages (`bets.thomasnendick.com`), relative
  `/api/*` calls go to the GitHub Pages origin — which has no Flask server.
  **The server must be running locally for data endpoints to work.**
- If the page is served from Flask (`http://localhost:PORT`), relative paths work.

**Verify which origin the page is on:**

```js
window.location.origin   // should be http://localhost:5001 (or 5002, etc.)
```

If it shows `https://bets.thomasnendick.com`, open `http://localhost:5001` instead.

---

## 8. "localStorage is corrupt / bets are duplicated"

**Diagnosis:**

```js
// How many bets are in localStorage?
JSON.parse(localStorage.getItem('bt_bets') || '[]').length

// Look for duplicates by txId
var ids = JSON.parse(localStorage.getItem('bt_bets')||'[]').map(b=>b.txId);
ids.filter((id,i) => ids.indexOf(id) !== i)   // non-empty = duplicates exist
```

**Fix (wipes localStorage and re-syncs from Excel):**

1. Settings panel → "Sync from Excel" — this re-reads the authoritative source
   and deduplicates via txId.
2. If the above doesn't work: in DevTools Console:
   ```js
   localStorage.removeItem('bt_bets');
   localStorage.removeItem('bt_futures');
   location.reload();
   ```
   Then sync from Excel again.

**Nuclear option** (loses ESPN enrichment and chat history):

```js
localStorage.clear(); location.reload();
```

---

## 9. Using `/api/health` for startup verification

```bash
curl http://localhost:5001/api/health | python -m json.tool
```

Returns `{"ok": true, "checks": {"Thomas": {"ok": true, ...}, ...}}` if all xlsx
files are readable. Returns HTTP 503 with per-user error messages if any are
missing or locked. Run this if the dashboard is behaving strangely after a fresh
`python server.py`.

---

## 10. Reading the server log

With structured logging enabled, the server terminal shows:

```
10:31:05 [INFO] GET /api/status → 200 [user=Thomas 3ms]
10:31:12 [WARNING] refresh_locks25 exited 1 (auth): <last 500 chars of stderr>
10:31:12 [INFO] POST /api/refresh/locks25 → 200 [user=Thomas 4823ms]
```

- `WARNING` lines are actionable — they indicate scraper failures, bad date
  strings, or files that couldn't be written.
- `ERROR` lines indicate Excel read failures — check the xlsx path and permissions.
- `INFO` lines with long elapsed times (>5000ms) during scraper POSTs are normal
  — the scraper itself runs for 60-120s inside a subprocess.

To increase log verbosity temporarily:

```python
# At the top of server.py, change:
logging.basicConfig(level=logging.DEBUG, ...)
```
