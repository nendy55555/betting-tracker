/* ESPN game data, enrichment, game times */
/* Extracted from betting-tracker.html — do not edit the original */

function fetchEspnGameTimes(callback) {
  /* Load cached data first */
  try {
    var cached = localStorage.getItem('bt_espn_cache');
    if (cached) {
      var parsed = JSON.parse(cached);
      if (parsed.ts && Date.now() - parsed.ts < 600000) { /* 10 min cache */
        espnGameCache = parsed.games || {};
        espnCacheLoaded = true;
        if (callback) callback();
        return;
      }
    }
  } catch(e) {}

  /* Determine date range: last 7 days */
  var dates = [];
  var now = new Date();
  for (var d = 0; d < 7; d++) {
    var dt = new Date(now.getTime() - d * 86400000);
    var ds = String(dt.getFullYear()) + String(dt.getMonth()+1).padStart(2,'0') + String(dt.getDate()).padStart(2,'0');
    dates.push(ds);
  }

  var pending = dates.length;
  var allGames = {};

  function processDone() {
    pending--;
    if (pending <= 0) {
      espnGameCache = allGames;
      espnCacheLoaded = true;
      try {
        localStorage.setItem('bt_espn_cache', JSON.stringify({ ts: Date.now(), games: allGames }));
      } catch(e) {}
      if (callback) callback();
    }
  }

  dates.forEach(function(ds) {
    var url = 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?dates=' + ds + '&groups=100&limit=200';
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.timeout = 8000;
    xhr.onload = function() {
      try {
        var data = JSON.parse(xhr.responseText);
        if (data.events) {
          for (var i = 0; i < data.events.length; i++) {
            var ev = data.events[i];
            var comp = ev.competitions && ev.competitions[0];
            if (!comp || !comp.status || !comp.status.type || !comp.status.type.completed) continue;
            var gameEndTime = ev.date; /* ISO string */
            var teams = [];
            if (comp.competitors) {
              for (var ci = 0; ci < comp.competitors.length; ci++) {
                var t = comp.competitors[ci].team;
                teams.push({
                  name: t.displayName || '',
                  short: t.shortDisplayName || '',
                  abbr: t.abbreviation || '',
                  score: comp.competitors[ci].score
                });
              }
            }
            /* Index by multiple team name variants for matching */
            for (var ti = 0; ti < teams.length; ti++) {
              var variants = [teams[ti].name, teams[ti].short, teams[ti].abbr];
              for (var vi = 0; vi < variants.length; vi++) {
                var key = variants[vi].toUpperCase().replace(/[^A-Z]/g, '');
                if (key.length > 1) {
                  allGames[key + '|' + ds] = {
                    endTime: gameEndTime,
                    matchup: teams.map(function(x){return x.short;}).join(' vs '),
                    score: teams.map(function(x){return x.short + ' ' + x.score;}).join(', ')
                  };
                  /* Also store without date for fuzzy match */
                  if (!allGames[key] || new Date(gameEndTime) > new Date(allGames[key].endTime)) {
                    allGames[key] = { endTime: gameEndTime, matchup: teams.map(function(x){return x.short;}).join(' vs '), score: teams.map(function(x){return x.short + ' ' + x.score;}).join(', ') };
                  }
                }
              }
            }
          }
        }
      } catch(e) { console.warn('ESPN parse error for ' + ds, e); }
      processDone();
    };
    xhr.onerror = function() { processDone(); };
    xhr.ontimeout = function() { processDone(); };
    xhr.send();
  });
}

function lookupEspnEndTime(bet) {
  if (!espnCacheLoaded) return 0;
  /* Extract team name from pick */
  var pickTeam = (bet.pick || '').toUpperCase().replace(/[^A-Z\s]/g, '').split(/\s+/)[0];
  if (pickTeam.length < 3) {
    var words = (bet.pick || '').toUpperCase().replace(/[^A-Z\s]/g, '').split(/\s+/);
    for (var w = 0; w < words.length; w++) { if (words[w].length >= 3) { pickTeam = words[w]; break; } }
  }
  /* Also try matchup teams */
  var matchTeams = [];
  if (bet.matchup) {
    var parts = bet.matchup.split(/\s+vs\.?\s+/i);
    for (var p = 0; p < parts.length; p++) {
      var t = parts[p].toUpperCase().replace(/[^A-Z]/g, '');
      if (t.length > 2) matchTeams.push(t);
    }
  }

  /* Try date-specific lookup first */
  var dateKey = '';
  if (bet.gameTime) {
    var dm = String(bet.gameTime).match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (dm) {
      var yr = parseInt(dm[3],10); if (yr < 100) yr += 2000;
      dateKey = String(yr) + String(parseInt(dm[1],10)).padStart(2,'0') + String(parseInt(dm[2],10)).padStart(2,'0');
    }
  }

  var candidates = [pickTeam].concat(matchTeams);
  for (var ci = 0; ci < candidates.length; ci++) {
    var ck = candidates[ci];
    if (!ck) continue;
    /* Try with date */
    if (dateKey && espnGameCache[ck + '|' + dateKey]) {
      return new Date(espnGameCache[ck + '|' + dateKey].endTime).getTime();
    }
    /* Try without date */
    if (espnGameCache[ck]) {
      return new Date(espnGameCache[ck].endTime).getTime();
    }
  }
  return 0;
}

function calculateExpectedEndTime(scheduledStart, sport) {
  if (!scheduledStart) return null;
  var start = new Date(scheduledStart).getTime();
  if (isNaN(start)) {
    start = parseGameDate(scheduledStart);
  }
  if (!start) return null;
  var durationMinutes = 150; // default
  var s = (sport || '').toUpperCase();
  if (s === 'NCAAMB' || s.indexOf('CBB') !== -1) durationMinutes = 150; /* March Madness ~2.5 hrs with TV timeouts */
  else if (s === 'NBA') durationMinutes = 150;
  else if (s === 'NFL') durationMinutes = 195;
  else if (s === 'SOCCER' || s === 'MLS') durationMinutes = 120;
  else if (s === 'NCAAWB') durationMinutes = 120;
  return new Date(start + durationMinutes * 60000).toISOString();
}

/* Extract numeric spread from a bet's pick/line text.
   "ATS -11.5", "+8 (-110)", "Point Spread +7.5", "ML +130" → null */
function extractBetSpread(bet) {
  var text = (bet.pick || '') + ' ' + (bet.matchup || '');
  var m;
  m = text.match(/ATS\s+([+-]?\d+\.?\d*)/i);         if (m) return parseFloat(m[1]);
  m = text.match(/Point\s+Spread\s+([+-]?\d+\.?\d*)/i); if (m) return parseFloat(m[1]);
  /* Standalone spread: number followed by odds in parens, e.g. "+8 (-110)" */
  m = text.match(/([+-]\d+\.?\d*)\s+\([-+]\d{2,4}\)/); if (m) return parseFloat(m[1]);
  return null;
}

/* Extract spread from ESPN competition odds object */
function extractESPNSpread(comp) {
  if (!comp || !comp.odds || !comp.odds.length) return null;
  var o = comp.odds[0];
  if (typeof o.spread === 'number') return o.spread;
  if (o.details) {
    var m = String(o.details).match(/([+-]?\d+\.?\d*)/);
    if (m) return parseFloat(m[1]);
  }
  return null;
}

function enrichBetFromESPN(bet, callback) {
  if (!bet) { if (callback) callback(bet); return; }
  /* Allow settled bets through — we still want to find their opponent.
     We just won't change settled/result fields on already-settled bets. */
  var alreadySettled = !!bet.settled;

  /* Extract team name from pick/matchup */
  var searchTerms = [];
  var pickClean = (bet.pick || '').replace(/\([^)]*\)/g, '').replace(/[+-]\d+\.?\d*/g, '').replace(/\b(ML|Over|Under|1H|2H)\b/gi, '').trim();
  var words = pickClean.split(/\s+/);
  /* Build search terms - try multi-word team names first */
  if (words.length >= 2) searchTerms.push(words.slice(0, 2).join(' '));
  if (words.length >= 1 && words[0].length >= 3) searchTerms.push(words[0]);

  /* Also try matchup teams */
  if (bet.matchup) {
    var parts = bet.matchup.split(/\s+vs\.?\s+/i);
    for (var p = 0; p < parts.length; p++) {
      var t = parts[p].trim();
      if (t.length > 2) searchTerms.push(t);
    }
  }

  /* Determine date to search */
  var searchDate = '';
  if (bet.gameTime) {
    var ts = parseGameDate(bet.gameTime);
    if (ts) {
      var d = new Date(ts);
      searchDate = String(d.getFullYear()) + String(d.getMonth()+1).padStart(2,'0') + String(d.getDate()).padStart(2,'0');
    }
  }
  if (!searchDate) {
    /* Use addedDate as reference when available; fall back to today */
    var refTs = bet.addedDate ? new Date(bet.addedDate).getTime() : Date.now();
    var ref = new Date(refTs);
    searchDate = String(ref.getFullYear()) + String(ref.getMonth()+1).padStart(2,'0') + String(ref.getDate()).padStart(2,'0');
  }

  var url = 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?dates=' + searchDate + '&groups=100&limit=200';

  /* Choose sport-specific endpoint */
  var sportUpper = (bet.sport || '').toUpperCase();
  if (sportUpper === 'NBA') {
    url = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=' + searchDate;
  } else if (sportUpper === 'NFL') {
    url = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=' + searchDate;
  } else if (sportUpper === 'NCAAWB') {
    url = 'https://site.api.espn.com/apis/site/v2/sports/basketball/womens-college-basketball/scoreboard?dates=' + searchDate + '&groups=100&limit=200';
  } else if (sportUpper === 'SOCCER' || sportUpper === 'MLS') {
    url = 'https://site.api.espn.com/apis/site/v2/sports/soccer/usa.1/scoreboard?dates=' + searchDate;
  }

  var xhr = new XMLHttpRequest();
  xhr.open('GET', url, true);
  xhr.timeout = 8000;
  xhr.onload = function() {
    try {
      var data = JSON.parse(xhr.responseText);
      if (!data.events) { if (callback) callback(bet); return; }

      var bestMatch = null;
      var bestScore = 0;

      for (var i = 0; i < data.events.length; i++) {
        var ev = data.events[i];
        var comp = ev.competitions && ev.competitions[0];
        if (!comp) continue;

        var teams = [];
        if (comp.competitors) {
          for (var ci = 0; ci < comp.competitors.length; ci++) {
            var t = comp.competitors[ci].team;
            teams.push({
              name: (t.displayName || '').toLowerCase(),
              short: (t.shortDisplayName || '').toLowerCase(),
              abbr: (t.abbreviation || '').toLowerCase()
            });
          }
        }

        /* Score this event against our search terms */
        var score = 0;
        for (var si = 0; si < searchTerms.length; si++) {
          var term = searchTerms[si].toLowerCase();
          for (var ti = 0; ti < teams.length; ti++) {
            if (teams[ti].name.indexOf(term) !== -1 || teams[ti].short.indexOf(term) !== -1 || teams[ti].abbr === term) {
              score += (si === 0 ? 10 : 5); /* First search term scores higher */
            }
          }
        }

        if (score > bestScore) {
          bestScore = score;
          bestMatch = ev;
        }
      }

      /* Date proximity guard: reject events that are more than 2 days away from
         the bet's reference date. This prevents enrichment against future games
         (e.g. Sweet 16 matchup for a bet placed during Round of 32). */
      if (bestMatch && bestScore >= 5) {
        var betRefMs = bet.gameTime ? parseGameDate(bet.gameTime) : (bet.addedDate ? new Date(bet.addedDate).getTime() : Date.now());
        if (!betRefMs) betRefMs = Date.now();
        var eventMs = new Date(bestMatch.date).getTime();
        if (Math.abs(eventMs - betRefMs) > 2 * 86400000) bestMatch = null;
      }

      /* Spread validation: reject the matched game if the line differs by more than 5 points */
      if (bestMatch && bestScore >= 5) {
        var betSpread = extractBetSpread(bet);
        var compForSpread = bestMatch.competitions && bestMatch.competitions[0];
        var gameSpread = extractESPNSpread(compForSpread);
        if (betSpread !== null && gameSpread !== null &&
            Math.abs(Math.abs(betSpread) - Math.abs(gameSpread)) > 5) {
          bestMatch = null; /* spread mismatch — likely wrong game */
        }
      }

      if (bestMatch && bestScore >= 5) {
        /* Debug: ESPN matched — uncomment for troubleshooting */
        var comp = bestMatch.competitions[0];
        var away = null, home = null;
        for (var ci = 0; ci < comp.competitors.length; ci++) {
          if (comp.competitors[ci].homeAway === 'away') away = comp.competitors[ci];
          if (comp.competitors[ci].homeAway === 'home') home = comp.competitors[ci];
        }

        if (away && home) {
          bet.espnMatchup = away.team.shortDisplayName + ' vs ' + home.team.shortDisplayName;
          bet.espnGameId = bestMatch.id;
          bet.scheduledStart = bestMatch.date; /* ISO timestamp */
          bet.expectedEndTime = calculateExpectedEndTime(bestMatch.date, bet.sport);

          /* If we don't have a proper matchup, use ESPN's */
          if (!bet.matchup || bet.matchup === bet.pick || bet.matchup === 'Parlay' || /\bopponent\b|\btbd\b|\btba\b/i.test(bet.matchup)) {
            bet.matchup = away.team.shortDisplayName + ' vs ' + home.team.shortDisplayName;
          }

          /* Derive teamBetOn + opponent from ESPN competitors.
             The picked team is the one matching bet.teamBetOn; the other is the opponent. */
          var awayShort = away.team.shortDisplayName;
          var homeShort = home.team.shortDisplayName;
          var awayKey   = getEspnTeamKey(awayShort);
          var homeKey   = getEspnTeamKey(homeShort);
          if (bet.teamBetOn) {
            var pickedKey = getEspnTeamKey(bet.teamBetOn);
            var pickedIsAway = pickedKey && (awayKey.indexOf(pickedKey) !== -1 || pickedKey.indexOf(awayKey) !== -1);
            if (pickedIsAway) {
              if (!bet.opponent) bet.opponent = normalizeTeamName(homeShort);
            } else {
              if (!bet.opponent) bet.opponent = normalizeTeamName(awayShort);
              /* Also update teamBetOn to the ESPN canonical short name */
              if (!bet.opponent) bet.teamBetOn = normalizeTeamName(homeShort);
            }
          } else {
            /* No teamBetOn yet — set away as default (bet slip convention: your team first) */
            bet.teamBetOn = bet.teamBetOn || normalizeTeamName(awayShort);
            bet.opponent  = bet.opponent  || normalizeTeamName(homeShort);
          }

          /* Check if game is already completed */
          var statusType = (comp.status && comp.status.type) || {};
          if (statusType.completed || statusType.state === 'post') {
            bet.espnScore = away.team.abbreviation + ' ' + away.score + ' - ' + home.team.abbreviation + ' ' + home.score;
            /* Auto-settle if possible */
            var gameInfo = {
              completed: true,
              awayTeam: away.team.displayName,
              homeTeam: home.team.displayName,
              awayShort: away.team.shortDisplayName,
              homeShort: home.team.shortDisplayName,
              awayAbbr: away.team.abbreviation,
              homeAbbr: home.team.abbreviation,
              awayScore: parseInt(away.score, 10) || 0,
              homeScore: parseInt(home.score, 10) || 0,
              display: away.team.abbreviation + ' ' + away.score + ' - ' + home.team.abbreviation + ' ' + home.score
            };
            var result = determineResult(bet, gameInfo);
            if (result && !alreadySettled) {
              bet.settled = true;
              bet.result = result;
              bet.settledDate = new Date().toISOString();
              bet.autoSettled = true;
            }
          }
        }
      }
    } catch(e) { console.warn('ESPN enrichment error:', e); }
    /* Debug: ESPN no match — uncomment for troubleshooting */
    if (callback) callback(bet);
  };
  xhr.onerror = function() { console.warn('[BT] ESPN XHR error for: ' + (bet.pick||'').substring(0,30)); if (callback) callback(bet); };
  xhr.ontimeout = function() { console.warn('[BT] ESPN XHR timeout for: ' + (bet.pick||'').substring(0,30)); if (callback) callback(bet); };
  xhr.send();
}

function enrichNewBets(bets, callback) {
  var index = 0;
  var enriched = 0;
  function next() {
    if (index >= bets.length) {
      if (callback) callback(enriched);
      return;
    }
    var bet = bets[index];
    index++;
    /* Skip parlays (multi-game); settled bets are allowed through so we can derive their opponent */
    if (bet.type === 'parlay') {
      next();
      return;
    }
    enrichBetFromESPN(bet, function(b) {
      if (b.espnMatchup) enriched++;
      /* Small delay between API calls */
      setTimeout(next, 200);
    });
  }
  next();
}



