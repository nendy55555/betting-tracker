#!/usr/bin/env python3
"""
refresh_futures.py — Daily futures odds refresh for BetTracker Pro.

Reads the API key from futures_config.json (saved automatically the first time
you open the Futures tab with your key entered in Settings).

Can be run two ways:
  1. Via the running Flask server (preferred — uses server cache + history):
       curl "http://localhost:5001/api/futures-odds?sports=nba,ncaamb,soccer_ucl,soccer_epl&force_refresh=1"
  2. Standalone (server not required — fetches directly and saves to futures_cache.json):
       python3 refresh_futures.py

The scheduled task uses method 1 when the server is running, method 2 as fallback.
"""

import json
import os
import sys
import time
import requests

SCRIPT_DIR         = os.path.dirname(os.path.abspath(__file__))
FUTURES_CONFIG     = os.path.join(SCRIPT_DIR, 'futures_config.json')
FUTURES_CACHE      = os.path.join(SCRIPT_DIR, 'futures_cache.json')
ODDS_HISTORY_FILE  = os.path.join(SCRIPT_DIR, 'odds_history.json')
SERVER_URL         = 'http://localhost:5001'

THE_ODDS_API_BASE  = 'https://api.the-odds-api.com/v4/sports'
THE_ODDS_API_SPORTS = {
    'nba':        'basketball_nba_championship_winner',
    'ncaamb':     'basketball_ncaab_championship_winner',
    'nfl':        'americanfootball_nfl_super_bowl_winner',
    'mlb':        'baseball_mlb_world_series_winner',
    'nhl':        'icehockey_nhl_championship_winner',
    'soccer_ucl': 'soccer_uefa_champs_league_winner',
    'soccer_epl': 'soccer_epl_winner',
}

PREFERRED_BOOKS = ['fanduel', 'draftkings', 'betmgm', 'bovada', 'williamhill_us', 'betonlineag']

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
                  'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'application/json',
}


def load_config():
    if os.path.exists(FUTURES_CONFIG):
        try:
            with open(FUTURES_CONFIG) as f:
                return json.load(f)
        except Exception:
            pass
    return {}


def append_odds_history(current_odds):
    """Append today's snapshot to odds_history.json (same logic as server.py)."""
    history = {}
    if os.path.exists(ODDS_HISTORY_FILE):
        try:
            with open(ODDS_HISTORY_FILE) as f:
                history = json.load(f)
        except Exception:
            pass

    from datetime import datetime, timezone
    today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    ts    = datetime.now(timezone.utc).isoformat()

    for team, info in current_odds.items():
        if team not in history:
            history[team] = []
        entries = history[team]
        already_today = False
        for e in entries:
            if e.get('ts', '').startswith(today):
                e['odds'] = info['odds']
                e['bookmaker'] = info.get('bookmaker', '')
                e['ts'] = ts
                already_today = True
                break
        if not already_today:
            entries.append({'odds': info['odds'], 'bookmaker': info.get('bookmaker', ''), 'ts': ts})
        if len(entries) > 90:
            history[team] = entries[-90:]

    with open(ODDS_HISTORY_FILE, 'w') as f:
        json.dump(history, f, indent=1)


def fetch_via_server(sports, api_key):
    """Hit the running Flask server — cache-busting via force_refresh param."""
    sports_str = ','.join(sports)
    url = f'{SERVER_URL}/api/futures-odds?sports={sports_str}&force_refresh=1'
    if api_key:
        url += f'&odds_api_key={api_key}'
    try:
        r = requests.get(url, timeout=30)
        if r.status_code == 200:
            data = r.json()
            if data.get('ok') and data.get('odds'):
                print(f'  Server: {data.get("count", 0)} teams from {data.get("source", "?")}')
                return data['odds']
    except Exception as e:
        print(f'  Server not reachable: {e}')
    return None


def fetch_direct(sports, api_key):
    """Fetch directly from The Odds API (no server required)."""
    if not api_key:
        print('  No API key — skipping direct fetch.')
        return {}

    all_odds = {}
    for sport in sports:
        sport_key = THE_ODDS_API_SPORTS.get(sport)
        if not sport_key:
            print(f'  {sport}: no mapping — skipping')
            continue
        url = f'{THE_ODDS_API_BASE}/{sport_key}/odds/'
        params = {
            'apiKey': api_key,
            'regions': 'us',
            'markets': 'outrights',
            'oddsFormat': 'american',
        }
        try:
            r = requests.get(url, params=params, headers=HEADERS, timeout=15)
            remaining = r.headers.get('x-requests-remaining', '?')
            if r.status_code == 200:
                events = r.json()
                count = 0
                for event in events:
                    bookmakers = event.get('bookmakers', [])
                    chosen_bm = None
                    for pref in PREFERRED_BOOKS:
                        for bm in bookmakers:
                            if bm.get('key') == pref:
                                chosen_bm = bm
                                break
                        if chosen_bm:
                            break
                    if not chosen_bm and bookmakers:
                        chosen_bm = bookmakers[0]
                    if not chosen_bm:
                        continue
                    for market in chosen_bm.get('markets', []):
                        if market.get('key') == 'outrights':
                            for outcome in market.get('outcomes', []):
                                name  = outcome.get('name', '')
                                price = outcome.get('price')
                                if name and price is not None:
                                    try:
                                        all_odds[name.lower()] = {
                                            'odds': round(float(price)),
                                            'bookmaker': chosen_bm.get('title', 'The Odds API'),
                                        }
                                        count += 1
                                    except (ValueError, TypeError):
                                        pass
                print(f'  [{sport}]: {count} teams fetched (remaining requests: {remaining})')
            elif r.status_code == 401:
                print(f'  [{sport}]: invalid API key')
            elif r.status_code == 429:
                print(f'  [{sport}]: quota exceeded for this month')
            else:
                print(f'  [{sport}]: HTTP {r.status_code}')
        except Exception as e:
            print(f'  [{sport}]: error — {e}')

    return all_odds


def save_cache(odds):
    """Write odds to futures_cache.json so server.py can serve it on next request."""
    payload = {
        'odds':      odds,
        'count':     len(odds),
        'source':    'scheduled_refresh',
        'timestamp': time.time(),
    }
    with open(FUTURES_CACHE, 'w') as f:
        json.dump(payload, f, indent=1)
    print(f'  Saved {len(odds)} teams to futures_cache.json')


def main():
    from datetime import datetime
    print(f'[{datetime.now().strftime("%Y-%m-%d %H:%M:%S")}] BetTracker — futures odds refresh')

    cfg     = load_config()
    api_key = cfg.get('odds_api_key', '').strip()
    sports  = cfg.get('sports', ['nba', 'ncaamb', 'soccer_ucl', 'soccer_epl'])

    if not api_key:
        print('  No API key in futures_config.json.')
        print('  Open the Futures tab once with your key entered in Settings to save it.')
        sys.exit(0)

    print(f'  Sports: {", ".join(sports)}')

    # Try the server first; fall back to direct fetch if it isn't running
    odds = fetch_via_server(sports, api_key)
    if not odds:
        print('  Falling back to direct The Odds API fetch...')
        odds = fetch_direct(sports, api_key)

    if odds:
        save_cache(odds)
        append_odds_history(odds)
        print(f'  Done — {len(odds)} teams updated.')
    else:
        print('  No odds returned. Check your API key and internet connection.')


if __name__ == '__main__':
    main()
