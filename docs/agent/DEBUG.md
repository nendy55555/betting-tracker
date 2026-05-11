# Debugging guide

> Read this before touching any code when diagnosing an issue.

---

## Step 1 — Gather before guessing

### Get the full error

```bash
# Server logs — check the terminal running server.py
# All Flask errors and scraper stderr print here

# Health check
curl http://localhost:5001/api/status

# Check if server is running at all
curl http://localhost:5001/api/status 2>&1 | head -5
```

**Browser checklist for frontend issues:**
1. DevTools → Console: note error message, file, line
2. DevTools → Network: find the failing `/api/*` request
3. Note: status code, request payload, response body
4. A 500 from any `/api/` route means server-side error — check the terminal

---

## Step 2 — Map the error to a layer

| Error type | Likely layer | Where to look first |
|---|---|---|
| Dashboard shows all zeros / empty | Server not running | Run `python server.py`; verify port 5001 |
| Dashboard shows stale data after refresh | Excel cache not invalidated | Check `_invalidate_xlsx_cache()` was called |
| 500 from `/api/refresh/*` | Scraper crashed | Terminal logs — look for `stderr:` output |
| Scraper hangs / timeout | Selenium can't find element | Sportsbook UI may have changed |
| Scraper auth fails | Bad credentials | `reference/env-vars.md` |
| Excel read error | File locked or open in Excel app | Close Excel, retry |
| Odds always show "none" | Bovada API path changed | Check `BOVADA_FUTURES` dict in server.py |
| Works in terminal, fails in dashboard | CORS issue | Verify `CORS(app)` is present in server.py |
| Date parsing wrong | Bet date format changed | Check `parse_date_str()` and `format_game_time()` |

---

## Step 3 — Known failure patterns

### Pattern: Year captured as odds (-2026)
**Symptom:** Bet odds shows `-2026` or similar year value; stake/toWin calculations look wrong
**Root cause:** The locks25/BetOnline bet slip parser captures the year from date brackets like `[Mar-22-2026 08:11 PM]` as the odds field
**Fix:** Strip `[...]` brackets from the entire block before running odds extraction. Also strip brackets from individual lines before pick-extraction strategies.
**Check first:** `parse_bovada_paste.py` and any bet-slip parsing code — look for regex that extracts `[+-]\d+` odds

---

### Pattern: Excel file lock error
**Symptom:** `PermissionError` or `zipfile.BadZipFile` in server terminal when reading/writing Excel
**Root cause:** `Betting_Tracker.xlsx` is open in Microsoft Excel at the same time
**Fix:** Close the file in Excel, then retry. The server's mtime cache will auto-recover on next request.
**Check first:** Is Betting_Tracker.xlsx open in another application?

---

### Pattern: Selenium ChromeDriver mismatch
**Symptom:** `SessionNotCreatedException` or `This version of ChromeDriver only supports Chrome version X`
**Root cause:** Chrome browser auto-updated but webdriver-manager cached an older driver
**Fix:** `pip install --upgrade webdriver-manager` or clear the WDM cache at `~/.wdm/`
**Check first:** Run `google-chrome --version` and compare to the driver version in the error

---

### Pattern: Scraper timeout — sportsbook UI change
**Symptom:** Scraper hangs for 60+ seconds, then times out; no bets written to Excel
**Root cause:** A CSS selector or element ID in the Selenium script no longer matches the sportsbook's current HTML
**Fix:** Inspect the current sportsbook page manually, find the new selector, update the script
**Check first:** Run the scraper manually in non-headless mode to see the browser state

---

### Pattern: Dashboard loads but shows wrong P&L
**Symptom:** Stats panel shows unexpected totals
**Root cause:** Usually a `win_loss` value in Excel is missing or has wrong sign (positive for losses, negative for wins)
**Fix:** Check row in "Bet History" sheet — `win_loss` should be positive for wins, negative for losses
**Check first:** `GET /api/bets` and look at `winLoss` field for the suspicious bet

---

## Step 4 — Confirm before fixing

Before writing any code, state:
1. The specific file and line where the bug lives
2. Why this is the root cause
3. What the fix changes
4. What manual check confirms it works

---

## Debugging by area

### Dashboard / frontend
- Open `betting-tracker.html` directly in browser
- Network tab: verify `/api/bets` and `/api/open-bets` return 200 with data
- Console: look for JS errors after data loads
- If data looks wrong: the issue is probably in server.py's data transformation, not the HTML

### Server (server.py)
```bash
python server.py        # start fresh; watch for startup errors
curl http://localhost:5001/api/status   # verify running
curl http://localhost:5001/api/bets     # check settled bets data
curl http://localhost:5001/api/open-bets  # check open bets data
```

### Scrapers
```bash
# Run manually with output visible
python refresh_locks25.py
python refresh_bovada.py
```
- If Selenium fails to start: check Chrome/driver version (see ChromeDriver pattern above)
- If login fails: verify credentials in `reference/env-vars.md`
- If data looks wrong: print parsed rows before the Excel write step

### Excel data
- Open `Betting_Tracker.xlsx` directly to inspect raw values
- "Bet History" data starts at row 4
- "Open Bets" data starts at row 4
- Check column order matches `reference/data-models.md`

---

## What not to do when debugging

- Do not make multiple changes at once — one hypothesis, one fix, one test
- Do not assume the issue is in the HTML — check the API response first
- Do not modify the Excel file manually while the server is running — invalidate the cache after any manual edit
