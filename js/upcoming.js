/* Upcoming games, consensus data, NFL history */
/* Extracted from betting-tracker.html — do not edit the original */

function parseANConsensus(cs, game) {
  if (!cs) return null;
  /* Field names vary across AN API versions */
  var awayBets  = toPct(cs.away_bets   !== undefined ? cs.away_bets   : cs.awayBets   !== undefined ? cs.awayBets   : cs.away_spread_bets);
  var homeBets  = toPct(cs.home_bets   !== undefined ? cs.home_bets   : cs.homeBets   !== undefined ? cs.homeBets   : cs.home_spread_bets);
  var awayMoney = toPct(cs.away_money  !== undefined ? cs.away_money  : cs.awayMoney  !== undefined ? cs.awayMoney  : cs.away_spread_money);
  var homeMoney = toPct(cs.home_money  !== undefined ? cs.home_money  : cs.homeMoney  !== undefined ? cs.homeMoney  : cs.home_spread_money);
  /* Infer missing side if only one is given */
  if (awayBets !== null  && homeBets  === null)  homeBets  = 100 - awayBets;
  if (homeBets !== null  && awayBets  === null)  awayBets  = 100 - homeBets;
  if (awayMoney !== null && homeMoney === null)   homeMoney = 100 - awayMoney;
  if (homeMoney !== null && awayMoney === null)   awayMoney = 100 - homeMoney;
  if (awayBets === null && homeBets === null) return null;  /* nothing usable */
  return { awayBets: awayBets, homeBets: homeBets, awayMoney: awayMoney, homeMoney: homeMoney };
}

/* Fetch one sport's consensus data from Action Network */
function fetchANSport(anSport, done) {
  var date = anTodayStr();
  var ckey = anSport + ':' + date;
  if (consensusFetching[ckey]) { done(); return; }
  consensusFetching[ckey] = true;
  var url = 'https://api.actionnetwork.com/web/v1/games?sport=' + anSport + '&date=' + date;
  var xhr = new XMLHttpRequest();
  xhr.open('GET', url, true);
  xhr.timeout = 9000;
  xhr.onload = function() {
    consensusFetching[ckey] = false;
    try {
      var resp = JSON.parse(xhr.responseText);
      var anGames = resp.games || [];
      var lookup = {};
      for (var i = 0; i < anGames.length; i++) {
        var ag = anGames[i];
        /* Support both snake_case and camelCase team objects */
        var at = ag.away_team || ag.awayTeam || {};
        var ht = ag.home_team || ag.homeTeam || {};
        var awayAbbr = normAbbrAN(at.abbr || at.abbreviation || at.short_name || '');
        var homeAbbr = normAbbrAN(ht.abbr || ht.abbreviation || ht.short_name || '');
        if (!awayAbbr || !homeAbbr) continue;
        /* AN returns consensus at top level or nested under 'consensus' */
        var cs = ag.consensus || ag;
        var parsed = parseANConsensus(cs, ag);
        if (parsed) lookup[awayAbbr + ':' + homeAbbr] = parsed;
      }
      consensusStore[ckey] = lookup;
    } catch(e) { console.warn('[Consensus] parse error for', anSport, e); }
    done();
  };
  xhr.onerror   = function() { consensusFetching[ckey] = false; done(); };
  xhr.ontimeout = function() { consensusFetching[ckey] = false; done(); };
  xhr.send();
}

/* Fetch consensus for all supported sports; calls onComplete when all finish */
function fetchAllConsensus(onComplete) {
  var sports = Object.keys(AN_SPORT_MAP);  /* NBA, NFL, CBB */
  var remaining = sports.length;
  function done() {
    remaining--;
    if (remaining <= 0) {
      consensusLastFetchMs = Date.now();
      if (onComplete) onComplete();
    }
  }
  for (var i = 0; i < sports.length; i++) {
    fetchANSport(AN_SPORT_MAP[sports[i]], done);
  }
}

/* Retrieve consensus for a rendered game object (matched by team abbreviations) */
function getGameConsensus(g) {
  var anSport = AN_SPORT_MAP[g.sport];
  if (!anSport) return null;
  var ckey = anSport + ':' + anTodayStr();
  var lookup = consensusStore[ckey];
  if (!lookup) return null;
  var ak = normAbbrAN(g.away.abbrev) + ':' + normAbbrAN(g.home.abbrev);
  return lookup[ak] || null;
}

/*
  Money-side heuristic: money % is significantly higher than bet % on one side.
  A 15+ point gap can indicate larger individual wagers on that side.
  This is a rough directional indicator, not a definitive professional signal.
*/
function deriveSharpSide(cs) {
  if (!cs || cs.awayBets === null || cs.awayMoney === null) return null;
  var awayGap = (cs.awayMoney || 0) - (cs.awayBets || 0);
  var homeGap = (cs.homeMoney || 0) - (cs.homeBets || 0);
  if (awayGap >= 15 && awayGap > homeGap) return 'away';
  if (homeGap >= 15 && homeGap > awayGap) return 'home';
  return null;
}

/* Build the consensus strip HTML for one game card */
function renderConsensusStrip(g) {
  var cs = getGameConsensus(g);
  if (!cs || cs.awayBets === null) return '';

  var betsA = cs.awayBets  !== null ? cs.awayBets  + '%' : '?';
  var betsH = cs.homeBets  !== null ? cs.homeBets  + '%' : '?';
  var monA  = cs.awayMoney !== null ? cs.awayMoney + '%' : null;
  var monH  = cs.homeMoney !== null ? cs.homeMoney + '%' : null;
  var betsW = cs.awayBets  !== null ? cs.awayBets  : 50;
  var monW  = cs.awayMoney !== null ? cs.awayMoney : 50;

  var sharp = deriveSharpSide(cs);
  var sharpLabel = sharp === 'away' ? g.away.abbrev : (sharp === 'home' ? g.home.abbrev : null);
  var sharpHtml  = sharpLabel ? '<span class="cs-sharp">💰 ' + escHtml(sharpLabel) + '</span>' : '';

  var betsRow = '<div class="cs-item">' +
    '<span class="cs-lbl">BETS</span>' +
    '<span class="cs-pct-a">' + escHtml(betsA) + '</span>' +
    '<div class="cs-bar"><div class="cs-bar-fill" style="width:' + betsW + '%"></div></div>' +
    '<span class="cs-pct-h">' + escHtml(betsH) + '</span>' +
    '</div>';

  var monRow = monA ? (
    '<div class="cs-item">' +
    '<span class="cs-lbl">$$</span>' +
    '<span class="cs-pct-a">' + escHtml(monA) + '</span>' +
    '<div class="cs-bar"><div class="cs-bar-fill money" style="width:' + monW + '%"></div></div>' +
    '<span class="cs-pct-h">' + escHtml(monH) + '</span>' +
    '</div>'
  ) : '';

  return '<div class="cs-strip">' + betsRow + monRow + sharpHtml + '</div>';
}

/* Sports to always show. CBB is shown only during March Madness. */
var UPCOMING_SPORTS = [
  { key: 'NBA',        sport: 'NBA',    league: 'NBA',
    url: 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard' },
  { key: 'NFL',        sport: 'NFL',    league: 'NFL',
    url: 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard' },
  { key: 'NCAAMB',     sport: 'CBB',   league: 'NCAAMB', marchOnly: true,
    url: 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?groups=100&limit=50' },
  { key: 'NCAAWB',     sport: 'CBB',   league: 'NCAAWB', marchOnly: true,
    url: 'https://site.api.espn.com/apis/site/v2/sports/basketball/womens-college-basketball/scoreboard?groups=100&limit=50' },
  { key: 'EPL',        sport: 'Soccer', league: 'EPL',
    url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard' },
  { key: 'LaLiga',     sport: 'Soccer', league: 'La Liga',
    url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/scoreboard' },
  { key: 'Bundesliga', sport: 'Soccer', league: 'Bundesliga',
    url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/ger.1/scoreboard' },
  { key: 'SerieA',     sport: 'Soccer', league: 'Serie A',
    url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/ita.1/scoreboard' },
  { key: 'Ligue1',     sport: 'Soccer', league: 'Ligue 1',
    url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/fra.1/scoreboard' },
  { key: 'UCL',        sport: 'Soccer', league: 'UCL',
    url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.champions/scoreboard' },
  { key: 'EL',         sport: 'Soccer', league: 'Europa League',
    url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.europa/scoreboard' }
];

function isMarchMadness() {
  var now = new Date(), m = now.getMonth(), d = now.getDate();
  /* March 12 – April 10 roughly covers Selection Sunday through Championship */
  return (m === 2 && d >= 12) || (m === 3 && d <= 10);
}

function upcomingCacheKey() {
  return 'bt_upcoming_' + new Date().toISOString().slice(0, 10);
}

/* Parse ESPN scoreboard event → normalized game object */
function parseESPNEvent(ev, sport, league) {
  var comp = ev.competitions && ev.competitions[0];
  if (!comp) return null;
  var competitors = comp.competitors || [];
  var home = null, away = null;
  for (var i = 0; i < competitors.length; i++) {
    if (competitors[i].homeAway === 'home') home = competitors[i];
    else away = competitors[i];
  }
  if (!home || !away) return null;

  var statusType = (comp.status && comp.status.type) || {};
  var isLive   = statusType.name === 'STATUS_IN_PROGRESS' || statusType.name === 'STATUS_HALFTIME';
  var isHalf   = statusType.name === 'STATUS_HALFTIME';
  var isFinal  = !!statusType.completed;
  var statusDetail = comp.status && comp.status.type ? (comp.status.type.shortDetail || '') : '';

  function getRecord(c) {
    var recs = c.records || [];
    for (var i = 0; i < recs.length; i++) {
      if (recs[i].name === 'overall' || recs[i].type === 'total') return recs[i].summary;
    }
    return recs.length ? recs[0].summary : '';
  }
  function getRank(c) {
    return (c.curatedRank && c.curatedRank.current && c.curatedRank.current <= 25)
      ? '#' + c.curatedRank.current : '';
  }

  var oddsArr = comp.odds || [];
  var odds = null;
  if (oddsArr.length) {
    var o = oddsArr[0];
    odds = {
      spread:    (o.spread !== undefined && o.spread !== null) ? o.spread : null,
      spreadDetail: o.details || '',
      total:     (o.overUnder !== undefined && o.overUnder !== null) ? o.overUnder : null,
      homeML:    (o.homeTeamOdds && o.homeTeamOdds.moneyLine !== undefined) ? o.homeTeamOdds.moneyLine : null,
      awayML:    (o.awayTeamOdds && o.awayTeamOdds.moneyLine !== undefined) ? o.awayTeamOdds.moneyLine : null
    };
  }

  var network = '';
  if (comp.broadcasts && comp.broadcasts.length) {
    var bcast = comp.broadcasts[0];
    if (bcast.names && bcast.names.length) network = bcast.names[0];
  }

  return {
    id: ev.id,
    sport: sport,
    league: league,
    date: comp.date || ev.date,
    isLive: isLive, isHalf: isHalf, isFinal: isFinal,
    statusDetail: statusDetail,
    network: network,
    home: {
      abbrev: home.team.abbreviation || '',
      name:   home.team.shortDisplayName || home.team.displayName || '',
      record: getRecord(home),
      rank:   getRank(home),
      score:  home.score !== undefined ? home.score : '',
      logo:   home.team.logo || ''
    },
    away: {
      abbrev: away.team.abbreviation || '',
      name:   away.team.shortDisplayName || away.team.displayName || '',
      record: getRecord(away),
      rank:   getRank(away),
      score:  away.score !== undefined ? away.score : '',
      logo:   away.team.logo || ''
    },
    odds: odds
  };
}

/* Fetch one ESPN endpoint */
function fetchESPNEndpoint(ep, callback) {
  var xhr = new XMLHttpRequest();
  xhr.open('GET', ep.url, true);
  xhr.timeout = 9000;
  xhr.onload = function() {
    var games = [];
    try {
      var data = JSON.parse(xhr.responseText);
      var events = data.events || [];
      for (var i = 0; i < events.length; i++) {
        var g = parseESPNEvent(events[i], ep.sport, ep.league);
        if (g) games.push(g);
      }
    } catch(e) { console.warn('[Upcoming] parse error:', ep.league, e); }
    callback(games);
  };
  xhr.onerror   = function() { callback([]); };
  xhr.ontimeout = function() { callback([]); };
  xhr.send();
}

/* Fetch all sports concurrently */
function fetchUpcomingGames(callback) {
  if (upcomingFetchActive) return;
  upcomingFetchActive = true;

  var march = isMarchMadness();
  var endpoints = UPCOMING_SPORTS.filter(function(e) { return !e.marchOnly || march; });
  var allGames = [], remaining = endpoints.length;

  if (!remaining) {
    upcomingFetchActive = false;
    upcomingGamesData = { fetchedAt: Date.now(), games: [] };
    if (callback) callback([]);
    return;
  }

  function onDone() {
    remaining--;
    if (remaining > 0) return;
    upcomingFetchActive = false;
    allGames.sort(function(a, b) { return new Date(a.date) - new Date(b.date); });
    upcomingGamesData = { fetchedAt: Date.now(), games: allGames };
    try { localStorage.setItem(upcomingCacheKey(), JSON.stringify(upcomingGamesData)); } catch(e) {}
    if (callback) callback(allGames);
  }

  for (var i = 0; i < endpoints.length; i++) {
    (function(ep) {
      fetchESPNEndpoint(ep, function(games) {
        for (var j = 0; j < games.length; j++) allGames.push(games[j]);
        onDone();
      });
    })(endpoints[i]);
  }
}

/* Load today's cache from localStorage */
function loadUpcomingCache() {
  try {
    var raw = localStorage.getItem(upcomingCacheKey());
    if (raw) { upcomingGamesData = JSON.parse(raw); return true; }
  } catch(e) {}
  return false;
}

function setUpcomingFilter(sport) {
  upcomingFilter = sport;
  var pills = document.querySelectorAll('.sport-pill');
  for (var i = 0; i < pills.length; i++) {
    pills[i].classList.toggle('active', pills[i].dataset.sport === sport);
  }
  renderUpcomingGames();
}

function refreshUpcomingGames() {
  var btn = document.getElementById('upcomingRefreshBtn');
  if (btn) { btn.classList.add('loading'); btn.textContent = '↻ Refreshing...'; }
  var el = document.getElementById('upcomingGamesList');
  if (el) el.innerHTML = '<div class="upcoming-loading"><div class="upcoming-spinner"></div><br>Fetching games...</div>';
  fetchUpcomingGames(function() {
    if (btn) { btn.classList.remove('loading'); btn.innerHTML = '&#x21bb; Refresh'; }
    renderUpcomingGames();
  });
}

/* Render a league tag class from league name */
function leagueTagClass(league) {
  var l = (league || '').toLowerCase().replace(/\s/g, '');
  if (l === 'nba') return 'nba';
  if (l === 'nfl') return 'nfl';
  if (l === 'ncaamb') return 'ncaamb';
  if (l === 'ncaawb') return 'ncaawb';
  if (l === 'epl') return 'epl';
  if (l === 'laliga') return 'laliga';
  if (l === 'bundesliga') return 'bundesliga';
  if (l === 'seriea') return 'seriea';
  if (l === 'ligue1') return 'ligue1';
  if (l === 'ucl' || l.indexOf('champions') !== -1) return 'ucl';
  if (l.indexOf('europa') !== -1) return 'el';
  return 'soccer';
}

function fmtUpcomingOdds(val) {
  var n = parseInt(val, 10);
  if (isNaN(n)) return '';
  return n > 0 ? '+' + n : String(n);
}

function fmtUpcomingTime(dateStr) {
  if (!dateStr) return '';
  var d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  var h = d.getHours(), m = d.getMinutes();
  var ampm = h >= 12 ? 'PM' : 'AM';
  var h12 = h % 12 || 12;
  return h12 + (m > 0 ? ':' + (m < 10 ? '0' : '') + m : '') + ' ' + ampm;
}

function renderGameCard(g) {
  var odds = g.odds;

  /* Spread values: ESPN spread is home team's spread (negative = home favored) */
  var homeSpread = null, awaySpread = null;
  if (odds && odds.spread !== null && odds.spread !== undefined) {
    homeSpread = Math.round(odds.spread * 2) / 2;
    awaySpread = homeSpread === 0 ? 0 : -homeSpread;
  }

  function teamLogo(team) {
    if (team.logo) {
      return '<div class="team-logo-box"><img src="' + escHtml(team.logo) + '" alt="" onerror="this.style.display=\'none\'"></div>';
    }
    return '<div class="team-logo-box"><div class="team-initials">' + escHtml((team.abbrev || '??').slice(0,3)) + '</div></div>';
  }

  function spreadBox(spread) {
    if (spread === null || spread === undefined) return '<div class="odds-box no-odds"><span class="ob-main">—</span></div>';
    var s = spread > 0 ? '+' + spread : (spread === 0 ? 'PK' : String(spread));
    return '<div class="odds-box"><span class="ob-main">' + escHtml(s) + '</span><span class="ob-juice">-110</span></div>';
  }

  function mlBox(ml, isHome) {
    if (ml === null || ml === undefined) return '<div class="odds-box no-odds"><span class="ob-main">—</span></div>';
    var cls = ml < 0 ? 'fav' : 'dog';
    return '<div class="odds-box"><span class="ob-main ' + cls + '">' + escHtml(fmtUpcomingOdds(ml)) + '</span><span class="ob-juice">ML</span></div>';
  }

  function totalBox(prefix) {
    if (!odds || odds.total === null || odds.total === undefined) {
      return '<div class="odds-box no-odds"><span class="ob-main">—</span></div>';
    }
    return '<div class="odds-box total-box"><span class="ob-main">' + escHtml(prefix + odds.total) + '</span><span class="ob-juice">-110</span></div>';
  }

  /* Status badge */
  var statusHtml = '';
  if (g.isHalf) statusHtml = '<span class="game-status-pill halftime">HALF</span>';
  else if (g.isLive) statusHtml = '<span class="game-status-pill live">● LIVE</span>';
  else if (g.isFinal) statusHtml = '<span class="game-status-pill final">FINAL</span>';

  /* Score (only show if live or final) */
  function scoreHtml(team, isHome) {
    if (!g.isLive && !g.isFinal) return '';
    var s = team.score !== '' ? team.score : '0';
    /* Determine winner for coloring */
    var isWinning = g.isFinal &&
      parseInt(team.score || 0, 10) > parseInt((isHome ? g.away : g.home).score || 0, 10);
    return ' <span class="team-score-live' + (isWinning ? ' winning' : '') + '">' + escHtml(String(s)) + '</span>';
  }

  /* Away team row */
  var awayRow = '<div class="game-team-row">';
  awayRow += teamLogo(g.away);
  awayRow += '<div class="team-name-block">';
  if (g.away.rank) awayRow += '<span class="team-rank-badge">' + escHtml(g.away.rank) + '</span>';
  awayRow += '<span class="team-abbrev-main">' + escHtml(g.away.abbrev) + '</span>';
  awayRow += scoreHtml(g.away, false);
  if (g.away.record) awayRow += '<span class="team-record-sub">' + escHtml(g.away.record) + '</span>';
  awayRow += '</div>';
  /* Away spread | Away ML (for non-final) or just score */
  if (!g.isFinal) {
    awayRow += spreadBox(awaySpread);
    awayRow += mlBox(odds ? odds.awayML : null, false);
  } else {
    awayRow += spreadBox(awaySpread);
    awayRow += mlBox(odds ? odds.awayML : null, false);
  }
  awayRow += '</div>';

  /* Home team row */
  var homeRow = '<div class="game-team-row">';
  homeRow += teamLogo(g.home);
  homeRow += '<div class="team-name-block">';
  if (g.home.rank) homeRow += '<span class="team-rank-badge">' + escHtml(g.home.rank) + '</span>';
  homeRow += '<span class="team-abbrev-main">' + escHtml(g.home.abbrev) + '</span>';
  homeRow += scoreHtml(g.home, true);
  if (g.home.record) homeRow += '<span class="team-record-sub">' + escHtml(g.home.record) + '</span>';
  homeRow += '</div>';
  homeRow += spreadBox(homeSpread);
  homeRow += mlBox(odds ? odds.homeML : null, true);
  homeRow += '</div>';

  /* Footer: time + network + league badge */
  var timeStr = g.isLive ? (g.statusDetail || 'LIVE') : (g.isFinal ? '' : fmtUpcomingTime(g.date));
  var footerHtml = '<div class="game-footer">';
  footerHtml += '<span class="league-tag ' + leagueTagClass(g.league) + '">' + escHtml(g.league) + '</span>';
  if (timeStr) footerHtml += '<span class="gf-time">' + escHtml(timeStr) + statusHtml + '</span>';
  else footerHtml += statusHtml;
  if (g.network) footerHtml += '<span class="gf-network">· ' + escHtml(g.network) + '</span>';
  footerHtml += '</div>';

  return '<div class="game-card">' + awayRow + homeRow + renderConsensusStrip(g) + footerHtml + '</div>';
}

function renderUpcomingGames() {
  var el = document.getElementById('upcomingGamesList');
  if (!el) return;

  /* Toggle CBB pill visibility */
  var cbbPill = document.getElementById('cbbPill');
  if (cbbPill) cbbPill.style.display = isMarchMadness() ? '' : 'none';

  /* Date label */
  var dateLabel = document.getElementById('upcomingDateLabel');
  if (dateLabel) {
    var now = new Date();
    var days   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    var months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    dateLabel.textContent = days[now.getDay()] + ', ' + months[now.getMonth()] + ' ' + now.getDate();
  }

  /* Last updated label */
  var lu = document.getElementById('upcomingLastUpdated');
  if (lu && upcomingGamesData && upcomingGamesData.fetchedAt) {
    var mins = Math.round((Date.now() - upcomingGamesData.fetchedAt) / 60000);
    lu.textContent = 'Updated ' + (mins < 1 ? 'just now' : mins + 'm ago');
  }

  if (!upcomingGamesData) {
    el.innerHTML = '<div class="upcoming-loading"><div class="upcoming-spinner"></div><br>Loading...</div>';
    return;
  }

  var games = upcomingGamesData.games || [];

  /* Apply sport filter */
  if (upcomingFilter !== 'all') {
    games = games.filter(function(g) { return g.sport === upcomingFilter; });
  }

  /* In "Top Games" view, hide FINAL games — they're already done */
  if (upcomingFilter === 'all') {
    games = games.filter(function(g) { return !g.isFinal; });
  }

  /* Sort by scheduled start time ascending (soonest first) */
  games = games.slice().sort(function(a, b) {
    var ta = a.scheduledStart ? new Date(a.scheduledStart).getTime() : (a.date ? new Date(a.date).getTime() : 0);
    var tb = b.scheduledStart ? new Date(b.scheduledStart).getTime() : (b.date ? new Date(b.date).getTime() : 0);
    return ta - tb;
  });

  if (!games.length) {
    el.innerHTML = '<div class="upcoming-empty">No games today for the selected sport.</div>';
    return;
  }

  /* Group by sport label for section headers */
  var groups = {}, groupOrder = [];
  var SPORT_LABEL = { NBA: 'NBA', NFL: 'NFL', CBB: 'College Basketball', Soccer: 'Soccer' };
  for (var i = 0; i < games.length; i++) {
    var g = games[i];
    /* When "all" filter: group by sport. When filtered: group by league */
    var groupKey = (upcomingFilter === 'all') ? (SPORT_LABEL[g.sport] || g.sport) : g.league;
    if (!groups[groupKey]) { groups[groupKey] = []; groupOrder.push(groupKey); }
    groups[groupKey].push(g);
  }

  var html = '';
  /* Column headers */
  html += '<div class="upcoming-col-headers"><div class="ch-teams">MATCHUP</div><div class="ch-line">SPREAD</div><div class="ch-total">LINE</div></div>';

  for (var gi = 0; gi < groupOrder.length; gi++) {
    var gkey = groupOrder[gi];
    var gGames = groups[gkey];
    html += '<div class="upcoming-section">';
    html += '<div class="upcoming-section-header">';
    html += '<span class="upcoming-section-label">' + escHtml(gkey) + '</span>';
    html += '<span class="upcoming-section-count">' + gGames.length + '</span>';
    html += '<div class="upcoming-section-line"></div>';
    html += '</div>';
    for (var j = 0; j < gGames.length; j++) {
      html += renderGameCard(gGames[j]);
    }
    html += '</div>';
  }

  el.innerHTML = html;
}

/* Called when switching to the upcoming tab */
function initUpcomingTab() {
  var march = isMarchMadness();
  var cbbPill = document.getElementById('cbbPill');
  if (cbbPill) cbbPill.style.display = march ? '' : 'none';

  /* Helper: kick off consensus fetch in background; re-render cards when data arrives.
     Re-fetch only if data is more than 5 minutes stale (consensus updates frequently). */
  function kickConsensus() {
    var staleMs = 5 * 60 * 1000;
    if (Date.now() - consensusLastFetchMs > staleMs) {
      fetchAllConsensus(function() { renderUpcomingGames(); });
    }
  }

  /* Serve ESPN schedule from cache immediately, then background-refresh if stale */
  if (loadUpcomingCache()) {
    renderUpcomingGames();
    kickConsensus();
    var twoHours = 2 * 60 * 60 * 1000;
    if (Date.now() - upcomingGamesData.fetchedAt > twoHours) {
      fetchUpcomingGames(function() { renderUpcomingGames(); });
    }
  } else {
    var el = document.getElementById('upcomingGamesList');
    if (el) el.innerHTML = '<div class="upcoming-loading"><div class="upcoming-spinner"></div><br>Fetching today\'s games...</div>';
    fetchUpcomingGames(function() {
      renderUpcomingGames();
      kickConsensus();
    });
  }
}

/* ===== NFL HISTORY TAB ===== */
var nhSeason = 'all';

function nhSetSeason(season) {
  nhSeason = season;
  var map = {all:'nhBtnAll', '2023':'nhBtn2023', '2024':'nhBtn2024', '2025':'nhBtn2025'};
  Object.keys(map).forEach(function(k) {
    var btn = document.getElementById(map[k]);
    if (btn) btn.classList.toggle('active', k === season);
  });
  renderNFLHistory();
}

function renderNFLHistory() {
  var allHist = store.bets.filter(function(b) { return b.source === 'historical'; });
  var bets = nhSeason === 'all' ? allHist : allHist.filter(function(b) { return b.season === nhSeason; });

  function nhStats(arr) {
    if (!arr.length) return {pl:0, stake:0, roi:0, W:0, L:0, P:0, n:0};
    var pl=0, stake=0, W=0, L=0, P=0;
    for (var i=0; i<arr.length; i++) {
      pl += arr[i].netPL || 0;
      stake += arr[i].stake || 0;
      if (arr[i].result==='W') W++;
      else if (arr[i].result==='L') L++;
      else P++;
    }
    return {pl:+pl.toFixed(2), stake:+stake.toFixed(2), roi:stake>0?+(pl/stake*100).toFixed(1):0, W:W, L:L, P:P, n:arr.length};
  }

  function nhColor(v) { return v >= 0 ? '#00d084' : '#ff4757'; }
  function nhFmt(v) { return (v>=0?'+':'')+v.toFixed(0); }

  function weekOrder(w) {
    if (typeof w === 'number' || !isNaN(+w)) return +w;
    if (w==='WC') return 19; if (w==='DIV') return 20;
    if (w==='CONF') return 21; if (w==='SB') return 22;
    if (w==='FUTURES') return 23; return 99;
  }

  function spreadBucket(b) {
    var sv = Math.abs(parseFloat(b.spreadVal));
    if (isNaN(sv)) return null;
    if (sv <= 3) return '0-3';
    if (sv <= 6) return '3.5-6';
    if (sv <= 10) return '6.5-10';
    return '10+';
  }

  /* KPIs */
  var s = nhStats(bets);
  var kpiEl = document.getElementById('nhKpis');
  if (kpiEl) {
    var avgStk = s.n > 0 ? '$'+(s.stake/s.n).toFixed(0) : '$0';
    var recStr = s.W+'-'+s.L+(s.P>0?'-'+s.P:'');
    kpiEl.innerHTML = [
      ['Record', recStr, 'var(--text)'],
      ['P/L', '$'+nhFmt(s.pl), nhColor(s.pl)],
      ['ROI', s.roi+'%', nhColor(s.roi)],
      ['Total Bets', s.n, 'var(--text)'],
      ['Total Staked', '$'+Math.round(s.stake).toLocaleString(), 'var(--text2)'],
      ['Avg Stake', avgStk, 'var(--text2)']
    ].map(function(c) {
      return '<div class="stat-card"><div class="label">'+c[0]+'</div><div class="value" style="color:'+c[2]+'">'+c[1]+'</div></div>';
    }).join('');
  }

  /* Charts are updated in-place below — no pre-destroy needed */

  var nhZeroPlugin = {
    id:'nhZero',
    afterDraw: function(ch) {
      var ys = ch.scales.y;
      if (!ys) return;
      var yp = ys.getPixelForValue(0);
      if (yp < ys.top || yp > ys.bottom) return;
      var c2 = ch.ctx;
      c2.save(); c2.beginPath(); c2.setLineDash([4,4]);
      c2.strokeStyle='rgba(255,255,255,0.2)'; c2.lineWidth=1;
      c2.moveTo(ch.chartArea.left, yp); c2.lineTo(ch.chartArea.right, yp);
      c2.stroke(); c2.restore();
    }
  };

  var pctScales = {
    x: chartDefaults.scales.x,
    y: {ticks:{color:'#556677',font:{size:10},callback:function(v){return v+'%';}}, grid:{color:'rgba(36,48,64,0.5)'}}
  };

  /* Chart 1: P/L by Week (bar) */
  (function() {
    var ctx = document.getElementById('nhWeeklyChart');
    if (!ctx) return;
    var wm = {};
    bets.forEach(function(b) {
      var w = String(b.week||0);
      wm[w] = (wm[w]||0) + (b.netPL||0);
    });
    var keys = Object.keys(wm).sort(function(a,b){return weekOrder(a)-weekOrder(b);});
    var labels = keys.map(function(w){return isNaN(+w)?w:'W'+w;});
    var data = keys.map(function(w){return +wm[w].toFixed(2);});
    if (charts.nhWeekly) {
      charts.nhWeekly.data.labels = labels;
      charts.nhWeekly.data.datasets[0].data = data;
      charts.nhWeekly.data.datasets[0].backgroundColor = data.map(nhColor);
      charts.nhWeekly.update('none');
    } else {
      charts.nhWeekly = new Chart(ctx, {
        type:'bar',
        data:{labels:labels, datasets:[{data:data, backgroundColor:data.map(nhColor), borderRadius:3, barPercentage:0.7}]},
        options:{responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:chartDefaults.scales},
        plugins:[nhZeroPlugin]
      });
    }
  })();

  /* Chart 2: Cumulative P/L (line) */
  (function() {
    var ctx = document.getElementById('nhCumChart');
    if (!ctx) return;
    var sorted = bets.slice().sort(function(a,b){return new Date(a.settledDate)-new Date(b.settledDate);});
    var labels=['Start'], data=[0], cum=0;
    sorted.forEach(function(b,i){
      cum += b.netPL||0;
      labels.push('Bet '+(i+1));
      data.push(+cum.toFixed(2));
    });
    var final = data[data.length-1];
    var clr = final>=0?'#00d084':'#ff4757';
    var bgClr = final>=0?'rgba(0,208,132,0.1)':'rgba(255,71,87,0.1)';
    if (charts.nhCum) {
      charts.nhCum.data.labels = labels;
      charts.nhCum.data.datasets[0].data = data;
      charts.nhCum.data.datasets[0].borderColor = clr;
      charts.nhCum.data.datasets[0].backgroundColor = bgClr;
      charts.nhCum.update('none');
    } else {
      charts.nhCum = new Chart(ctx, {
        type:'line',
        data:{labels:labels, datasets:[{data:data, borderColor:clr, backgroundColor:bgClr, fill:true, tension:0.3, pointRadius:1}]},
        options:{responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:chartDefaults.scales},
        plugins:[nhZeroPlugin]
      });
    }
  })();

  /* Chart 3: Home vs Away ROI */
  (function() {
    var ctx = document.getElementById('nhHAChart');
    if (!ctx) return;
    var labels=['Home','Away','Neutral'];
    var vals=['Home','Away','Neutral'];
    var data = vals.map(function(v){return nhStats(bets.filter(function(b){return b.homeAway===v;})).roi;});
    var used = labels.filter(function(_,i){return bets.some(function(b){return b.homeAway===vals[i];});});
    var usedData = data.filter(function(_,i){return bets.some(function(b){return b.homeAway===vals[i];});});
    if (!used.length) {
      var c2 = document.getElementById('nhHAChart').parentNode;
      c2.innerHTML='<div class="chart-title">Home vs Away ROI</div><div style="color:var(--text2);font-size:.8rem;padding:40px 0;text-align:center">No H/A data in 2024 — available for 2025 season</div>';
      return;
    }
    if (charts.nhHA) {
      charts.nhHA.data.labels = used;
      charts.nhHA.data.datasets[0].data = usedData;
      charts.nhHA.data.datasets[0].backgroundColor = usedData.map(nhColor);
      charts.nhHA.update('none');
    } else {
      charts.nhHA = new Chart(ctx, {
        type:'bar',
        data:{labels:used, datasets:[{data:usedData, backgroundColor:usedData.map(nhColor), borderRadius:4, barPercentage:0.4}]},
        options:{responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}, tooltip:{callbacks:{label:function(c){return c.parsed.y.toFixed(1)+'% ROI';}}}}, scales:pctScales},
        plugins:[nhZeroPlugin]
      });
    }
  })();

  /* Chart 4: Dog vs Favorite ROI */
  (function() {
    var ctx = document.getElementById('nhDogFavChart');
    if (!ctx) return;
    var dogs = bets.filter(function(b){return b.isDog===true;});
    var favs = bets.filter(function(b){return b.isDog===false;});
    if (!dogs.length && !favs.length) {
      document.getElementById('nhDogFavChart').parentNode.innerHTML='<div class="chart-title">Dog vs Favorite ROI</div><div style="color:var(--text2);font-size:.8rem;padding:40px 0;text-align:center">No dog/fav data in 2024 — available for 2025</div>';
      return;
    }
    var labels=['Underdog','Favorite'];
    var data=[nhStats(dogs).roi, nhStats(favs).roi];
    if (charts.nhDogFav) {
      charts.nhDogFav.data.datasets[0].data = data;
      charts.nhDogFav.data.datasets[0].backgroundColor = data.map(nhColor);
      charts.nhDogFav.update('none');
    } else {
      charts.nhDogFav = new Chart(ctx, {
        type:'bar',
        data:{labels:labels, datasets:[{data:data, backgroundColor:data.map(nhColor), borderRadius:4, barPercentage:0.4}]},
        options:{responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}, tooltip:{callbacks:{label:function(c){return c.parsed.y.toFixed(1)+'% ROI';}}}}, scales:pctScales},
        plugins:[nhZeroPlugin]
      });
    }
  })();

  /* Chart 5: Straight vs Parlay ROI */
  (function() {
    var ctx = document.getElementById('nhTypeChart');
    if (!ctx) return;
    var types=[['Spread','spread'],['Moneyline','moneyline'],['Parlay','parlay']];
    var labels=types.map(function(t){return t[0];});
    var data=types.map(function(t){return nhStats(bets.filter(function(b){return b.type===t[1];})).roi;});
    if (charts.nhType) {
      charts.nhType.data.datasets[0].data = data;
      charts.nhType.data.datasets[0].backgroundColor = data.map(nhColor);
      charts.nhType.update('none');
    } else {
      charts.nhType = new Chart(ctx, {
        type:'bar',
        data:{labels:labels, datasets:[{data:data, backgroundColor:data.map(nhColor), borderRadius:4, barPercentage:0.5}]},
        options:{responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}, tooltip:{callbacks:{label:function(c){return c.parsed.y.toFixed(1)+'% ROI';}}}}, scales:pctScales},
        plugins:[nhZeroPlugin]
      });
    }
  })();

  /* Chart 6: P/L by Spread Range */
  (function() {
    var ctx = document.getElementById('nhSpreadChart');
    if (!ctx) return;
    var buckets=['0-3','3.5-6','6.5-10','10+'];
    var spreads=bets.filter(function(b){return b.type==='spread';});
    var data=buckets.map(function(bk){return nhStats(spreads.filter(function(b){return spreadBucket(b)===bk;})).roi;});
    if (charts.nhSpread) {
      charts.nhSpread.data.datasets[0].data = data;
      charts.nhSpread.data.datasets[0].backgroundColor = data.map(nhColor);
      charts.nhSpread.update('none');
    } else {
      charts.nhSpread = new Chart(ctx, {
        type:'bar',
        data:{labels:buckets.map(function(b){return b+' pts';}), datasets:[{data:data, backgroundColor:data.map(nhColor), borderRadius:4, barPercentage:0.5}]},
        options:{responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}, tooltip:{callbacks:{label:function(c){return c.parsed.y.toFixed(1)+'% ROI';}}}}, scales:pctScales},
        plugins:[nhZeroPlugin]
      });
    }
  })();

  /* Team Table */
  (function() {
    var el = document.getElementById('nhTeamFadeTable');
    if (!el) return;
    var teamMap = {};
    bets.filter(function(b){return b.team;}).forEach(function(b) {
      if (!teamMap[b.team]) teamMap[b.team]=[];
      teamMap[b.team].push(b);
    });
    var rows = Object.keys(teamMap).map(function(t) {
      var s = nhStats(teamMap[t]);
      return {team:t, pl:s.pl, roi:s.roi, W:s.W, L:s.L, n:s.n};
    }).sort(function(a,b){return a.pl-b.pl;});
    if (!rows.length) { el.innerHTML='<p style="color:var(--text2);font-size:.8rem">No team data for selected season.</p>'; return; }
    var html='<table style="width:100%;border-collapse:collapse;font-size:.8rem"><thead><tr style="color:var(--text2);border-bottom:1px solid var(--border)"><th style="text-align:left;padding:5px 4px">Team</th><th style="text-align:center;padding:5px 4px">Bets</th><th style="text-align:center;padding:5px 4px">W-L</th><th style="text-align:right;padding:5px 4px">P/L</th><th style="text-align:right;padding:5px 4px">ROI</th></tr></thead><tbody>';
    rows.forEach(function(r) {
      var c=nhColor(r.pl);
      html+='<tr style="border-bottom:1px solid rgba(36,48,64,0.4)"><td style="padding:5px 4px;font-weight:600">'+r.team+'</td><td style="text-align:center;padding:5px 4px;color:var(--text2)">'+r.n+'</td><td style="text-align:center;padding:5px 4px">'+r.W+'-'+r.L+'</td><td style="text-align:right;padding:5px 4px;color:'+c+'">'+nhFmt(r.pl)+'</td><td style="text-align:right;padding:5px 4px;color:'+c+'">'+r.roi+'%</td></tr>';
    });
    html+='</tbody></table>';
    el.innerHTML=html;
  })();

  /* Week-by-Week Table */
  (function() {
    var el = document.getElementById('nhWeekTable');
    if (!el) return;
    var wm={};
    bets.forEach(function(b){
      var w=String(b.week||'?');
      if(!wm[w]) wm[w]=[];
      wm[w].push(b);
    });
    var keys=Object.keys(wm).sort(function(a,b){return weekOrder(a)-weekOrder(b);});
    var html='<table style="width:100%;border-collapse:collapse;font-size:.8rem"><thead><tr style="color:var(--text2);border-bottom:1px solid var(--border)"><th style="text-align:left;padding:5px 4px">Week</th><th style="text-align:center;padding:5px 4px">Bets</th><th style="text-align:center;padding:5px 4px">W-L</th><th style="text-align:right;padding:5px 4px">P/L</th><th style="text-align:right;padding:5px 4px">ROI</th></tr></thead><tbody>';
    keys.forEach(function(w) {
      var s=nhStats(wm[w]);
      var c=nhColor(s.pl);
      var label=isNaN(+w)?w:'Week '+w;
      html+='<tr style="border-bottom:1px solid rgba(36,48,64,0.4)"><td style="padding:5px 4px;font-weight:600">'+label+'</td><td style="text-align:center;padding:5px 4px;color:var(--text2)">'+s.n+'</td><td style="text-align:center;padding:5px 4px">'+s.W+'-'+s.L+(s.P?'-'+s.P:'')+'</td><td style="text-align:right;padding:5px 4px;color:'+c+'">'+nhFmt(s.pl)+'</td><td style="text-align:right;padding:5px 4px;color:'+c+'">'+s.roi+'%</td></tr>';
    });
    html+='</tbody></table>';
    el.innerHTML=html;
  })();

  /* Insights Panel */
  (function() {
    var el = document.getElementById('nhInsights');
    if (!el) return;

    var spreadSt = nhStats(bets.filter(function(b){return b.type==='spread';}));
    var mlSt = nhStats(bets.filter(function(b){return b.type==='moneyline';}));
    var parlSt = nhStats(bets.filter(function(b){return b.type==='parlay';}));
    var homeSt = nhStats(bets.filter(function(b){return b.homeAway==='Home';}));
    var awaySt = nhStats(bets.filter(function(b){return b.homeAway==='Away';}));
    var dogSt = nhStats(bets.filter(function(b){return b.isDog===true;}));
    var favSt = nhStats(bets.filter(function(b){return b.isDog===false;}));

    var spread_0_3 = nhStats(bets.filter(function(b){return b.type==='spread'&&spreadBucket(b)==='0-3';}));
    var spread_mid = nhStats(bets.filter(function(b){return b.type==='spread'&&spreadBucket(b)==='6.5-10';}));
    var spread_big = nhStats(bets.filter(function(b){return b.type==='spread'&&spreadBucket(b)==='10+';}));

    var teamMap={};
    bets.filter(function(b){return b.team;}).forEach(function(b){
      if(!teamMap[b.team]) teamMap[b.team]=[];
      teamMap[b.team].push(b);
    });
    var teamList=Object.keys(teamMap).map(function(t){
      var st=nhStats(teamMap[t]);
      return {team:t,pl:st.pl,n:st.n};
    }).filter(function(t){return t.n>=3;}).sort(function(a,b){return a.pl-b.pl;});

    function rtag(v){return '<span style="color:'+nhColor(v)+';font-weight:700">'+v+'%</span>';}
    function ptag(v){return '<span style="color:'+nhColor(v)+';font-weight:700">'+(v>=0?'+':'')+v.toFixed(0)+'</span>';}

    function card(title, items, accent) {
      return '<div style="background:var(--surface2);border:1px solid '+(accent||'var(--border)')+';border-radius:8px;padding:14px">'
        +'<div style="font-weight:700;font-size:.85rem;margin-bottom:10px">'+title+'</div>'
        +'<div style="font-size:.82rem;line-height:1.9;color:var(--text2)">'+items.join('<br>')+'</div>'
        +'</div>';
    }

    var cards=[];

    cards.push(card('Bet Type ROI', [
      'Spread ('+spreadSt.n+'): '+rtag(spreadSt.roi)+' ROI &nbsp;·&nbsp; '+ptag(spreadSt.pl)+' P/L',
      'Moneyline ('+mlSt.n+'): '+rtag(mlSt.roi)+' ROI &nbsp;·&nbsp; '+ptag(mlSt.pl)+' P/L',
      parlSt.n ? 'Parlay ('+parlSt.n+'): '+rtag(parlSt.roi)+' ROI &nbsp;·&nbsp; '+ptag(parlSt.pl)+' P/L' : ''
    ].filter(Boolean)));

    if (spread_0_3.n||spread_mid.n||spread_big.n) {
      cards.push(card('Spread Range Breakdown', [
        spread_0_3.n ? 'Tight (0-3 pts, '+spread_0_3.n+'): '+rtag(spread_0_3.roi)+' ROI' : '',
        spread_mid.n ? 'Mid (6.5-10 pts, '+spread_mid.n+'): '+rtag(spread_mid.roi)+' ROI' : '',
        spread_big.n ? 'Large (10+ pts, '+spread_big.n+'): '+rtag(spread_big.roi)+' ROI' : '',
        spread_mid.n && spread_mid.roi < 0 ? '⚠️ The 6.5-10 pt range is your money-losing zone.' : ''
      ].filter(Boolean), spread_mid.roi<0?'rgba(255,71,87,.25)':undefined));
    }

    if (homeSt.n||awaySt.n) {
      cards.push(card('Home vs Away (2025)', [
        homeSt.n ? 'Home ('+homeSt.n+'): '+rtag(homeSt.roi)+' ROI &nbsp;·&nbsp; '+ptag(homeSt.pl)+' P/L' : 'No home data',
        awaySt.n ? 'Away ('+awaySt.n+'): '+rtag(awaySt.roi)+' ROI &nbsp;·&nbsp; '+ptag(awaySt.pl)+' P/L' : 'No away data',
        awaySt.roi>homeSt.roi ? 'Away teams edge out home teams in ROI.' : 'Home teams edge out in ROI.'
      ]));
    }

    if (dogSt.n||favSt.n) {
      var dogPct = dogSt.n+favSt.n>0?Math.round(dogSt.n/(dogSt.n+favSt.n)*100):0;
      cards.push(card('Dog vs Favorite (2025)', [
        dogSt.n ? 'Underdog ('+dogSt.n+', '+dogPct+'% of bets): '+rtag(dogSt.roi)+' ROI &nbsp;·&nbsp; '+ptag(dogSt.pl)+' P/L' : '',
        favSt.n ? 'Favorite ('+favSt.n+'): '+rtag(favSt.roi)+' ROI &nbsp;·&nbsp; '+ptag(favSt.pl)+' P/L' : '',
        favSt.roi>dogSt.roi ? 'Favorites outperform in ROI despite fewer bets.' : 'Underdogs hold their own ROI-wise.'
      ].filter(Boolean)));
    }

    if (teamList.length) {
      var worst=teamList.slice(0,4);
      cards.push(card('⚠️ Teams to Fade', worst.map(function(t){
        return t.team+' ('+t.n+' bets): '+ptag(t.pl)+' P/L';
      }), 'rgba(255,71,87,.2)'));

      var best=teamList.slice(-4).reverse();
      cards.push(card('✅ Best Performing Teams', best.map(function(t){
        return t.team+' ('+t.n+' bets): '+ptag(t.pl)+' P/L';
      }), 'rgba(0,208,132,.2)'));
    }

    el.innerHTML='<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">'+cards.join('')+'</div>';
  })();
}

/* ===== BET LOG TAB ===== */
var betLogState = { filter: 'all', sort: 'date', dir: 'desc' };


