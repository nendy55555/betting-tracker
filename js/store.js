/* App state, globals, cache objects */
/* Extracted from betting-tracker.html — do not edit the original */

/* ===== APP STATE ===== */
var DATA_VERSION = 5;
var store = {
  bets: [],
  futures: [],
  currentTab: 'home',
  settledFilter: 'all',
  pendingConfirmation: null,
  pendingBatchConfirmation: null,
  awaitingOdds: null,
  chatHistory: [],
  defaultStake: 50,
  oddsApiKey: '',
  claudeApiKey: ''
};
var charts = {};
var cachedLiveScores = {};
var cachedFuturesOdds = {};
var cachedOddsHistory = {}; /* { team_lower: [ {odds, bookmaker, ts}, ... ] } */
var cachedClosingLines = {};
var espnGameData = {};
var espnBackoff = 1; /* Exponential backoff for ESPN polling */

/* ===== STATS CACHE ===== */
var statsCache = { dirty: true, all: null, settled: null, open: null, filteredAll: null, filteredSettled: null, filteredSettledBets: null, filteredOpenBets: null, sortedSettled: null, lastFilter: null };
var claudeCacheVersion = 0;

