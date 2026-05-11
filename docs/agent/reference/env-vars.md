# Environment variables and credentials

> All credentials and config the project uses.
> Update this whenever a value changes or a new credential is added.

---

## How credentials are currently managed

Credentials are hardcoded directly in the scraper scripts. There is no `.env` file. This is a known gap — see `DECISIONS.md` open questions.

---

## Sportsbook credentials

### Locks25
**File:** `refresh_locks25.py` (top of file)

| Variable | Current value | Notes |
|---|---|---|
| `USERNAME` | `THONEN9498` | Locks25 account username |
| `PASSWORD` | `TN3106` | Locks25 account password |
| `LOCKS25_URL` | `https://locks25.com` | Base URL for scraper navigation |

---

### Bovada
**File:** `refresh_bovada.py` (top of file)

| Variable | Current value | Notes |
|---|---|---|
| `EMAIL` | `tnendick@usc.edu` | Bovada account email |
| `PASSWORD` | `Charcole6969!` | Bovada account password |
| `BOVADA_URL` | `https://www.bovada.lv` | Base URL for scraper navigation |

---

## File paths (config in server.py)

| Constant | Value | Notes |
|---|---|---|
| `TRACKER_PATH` | `./Betting_Tracker.xlsx` | Main data file — relative to script dir |
| `LOCKS_SCRIPT` | `./refresh_locks25.py` | Path server uses to invoke the scraper |
| `BOVADA_SCRIPT` | `./refresh_bovada.py` | Path server uses to invoke the scraper |
| `ODDS_HISTORY_FILE` | `./odds_history.json` | Line movement data |
| `UPCOMING_CACHE_FILE` | `./upcoming_games_cache.json` | ESPN upcoming games cache |

---

## External APIs (no credentials required)

| Service | URL pattern | Notes |
|---|---|---|
| Bovada public API | `https://www.bovada.lv/services/sports/event/v2/events/A/description/*` | Free, no auth; futures/championship odds |
| ESPN site API | `https://site.api.espn.com/apis/site/v2/sports/{sport}/{league}/futures` | Free, no auth; futures odds fallback |
| ESPN core API | `https://sports.core.api.espn.com/v2/sports/{sport}/leagues/{league}/futures` | Free, no auth; second ESPN fallback |

---

## Server config

| Setting | Value | Notes |
|---|---|---|
| Flask host | `127.0.0.1` | Local only — not exposed to network |
| Flask port | `5001` | Dashboard expects this port — do not change |
| Futures odds cache TTL | `900` seconds (15 min) | In-memory only; resets on server restart |
| Upcoming games cache max age | `4 hours` | File-based; served from `upcoming_games_cache.json` |
| Odds history max per team | `90 entries` | Older entries pruned automatically |

---

## Diagnosing credential failures

If a scraper fails to authenticate:
1. Check the values above against the current sportsbook login
2. Update the value in the script file
3. Update this document
4. Re-run the scraper manually to confirm

If a scraper was working and suddenly fails auth, the sportsbook may have:
- Changed its login page HTML (update Selenium selectors)
- Expired or locked the account (log in manually to check)
- Added 2FA (would require manual intervention)
