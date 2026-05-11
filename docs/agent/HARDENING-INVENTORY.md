# Hardening Inventory — Pre-Max-Downgrade Pass

> Generated 2026-04-20 during the Pre-Max-Downgrade Hardening Pass.
> The workspace contains a single logical project (`Betting Tracker`) made of several sub-components.
> Treat each sub-component as its own unit when auditing and hardening.

---

## Workspace summary

| Key fact | Value |
|---|---|
| Projects in workspace | 1 (`Betting Tracker/`) |
| Root path | `/Users/thomasnendick/Documents/Claude/Projects/Betting Tracker/Betting Tracker/` |
| Git initialised | No — no `.git/` directory exists. Commits will be created by bootstrapping a local repo during Phase 2. |
| `requirements.txt` | Missing. Deps installed ad-hoc via `pip install …` in DEPLOY.md. |
| `.env` | Present (sportsbook creds). Loaded via `python-dotenv`. Already gitignored. |
| Test suite | None. Loose `test_changes.*` files are dead artefacts, not tests. |
| Runtime Claude dependency | Only `js/chat.js` (optional chat widget). Every other component runs without any Claude call. |

---

## Sub-component inventory

Priority score 1–5 (higher = more hardening value). Scoring heuristic: (likelihood of silent breakage × frequency of use × current Claude cost).

| # | Component | Path(s) | What it does | Runtime Claude dep | Tier | Coverage | Deps pinned | Last meaningful change | Priority |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Chat widget | `js/chat.js`, `js/store.js` (`claudeApiKey`), settings in `betting-tracker.html` | In-dashboard chat; natural-language Q&A against own betting stats | **Required** (when user supplies API key) — else local fallback | Opus-tier hard-coded: `claude-sonnet-4-20250514` | None | N/A (CDN / vanilla JS) | 2026-03-31 | **5** |
| 2 | Flask API server | `server.py` (1286 LOC) | Reads Excel, serves JSON, orchestrates scrapers & odds refresh | None | — | None | **No** — no requirements.txt | 2026-04-02 | **4** |
| 3 | Sportsbook scrapers | `refresh_locks25.py`, `refresh_bovada.py` | Selenium scrape of settled/open bets → Excel | None | — | None | No | 2026-04-01 / 2026-03-26 | **4** |
| 4 | CLV pipeline | `clv_calculator.py` (567 LOC), `refresh_game_odds.py` (603 LOC), `game_odds_config.json`, `game_odds_snapshots.json` | Polls The Odds API; computes no-vig closing-line value per bet | None | — | None | No | 2026-04-02 | **3** |
| 5 | Futures / odds refresh | `refresh_futures.py`, `refresh_odds.py` | Daily championship-futures snapshot via Bovada public API → ESPN fallback | None | — | None | No | 2026-04-01 / 2026-03-24 | **3** |
| 6 | Upcoming-games fetcher | `fetch_upcoming_games.py` | Pre-warms ESPN schedule cache for the dashboard | None | — | None | No | 2026-03-31 | **2** |
| 7 | Bovada-paste parser util | `parse_bovada_paste.py` (516 LOC) | One-off util to parse a pasted Bovada slip into Excel | None | — | None | No | 2026-03-25 | **2** |
| 8 | Dashboard HTMLs | `betting-tracker.html`, `analytics-dashboard.html`, `bet-detail.html`, `bet-entry.html`, `clv-tracker.html`, `index.html`, `parlay-ev-calc.html`, `recap-report.html` | Frontends — all read-only against server APIs | None | — | N/A (no build step) | N/A | 2026-03-31 | **2** |
| 9 | Dead / legacy files | `betting-tracker.html.bak` (268 KB), `betting-tracker.html.bak2` (316 KB), `Betting_Tracker.xlsx.bak.nfl_import`, `test_changes.html`, `test_changes.js`, `odds_history_test.json`, `__pycache__/` | None — historical artefacts | None | — | — | — | 2026-03-23 → 2026-03-30 | **4** (free wins: 620+ KB removable) |

---

## Where Claude actually gets called at runtime

Exhaustive grep for `anthropic.com`, `claude*`, `x-api-key`:

1. **`js/chat.js` → `askClaude()`** (only live call site)
   - Model: `claude-sonnet-4-20250514`
   - Trigger: any free-text chat message that isn't a bet-entry paste or parseable bet.
   - Gated on: `store.claudeApiKey` (if unset, local handlers run instead).
   - Cache: in-memory dict keyed by `userMessage.toLowerCase().trim() + '|' + claudeCacheVersion` — invalidated whenever bets change.
2. **`js/store.js`, `js/sync.js`, `js/data.js`, `js/utils.js`** — reference `store.claudeApiKey` / `claudeCacheVersion` only. No network call.
3. **`betting-tracker.html`** — one settings input field for the API key. No network call.
4. **Server, scrapers, odds, CLV, parsers, other HTMLs** — zero Claude calls.

---

## Hardening queue (descending priority)

Work top to bottom; finish each fully before moving on.

1. **Chat widget** — highest runtime-cost reduction available.
2. **Dead / legacy files** — cheap, clears 620 KB and removes confusion.
3. **Dependency pinning** — hard prerequisite for reproducible runs without me.
4. **Flask server** — largest surface area, biggest silent-break risk.
5. **Sportsbook scrapers** — brittle (DOM-dependent) but bounded scope.
6. **CLV pipeline** — uses a paid external API (The Odds API); audit for quota risk.
7. **Futures / odds refresh** — public APIs, low risk but low coverage.
8. **Upcoming-games fetcher** — small and stable.
9. **Bovada-paste parser util** — one-off; consider deleting if unused.
10. **Dashboard HTMLs** — pure presentation; minimal hardening target.

---

## Known risks to track across components

- **Selenium breakage** — sportsbook DOM changes silently break scrapers. No alerting, no retry policy documented.
- **Excel as DB** — `openpyxl` file-lock errors if the user has the workbook open.
- **No test harness** — nothing catches regressions before a data write.
- **Hardcoded host/port** — server is `localhost:5001`; dashboard assumes same; no failover.
- **Docs drift** — `reference/env-vars.md` still says credentials are hardcoded; scripts now use `.env`. Fix during hardening.
- **The Odds API quota** — `refresh_game_odds.py` polls a paid plan; needs a rate-limit check to avoid surprise bills.

---

## Blockers noted during discovery

- **Git cannot be initialised in this workspace.** The mount returns `EPERM` (Operation not permitted) on every `.git/*` write from the sandboxed shell. Fallback: file-level backups under `hardening-backups/before/` plus a running `docs/agent/CHANGELOG.md` entry per change. The user can run `git init && git add -A && git commit -m "…"` locally at any time — the file system itself is fine, only the sandbox's bash user lacks write permission to the existing mounted dotfiles.
