# BetTracker Pro — Performance & Efficiency Audit

**Auditors:** Three senior platform engineers
**Date:** March 24, 2026
**Codebase:** Single-page HTML app (273KB, 5137 lines) + Flask API server + Python scrapers

---

## 1. Waste Audit — Top Three Suspects

**Engineer A:** Every chart render function calls `applyChartFilter(store.bets.concat(store.futures))` and then `.filter()` and `.sort()` independently. The `renderAll()` function triggers 4 home charts, the stats dashboard, open bets, settled bets, and chat — each one building its own filtered/sorted copy of the full bet array from scratch. With 100 bets, you get ~15 full-array copies per render cycle. At 500 bets, that's 7,500+ array operations per page interaction.

**Engineer B:** The ESPN live scores fetcher fires 5 parallel HTTP requests to ESPN every 60 seconds (`setInterval(fetchLiveScores, 60000)`), plus a separate auto-settle check every 120 seconds, plus ESPN game time fetches on init that make 7 sequential XHR calls (one per date for the last 7 days). That's 5+ external API calls per minute even when the user has zero open bets. The futures odds poller fires every 15 minutes regardless of whether the user has any futures.

**Engineer C:** The Claude API call in `askClaude()` sends the entire bet history as context on every single question — `buildBetContext()` serializes every bet into a text string and ships it as the system prompt. For 100 bets, that's ~8,000-12,000 tokens of context per AI call. The function rebuilds this string from scratch each time, iterating all bets twice (once for settled summary, once for open bets list).

**Vote: Engineer A's redundant computation wins.** Every user interaction (tab switch, filter change, bet settle) triggers a full `renderAll()` that recomputes all stats from raw data 15+ times. This is the highest-frequency waste in the app.

---

## 2. Calculation Efficiency

### Redundant Calculations Found

| Function | What It Does | How Often It Runs | Waste |
|---|---|---|---|
| `renderDashStats()` | Loops all bets to compute W/L/P/L/ROI | Every `renderAll()` call | Full array scan each time |
| `renderROIChart()` | Filters, sorts, loops all settled bets to compute cumulative ROI | Every `renderAll()` | Duplicates renderDashStats work |
| `renderBankrollChart()` | Same filter/sort/loop as ROI chart | Every `renderAll()` | Exact same data as ROI chart |
| `renderWLChart()` | Same filter/sort/loop | Every `renderAll()` | Third copy of same work |
| `renderSportChart()` | Filters all settled, groups by sport | Every `renderAll()` | Fourth array scan |
| `renderSettledBets()` | Filters, sorts (with ESPN lookups), groups by game key | Every `renderAll()` | Most expensive render — calls `getBetSortTime()` for every bet pair during sort, each of which calls `lookupEspnEndTime()` |
| `analyzeQuery()` | Loops `store.bets.concat(store.futures)` from scratch | Every chat question | Recomputes full P/L stats that renderDashStats already knows |
| `handleConversation()` status path | Loops all bets to compute W/L/P/L | Every "status" chat message | Same stats as dashboard |

### Specific Fixes

**A. Create a single computed stats cache:**

```javascript
var statsCache = { dirty: true, settled: [], open: [], wins: 0, losses: 0,
  pushes: 0, totalStaked: 0, totalReturn: 0, profit: 0, roi: 0,
  bySport: {}, byType: {}, sortedSettled: null };

function invalidateStats() { statsCache.dirty = true; }
function getStats() {
  if (!statsCache.dirty) return statsCache;
  // compute once, store results
  statsCache.dirty = false;
  return statsCache;
}
```

Call `invalidateStats()` only when a bet is added, edited, settled, or deleted. Every render function reads from `getStats()` instead of recomputing. This eliminates ~14 redundant array scans per render cycle.

**B. Pre-sort once, not per-chart.** All four home charts call `.sort(function(a,b){return new Date(a.settledDate||0)-new Date(b.settledDate||0)})` — that's 4 `O(n log n)` sorts of the same data. Sort once and cache the result.

**C. `getBetSortTime()` calls `lookupEspnEndTime()` which scans the ESPN cache object for every bet during sort.** The sort comparator runs `O(n log n)` times, each calling two `lookupEspnEndTime` lookups. For 100 bets, that's ~1,300 cache lookups. Cache the sort-time on the bet object after first computation.

**D. Parlay detection runs a regex on every bet every render:** `b.type === 'parlay' || /parlay/i.test(b.matchup || '')`. Compute this once when the bet enters the store and store a boolean.

**E. `applyChartFilter()` is called 15+ times per render.** It creates a new filtered array each time. Compute it once, store it alongside the stats cache, invalidate when filters change.

**Estimated savings:** At 200 bets, this cuts per-render computation from ~30 full-array passes to 1. Chart renders drop from ~50ms to ~5ms.

---

## 3. Data Fetching & Network Calls

### Unnecessary Calls Found

| Endpoint | Frequency | Payload | Problem |
|---|---|---|---|
| ESPN scoreboard × 5 sports | Every 60 seconds | ~50-200KB per sport | Fires even with 0 open bets |
| `checkAndAutoSettle()` | Every 120 seconds | Triggers another `fetchLiveScores()` | Redundant — live scores already polling |
| ESPN game times × 7 dates | On page load | ~200KB each, 7 sequential XHRs | Fetches all 7 days even if only today matters |
| `fetchFuturesOdds()` | Every 15 minutes | Hits localhost:5001, which hits Bovada | Fires even with 0 futures bets |
| `autoSyncIfInflated()` | On page load | Fetches full bet list + open bets from server | Always fires; only useful when localStorage is corrupted |
| `enrichSettledPhase()` | On page load | Makes individual ESPN XHR per settled bet without matchup | With 80 settled bets needing enrichment, that's 80 sequential API calls with 200ms delays = 16 seconds of startup fetching |
| `fetchClosingLines()` | 3 seconds after load | Hits localhost:5001 | Fine, but triggers a full `renderAll()` after |
| Claude API | Every chat question | Sends full bet context (~8-12K tokens) | No caching of identical queries; rebuilds context string each call |

### Proposed Fixes

**A. Gate live scores polling on open bet count:**
```javascript
setInterval(function() {
  if (store.bets.some(function(b) { return !b.settled; })) fetchLiveScores();
}, 60000);
```
Zero open bets = zero ESPN calls. Saves 5 HTTP requests per minute when the user has no action.

**B. Remove redundant `checkAndAutoSettle` interval.** The `fetchLiveScores` callback already calls `renderOpenBets()` which displays scores. Auto-settling on the 60-second live scores poll is sufficient. Kill the separate 120-second interval.

**C. Batch ESPN enrichment.** Instead of 80 sequential XHRs (one per bet), group bets by date+sport and make one scoreboard call per date. A bet on March 22 NCAAMB and a bet on March 22 NCAAMB share the same scoreboard response. This collapses 80 calls into ~7.

**D. Gate futures polling on futures count:**
```javascript
if (store.futures.filter(function(b){return !b.settled;}).length > 0) {
  setInterval(function() { fetchFuturesOdds(); }, 15 * 60 * 1000);
}
```

**E. Reduce ESPN game time fetch from 7 days to 2 days.** Most users only care about today and yesterday for sorting. Cuts startup XHRs from 7 to 2.

**Estimated savings:** With 0 open bets, network calls drop from ~5/minute to 0/minute. Startup enrichment drops from 80 XHRs (16 seconds) to ~7 XHRs (1.4 seconds).

---

## 4. Frontend Rendering Efficiency

### Unnecessary Re-renders Found

| Trigger | What Re-renders | Waste |
|---|---|---|
| `renderAll()` called on every bet add/settle | ALL tabs' charts, even invisible ones | Only the active tab needs rendering |
| `switchTab()` calls `renderAll()` conditionally but `renderAll()` always renders home charts + stats + open/settled bets | Home tab re-renders when switching to Analytics | Home charts get destroyed and rebuilt on every tab switch back |
| `fetchLiveScores` callback calls `renderOpenBets()` every 60 seconds | Full innerHTML rebuild of all open bet cards | Only scores changed — the whole card list rebuilds |
| `runBetPipeline()` calls `renderAll()`, then ESPN enrichment calls `renderAll()` again | Two full renders per bet addition | Could batch into one |
| Every settled bet card is rendered even when scrolled off-screen | Full DOM list of 200+ cards with complex HTML | Only ~10-15 visible at any time |
| Chart.js `destroy()` + `new Chart()` pattern | Full chart teardown and rebuild on every data change | Chart.js supports `.update()` for data changes without destroying the canvas |

### Proposed Fixes

**A. Lazy tab rendering.** `renderAll()` should only render the active tab:
```javascript
function renderAll() {
  renderFilterBars();
  renderDashStats();  // stats are always visible
  if (store.currentTab === 'home') { renderOpenBets(); renderSettledBets(); renderHomeCharts(); }
  else if (store.currentTab === 'analytics') renderAnalyticsCharts();
  // etc.
}
```
This immediately halves the render work on every call.

**B. Use Chart.js `.update()` instead of `destroy()`/`new Chart()`.** Store chart instances. When data changes, update `chart.data.datasets[0].data = newData` and call `chart.update()`. The canvas stays intact, no teardown/rebuild.

**C. Virtualize settled bets list.** With 200+ bets, render only the visible ~15 cards. Use a simple scroll-window approach:
```javascript
var VISIBLE_COUNT = 20;
var visibleSlice = sortedSettled.slice(scrollOffset, scrollOffset + VISIBLE_COUNT);
```
This cuts DOM nodes from 200+ complex cards to ~20.

**D. Debounce live score re-render.** If multiple score updates arrive within 500ms, batch them into one render call.

**E. Stop rebuilding innerHTML for open bets on every score poll.** Diff the scores against cached values and only update the `.live-score` div text of changed cards.

**Estimated savings:** 50-60% fewer DOM operations per render cycle. Chart rebuilds drop from ~100ms to ~10ms each.

---

## 5. Data Storage Efficiency

### Issues Found

**A. localStorage stores full JSON blobs.** `saveData()` serializes the entire `store.bets` array (every bet with all fields) on every save. With 500 bets at ~200 bytes each, that's 100KB written to localStorage on every bet settle. localStorage has a 5MB limit and serialization is synchronous — this blocks the main thread.

**B. Derived data not stored where it should be.** ROI, win rate, profit — these get recomputed from raw bets on every render. For an app of this size, the computation is fast enough that caching in memory (not storage) is the right call. The current approach of not storing derived values in the XLSX is correct. But the frontend should cache them in a variable, not recompute each time.

**C. The `espnGameCache` stores duplicative entries.** Each team game gets indexed under 6+ keys (displayName, shortName, abbreviation, with and without date). For 200 games, that's 1,200+ cache entries. Most lookups only need the team abbreviation.

**D. `store.chatHistory` stores up to 50 messages.** Each message is an HTML string. The `.slice(-50)` in `saveData()` is good, but chat is serialized on every `saveData()` call even when no chat message was added.

**E. No separate storage for bet metadata vs. bet data.** Every bet carries nullable fields like `espnMatchup`, `espnGameId`, `scheduledStart`, `expectedEndTime`, `espnScore`, `autoSettled` — most settled bets have 5-6 extra ESPN fields that are only used for display enrichment. These inflate the storage footprint by ~40%.

### Proposed Fixes

**A. Dirty-flag saves.** Only write to localStorage when data actually changed:
```javascript
var dirtyFlags = { bets: false, futures: false, chat: false, settings: false };
function saveData() {
  if (dirtyFlags.bets) localStorage.setItem('bt_bets', JSON.stringify(store.bets));
  // etc.
  Object.keys(dirtyFlags).forEach(k => dirtyFlags[k] = false);
}
```

**B. Strip ESPN enrichment fields before storage.** Fields like `espnScore`, `espnGameId` can be re-derived from ESPN on next load. Store only the minimum: id, sport, type, matchup, pick, odds, stake, toWin, settled, result, settledDate, gameTime, source.

**C. Reduce ESPN cache keys to abbreviation-only.** One entry per team per date instead of six.

---

## 6. Token & AI Call Efficiency

### Claude API Usage

The app calls Claude's API via `askClaude()` on line 2464. Here's the breakdown:

| Aspect | Current | Problem |
|---|---|---|
| Model | `claude-sonnet-4-20250514` | Appropriate for the task |
| `max_tokens` | 400 | Good — keeps responses concise |
| System prompt | ~200 tokens of instructions + full bet context | Context is the problem |
| Bet context | Every bet serialized as text | 100 bets ≈ 8,000-12,000 input tokens |
| Caching | None | Same question asked twice = same tokens sent twice |
| Deterministic fallback | `analyzeQuery()` handles basic questions locally | Good — but Claude still gets called for anything `analyzeQuery()` returns null on |

### Estimated Token Cost Per Call
- System prompt: ~200 tokens
- Bet context (100 bets): ~10,000 tokens
- User message: ~20 tokens
- Response: ~200 tokens
- **Total: ~10,420 tokens per call**
- At Sonnet pricing ($3/MTok input, $15/MTok output): ~$0.034 per call

### Proposed Fixes (target: 30%+ reduction)

**A. Pre-aggregate bet context.** Instead of serializing every bet, send a summary:
```
SETTLED: 85 bets (52W-30L-3P), +$847.50, +18.2% ROI
BY SPORT: NCAAMB 60 bets (35-22-3, +$520), NBA 20 bets (14-6, +$290), Soccer 5 bets (3-2, +$37)
BY TYPE: Spread 40 (25-15, +$380), ML 30 (18-10-2, +$320), Total 10 (6-4, +$97), Parlay 5 (3-2, +$50)
RECENT 10: W W L W L W W L P W (+$125)
OPEN: 4 bets — Kansas +3.5 $50, Duke ML $25, ...
```
This compresses 10,000 tokens of raw bet data into ~300 tokens of aggregated stats. Claude can answer "what's my ROI on NBA?" with 300 tokens of context as well as it can with 10,000.

**B. Cache AI responses.** Hash the user query + bet count + last-settled-date as a cache key. If the same query comes in and no bets have changed, return the cached response. This eliminates duplicate API calls.

**C. Route more queries to `analyzeQuery()`.** The local analysis engine handles record/P/L/ROI questions well. Expand it to handle: "compare spread vs ML", "best day of week", "how are my parlays doing". Each query routed locally saves ~10,000 input tokens.

**D. Consider Haiku for simple queries.** Route greetings, acknowledgments, and simple stat lookups to claude-haiku-4-5 ($0.25/MTok input vs $3/MTok) — 12x cheaper for simple responses.

**Estimated savings:** Pre-aggregating bet context drops input tokens from ~10,000 to ~500 per call. That's a 95% reduction in per-call token cost. Routing 60% of queries locally eliminates those API calls entirely. Combined: **~97% reduction in AI token spend**.

---

## 7. Dependency & Bundle Audit

### External Dependencies

| Dependency | Size | Usage | Verdict |
|---|---|---|---|
| Chart.js 4.4.1 (CDN) | ~200KB minified | 12+ chart types used (line, bar, doughnut) | **Keep** — 2+ chart types justifies the library |
| Google Fonts (Inter) | ~100KB (wght 400-800) | Primary app font | **Replace** — self-host the font subset, or use `system-ui` stack. CDN fetch blocks first paint |
| No other external JS dependencies | — | — | Good — no lodash, no moment.js |

### Bundle Analysis

- **Total HTML file:** 273KB uncompressed (CSS + JS + HTML all inline)
- **CSS portion:** ~14KB (lines 9-370, well-minified)
- **JavaScript portion:** ~250KB (lines 500-5137)
- **Seed data:** Embedded bet data (~5KB) in `getSeedData()` function

### Issues

**A. The entire 273KB file is a single monolithic HTML file.** No code splitting possible. Every tab's code loads even if the user only views the home tab. For a data tracker, 273KB of JavaScript is heavy.

**B. The Google Fonts request for Inter (weights 400-800) is render-blocking.** The `<link>` tag in `<head>` blocks first paint until the font loads. On slow connections, this adds 200-500ms to first meaningful paint.

**C. Chart.js loaded from CDN without SRI hash.** If the CDN serves a compromised file, the app runs it.

**D. Seed data is hardcoded in JS.** The `getSeedData()` function embeds example bets in the bundle — dead code after first load.

### Proposed Fixes

**A. Self-host Inter font or use `font-display: swap`.** Add `&display=swap` to the Google Fonts URL. Cost: 0 effort, saves 200-500ms first paint.

**B. Add SRI to Chart.js CDN link:**
```html
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"
  integrity="sha384-..." crossorigin="anonymous"></script>
```

**C. Lazy-load Chart.js.** Charts aren't visible above the fold. Load Chart.js with `defer` or dynamically after first paint.

**D. Remove seed data after first load.** The `getSeedData()` function (~5KB) can be deleted from the bundle since it only runs once.

**Estimated savings:** `font-display: swap` saves 200-500ms first paint. Lazy Chart.js saves ~200KB from blocking parse. Total first-paint improvement: 300-700ms.

---

## 8. Caching Strategy

### Current Caching

| Data | Cached? | TTL | Invalidation |
|---|---|---|---|
| ESPN game times | localStorage, 10-min TTL | 10 minutes | Time-based |
| Bet data | localStorage, no TTL | Never expires | Manual on every change |
| Live scores | In-memory `cachedLiveScores` | 60-second refresh | Timer-based |
| ESPN game data | In-memory `espnGameData` | 60-second refresh | Timer-based |
| Futures odds | In-memory from server response | 15-minute refresh | Timer-based |
| Closing lines | In-memory from server | Loaded once on init | Never refreshed |
| Odds history | Server-side JSON file | On-demand | Per-request |
| Chart instances | In-memory `charts` object | Destroyed each render | Full rebuild |

### Gaps

**A. No dashboard stats cache.** The most-viewed data (W/L record, P/L, ROI) gets recomputed from raw bets on every `renderAll()`. These numbers only change when a bet is added or settled.

**B. No API response cache on the server.** `read_settled_bets()` and `read_open_bets()` open the XLSX file and parse it on every HTTP request. The Excel file only changes when a refresh script runs. Cache the parsed result and invalidate on write.

**C. ESPN responses have no server-side cache.** The `_fetch_bovada()` and `_fetch_espn()` functions in server.py make fresh HTTP requests on every `/api/futures-odds` call. These odds change maybe once per hour — a 15-minute cache would eliminate 3 out of 4 Bovada API calls per hour.

**D. Chart data not cached.** Each chart function filters and processes the same bet array independently. The computed chart data (labels array, data array) should be cached and shared.

### Proposed Caching Layer

| Data | Cache Location | TTL | Invalidation Trigger |
|---|---|---|---|
| Dashboard stats | In-memory object | Until next bet mutation | `invalidateStats()` on add/settle/delete |
| Filtered/sorted bet arrays | In-memory | Until filter change or bet mutation | `invalidateStats()` |
| Chart data arrays | In-memory per chart | Until stats invalidated | `invalidateStats()` |
| XLSX parsed data (server) | In-memory dict | Until refresh script runs | Script sets a dirty flag |
| Bovada/ESPN odds (server) | In-memory with timestamp | 15 minutes | Time-based |
| Claude API responses | In-memory map (query hash → response) | Until bet mutation | `invalidateStats()` |

---

## 9. Error & Retry Efficiency

### Issues Found

**A. ESPN fetch failures trigger full callback chains.** When one of the 5 ESPN scoreboard fetches fails (timeout, network error), the error is silently swallowed (`catch(function(){return null;})`) but `Promise.all` still resolves with a null entry. Good for resilience. But the 7-day game time fetch has no timeout on individual XHRs beyond the 8-second default — a slow ESPN response holds up the entire init chain.

**B. No exponential backoff on API failures.** If ESPN is down, the app hammers it every 60 seconds. If the local server is down, `autoSyncIfInflated` fires a fetch that fails silently. The 15-minute futures odds poll will retry the full Bovada + ESPN waterfall on every cycle even after repeated failures.

**C. `console.log` and `console.warn` throughout production code.** Lines like `console.log('[BT] ESPN matched: ...')` run on every bet enrichment. With 80 settled bets enriching on load, that's 80+ console messages. Chrome DevTools buffers these, consuming memory.

**D. Error handling on the happy path:** The `try/catch` in `loadData()` wraps the entire function — if any migration step fails, it clears all localStorage (`localStorage.clear()`). A single corrupt chat message could wipe all bet data.

**E. Full-page error on init failure:** Line 5074 replaces `document.body.innerHTML` with an error message if init throws. No recovery path, no data preservation.

### Proposed Fixes

**A. Exponential backoff for polling:**
```javascript
var espnBackoff = 1;
function fetchLiveScoresWithBackoff() {
  fetchLiveScores(function(success) {
    if (success) { espnBackoff = 1; }
    else { espnBackoff = Math.min(espnBackoff * 2, 16); }
    setTimeout(fetchLiveScoresWithBackoff, 60000 * espnBackoff);
  });
}
```

**B. Strip `console.log` from production paths.** Keep `console.warn` and `console.error` for actual errors. Remove all `console.log('[BT] ESPN matched...')` and similar debug output.

**C. Granular try/catch in `loadData()`.** Wrap each data source independently:
```javascript
try { store.bets = JSON.parse(localStorage.getItem('bt_bets')) || []; }
catch(e) { store.bets = []; console.warn('Bet data corrupted, reset'); }
// separately for futures, chat, settings
```
A corrupt chat history should not destroy bet data.

**D. Fail-open on init.** If enrichment or ESPN calls fail, render the dashboard with whatever data loaded. Don't replace the page with an error.

---

## 10. Efficiency Scorecard

### Fix Today (< 1 hour each)

| Fix | Impact | Effort |
|---|---|---|
| Add `&display=swap` to Google Fonts URL | 200-500ms faster first paint | 1 minute |
| Gate ESPN polling on open bet count | Eliminates 5 HTTP requests/min when idle | 5 minutes |
| Remove `checkAndAutoSettle` 120-second interval (redundant with 60-second live scores) | Eliminates 5 redundant HTTP requests every 2 min | 2 minutes |
| Gate futures odds polling on futures count | Eliminates Bovada API calls when no futures exist | 5 minutes |
| Lazy tab rendering — only render active tab's charts | 50% fewer DOM operations per render | 15 minutes |
| Pre-aggregate Claude context to ~300 tokens | 95% reduction in AI input tokens | 20 minutes |
| Strip console.log from hot paths | Reduces memory pressure from console buffering | 10 minutes |
| Granular try/catch in loadData() | Prevents total data wipe from single corruption | 15 minutes |

### Fix This Week (architectural)

| Fix | Impact | Effort |
|---|---|---|
| Implement stats cache with dirty-flag invalidation | Eliminates 14+ redundant array scans per render | 2-3 hours |
| Use Chart.js `.update()` instead of destroy/rebuild | 90% faster chart re-renders | 2 hours |
| Batch ESPN enrichment by date+sport | Startup enrichment drops from 80 XHRs to ~7 | 3 hours |
| Virtualize settled bets list (render only visible ~20) | DOM nodes drop from 200+ to 20 | 2-3 hours |
| Server-side XLSX cache with dirty flag | Eliminates XLSX parse on every API request | 1-2 hours |
| Server-side Bovada/ESPN response cache (15-min TTL) | 75% fewer external API calls from server | 1 hour |
| Cache Claude API responses by query hash | Zero cost for repeated questions | 1 hour |

### Monitor (thresholds for 10x usage)

| Metric | Current | Threshold | Action |
|---|---|---|---|
| localStorage size | ~100KB at 100 bets | > 2MB | Implement pagination or IndexedDB |
| ESPN API calls/hour | ~300 (5 endpoints × 60/hr) | > 1,000 | ESPN will rate-limit; implement server-side caching proxy |
| Chart.js render time | ~50ms at 100 bets | > 500ms at 1,000 bets | Downsample data points to max 200 per chart |
| odds_history.json file size | ~50KB at 90 days | > 5MB at 2 years | Implement archival — keep last 90 days hot, older data in separate file |
| Claude API cost/month | ~$1-2 at casual use | > $20 | Route all stat queries to local engine, Claude only for subjective analysis |

---

## Engineer Votes — Single Highest-Impact Change

**Engineer A:** Stats cache with dirty-flag invalidation. Eliminates the most computation per user interaction.

**Engineer B:** Gate ESPN polling on open bet count. Eliminates the most wasted network calls by far.

**Engineer C:** Pre-aggregate Claude context. Biggest per-call cost reduction.

**Winner: Gate all polling on relevant bet counts + lazy tab rendering.** These are the two fixes that combine immediate impact (zero wasted work when idle) with trivial implementation effort (< 20 minutes total). You ship them today and the app stops burning resources when nothing is happening.

---

## Measurable Outcomes After Fix

| Metric | Before | After |
|---|---|---|
| ESPN API calls/minute (0 open bets) | 5 | 0 |
| Chart renders per tab switch | 12+ (all tabs) | 4-6 (active tab only) |
| DOM operations per renderAll() | Full rebuild of all panels | Active panel only |
| Startup ESPN enrichment XHRs | 80 sequential (16 sec) | 80 sequential (unchanged — "this week" fix) |
| Claude input tokens per call | ~10,000 | ~500 (with pre-aggregation) |
| First paint blocked by font | 200-500ms | 0ms (with font-display: swap) |
