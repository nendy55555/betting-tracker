#!/usr/bin/env python3
"""
fetch_upcoming_games.py — Pre-fetch today's sports schedule from ESPN
─────────────────────────────────────────────────────────────────────
Run manually or via the Cowork scheduled task at 2:30 AM to warm the cache
so betting-tracker.html has instant data on next open.

Saves output to: upcoming_games_cache.json
Served by server.py at: GET /api/upcoming-games

Usage:
    python fetch_upcoming_games.py
"""

import json, datetime, urllib.request, sys, os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CACHE_FILE = os.path.join(SCRIPT_DIR, "upcoming_games_cache.json")

# Endpoints — ESPN public scoreboard API (no key required)
ENDPOINTS = [
    {"key": "NBA",        "sport": "NBA",    "league": "NBA",
     "url": "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard"},
    {"key": "NFL",        "sport": "NFL",    "league": "NFL",
     "url": "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard"},
    {"key": "NCAAMB",     "sport": "CBB",    "league": "NCAAMB",   "marchOnly": True,
     "url": "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?groups=100&limit=50"},
    {"key": "NCAAWB",     "sport": "CBB",    "league": "NCAAWB",   "marchOnly": True,
     "url": "https://site.api.espn.com/apis/site/v2/sports/basketball/womens-college-basketball/scoreboard?groups=100&limit=50"},
    {"key": "EPL",        "sport": "Soccer", "league": "EPL",
     "url": "https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard"},
    {"key": "LaLiga",     "sport": "Soccer", "league": "La Liga",
     "url": "https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/scoreboard"},
    {"key": "Bundesliga", "sport": "Soccer", "league": "Bundesliga",
     "url": "https://site.api.espn.com/apis/site/v2/sports/soccer/ger.1/scoreboard"},
    {"key": "SerieA",     "sport": "Soccer", "league": "Serie A",
     "url": "https://site.api.espn.com/apis/site/v2/sports/soccer/ita.1/scoreboard"},
    {"key": "Ligue1",     "sport": "Soccer", "league": "Ligue 1",
     "url": "https://site.api.espn.com/apis/site/v2/sports/soccer/fra.1/scoreboard"},
    {"key": "UCL",        "sport": "Soccer", "league": "UCL",
     "url": "https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.champions/scoreboard"},
    {"key": "EL",         "sport": "Soccer", "league": "Europa League",
     "url": "https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.europa/scoreboard"},
]


def is_march_madness():
    now = datetime.datetime.now()
    m, d = now.month, now.day
    return (m == 3 and d >= 12) or (m == 4 and d <= 10)


def fetch_endpoint(ep):
    """Fetch one ESPN endpoint and return list of normalized game dicts."""
    try:
        req = urllib.request.Request(ep["url"], headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
    except Exception as e:
        print(f"  ⚠  {ep['league']}: {e}", file=sys.stderr)
        return []

    games = []
    for ev in data.get("events", []):
        comp = (ev.get("competitions") or [None])[0]
        if not comp:
            continue
        home, away = None, None
        for c in comp.get("competitors", []):
            if c.get("homeAway") == "home":
                home = c
            else:
                away = c
        if not home or not away:
            continue

        st = (comp.get("status") or {}).get("type", {})
        is_live  = st.get("name") in ("STATUS_IN_PROGRESS", "STATUS_HALFTIME")
        is_half  = st.get("name") == "STATUS_HALFTIME"
        is_final = bool(st.get("completed"))

        def get_record(c):
            for r in c.get("records", []):
                if r.get("name") in ("overall",) or r.get("type") == "total":
                    return r.get("summary", "")
            recs = c.get("records", [])
            return recs[0].get("summary", "") if recs else ""

        def get_rank(c):
            rank = (c.get("curatedRank") or {}).get("current")
            return f"#{rank}" if rank and int(rank) <= 25 else ""

        odds_arr = comp.get("odds", [])
        odds = None
        if odds_arr:
            o = odds_arr[0]
            ht = o.get("homeTeamOdds") or {}
            at = o.get("awayTeamOdds") or {}
            odds = {
                "spread":  o.get("spread"),
                "spreadDetail": o.get("details", ""),
                "total":   o.get("overUnder"),
                "homeML":  ht.get("moneyLine"),
                "awayML":  at.get("moneyLine"),
            }

        broadcasts = comp.get("broadcasts", [])
        network = ""
        if broadcasts:
            names = broadcasts[0].get("names", [])
            if names:
                network = names[0]

        games.append({
            "id":     ev.get("id", ""),
            "sport":  ep["sport"],
            "league": ep["league"],
            "date":   comp.get("date") or ev.get("date", ""),
            "isLive":  is_live,
            "isHalf":  is_half,
            "isFinal": is_final,
            "statusDetail": (comp.get("status") or {}).get("type", {}).get("shortDetail", ""),
            "network": network,
            "home": {
                "abbrev": home["team"].get("abbreviation", ""),
                "name":   home["team"].get("shortDisplayName") or home["team"].get("displayName", ""),
                "record": get_record(home),
                "rank":   get_rank(home),
                "score":  home.get("score", ""),
                "logo":   home["team"].get("logo", ""),
            },
            "away": {
                "abbrev": away["team"].get("abbreviation", ""),
                "name":   away["team"].get("shortDisplayName") or away["team"].get("displayName", ""),
                "record": get_record(away),
                "rank":   get_rank(away),
                "score":  away.get("score", ""),
                "logo":   away["team"].get("logo", ""),
            },
            "odds": odds,
        })
    return games


def main():
    march = is_march_madness()
    all_games = []
    for ep in ENDPOINTS:
        if ep.get("marchOnly") and not march:
            continue
        print(f"  Fetching {ep['league']}...", end=" ", flush=True)
        games = fetch_endpoint(ep)
        print(f"{len(games)} games")
        all_games.extend(games)

    # Sort by date ascending
    all_games.sort(key=lambda g: g.get("date", ""))

    cache = {
        "fetchedAt":  int(datetime.datetime.now().timestamp() * 1000),  # ms for JS
        "fetchedDate": datetime.date.today().isoformat(),
        "games": all_games,
    }

    with open(CACHE_FILE, "w") as f:
        json.dump(cache, f)

    print(f"\n✓ Saved {len(all_games)} games to upcoming_games_cache.json")


if __name__ == "__main__":
    print(f"Fetching upcoming games for {datetime.date.today()}...")
    main()
