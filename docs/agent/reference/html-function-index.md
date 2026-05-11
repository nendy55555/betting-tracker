# betting-tracker.html — function index

> Use this to do targeted reads instead of loading the full 6,790-line file.
> Find the function you need, read only that line range.
> Format: `function name` — line — what it does

---

## App state and cache (L781–L830)

| Function | Line | Does |
|---|---|---|
| `invalidateStats()` | 805 | Marks stats cache dirty; bumps Claude cache version |
| `getCachedFiltered()` | 806 | Returns filtered/sorted bet arrays from cache; recomputes if dirty |

**State object `store`** lives at L781 — holds `bets`, `futures`, `currentTab`, `settledFilter`, `settings`, `chat`

**Chart filter object `chartFilter`** at L823 — fields: sport, betType, favDog, timePeriod, source, search

---

## Filters (L832–L975)

| Function | Line | Does |
|---|---|---|
| `isFavorite(bet)` | 832 | Returns `'favorite'`, `'underdog'`, or `'pickem'` based on odds |
| `applyChartFilter(bets)` | 839 | Filters bet array by all active chartFilter settings |
| `getActiveFilterCount()` | 882 | Returns count of non-default filter settings (for UI badge) |
| `setHomePeriod(val)` | 893 | Sets timePeriod filter and re-renders |
| `updateTimePeriodBtns()` | 905 | Updates active state on period buttons |
| `setChartFilter(key, value)` | 912 | Sets one chartFilter key, invalidates cache, re-renders |
| `onFilterSearch(e)` | 927 | Handles text search input, debounced re-render |
| `clearAllFilters()` | 943 | Resets all chartFilter fields to defaults |
| `toggleHomeFilter()` | 962 | Shows/hides the filter drawer |
| `updateHomeFilterToggle()` | 967 | Updates filter toggle button label/badge |
| `renderFilterBars()` | 975 | Renders sport + bet type quick-filter pill bars |

---

## Persistence and data loading (L1062–L1395)

| Function | Line | Does |
|---|---|---|
| `getSeedData()` | 1063 | Returns hardcoded pre-imported Bovada bets (initial data) |
| `getHistoricalData()` | 1070 | Returns NFL historical season data |
| `loadData()` | 1074 | Loads store from localStorage; runs V5 migration and dedup on startup |
| `normalizePickForDedup(pick)` | 1336 | Normalises pick string for duplicate detection |
| `isDuplicateBet(newBet)` | 1363 | Returns true if a matching bet already exists in store |
| `saveData()` | 1378 | Saves store to localStorage key `bt_data` |

**Note:** `loadData()` at L1074 contains the V5 migration (`isBadBet`, `cleanMatchup`, `cleanPick`, `dedupArray` are inner functions at L1093–L1255).

---

## Utility (L1396–L1440)

| Function | Line | Does |
|---|---|---|
| `genId()` | 1397 | Generates a short random ID (timestamp + random base36) |
| `calcToWin(stake, odds)` | 1398 | Calculates potential profit from stake and American odds |
| `fmtOdds(odds)` | 1403 | Formats odds integer to display string (`+150`, `-110`) |
| `fmtMoney(n)` | 1404 | Formats number as `$X.XX` |
| `parseGameDate(d)` | 1405 | Parses `M/D/YY H:MM AM/PM` ET string → UTC Date object (handles EDT/EST offset) |
| `fmtDate(d)` | 1434 | Formats Date to `Mon D, YYYY` display string |

---

## ESPN game time cache (L1441–L1829)

| Function | Line | Does |
|---|---|---|
| `getEspnTeamKey(name)` | 1445 | Normalises team name to ESPN lookup key |
| `normalizeTeamKeyForGrouping(name)` | 1452 | Further normalisation for grouping bets by team |
| `shortenMatchupDisplay(matchup)` | 1461 | Shortens `Team A vs Team B` to abbreviated display |
| `fetchEspnGameTimes(callback)` | 1472 | Fetches ESPN scoreboard for all active sports; populates game time cache |
| `lookupEspnEndTime(bet)` | 1566 | Returns expected end time for a bet from ESPN cache |
| `calculateExpectedEndTime(start, sport)` | 1610 | Estimates game end time from start time + sport (e.g. NBA +2.5h) |
| `extractBetSpread(bet)` | 1629 | Extracts numeric spread value from bet's line/pick |
| `extractESPNSpread(comp)` | 1640 | Extracts spread from ESPN competition object |
| `enrichBetFromESPN(bet, callback)` | 1651 | Looks up opponent, score, game time from ESPN for a single bet |
| `enrichNewBets(bets, callback)` | 1826 | Calls `enrichBetFromESPN` serially for a list of new bets |

---

## Auto-settle (L1850–L1880)

| Function | Line | Does |
|---|---|---|
| `checkAndAutoSettle()` | 1850 | Checks open bets against ESPN scores; auto-settles if game ended and result is clear |

---

## Render helpers (L1882–L1907)

| Function | Line | Does |
|---|---|---|
| `sportClass(sport)` | 1882 | Returns CSS class for sport colour tag |
| `escHtml(s)` | 1892 | Escapes string for safe HTML insertion |

---

## Sport detection and chatbot analysis (L1899–L2259)

| Function | Line | Does |
|---|---|---|
| `detectSport(text)` | 1899 | Infers sport from team/event name string |
| `analyzeQuery(query)` | 1909 | Main chatbot analysis engine — handles stat queries (record, ROI, team breakdown, streaks, etc.) |

`analyzeQuery` inner helpers (L1969–L2258):
- `extractTeamFromPick` L1969, `aggregateByKey` L1982, `formatRankedList` L2009
- Sections: team profitability (L2031), sport profitability (L2040), bet type breakdown (L2046), streak/hot/cold (L2059), today/yesterday/week (L2092), units (L2138)

---

## Conversational chatbot (L2260–L2320)

| Function | Line | Does |
|---|---|---|
| `handleConversation(text)` | 2260 | Handles casual chat messages (greetings, thanks, help) before routing to `analyzeQuery` |

---

## Bet parsers (L2321–L2685)

| Function | Line | Does |
|---|---|---|
| `parseBet(input)` | 2321 | Parses plain-language bet description into a bet object |
| `parseSportsbookPaste(text)` | 2378 | Parses Locks25/BetOnline bet slip paste format |
| `parseSportsbookPasteWithDupeCheck(text)` | 2513 | Wraps `parseSportsbookPaste` with duplicate detection |
| `parseBovadaPaste(text)` | 2528 | Parses Bovada bet slip paste format (singles + parlays, open + settled) |
| `parseBovadaPasteWithDupeCheck(text)` | 2657 | Wraps `parseBovadaPaste` with duplicate detection |

**Critical:** Both parsers must strip `[...]` date brackets before extracting odds. See `DEBUG.md` pattern #1.

---

## Chat rendering (L2687–L2715)

| Function | Line | Does |
|---|---|---|
| `addChat(type, html)` | 2687 | Appends a message to chat history and triggers re-render |
| `renderChat()` | 2693 | Renders full chat message list to DOM |

---

## Claude AI chatbot (L2716–L3008)

| Function | Line | Does |
|---|---|---|
| `buildBetContext()` | 2721 | Builds context string from current bets to include in Claude API prompt |
| `askClaude(userMessage, callback)` | 2816 | Calls Claude API with bet context; handles streaming response |
| `sendMessage()` | 2864 | Handles "Send" button — routes to local `analyzeQuery` or Claude API |
| `_processMessage(text)` | 2879 | Core message dispatch: tries parsers, then analysis, then Claude |

---

## Bet mutation (L3009–L3082)

| Function | Line | Does |
|---|---|---|
| `confirmBet()` | 3009 | Confirms a pending bet entry; saves to store |
| `cancelBet()` | 3032 | Cancels a pending bet entry |
| `resettleBet(id, result)` | 3039 | Re-settles an already-settled bet with a new result |
| `settleBet(id, result)` | 3048 | Settles an open bet with W/L/P result |
| `settleFuture(id, result)` | 3063 | Settles a futures bet |
| `deleteBet(id)` | 3076 | Deletes a bet from store (irreversible) |

---

## UI interaction (L3083–L3109)

| Function | Line | Does |
|---|---|---|
| `toggleCard(id)` | 3084 | Expands/collapses a bet card |
| `toggleGroupExpand(grpId, extraCount)` | 3090 | Shows/hides extra bets in a grouped game row |

---

## Render: Dashboard stats (L3111–L3158)

| Function | Line | Does |
|---|---|---|
| `renderDashStats()` | 3111 | Renders the top stats bar: record, P&L, ROI, pending count, open stake |

---

## Render: Open bets (L3160–L3239)

| Function | Line | Does |
|---|---|---|
| `renderOpenBets()` | 3160 | Renders the open/pending bets panel with compact cards |

---

## Render: Settled bets (L3240–L3353)

| Function | Line | Does |
|---|---|---|
| `findLiveScore(bet)` | 3231 | Looks up live score for a bet from ESPN cache |
| `isGenericPick(pick)` | 3241 | Returns true if pick is too generic to be enriched (e.g. "Bet", "Imported") |
| `betTypeLabel(type)` | 3248 | Returns human-readable label for bet type |
| `displayPickForCard(b)` | 3256 | Returns the display pick string for a bet card |
| `gameTimeHasTime(gt)` | 3274 | Returns true if game time string includes a time component |
| `renderSettledBets()` | 3378 | Renders settled bet history grouped by game/date |

---

## Bet sort (L3268–L3353)

| Function | Line | Does |
|---|---|---|
| `getBetSortTime(b)` | 3279 | **Primary sort key** — returns best available datetime for a bet (expectedEndTime → ESPN end → gameTime → settledDate) |
| `compareBetsByTime(a, b)` | 3300 | Comparator for sort: most recent first |
| `getGameGroupKey(bet)` | 3314 | Returns grouping key for settled bets (same game = same group) |

---

## Standard pipeline (L3346–L3376)

| Function | Line | Does |
|---|---|---|
| `runBetPipeline(newlyAddedBets)` | 3354 | **Call this instead of bare saveData/renderAll.** Sorts, saves, renders, then async ESPN-enriches new bets and re-renders. |

---

## Render: Filters and futures (L3586–L3700)

| Function | Line | Does |
|---|---|---|
| `setFilter(f)` | 3586 | Sets settled-bet result filter (all/W/L/P) |
| `lookupCurrentOdds(pick)` | 3602 | Looks up current odds from futures cache for a pick string |
| `renderFutures()` | 3629 | Renders the futures/championship odds tab |

---

## Charts (L3700–L4005)

| Function | Line | Does |
|---|---|---|
| `renderROIChart()` | 3711 | ROI over time line chart |
| `renderBankrollChart()` | 3765 | Running bankroll chart |
| `renderWLChart()` | 3793 | Win/loss bar chart |
| `renderSportChart()` | 3821 | P&L by sport bar chart |
| `renderCumPLChart()` | 3867 | Cumulative P&L line chart |
| `renderWinRateSportChart()` | 3886 | Win rate by sport chart |
| `renderBetSizeChart()` | 3930 | Bet size distribution chart |
| `getWeekKey(date)` | 3957 | Returns ISO week string for a date |
| `fmtWeekLabel(key)` | 3965 | Formats week key to display label |
| `renderWeeklyChart()` | 3969 | Weekly P&L bar chart |
| `renderHomeCharts()` | 4003 | Calls ROI + bankroll + W/L + sport charts (home tab) |
| `renderAnalyticsCharts()` | 4004 | Calls summary + cumulative + win rate + bet size + weekly charts |

---

## Summary dashboard card (L4007–L4090)

| Function | Line | Does |
|---|---|---|
| `renderSummaryDashCard()` | 4007 | Renders the "5-second glance" analytics card with key metrics |

---

## Deep analysis tab (L4092–L4289)

| Function | Line | Does |
|---|---|---|
| `renderDeepAnalysis()` | 4092 | Entry point for deep analysis tab render |
| `renderOddsRangeChart()` | 4104 | W/L/ROI by odds range bracket chart |
| `renderBetTypeROIChart()` | 4131 | ROI by bet type chart |
| `renderDOWChart()` | 4167 | P&L by day of week chart |
| `renderMonthlyPLChart()` | 4195 | Monthly P&L chart |
| `renderDeepBreakdown()` | 4228 | Detailed breakdown table by sport, bet type, and result |

---

## CLV — Closing line value (L4290–L4408)

| Function | Line | Does |
|---|---|---|
| `oddsToImplied(odds)` | 4291 | Converts American odds to implied probability |
| `calcCLV(bet)` | 4298 | Calculates CLV for a bet (placed odds vs closing odds) |
| `clvClass(clv)` | 4309 | Returns CSS class for CLV value |
| `clvLabel(clv)` | 4316 | Returns display label for CLV range |
| `enrichClosingLines()` | 4325 | Fetches and attaches closing line data to settled bets |
| `renderCLVTrendChart()` | 4372 | CLV trend over time chart |

---

## Personal edge model and advanced analytics (L4411–L4607)

| Function | Line | Does |
|---|---|---|
| `renderEdgeModelChart()` | 4411 | Renders personal edge model chart (actual vs expected win rate) |
| `parseParlayLegs(bet)` | 4471 | Parses parlay legs from notes/pick string |
| `categorizeLeg(leg)` | 4484 | Categorises a parlay leg by type |
| `renderParlayCorrelation()` | 4494 | Renders parlay leg correlation analysis |

---

## Steam move / sharp action alerts (L4608–L4710)

| Function | Line | Does |
|---|---|---|
| `toggleSteamAlerts()` | 4612 | Shows/hides steam alerts panel |
| `detectSteamMoves()` | 4620 | Detects significant line movements from odds history |
| `renderSteamAlerts()` | 4682 | Renders steam move alert cards |

---

## Tilt detector (L4711–L4825)

| Function | Line | Does |
|---|---|---|
| `calcTiltScore()` | 4712 | Calculates tilt score from recent loss patterns and bet sizing changes |

---

## Highlights tab (L4827–L5029)

| Function | Line | Does |
|---|---|---|
| `renderHighlights()` | 4827 | Renders best/worst bets, CLV summary, tilt detector panel |

---

## Live scores (L5031–L5095)

| Function | Line | Does |
|---|---|---|
| `fetchLiveScores(callback)` | 5031 | Fetches current scores from ESPN for all active sports |

---

## Refresh and auto-settle (L5097–L5214)

| Function | Line | Does |
|---|---|---|
| `refreshAndSettle()` | 5097 | Triggers scraper refresh via server API, then runs auto-settle on new data |
| `findGameData(bet)` | 5142 | Finds the ESPN game record matching a bet |
| `determineResult(bet, game)` | 5151 | Determines W/L/P for a bet given ESPN game data |

---

## Futures odds fetch (L5215–L5324)

| Function | Line | Does |
|---|---|---|
| `_buildFuturesSportsParam()` | 5216 | Builds the `?sports=` query param for the futures API call |
| `fetchFuturesOdds()` | 5232 | Fetches championship odds from server `/api/futures-odds` |
| `fetchOddsHistory()` | 5255 | Fetches odds history from server `/api/odds-history` |
| `lookupOddsHistory(pick)` | 5269 | Returns odds history entries for a given pick string |
| `buildSparkline(historyEntries, placedOdds)` | 5293 | Builds inline SVG sparkline for odds movement |

---

## Closing line fetch (L5325–L5384)

| Function | Line | Does |
|---|---|---|
| `fetchClosingLines(callback)` | 5326 | Fetches stored closing lines from server `/api/closing-lines` |
| `capturePreGameClosingLines()` | 5349 | Saves current open-bet odds as closing lines before game start |

---

## Action Network consensus (L5390–L5584)

| Function | Line | Does |
|---|---|---|
| `normAbbrAN(a)` | 5402 | Normalises team abbreviation for Action Network |
| `anTodayStr()` | 5412 | Returns today's date string in Action Network format |
| `toPct(v)` | 5420 | Converts decimal to percentage string |
| `parseANConsensus(cs, game)` | 5428 | Parses Action Network consensus data for a game |
| `fetchANSport(anSport, done)` | 5445 | Fetches consensus data for one sport from Action Network |
| `fetchAllConsensus(onComplete)` | 5483 | Fetches consensus for all active sports |
| `getGameConsensus(g)` | 5499 | Returns consensus data for a specific game |
| `deriveSharpSide(cs)` | 5515 | Determines sharp side from consensus data (money % diverges from bet %) |
| `renderConsensusStrip(g)` | 5525 | Renders the bet%/money%/sharp indicator for an upcoming game card |

---

## Upcoming games (L5585–5974)

| Function | Line | Does |
|---|---|---|
| `isMarchMadness()` | 5585 | Returns true if current date is in March Madness window |
| `upcomingCacheKey()` | 5591 | Returns localStorage cache key for upcoming games |
| `parseESPNEvent(ev, sport, league)` | 5596 | Parses ESPN event object into internal game format |
| `fetchESPNEndpoint(ep, callback)` | 5673 | Fetches a single ESPN API endpoint |
| `fetchUpcomingGames(callback)` | 5695 | Fetches upcoming games from server `/api/upcoming-games` |
| `loadUpcomingCache()` | 5731 | Loads upcoming games from localStorage cache |
| `setUpcomingFilter(sport)` | 5739 | Sets sport filter for upcoming games tab |
| `refreshUpcomingGames()` | 5748 | Triggers a live upcoming games refresh |
| `leagueTagClass(league)` | 5760 | Returns CSS class for league tag |
| `fmtUpcomingOdds(val)` | 5776 | Formats odds for upcoming game display |
| `fmtUpcomingTime(dateStr)` | 5782 | Formats game time for upcoming game card |
| `renderGameCard(g)` | 5792 | Renders a single upcoming game card (with spread, ML, total, consensus) |
| `renderUpcomingGames()` | 5888 | Renders full upcoming games tab |
| `initUpcomingTab()` | 5975 | Initialises upcoming games tab: loads cache, starts fetches |

---

## NFL history tab (L6007–L6343)

| Function | Line | Does |
|---|---|---|
| `nhSetSeason(season)` | 6010 | Sets active NFL history season filter |
| `renderNFLHistory()` | 6020 | Renders full NFL historical performance tab (2024+2025 seasons) |

---

## Bet log tab (L6344–L6467)

| Function | Line | Does |
|---|---|---|
| `setBetLogFilter(f)` | 6347 | Sets bet log filter (all/W/L/P) |
| `setBetLogSort(col)` | 6355 | Sets sort column for bet log table |
| `renderBetLog()` | 6365 | Renders sortable/filterable bet log table |
| `betLogPL(b)` | 6454 | Returns P&L value for a bet in log format |
| `betLogDateStr(b)` | 6461 | Returns date string for a bet in log format |

---

## Navigation, settings, sync (L6469–L6620)

| Function | Line | Does |
|---|---|---|
| `switchTab(tab)` | 6470 | Switches active tab; triggers tab-specific data fetches |
| `toggleSettings()` | 6489 | Shows/hides settings panel |
| `saveSettings()` | 6499 | Saves settings (unit size, API key, etc.) to store |
| `clearAllData()` | 6507 | Wipes all bet data from localStorage (irreversible) |
| `syncFromExcel()` | 6522 | **Main sync function** — fetches `/api/bets` + `/api/open-bets` from server, replaces store, calls `runBetPipeline` |

---

## Render all and init (L6595–L6790)

| Function | Line | Does |
|---|---|---|
| `renderAll()` | 6596 | Renders only the active tab + stats bar (skips inactive tabs to save DOM ops) |
| `setupTextarea()` | 6628 | Sets up chat textarea auto-resize behaviour |
| `init()` | 6658 | App startup: loads data, syncs from Excel, starts live score polling, enrichment, consensus fetch |
| `autoSyncIfInflated()` | 6751 | Auto-syncs from Excel on startup if localStorage bet count looks stale |

---

## How to do a targeted read

To read just one function:
```bash
# Read lines 3354–3376 (runBetPipeline)
# Use the Read tool with offset:3354 limit:23
```

To find an unknown function fast:
```bash
grep -n "function functionName" betting-tracker.html
```
