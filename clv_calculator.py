"""
clv_calculator.py — Closing Line Value calculation engine
─────────────────────────────────────────────────────────
Matches bets from the tracker to closing line data,
calculates no-vig CLV against Pinnacle, and produces
aggregate stats by sport and bet type.

Usage:
    from clv_calculator import calculate_clv_for_bets, aggregate_clv_stats

Or standalone:
    python3 clv_calculator.py              # Print CLV report
    python3 clv_calculator.py --json       # Output JSON for dashboard
"""

import os
import sys
import json
import re
import math
from datetime import datetime

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CLOSING_LINES_FILE = os.path.join(SCRIPT_DIR, 'closing_lines.json')


# ── Odds math ────────────────────────────────────────────────────────────────

def american_to_implied(odds):
    """Convert American odds to implied probability (0-1)."""
    if odds is None:
        return None
    odds = float(odds)
    if odds == 0:
        return None
    if odds > 0:
        return 100.0 / (odds + 100.0)
    else:
        return abs(odds) / (abs(odds) + 100.0)


def implied_to_american(prob):
    """Convert implied probability (0-1) to American odds."""
    if prob is None or prob <= 0 or prob >= 1:
        return None
    if prob > 0.5:
        return round(-100 * prob / (1 - prob))
    else:
        return round(100 * (1 - prob) / prob)


def remove_vig_two_way(odds_a, odds_b):
    """Remove vig from a two-way market.
    Returns (fair_prob_a, fair_prob_b) as true probabilities summing to 1.0.
    Uses the multiplicative method (industry standard)."""
    imp_a = american_to_implied(odds_a)
    imp_b = american_to_implied(odds_b)

    if imp_a is None or imp_b is None:
        return None, None

    total = imp_a + imp_b  # overround (e.g., 1.045 for 4.5% vig)
    if total <= 0:
        return None, None

    fair_a = imp_a / total
    fair_b = imp_b / total
    return fair_a, fair_b


def calculate_clv_percentage(bet_odds, closing_fair_prob):
    """Calculate CLV as a percentage.

    CLV% = (closing_fair_prob / bet_implied_prob - 1) × 100

    Positive = you got better odds than the closing line (good).
    Negative = you got worse odds (bad).

    Example: You bet at -110 (52.38%), closing no-vig is 51% →
             CLV = (0.51 / 0.5238 - 1) × 100 = -2.6% (negative, you bet worse than close)

    Example: You bet at +150 (40%), closing no-vig is 42% →
             CLV = (0.42 / 0.40 - 1) × 100 = +5.0% (positive, line moved toward you)
    """
    bet_implied = american_to_implied(bet_odds)
    if bet_implied is None or closing_fair_prob is None or bet_implied <= 0:
        return None

    # CLV = how much the closing probability exceeds your implied probability
    # If closing prob > your prob, the market moved toward your side = positive CLV
    clv = (closing_fair_prob / bet_implied - 1) * 100
    return round(clv, 3)


# ── Bet matching ─────────────────────────────────────────────────────────────

def normalize_team_name(name):
    """Normalize team name for fuzzy matching.
    Strips common suffixes, lowercases, removes punctuation."""
    if not name:
        return ''
    name = name.lower().strip()
    # Remove common suffixes and noise
    name = re.sub(r'\b(state|st\.?|university|univ\.?)\b', 'st', name)
    name = re.sub(r'[^a-z0-9\s]', '', name)
    name = re.sub(r'\s+', ' ', name).strip()
    return name


def team_name_matches(bet_teams, event_home, event_away):
    """Check if a bet's teams/event string matches a closing line event.
    Returns 'home', 'away', or None."""
    bt = normalize_team_name(bet_teams)
    home = normalize_team_name(event_home)
    away = normalize_team_name(event_away)

    if not bt or (not home and not away):
        return None

    # Check if bet mentions home or away team
    # Use substring matching for flexibility
    home_words = set(home.split())
    away_words = set(away.split())
    bt_words = set(bt.split())

    # Score by word overlap
    home_overlap = len(home_words & bt_words)
    away_overlap = len(away_words & bt_words)

    # Need at least 1 word match and more overlap with one side
    if home_overlap > 0 and home_overlap >= away_overlap:
        return 'home'
    elif away_overlap > 0:
        return 'away'

    return None


def infer_bet_market(bet_type, line):
    """Infer which market a bet belongs to from bet type and line info.
    Returns 'h2h', 'spreads', or 'totals'."""
    bt = (bet_type or '').lower()
    ln = (line or '').lower()

    if 'over' in ln or 'under' in ln or 'total' in ln or 'o/u' in ln:
        return 'totals'
    if 'ml' in ln or 'moneyline' in bt or 'ml' in bt:
        return 'h2h'
    if re.search(r'[+-]\d', ln):
        return 'spreads'
    # Default to moneyline if no line info
    return 'h2h'


def infer_bet_side(line, bet_teams, event_home, event_away):
    """For totals, determine if bet is over or under.
    For spreads/ML, determine home or away."""
    ln = (line or '').lower()

    if 'over' in ln:
        return 'Over'
    if 'under' in ln:
        return 'Under'

    # For sides, use team matching
    return team_name_matches(bet_teams, event_home, event_away)


def match_bet_to_closing(bet, closing_lines):
    """Try to match a bet record to a closing line event.

    Matching strategy:
    1. Match by sport
    2. Match by date (same day)
    3. Match by team names (fuzzy)

    Returns (event_id, closing_record) or (None, None).
    """
    bet_sport = (bet.get('sport', '') or '').upper()
    bet_teams = bet.get('teams', '') or bet.get('pick', '')
    bet_date = bet.get('addedDate', '') or bet.get('gameTime', '')

    # Parse bet date to just the date portion
    bet_date_str = ''
    if bet_date:
        try:
            # Try various date formats
            for fmt in ['%Y-%m-%dT%H:%M:%S', '%Y-%m-%d', '%b-%d-%Y', '%b-%d-%Y %I:%M %p']:
                try:
                    d = datetime.strptime(bet_date[:19], fmt)
                    bet_date_str = d.strftime('%Y-%m-%d')
                    break
                except ValueError:
                    continue
        except Exception:
            pass

    # Sport mapping for comparison
    sport_map = {
        'NBA': 'NBA', 'NFL': 'NFL', 'NCAAMB': 'NCAAMB', 'NCAAWB': 'NCAAWB',
        'CBB': 'NCAAMB', 'SOCCER': 'Soccer', 'MLS': 'Soccer',
    }
    normalized_sport = sport_map.get(bet_sport, bet_sport)

    best_match = None
    best_score = 0

    for event_id, cl in closing_lines.items():
        # Sport must match
        cl_sport = (cl.get('sport', '') or '').upper()
        if cl_sport != normalized_sport.upper():
            continue

        # Date should match (same day)
        cl_commence = cl.get('commence_time', '')
        if cl_commence and bet_date_str:
            cl_date = cl_commence[:10]
            if cl_date != bet_date_str:
                continue

        # Team name matching
        side = team_name_matches(bet_teams, cl.get('home', ''), cl.get('away', ''))
        if side is None:
            continue

        # Score the match (prefer exact team matches)
        score = 1
        if side:
            score = 2

        if score > best_score:
            best_score = score
            best_match = (event_id, cl)

    return best_match or (None, None)


def get_closing_odds_for_bet(bet, closing_record):
    """Extract the relevant closing line odds for a specific bet.

    Returns dict with:
    {
        'closing_odds': int (American),
        'closing_fair_prob': float (no-vig),
        'opening_odds': int (American, if available),
        'pinnacle_available': bool,
        'market': str,
        'source': str,
    }
    """
    line = bet.get('line', '') or ''
    bet_type = bet.get('type', '') or bet.get('betType', '') or ''
    bet_teams = bet.get('teams', '') or bet.get('pick', '') or ''
    bet_odds = bet.get('odds')

    market = infer_bet_market(bet_type, line)
    home = closing_record.get('home', '')
    away = closing_record.get('away', '')

    # Determine which side of the market the bet is on
    if market == 'totals':
        side = 'Over' if 'over' in line.lower() else 'Under'
        other_side = 'Under' if side == 'Over' else 'Over'
    else:
        matched_side = team_name_matches(bet_teams, home, away)
        if matched_side == 'home':
            side = home
            other_side = away
        elif matched_side == 'away':
            side = away
            other_side = home
        else:
            return None

    result = {
        'market': market,
        'side': side,
        'pinnacle_available': False,
        'source': 'none',
    }

    # Try Pinnacle first (sharp benchmark)
    pinnacle = closing_record.get('pinnacle', {})
    if pinnacle and market in pinnacle:
        mkt_data = pinnacle[market]
        side_data = mkt_data.get(side, {})
        other_data = mkt_data.get(other_side, {})

        if market in ('spreads', 'totals'):
            side_odds = side_data.get('price') if isinstance(side_data, dict) else None
            other_odds = other_data.get('price') if isinstance(other_data, dict) else None
        else:
            side_odds = side_data if not isinstance(side_data, dict) else None
            other_odds = other_data if not isinstance(other_data, dict) else None

        if side_odds is not None and other_odds is not None:
            fair_a, fair_b = remove_vig_two_way(side_odds, other_odds)
            if fair_a is not None:
                result['closing_odds'] = side_odds
                result['closing_fair_prob'] = fair_a
                result['pinnacle_available'] = True
                result['source'] = 'pinnacle'

    # Fallback to US books consensus if no Pinnacle
    if result['source'] == 'none':
        us_books = closing_record.get('us_books', {})
        all_odds_for_side = []
        all_odds_for_other = []

        for bm_key, bm_data in us_books.items():
            if market not in bm_data:
                continue
            mkt_data = bm_data[market]
            side_data = mkt_data.get(side, {})
            other_data = mkt_data.get(other_side, {})

            if market in ('spreads', 'totals'):
                s_odds = side_data.get('price') if isinstance(side_data, dict) else None
                o_odds = other_data.get('price') if isinstance(other_data, dict) else None
            else:
                s_odds = side_data if not isinstance(side_data, dict) else None
                o_odds = other_data if not isinstance(other_data, dict) else None

            if s_odds is not None:
                all_odds_for_side.append(s_odds)
            if o_odds is not None:
                all_odds_for_other.append(o_odds)

        if all_odds_for_side and all_odds_for_other:
            # Use median as consensus
            avg_side = sorted(all_odds_for_side)[len(all_odds_for_side) // 2]
            avg_other = sorted(all_odds_for_other)[len(all_odds_for_other) // 2]
            fair_a, fair_b = remove_vig_two_way(avg_side, avg_other)
            if fair_a is not None:
                result['closing_odds'] = avg_side
                result['closing_fair_prob'] = fair_a
                result['source'] = 'us_consensus'

    # Get opening line if available
    opening = closing_record.get('opening', {})
    if opening:
        pin_open = opening.get('pinnacle', {})
        if pin_open and market in pin_open:
            mkt_data = pin_open[market]
            side_data = mkt_data.get(side, {})
            if market in ('spreads', 'totals'):
                result['opening_odds'] = side_data.get('price') if isinstance(side_data, dict) else None
            else:
                result['opening_odds'] = side_data if not isinstance(side_data, dict) else None

    return result


# ── Aggregate CLV stats ──────────────────────────────────────────────────────

def calculate_clv_for_bets(bets, closing_lines=None):
    """Calculate CLV for a list of bet dicts.

    Each bet should have at minimum: odds, teams, sport, type/betType, line, addedDate/gameTime

    Returns list of bet dicts with CLV fields added:
    - clv_pct: CLV percentage (positive = good)
    - closing_fair_prob: no-vig closing probability
    - closing_odds: raw closing odds (American)
    - opening_odds: raw opening odds if available
    - clv_source: 'pinnacle' or 'us_consensus'
    - clv_matched: True if a closing line was found
    """
    if closing_lines is None:
        closing_lines = load_closing_lines_data()

    results = []
    for bet in bets:
        bet_result = dict(bet)
        bet_result['clv_matched'] = False
        bet_result['clv_pct'] = None

        # Skip parlays, futures, live bets
        bt = (bet.get('type', '') or '').lower()
        if bt in ('parlay', 'future'):
            bet_result['clv_skip_reason'] = f'Excluded: {bt}'
            results.append(bet_result)
            continue

        # Skip if no odds
        bet_odds = bet.get('odds')
        if bet_odds is None:
            bet_result['clv_skip_reason'] = 'No odds on bet'
            results.append(bet_result)
            continue

        # Match to closing line
        event_id, cl_record = match_bet_to_closing(bet, closing_lines)
        if cl_record is None:
            bet_result['clv_skip_reason'] = 'No closing line match'
            results.append(bet_result)
            continue

        # Get closing odds for this specific bet
        cl_data = get_closing_odds_for_bet(bet, cl_record)
        if cl_data is None or 'closing_fair_prob' not in cl_data:
            bet_result['clv_skip_reason'] = 'Could not extract closing odds'
            results.append(bet_result)
            continue

        # Calculate CLV
        clv = calculate_clv_percentage(bet_odds, cl_data['closing_fair_prob'])

        bet_result['clv_matched'] = True
        bet_result['clv_pct'] = clv
        bet_result['closing_odds'] = cl_data.get('closing_odds')
        bet_result['closing_fair_prob'] = cl_data.get('closing_fair_prob')
        bet_result['opening_odds'] = cl_data.get('opening_odds')
        bet_result['clv_source'] = cl_data.get('source', '')
        bet_result['clv_market'] = cl_data.get('market', '')
        bet_result['clv_event_id'] = event_id

        results.append(bet_result)

    return results


def aggregate_clv_stats(clv_bets):
    """Compute aggregate CLV statistics from a list of CLV-enriched bet dicts.

    Returns:
    {
        "overall": { "avg_clv": float, "median_clv": float, "positive_rate": float, "count": int },
        "by_sport": { "NBA": {...}, "NFL": {...}, ... },
        "by_market": { "h2h": {...}, "spreads": {...}, "totals": {...} },
        "by_source": { "pinnacle": {...}, "us_consensus": {...} },
        "trending": [ { "period": "last_30", "avg_clv": float }, ... ]
    }
    """
    def compute_group(bets_in_group):
        clvs = [b['clv_pct'] for b in bets_in_group if b.get('clv_pct') is not None]
        if not clvs:
            return {'avg_clv': None, 'median_clv': None, 'positive_rate': None, 'count': 0, 'matched': 0}

        clvs_sorted = sorted(clvs)
        n = len(clvs)
        median = clvs_sorted[n // 2] if n % 2 == 1 else (clvs_sorted[n // 2 - 1] + clvs_sorted[n // 2]) / 2
        positive = sum(1 for c in clvs if c > 0)

        return {
            'avg_clv': round(sum(clvs) / n, 3),
            'median_clv': round(median, 3),
            'positive_rate': round(positive / n * 100, 1),
            'count': len(bets_in_group),
            'matched': n,
            'total_clv_units': round(sum(clvs), 2),
        }

    matched_bets = [b for b in clv_bets if b.get('clv_matched')]

    stats = {
        'overall': compute_group(matched_bets),
        'by_sport': {},
        'by_market': {},
        'by_source': {},
    }

    # Group by sport
    sports = set(b.get('sport', 'Other') for b in matched_bets)
    for sport in sports:
        group = [b for b in matched_bets if b.get('sport', 'Other') == sport]
        stats['by_sport'][sport] = compute_group(group)

    # Group by market type
    markets = set(b.get('clv_market', 'unknown') for b in matched_bets)
    for market in markets:
        group = [b for b in matched_bets if b.get('clv_market', 'unknown') == market]
        stats['by_market'][market] = compute_group(group)

    # Group by source
    sources = set(b.get('clv_source', 'unknown') for b in matched_bets)
    for source in sources:
        group = [b for b in matched_bets if b.get('clv_source', 'unknown') == source]
        stats['by_source'][source] = compute_group(group)

    # Unmatched summary
    unmatched = [b for b in clv_bets if not b.get('clv_matched')]
    stats['unmatched'] = {
        'count': len(unmatched),
        'reasons': {}
    }
    for b in unmatched:
        reason = b.get('clv_skip_reason', 'unknown')
        stats['unmatched']['reasons'][reason] = stats['unmatched']['reasons'].get(reason, 0) + 1

    return stats


def load_closing_lines_data():
    """Load closing lines from disk."""
    if os.path.exists(CLOSING_LINES_FILE):
        try:
            with open(CLOSING_LINES_FILE) as f:
                return json.load(f)
        except Exception:
            pass
    return {}


def main():
    """Standalone mode: load bets from server, calculate CLV, print report."""
    import argparse
    parser = argparse.ArgumentParser(description='CLV Calculator')
    parser.add_argument('--json', action='store_true', help='Output as JSON')
    args = parser.parse_args()

    # Try to load bets from local server
    try:
        import requests
        r = requests.get('http://localhost:5001/api/bets', timeout=5)
        bets = r.json() if r.status_code == 200 else []
    except Exception:
        print("Could not connect to server at localhost:5001. Make sure server.py is running.")
        sys.exit(1)

    closing = load_closing_lines_data()
    if not closing:
        print("No closing lines data found. Run refresh_game_odds.py first.")
        sys.exit(1)

    print(f"Loaded {len(bets)} bets and {len(closing)} closing line records.\n")

    # Calculate CLV
    clv_bets = calculate_clv_for_bets(bets, closing)
    stats = aggregate_clv_stats(clv_bets)

    if args.json:
        print(json.dumps(stats, indent=2))
        return

    # Print report
    overall = stats['overall']
    print("═" * 50)
    print("  CLV REPORT")
    print("═" * 50)
    print(f"  Bets analyzed:    {overall['count']}")
    print(f"  Matched to close: {overall['matched']}")
    print(f"  Average CLV:      {overall['avg_clv']}%")
    print(f"  Median CLV:       {overall['median_clv']}%")
    print(f"  Positive CLV %:   {overall['positive_rate']}%")
    print()

    print("  BY SPORT:")
    for sport, data in sorted(stats['by_sport'].items()):
        print(f"    {sport:12s}  avg {data['avg_clv']:+.2f}%  ({data['matched']} bets, "
              f"{data['positive_rate']}% positive)")
    print()

    print("  BY MARKET:")
    for market, data in sorted(stats['by_market'].items()):
        print(f"    {market:12s}  avg {data['avg_clv']:+.2f}%  ({data['matched']} bets)")
    print()

    unmatched = stats['unmatched']
    if unmatched['count'] > 0:
        print(f"  UNMATCHED: {unmatched['count']} bets")
        for reason, count in unmatched['reasons'].items():
            print(f"    {reason}: {count}")


if __name__ == '__main__':
    main()
