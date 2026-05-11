# Betting Tracker — Code Review & Vanity Engineering Assessment

**Reviewed:** March 26, 2026
**Scope:** Full codebase — server.py, betting-tracker.html, refresh_locks25.py, refresh_bovada.py, fetch_upcoming_games.py, parse_bovada_paste.py

---

## Code Review

### Summary

A personal sports bet tracker built on Flask + Excel + a single-file HTML dashboard. The architecture matches the requirements: one user, local-only, incremental data entry, dashboard with charts. The code works and ships value. The review found two critical security issues, several correctness gaps, and maintenance concerns rooted in the 6,790-line HTML monolith.

---

### Critical Issues

| # | File | Line/Area | Issue | Severity |
|---|------|-----------|-------|----------|
| 1 | `refresh_locks25.py` | L37-38 | **Hardcoded credentials in source.** Username and password sit in plaintext. If this repo ever touches GitHub (even private), you've leaked sportsbook credentials. | 🔴 Critical |
| 2 | `refresh_bovada.py` | L35-36 | **Same problem.** Email and password in plaintext. The ARCH.md says "put them in a .env file" — that rule isn't followed. | 🔴 Critical |
| 3 | `betting-tracker.html` | L2854 | **Claude API key stored in localStorage, sent via browser.** The `anthropic-dangerous-direct-browser-access` header confirms this is an intentional workaround, but the API key is visible in devtools and persisted in unencrypted browser storage. Any browser extension can read it. | 🔴 Critical |
| 4 | `server.py` | L31 | **CORS allows all origins.** `CORS(app)` with no origin restriction. Fine for local use, but if the machine is on a shared network, any page in the browser can hit the API. | 🟡 Medium |
| 5 | `server.py` | L826 | **Unsanitized `days` query param cast to int.** `int(request.args.get('days', 30))` will crash with a 500 on non-numeric input. No try/except around it. | 🟡 Medium |
| 6 | `server.py` | L93-119 | **`parse_date_str` silently returns `utcnow()` on parse failure.** A corrupted date in the Excel file gets replaced with the current time, which shifts the bet's position in the sort order. You'd never notice until a bet appears at the wrong spot. | 🟡 Medium |

---

### Suggestions

| # | File | Area | Suggestion | Category |
|---|------|------|------------|----------|
| 1 | `betting-tracker.html` | Whole file | **Split this file.** 6,790 lines of inline CSS + JS + HTML in one file. The function index helps, but you're navigating by line number instead of by file. Extract CSS into a stylesheet, move JS into a separate file (or two: core logic vs. rendering). This is the single biggest maintainability win available. | Maintainability |
| 2 | `server.py` | L167-318 | **`read_settled_bets` and `read_open_bets` share 80% of their logic.** Both open the workbook, iterate rows, parse odds, build pick strings, construct dicts. Extract a shared `_read_sheet(sheet_name, column_map)` function. | Maintainability |
| 3 | `betting-tracker.html` | L1074-1255 | **`loadData()` contains a V5 migration with 160+ lines of inner functions.** `isBadBet`, `cleanMatchup`, `cleanPick`, `dedupArray` are defined inside `loadData()`. These should be standalone functions. The migration itself should be a named function like `migrateV5()`. | Maintainability |
| 4 | `server.py` | L370-425 | **`refresh_locks25` and `refresh_bovada` are identical except for the script path.** Extract a `_run_scraper(script_path)` function. | Maintainability |
| 5 | `refresh_locks25.py` / `refresh_bovada.py` | Whole files | **`get_driver()`, styling helpers (`side()`, `bdr()`, `hfill()`, `dfont()`), and `fetch_game_times()` are duplicated across both files.** Move shared code to a common module like `scraper_utils.py`. | Maintainability |
| 6 | `betting-tracker.html` | L2831-2877 | **Claude API responses are cached by exact message string.** The cache key is `userMessage.toLowerCase().trim() + '|' + claudeCacheVersion`. Asking "how am I doing?" twice returns the stale first response even if you settled 5 bets between asks. The `claudeCacheVersion` bump helps, but only when `invalidateStats()` fires. | Correctness |
| 7 | `server.py` | L170, L255 | **Excel workbook opened in `read_only=True` mode, but never wrapped in try/finally.** If `openpyxl` throws during iteration, the file handle leaks. Use a `with` block or ensure `wb.close()` in a `finally`. The current `wb.close()` on L233/L307 only runs on success. | Correctness |
| 8 | `server.py` | L577 | **Dead filter condition.** `if not any(kw in desc for kw in ('champion', 'winner', 'win', 'futures', 'specials', 'odds to win', ''))` — the empty string `''` matches everything, so this condition is always `False`. The `if/pass` block does nothing. | Correctness |
| 9 | `betting-tracker.html` | All `var` declarations | **Using `var` everywhere instead of `let`/`const`.** Function-scoped `var` causes subtle bugs in loops (loop variable hoisting). The codebase uses `var i` in nested for-loops where inner `i` shadows outer `i`. | Correctness |
| 10 | `server.py` | L538-539 | **`_parse_bovada_american_odds` strips `+` incorrectly.** `int(am.replace('+', '').strip()) if am.startswith('-')` — if odds start with `-`, you strip `+` (a no-op) and parse. If odds start with `+`, you fall through and parse `int(am)` which includes the `+`. This works by accident because Python's `int()` handles `+350`, but the logic reads like a bug. | Correctness |
| 11 | `betting-tracker.html` | L6780 | **`mapBet` is duplicated.** The same `mapBet` function appears in `syncFromExcel()` (L6555) and `autoSyncIfInflated()` (L6779). If you fix a mapping bug in one, the other stays broken. | Maintainability |
| 12 | `server.py` | L236-237 | **Cache mtime updated after reading settled but before reading open.** If another process writes to the xlsx between the two reads, the open bets cache could contain stale data but the mtime flag says "fresh." Move the mtime update to after both reads complete. | Correctness |

---

### What Looks Good

- **Pipeline discipline.** The `runBetPipeline` pattern centralizes sort → save → render → async-enrich. Memory work pointed the team here, and the code follows it.
- **Smart polling.** Live scores use exponential backoff. Futures only fetch when open futures exist. Upcoming games serve from a 4-hour cache. You're not hammering ESPN for no reason.
- **Dedup guards.** Both the sportsbook parsers and the Excel import paths check for duplicate transaction IDs before writing.
- **ESPN enrichment strategy.** The serial enrichment with re-sort-after-complete approach handles the async gap well.
- **Architecture documentation.** The `docs/agent/` directory with ARCH.md, function index, data models, and API schema is better documentation than most production codebases ship.

---

## Vanity Engineering Assessment

### Requirement Anchor

1. **Who uses this?** One person (Thomas).
2. **What must it do?** Track bets, show P&L, display charts, parse sportsbook pastes, auto-refresh from two sportsbooks.
3. **What scale does it operate at?** Hundreds of bets total. Single-user, single-machine.
4. **Real constraints?** Must handle Bovada and Locks25 paste formats. Must sync from Excel. Must show live scores.
5. **Team size?** One developer (AI-assisted).

### Requirement-to-Complexity Ratio (RCR): 4/10

For a personal tracker, this is on the heavier side but most of the complexity serves real features Thomas uses. The score would be 3/10 if the HTML file were split into reasonable modules.

### Top Findings

**Finding 1: Closing Line Value (CLV) analysis engine**
- **Where:** betting-tracker.html L4290-4423
- **Severity:** V1 — Drag
- **Why it's borderline vanity:** CLV analysis requires closing line data, which must be captured at the exact right moment before game start. The `capturePreGameClosingLines()` function runs on page load if open bets exist, but you'd need the dashboard open 30 minutes before every game for the data to populate. For a solo bettor who doesn't leave the dashboard open 24/7, the CLV trend chart will show "needs closing line data" most of the time.
- **What it should be:** Keep the infrastructure but add a note in the dashboard about the limitation. Consider a server-side cron that captures closing lines automatically.
- **Kill cost:** 0 hours (keep it, just set expectations)

**Finding 2: Parlay Correlation Detector**
- **Where:** betting-tracker.html L4485-4619
- **Severity:** V1 — Drag
- **Why it's borderline vanity:** With a few dozen parlays in the dataset, the statistical significance of "ML + Spread parlays outperform by 5%" is approximately zero. The analysis looks sophisticated but the sample size can't support the conclusions it draws.
- **What it should be:** Add a "sample too small for reliable signal" disclaimer when parlay count is under 30. The code itself is clean — the issue is the implied confidence level.
- **Kill cost:** 0 hours (add a disclaimer)

**Finding 3: Steam Move / Sharp Action Alerts**
- **Where:** betting-tracker.html L4608-4710
- **Severity:** V1 — Drag
- **Why it's borderline vanity:** "Steam moves" require high-frequency odds snapshots (every few minutes) to detect. The system captures one snapshot per team per calendar day (server.py L500-526). A daily snapshot can't detect a 30-minute steam move. The detector triggers on odds changes between daily snapshots, which are regular market adjustments, not sharp action.
- **What it should be:** Rename to "Odds Movement Alerts" and drop the sharp/steam language. The underlying data doesn't support that framing.
- **Kill cost:** 1 hour (rename + update copy)

**Finding 4: Tilt Detector**
- **Where:** betting-tracker.html L4711-4825
- **Severity:** V0 — Cosmetic
- **Why it passes:** This one earns its keep. For a sports bettor, detecting tilt patterns (bet size inflation after losses, increased frequency after bad streaks) is a genuine risk-management tool. The implementation is light and uses data you already have.

**Finding 5: Action Network Consensus Integration**
- **Where:** betting-tracker.html L5390-5584
- **Severity:** V1 — Drag
- **Why it's borderline:** The Action Network endpoints are undocumented public APIs that can break without notice. The "sharp side" derivation (`deriveSharpSide`) uses a single heuristic (money % diverges from bet %) that's a simplification of how professional bettors read consensus data. You're presenting it as signal, but the data source is fragile and the interpretation is rough.
- **What it should be:** Label as "experimental" in the UI. Add fallback handling for when the API returns nothing (currently the consensus strip just doesn't render, which is fine, but the user doesn't know why).
- **Kill cost:** 0 hours (cosmetic labeling)

**Finding 6: The 6,790-line HTML File**
- **Where:** betting-tracker.html
- **Severity:** V2 — Structural
- **Why it's vanity-adjacent:** The single-file approach started as simplicity (one file to open, no build step) but has become its own maintenance burden. 6,790 lines means you can't search, can't test functions in isolation, can't load just the parser to debug it. The function index document exists because the file is too big to navigate without one. When you need a map to navigate your code, the code has outgrown its container.
- **What it should be:** At minimum, extract CSS to `styles.css`, core logic to `tracker.js`, and rendering to `render.js`. No build step needed — just three `<link>`/`<script>` tags. This wouldn't change a single feature but would cut the "find the bug" time in half.
- **Kill cost:** 4-6 hours for the split

### Vanity Debt Estimate

Low. The codebase builds features Thomas uses. The vanity-adjacent items (CLV, parlay correlation, steam alerts) add maybe 1-2 hours/month of maintenance when they break or confuse, but they don't force other code to be more complex. The single-file HTML is the only V2 finding, and it's structural drag rather than ego-driven complexity.

**Estimated maintenance cost from vanity patterns: ~2 hours/month.**

### The Hard Question

"If you deleted the CLV engine, parlay correlation detector, steam alerts, and Action Network consensus integration — would your actual betting decisions change?"

If the answer is no, those features are a dashboard you look at, not a tool you use. They're not hurting anything, but they're the features most likely to break and most likely to generate false confidence in small-sample conclusions.

---

## Verdict

**Request Changes** on the two critical credential issues. Everything else is suggestion-level.

The codebase is grounded in real requirements and doesn't over-abstract. The vanity score is low — Thomas built features for a bettor, not a resume. The main risks are security (credentials, API key exposure) and maintainability (the monolith HTML file). Fix the credentials, split the HTML when the next major feature lands, and this tracker will keep running clean.
