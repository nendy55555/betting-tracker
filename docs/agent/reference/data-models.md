# Data models

> Read this when working with the Excel file, adding bets, or interpreting server.py's row parsing.
> Source of truth: `Betting_Tracker.xlsx`

---

## Database

**Type:** Microsoft Excel (.xlsx)
**Library:** openpyxl (Python)
**File:** `Betting_Tracker.xlsx` in the project root
**Sheets:** `Bet History` (settled bets), `Open Bets` (pending bets)
**Data starts at:** Row 4 in both sheets (rows 1–3 are headers/formatting)

---

## Sheet: Bet History (settled bets)

Read by `read_settled_bets()` in `server.py`. Rows skipped if `tx_id` (col B) is empty.

| Column index | Column | Type | Notes |
|---|---|---|---|
| 0 | Settled Date | string | Format: `Mar-22-2026` or `Mar-22-2026 07:00 PM` |
| 1 | TX ID | string/int | Unique ticket/transaction ID — **skip row if empty** |
| 2 | Sport | string | Raw value; normalised by `normalise_sport()` |
| 3 | Bet Type | string | Used with line/teams to infer dashboard type |
| 4 | Teams / Event | string | Matchup or event name |
| 5 | Line | string | e.g. `-4.5`, `ML`, `Over 220.5` |
| 6 | Odds | string/int | American format; parsed by `parse_odds()` |
| 7 | Risk ($) | float | Amount wagered |
| 8 | To Win ($) | float | Potential profit (not including stake) |
| 9 | Status | string | `Won`, `Lost`, or `Push` — case-sensitive for result mapping |
| 10 | Win/Loss ($) | float | Actual P&L: **positive for wins, negative for losses** |
| 11 | Notes | string | Free text; may contain ticket info |
| 12 | Source | string | `Locks` or `Bovada` (optional column) |

**Status → result mapping:**
- `Won` → `W` (green)
- `Lost` → `L` (red)
- `Push` or `Tie` → `P` (amber)
- Anything else → empty string (treated as unsettled)

---

## Sheet: Open Bets (pending bets)

Read by `read_open_bets()` in `server.py`. Rows skipped if `teams` (col E) is empty.

| Column index | Column | Type | Notes |
|---|---|---|---|
| 0 | Game Time | string | Format: `Mar-22-2026` or `Mar-22-2026 07:00 PM` |
| 1 | Source | string | `Locks25` or `Bovada` |
| 2 | Sport | string | Raw value; normalised by `normalise_sport()` |
| 3 | Bet Type | string | |
| 4 | Teams / Event | string | **Skip row if empty** |
| 5 | Line | string | |
| 6 | Odds | string/int | American format |
| 7 | Risk ($) | float | |
| 8 | To Win ($) | float | |
| 9 | Status | string | Typically `Open` or `Pending` |
| 10 | Notes | string | May contain `Placed: Feb-05-2026  |  Ticket: 608309226` — ticket ID extracted via regex |

**Ticket ID extraction:** `re.search(r'Ticket:\s*(\d+)', notes)` — the result is used as `txId`.

---

## Inferred fields (computed by server.py, not stored in Excel)

| Field | Source | Logic |
|---|---|---|
| `type` | `infer_type(bet_type, line, teams)` | parlay/future/total/moneyline/spread/straight |
| `pick` | joined from teams + line + odds | Display string only |
| `settled` | `result in (W, L, P)` | Boolean |
| `addedDate` | `parse_date_str(settled_date or game_time)` | ISO 8601 |
| `gameTime` | `format_game_time(settled_date or game_time)` | Short display string |

---

## Sport normalisation map

```python
SPORT_MAP = {
    'cbb':     'NCAAMB',
    'cbb live':'NCAAMB',
    'nba':     'NBA',
    'nba live':'NBA',
    'nfl':     'NFL',
    'nfl live':'NFL',
    'soccer':  'Soccer',
    'ncaamb':  'NCAAMB',
    'ncaawb':  'NCAAWB',
}
# Anything not in the map passes through as-is
```

---

## Bet type inference logic

```python
def infer_type(bet_type_col, line_col, teams_col):
    # 'parlay' in any of the three → 'parlay'
    # 'future'/'odds to win'/'championship' in teams → 'future'
    # 'over'/'under'/'total'/'1h' in line → 'total'
    # 'ml'/'moneyline' in line → 'moneyline'
    # 'ats' or [+-]digits in line → 'spread'
    # fallback → 'straight'
```

---

## Data integrity rules

| Rule | Enforced by | Detail |
|---|---|---|
| Never delete historical rows | Project rule + pipeline rule | Only append or update `status`/`win_loss` |
| Skip rows with missing key field | server.py | `tx_id` (Bet History), `teams` (Open Bets) |
| Parser must strip date brackets before odds extraction | Known bug fix | Prevents `-2026` year-as-odds issue |
| `win_loss` sign convention | Manual discipline | Positive = profit, negative = loss |

---

## Pipeline rules (mutation paths)

These rules apply whenever bet data is added or settled:

1. Never delete or overwrite historical records — only append or update `result`/`settled` status
2. If a result isn't explicitly confirmed, leave `status` as pending
3. After any write, invalidate the server's xlsx cache via `_invalidate_xlsx_cache()`
4. Confirm in chat: how many bets were added/updated, updated P&L
