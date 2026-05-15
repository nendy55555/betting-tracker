# Session state

> Update this at the end of every Cowork or Claude session.
> The next session reads this first — before QUICKSTART — to restore context instantly.
> Keep it to one screen. Ruthlessly overwrite old content.

---

## Last updated
2026-05-14 · Status review + SESSION-STATE housekeeping; 3 post-session features merged via PR #6

## What was completed this session (2026-05-14 — housekeeping)

Merged 3 features from branch work that landed after the 2026-05-11 design pass:

- **Rolling bankroll equity curve** (Home tab) — line chart of cumulative P&L over time. Commit `d913d49`.
- **Consensus pressure badge** on open bet cards — shows public betting % when available. Commit `f0d42bb`.
- **Peer bets + Action Network sharp action** on Open Bets tab — shows what other users bet on same games + sharp money indicators from Action Network. Commit `9f93396`.

Also cleared stale known issue: credentials were migrated to `.env` (python-dotenv) in Q1 2026 per DECISIONS.md — the old "hardcoded credentials" entry is no longer accurate.

---

## What was completed this session (2026-05-11, evening — design pass)

Acted on the 12-item priority list in `UI_UX_REVIEW.md`. Files touched: `css/styles.css`, `js/dashboard.js`, `js/sync.js`, `betting-tracker.html`.

- **Server-down banner** — sticky yellow banner above the header that surfaces when `/api/bets` fetch fails. Auto-retries every 20s, manual Retry button. `pingServer()` lives in `js/sync.js`, called on `init()` + on demand. Banner DOM in `betting-tracker.html` (before `.header`).
- **Skeleton loaders** — `showSkeletonsIfEmpty()` paints 4 shimmer placeholders in the Open/Settled panels on first-ever load (when localStorage is empty). Cleared by the next `renderAll()` once sync resolves.
- **Hero stat cards promoted** — `--fs-3xl: 2rem` added; `.stat-card.hero .value` bumped from `--fs-2xl` (1.75rem) to `--fs-3xl`. Top stripe thickened 2px → 3px. `.hero.negative` (red stripe) and `.hero.neutral` (gray stripe) variants render dynamically from Record + P/L sign in `renderDashStats()`.
- **Count-up animation** — `.stat-card.hero .value[data-countup]` animates from 0 to target over 600ms on first render. Currently wired for P/L. Flag `window._dashHeroAnimated` prevents replay on filter changes.
- **Tab fade** — `.tab-content.active` now runs a 0.18s `tabFadeIn` keyframe animation; previous `display:none/block` was killing the fade.
- **Sport colors moved to :root** — `--sport-nba`, `--sport-nfl`, `--sport-ncaamb`, `--sport-ncaawb`, `--sport-mlb`, `--sport-nhl`. NBA bumped from `#ff9800` (3.7:1 AA fail) to `#ff9c33` (passes). All sport tags now `var(--fs-sm)` instead of `var(--fs-xs)`.
- **Zero P/L is neutral** — Profit of exactly 0 now renders blue/gray (`.hero.neutral`) instead of green.
- **Settled futures muted** — `.future-card.settled` gets `opacity: .55` + subtle gradient. Hover lifts to full opacity. "Settled Futures" subsection divider auto-inserts before the first settled card.
- **Mobile chatbot dropped** — 300px → 240px at `<600px` viewport.
- **Mobile refresh-btn / settings-btn min-height** — 22px → 36px at `<768px` viewport.
- **Bet-card border-radius normalized** — 8px → `var(--radius)` (10px) so all cards match.
- **Orphan font sizes killed** — `0.7rem` (`.bl-edit-btn`), `0.72rem` (stale banner), inline `1.2rem` on 4 tab h2s — all replaced with vars.

Skipped from priority list: full `.pill-btn` rename refactor (#6) and `.card` base class extraction (#10) — both require touching render functions in multiple JS files and weren't worth the regression risk in this pass. Noted in `UI_UX_REVIEW.md` for a future cleanup.

— previous session work kept below for reference —

---

## What was completed this session (2026-05-11)

- **Futures off Home tab** — added `isFutureBet(b)` in `js/utils.js` as single source of truth. Covers `type==='future'`, `line==='Future'`, plus keywords: Championship / Premier League / Champions League / World Series / Super Bowl / Stanley Cup / World Cup / UCL / EPL / La Liga / Serie A / Bundesliga / Copa America / Euros / MVP / Outright / "to win". `getCachedFiltered` now uses it for both `filteredOpenBets` and `filteredSettledBets`.
- **Futures routed to store.futures** — `syncFromExcel` + `autoSyncIfInflated` (js/sync.js) now partition server bets into bets vs futures and load each into the right store, instead of filtering futures out and losing them.
- **One-time migration** — `migrateFuturesOutOfBets()` runs at init: scans `store.bets` for future-shaped entries, moves them into `store.futures`, dedups by txId, saves. Logs count to console.
- **The Odds API sport keys fixed** — they renamed outright keys to `_winner` variants. Updated both `refresh_futures.py` and `server.py`: `basketball_nba_championship` → `basketball_nba_championship_winner`, etc.
- **Scheduled task re-enabled** — `futures-odds-daily-refresh` (8:01 AM local, daily). Old path `/Users/thomasnendick/Documents/Betting Tracker` updated to current location.
- **First refresh ran** — `futures_cache.json` + `odds_history.json` populated. 7 NBA championship teams cached (Spurs +390 from FanDuel).

### Known data-source gaps
- NCAAMB championship market is closed (tournament over) — Vanderbilt/Virginia/Tennessee/Arkansas futures should be settled via the stale-futures engine.
- UCL and EPL outright winner markets are NOT in The Odds API free tier (only FIFA World Cup is offered). Barcelona and Manchester City futures render in the Futures tab but without a live odds badge. To fix: wire a Bovada Selenium scraper for soccer futures, or upgrade to paid Odds API tier.

---

## Previously completed (2026-05-10)

Replaced per-leg display in multi-bet game groups with collapsed `[Team] multiple` rows split by result.

- **`renderBetCardInner(b)`** (dashboard.js) — extracted the per-bet card template so single-bet and multi-bet group renders share one source.
- **`extractTeamFromBet` + `getPrimaryTeamForGroup`** (dashboard.js) — pulls the most-commonly-bet team across a group; mascot-aware (prefers "Timberwolves" over "Minnesota Timberwolves"); falls back to first half of matchup.
- **Group render branches** in `renderSettledBets`:
  - 1 bet → unchanged (existing single card).
  - >1 bet → split by result (W/L/P/pending). Each non-empty result renders one collapsed "[Team] multiple" row with `NW $X` / `NL -$Y` badge + total stake. Click expands to individual cards underneath.
- **`toggleResultRow(rowId)`** (bets.js) — new toggle for the W/L sub-rows; flips `_more` display + rotates `_arrow` chevron.

— previous redesign work (multi-user app) kept below for reference —

Major redesign turning the single-user tracker into a 5-user shared app.

- **Storage split** — `Betting_Tracker.xlsx` cloned to `Betting_Tracker_Thomas.xlsx` (350-row history preserved). Empty templates created for Andrew, Rudger, Tyler, baby. Backup at `Betting_Tracker.xlsx.pre-multiuser-backup`.
- **Server routing** — every `/api/*` endpoint accepts `?user=X` (default Thomas). Per-user `_xlsx_caches` dict replaces the single global cache. Scrapers stay pinned to Thomas (`SCRAPER_USER` constant).
- **Type inference** — `infer_type()` now recognizes `teaser` (→ parlay) and `prop`.
- **Landing screen** — `js/multiuser-ui.js` injects an overlay on first session-load with a 5-user picker + Go button. Selection lives in sessionStorage as `bt_active_user`.
- **Account switcher** — dropdown injected into `.header-tools`. Change triggers full reload with new user.
- **Filter bars** — bet-type (All/Straight/Props/Parlays/Futures) + sport (NFL/NBA/NCAAB/NCAAF/MLB/NHL/Soccer) filters added above Open Bets and Settled Bets panes. Wraps existing render functions; filters by hiding non-matching cards post-render.
- **Team logos** — `js/team-logos.js` maps team names → ESPN CDN URLs (NFL/NBA/MLB/NHL/NCAA) with TheSportsDB fallback for soccer and text-initials fallback for misses. Logos prepended to bet cards.
- **Team leaderboard** — injected into the Deep Analysis tab. Records, P&L, ROI per team. Sport + sort-by filters (ROI / P&L / count). Hides teams with <2 settled bets.
- **Fetch interception** — `js/user-context.js` patches `window.fetch` so any `/api/*` call auto-appends `?user=ACTIVE`. Loaded in betting-tracker.html, clv-tracker.html, recap-report.html. Also rewrites hardcoded `http://localhost:5001/api/*` to relative paths so the dashboard works on any port (handles macOS AirPlay Receiver squatting on 5001).
- **Futures engine** — `futures_engine.py` + `futures_event_dates.json` registry. Detects open futures whose championship event has ended (NCAA M/W, NBA, NFL/Super Bowl, NHL, MLB, EPL, UCL, CFP). Two new endpoints: `GET /api/stale-futures` and `POST /api/settle-bet`. Settlement moves a row from Open Bets → Bet History (preserves history rule, never deletes). UI in `js/futures-engine-ui.js`: yellow banner on Home tab + "Needs Review" panel on Futures tab with W/L/P buttons + optional winner input. Auto-runs on load + every 10 min + on tab focus. Manual ↻ Refresh button on both surfaces.

---

## What is in-flight (started but not done)

| Task | File(s) touched | Status | Next step |
|---|---|---|---|
| — | — | — | — |

---

## Known issues right now

| Issue | Where it shows | Suspected cause | Not yet tried |
|---|---|---|---|
| No formal test suite | — | Project is single-dev, no CI | — |
| UCL/EPL futures have no live odds badge | Futures tab | Free Odds API tier doesn't include soccer outrights | Bovada Selenium scraper or paid Odds API tier |
| NCAAMB stale futures need manual settlement | Futures tab → Needs Review | Tournament is over; futures engine flagged them | Click W/L/P for Vanderbilt, Virginia, Tennessee, Arkansas |

---

## Files modified this session

```
Added:
  Betting_Tracker_Thomas.xlsx  Betting_Tracker_Andrew.xlsx
  Betting_Tracker_Rudger.xlsx  Betting_Tracker_Tyler.xlsx
  Betting_Tracker_baby.xlsx    Betting_Tracker.xlsx.pre-multiuser-backup
  js/user-context.js           js/team-logos.js
  js/multiuser-ui.js

Modified:
  server.py                  — per-user routing, cache, prop/teaser inference
  betting-tracker.html       — added user-context.js + team-logos.js + multiuser-ui.js
  clv-tracker.html           — added user-context.js
  recap-report.html          — added user-context.js
  docs/agent/SESSION-STATE.md
```

---

## Decisions made this session

- **File-per-user storage** over single-file + User column. Chosen for isolation, low migration risk, and scraper-only-writes-Thomas semantics.
- **Always-show landing screen** over remember-last-user. Shared-device use case.
- **Augment over rewrite** for betting-tracker.html. The existing 3-pane Home layout already matched the user's described UI; new layer adds filters + logos + leaderboard without touching the core render path.
- **Post-render filter via card hiding** over pre-render store filtering. Avoids touching the cached filter pipeline (`getCachedFiltered`).
- **Full reload on user switch** over in-place data swap. Cleanest path — sessionStorage is set, every fetch reroutes on next load.
- **Scrapers stay Thomas-only** (`SCRAPER_USER` constant). Locks25/Bovada credentials are Thomas's; the refresh buttons always touch his data.

---

## What the next session should start with

1. Ask Thomas what to work on — no in-flight tasks
2. If adding bets: confirm details first, then write to Excel, then show P&L summary
3. If debugging scrapers: read DEBUG.md before opening any source file

---

## Context that doesn't fit anywhere else

- The old localStorage-based architecture (V5 schema, `runBetPipeline`, `getBetSortTime`) is no longer active. Current source of truth is `Betting_Tracker.xlsx` + Flask server.
- Thomas's sportsbooks are Locks25 and Bovada. Scraper credentials are in `reference/env-vars.md`.
