# Deployment guide

> This project runs entirely locally. There is no staging or production server.

---

## Environments

| Environment | URL | How to start |
|---|---|---|
| Local | `http://localhost:5001` (API) | `python server.py` |
| Dashboard | `betting-tracker.html` in browser | Open the file directly |

---

## Starting the server

```bash
# From the Betting Tracker folder
cd "Betting Tracker"

# Install dependencies (first time only)
pip install flask flask-cors openpyxl requests selenium beautifulsoup4 webdriver-manager

# Start the server — leave this running
python server.py
```

**Expected output:**
```
=======================================================
  Betting Tracker — Data Bridge Server
  Tracker: /path/to/Betting_Tracker.xlsx
  Listening on http://localhost:5001
  Keep this running — dashboard auto-connects
=======================================================
```

**How to know it's working:** `curl http://localhost:5001/api/status` returns `{"ok": true, ...}`

---

## Opening the dashboard

Open `betting-tracker.html` in a browser. The server must already be running on port 5001.

The dashboard auto-fetches on load. If it shows empty data, the server is not running.

---

## Running the scrapers manually

```bash
# Locks25 (Selenium — opens Chrome, logs in, scrapes bets)
python refresh_locks25.py

# Bovada (Selenium — same flow)
python refresh_bovada.py

# Upcoming games cache (fetches from ESPN, writes upcoming_games_cache.json)
python fetch_upcoming_games.py
```

The scrapers can also be triggered from the dashboard via the "Refresh" buttons, which POST to `/api/refresh/locks25` and `/api/refresh/bovada`.

---

## Credentials required

See `reference/env-vars.md` for current credentials for Locks25 and Bovada. Both are hardcoded in their respective scraper scripts. If a scraper fails auth, update the values in the script and in `reference/env-vars.md`.

---

## Dependencies

All Python. Install with:
```bash
pip install flask flask-cors openpyxl requests selenium beautifulsoup4 webdriver-manager
```

**Chrome must be installed** for Selenium scrapers. `webdriver-manager` handles the ChromeDriver download automatically.

---

## Adding a new env var or credential

1. Add to the scraper script where it's used
2. Document in `reference/env-vars.md`
3. Note here if it's required for startup

---

## Common startup failures

| Symptom | Likely cause | Fix |
|---|---|---|
| `ModuleNotFoundError` | Dependency not installed | `pip install [package]` |
| `Address already in use` on port 5001 | Old server process still running | Kill it: `lsof -ti:5001 \| xargs kill` |
| `FileNotFoundError: Betting_Tracker.xlsx` | Script run from wrong directory | `cd` to the Betting Tracker folder first |
| Chrome not found (scraper) | Chrome not installed | Install Chrome, then `pip install --upgrade webdriver-manager` |
| `PermissionError` on Excel | File open in Excel app | Close Betting_Tracker.xlsx in Excel |
