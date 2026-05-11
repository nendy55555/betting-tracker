# Test cases

> Manual test scenarios. Run relevant ones after changes to server.py, the HTML, or scraper scripts.

---

## Server — data parsing

### TC-001: Straight bet with spread
**Input (Excel row):** Sport=NFL, Teams=`Chiefs vs Bills`, Line=`Chiefs -3.5`, Odds=`-110`, Risk=50, ToWin=45.45, Status=Won, WinLoss=45.45
**Expected API output:** `type=spread`, `odds=-110`, `stake=50`, `toWin=45.45`, `result=W`, `winLoss=45.45`

### TC-002: Moneyline bet
**Input:** Line=`ML`, Odds=`+130`
**Expected:** `type=moneyline`, `odds=130` (positive integer)

### TC-003: Parlay
**Input:** BetType=`Parlay` OR Teams contains `parlay`
**Expected:** `type=parlay`

### TC-004: Futures/championship bet
**Input:** Teams=`Duke Odds to Win NCAA Championship`
**Expected:** `type=future`

### TC-005: Over/under
**Input:** Line=`Over 220.5`
**Expected:** `type=total`

### TC-006: Date parsing — full datetime
**Input:** `Mar-26-2026 07:00 PM`
**Expected gameTime:** `3/26/26 7:00 PM` (leading zero stripped from hour)
**Expected addedDate:** ISO 8601 string with 19:00 UTC offset

### TC-007: Date parsing — date only
**Input:** `Mar-22-2026`
**Expected gameTime:** `3/22/26 8:00 PM` (default 8 PM added)

### TC-008: Odds parsing — implied odds string
**Input:** `-112 implied`
**Expected odds:** `-112`

### TC-009: Odds parsing — year-as-odds (parser bug)
**Input:** `-2026` (captured from date bracket)
**Expected behavior:** This is a bug — `parse_odds` will return `-2026`. The fix is upstream in the bet-slip parser: strip `[...]` brackets before running odds extraction.

### TC-010: Missing TX ID row
**Input:** Row in Bet History with empty column B (tx_id)
**Expected:** Row is skipped; does not appear in `/api/bets` response

---

## Server — caching

### TC-011: Excel cache invalidation after scraper run
**Steps:** 1) GET /api/bets, note count. 2) Add a row to Excel manually. 3) GET /api/bets again without restarting server.
**Expected:** Count unchanged (cache still valid — mtime hasn't changed if you saved carefully). After calling `_invalidate_xlsx_cache()`, the next GET should return the updated count.

### TC-012: Futures odds 15-minute cache
**Steps:** 1) GET /api/futures-odds — `cached: false`. 2) GET again immediately.
**Expected:** Second call returns `cached: true`

---

## Dashboard — UI

### TC-013: Stats panel reflects correct P&L
**Steps:** Review `/api/bets` JSON, sum all `winLoss` values manually.
**Expected:** Dashboard P&L stat matches your manual sum.

### TC-014: Bet card expand/collapse
**Steps:** Click any bet card in the Open Bets or History panel.
**Expected:** Details expand. Click again — collapse.

### TC-015: Sport tag colours
**Expected:** NBA=orange, NFL=blue, NCAAMB=purple, Soccer=green, Other=grey

---

## Scrapers

### TC-016: Locks25 scraper — no duplicates
**Steps:** Run `refresh_locks25.py` twice.
**Expected:** Second run does not create duplicate rows in Excel. Existing open bets are matched by ticket ID.

### TC-017: Bovada scraper — auth
**Steps:** Run `python refresh_bovada.py` manually.
**Expected:** Script prints login confirmation, then bet counts. No `SessionNotCreatedException`.

---

## Known edge cases

| Scenario | Expected behaviour |
|---|---|
| Excel open in Excel app during server read | `PermissionError` in server log; `/api/bets` returns `ok: false` |
| Bovada API returns 404 (off-season) | Server logs `sport: Bovada futures market not found`; falls back to ESPN |
| Upcoming games cache > 4 hours old | Server runs `fetch_upcoming_games.py` live as fallback |
| Bet result is `Tie` (not `Push`) | Maps to result `P` (push/amber) |
