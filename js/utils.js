/* Utility functions, filters, formatting */
/* Extracted from betting-tracker.html — do not edit the original */

function invalidateStats() { statsCache.dirty = true; claudeCacheVersion++; }

/* Single source of truth: is this bet a futures wager?
   Catches type==='future', line==='Future', and pick/matchup text that names a
   championship/outright market even when the server didn't tag it as future. */
function isFutureBet(b) {
  if (!b) return false;
  if (b.type === 'future') return true;
  var line = (b.line || '').toString().toLowerCase();
  if (line === 'future' || line.indexOf('future') !== -1) return true;
  var hay = ((b.pick || '') + ' ' + (b.matchup || '')).toLowerCase();
  if (/\bchampionship\b/.test(hay)) return true;
  if (/\bchampions league\b/.test(hay)) return true;
  if (/\bpremier league\b/.test(hay)) return true;
  if (/\bworld series\b/.test(hay)) return true;
  if (/\bsuper bowl\b/.test(hay)) return true;
  if (/\bstanley cup\b/.test(hay)) return true;
  if (/\bworld cup\b/.test(hay)) return true;
  if (/\b(?:ucl|epl|la liga|serie a|bundesliga|copa america|euros)\b/.test(hay)) return true;
  if (/\bmvp\b/.test(hay) || /\boutright\b/.test(hay)) return true;
  if (/\bto win\b/.test(hay)) return true;
  return false;
}

function getCachedFiltered() {
  var currentFilter = JSON.stringify(chartFilter || {});
  if (!statsCache.dirty && statsCache.lastFilter === currentFilter) return statsCache;
  /* Single applyChartFilter call — everything else is O(n) passes on the result. */
  var all = applyChartFilter(store.bets.concat(store.futures));
  var settled = all.filter(function(b) { return b.settled && b.result; });
  var sortedSettled = settled.slice().sort(function(a, b) { return new Date(a.settledDate || 0) - new Date(b.settledDate || 0); });
  var open = all.filter(function(b) { return !b.settled; });
  /* Non-future partitions used by the bets panels (futures have their own tab). */
  var settledBets = settled.filter(function(b) { return !isFutureBet(b); });
  var openBets = open.filter(function(b) { return !isFutureBet(b); });
  statsCache.filteredAll = all;
  statsCache.filteredSettled = settled;
  statsCache.filteredSettledBets = settledBets;
  statsCache.filteredOpenBets = openBets;
  statsCache.sortedSettled = sortedSettled;
  statsCache.filteredOpen = open;
  statsCache.lastFilter = currentFilter;
  statsCache.dirty = false;
  return statsCache;
}

/* ===== CHART FILTERS ===== */
var chartFilter = {
  sport: 'all',       /* 'all','NBA','NFL','NCAAMB','NCAAWB','Soccer','Other' */
  betType: 'all',     /* 'all','spread','moneyline','total','parlay','future' */
  favDog: 'all',      /* 'all','favorite','underdog','pickem' */
  timePeriod: '7',    /* 'all','7','30','90' (days lookback) */
  source: 'all',      /* 'all','Bovada','Locks' */
  search: ''          /* free text search for team/matchup */
};

function isFavorite(bet) {
  if (!bet.odds) return 'pickem';
  if (bet.odds < 0 && bet.odds > -105) return 'pickem';
  if (bet.odds > 0 && bet.odds < 105) return 'pickem';
  return bet.odds < 0 ? 'favorite' : 'underdog';
}

function applyChartFilter(bets) {
  var filtered = bets;
  if (chartFilter.sport !== 'all') {
    filtered = filtered.filter(function(b) { return (b.sport || 'Other') === chartFilter.sport; });
  }
  if (chartFilter.betType !== 'all') {
    filtered = filtered.filter(function(b) { return (b.type || 'other') === chartFilter.betType; });
  }
  if (chartFilter.favDog !== 'all') {
    filtered = filtered.filter(function(b) { return isFavorite(b) === chartFilter.favDog; });
  }
  if (chartFilter.source !== 'all') {
    filtered = filtered.filter(function(b) { return (b.source || 'Locks') === chartFilter.source; });
  }
  if (chartFilter.timePeriod !== 'all') {
    var cutoff;
    if (chartFilter.timePeriod === 'thisMonth') {
      var now = new Date();
      cutoff = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (chartFilter.timePeriod === 'season') {
      /* Season = Sept 1 of the most recent fall. If before Sept, use prior year. */
      var now = new Date();
      var yr = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
      cutoff = new Date(yr, 8, 1);
    } else {
      var days = parseInt(chartFilter.timePeriod, 10);
      cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
    }
    filtered = filtered.filter(function(b) {
      var d = b.settledDate ? new Date(b.settledDate) : (b.addedDate ? new Date(b.addedDate) : null);
      return d && d >= cutoff;
    });
  }
  if (chartFilter.search) {
    var q = chartFilter.search.toLowerCase();
    filtered = filtered.filter(function(b) {
      return ((b.matchup || '') + ' ' + (b.pick || '') + ' ' + (b.sport || '')).toLowerCase().indexOf(q) !== -1;
    });
  }
  return filtered;
}

function getActiveFilterCount() {
  var c = 0;
  if (chartFilter.sport !== 'all') c++;
  if (chartFilter.betType !== 'all') c++;
  if (chartFilter.favDog !== 'all') c++;
  if (chartFilter.timePeriod !== 'all') c++;
  if (chartFilter.source !== 'all') c++;
  if (chartFilter.search) c++;
  return c;
}

function setHomePeriod(val) {
  chartFilter.timePeriod = val;
  updateTimePeriodBtns();
  invalidateStats();
  renderFilterBars();
  renderDashStats();
  renderOpenBets();
  renderSettledBets();
  renderHomeCharts();
  updateHomeFilterToggle();
}

function updateTimePeriodBtns() {
  var btns = document.querySelectorAll('.tp-btn');
  for (var i = 0; i < btns.length; i++) {
    btns[i].classList.toggle('active', btns[i].getAttribute('data-period') === chartFilter.timePeriod);
  }
}

function setChartFilter(key, value) {
  chartFilter[key] = value;
  if (key === 'timePeriod') updateTimePeriodBtns();
  invalidateStats();
  renderFilterBars();
  renderHomeCharts();
  renderDashStats();
  /* Also re-filter open bets and settled bets panels */
  renderOpenBets();
  renderSettledBets();
  if (store.currentTab === 'analytics') { renderHighlights(); renderAnalyticsCharts(); renderDeepAnalysis(); }
  updateHomeFilterToggle();
}

function onFilterSearch(e) {
  chartFilter.search = e.target.value;
  invalidateStats();
  /* Sync both search inputs */
  var inputs = document.querySelectorAll('.filter-search');
  for (var i = 0; i < inputs.length; i++) {
    if (inputs[i] !== e.target) inputs[i].value = e.target.value;
  }
  renderHomeCharts();
  renderDashStats();
  renderOpenBets();
  renderSettledBets();
  if (store.currentTab === 'analytics') { renderHighlights(); renderAnalyticsCharts(); renderDeepAnalysis(); }
}

function clearAllFilters() {
  chartFilter.sport = 'all';
  chartFilter.betType = 'all';
  chartFilter.favDog = 'all';
  chartFilter.timePeriod = 'all';
  chartFilter.source = 'all';
  chartFilter.search = '';
  updateTimePeriodBtns();
  renderFilterBars();
  renderHomeCharts();
  renderDashStats();
  renderOpenBets();
  renderSettledBets();
  if (store.currentTab === 'analytics') { renderHighlights(); renderAnalyticsCharts(); renderDeepAnalysis(); }
  updateHomeFilterToggle();
}

var homeFilterOpen = false;
function toggleHomeFilter() {
  homeFilterOpen = !homeFilterOpen;
  var bar = document.getElementById('homeFilterBar');
  if (bar) bar.classList.toggle('collapsed', !homeFilterOpen);
}
function updateHomeFilterToggle() {
  var btn = document.getElementById('homeFilterToggle');
  if (!btn) return;
  var count = getActiveFilterCount();
  btn.classList.toggle('has-filters', count > 0);
  btn.innerHTML = '<span class="filter-dot"></span> Filters' + (count > 0 ? ' (' + count + ')' : '');
}

function renderFilterBars() {
  var bars = [document.getElementById('homeFilterBar'), document.getElementById('analyticsFilterBar'), document.getElementById('deepFilterBar')];
  var sports = ['all','NBA','NFL','NCAAMB','NCAAWB','Soccer','Other'];
  var betTypes = ['all','spread','moneyline','total','parlay'];
  var favDogs = ['all','favorite','underdog','pickem'];
  var activeCount = getActiveFilterCount();

  var html = '';

  /* Sport filter */
  html += '<div class="filter-group"><span class="filter-label">Sport</span>';
  for (var i = 0; i < sports.length; i++) {
    var s = sports[i];
    var label = s === 'all' ? 'All' : s;
    html += '<button class="fbtn' + (chartFilter.sport === s ? ' active' : '') + '" onclick="setChartFilter(\'sport\',\'' + s + '\')">' + label + '</button>';
  }
  html += '</div>';

  html += '<div class="filter-divider"></div>';

  /* Bet type filter */
  html += '<div class="filter-group"><span class="filter-label">Type</span>';
  for (var i = 0; i < betTypes.length; i++) {
    var bt = betTypes[i];
    var label = bt === 'all' ? 'All' : bt.charAt(0).toUpperCase() + bt.slice(1);
    if (bt === 'moneyline') label = 'ML';
    if (bt === 'total') label = 'O/U';
    html += '<button class="fbtn' + (chartFilter.betType === bt ? ' active' : '') + '" onclick="setChartFilter(\'betType\',\'' + bt + '\')">' + label + '</button>';
  }
  html += '</div>';

  html += '<div class="filter-divider"></div>';

  /* Fav/Dog filter */
  html += '<div class="filter-group"><span class="filter-label">Side</span>';
  for (var i = 0; i < favDogs.length; i++) {
    var fd = favDogs[i];
    var label = fd === 'all' ? 'All' : fd === 'pickem' ? 'Pick\'em' : fd.charAt(0).toUpperCase() + fd.slice(1);
    html += '<button class="fbtn' + (chartFilter.favDog === fd ? ' active' : '') + '" onclick="setChartFilter(\'favDog\',\'' + fd + '\')">' + label + '</button>';
  }
  html += '</div>';

  html += '<div class="filter-divider"></div>';

  /* Time period dropdown */
  html += '<div class="filter-group"><span class="filter-label">Time</span>';
  html += '<select class="filter-select' + (chartFilter.timePeriod !== 'all' ? ' has-value' : '') + '" onchange="setChartFilter(\'timePeriod\', this.value)">';
  var timePeriods = [['all','All Time'],['7','Last 7 Days'],['30','Last 30 Days'],['thisMonth','This Month'],['90','Last 90 Days'],['season','This Season']];
  for (var i = 0; i < timePeriods.length; i++) {
    var tp = timePeriods[i];
    html += '<option value="' + tp[0] + '"' + (chartFilter.timePeriod === tp[0] ? ' selected' : '') + '>' + tp[1] + '</option>';
  }
  html += '</select></div>';

  html += '<div class="filter-divider"></div>';

  /* Source filter */
  var sources = ['all','Bovada','Locks'];
  html += '<div class="filter-group"><span class="filter-label">Source</span>';
  for (var i = 0; i < sources.length; i++) {
    var src = sources[i];
    var label = src === 'all' ? 'All' : src;
    html += '<button class="fbtn' + (chartFilter.source === src ? ' active' : '') + '" onclick="setChartFilter(\'source\',\'' + src + '\')">' + label + '</button>';
  }
  html += '</div>';

  html += '<div class="filter-divider"></div>';

  /* Search */
  html += '<div class="filter-group"><span class="filter-label">Search</span>';
  html += '<input class="filter-search" type="text" placeholder="Team, matchup..." value="' + escHtml(chartFilter.search) + '" oninput="onFilterSearch(event)">';
  html += '</div>';

  /* Clear + active count */
  if (activeCount > 0) {
    html += '<span class="filter-active-count">' + activeCount + ' filter' + (activeCount > 1 ? 's' : '') + ' active</span>';
    html += '<button class="clear-filters" onclick="clearAllFilters()">Clear All</button>';
  }

  for (var i = 0; i < bars.length; i++) {
    if (bars[i]) bars[i].innerHTML = html;
  }
}


/* ===== UTILITY ===== */
function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function calcToWin(stake, odds) {
  if (!odds || odds === 0) return 0;
  if (odds > 0) return +(stake * (odds / 100)).toFixed(2);
  return +(stake * (100 / Math.abs(odds))).toFixed(2);
}
function fmtOdds(odds) { if (!odds || odds === 0) return 'N/A'; return odds > 0 ? '+' + odds : String(odds); }
function fmtMoney(n) { return '$' + Math.abs(n).toFixed(2); }
function parseGameDate(d) {
  if (!d) return 0;
  /* Try the ET-aware regex FIRST so all M/D/Y H:MM AM/PM dates (2-digit OR 4-digit year)
     get consistent ET→UTC conversion. Previously, 4-digit years hit new Date() first and
     got interpreted as LOCAL time, while 2-digit years fell through to the regex and got ET.
     This caused settled bets to sort against mixed timezones. */
  var m = String(d).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (m) {
    var yr = parseInt(m[3],10); if (yr < 100) yr += 2000;
    var hr = parseInt(m[4],10); var ampm = m[6].toUpperCase();
    if (ampm === 'PM' && hr < 12) hr += 12;
    if (ampm === 'AM' && hr === 12) hr = 0;
    /* Game times from bet slips are ET (EDT=UTC-4 spring, EST=UTC-5 fall).
       Determine ET offset by checking if date falls within DST window (second Sunday
       March through first Sunday November). Convert to UTC so display in any local
       timezone is correct. */
    var mo = parseInt(m[1],10) - 1; /* 0-indexed month */
    var dy = parseInt(m[2],10);
    /* DST approximation: EDT (UTC-4) from ~March 8 to ~November 1 each year */
    var etOffsetHours = (mo > 2 && mo < 10) ? 4 : 5; /* EDT=4, EST=5 */
    if (mo === 2 && dy >= 8) etOffsetHours = 4; /* after second Sunday in March approx */
    if (mo === 10 && dy <= 7) etOffsetHours = 4; /* before first Sunday in November approx */
    return Date.UTC(yr, mo, dy, hr + etOffsetHours, parseInt(m[5],10));
  }
  /* Fallback: ISO strings, other formats */
  var dt = new Date(d);
  if (!isNaN(dt.getTime()) && dt.getFullYear() > 1970) return dt.getTime();
  return 0;
}
function fmtDate(d) {
  if (!d) return '';
  var ts = parseGameDate(d);
  if (!ts) return '';
  var dt = new Date(ts);
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
/* ===== ESPN GAME TIME CACHE ===== */
var espnGameCache = {};
var espnCacheLoaded = false;

function getEspnTeamKey(name) {
  if (!name) return '';
  return name.toUpperCase().replace(/[^A-Z]/g, '').replace(/COMMODORES|CORNHUSKERS|WOLVERINES|BUCKEYES|GATORS|CRIMSONTIDE|BLUEDEVILS|TARHEELS|WOLFPACK|ORANGEMEN|SEMINOLES|WILDCATS|CYCLONES|BOILERMAKERS|HURRICANES|HAWKEYES|HOOSIERS|BULLDOGS|HUSKIES|JAYHAWKS|CARDINALS|SPARTANS|CAVALIERS|LONGHORNS|VOLUNTEERS|AGGIES|RAMS|TIGERS|BEARS|COUGARS|RAZORBACKS|REDHAWKS|RETRIEVERS|PIONEERS|COLONELS|COWBOYS|MUSKETEERS|BISON|OWLS|PANTHERS|MOUNTAINEERS|EAGLES|KNIGHTS|LEOPARDS|GOVERNORS|EXPLORERS|MONARCHS|DUKES|BRAVES|BUCCANEERS|SHARKS|GAELS|TOREROS|FRIARS|DONS|TERRIERS|BRONCOS|PEACOCKS|FLAMES|BEAVERS|ANTEATERS|UTES|BADGERS|GOPHERS|BRUINS|DUCKS|TROJANS|FLYERS|RAMBLERS|SHOCKERS|PALADINS|TERRAPINS|TERPS|ZAGS|PILOTS|SOONERS|MUSTANGS|HORNETS|REDRAIDERS|HORNEDFROGS$/i, '');
}

/* Normalize a team name for grouping: strips bet-type suffixes and mascots,
   returns uppercase alpha-only string so same school always maps to same key. */
function normalizeTeamKeyForGrouping(name) {
  if (!name) return '';
  name = name.replace(/\s+(?:Live Straight|Live Game|Live|Straight)\s*(?:\([+-]?\d+\))?.*$/i, '').trim();
  name = name.replace(/\s*\([+-]?\d+\)\s*$/, '').trim();
  /* Strip Bovada sport prefix (e.g. "Basketball Duke Blue Devils" → "Duke Blue Devils") */
  name = name.replace(/^(?:Basketball|Football|Baseball|Hockey|Soccer|Tennis|Boxing|MMA|Golf|Cricket|College)\s+/i, '').trim();
  /* Strip Bovada bet-type suffix (e.g. " - Money Line: Duke Blue Devils") */
  name = name.replace(/\s+-\s+(?:Money Line|Moneyline|Point Spread|Total(?:\s+Points)?|3-Way Moneyline|Spread)[:\s].*$/i, '').trim();
  return getEspnTeamKey(name);
}

/* Human-readable matchup with mascots stripped for clean group headers.
   "Vanderbilt Commodores vs Nebraska Cornhuskers" -> "Vanderbilt vs Nebraska"
   Also handles "49ers @ Seahawks" format and strips Bovada seed numbers like (#11). */
function shortenMatchupDisplay(matchup) {
  if (!matchup) return matchup;
  var MASCOTS = /\s+(?:Commodores|Cornhuskers|Wolverines|Buckeyes|Gators|Crimson Tide|Blue Devils|Tar Heels|Wolfpack|Orange|Seminoles|Wildcats|Cyclones|Boilermakers|Hurricanes|Hawkeyes|Hoosiers|Bulldogs|Huskies|Jayhawks|Cardinals|Spartans|Cavaliers|Longhorns|Volunteers|Aggies|Rams|Tigers|Bears|Cougars|Razorbacks|Badgers|Gophers|Bruins|Ducks|Trojans|Flyers|Friars|Gaels|Shockers|Ramblers|Paladins|Terrapins|Terps|Zags|Pilots|Sooners|Mustangs|Eagles|Knights|Panthers|Owls|Flames|Beavers|Peacocks|Red Raiders|Horned Frogs|Anteaters|Utes|Mountaineers|Colonels|Cowboys|Pioneers|Governors|Bison|Monarchs|Braves|Buccaneers|Sharks|Dons|Terriers|Broncos)\s*$/i;
  /* Strip Bovada bet-type suffix before splitting: "...vs Team B - Money Line: Team A (+167)" */
  matchup = matchup.replace(/\s+-\s+(?:Money Line|Moneyline|Point Spread|Total(?:\s+Points)?|3-Way Moneyline|Spread)[:\s].*$/i, '').trim();
  /* Detect separator — prefer @ (preserves home/away context), fall back to vs */
  var sep, parts;
  if (/\s+@\s+/.test(matchup)) {
    sep = ' @ ';
    parts = matchup.split(/\s+@\s+/);
  } else {
    sep = ' vs ';
    parts = matchup.split(/\s+vs\.?\s+/i);
  }
  return parts.map(function(t) {
    t = t.replace(/\s+(?:Live Straight|Live Game|Live|Straight)\s*(?:\([+-]?\d+\))?.*$/i, '').trim();
    t = t.replace(/\s*\([+-]?\d+\)\s*$/, '').trim();
    /* Strip seed/ranking suffixes like "(#11)" or "(#6)" */
    t = t.replace(/\s*\(#?\d+\)\s*/g, '').trim();
    /* Strip Bovada sport category prefix: "Basketball Duke Blue Devils" → "Duke Blue Devils" */
    t = t.replace(/^(?:Basketball|Football|Baseball|Hockey|Soccer|Tennis|Boxing|MMA|Golf|Cricket|College)\s+/i, '').trim();
    return t.replace(MASCOTS, '').trim();
  }).join(sep);
}

/* Extract the "picked team" from a matchup string.
   For "Team A vs/@ Team B": returns the first team (Team A = the side you bet on).
   For single-team entries like "Jags - 3.5": strips the embedded line and returns the team name. */
function extractTeamFromMatchup(matchup) {
  if (!matchup) return '';
  var vsMatch = matchup.match(/^(.+?)\s+(?:vs\.?|@)\s+/i);
  if (vsMatch) {
    var team = vsMatch[1].trim();
    /* Strip Bovada sport prefix */
    team = team.replace(/^(?:Basketball|Football|Baseball|Hockey|Soccer|Tennis|Boxing|MMA|Golf|Cricket|College)\s+/i, '').trim();
    /* Strip seed/ranking like (#11) */
    team = team.replace(/\s*\(#?\d+\)\s*/g, '').trim();
    /* Strip mascots */
    team = team.replace(/\s+(?:Commodores|Cornhuskers|Wolverines|Buckeyes|Gators|Crimson Tide|Blue Devils|Tar Heels|Wolfpack|Orange|Seminoles|Wildcats|Cyclones|Boilermakers|Hurricanes|Hawkeyes|Hoosiers|Bulldogs|Huskies|Jayhawks|Cardinals|Spartans|Cavaliers|Longhorns|Volunteers|Aggies|Rams|Tigers|Bears|Cougars|Razorbacks|Badgers|Gophers|Bruins|Ducks|Trojans|Flyers|Friars|Gaels|Shockers|Ramblers|Paladins|Terrapins|Terps|Zags|Pilots|Sooners|Mustangs|Eagles|Knights|Panthers|Owls|Flames|Beavers|Peacocks|Red Raiders|Horned Frogs|Anteaters|Utes|Mountaineers|Colonels|Cowboys|Pioneers|Governors|Bison|Monarchs|Braves|Buccaneers|Sharks|Dons|Terriers|Broncos)\s*$/i, '').trim();
    return normalizeTeamName(team);
  }
  /* Single-team matchup: strip embedded line/bet-type info to recover the bare team name */
  var team = matchup
    .replace(/\s+(?:\d[HQ])\b.*/i, '')             /* "2H ML Live", "1Q -3.5" */
    .replace(/\s+Live\b.*/i, '')                    /* "Live ML" */
    .replace(/\s+ML\b.*/i, '')                      /* "ML" */
    .replace(/\s+(?:[-+]\s*)?\d[\d.]*\s*$/i, '')   /* trailing spread like "- 3.5" or "+4.5" */
    .trim();
  return normalizeTeamName(team) || normalizeTeamName(matchup);
}

/* Extract the opponent team from a "Team A vs/@ Team B" matchup.
   Returns '' for single-team entries (opponent unknown until ESPN enrichment). */
function extractOpponentFromMatchup(matchup) {
  if (!matchup) return '';
  var vsMatch = matchup.match(/^.+?\s+(?:vs\.?|@)\s+(.+)$/i);
  if (!vsMatch) return '';
  var opp = vsMatch[1].trim();
  opp = opp.replace(/^(?:Basketball|Football|Baseball|Hockey|Soccer|Tennis|Boxing|MMA|Golf|Cricket|College)\s+/i, '').trim();
  opp = opp.replace(/\s*\(#?\d+\)\s*/g, '').trim();
  opp = opp.replace(/\s+(?:Commodores|Cornhuskers|Wolverines|Buckeyes|Gators|Crimson Tide|Blue Devils|Tar Heels|Wolfpack|Orange|Seminoles|Wildcats|Cyclones|Boilermakers|Hurricanes|Hawkeyes|Hoosiers|Bulldogs|Huskies|Jayhawks|Cardinals|Spartans|Cavaliers|Longhorns|Volunteers|Aggies|Rams|Tigers|Bears|Cougars|Razorbacks|Badgers|Gophers|Bruins|Ducks|Trojans|Flyers|Friars|Gaels|Shockers|Ramblers|Paladins|Terrapins|Terps|Zags|Pilots|Sooners|Mustangs|Eagles|Knights|Panthers|Owls|Flames|Beavers|Peacocks|Red Raiders|Horned Frogs|Anteaters|Utes|Mountaineers|Colonels|Cowboys|Pioneers|Governors|Bison|Monarchs|Braves|Buccaneers|Sharks|Dons|Terriers|Broncos)\s*$/i, '').trim();
  return normalizeTeamName(opp);
}

/* Attempt to derive the opponent from an already-enriched espnMatchup string
   ("Away vs Home") when we have teamBetOn but opponent is still empty. */
function deriveOpponentFromEspnMatchup(bet) {
  if (!bet.espnMatchup || !bet.teamBetOn || bet.opponent) return;
  var parts = bet.espnMatchup.split(/\s+vs\.?\s+/i);
  if (parts.length !== 2) return;
  var k0 = getEspnTeamKey(parts[0]);
  var k1 = getEspnTeamKey(parts[1]);
  var picked = getEspnTeamKey(bet.teamBetOn);
  if (!picked) return;
  if (k0 && (k0 === picked || k0.indexOf(picked) !== -1 || picked.indexOf(k0) !== -1)) {
    bet.opponent = normalizeTeamName(parts[1].trim());
  } else if (k1 && (k1 === picked || k1.indexOf(picked) !== -1 || picked.indexOf(k1) !== -1)) {
    bet.opponent = normalizeTeamName(parts[0].trim());
  }
}

/* Build the clean pick label for the bet log: "Team spread-or-ML" with no odds.
   Keeps parlays as-is (just strips redundant "Parlay Parlay" and trailing odds). */
function buildPickDisplay(b) {
  if (!b) return '';
  var matchup = b.matchup || '';
  var line    = (b.line || '').replace(/\s*\([+-]?\d+\)\s*$/, '').trim();
  var pick    = (b.pick  || '').trim();
  var type    = b.type   || '';

  /* Parlays: clean up but keep team list intact */
  if (type === 'parlay') {
    return pick
      .replace(/\bParlay\s+Parlay\b/gi,   'Parlay')
      .replace(/\bML Parlay Parlay\b/gi,   'ML Parlay')
      .replace(/\s*\([+-]?\d+\)\s*$/,      '')
      .trim() || pick;
  }

  var team = extractTeamFromMatchup(matchup);

  if (team && line && line.toUpperCase() !== 'N/A') {
    return team + ' ' + line;
  }
  if (team) return team;

  /* Fallback: strip odds from raw pick string */
  return pick.replace(/\s*\([+-]?\d+\)\s*$/, '').trim() || pick;
}


function sportClass(sport) {
  if (!sport) return 'other';
  var s = sport.toUpperCase();
  if (s.indexOf('NBA') !== -1) return 'nba';
  if (s.indexOf('NFL') !== -1) return 'nfl';
  if (s.indexOf('NCAAMB') !== -1 || s.indexOf('CBB') !== -1 || (s.indexOf('NCAA') !== -1 && s.indexOf('M') !== -1)) return 'ncaamb';
  if (s.indexOf('NCAAWB') !== -1 || (s.indexOf('NCAA') !== -1 && s.indexOf('W') !== -1)) return 'ncaawb';
  if (s.indexOf('SOCCER') !== -1 || s.indexOf('MLS') !== -1 || s.indexOf('EPL') !== -1 || s.indexOf('UEFA') !== -1) return 'soccer';
  return 'other';
}
function escHtml(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

/* ===== SPORT DETECTION ===== */
var NBA_TEAMS = ['lakers','celtics','warriors','nets','knicks','bucks','76ers','sixers','suns','heat','bulls','mavs','mavericks','nuggets','clippers','hawks','grizzlies','cavaliers','cavs','timberwolves','wolves','pelicans','raptors','pacers','kings','magic','wizards','hornets','blazers','trail blazers','pistons','rockets','thunder','spurs','jazz'];
var NFL_TEAMS = ['chiefs','eagles','bills','cowboys','49ers','niners','ravens','bengals','dolphins','lions','chargers','jaguars','jets','bears','packers','vikings','steelers','rams','seahawks','commanders','saints','broncos','texans','falcons','browns','colts','cardinals','raiders','titans','giants','panthers','buccaneers','bucs','patriots'];
var SOCCER_TEAMS = ['inter miami','lafc','atlanta united','sounders','galaxy','portland timbers','nashville','columbus crew','fc cincinnati','nycfc','austin fc','sporting kc','real salt lake','minnesota united','orlando city','cf montreal','dc united','charlotte fc','chicago fire','new england revolution','san jose earthquakes','vancouver whitecaps','toronto fc','liverpool','manchester','arsenal','chelsea','tottenham','barcelona','real madrid','bayern','psg','juventus','milan','dortmund'];

function detectSport(text) {
  var lower = text.toLowerCase();
  for (var i = 0; i < NBA_TEAMS.length; i++) { if (lower.indexOf(NBA_TEAMS[i]) !== -1) return 'NBA'; }
  for (var i = 0; i < NFL_TEAMS.length; i++) { if (lower.indexOf(NFL_TEAMS[i]) !== -1) return 'NFL'; }
  for (var i = 0; i < SOCCER_TEAMS.length; i++) { if (lower.indexOf(SOCCER_TEAMS[i]) !== -1) return 'Soccer'; }
  if (/\b(ncaa|college|march madness|final four)\b/i.test(text)) return 'NCAAMB';
  return 'Other';
}

