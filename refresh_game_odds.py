"""
refresh_game_odds.py — Game-level odds snapshot collector for CLV tracking
──────────────────────────────────────────────────────────────────────────
Polls The Odds API for upcoming game lines (spreads, moneylines, totals)
and stores timestamped snapshots. First snapshot per event = opening line.
Final snapshot before game start = closing line.

Run on a schedule (every 2-4 hours during season, more frequent on game days):
    python3 refresh_game_odds.py

Or with flags:
    python3 refresh_game_odds.py --closing-only   # Only capture lines for games starting within 45 min
    python3 refresh_game_odds.py --sport nba       # Single sport
    python3 refresh_game_odds.py --backfill 2026-03-15  # Historical backfill for a specific date

Requires: THE_ODDS_API_KEY env var or key stored in game_odds_config.json
API cost per sport: 3 credits (h2h + spreads + totals × 1 region)
                    + 3 credits for Pinnacle (eu region)
                    = 6 credits per sport per call

With 5 sports × 6 credits × 12 calls/day = 360 credits/day ≈ 10,800/month
Fits comfortably in the 20K plan ($30/month).
"""

import os
import sys
import json
import logging
import time
import argparse
from datetime import datetime, timedelta, timezone, date

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_FILE = os.path.join(SCRIPT_DIR, 'game_odds_config.json')
SNAPSHOTS_FILE = os.path.join(SCRIPT_DIR, 'game_odds_snapshots.json')
CLOSING_LINES_FILE = os.path.join(SCRIPT_DIR, 'closing_lines.json')
STATE_FILE = os.path.join(SCRIPT_DIR, 'odds_api_state.json')

THE_ODDS_API_BASE = 'https://api.the-odds-api.com/v4/sports'

# Default per-run daily budget cap. Plan is 20K/mo; normal use is ~360/day.
# Cap at 1000/day so a runaway loop or misconfigured cron can't drain the plan.
DEFAULT_DAILY_BUDGET = 1000


# ─────────────────────────────────────────────────────────────────────────────
# ERROR CLASSES (exit codes mirror scraper_common.py)
# ─────────────────────────────────────────────────────────────────────────────
class OddsAPIError(Exception):
    exit_code = 2


class OddsAPIAuthError(OddsAPIError):
    exit_code = 1


class OddsAPIBudgetExceeded(OddsAPIError):
    exit_code = 5  # distinct from scraper exits; treated as expected halt


# ─────────────────────────────────────────────────────────────────────────────
# BUDGET STATE
# ─────────────────────────────────────────────────────────────────────────────
def load_state():
    """Load API usage state. Safe to call if file missing or corrupt."""
    if os.path.exists(STATE_FILE):
        try:
            with open(STATE_FILE) as f:
                return json.load(f)
        except Exception:
            pass
    return {"daily": {}, "total_last_remaining": None, "last_call_ts": None}


def save_state(state):
    try:
        with open(STATE_FILE, 'w') as f:
            json.dump(state, f, indent=1)
    except Exception as e:
        logging.warning("Failed to persist odds-api state: %s", e)


def _today_key():
    return date.today().isoformat()


def daily_used(state):
    return int(state.get("daily", {}).get(_today_key(), {}).get("credits_used", 0))


def record_call(state, credits_used, remaining):
    """Update running totals. credits_used is int (parsed from x-requests-last).
    remaining is int/str from x-requests-remaining."""
    today = _today_key()
    daily = state.setdefault("daily", {})
    day = daily.setdefault(today, {"credits_used": 0, "last_remaining": None})
    try:
        day["credits_used"] += int(credits_used)
    except (ValueError, TypeError):
        pass
    try:
        day["last_remaining"] = int(remaining)
        state["total_last_remaining"] = int(remaining)
    except (ValueError, TypeError):
        pass
    state["last_call_ts"] = datetime.now(timezone.utc).isoformat()

    # Prune days older than 90 days
    cutoff = (date.today() - timedelta(days=90)).isoformat()
    for k in [k for k in list(daily.keys()) if k < cutoff]:
        del daily[k]


def enforce_budget(state, cap):
    """Raise OddsAPIBudgetExceeded if today's usage is at/over cap."""
    used = daily_used(state)
    if used >= cap:
        raise OddsAPIBudgetExceeded(
            f"Daily budget reached: {used}/{cap} credits. "
            f"Increase --budget-cap or wait for midnight UTC."
        )

# Sport key mapping: internal name → The Odds API sport key
SPORT_KEYS = {
    'NFL':    'americanfootball_nfl',
    'NBA':    'basketball_nba',
    'NCAAMB': 'basketball_ncaab',
    'NCAAWB': 'basketball_wncaab',
    'Soccer': 'soccer_usa_mls',
    'EPL':    'soccer_epl',
    'UCL':    'soccer_uefa_champs_league',
}

# Markets to capture for CLV calculation
MARKETS = ['h2h', 'spreads', 'totals']

# Bookmakers to request — US region for main books, EU for Pinnacle
# We make two calls per sport: one for US books, one for Pinnacle (eu)
US_BOOKMAKERS = ['fanduel', 'draftkings', 'betmgm', 'caesars', 'bovada',
                 'betonlineag', 'espnbet', 'fanatics']
PINNACLE_KEY = 'pinnacle'

# How close to game start before we flag a snapshot as "closing"
CLOSING_WINDOW_MINUTES = 45


def load_config():
    """Load API key and settings from config file."""
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE) as f:
                return json.load(f)
        except Exception:
            pass
    return {}


def get_api_key():
    """Get API key from env var or config file."""
    key = os.environ.get('THE_ODDS_API_KEY', '')
    if not key:
        cfg = load_config()
        key = cfg.get('api_key', '')
    if not key:
        print("ERROR: No API key found.")
        print("Set THE_ODDS_API_KEY env var or create game_odds_config.json with:")
        print('  {"api_key": "your-key-here"}')
        sys.exit(1)
    return key


def load_snapshots():
    """Load existing snapshots from disk. Structure:
    {
        "event_id": {
            "sport": "NBA",
            "home": "Boston Celtics",
            "away": "Miami Heat",
            "commence_time": "2026-03-25T23:30:00Z",
            "snapshots": [
                {
                    "ts": "2026-03-25T12:00:00Z",
                    "is_closing": false,
                    "us_books": { "fanduel": { "h2h": {...}, "spreads": {...}, "totals": {...} }, ... },
                    "pinnacle": { "h2h": {...}, "spreads": {...}, "totals": {...} }
                }
            ]
        }
    }
    """
    if os.path.exists(SNAPSHOTS_FILE):
        try:
            with open(SNAPSHOTS_FILE) as f:
                return json.load(f)
        except Exception:
            pass
    return {}


def save_snapshots(data):
    with open(SNAPSHOTS_FILE, 'w') as f:
        json.dump(data, f, indent=1)


def load_closing_lines():
    if os.path.exists(CLOSING_LINES_FILE):
        try:
            with open(CLOSING_LINES_FILE) as f:
                return json.load(f)
        except Exception:
            pass
    return {}


def save_closing_lines(data):
    with open(CLOSING_LINES_FILE, 'w') as f:
        json.dump(data, f, indent=1)


def parse_market_data(bookmaker_data):
    """Extract market data from a single bookmaker's response.
    Returns dict like:
    {
        "h2h": {"home": -150, "away": 130},
        "spreads": {"home": {"point": -4.5, "price": -110}, "away": {"point": 4.5, "price": -110}},
        "totals": {"over": {"point": 220.5, "price": -110}, "under": {"point": 220.5, "price": -110}}
    }
    """
    result = {}
    for market in bookmaker_data.get('markets', []):
        mkey = market.get('key', '')
        if mkey not in MARKETS:
            continue

        outcomes = market.get('outcomes', [])
        if mkey == 'h2h':
            parsed = {}
            for o in outcomes:
                name = o.get('name', '')
                price = o.get('price')
                parsed[name] = price
            result['h2h'] = parsed

        elif mkey == 'spreads':
            parsed = {}
            for o in outcomes:
                name = o.get('name', '')
                parsed[name] = {
                    'point': o.get('point'),
                    'price': o.get('price'),
                }
            result['spreads'] = parsed

        elif mkey == 'totals':
            parsed = {}
            for o in outcomes:
                label = o.get('name', '')  # "Over" or "Under"
                parsed[label] = {
                    'point': o.get('point'),
                    'price': o.get('price'),
                }
            result['totals'] = parsed

    return result


def fetch_sport_odds(api_key, sport_key, region='us', bookmakers=None,
                     state=None, budget_cap=None):
    """Fetch current odds for a sport from The Odds API.
    Returns (events_list, remaining, used). Updates state dict in place.

    Raises:
        OddsAPIAuthError on 401 (bad/missing key — fail fast, don't retry)
        OddsAPIBudgetExceeded on 429 or when daily cap reached
    """
    import requests

    if state is not None and budget_cap is not None:
        enforce_budget(state, budget_cap)

    params = {
        'apiKey': api_key,
        'regions': region,
        'markets': ','.join(MARKETS),
        'oddsFormat': 'american',
        'dateFormat': 'iso',
    }
    if bookmakers:
        params['bookmakers'] = ','.join(bookmakers)

    url = f'{THE_ODDS_API_BASE}/{sport_key}/odds/'

    # Retry on transient failures (5xx, network errors) with short backoff.
    last_err = None
    for attempt in range(1, 3):
        try:
            r = requests.get(url, params=params, timeout=15)
            remaining = r.headers.get('x-requests-remaining', '?')
            used = r.headers.get('x-requests-last', '?')

            if r.status_code == 200:
                if state is not None:
                    record_call(state, used, remaining)
                return r.json(), remaining, used

            if r.status_code == 401:
                raise OddsAPIAuthError(
                    "The Odds API rejected the key (HTTP 401). "
                    "Check THE_ODDS_API_KEY in .env or game_odds_config.json."
                )
            if r.status_code == 422:
                if state is not None:
                    record_call(state, used, remaining)
                return [], remaining, used  # sport out of season
            if r.status_code == 429:
                raise OddsAPIBudgetExceeded(
                    f"The Odds API monthly quota exhausted (HTTP 429). "
                    f"Remaining: {remaining}. Halting run."
                )
            if 500 <= r.status_code < 600:
                last_err = f"HTTP {r.status_code}: {r.text[:200]}"
                if attempt < 2:
                    time.sleep(2)
                    continue

            logging.warning("HTTP %s: %s", r.status_code, r.text[:200])
            return [], remaining, used

        except (OddsAPIAuthError, OddsAPIBudgetExceeded):
            raise
        except requests.RequestException as e:
            last_err = str(e)
            if attempt < 2:
                logging.warning("Network error (attempt %d): %s — retrying", attempt, e)
                time.sleep(2)
                continue

    logging.error("Fetch failed after retries: %s", last_err)
    return [], '?', '?'


def fetch_historical_odds(api_key, sport_key, date_str, region='us', bookmakers=None):
    """Fetch historical odds snapshot for a sport at a specific date/time.
    Used for backfilling opening/closing lines.
    Cost: 10 × markets × regions per call.
    """
    import requests

    params = {
        'apiKey': api_key,
        'regions': region,
        'markets': ','.join(MARKETS),
        'oddsFormat': 'american',
        'dateFormat': 'iso',
        'date': date_str,
    }
    if bookmakers:
        params['bookmakers'] = ','.join(bookmakers)

    url = f'https://api.the-odds-api.com/v4/historical/sports/{sport_key}/odds'
    try:
        r = requests.get(url, params=params, timeout=15)
        remaining = r.headers.get('x-requests-remaining', '?')
        used = r.headers.get('x-requests-last', '?')

        if r.status_code == 200:
            resp = r.json()
            # Historical endpoint wraps data in a snapshot object
            return resp.get('data', []), remaining, used, resp.get('timestamp'), resp.get('next_timestamp')
        else:
            print(f"  Historical HTTP {r.status_code}: {r.text[:200]}")
            return [], remaining, used, None, None
    except Exception as e:
        print(f"  Historical error: {e}")
        return [], '?', '?', None, None


def process_events(events, sport_name, snapshots, now_utc, closing_only=False):
    """Process API response events into snapshots. Returns count of new snapshots."""
    new_count = 0
    ts = now_utc.strftime('%Y-%m-%dT%H:%M:%SZ')

    for event in events:
        event_id = event.get('id', '')
        commence = event.get('commence_time', '')
        home = event.get('home_team', '')
        away = event.get('away_team', '')

        if not event_id or not commence:
            continue

        # Parse commence time
        try:
            game_start = datetime.fromisoformat(commence.replace('Z', '+00:00'))
        except (ValueError, AttributeError):
            continue

        # Skip games that already started
        if game_start <= now_utc:
            continue

        # In closing-only mode, skip games more than CLOSING_WINDOW_MINUTES away
        minutes_until = (game_start - now_utc).total_seconds() / 60
        if closing_only and minutes_until > CLOSING_WINDOW_MINUTES:
            continue

        is_closing = minutes_until <= CLOSING_WINDOW_MINUTES

        # Initialize event record if new
        if event_id not in snapshots:
            snapshots[event_id] = {
                'sport': sport_name,
                'home': home,
                'away': away,
                'commence_time': commence,
                'snapshots': [],
            }

        # Build snapshot from all bookmakers in response
        snap = {
            'ts': ts,
            'is_closing': is_closing,
            'us_books': {},
            'pinnacle': {},
        }

        for bm in event.get('bookmakers', []):
            bm_key = bm.get('key', '')
            parsed = parse_market_data(bm)
            if not parsed:
                continue

            if bm_key == PINNACLE_KEY:
                snap['pinnacle'] = parsed
            else:
                snap['us_books'][bm_key] = parsed

        # Only store if we got meaningful data
        if snap['us_books'] or snap['pinnacle']:
            # Dedupe: don't store if last snapshot was < 30 min ago with same data
            existing_snaps = snapshots[event_id]['snapshots']
            should_store = True
            if existing_snaps:
                last = existing_snaps[-1]
                try:
                    last_ts = datetime.fromisoformat(last['ts'].replace('Z', '+00:00'))
                    if (now_utc - last_ts).total_seconds() < 1800 and not is_closing:
                        should_store = False
                except Exception:
                    pass

            if should_store:
                snapshots[event_id]['snapshots'].append(snap)
                new_count += 1

    return new_count


def extract_closing_lines(snapshots):
    """Scan all events and extract closing lines for games that have started.
    A closing line = the last snapshot before game start, preferring Pinnacle.
    Returns dict keyed by a match identifier for joining to bet records."""
    now_utc = datetime.now(timezone.utc)
    closing = load_closing_lines()
    new_count = 0

    for event_id, event in snapshots.items():
        commence = event.get('commence_time', '')
        try:
            game_start = datetime.fromisoformat(commence.replace('Z', '+00:00'))
        except (ValueError, AttributeError):
            continue

        # Only extract for games that have started
        if game_start > now_utc:
            continue

        # Skip if we already have closing lines for this event
        if event_id in closing:
            continue

        snaps = event.get('snapshots', [])
        if not snaps:
            continue

        # Last snapshot = closest to game start = closing line
        last_snap = snaps[-1]

        # Build closing line record
        cl_record = {
            'event_id': event_id,
            'sport': event.get('sport', ''),
            'home': event.get('home', ''),
            'away': event.get('away', ''),
            'commence_time': commence,
            'captured_at': last_snap.get('ts', ''),
            'is_closing_flag': last_snap.get('is_closing', False),
            'pinnacle': last_snap.get('pinnacle', {}),
            'us_books': last_snap.get('us_books', {}),
        }

        # Also store the opening line (first snapshot)
        first_snap = snaps[0]
        cl_record['opening'] = {
            'captured_at': first_snap.get('ts', ''),
            'pinnacle': first_snap.get('pinnacle', {}),
            'us_books': first_snap.get('us_books', {}),
        }

        closing[event_id] = cl_record
        new_count += 1

    if new_count > 0:
        save_closing_lines(closing)

    return new_count


def cleanup_old_snapshots(snapshots, days=7):
    """Remove snapshot data for games older than N days to keep file size manageable.
    Closing lines are preserved in closing_lines.json permanently."""
    now_utc = datetime.now(timezone.utc)
    cutoff = now_utc - timedelta(days=days)
    removed = 0

    to_remove = []
    for event_id, event in snapshots.items():
        commence = event.get('commence_time', '')
        try:
            game_start = datetime.fromisoformat(commence.replace('Z', '+00:00'))
            if game_start < cutoff:
                to_remove.append(event_id)
        except (ValueError, AttributeError):
            continue

    for eid in to_remove:
        del snapshots[eid]
        removed += 1

    return removed


def run_snapshot(api_key, sports=None, closing_only=False, budget_cap=DEFAULT_DAILY_BUDGET, dry_run=False):
    """Main snapshot routine. Fetches odds for all active sports."""
    now_utc = datetime.now(timezone.utc)
    print(f"\nGame Odds Snapshot — {now_utc.strftime('%Y-%m-%d %H:%M UTC')}")
    print("=" * 55)

    if closing_only:
        print("MODE: Closing lines only (games starting within 45 min)")
    if dry_run:
        print("MODE: DRY-RUN — snapshots will not be written to disk")

    state = load_state()
    print(f"  Daily budget: {daily_used(state)}/{budget_cap} credits used so far")

    snapshots = load_snapshots()
    total_new = 0
    remaining = state.get("total_last_remaining", "?")

    active_sports = sports or list(SPORT_KEYS.keys())

    for sport_name in active_sports:
        sport_key = SPORT_KEYS.get(sport_name)
        if not sport_key:
            print(f"  {sport_name}: Unknown sport key, skipping")
            continue

        print(f"\n  {sport_name} ({sport_key}):")

        try:
            # Fetch US bookmakers
            events_us, remaining, used = fetch_sport_odds(
                api_key, sport_key, region='us', bookmakers=US_BOOKMAKERS,
                state=state, budget_cap=budget_cap,
            )
            print(f"    US books: {len(events_us)} events (cost: {used}, remaining: {remaining})")

            # Fetch Pinnacle (EU region)
            events_pin, remaining, used = fetch_sport_odds(
                api_key, sport_key, region='eu', bookmakers=[PINNACLE_KEY],
                state=state, budget_cap=budget_cap,
            )
            print(f"    Pinnacle: {len(events_pin)} events (cost: {used}, remaining: {remaining})")
        except OddsAPIBudgetExceeded as e:
            print(f"\n  HALT: {e}")
            save_state(state)
            return  # halt cleanly; do not raise from inside snapshot loop

        # Merge Pinnacle data into US events by event ID
        pin_by_id = {e.get('id'): e for e in events_pin}
        for event in events_us:
            eid = event.get('id')
            if eid in pin_by_id:
                # Add Pinnacle bookmaker to the event's bookmakers list
                pin_event = pin_by_id[eid]
                for bm in pin_event.get('bookmakers', []):
                    if bm.get('key') == PINNACLE_KEY:
                        event.setdefault('bookmakers', []).append(bm)

        new = process_events(events_us, sport_name, snapshots, now_utc, closing_only)
        total_new += new
        print(f"    Stored: {new} new snapshots")

    # Extract closing lines for games that have started
    closed = extract_closing_lines(snapshots)
    if closed:
        print(f"\n  Closing lines extracted: {closed} events")

    # Cleanup old snapshot data
    removed = cleanup_old_snapshots(snapshots)
    if removed:
        print(f"  Cleaned up: {removed} old events")

    if dry_run:
        print("\n  DRY-RUN: skipping save_snapshots()")
    else:
        save_snapshots(snapshots)

    save_state(state)

    # Summary
    total_events = len(snapshots)
    total_snaps = sum(len(e.get('snapshots', [])) for e in snapshots.values())
    closing_count = len(load_closing_lines())
    print(f"\n  Summary: {total_events} active events, {total_snaps} total snapshots")
    print(f"  Closing lines on file: {closing_count}")
    print(f"  Credits used today: {daily_used(state)} / {budget_cap}")
    print(f"  Credits remaining (plan): {remaining}")
    print("Done.\n")


def run_backfill(api_key, target_date, sports=None):
    """Backfill historical odds for a specific date.
    Captures opening line (~12 hours before first game) and closing line (~30 min before).
    Cost: 10 × 3 markets × 2 regions = 60 credits per sport per timestamp.
    """
    print(f"\nHistorical Backfill — {target_date}")
    print("=" * 55)
    print("WARNING: Historical queries cost 10x normal. Budget carefully.")

    active_sports = sports or list(SPORT_KEYS.keys())

    snapshots = load_snapshots()
    total_new = 0

    for sport_name in active_sports:
        sport_key = SPORT_KEYS.get(sport_name)
        if not sport_key:
            continue

        print(f"\n  {sport_name} ({sport_key}):")

        # First, get events for that date (morning snapshot = opening lines)
        morning = f"{target_date}T10:00:00Z"
        events, remaining, used, actual_ts, next_ts = fetch_historical_odds(
            api_key, sport_key, morning, region='us', bookmakers=US_BOOKMAKERS
        )
        print(f"    Morning snapshot ({actual_ts}): {len(events)} events (cost: {used})")

        # Get Pinnacle morning
        events_pin, remaining, used, _, _ = fetch_historical_odds(
            api_key, sport_key, morning, region='eu', bookmakers=[PINNACLE_KEY]
        )

        # Merge Pinnacle
        pin_by_id = {e.get('id'): e for e in events_pin}
        for event in events:
            eid = event.get('id')
            if eid in pin_by_id:
                for bm in pin_by_id[eid].get('bookmakers', []):
                    if bm.get('key') == PINNACLE_KEY:
                        event.setdefault('bookmakers', []).append(bm)

        # Process as opening snapshot
        morning_utc = datetime.fromisoformat(morning.replace('Z', '+00:00'))
        new = process_events(events, sport_name, snapshots, morning_utc, closing_only=False)
        total_new += new
        print(f"    Opening snapshots: {new}")

        # Evening snapshot (~30 min before typical game times)
        # Try a few windows to catch different start times
        for hour in ['18:30', '19:30', '23:30', '00:30']:
            evening = f"{target_date}T{hour}:00Z"
            events_eve, remaining, used, actual_ts, _ = fetch_historical_odds(
                api_key, sport_key, evening, region='us', bookmakers=US_BOOKMAKERS
            )
            if not events_eve:
                continue

            events_pin_eve, remaining, used, _, _ = fetch_historical_odds(
                api_key, sport_key, evening, region='eu', bookmakers=[PINNACLE_KEY]
            )

            pin_by_id_eve = {e.get('id'): e for e in events_pin_eve}
            for event in events_eve:
                eid = event.get('id')
                if eid in pin_by_id_eve:
                    for bm in pin_by_id_eve[eid].get('bookmakers', []):
                        if bm.get('key') == PINNACLE_KEY:
                            event.setdefault('bookmakers', []).append(bm)

            evening_utc = datetime.fromisoformat(evening.replace('Z', '+00:00'))
            new = process_events(events_eve, sport_name, snapshots, evening_utc, closing_only=False)
            total_new += new
            if new:
                print(f"    Closing snapshots ({hour} UTC): {new}")

    # Extract closing lines
    closed = extract_closing_lines(snapshots)
    save_snapshots(snapshots)

    print(f"\n  Total new snapshots: {total_new}")
    print(f"  Closing lines extracted: {closed}")
    print(f"  Credits remaining: {remaining}")
    print("Done.\n")


def main():
    parser = argparse.ArgumentParser(description='Game odds snapshot collector for CLV tracking')
    parser.add_argument('--closing-only', action='store_true',
                        help='Only capture lines for games starting within 45 min')
    parser.add_argument('--sport', type=str, default=None,
                        help='Single sport to fetch (e.g., NBA, NFL, NCAAMB)')
    parser.add_argument('--backfill', type=str, default=None,
                        help='Historical backfill for date (YYYY-MM-DD)')
    parser.add_argument('--key', type=str, default=None,
                        help='API key (overrides env/config)')
    parser.add_argument('--budget-cap', type=int, default=DEFAULT_DAILY_BUDGET,
                        help=f'Max credits per day (default {DEFAULT_DAILY_BUDGET}, '
                             f'plan is 20K/mo = ~660/day avg)')
    parser.add_argument('--dry-run', action='store_true',
                        help='Fetch and compute but do not persist snapshots')
    parser.add_argument('--verbose', '-v', action='store_true',
                        help='DEBUG-level logging')
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format='[odds] %(asctime)s %(levelname)s %(message)s',
        datefmt='%H:%M:%S',
    )

    try:
        api_key = args.key or get_api_key()
    except SystemExit:
        return 1

    sports = None
    if args.sport:
        sports = [args.sport.upper()]

    try:
        if args.backfill:
            run_backfill(api_key, args.backfill, sports)
        else:
            run_snapshot(
                api_key, sports,
                closing_only=args.closing_only,
                budget_cap=args.budget_cap,
                dry_run=args.dry_run,
            )
        return 0
    except OddsAPIBudgetExceeded as e:
        logging.error("Budget: %s", e)
        return OddsAPIBudgetExceeded.exit_code
    except OddsAPIAuthError as e:
        logging.error("Auth: %s", e)
        return OddsAPIAuthError.exit_code
    except OddsAPIError as e:
        logging.error("API: %s", e)
        return e.exit_code
    except KeyboardInterrupt:
        logging.error("Interrupted.")
        return 130


if __name__ == '__main__':
    sys.exit(main())
