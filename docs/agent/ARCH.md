# Architecture

> Read this before adding a feature, modifying data flow, or touching server.py or the HTML.

---

## System overview

The dashboard is a self-contained HTML file that fetches data from a local Python Flask server. The Flask server reads `Betting_Tracker.xlsx` as its database and serves the data as JSON. Two Selenium scripts scrape sportsbook websites and write results back to the Excel file. The frontend never writes directly to Excel — all mutations go through the server or the scraper scripts.

```
betting-tracker.html (browser, file:// protocol)
        │
        │  fetch() calls to http://localhost:5001/api/*
        ▼
    server.py  (Flask, port 5001)
        │
        ├── reads/caches ──→  Betting_Tracker.xlsx
        │                       ├── "Bet History" sheet (settled bets)
        │                       └── "Open Bets" sheet (pending bets)
        │
        ├── triggers ──────→  refresh_locks25.py  (Selenium → Locks25)
        │                       └── writes to Betting_Tracker.xlsx
        │
        ├── triggers ──────→  refresh_bovada.py   (Selenium → Bovada)
        │                       └── writes to Betting_Tracker.xlsx
        │
        └── fetches ────────→  Bovada public API  (futures/championship odds)
                                ESPN public API    (fallback + upcoming games)
```

---

## Layer responsibilities

| Layer | File(s) | Responsibility | Must NOT do |
|---|---|---|---|
| UI / Dashboard | `betting-tracker.html` | Render data, handle user events, call `/api/*` | Write to Excel directly, hold authoritative state |
| API Server | `server.py` | Parse requests, read Excel, **write Excel via `/api/bets/update`**, call scrapers, return JSON | Business logic beyond data transformation |
| Scrapers | `refresh_locks25.py`, `refresh_bovada.py` | Authenticate with sportsbooks, scrape bets, write Excel | Serve HTTP, hold state between runs |
| Data store | `Betting_Tracker.xlsx` | Source of truth for all bet history and open bets | — |
| Odds/games cache | `odds_history.json`, `upcoming_games_cache.json`, `closing_lines.json` | Persist external data between server restarts | Replace Excel as source of truth |

---

## Key server modules (server.py)

### Excel reader — `read_settled_bets()` / `read_open_bets()`
Reads the two Excel sheets and returns JSON-serializable dicts. Uses file mtime-based caching — the cache is only invalidated when the `.xlsx` file is written. Both functions skip rows with no `tx_id` (settled) or no `teams` (open).

### Sport normaliser — `normalise_sport(raw)`
Maps raw sport strings (`cbb`, `nba live`, etc.) to canonical names (`NCAAMB`, `NBA`).

### Bet type inference — `infer_type(bet_type_col, line_col, teams_col)`
Infers dashboard type (`parlay`, `future`, `total`, `moneyline`, `spread`, `straight`) from Excel column values.

### Odds parser — `parse_odds(raw)`
Extracts American odds integer from strings like `-112 implied` or `+103`.

### Date helpers — `parse_date_str()` / `format_game_time()`
Converts `Mar-22-2026` and `Mar-22-2026 07:00 PM` formats to ISO 8601 and short display strings.

### Futures odds — `_fetch_bovada()` / `_fetch_espn()`
Waterfall: Bovada public API first, ESPN as fallback. 15-minute in-memory cache. Persists daily snapshot to `odds_history.json`.

---

## Data flow for common operations

### User-triggered scrape refresh
```
1. User clicks "Refresh" button in dashboard
2. Dashboard POSTs to /api/refresh/locks25 or /api/refresh/bovada
3. server.py runs the scraper script as a subprocess (timeout: 120s)
4. Scraper logs into sportsbook via Selenium, writes results to Betting_Tracker.xlsx
5. server.py invalidates the xlsx cache
6. server.py re-reads Excel, returns full updated dataset
7. Dashboard re-renders with new data
```

### Viewing settled bets
```
1. Dashboard GETs /api/bets on load
2. server.py checks mtime cache — reads Excel only if file changed
3. Returns list of bet dicts
4. Dashboard renders bet cards, computes stats client-side
```

### Futures odds display
```
1. Dashboard GETs /api/futures-odds?sports=nba,ncaamb
2. server.py checks 15-min in-memory cache
3. If stale: fetches Bovada public API → falls back to ESPN
4. Appends daily snapshot to odds_history.json
5. Returns odds dict
```

---

## External integrations

| Service | Purpose | Method | Credentials |
|---|---|---|---|
| Locks25 | Scrape open/settled bets | Selenium (headless Chrome) | `reference/env-vars.md` |
| Bovada | Scrape open/settled bets | Selenium (headless Chrome) | `reference/env-vars.md` |
| Bovada public API | Championship futures odds | HTTP GET, no auth | None required |
| ESPN public API | Futures odds fallback, upcoming games | HTTP GET, no auth | None required |

---

## Adding a new feature — checklist

- [ ] Does it touch the Excel schema? Update `reference/data-models.md`
- [ ] Does it add a server endpoint? Document in `reference/api-schema.md`
- [ ] Does it add credentials or config? Document in `reference/env-vars.md`
- [ ] Does it require a new Python package? Add to `DECISIONS.md` and the install notes in `DEPLOY.md`
- [ ] Does it change bet mutation logic? Check pipeline rules in `reference/data-models.md`

---

## What not to do architecturally

- No direct writes to Excel from the dashboard HTML — only the server or scraper scripts write to the file
- No new hardcoded credentials — put them in a `.env` file and document in `reference/env-vars.md`
- No business logic (bet type inference, odds parsing) duplicated between server.py and the frontend — the server is the authority
