# API schema

> Read this when building or debugging API routes in server.py, or when a request/response shape is unclear.
> Server runs at `http://localhost:5001`. No authentication required (local only).

---

## Conventions

All responses use this envelope:
```json
{ "ok": true, ... }        // success
{ "ok": false, "error": "message" }  // failure
```

**Base URL:** `http://localhost:5001`
**Auth:** None (local server, no auth layer)
**CORS:** Enabled for all origins (allows file:// dashboard to call the API)

---

## Endpoints

### `GET /api/status`
Health check. Also returns cache state.

**Response:**
```json
{
  "ok": true,
  "time": "2026-03-25T12:00:00",
  "cache": {
    "xlsx_cached": true,
    "xlsx_cache_age_seconds": 45.2,
    "futures_cached": false,
    "futures_cache_age_seconds": null,
    "futures_cache_ttl_seconds": 900
  }
}
```

---

### `GET /api/bets`
All settled bets from the "Bet History" sheet.

**Response:**
```json
{
  "ok": true,
  "count": 47,
  "bets": [ BetObject, ... ]
}
```

---

### `GET /api/open-bets`
All open/pending bets from the "Open Bets" sheet.

**Response:**
```json
{
  "ok": true,
  "count": 3,
  "bets": [ BetObject, ... ]
}
```

---

### `POST /api/bets/update`
Manually update a single row in the `Bet History` or `Open Bets` sheet. Used by the dashboard's Edit button when the parser captured something wrong. Writes directly to the user's xlsx and invalidates the cache.

**Request body:**
```json
{
  "user":   "Thomas",                  // optional, defaults to ?user= or DEFAULT_USER
  "sheet":  "history" | "open",        // required
  "txId":   "608309226",               // preferred lookup
  "rowKey": 12,                        // fallback: 1-based Excel row index (>= 4)
  "fields": {                          // any subset; unknown keys → 400
    "sport":       "NBA",
    "betType":     "Spread",
    "teams":       "Lakers vs Celtics",
    "line":        "-4.5",
    "odds":        "-110",
    "stake":       50,
    "toWin":       45.45,
    "status":      "Won",              // open: "Open"/"Pending"; history: "Won"/"Lost"/"Push"
    "winLoss":     45.45,              // history sheet only (positive=win, negative=loss)
    "notes":       "...",
    "gameTime":    "Mar-22-2026 07:00 PM",   // open sheet only
    "settledDate": "Mar-22-2026",            // history sheet only
    "source":      "Bovada"                  // history sheet only
  }
}
```

**Allowed field keys**
- `history`: `settledDate`, `txId`, `sport`, `betType`, `teams`, `line`, `odds`, `stake`, `toWin`, `status`, `winLoss`, `notes`, `source`
- `open`: `gameTime`, `source`, `sport`, `betType`, `teams`, `line`, `odds`, `stake`, `toWin`, `status`, `notes`

**Lookup priority:** `txId` (col B for history, regex `Ticket: <id>` in notes for open) → `rowKey` (1-based, must be ≥ 4).

**Response (200):**
```json
{
  "ok": true,
  "user": "Thomas",
  "sheet": "history",
  "row": 27,
  "before": { "odds": "-110", "stake": 50 },
  "after":  { "odds": "-115", "stake": 75 },
  "bet":    { /* refreshed BetObject */ },
  "settled_count": 47,
  "open_count": 3
}
```

**Error codes**
| HTTP | code | meaning |
|---|---|---|
| 400 | `BAD_SHEET` | sheet must be `history` or `open` |
| 400 | `NO_FIELDS` | fields object missing or empty |
| 400 | `UNKNOWN_FIELDS` | one or more keys not in the allowed list |
| 404 | `SHEET_MISSING` | sheet not found in workbook |
| 404 | `ROW_NOT_FOUND` | no row matched txId or rowKey |
| 503 | `XLSX_LOCKED` | workbook is open in Excel |
| 503 | `XLSX_MISSING` | workbook file does not exist |
| 500 | `XLSX_ERROR` | other openpyxl error |

---

### `POST /api/refresh/locks25`
Runs `refresh_locks25.py` as a subprocess, then returns the full updated dataset.

**Request body:** None

**Response:**
```json
{
  "ok": true,
  "settled_count": 48,
  "open_count": 4,
  "bets": [ BetObject, ... ],
  "open_bets": [ BetObject, ... ]
}
```

**Timeout:** 120 seconds. If the scraper exceeds this, the subprocess is killed.

---

### `POST /api/refresh/bovada`
Runs `refresh_bovada.py` as a subprocess, then returns the full updated dataset. Same response shape as `/api/refresh/locks25`.

---

### `GET /api/futures-odds`
Current championship odds. Waterfall: Bovada public API → ESPN fallback. 15-minute cache.

**Query params:**
- `sports` — comma-separated sport keys (default: `nba`). Valid: `nba`, `ncaamb`, `cbb`, `nfl`, `mlb`, `nhl`

**Response:**
```json
{
  "ok": true,
  "odds": {
    "boston celtics": { "odds": -120, "bookmaker": "Bovada" },
    "oklahoma city thunder": { "odds": 350, "bookmaker": "Bovada" }
  },
  "count": 30,
  "source": "Bovada",
  "errors": null,
  "cached": false
}
```

---

### `GET /api/odds-history`
Stored odds history for line movement display. Data sourced from `odds_history.json`.

**Query params:**
- `teams` — comma-separated team names (optional; returns all if omitted)
- `days` — number of days of history (default: 30)

**Response:**
```json
{
  "ok": true,
  "history": {
    "boston celtics": [
      { "odds": -130, "bookmaker": "Bovada", "ts": "2026-03-24T12:00:00Z" }
    ]
  },
  "count": 1
}
```

---

### `POST /api/closing-lines`
Save closing line snapshots for CLV calculation.

**Request body:**
```json
{
  "lines": [
    { "betId": "608309226", "closingOdds": -115 }
  ]
}
```

**Response:** `{ "ok": true, "saved": 1 }`

---

### `GET /api/closing-lines`
Return stored closing lines.

**Response:**
```json
{
  "ok": true,
  "lines": {
    "608309226": { "closingOdds": -115, "ts": "2026-03-24T20:00:00Z" }
  },
  "count": 1
}
```

---

### `GET /api/upcoming-games`
Upcoming games from ESPN. Serves `upcoming_games_cache.json` if < 4 hours old, otherwise fetches live.

**Response:**
```json
{
  "ok": true,
  "source": "cache",
  "fetchedAt": 1711382400000,
  "games": [ ... ]
}
```

---

## BetObject type

Returned by `/api/bets` and `/api/open-bets`:

```typescript
{
  id:          string,       // txId or 'open_N' for open bets without a ticket
  txId:        string,       // sportsbook ticket ID
  sport:       string,       // normalised: 'NBA', 'NFL', 'NCAAMB', etc.
  type:        string,       // 'parlay' | 'future' | 'total' | 'moneyline' | 'spread' | 'straight'
  matchup:     string,       // raw teams/event from Excel
  pick:        string,       // display string: "Teams  Line  (+Odds)"
  odds:        number,       // American integer (-110, +150)
  stake:       number,       // dollars wagered
  toWin:       number,       // potential profit
  settled:     boolean,      // true if result is W, L, or P
  result:      string,       // 'W' | 'L' | 'P' | ''
  winLoss:     number,       // actual P&L (positive=win, negative=loss, 0=pending)
  notes:       string,
  settledDate: string,       // ISO 8601 (settled bets only)
  addedDate:   string,       // ISO 8601
  gameTime:    string,       // short display string e.g. '3/22/26 8:00 PM'
  source:      string,       // 'Locks' | 'Locks25' | 'Bovada'
  excelRow:    number,       // 1-based Excel row index (used by /api/bets/update fallback)
  excelSheet:  string,       // 'history' | 'open' — which sheet this bet lives in
}
```

---

## CLV (Closing Line Value) Endpoints

### `GET /api/clv/stats`
Aggregate CLV statistics for all settled bets.

**Query params:**
- `sport` — filter by sport (optional)
- `market` — filter by market: h2h, spreads, totals (optional)

**Response:**
```json
{
  "ok": true,
  "stats": {
    "overall": { "avg_clv": 1.23, "median_clv": 0.8, "positive_rate": 55.2, "count": 150, "matched": 98 },
    "by_sport": { "NBA": { "avg_clv": 2.1, ... }, "NFL": { ... } },
    "by_market": { "h2h": { ... }, "spreads": { ... }, "totals": { ... } },
    "by_source": { "pinnacle": { ... }, "us_consensus": { ... } },
    "unmatched": { "count": 52, "reasons": { "No closing line match": 40, "Excluded: parlay": 12 } }
  }
}
```

### `GET /api/clv/bets`
All settled bets enriched with CLV data.

**Response:** Same as `/api/bets` but each bet additionally has:
```json
{
  "clv_matched": true,
  "clv_pct": 1.5,              // CLV percentage (positive = beat closing line)
  "closing_odds": -115,        // raw closing odds (American)
  "closing_fair_prob": 0.52,   // no-vig closing probability
  "opening_odds": -110,        // opening odds if available
  "clv_source": "pinnacle",    // 'pinnacle' or 'us_consensus'
  "clv_market": "spreads",     // 'h2h', 'spreads', or 'totals'
  "clv_event_id": "abc123"     // The Odds API event ID
}
```

### `GET /api/clv/game-odds-status`
Status of the game odds snapshot pipeline.

**Response:**
```json
{
  "ok": true,
  "active_events": 42,
  "total_snapshots": 186,
  "closing_lines_count": 350,
  "last_capture": "2026-03-30T18:00:00Z",
  "sports_breakdown": { "NBA": 12, "NFL": 0, "NCAAMB": 28 },
  "api_key_configured": true
}
```

### `GET/POST /api/clv/config`
GET: Return current config (API key masked).
POST: Update config.

**POST body:**
```json
{
  "api_key": "your-the-odds-api-key",
  "poll_interval_hours": 4,
  "active_sports": ["NBA", "NFL", "NCAAMB"]
}
```

### `POST /api/clv/refresh`
Trigger a manual game odds snapshot.

**Body (optional):**
```json
{ "closing_only": false, "sport": "NBA" }
```
