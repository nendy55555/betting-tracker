"""
refresh_odds.py — Daily futures odds fetcher
─────────────────────────────────────────────
Fetches current championship futures odds from Bovada's public API
(no account or API key needed) and appends a daily snapshot
to odds_history.json for line movement tracking.

Run daily via cron, launchd, or manually:
    python refresh_odds.py

No setup required. Bovada's public odds API returns JSON.
"""

import os, sys, json
from datetime import datetime

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ODDS_HISTORY_FILE = os.path.join(SCRIPT_DIR, 'odds_history.json')

BOVADA_BASE = 'https://www.bovada.lv/services/sports/event/v2/events/A/description'

# Bovada URL paths for championship/futures markets
FUTURES_MARKETS = {
    'NBA':    '/basketball/nba-championship',
    'NFL':    '/football/nfl-specials',
    'MLB':    '/baseball/mlb-season-specials',
    'NHL':    '/hockey/nhl-specials',
    'NCAAMB': '/basketball/college-basketball/college-basketball-futures',
}

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
                  'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'application/json',
}


def load_history():
    if os.path.exists(ODDS_HISTORY_FILE):
        try:
            with open(ODDS_HISTORY_FILE) as f:
                return json.load(f)
        except:
            pass
    return {}


def save_history(history):
    with open(ODDS_HISTORY_FILE, 'w') as f:
        json.dump(history, f, indent=1)


def parse_bovada_american_odds(price_obj):
    """Extract American odds integer from Bovada price object."""
    if not price_obj:
        return None
    am = price_obj.get('american')
    if am:
        try:
            return int(am.replace('+', '').strip()) if am.startswith('-') else int(am)
        except (ValueError, TypeError):
            pass
    # Fallback: convert decimal to American
    dec = price_obj.get('decimal')
    if dec:
        try:
            d = float(dec)
            if d >= 2.0:
                return int(round((d - 1) * 100))
            elif d > 1.0:
                return int(round(-100 / (d - 1)))
        except:
            pass
    return None


def fetch_odds():
    """Fetch futures odds from Bovada for all major sports."""
    import requests

    all_odds = {}
    ts = datetime.utcnow().isoformat() + 'Z'

    for sport_name, path in FUTURES_MARKETS.items():
        url = BOVADA_BASE + path
        try:
            r = requests.get(url, headers=HEADERS, timeout=15)
            if r.status_code == 200:
                data = r.json()
                events = data if isinstance(data, list) else [data]
                count = 0
                for ev in events:
                    for dg in ev.get('displayGroups', []):
                        for mkt in dg.get('markets', []):
                            for outcome in mkt.get('outcomes', []):
                                name = outcome.get('description', '')
                                price = outcome.get('price', {})
                                odds = parse_bovada_american_odds(price)
                                if name and odds is not None:
                                    all_odds[name.lower()] = {
                                        'odds': odds,
                                        'bookmaker': 'Bovada',
                                        'sport': sport_name,
                                        'ts': ts,
                                    }
                                    count += 1
                print(f"  {sport_name}: {count} outcomes fetched")
            elif r.status_code == 404:
                print(f"  {sport_name}: Futures market not found (may be off-season)")
            else:
                print(f"  {sport_name}: HTTP {r.status_code}")
        except Exception as exc:
            print(f"  {sport_name}: Error: {exc}")

    return all_odds


def append_to_history(current_odds):
    """Append today's odds snapshot. One entry per team per calendar day."""
    if not current_odds:
        return 0
    history = load_history()
    today = datetime.utcnow().strftime('%Y-%m-%d')
    ts = datetime.utcnow().isoformat() + 'Z'
    new_count = 0

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
            entries.append({
                'odds': info['odds'],
                'bookmaker': info.get('bookmaker', ''),
                'ts': ts,
            })
            new_count += 1
        if len(entries) > 90:
            history[team] = entries[-90:]

    save_history(history)
    return new_count


def main():
    print(f"Futures Odds Refresh — {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}")
    print("=" * 50)
    print("Fetching odds from Bovada (free, no account needed)...")
    print("")

    odds = fetch_odds()
    print("")
    print(f"Total: {len(odds)} teams across all sports")

    new_entries = append_to_history(odds)
    print(f"History: {new_entries} new entries added to {ODDS_HISTORY_FILE}")

    history = load_history()
    total_entries = sum(len(v) for v in history.values())
    print(f"History file: {len(history)} teams, {total_entries} total data points")
    print("Done.")


if __name__ == '__main__':
    main()
