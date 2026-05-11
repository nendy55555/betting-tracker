# Betting Tracker

A personal sports-bet tracking system with a Python backend and a static HTML/JS frontend. Tracks straight bets and parlays, calculates CLV (closing line value), and renders a dashboard with W/L record, P&L, ROI, and per-sport/per-bet-type breakdowns.

Live demo: _coming soon (Vercel)_

## What's in here

- `betting-tracker.html` — main dashboard
- `clv-tracker.html` — CLV (closing line value) analysis
- `recap-report.html` — historical recap
- `server.py` — Flask backend that reads/writes the local Excel store and serves odds APIs
- `refresh_*.py` — odds-pulling scripts (Bovada, Locks25, The Odds API)
- `js/`, `css/` — frontend assets
- `tests/` — pytest + jsdom test suite
- `docs/` — architecture notes, decisions log, deploy runbook

## Local setup

```bash
# 1. Clone
git clone https://github.com/nendy55555/betting-tracker.git
cd betting-tracker

# 2. Python deps
pip install -r requirements.txt

# 3. Config — copy templates and fill in your own keys
cp .env.example .env
cp game_odds_config.example.json game_odds_config.json
cp futures_config.example.json futures_config.json

# 4. Run the server (default port 5001)
python3 server.py
# → http://localhost:5001
```

## Data privacy

This is a personal project. Real bet records (`Betting_Tracker*.xlsx`) and API keys are gitignored and never committed. The repo contains only code — not data.

## License

Personal project, no license. Code is shared for portfolio / reference purposes.
