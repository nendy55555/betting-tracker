/* Live scores, auto-settle, futures odds, closing lines */
/* Extracted from betting-tracker.html — do not edit the original */

function fetchLiveScores(callback) {
  var endpoints = [
    'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard',
    'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard',
    'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard',
    'https://site.api.espn.com/apis/site/v2/sports/basketball/womens-college-basketball/scoreboard',
    'https://site.api.espn.com/apis/site/v2/sports/soccer/usa.1/scoreboard'
  ];
  var ENDPOINT_SPORT = ['NBA', 'NFL', 'NCAAMB', 'NCAAWB', 'Soccer'];
  var controller = new AbortController();
  var timeout = setTimeout(function(){ controller.abort(); }, 8000);
  Promise.all(endpoints.map(function(url){
    return fetch(url, { signal: controller.signal }).then(function(r){return r.json();}).catch(function(){return null;});
  })).then(function(results){
    clearTimeout(timeout);
    var scores = {};
    espnGameData = {};
    for (var ri = 0; ri < results.length; ri++) {
      var data = results[ri];
      if (!data || !data.events) continue;
      for (var ei = 0; ei < data.events.length; ei++) {
        try {
          var ev = data.events[ei];
          var comps = ev.competitions[0];
          var away = null, home = null;
          for (var ci = 0; ci < comps.competitors.length; ci++) {
            if (comps.competitors[ci].homeAway === 'away') away = comps.competitors[ci];
            if (comps.competitors[ci].homeAway === 'home') home = comps.competitors[ci];
          }
          if (away && home) {
            var score = away.team.abbreviation + ' ' + away.score + ' - ' + home.team.abbreviation + ' ' + home.score;
            var statusObj = ev.status || {};
            var statusType = statusObj.type || {};
            var statusDetail = statusType.shortDetail || '';
            var isCompleted = statusType.completed === true || statusType.state === 'post';
            var display = score + (statusDetail ? ' (' + statusDetail + ')' : '');

            var gameInfo = {
              display: display,
              completed: isCompleted,
              awayTeam: away.team.displayName,
              homeTeam: home.team.displayName,
              awayShort: away.team.shortDisplayName,
              homeShort: home.team.shortDisplayName,
              awayAbbr: away.team.abbreviation,
              homeAbbr: home.team.abbreviation,
              awayScore: parseInt(away.score, 10) || 0,
              homeScore: parseInt(home.score, 10) || 0,
              status: statusDetail,
              espnSport: ENDPOINT_SPORT[ri],
            };

            var names = [away.team.displayName, home.team.displayName, away.team.shortDisplayName, home.team.shortDisplayName, away.team.abbreviation, home.team.abbreviation];
            for (var ni = 0; ni < names.length; ni++) {
              scores[names[ni]] = display;
              espnGameData[names[ni].toLowerCase()] = gameInfo;
            }
          }
        } catch (e) { /* skip */ }
      }
    }
    cachedLiveScores = scores;
    if (store.currentTab === 'home') renderOpenBets();
    if (typeof callback === 'function') callback(true);
  }).catch(function(){ clearTimeout(timeout); if (typeof callback === 'function') callback(false); });
}

/* ===== REFRESH & AUTO-SETTLE ===== */
function refreshAndSettle() {
  var btn = document.querySelector('.refresh-btn');
  if (btn) { btn.innerHTML = '&#8635; Checking...'; btn.classList.add('loading'); }

  fetchLiveScores(function() {
    if (btn) { btn.classList.remove('loading'); btn.innerHTML = '&#x21bb; Refresh'; }

    var open = store.bets.filter(function(b) { return !b.settled; });
    var settled = 0;
    var results = [];

    for (var i = 0; i < open.length; i++) {
      var bet = open[i];
      var game = findGameData(bet);
      if (!game || !game.completed) continue;

      /* Try to determine W/L from score + bet type */
      var result = determineResult(bet, game);
      if (result) {
        bet.settled = true;
        bet.result = result;
        bet.settledDate = new Date().toISOString();
        settled++;
        results.push(escHtml(bet.pick) + ' → <span class="result-badge ' + result + '">' + result + '</span> (' + game.display + ')');
      }
    }

    if (settled > 0) {
      invalidateStats();
      saveData();
      renderAll();
      addChat('success', 'Auto-settled <strong>' + settled + '</strong> bet(s) from live scores!<br>' + results.join('<br>'));
    }

    /* For any bets still open whose game time is clearly in the past, fetch
       ESPN historical scoreboards by date — the live feed only shows today's
       games so old playoff bets never get matched without this fallback. */
    var stillOpen = store.bets.filter(function(b) { return !b.settled; });
    var now = Date.now();
    var GAME_OVER_LAG_MS = 4 * 60 * 60 * 1000; /* 4 h after tipoff → definitely finished */
    var pastBets = stillOpen.filter(function(b) {
      if (b.type === 'parlay' || b.type === 'future') return false;
      var gameTs = b.scheduledStart ? new Date(b.scheduledStart).getTime() : parseGameDate(b.gameTime);
      return gameTs > 0 && (now - gameTs) > GAME_OVER_LAG_MS;
    });

    if (pastBets.length > 0) {
      settleHistoricalBets(pastBets, function(histSettled, histResults) {
        if (histSettled > 0) {
          invalidateStats();
          saveData();
          renderAll();
          addChat('success', 'Auto-settled <strong>' + histSettled + '</strong> past bet(s) from historical scores!<br>' + histResults.join('<br>'));
        } else if (settled === 0) {
          var openRemaining = store.bets.filter(function(b) { return !b.settled; });
          addChat('system', 'Scores refreshed. ' + (openRemaining.length > 0 ? openRemaining.length + ' open bet(s) still pending.' : 'No open bets.') + ' Games will auto-settle when final.');
          var unenriched = openRemaining.filter(function(b) { return !b.espnMatchup && b.type !== 'parlay'; });
          if (unenriched.length > 0) {
            enrichNewBets(unenriched, function(count) {
              if (count > 0) { invalidateStats(); saveData(); renderAll(); }
            });
          }
        }
      });
    } else if (settled === 0) {
      var openRemaining = store.bets.filter(function(b) { return !b.settled; });
      addChat('system', 'Scores refreshed. ' + (openRemaining.length > 0 ? openRemaining.length + ' open bet(s) still pending.' : 'No open bets.') + ' Games will auto-settle when final.');
      /* Try enriching unenriched bets */
      var unenriched = openRemaining.filter(function(b) { return !b.espnMatchup && b.type !== 'parlay'; });
      if (unenriched.length > 0) {
        enrichNewBets(unenriched, function(count) {
          if (count > 0) { invalidateStats(); saveData(); renderAll(); }
        });
      }
    }
  });
}

/* Fetch ESPN historical scoreboards for open bets whose game date is in the past.
   ESPN's scoreboard endpoint supports ?dates=YYYYMMDD for any historical date. */
function settleHistoricalBets(pastBets, onDone) {
  var SPORT_PATH = {
    NBA:    'basketball/nba',
    NFL:    'football/nfl',
    NCAAMB: 'basketball/mens-college-basketball',
    NCAAWB: 'basketball/womens-college-basketball',
    Soccer: 'soccer/usa.1',
  };
  /* Normalise a bet's sport string to an ESPN path key */
  function toEspnSport(s) {
    s = (s || '').toUpperCase().trim();
    if (s === 'NFL' || s === 'FOOTBALL') return 'NFL';
    if (s === 'NBA' || s === 'BASKETBALL') return 'NBA';
    if (s === 'NCAAMB' || s === 'CBB' || /COLLEGE.*BASKET/.test(s)) return 'NCAAMB';
    if (s === 'NCAAWB' || /WOMEN.*BASKET/.test(s)) return 'NCAAWB';
    if (s === 'MLS' || s === 'SOCCER') return 'Soccer';
    return 'NBA';
  }

  /* Group bets by sport + YYYYMMDD so we make one ESPN request per sport/day combo */
  var fetchMap = {};
  for (var i = 0; i < pastBets.length; i++) {
    var b = pastBets[i];
    var gameTs = b.scheduledStart ? new Date(b.scheduledStart).getTime() : parseGameDate(b.gameTime);
    var d = new Date(gameTs);
    var dateStr = d.getFullYear().toString() +
      (d.getMonth() < 9 ? '0' : '') + (d.getMonth() + 1) +
      (d.getDate()  < 10 ? '0' : '') + d.getDate();
    var sport = toEspnSport(b.sport);
    var key = sport + ':' + dateStr;
    if (!fetchMap[key]) fetchMap[key] = { sport: sport, date: dateStr, bets: [] };
    fetchMap[key].bets.push(b);
  }

  var keys = Object.keys(fetchMap);
  var pending = keys.length;
  var totalSettled = 0;
  var totalResults = [];

  function done() {
    if (typeof onDone === 'function') onDone(totalSettled, totalResults);
  }

  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  /* Match a single bet against a locally-built game-data map (same logic as findGameData) */
  function findInMap(bet, gameDataMap) {
    var searchStr = ((bet.matchup || '') + ' ' + (bet.pick || '')).toLowerCase();
    var betSport = toEspnSport(bet.sport);
    var mkeys = Object.keys(gameDataMap);
    for (var mi = 0; mi < mkeys.length; mi++) {
      var mk = mkeys[mi];
      if (!mk || mk.length < 4) continue;
      var cand = gameDataMap[mk];
      if (betSport && cand.espnSport && cand.espnSport !== betSport) continue;
      var re = new RegExp('\\b' + escapeRe(mk) + '\\b', 'i');
      if (re.test(searchStr)) return cand;
    }
    return null;
  }

  for (var ki = 0; ki < keys.length; ki++) {
    (function(entry) {
      var path = SPORT_PATH[entry.sport] || SPORT_PATH.NBA;
      var url = 'https://site.api.espn.com/apis/site/v2/sports/' + path +
                '/scoreboard?dates=' + entry.date;

      fetch(url)
        .then(function(r) { return r.json(); })
        .then(function(data) {
          /* Build a local game-data map from the historical response */
          var histMap = {};
          var events = (data && data.events) || [];
          for (var ei = 0; ei < events.length; ei++) {
            try {
              var ev = events[ei];
              var comps = ev.competitions[0];
              var away = null, home = null;
              for (var ci = 0; ci < comps.competitors.length; ci++) {
                if (comps.competitors[ci].homeAway === 'away') away = comps.competitors[ci];
                if (comps.competitors[ci].homeAway === 'home') home = comps.competitors[ci];
              }
              if (!away || !home) continue;
              var statusType = ((ev.status || {}).type || {});
              var isCompleted = statusType.completed === true || statusType.state === 'post';
              var gameInfo = {
                display: away.team.abbreviation + ' ' + away.score + ' - ' + home.team.abbreviation + ' ' + home.score,
                completed: isCompleted,
                awayTeam: away.team.displayName,
                homeTeam: home.team.displayName,
                awayShort: away.team.shortDisplayName,
                homeShort: home.team.shortDisplayName,
                awayAbbr: away.team.abbreviation,
                homeAbbr: home.team.abbreviation,
                awayScore: parseInt(away.score, 10) || 0,
                homeScore: parseInt(home.score, 10) || 0,
                status: statusType.shortDetail || '',
                espnSport: entry.sport,
              };
              var names = [away.team.displayName, home.team.displayName,
                           away.team.shortDisplayName, home.team.shortDisplayName,
                           away.team.abbreviation, home.team.abbreviation];
              for (var ni = 0; ni < names.length; ni++) {
                if (names[ni]) histMap[names[ni].toLowerCase()] = gameInfo;
              }
            } catch (e) { /* skip malformed event */ }
          }

          /* Try to grade each bet against this historical data */
          for (var bi = 0; bi < entry.bets.length; bi++) {
            var bet = entry.bets[bi];
            if (bet.settled) continue; /* already settled by live pass */
            var game = findInMap(bet, histMap);
            if (!game || !game.completed) continue;
            var result = determineResult(bet, game);
            if (!result) continue;
            bet.settled = true;
            bet.result = result;
            bet.settledDate = new Date().toISOString();
            totalSettled++;
            totalResults.push(escHtml(bet.pick) + ' → <span class="result-badge ' + result + '">' + result + '</span> (' + game.display + ')');
          }
        })
        .then(function() { pending--; if (pending === 0) done(); },
              function() { pending--; if (pending === 0) done(); });
    })(fetchMap[keys[ki]]);
  }
}

function findGameData(bet) {
  var searchStr = ((bet.matchup || '') + ' ' + (bet.pick || '')).toLowerCase();
  /* Normalise the bet's sport string to the ESPN sport tag so we only match
     games from the same sport. This prevents "Kansas" matching both the
     Jayhawks (NCAAMB) and the Chiefs (NFL) when both are in espnGameData. */
  var betSport = (function(s) {
    s = (s || '').toUpperCase().trim();
    if (s === 'NFL' || s === 'FOOTBALL') return 'NFL';
    if (s === 'NBA' || s === 'BASKETBALL') return 'NBA';
    if (s === 'NCAAMB' || s === 'CBB' || /COLLEGE.*BASKET/.test(s)) return 'NCAAMB';
    if (s === 'NCAAWB' || /WOMEN.*BASKET/.test(s)) return 'NCAAWB';
    if (s === 'MLS' || s === 'SOCCER') return 'Soccer';
    return '';
  })(bet.sport);
  var keys = Object.keys(espnGameData);
  /* Word-boundary match prevents false positives like "sa" (Spurs abbr)
     matching "arkansas". Also skip keys shorter than 4 chars — most 2/3-char
     abbreviations are too ambiguous to match safely against free-form pick text. */
  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (!k || k.length < 4) continue;
    var candidate = espnGameData[k];
    if (betSport && candidate.espnSport && candidate.espnSport !== betSport) continue;
    var re = new RegExp('\\b' + escapeRe(k) + '\\b', 'i');
    if (re.test(searchStr)) return candidate;
  }
  return null;
}

function determineResult(bet, game) {
  if (!game.completed) return null;
  var pick = (bet.pick || '').toLowerCase();
  var matchup = (bet.matchup || '').toLowerCase();
  var type = bet.type || '';

  /* For moneyline: did the picked team win? */
  if (type === 'moneyline' || /\bml\b/i.test(pick)) {
    var pickedTeam = pick.replace(/\s*ml\s*/i, '').replace(/\s*\([+-]\d+\)\s*/g, '').trim();
    var homeNames = [game.homeTeam.toLowerCase(), game.homeShort.toLowerCase(), game.homeAbbr.toLowerCase()];
    var awayNames = [game.awayTeam.toLowerCase(), game.awayShort.toLowerCase(), game.awayAbbr.toLowerCase()];
    var pickedHome = false, pickedAway = false;
    for (var i = 0; i < homeNames.length; i++) { if (pickedTeam.indexOf(homeNames[i]) !== -1 || homeNames[i].indexOf(pickedTeam) !== -1) pickedHome = true; }
    for (var i = 0; i < awayNames.length; i++) { if (pickedTeam.indexOf(awayNames[i]) !== -1 || awayNames[i].indexOf(pickedTeam) !== -1) pickedAway = true; }
    if (pickedHome) return game.homeScore > game.awayScore ? 'W' : game.homeScore < game.awayScore ? 'L' : 'P';
    if (pickedAway) return game.awayScore > game.homeScore ? 'W' : game.awayScore < game.homeScore ? 'L' : 'P';
  }

  /* For spread: did picked team cover? */
  if (type === 'spread' || /[+-]\d+\.?\d*/.test(pick)) {
    var spreadMatch = pick.match(/([+-]\d+\.?\d*)/);
    if (spreadMatch) {
      var spread = parseFloat(spreadMatch[1]);
      var teamPart = pick.replace(/[+-]\d+\.?\d*/, '').replace(/\s*\([+-]\d+\)\s*/g, '').trim();
      var homeNames = [game.homeTeam.toLowerCase(), game.homeShort.toLowerCase(), game.homeAbbr.toLowerCase()];
      var awayNames = [game.awayTeam.toLowerCase(), game.awayShort.toLowerCase(), game.awayAbbr.toLowerCase()];
      var isHome = false, isAway = false;
      for (var i = 0; i < homeNames.length; i++) { if (teamPart.indexOf(homeNames[i]) !== -1 || homeNames[i].indexOf(teamPart) !== -1) isHome = true; }
      for (var i = 0; i < awayNames.length; i++) { if (teamPart.indexOf(awayNames[i]) !== -1 || awayNames[i].indexOf(teamPart) !== -1) isAway = true; }

      var pickedScore, oppScore;
      if (isHome) { pickedScore = game.homeScore; oppScore = game.awayScore; }
      else if (isAway) { pickedScore = game.awayScore; oppScore = game.homeScore; }
      else return null;

      var adjustedScore = pickedScore + spread;
      if (adjustedScore > oppScore) return 'W';
      if (adjustedScore < oppScore) return 'L';
      return 'P';
    }
  }

  /* For totals */
  if (type === 'total' || /over|under|^o\s*\d|^u\s*\d/i.test(pick)) {
    var totalMatch = pick.match(/(over|under|^o|^u)\s*(\d+\.?\d*)/i);
    if (totalMatch) {
      var isOver = totalMatch[1].toLowerCase().charAt(0) === 'o';
      var line = parseFloat(totalMatch[2]);
      var gameTotal = game.homeScore + game.awayScore;
      if (isOver) {
        if (gameTotal > line) return 'W';
        if (gameTotal < line) return 'L';
        return 'P';
      } else {
        if (gameTotal < line) return 'W';
        if (gameTotal > line) return 'L';
        return 'P';
      }
    }
  }

  return null;
}

/* ===== FUTURES ODDS FETCH ===== */
function _buildFuturesSportsParam() {
  var openFutures = store.futures.filter(function(b) { return !b.settled; });
  if (openFutures.length === 0) return '';
  var sportsSet = {};
  for (var i = 0; i < openFutures.length; i++) {
    var s = (openFutures[i].sport || 'NBA').toLowerCase();
    if (s === 'cbb' || s === 'ncaamb') sportsSet['ncaamb'] = true;
    else if (s === 'nba') sportsSet['nba'] = true;
    else if (s === 'nfl') sportsSet['nfl'] = true;
    else if (s === 'mlb') sportsSet['mlb'] = true;
    else if (s === 'nhl') sportsSet['nhl'] = true;
    else if (s.indexOf('soccer') !== -1) {
      /* Map soccer sub-type by inspecting the bet's pick/matchup description */
      var desc = ((openFutures[i].pick || '') + ' ' + (openFutures[i].matchup || '')).toLowerCase();
      if (desc.indexOf('champion') !== -1 || desc.indexOf('ucl') !== -1 || desc.indexOf('uefa') !== -1) {
        sportsSet['soccer_ucl'] = true;
      } else if (desc.indexOf('epl') !== -1 || desc.indexOf('premier') !== -1) {
        sportsSet['soccer_epl'] = true;
      } else {
        sportsSet['soccer_ucl'] = true; /* default soccer fallback */
      }
    } else {
      sportsSet[s] = true; /* pass unknown sports through — server will ignore ones it doesn't know */
    }
  }
  return Object.keys(sportsSet).join(',');
}

function fetchFuturesOdds() {
  var sportsParam = _buildFuturesSportsParam();
  if (!sportsParam) return;

  var url = 'http://localhost:5001/api/futures-odds?sports=' + encodeURIComponent(sportsParam);
  if (store.oddsApiKey) url += '&odds_api_key=' + encodeURIComponent(store.oddsApiKey);

  fetch(url)
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data && data.ok && data.odds) {
        var keys = Object.keys(data.odds);
        for (var k = 0; k < keys.length; k++) {
          cachedFuturesOdds[keys[k]] = data.odds[keys[k]];
        }
        if (data.source) /* console.log('Futures odds source:', data.source, '(' + data.count + ' teams)'); */;
        if (data.errors) console.warn('Futures odds warnings:', data.errors);
        fetchOddsHistory();
        if (store.currentTab === 'futures') renderFutures();
      }
    })
    .catch(function() {
      /* Server not running for futures odds fetch */
    });
}

function fetchOddsHistory() {
  fetch('http://localhost:5001/api/odds-history?days=30')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data && data.ok && data.history) {
        cachedOddsHistory = data.history;
        detectSteamMoves();
        if (store.currentTab === 'futures') renderFutures();
      }
    })
    .catch(function() {});
}

/* Fuzzy lookup for odds history matching a pick string */
function lookupOddsHistory(pick) {
  if (!pick) return null;
  var p = pick.toLowerCase();
  if (cachedOddsHistory[p]) return cachedOddsHistory[p];
  var keys = Object.keys(cachedOddsHistory);
  var best = null, bestLen = 0;
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (p.indexOf(k) !== -1 || k.indexOf(p) !== -1) {
      if (k.length > bestLen) { best = cachedOddsHistory[k]; bestLen = k.length; }
      continue;
    }
    var words = k.split(' ');
    for (var j = 0; j < words.length; j++) {
      if (words[j].length > 3 && p.indexOf(words[j]) !== -1) {
        if (k.length > bestLen) { best = cachedOddsHistory[k]; bestLen = k.length; }
        break;
      }
    }
  }
  return best;
}

/* Build mini sparkline HTML from odds history entries */
function buildSparkline(historyEntries, placedOdds) {
  if (!historyEntries || historyEntries.length < 2) return '';
  var odds = historyEntries.map(function(e) { return e.odds; });
  var maxOdds = Math.max.apply(null, odds);
  var minOdds = Math.min.apply(null, odds);
  var range = maxOdds - minOdds;
  if (range === 0) return '';

  var html = '<div class="line-movement">';
  html += '<div class="lm-label">Line Movement (' + historyEntries.length + ' snapshots)</div>';
  html += '<div class="lm-sparkline">';
  for (var i = 0; i < historyEntries.length; i++) {
    var e = historyEntries[i];
    var pct = ((e.odds - minOdds) / range) * 100;
    var h = Math.max(4, 4 + (pct / 100) * 24);
    var cls = 'neutral';
    if (placedOdds !== undefined && placedOdds !== null) {
      if (e.odds < placedOdds) cls = 'favorable';
      else if (e.odds > placedOdds) cls = 'unfavorable';
    }
    if (i === historyEntries.length - 1) cls += ' latest';
    var dt = e.ts ? e.ts.substring(5, 10).replace('-', '/') : '';
    html += '<div class="lm-bar ' + cls + '" style="height:' + h + 'px" title="' + fmtOdds(e.odds) + ' on ' + dt + '"></div>';
  }
  html += '</div>';
  var firstDate = historyEntries[0].ts ? historyEntries[0].ts.substring(5, 10).replace('-', '/') : '';
  var lastDate = historyEntries[historyEntries.length - 1].ts ? historyEntries[historyEntries.length - 1].ts.substring(5, 10).replace('-', '/') : '';
  html += '<div class="lm-range"><span>' + firstDate + '</span><span>' + fmtOdds(minOdds) + ' to ' + fmtOdds(maxOdds) + '</span><span>' + lastDate + '</span></div>';
  html += '</div>';
  return html;
}

/* ===== CLOSING LINE FETCH ===== */
function fetchClosingLines(callback) {
  fetch('http://localhost:5001/api/closing-lines')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data && data.ok && data.lines) {
        var keys = Object.keys(data.lines);
        for (var i = 0; i < keys.length; i++) {
          var betId = keys[i];
          var cl = data.lines[betId];
          /* Apply to matching bets */
          var allBets = store.bets.concat(store.futures);
          for (var j = 0; j < allBets.length; j++) {
            if (allBets[j].id === betId && allBets[j].closingOdds === undefined) {
              allBets[j].closingOdds = cl.closingOdds;
            }
          }
        }
      }
      if (callback) callback();
    })
    .catch(function() { if (callback) callback(); });
}

function capturePreGameClosingLines() {
  /* For open bets with a game starting within 30 minutes,
     look up current odds and save as closing lines */
  var now = Date.now();
  var thirtyMin = 30 * 60 * 1000;
  var openBets = store.bets.filter(function(b) { return !b.settled; });
  var toCapture = [];

  for (var i = 0; i < openBets.length; i++) {
    var b = openBets[i];
    if (b.closingOdds !== undefined) continue;
    var gameTs = b.scheduledStart ? new Date(b.scheduledStart).getTime() : parseGameDate(b.gameTime);
    if (!gameTs) continue;
    var timeUntilGame = gameTs - now;
    /* Game starts within 30 min or has started in the last 5 min */
    if (timeUntilGame > -5 * 60000 && timeUntilGame < thirtyMin) {
      /* Try to find current odds from cached futures or odds history */
      var currentOdds = lookupCurrentOdds(b.pick);
      if (currentOdds) {
        toCapture.push({ betId: b.id, closingOdds: currentOdds });
        b.closingOdds = currentOdds;
      }
    }
  }

  if (toCapture.length > 0) {
    /* Save to server */
    fetch('http://localhost:5001/api/closing-lines', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lines: toCapture })
    }).catch(function() {});
    saveData();
  }
}

/* ===== UPCOMING GAMES ===== */
var upcomingFilter = 'all';
var upcomingGamesData = null;   /* { fetchedAt: ms, games: [...] } */
var upcomingFetchActive = false;

/* ===== ACTION NETWORK CONSENSUS (bet % / money %) =====
   Experimental: uses undocumented Action Network public API endpoints
   that can change or disappear without notice. The "money side" indicator
   uses a simple heuristic (15%+ gap between money% and bet%) and should
   not be treated as a definitive sharp/professional signal. */

/* ESPN sport key → Action Network sport slug */
var AN_SPORT_MAP = { NBA: 'nba', NFL: 'nfl', CBB: 'ncaab' };
/* Soccer leagues aren't covered uniformly by AN, skip them */

/* Some ESPN team abbreviations differ from Action Network's */
var ESPN_TO_AN_ABBR = {
  'GS':'GSW', 'NO':'NOP', 'SA':'SAS', 'NY':'NYK',
  'PHO':'PHX', 'WSH':'WAS', 'UTAH':'UTA', 'BRK':'BKN',
  'CHA':'CHA', 'WAS':'WAS', 'PHX':'PHX'
};
function normAbbrAN(a) {
  var u = (a || '').toUpperCase().replace(/[^A-Z]/g, '');
  return ESPN_TO_AN_ABBR[u] || u;
}

/* consensusStore: keyed by "anSport:YYYY-MM-DD" → object of "AWAY:HOME" → {awayBets,homeBets,awayMoney,homeMoney} */
var consensusStore = {};
var consensusFetching = {};  /* prevents duplicate in-flight requests */
var consensusLastFetchMs = 0;

function anTodayStr() {
  var d = new Date();
  return d.getFullYear() + '-' +
    ('0' + (d.getMonth() + 1)).slice(-2) + '-' +
    ('0' + d.getDate()).slice(-2);
}

/* Normalise a raw value to 0-100 integer percentage (handles 0-1 floats and 0-100 ints) */
function toPct(v) {
  if (v === null || v === undefined || v === '') return null;
  var n = parseFloat(v);
  if (isNaN(n)) return null;
  return Math.round(n <= 1.5 ? n * 100 : n);
}

/* Parse the consensus object returned by Action Network — handles multiple API response shapes */

