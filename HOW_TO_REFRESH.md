# Betting Tracker — Refresh Guide

## What the scripts do

| Script | What it pulls | Where it writes |
|---|---|---|
| `refresh_locks25.py` | Locks25 open bets + this week's history | Open Bets sheet + Bet History sheet |
| `refresh_bovada.py` | Bovada open bets + settled bets | Open Bets sheet (merged) + Bet History sheet |

Open bets from both sites are **merged and sorted chronologically** by game start time, pulled live from ESPN's API.

## One-time setup

```bash
pip install selenium openpyxl requests beautifulsoup4 webdriver-manager
```

## To refresh Locks25

```bash
cd "Betting Tracker"
python refresh_locks25.py
```

## To refresh Bovada

```bash
cd "Betting Tracker"
python refresh_bovada.py
```

## To refresh both at once

```bash
python refresh_locks25.py && python refresh_bovada.py
```

## What you get after refresh

- **Open Bets sheet**: All pending bets from Locks25 + Bovada, sorted by the closest game starting first. Locks25 bets shown in blue, Bovada in purple.
- **Bet History sheet**: Any new settled bets appended automatically. Duplicate transaction IDs are skipped.

## Notes

- Bovada uses heavy JavaScript rendering — the script waits for the page to load but may need tuning if their layout changes.
- Game start times come from ESPN's public API (`site.api.espn.com`). If a team isn't found in ESPN's schedule (e.g., obscure college teams), the game will sort to the bottom.
- Credentials are stored directly in each script. Keep these files private.
