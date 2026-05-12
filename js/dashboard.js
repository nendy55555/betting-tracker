/* Dashboard rendering, pipeline, sort, charts */
/* Extracted from betting-tracker.html — do not edit the original */

function renderDashStats() {
  var settled = getCachedFiltered().filteredSettled;
  var wins = 0, losses = 0, pushes = 0, totalStaked = 0, totalReturn = 0;
  /* Parlay vs straight split */
  var pW = 0, pL = 0, pStake = 0, pReturn = 0;
  var sW = 0, sL = 0, sStake = 0, sReturn = 0;
  for (var i = 0; i < settled.length; i++) {
    var b = settled[i];
    var isParlay = b.type === 'parlay' || /parlay/i.test(b.matchup || '');
    if (b.result === 'W') { wins++; totalReturn += b.stake + (b.toWin || 0); if(isParlay){pW++;pReturn+=b.stake+(b.toWin||0);}else{sW++;sReturn+=b.stake+(b.toWin||0);} }
    else if (b.result === 'L') { losses++; if(isParlay){pL++;}else{sL++;} }
    else if (b.result === 'P') { pushes++; totalReturn += b.stake; }
    totalStaked += (b.stake || 0);
    if(isParlay){pStake+=b.stake||0;}else if(b.result!=='P'){sStake+=b.stake||0;}
  }
  var profit = totalReturn - totalStaked;
  var roi = totalStaked > 0 ? ((profit / totalStaked) * 100) : 0;
  var openCount = store.bets.filter(function(b){return !b.settled;}).length;
  var decisioned = wins + losses;
  var winPct = decisioned > 0 ? ((wins / decisioned) * 100) : 0;
  /* Sub-metrics */
  var pGraded = pW + pL, sGraded = sW + sL;
  var pWinPct = pGraded > 0 ? (pW/pGraded*100) : 0;
  var sWinPct = sGraded > 0 ? (sW/sGraded*100) : 0;
  var pProfit = pReturn - pStake, sProfit = sReturn - sStake;
  var pROI = pStake > 0 ? (pProfit/pStake*100) : 0;
  var sROI = sStake > 0 ? (sProfit/sStake*100) : 0;
  /* Timestamp */
  var now = new Date();
  var tsStr = (now.getMonth()+1)+'/'+now.getDate()+'/'+String(now.getFullYear()).slice(2)+' '+now.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});

  var el = document.getElementById('dashStats');
  if (!el) return;
  /* Hero card variants: green stripe for positive, red for negative, neutral for zero */
  var recordHeroClass = wins > losses ? 'hero' : wins < losses ? 'hero negative' : 'hero neutral';
  var recordColorClass = wins > losses ? 'green' : wins < losses ? 'red' : 'blue';
  var plHeroClass = profit > 0 ? 'hero' : profit < 0 ? 'hero negative' : 'hero neutral';
  var plColorClass = profit > 0 ? 'green' : profit < 0 ? 'red' : 'blue';
  var roiColorClass = roi > 0 ? 'green' : roi < 0 ? 'red' : 'blue';
  var winPctColorClass = winPct >= 50 ? 'green' : winPct > 0 ? 'red' : 'blue';

  el.innerHTML =
    '<div class="stat-card ' + recordHeroClass + '"><div class="label">Record (settled only)</div><div class="value ' + recordColorClass + '">' + wins + '-' + losses + (pushes > 0 ? '-' + pushes : '') + '</div>' +
      '<div style="font-size:var(--fs-xs);color:var(--text3);margin-top:4px">Straight: '+sW+'-'+sL+' ('+sWinPct.toFixed(0)+'%) | Parlay: '+pW+'-'+pL+' ('+pWinPct.toFixed(0)+'%)</div></div>' +
    '<div class="stat-card" title="Win rate excludes pushes from denominator"><div class="label">Win Rate</div><div class="value ' + winPctColorClass + '">' + winPct.toFixed(1) + '%</div>' +
      (decisioned < 20 ? '<div style="font-size:var(--fs-xs);color:var(--amber);margin-top:4px">Low sample ('+decisioned+' bets)</div>' : '') + '</div>' +
    '<div class="stat-card"><div class="label">ROI</div><div class="value ' + roiColorClass + '">' + (roi >= 0 ? '+' : '') + roi.toFixed(1) + '%</div>' +
      '<div style="font-size:var(--fs-xs);color:var(--text3);margin-top:4px">Str: '+(sROI>=0?'+':'')+sROI.toFixed(0)+'% | Par: '+(pROI>=0?'+':'')+pROI.toFixed(0)+'%</div></div>' +
    '<div class="stat-card ' + plHeroClass + '"><div class="label">Profit / Loss</div><div class="value ' + plColorClass + '" data-countup="' + profit.toFixed(2) + '" data-prefix="' + (profit > 0 ? '+$' : profit < 0 ? '-$' : '$') + '">' + (profit > 0 ? '+' : profit < 0 ? '-' : '') + fmtMoney(profit) + '</div>' +
      '<div style="font-size:var(--fs-xs);color:var(--text3);margin-top:4px">Str: '+(sProfit>=0?'+':'-')+fmtMoney(sProfit)+' | Par: '+(pProfit>=0?'+':'-')+fmtMoney(pProfit)+'</div></div>' +
    '<div class="stat-card"><div class="label">Total Wagered</div><div class="value blue">' + fmtMoney(totalStaked) + '</div></div>' +
    '<div class="stat-card"><div class="label">Open Bets</div><div class="value amber">' + openCount + '</div>' +
      '<div style="font-size:var(--fs-xs);color:var(--text3);margin-top:4px">Updated: '+tsStr+'</div></div>';

  /* Count-up animation on first render only — flag prevents replay on filter changes */
  if (!window._dashHeroAnimated) {
    window._dashHeroAnimated = true;
    var heroValues = el.querySelectorAll('.stat-card.hero .value[data-countup]');
    heroValues.forEach(function(node){
      var target = parseFloat(node.getAttribute('data-countup'));
      var prefix = node.getAttribute('data-prefix') || '';
      var absTarget = Math.abs(target);
      var start = performance.now();
      var dur = 600;
      function tick(now){
        var t = Math.min(1, (now - start) / dur);
        var eased = 1 - Math.pow(1 - t, 4);
        var v = absTarget * eased;
        node.textContent = prefix + v.toFixed(2);
        if (t < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
  }
}

/* ===== RENDER: OPEN BETS (compact cards) ===== */
function renderOpenBets() {
  /* filteredOpenBets: open bets from store.bets (no futures), already chart-filtered. */
  var open = getCachedFiltered().filteredOpenBets;
  open = open.slice(); /* copy before sort — don't mutate the cache */
  open.sort(function(a, b) {
    if (a.gameTime && b.gameTime) return parseGameDate(a.gameTime) - parseGameDate(b.gameTime);
    if (a.gameTime) return -1;
    if (b.gameTime) return 1;
    return new Date(b.addedDate || 0) - new Date(a.addedDate || 0);
  });

  var countEl = document.getElementById('openCount');
  if (countEl) countEl.textContent = open.length;
  var el = document.getElementById('openBetsList');
  if (!el) return;

  if (open.length === 0) {
    el.innerHTML = '<div class="empty-state">No open bets yet.<br>Paste a bet slip or type a bet like:<br><code style="color:var(--blue)">Kansas +3.5 (-110) $50</code></div>';
    return;
  }

  var html = '';
  for (var i = 0; i < open.length; i++) {
    var b = open[i];
    var sc = sportClass(b.sport);
    var liveScore = findLiveScore(b);

    var isMulti = b.type === 'parlay' || /parlay/i.test(b.matchup || '');
    /* For open bets, show espnMatchup (real opponent) as matchup line when available */
    var displayMatchup = b.espnMatchup || b.matchup || '';
    var topLine = isMulti ? (displayMatchup || 'Multiple Bets') : escHtml(b.pick);

    html += '<div class="bet-card" id="card-' + b.id + '">';
    /* Compact summary: pick first, then sport/units, game time below */
    html += '<div class="bet-card-summary" onclick="toggleCard(\'' + b.id + '\')">';
    html += '<span class="matchup-line">' + topLine + '</span>';
    /* Show real matchup as sub-line if pick doesn't already contain both teams */
    if (!isMulti && displayMatchup && displayMatchup !== (b.pick || '') && !/\bvs\.?\s+(?:opponent|tbd|tba)\b/i.test(displayMatchup)) {
      html += '<span class="game-time-row" style="color:var(--text3);margin-top:1px">' + escHtml(displayMatchup) + '</span>';
    }
    html += '<span class="bet-row">';
    html += '<span class="sport-tag ' + sc + '">' + escHtml(b.sport || '?') + '</span>';
    if (b.source) html += '<span class="source-tag">' + escHtml(b.source) + '</span>';
    html += '<span class="stake-short">' + fmtMoney(b.stake) + '</span>';
    html += '</span>';
    /* Use scheduledStart (ESPN ISO time) for accuracy; fall back to gameTime string */
    var displayTime = b.scheduledStart || b.gameTime;
    if (displayTime) html += '<span class="game-time-row">' + fmtDate(displayTime) + '</span>';
    html += '<span class="chevron">&#9660;</span>';
    html += '</div>';

    /* Expandable details */
    html += '<div class="bet-card-details">';
    if (liveScore) html += '<div class="live-score">' + escHtml(liveScore) + '</div>';
    html += '<div class="detail-row"><span>Matchup</span><strong>' + escHtml(b.matchup) + '</strong></div>';
    html += '<div class="detail-row"><span>Pick</span><strong>' + escHtml(b.pick) + '</strong></div>';
    html += '<div class="detail-row"><span>Odds</span><strong>' + fmtOdds(b.odds) + '</strong></div>';
    html += '<div class="detail-row"><span>Risk</span><strong>' + fmtMoney(b.stake) + '</strong></div>';
    html += '<div class="detail-row"><span>To Win</span><strong style="color:var(--green)">' + fmtMoney(b.toWin) + '</strong></div>';
    if (b.type) html += '<div class="detail-row"><span>Type</span><strong>' + b.type + '</strong></div>';
    if (b.source) html += '<div class="detail-row"><span>Site</span><strong>' + escHtml(b.source) + '</strong></div>';
    html += '<div class="actions">';
    html += '<button class="btn-win" onclick="event.stopPropagation();settleBet(\'' + b.id + '\',\'W\')">Win</button>';
    html += '<button class="btn-loss" onclick="event.stopPropagation();settleBet(\'' + b.id + '\',\'L\')">Loss</button>';
    html += '<button class="btn-push" onclick="event.stopPropagation();settleBet(\'' + b.id + '\',\'P\')">Push</button>';
    html += '<button class="btn-edit" onclick="event.stopPropagation();editBet(\'' + b.id + '\')" title="Manually edit fields">Edit</button>';
    html += '<button class="btn-void" onclick="event.stopPropagation();deleteBet(\'' + b.id + '\')">Del</button>';
    html += '</div></div></div>';
  }
  el.innerHTML = html;
}

function findLiveScore(bet) {
  var searchStr = ((bet.matchup || '') + ' ' + (bet.pick || '')).toLowerCase();
  var keys = Object.keys(cachedLiveScores);
  for (var i = 0; i < keys.length; i++) {
    if (searchStr.indexOf(keys[i].toLowerCase()) !== -1) return cachedLiveScores[keys[i]];
  }
  return null;
}

/* ===== RENDER: SETTLED BETS (grouped by game) ===== */
function isGenericPick(pick) {
  if (!pick) return true;
  /* Matches fallback picks like "Bet -2026", "Bet +158", "NCAAMB -2026", "Bet ?", "Bet" */
  if (/^Bet(\s|$)/i.test(pick)) return true;
  if (/^(NCAAMB|NBA|NFL|Soccer|NHL|Other)\s+[+-]?\d/.test(pick)) return true;
  return false;
}
function betTypeLabel(type) {
  if (type === 'spread') return 'Spread';
  if (type === 'moneyline') return 'ML';
  if (type === 'total') return 'Total';
  if (type === 'parlay') return 'Parlay';
  if (type === 'future') return 'Future';
  return 'Bet';
}
/* Clean a single pick/leg string: strips Bovada raw format, trailing odds, double spaces */
function cleanPickString(pick) {
  if (!pick) return '';
  /* Clean "vs. opponent/TBD" artifacts */
  if (/vs\.?\s+(?:opponent|tbd|tba)\b/i.test(pick)) {
    pick = pick.replace(/\s+vs\.?\s+(?:opponent|tbd|tba)\b\s*/i, ' ').trim();
  }
  /* Extract selection from Bovada "Sport Team vs Team - Bet Type: Selection (+odds)" format */
  var selMatch = pick.match(/\s+-\s+(?:Money Line|Moneyline|Point Spread|Total(?:\s+Points)?|3-Way Moneyline|Spread)[:\s]+(.+?)(?:\s*\([+-]?\d{3,5}\))?\s*$/i);
  if (selMatch) {
    pick = selMatch[1].replace(/^(?:Basketball|Football|Baseball|Hockey|Soccer|Tennis|Boxing|MMA|Golf|Cricket|College)\s+/i, '').trim();
  }
  /* Strip trailing odds in parentheses: "Connecticut  -2  (-110)" → "Connecticut  -2" */
  pick = pick.replace(/\s*\([+-]?\d{3,5}\)\s*$/, '').trim();
  /* Collapse double spaces (server pick format uses double-space separators) */
  pick = pick.replace(/\s{2,}/g, ' ');
  return pick;
}
function displayPickForCard(b) {
  var pick = cleanPickString(b.pick);
  if (!isGenericPick(pick)) return escHtml(pick);
  /* If ESPN enriched this bet, show the matchup + bet type */
  if (b.espnMatchup) return escHtml(betTypeLabel(b.type) + ' \u2014 ' + b.espnMatchup);
  /* Otherwise show bet type + odds */
  return escHtml(betTypeLabel(b.type) + ' ' + fmtOdds(b.odds));
}
/* ===== BET SORT TIME =====
   Single source of truth for how any bet's time is determined.
   Priority: expectedEndTime > ESPN end time > gameTime (with real time) > settledDate > gameTime (date-only).
   Generic-pick bets (bad imports) never float up via settledDate.
   Date-only gameTimes (e.g. "Mar-22-2026") resolve to midnight, which is less accurate
   than settledDate (which defaults to 8 PM). Prefer settledDate over date-only gameTimes. */
function gameTimeHasTime(gt) {
  if (!gt) return false;
  var s = String(gt);
  return /\d{1,2}:\d{2}\s*(AM|PM)/i.test(s) || /T\d{2}:\d{2}/.test(s);
}
function getBetSortTime(b) {
  if (b.expectedEndTime) { var t = new Date(b.expectedEndTime).getTime(); if (t > 0) return t; }
  var espn = lookupEspnEndTime(b);
  if (espn > 0) return espn;
  /* Only use gameTime if it has an actual time component (not just a date) */
  if (b.gameTime && gameTimeHasTime(b.gameTime)) {
    var gt = parseGameDate(b.gameTime); if (gt > 0) return gt;
  }
  /* settledDate for real bets (not corrupt imports whose settledDate = today's import time) */
  if (b.settledDate && !isGenericPick(b.pick)) {
    var sd = parseGameDate(b.settledDate);
    if (sd > 0) return sd;
  }
  /* Fall back to date-only gameTime (better than 0) */
  if (b.gameTime) {
    var gtFallback = parseGameDate(b.gameTime); if (gtFallback > 0) return gtFallback;
  }
  return 0;
}
/* Stable sort comparator: sort by getBetSortTime descending,
   break ties with txId descending (higher txId = more recent transaction) */
function compareBetsByTime(a, b) {
  var diff = getBetSortTime(b) - getBetSortTime(a);
  if (diff !== 0) return diff;
  /* Tiebreaker 1: numeric txId (transaction ID from sportsbook, sequential) */
  var txA = parseInt(a.txId || '0', 10) || 0;
  var txB = parseInt(b.txId || '0', 10) || 0;
  if (txA !== txB) return txB - txA;
  /* Tiebreaker 2: addedDate descending */
  var adDiff = (parseGameDate(b.addedDate) || 0) - (parseGameDate(a.addedDate) || 0);
  if (adDiff !== 0) return adDiff;
  /* Tiebreaker 3: string ID comparison for absolute stability */
  var idA = a.id || ''; var idB = b.id || '';
  return idA < idB ? -1 : idA > idB ? 1 : 0;
}
function getGameGroupKey(bet) {
  var isMulti = bet.type === 'parlay' || /parlay/i.test(bet.matchup || '');
  if (isMulti) return 'parlay_' + bet.id;
  /* Date key from gameTime — used as a tiebreaker so different-day games of same teams don't merge */
  var dateKey = '';
  if (bet.gameTime) {
    var dm = String(bet.gameTime).match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (dm) dateKey = dm[1] + '/' + dm[2];
  }
  /* Pick the best available matchup string, preferring ESPN which uses canonical short names */
  var matchupStr = '';
  if (bet.espnMatchup && /\bvs\b/i.test(bet.espnMatchup)) {
    matchupStr = bet.espnMatchup;
  } else if (bet.matchup && /\bvs\b/i.test(bet.matchup)) {
    var mu = bet.matchup;
    if (/\bopponent\b|\btbd\b|\btba\b/i.test(mu)) {
      mu = mu.replace(/\s+vs\.?\s+(?:opponent|tbd|tba)\b.*/i, '').trim();
    }
    if (/\bvs\b/i.test(mu)) matchupStr = mu;
  }
  if (matchupStr) {
    /* Normalize each team: strip mascots and bet-type suffixes, then sort alphabetically.
       Sorting ensures "Vanderbilt vs Nebraska" and "Nebraska vs Vanderbilt" map to the same key,
       and "Vanderbilt Commodores vs Nebraska Cornhuskers" also maps to the same key. */
    var teams = matchupStr.split(/\s+vs\.?\s+/i).map(normalizeTeamKeyForGrouping).filter(Boolean);
    teams.sort();
    return teams.join('|') + '|' + dateKey;
  }
  /* Fall back to normalized pick text */
  return normalizePickForDedup(bet.pick) + '|' + dateKey;
}

/* ===== STANDARD BET PROCESSING PIPELINE =====
   Call this after EVERY bet add or settle — never call saveData()/renderAll() directly
   in bet-mutation paths. This ensures nothing gets missed:
     1. ESPN enrichment  — looks up opponent/matchup for any bet missing it
     2. Sort store.bets  — most-recent game at top, using getBetSortTime()
     3. Save to storage  — persist updated data
     4. Full re-render   — refresh dashboard, charts, open bets, settled bets
     5. Re-render again  — after async ESPN enrichment completes with new matchup data */
function runBetPipeline(newlyAddedBets) {
  /* Step 1: ESPN enrichment for bets that have a team name but no matchup yet */
  var toEnrich = (newlyAddedBets || []).filter(function(b) {
    return !b.espnMatchup && b.type !== 'parlay' && !isGenericPick(b.pick);
  });
  /* Step 2: Sort store.bets descending by game time (most recent first) */
  store.bets.sort(compareBetsByTime);
  /* Invalidate stats cache before rendering */
  invalidateStats();
  /* Step 3+4: Save and render immediately */
  saveData();
  renderAll();
  /* Step 5: After async ESPN enrichment, re-sort, re-save, re-render */
  if (toEnrich.length > 0) {
    enrichNewBets(toEnrich, function(count) {
      if (count > 0) {
        store.bets.sort(compareBetsByTime);
        saveData();
        renderAll();
      }
    });
  }
  /* Step 6: If a new open bet was just added, ensure live-score polling is running */
  var hasNewOpen = (newlyAddedBets || []).some(function(b) { return !b.settled; });
  if (hasNewOpen && typeof startLivePolling === 'function') startLivePolling();
}

/* ===== TEAM EXTRACTION FOR GROUP LABELS =====
   Used by the "[Team] multiple" summary row when a game-group has >1 bet. */
var _MASCOT_SINGLETON_RE = /^(?:Lakers|Celtics|Warriors|Nets|Knicks|Bucks|76ers|Sixers|Suns|Heat|Bulls|Mavericks|Mavs|Nuggets|Clippers|Hawks|Grizzlies|Cavaliers|Cavs|Timberwolves|Wolves|Pelicans|Raptors|Pacers|Kings|Magic|Wizards|Hornets|Blazers|Pistons|Rockets|Thunder|Spurs|Jazz|Chiefs|Eagles|Bills|Cowboys|49ers|Niners|Ravens|Bengals|Dolphins|Lions|Chargers|Jaguars|Jets|Bears|Packers|Vikings|Steelers|Rams|Seahawks|Commanders|Saints|Broncos|Texans|Falcons|Browns|Colts|Cardinals|Raiders|Titans|Giants|Panthers|Buccaneers|Bucs|Patriots)$/i;
function extractTeamFromBet(b) {
  var pick = cleanPickString(b.pick || '');
  if (!pick) return '';
  /* Totals bets ("Over 48.5", "Under 220") aren't a team — skip */
  if (/^(?:over|under|o|u)\s+\d/i.test(pick)) return '';
  var team = pick
    .replace(/\s*[+-]\d[\d.½¼¾]*\s*\(.*$/, '')   /* spread + trailing parens */
    .replace(/\s*[+-]\d[\d.½¼¾]*\s*$/, '')        /* spread only */
    .replace(/\s+(?:ML|ATS|1H|2H|1Q|2Q|3Q|4Q)\s*$/i, '')
    .replace(/\s+\([^)]*\)\s*$/, '')
    .trim();
  /* Prefer the mascot when it's a recognizable league mascot
     ("Minnesota Timberwolves" → "Timberwolves") */
  var parts = team.split(/\s+/);
  if (parts.length >= 2) {
    var last = parts[parts.length - 1];
    if (_MASCOT_SINGLETON_RE.test(last)) return last;
  }
  return team;
}
function getPrimaryTeamForGroup(grp) {
  var counts = {}, first = '';
  for (var i = 0; i < grp.length; i++) {
    var t = extractTeamFromBet(grp[i]);
    if (!t) continue;
    if (!first) first = t;
    counts[t] = (counts[t] || 0) + 1;
  }
  var best = first, bestCount = 0;
  for (var k in counts) {
    if (counts[k] > bestCount) { bestCount = counts[k]; best = k; }
  }
  if (best) return best;
  /* Fall back to first team in the matchup */
  for (var i = 0; i < grp.length; i++) {
    var mu = grp[i].espnMatchup || grp[i].matchup;
    if (mu && /\bvs\b/i.test(mu)) {
      var p = shortenMatchupDisplay(mu).split(/\s+vs\.?\s+/i);
      if (p[0]) return p[0].trim();
    }
  }
  return 'Game';
}

/* Build the inner HTML for one bet card. Extracted so single-bet and
   multi-bet group renders share the same per-card template. */
function renderBetCardInner(b) {
  var pnl = b.result === 'W' ? '+' + fmtMoney(b.toWin) : b.result === 'L' ? '-' + fmtMoney(b.stake) : 'Push';
  var isMulti = b.type === 'parlay' || /parlay/i.test(b.matchup || '');
  var borderColor = b.result === 'W' ? 'var(--green)' : b.result === 'L' ? 'var(--red)' : 'var(--amber)';
  var html = '';
  html += '<div class="bet-card" id="card-' + b.id + '" style="border:none;border-bottom:1px solid var(--border);border-radius:0;margin:0;border-left:3px solid ' + borderColor + '">';
  var slipTxId = b.txId || b.id;
  html += '<div class="bet-card-summary" onclick="openBetSlip(\'' + slipTxId + '\')" style="padding:6px 12px">';
  var cardTopLine = '';
  if (isMulti) {
    var rawLegs = b.pick || '';
    if (rawLegs && !/^Parlay$/i.test(rawLegs) && /\+/.test(rawLegs)) {
      var legs = rawLegs.split(/\s+\+\s+/);
      var cleanLegs = legs.map(function(leg) { return cleanPickString(leg); }).filter(Boolean);
      cardTopLine = escHtml(cleanLegs.join(' + '));
    } else {
      cardTopLine = escHtml(b.matchup || 'Parlay');
    }
  } else {
    cardTopLine = displayPickForCard(b);
  }
  html += '<span class="matchup-line" style="font-size:0.88em">' + cardTopLine + '</span>';
  html += '<span class="bet-row">';
  html += '<span class="stake-short">' + fmtMoney(b.stake) + ' @ ' + fmtOdds(b.odds) + '</span>';
  html += '<span class="result-badge ' + b.result + '">' + b.result + ' ' + pnl + '</span>';
  if (b.autoSettled) html += '<span style="font-size:0.55rem;color:var(--text3);margin-left:4px" title="Auto-settled from ESPN scores">AUTO</span>';
  var betClv = calcCLV(b);
  if (betClv !== null) html += '<span class="clv-tag ' + clvClass(betClv) + '" title="Closing Line Value">' + clvLabel(betClv) + '</span>';
  html += '</span>';
  html += '<span class="chevron" onclick="event.stopPropagation();toggleCard(\'' + b.id + '\')" title="Settle / Delete">&#9660;</span>';
  html += '</div>';
  html += '<div class="bet-card-details">';
  html += '<div class="detail-row"><span>Pick</span><strong>' + displayPickForCard(b) + '</strong></div>';
  html += '<div class="detail-row"><span>Odds</span><strong>' + fmtOdds(b.odds) + '</strong></div>';
  html += '<div class="detail-row"><span>Risk</span><strong>' + fmtMoney(b.stake) + '</strong></div>';
  html += '<div class="detail-row"><span>P/L</span><strong style="color:' + (b.result === 'W' ? 'var(--green)' : b.result === 'L' ? 'var(--red)' : 'var(--amber)') + '">' + pnl + '</strong></div>';
  if (b.closingOdds !== undefined && b.closingOdds !== null) {
    var betClvDetail = calcCLV(b);
    html += '<div class="detail-row"><span>Closing Line</span><strong>' + fmtOdds(b.closingOdds) + ' (You got ' + fmtOdds(b.odds) + ')</strong></div>';
    if (betClvDetail !== null) html += '<div class="detail-row"><span>CLV</span><strong class="' + (betClvDetail >= 0 ? 'edge-positive' : 'edge-negative') + '">' + (betClvDetail >= 0 ? '+' : '') + betClvDetail.toFixed(1) + '%</strong></div>';
  }
  html += '<div class="actions">';
  html += '<button class="btn-win" onclick="event.stopPropagation();resettleBet(\'' + b.id + '\',\'W\')">Win</button>';
  html += '<button class="btn-loss" onclick="event.stopPropagation();resettleBet(\'' + b.id + '\',\'L\')">Loss</button>';
  html += '<button class="btn-push" onclick="event.stopPropagation();resettleBet(\'' + b.id + '\',\'P\')">Push</button>';
  html += '<button class="btn-edit" onclick="event.stopPropagation();editBet(\'' + b.id + '\')" title="Manually edit fields">Edit</button>';
  html += '<button class="btn-void" onclick="event.stopPropagation();deleteBet(\'' + b.id + '\')">Del</button>';
  html += '</div>';
  html += '</div></div>';
  return html;
}

function renderSettledBets() {
  /* filteredSettledBets: settled store.bets (no futures), already chart-filtered.
     .slice() so the in-place sort below doesn't corrupt the cache. */
  var settled = getCachedFiltered().filteredSettledBets.slice();
  if (store.settledFilter !== 'all') {
    settled = settled.filter(function(b) { return b.result === store.settledFilter; });
  }
  /* SORT: most-recent game at top. Pre-sort before grouping so group insertion order
     is already correct, and the explicit groupOrder.sort below is belt-and-suspenders. */
  settled.sort(compareBetsByTime);

  var countEl = document.getElementById('settledCount');
  if (countEl) countEl.textContent = settled.length;
  var el = document.getElementById('settledBetsList');
  if (!el) return;

  if (settled.length === 0) {
    el.innerHTML = '<div class="empty-state">No settled bets yet. Paste a Bovada or BetOnline slip to get started!</div>';
    return;
  }

  /* Group bets by game */
  var groupOrder = [];
  var groupMap = {};
  for (var i = 0; i < settled.length; i++) {
    var key = getGameGroupKey(settled[i]);
    if (!groupMap[key]) {
      groupMap[key] = [];
      groupOrder.push(key);
    }
    groupMap[key].push(settled[i]);
  }

  /* Sort groups: most-recent game at top. Uses getBetSortTime() with txId tiebreaker
     so groups from the same date maintain stable, consistent ordering. */
  groupOrder.sort(function(ka, kb) {
    var ga = groupMap[ka], gb = groupMap[kb];
    var bestA = 0, bestB = 0;
    var bestTxA = 0, bestTxB = 0;
    for (var i = 0; i < ga.length; i++) {
      var t = getBetSortTime(ga[i]); if (t > bestA) bestA = t;
      var tx = parseInt(ga[i].txId || ga[i].id || '0', 10) || 0; if (tx > bestTxA) bestTxA = tx;
    }
    for (var i = 0; i < gb.length; i++) {
      var t = getBetSortTime(gb[i]); if (t > bestB) bestB = t;
      var tx = parseInt(gb[i].txId || gb[i].id || '0', 10) || 0; if (tx > bestTxB) bestTxB = tx;
    }
    var diff = bestB - bestA;
    if (diff !== 0) return diff;
    return bestTxB - bestTxA;
  });

  var html = '';
  for (var gi = 0; gi < groupOrder.length; gi++) {
    var grp = groupMap[groupOrder[gi]];
    var isMultiGroup = grp.length === 1 && (grp[0].type === 'parlay' || /parlay/i.test(grp[0].matchup || ''));
    var isSingleBetGroup = grp.length === 1;

    /* Compute group-level stats */
    var groupPL = 0, groupRisk = 0, groupWins = 0, groupLosses = 0;
    for (var j = 0; j < grp.length; j++) {
      groupRisk += grp[j].stake;
      if (grp[j].result === 'W') { groupPL += grp[j].toWin; groupWins++; }
      else if (grp[j].result === 'L') { groupPL -= grp[j].stake; groupLosses++; }
    }

    /* Get game header info — search ALL bets in group for best matchup */
    var firstBet = grp[0];
    var gameName = '';
    if (isMultiGroup) {
      gameName = firstBet.matchup || 'Parlay';
    } else {
      /* Search all bets in group for a valid ESPN matchup with both teams */
      for (var mi = 0; mi < grp.length; mi++) {
        if (grp[mi].espnMatchup && /\bvs\b/i.test(grp[mi].espnMatchup)) {
          gameName = shortenMatchupDisplay(grp[mi].espnMatchup);
          break;
        }
      }
      /* If no ESPN matchup, search all bets for a clean matchup field */
      if (!gameName) {
        for (var mi = 0; mi < grp.length; mi++) {
          if (grp[mi].matchup && /\bvs\b/i.test(grp[mi].matchup) && !/\bopponent\b|\btbd\b|\btba\b/i.test(grp[mi].matchup)) {
            gameName = shortenMatchupDisplay(grp[mi].matchup);
            break;
          }
        }
      }
      /* Still nothing — extract team from pick */
      if (!gameName && !isGenericPick(firstBet.pick)) {
        gameName = firstBet.pick.replace(/\s*[+-][\d.½¼¾]+.*$/, '').replace(/\s*\(.*$/, '').trim();
        gameName = gameName.replace(/\s+vs\.?\s+(?:opponent|tbd|tba)\b.*/i, '').trim();
        gameName = gameName.replace(/\s+(?:ML|ATS|1H|2H)\s*$/i, '').trim();
        gameName = shortenMatchupDisplay(gameName);
        if (!gameName && firstBet.matchup && !/\bvs\b/i.test(firstBet.matchup)) {
          gameName = firstBet.matchup;
        }
        if (!gameName) gameName = firstBet.sport || 'Game';
      }
      /* Fallback: sport + date */
      if (!gameName) {
        gameName = (firstBet.sport || 'Bet') + (gameDate ? ' \u2014 ' + gameDate : '');
      }
    }

    /* Prefer ESPN scheduledStart (actual tip-off) over the flat default gameTime.
       Search all bets in group since any one might have been enriched. */
    var bestGameTime = '';
    for (var ti = 0; ti < grp.length; ti++) {
      if (grp[ti].scheduledStart) { bestGameTime = grp[ti].scheduledStart; break; }
    }
    if (!bestGameTime) {
      for (var ti = 0; ti < grp.length; ti++) {
        if (grp[ti].gameTime && gameTimeHasTime(grp[ti].gameTime)) { bestGameTime = grp[ti].gameTime; break; }
      }
    }
    if (!bestGameTime) bestGameTime = firstBet.gameTime || firstBet.settledDate;
    var gameDate = fmtDate(bestGameTime);
    var sc = sportClass(firstBet.sport);
    var plClass = groupPL >= 0 ? 'var(--green)' : 'var(--red)';
    var plStr = (groupPL >= 0 ? '+' : '-') + fmtMoney(Math.abs(groupPL));

    /* Game group container */
    html += '<div class="game-group" style="margin-bottom:8px;border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;background:var(--surface)">';

    /* Game header */
    html += '<div style="padding:8px 12px;display:flex;align-items:center;justify-content:space-between;background:var(--surface2);border-bottom:1px solid var(--border)">';
    html += '<div>';
    html += '<span style="font-weight:700;font-size:0.9em;text-transform:uppercase">' + escHtml(gameName) + '</span>';
    if (gameDate) html += '<span style="font-size:0.75em;color:var(--text3);margin-left:8px">' + gameDate + '</span>';
    /* Show ESPN final score if available */
    var espnScore = '';
    for (var ej = 0; ej < grp.length; ej++) {
      if (grp[ej].espnScore) { espnScore = grp[ej].espnScore; break; }
    }
    if (espnScore) html += '<span style="font-size:0.7em;color:var(--text2);margin-left:8px">' + escHtml(espnScore) + '</span>';
    html += '</div>';
    html += '<div style="display:flex;align-items:center;gap:8px">';
    html += '<span class="sport-tag ' + sc + '" style="font-size:0.7em">' + escHtml(firstBet.sport || '?') + '</span>';
    if (!isSingleBetGroup) html += '<span style="font-size:0.78em;color:var(--text3)">' + grp.length + ' bets</span>';
    html += '<span style="font-size:0.85em;font-weight:600;color:' + plClass + '">' + plStr + '</span>';
    html += '</div>';
    html += '</div>';

    /* Individual bets in the group */
    var grpId = 'grp_' + gi;

    if (grp.length === 1) {
      /* SINGLE-BET GROUP — render the one bet's card directly */
      html += renderBetCardInner(grp[0]);
    } else {
      /* MULTI-BET GROUP — collapse into one "[Team] multiple" row per result.
         All-wins or all-losses → single row. Mixed → split rows. */
      var teamLabel = getPrimaryTeamForGroup(grp);
      var byResult = { W: [], L: [], P: [], pending: [] };
      for (var j = 0; j < grp.length; j++) {
        var rr = grp[j].result;
        if (rr === 'W' || rr === 'L' || rr === 'P') byResult[rr].push(grp[j]);
        else byResult.pending.push(grp[j]);
      }
      var RESULT_ORDER = ['W', 'L', 'P', 'pending'];
      for (var ri = 0; ri < RESULT_ORDER.length; ri++) {
        var res = RESULT_ORDER[ri];
        var bets = byResult[res];
        if (!bets.length) continue;

        var subStake = 0, subPL = 0;
        for (var bi = 0; bi < bets.length; bi++) {
          subStake += bets[bi].stake || 0;
          if (bets[bi].result === 'W') subPL += bets[bi].toWin || 0;
          else if (bets[bi].result === 'L') subPL -= bets[bi].stake || 0;
        }
        var rowId = grpId + '_' + res;
        var pnlStr = subPL >= 0 ? '+' + fmtMoney(subPL) : '-' + fmtMoney(Math.abs(subPL));
        var resBadgeText, resBadgeClass, rowBorder;
        if (res === 'W') { resBadgeText = bets.length + 'W ' + pnlStr; resBadgeClass = 'W'; rowBorder = 'var(--green)'; }
        else if (res === 'L') { resBadgeText = bets.length + 'L ' + pnlStr; resBadgeClass = 'L'; rowBorder = 'var(--red)'; }
        else if (res === 'P') { resBadgeText = bets.length + 'P'; resBadgeClass = 'P'; rowBorder = 'var(--amber)'; }
        else { resBadgeText = bets.length + ' Pending'; resBadgeClass = 'P'; rowBorder = 'var(--text3)'; }

        /* Clickable summary row — toggles the inner card list */
        html += '<div class="bet-card" style="border:none;border-bottom:1px solid var(--border);border-radius:0;margin:0;border-left:3px solid ' + rowBorder + '">';
        html += '<div class="bet-card-summary" onclick="toggleResultRow(\'' + rowId + '\')" style="padding:6px 12px;cursor:pointer">';
        html += '<span class="matchup-line" style="font-size:0.88em">' + escHtml(teamLabel) + ' <span style="color:var(--text3);font-weight:500">multiple</span></span>';
        html += '<span class="bet-row">';
        html += '<span class="stake-short">' + fmtMoney(subStake) + ' total</span>';
        html += '<span class="result-badge ' + resBadgeClass + '">' + escHtml(resBadgeText) + '</span>';
        html += '</span>';
        html += '<span class="chevron" id="' + rowId + '_arrow" data-open="0">&#9654;</span>';
        html += '</div>';
        html += '</div>';

        /* Collapsed wrapper — individual bet cards inside this result group */
        html += '<div id="' + rowId + '_more" style="display:none">';
        for (var bi2 = 0; bi2 < bets.length; bi2++) {
          html += renderBetCardInner(bets[bi2]);
        }
        html += '</div>';
      }
    }

    html += '</div>'; /* close game-group */
  }
  el.innerHTML = html;
}

function setFilter(f) {
  store.settledFilter = f;
  var btns = document.querySelectorAll('.filter-btn');
  for (var i = 0; i < btns.length; i++) {
    var isActive = (f === 'all' && btns[i].textContent.trim() === 'All') ||
                   (f === 'W' && btns[i].textContent.trim() === 'Wins') ||
                   (f === 'L' && btns[i].textContent.trim() === 'Losses') ||
                   (f === 'P' && btns[i].textContent.trim() === 'Pushes');
    if (isActive) btns[i].classList.add('active');
    else btns[i].classList.remove('active');
  }
  renderSettledBets();
}

/* ===== RENDER: FUTURES ===== */
/* Fuzzy lookup: match a pick string against cached odds by team name overlap */
function lookupCurrentOdds(pick) {
  if (!pick) return null;
  var p = pick.toLowerCase();
  /* Exact match first */
  if (cachedFuturesOdds[p]) return cachedFuturesOdds[p];
  /* Substring match — check each cached key */
  var keys = Object.keys(cachedFuturesOdds);
  var best = null;
  var bestLen = 0;
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (p.indexOf(k) !== -1 || k.indexOf(p) !== -1) {
      if (k.length > bestLen) { best = cachedFuturesOdds[k]; bestLen = k.length; }
      continue;
    }
    /* Word-level match: any significant word in key found in pick */
    var words = k.split(' ');
    for (var j = 0; j < words.length; j++) {
      if (words[j].length > 4 && p.indexOf(words[j]) !== -1) {
        if (k.length > bestLen) { best = cachedFuturesOdds[k]; bestLen = k.length; }
        break;
      }
    }
  }
  return best;
}

function renderFutures() {
  var el = document.getElementById('futuresList');
  if (!el) return;
  if (store.futures.length === 0) {
    el.innerHTML = '<div class="empty-state">No futures bets yet. Use the chatbot with keywords like "future" to add one!</div>';
    return;
  }
  var staleMap = window.__btStaleFutures || {};
  var isStale = function(b){
    return !!(staleMap[String(b.id || '')] || staleMap[String(b.txId || '')]);
  };
  /* Surface stale (event-ended) futures to the top so they can't be missed */
  var openStale  = store.futures.filter(function(b){return !b.settled &&  isStale(b);});
  var openActive = store.futures.filter(function(b){return !b.settled && !isStale(b);});
  var settled    = store.futures.filter(function(b){return b.settled;});
  var all = openStale.concat(openActive).concat(settled);
  var html = '';
  var renderedFirstSettled = false;
  for (var i = 0; i < all.length; i++) {
    var b = all[i];
    var sc = sportClass(b.sport);
    var liveInfo = lookupCurrentOdds(b.pick);
    var history = lookupOddsHistory(b.pick);
    var staleInfo = staleMap[String(b.id || '')] || staleMap[String(b.txId || '')] || null;
    var staleClass = (staleInfo && !b.settled) ? ' stale' : '';
    var settledClass = b.settled ? ' settled' : '';

    /* Insert a quiet subsection header before the first settled future */
    if (b.settled && !renderedFirstSettled) {
      renderedFirstSettled = true;
      html += '<div class="futures-section-divider" style="grid-column:1/-1;font-size:var(--fs-xs);text-transform:uppercase;letter-spacing:1px;color:var(--text3);font-weight:700;margin:8px 0 -4px;padding:8px 0 0;border-top:1px solid var(--border)">Settled Futures</div>';
    }

    html += '<div class="future-card' + staleClass + settledClass + '">';
    if (staleInfo && !b.settled) {
      html += '<div class="stale-banner">⚠ EVENT ENDED ' + staleInfo.daysPast + 'd AGO — needs settling';
      if (staleInfo.eventEndDate) html += ' <span class="stale-ended">(' + staleInfo.eventEndDate + ')</span>';
      html += '</div>';
    }

    /* ── Top-right live odds badge ── */
    if (liveInfo && !b.settled) {
      var moveClass = 'neutral';
      if (liveInfo.odds < b.odds) moveClass = 'favorable';
      else if (liveInfo.odds > b.odds) moveClass = 'unfavorable';
      var diff = liveInfo.odds - b.odds;
      var diffStr = (diff > 0 ? '+' : '') + diff;
      html += '<div class="live-odds-badge">';
      html += '<div class="live-val ' + moveClass + '">' + fmtOdds(liveInfo.odds) + '</div>';
      if (diff !== 0) html += '<div class="live-move ' + moveClass + '">' + diffStr + '</div>';
      if (liveInfo.bookmaker) html += '<div class="live-src">' + escHtml(liveInfo.bookmaker) + '</div>';
      html += '</div>';
    }

    html += '<span class="sport-tag ' + sc + '">' + escHtml(b.sport || 'Other') + '</span>';
    if (b.settled) html += '<span class="result-badge ' + b.result + '" style="margin-left:8px">' + b.result + '</span>';
    html += '<div class="pick">' + escHtml(b.pick) + '</div>';

    /* Placed odds + current odds row */
    if (liveInfo && !b.settled) {
      html += '<div class="odds-row">';
      html += '<span class="your-odds">Placed: ' + fmtOdds(b.odds) + '</span>';
      /* Implied probability */
      var impliedPct = liveInfo.odds < 0
        ? (Math.abs(liveInfo.odds) / (Math.abs(liveInfo.odds) + 100) * 100).toFixed(1)
        : (100 / (liveInfo.odds + 100) * 100).toFixed(1);
      html += '<span class="your-odds" style="margin-left:auto">' + impliedPct + '% implied</span>';
      html += '</div>';
      html += '<div class="odds-source">Current odds via ' + escHtml(liveInfo.bookmaker || 'The Odds API') + '</div>';
    } else {
      html += '<div class="odds">' + fmtOdds(b.odds) + '</div>';
    }

    html += '<div class="meta">Risk: ' + fmtMoney(b.stake) + ' | To Win: ' + fmtMoney(b.toWin) + '</div>';

    /* ── Line movement sparkline ── */
    if (!b.settled && history && history.length >= 2) {
      html += buildSparkline(history, b.odds);
    }

    if (!b.settled) {
      html += '<div class="actions">';
      html += '<button class="btn-win" onclick="settleFuture(\'' + b.id + '\',\'W\')">Win</button>';
      html += '<button class="btn-loss" onclick="settleFuture(\'' + b.id + '\',\'L\')">Loss</button>';
      html += '<button class="btn-void" onclick="deleteBet(\'' + b.id + '\')">Del</button>';
      html += '</div>';
    }
    html += '</div>';
  }
  el.innerHTML = html;
}

/* ===== CHARTS ===== */
var chartDefaults = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { labels: { color: '#8899a6', font: { family: 'Inter', size: 11 } } } },
  scales: {
    x: { offset: true, ticks: { color: '#556677', font: { size: 10 } }, grid: { color: 'rgba(36,48,64,0.5)' } },
    y: { ticks: { color: '#556677', font: { size: 10 } }, grid: { color: 'rgba(36,48,64,0.5)' } }
  }
};

function renderROIChart() {
  var ctx = document.getElementById('roiChart');
  if (!ctx) return;
  var settled = getCachedFiltered().sortedSettled;
  var labels = ['Start'], data = [0], cumStake = 0, cumProfit = 0;
  for (var i = 0; i < settled.length; i++) {
    var b = settled[i];
    cumStake += b.stake;
    if (b.result === 'W') cumProfit += b.toWin;
    else if (b.result === 'L') cumProfit -= b.stake;
    labels.push('Bet ' + (i + 1));
    data.push(cumStake > 0 ? +((cumProfit / cumStake) * 100).toFixed(1) : 0);
  }
  /* Dynamic title */
  var finalROI = data[data.length - 1] || 0;
  var titleEl = document.getElementById('roiChartTitle');
  if (titleEl) {
    var titleText = settled.length < 20 ? 'ROI trend (' + settled.length + ' bets, needs 20+ for reliability)' :
      (finalROI >= 0 ? 'You are +' + finalROI + '% ROI over ' + settled.length + ' bets' : 'You are ' + finalROI + '% ROI over ' + settled.length + ' bets');
    titleEl.textContent = titleText;
  }
  /* Zero reference line plugin */
  var zeroLinePlugin = {
    id: 'zeroLine',
    afterDraw: function(chart) {
      var yScale = chart.scales.y;
      if (!yScale) return;
      var yPixel = yScale.getPixelForValue(0);
      if (yPixel < yScale.top || yPixel > yScale.bottom) return;
      var ctx2 = chart.ctx;
      ctx2.save();
      ctx2.beginPath();
      ctx2.setLineDash([4, 4]);
      ctx2.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx2.lineWidth = 1;
      ctx2.moveTo(chart.chartArea.left, yPixel);
      ctx2.lineTo(chart.chartArea.right, yPixel);
      ctx2.stroke();
      ctx2.restore();
    }
  };
  var lineColor = finalROI >= 0 ? '#00d084' : '#ff4757';
  var fillColor = finalROI >= 0 ? 'rgba(0,208,132,0.1)' : 'rgba(255,71,87,0.1)';
  if (charts.roi) {
    charts.roi.data.labels = labels;
    charts.roi.data.datasets[0].data = data;
    charts.roi.data.datasets[0].borderColor = lineColor;
    charts.roi.data.datasets[0].backgroundColor = fillColor;
    charts.roi.update();
  } else {
    charts.roi = new Chart(ctx, { type:'line', data:{ labels:labels, datasets:[{ label:'ROI %', data:data, borderColor:lineColor, backgroundColor:fillColor, fill:true, tension:0.3, pointRadius:2 }] }, options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false} }, scales:chartDefaults.scales }, plugins:[zeroLinePlugin] });
  }
}

function renderBankrollChart() {
  var ctx = document.getElementById('bankrollChart');
  if (!ctx) return;
  var settled = getCachedFiltered().sortedSettled;
  var labels = ['Start'], data = [0], cum = 0;
  for (var i = 0; i < settled.length; i++) {
    if (settled[i].result === 'W') cum += settled[i].toWin;
    else if (settled[i].result === 'L') cum -= settled[i].stake;
    labels.push('Bet ' + (i + 1));
    data.push(+cum.toFixed(2));
  }
  /* Dynamic title */
  var titleEl = document.getElementById('bankrollChartTitle');
  if (titleEl) titleEl.textContent = (cum >= 0 ? 'Up +' : 'Down ') + fmtMoney(cum) + ' cumulative P/L';
  var clr = cum >= 0 ? '#00d084' : '#ff4757';
  var bgClr = clr === '#00d084' ? 'rgba(0,208,132,0.1)' : 'rgba(255,71,87,0.1)';
  var zeroLinePlugin = { id:'zeroLine2', afterDraw:function(chart){ var yScale=chart.scales.y;if(!yScale)return;var yPx=yScale.getPixelForValue(0);if(yPx<yScale.top||yPx>yScale.bottom)return;var c=chart.ctx;c.save();c.beginPath();c.setLineDash([4,4]);c.strokeStyle='rgba(255,255,255,0.25)';c.lineWidth=1;c.moveTo(chart.chartArea.left,yPx);c.lineTo(chart.chartArea.right,yPx);c.stroke();c.restore(); } };
  if (charts.bankroll) {
    charts.bankroll.data.labels = labels;
    charts.bankroll.data.datasets[0].data = data;
    charts.bankroll.data.datasets[0].borderColor = clr;
    charts.bankroll.data.datasets[0].backgroundColor = bgClr;
    charts.bankroll.update();
  } else {
    charts.bankroll = new Chart(ctx, { type:'line', data:{ labels:labels, datasets:[{ label:'Bankroll $', data:data, borderColor:clr, backgroundColor:bgClr, fill:true, tension:0.3, pointRadius:2 }] }, options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false} }, scales:chartDefaults.scales }, plugins:[zeroLinePlugin] });
  }
}

function renderWLChart() {
  var ctx = document.getElementById('wlChart');
  if (!ctx) return;
  var settled = getCachedFiltered().sortedSettled;
  var labels = ['Start'], wData = [0], lData = [0], cumW = 0, cumL = 0;
  for (var i = 0; i < settled.length; i++) {
    if (settled[i].result === 'W') cumW++;
    else if (settled[i].result === 'L') cumL++;
    labels.push('Bet ' + (i + 1));
    wData.push(cumW);
    lData.push(cumL);
  }
  /* Dynamic title */
  var titleEl = document.getElementById('wlChartTitle');
  if (titleEl) titleEl.textContent = cumW + ' wins, ' + cumL + ' losses (' + (cumW+cumL > 0 ? (cumW/(cumW+cumL)*100).toFixed(0) : 0) + '% win rate)';
  if (charts.wl) {
    charts.wl.data.labels = labels;
    charts.wl.data.datasets[0].data = wData;
    charts.wl.data.datasets[1].data = lData;
    charts.wl.update();
  } else {
    charts.wl = new Chart(ctx, { type:'line', data:{ labels:labels, datasets:[
      { label:'Wins', data:wData, borderColor:'#00d084', backgroundColor:'rgba(0,208,132,0.05)', fill:false, tension:0.3, pointRadius:2 },
      { label:'Losses', data:lData, borderColor:'#ff4757', backgroundColor:'rgba(255,71,87,0.05)', fill:false, tension:0.3, pointRadius:2 }
    ] }, options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ labels:{ color:'#8899a6', font:{family:'Inter',size:10} } } }, scales:chartDefaults.scales } });
  }
}

function renderSportChart() {
  var ctx = document.getElementById('sportChart');
  if (!ctx) return;
  var settled = getCachedFiltered().filteredSettled;
  var sportMap = {};
  for (var i = 0; i < settled.length; i++) {
    var b = settled[i], s = b.sport || 'Other';
    if (!sportMap[s]) sportMap[s] = { pl: 0, count: 0 };
    sportMap[s].count++;
    if (b.result === 'W') sportMap[s].pl += b.toWin;
    else if (b.result === 'L') sportMap[s].pl -= b.stake;
  }
  /* Sort by P/L descending so best sport shows first */
  var sorted = Object.keys(sportMap).sort(function(a, b) { return sportMap[b].pl - sportMap[a].pl; });
  var labels = [], data = [], colors = [];
  if (sorted.length === 0) { labels = ['No data']; data = [0]; colors = ['#243040']; }
  else {
    for (var i = 0; i < sorted.length; i++) {
      var s = sorted[i];
      var pl = +sportMap[s].pl.toFixed(2);
      var n = sportMap[s].count;
      labels.push(s + ' (' + n + ')');
      data.push(pl);
      colors.push(pl >= 0 ? '#00d084' : '#ff4757');
    }
  }
  /* Dynamic title */
  var titleEl = document.getElementById('sportChartTitle');
  if (titleEl && sorted.length > 0) {
    var best = sorted[0];
    titleEl.textContent = best + ' leads at ' + (sportMap[best].pl >= 0 ? '+' : '') + fmtMoney(sportMap[best].pl) + ' P/L';
  }
  var opts = JSON.parse(JSON.stringify(chartDefaults));
  opts.indexAxis = 'y';
  opts.plugins = { legend: { display: false } };
  var zeroLinePlugin = { id:'zeroLine3', afterDraw:function(chart){ var xScale=chart.scales.x;if(!xScale)return;var xPx=xScale.getPixelForValue(0);if(xPx<chart.chartArea.left||xPx>chart.chartArea.right)return;var c=chart.ctx;c.save();c.beginPath();c.setLineDash([4,4]);c.strokeStyle='rgba(255,255,255,0.25)';c.lineWidth=1;c.moveTo(xPx,chart.chartArea.top);c.lineTo(xPx,chart.chartArea.bottom);c.stroke();c.restore(); } };
  if (charts.sport) {
    charts.sport.data.labels = labels;
    charts.sport.data.datasets[0].data = data;
    charts.sport.data.datasets[0].backgroundColor = colors;
    charts.sport.update();
  } else {
    charts.sport = new Chart(ctx, { type:'bar', data:{ labels:labels, datasets:[{ data:data, backgroundColor:colors, borderRadius:4, barPercentage:0.7, categoryPercentage:0.8 }] }, options:opts, plugins:[zeroLinePlugin] });
  }
}

function renderCumPLChart() {
  var ctx = document.getElementById('cumPLChart');
  if (!ctx) return;
  var settled = getCachedFiltered().sortedSettled;
  var cum = 0, labels = ['Start'], data = [0];
  for (var i = 0; i < settled.length; i++) {
    if (settled[i].result === 'W') cum += settled[i].toWin;
    else if (settled[i].result === 'L') cum -= settled[i].stake;
    labels.push('Bet ' + (i + 1));
    data.push(+cum.toFixed(2));
  }
  var titleEl = document.getElementById('cumPLTitle');
  if (titleEl) titleEl.textContent = (cum >= 0 ? 'Up ' : 'Down ') + (cum >= 0 ? '+' : '') + fmtMoney(cum) + ' over ' + settled.length + ' bets';
  var clr = data[data.length-1] >= 0 ? '#00d084' : '#ff4757';
  var bgClr = clr === '#00d084' ? 'rgba(0,208,132,0.1)' : 'rgba(255,71,87,0.1)';
  if (charts.cumPL) {
    charts.cumPL.data.labels = labels;
    charts.cumPL.data.datasets[0].data = data;
    charts.cumPL.data.datasets[0].borderColor = clr;
    charts.cumPL.data.datasets[0].backgroundColor = bgClr;
    charts.cumPL.update('none');
  } else {
    var zeroP = { id:'zeroP', afterDraw:function(chart){ var yS=chart.scales.y;if(!yS)return;var yP=yS.getPixelForValue(0);if(yP<yS.top||yP>yS.bottom)return;var c=chart.ctx;c.save();c.beginPath();c.setLineDash([4,4]);c.strokeStyle='rgba(255,255,255,0.25)';c.lineWidth=1;c.moveTo(chart.chartArea.left,yP);c.lineTo(chart.chartArea.right,yP);c.stroke();c.restore(); } };
    charts.cumPL = new Chart(ctx, { type:'line', data:{ labels:labels, datasets:[{ label:'Cumulative P/L', data:data, borderColor:clr, backgroundColor:bgClr, fill:true, tension:0.3, pointRadius:2 }] }, options:chartDefaults, plugins:[zeroP] });
  }
}

function renderWinRateSportChart() {
  var ctx = document.getElementById('winRateSportChart');
  if (!ctx) return;
  var settled = getCachedFiltered().filteredSettled;
  var sportMap = {};
  for (var i = 0; i < settled.length; i++) {
    var s = settled[i].sport || 'Other';
    if (!sportMap[s]) sportMap[s] = { w:0, l:0 };
    if (settled[i].result === 'W') sportMap[s].w++;
    else if (settled[i].result === 'L') sportMap[s].l++;
    /* Pushes excluded from win rate denominator */
  }
  /* Sort by win rate descending */
  var sortedKeys = Object.keys(sportMap).sort(function(a,b){
    var dA = sportMap[a].w+sportMap[a].l, dB = sportMap[b].w+sportMap[b].l;
    var wrA = dA>0?sportMap[a].w/dA:0, wrB = dB>0?sportMap[b].w/dB:0;
    return wrB - wrA;
  });
  var labels = [], data = [], colors = [];
  for (var i = 0; i < sortedKeys.length; i++) {
    var s = sortedKeys[i];
    var decisioned = sportMap[s].w + sportMap[s].l;
    var wr = decisioned > 0 ? +((sportMap[s].w / decisioned) * 100).toFixed(1) : 0;
    /* Flag low sample size */
    labels.push(s + ' (' + sportMap[s].w + '-' + sportMap[s].l + ')' + (decisioned < 10 ? ' *' : ''));
    data.push(wr);
    colors.push(wr >= 50 ? '#00d084' : '#ff4757');
  }
  var titleEl = document.getElementById('winRateSportTitle');
  if (titleEl && sortedKeys.length > 0) {
    var topS = sortedKeys[0];
    var topDec = sportMap[topS].w + sportMap[topS].l;
    titleEl.textContent = topS + ' leads at ' + (topDec>0?(sportMap[topS].w/topDec*100).toFixed(0):0) + '% win rate';
    if (topDec < 10) titleEl.textContent += ' (small sample)';
  }
  if (charts.winRateSport) {
    charts.winRateSport.data.labels = labels;
    charts.winRateSport.data.datasets[0].data = data;
    charts.winRateSport.data.datasets[0].backgroundColor = colors;
    charts.winRateSport.update('none');
  } else {
    var opts = JSON.parse(JSON.stringify(chartDefaults));
    opts.plugins = { legend:{display:false} };
    opts.scales.y.max = 100;
    var breakEvenPlugin = { id:'breakEven', afterDraw:function(chart){ var yS=chart.scales.y;if(!yS)return;var yP=yS.getPixelForValue(50);if(yP<yS.top||yP>yS.bottom)return;var c=chart.ctx;c.save();c.beginPath();c.setLineDash([4,4]);c.strokeStyle='rgba(255,184,51,0.4)';c.lineWidth=1;c.moveTo(chart.chartArea.left,yP);c.lineTo(chart.chartArea.right,yP);c.stroke();c.fillStyle='rgba(255,184,51,0.6)';c.font='10px Inter';c.fillText('50%',chart.chartArea.left+4,yP-4);c.restore(); } };
    charts.winRateSport = new Chart(ctx, { type:'bar', data:{ labels:labels, datasets:[{ label:'Win %', data:data, backgroundColor:colors, borderRadius:4 }] }, options:opts, plugins:[breakEvenPlugin] });
  }
}

function renderBetSizeChart() {
  var ctx = document.getElementById('betSizeChart');
  if (!ctx) return;
  var all = getCachedFiltered().filteredAll;
  var buckets = { '$1-25':0, '$26-50':0, '$51-100':0, '$101-250':0, '$250+':0 };
  for (var i = 0; i < all.length; i++) {
    var s = all[i].stake;
    if (s <= 25) buckets['$1-25']++;
    else if (s <= 50) buckets['$26-50']++;
    else if (s <= 100) buckets['$51-100']++;
    else if (s <= 250) buckets['$101-250']++;
    else buckets['$250+']++;
  }
  /* Dynamic title */
  var titleEl = document.getElementById('betSizeTitle');
  if (titleEl) {
    var maxBucket = '', maxCount = 0;
    var bk = Object.keys(buckets);
    for (var bi = 0; bi < bk.length; bi++) { if (buckets[bk[bi]] > maxCount) { maxCount = buckets[bk[bi]]; maxBucket = bk[bi]; } }
    titleEl.textContent = 'Most bets at ' + maxBucket + ' (' + maxCount + ' bets)';
  }
  if (charts.betSize) {
    charts.betSize.data.datasets[0].data = Object.values(buckets);
    charts.betSize.update('none');
  } else {
    var opts = JSON.parse(JSON.stringify(chartDefaults));
    opts.plugins = { legend:{display:false} };
    charts.betSize = new Chart(ctx, { type:'bar', data:{ labels:Object.keys(buckets), datasets:[{ label:'Count', data:Object.values(buckets), backgroundColor:'#3b82f6', borderRadius:4 }] }, options:opts });
  }
}

function getWeekKey(date) {
  /* Returns "MM/DD" label for the Monday of that week */
  var d = new Date(date);
  var day = d.getDay();
  var diff = d.getDate() - day + (day === 0 ? -6 : 1); /* Monday */
  var monday = new Date(d.setDate(diff));
  return monday.getFullYear() + '-' + String(monday.getMonth() + 1).padStart(2, '0') + '-' + String(monday.getDate()).padStart(2, '0');
}
function fmtWeekLabel(key) {
  var parts = key.split('-');
  return parseInt(parts[1]) + '/' + parseInt(parts[2]);
}
function renderWeeklyChart() {
  var ctx = document.getElementById('weeklyChart');
  if (!ctx) return;
  /* filteredSettled already has settled && result — just add the date guard */
  var settled = getCachedFiltered().filteredSettled.filter(function(b){return b.settledDate || b.gameTime;});
  var weekMap = {};
  for (var i = 0; i < settled.length; i++) {
    var dts = parseGameDate(settled[i].gameTime) || parseGameDate(settled[i].settledDate);
    if (!dts) continue;
    var d = new Date(dts);
    var key = getWeekKey(d);
    if (!weekMap[key]) weekMap[key] = 0;
    if (settled[i].result === 'W') weekMap[key] += settled[i].toWin;
    else if (settled[i].result === 'L') weekMap[key] -= settled[i].stake;
  }
  var sorted = Object.entries(weekMap).sort(function(a,b){return a[0].localeCompare(b[0]);});
  var labels = [], data = [], colors = [];
  for (var i = 0; i < sorted.length; i++) {
    labels.push(fmtWeekLabel(sorted[i][0]));
    var v = +sorted[i][1].toFixed(2);
    data.push(v);
    colors.push(v >= 0 ? '#00d084' : '#ff4757');
  }
  /* Dynamic title */
  var titleEl = document.getElementById('weeklyTitle');
  if (titleEl && data.length > 0) {
    var lastVal = data[data.length - 1];
    titleEl.textContent = 'This week: ' + (lastVal >= 0 ? '+' : '') + fmtMoney(lastVal);
  }
  if (charts.weekly) {
    charts.weekly.data.labels = labels;
    charts.weekly.data.datasets[0].data = data;
    charts.weekly.data.datasets[0].backgroundColor = colors;
    charts.weekly.update('none');
  } else {
    var opts = JSON.parse(JSON.stringify(chartDefaults));
    opts.plugins = { legend:{display:false} };
    charts.weekly = new Chart(ctx, { type:'bar', data:{ labels:labels, datasets:[{ label:'P/L', data:data, backgroundColor:colors, borderRadius:4 }] }, options:opts });
  }
}

function renderHomeCharts() { renderROIChart(); renderBankrollChart(); renderWLChart(); renderSportChart(); }
function renderAnalyticsCharts() { renderSummaryDashCard(); renderCumPLChart(); renderWinRateSportChart(); renderBetSizeChart(); renderWeeklyChart(); }

/* ===== SUMMARY DASHBOARD CARD (the "5-second glance" card) ===== */
function renderSummaryDashCard() {
  var el = document.getElementById('summaryDashCard');
  if (!el) return;
  var settled = store.bets.concat(store.futures).filter(function(b) { return b.settled && b.result; });
  if (settled.length === 0) { el.innerHTML = ''; return; }

  var wins = 0, losses = 0, pushes = 0, totalStaked = 0, totalReturn = 0;
  var pW = 0, pL = 0, pStake = 0, pReturn = 0, sW = 0, sL = 0, sStake = 0, sReturn = 0;
  var sportMap = {};
  for (var i = 0; i < settled.length; i++) {
    var b = settled[i];
    var isParlay = b.type === 'parlay' || /parlay/i.test(b.matchup || '');
    var sp = b.sport || 'Other';
    if (!sportMap[sp]) sportMap[sp] = { pl: 0, stake: 0, w: 0, l: 0 };
    sportMap[sp].stake += b.stake;
    if (b.result === 'W') {
      wins++; totalReturn += b.stake + (b.toWin || 0);
      sportMap[sp].pl += b.toWin; sportMap[sp].w++;
      if (isParlay) { pW++; pReturn += b.stake + (b.toWin || 0); } else { sW++; sReturn += b.stake + (b.toWin || 0); }
    } else if (b.result === 'L') {
      losses++;
      sportMap[sp].pl -= b.stake; sportMap[sp].l++;
      if (isParlay) { pL++; } else { sL++; }
    } else { pushes++; totalReturn += b.stake; }
    totalStaked += b.stake || 0;
    if (isParlay) { pStake += b.stake || 0; } else if (b.result !== 'P') { sStake += b.stake || 0; }
  }
  var profit = totalReturn - totalStaked;
  var roi = totalStaked > 0 ? (profit / totalStaked * 100) : 0;
  var decisioned = wins + losses;
  var winPct = decisioned > 0 ? (wins / decisioned * 100) : 0;

  /* Best and worst sport by ROI */
  var bestSport = '', bestROI = -Infinity, worstSport = '', worstROI = Infinity;
  var spKeys = Object.keys(sportMap);
  for (var i = 0; i < spKeys.length; i++) {
    var sp = spKeys[i], sd = sportMap[sp];
    if (sd.w + sd.l < 3) continue;
    var spROI = sd.stake > 0 ? (sd.pl / sd.stake * 100) : 0;
    if (spROI > bestROI) { bestROI = spROI; bestSport = sp; }
    if (spROI < worstROI) { worstROI = spROI; worstSport = sp; }
  }

  /* Average odds for break-even calculation */
  var totalOdds = 0, oddsCount = 0;
  for (var i = 0; i < settled.length; i++) {
    if (settled[i].odds && settled[i].result !== 'P') { totalOdds += settled[i].odds; oddsCount++; }
  }
  var avgOdds = oddsCount > 0 ? totalOdds / oddsCount : -110;
  /* Break-even win rate at average odds */
  var breakEvenPct;
  if (avgOdds < 0) breakEvenPct = Math.abs(avgOdds) / (Math.abs(avgOdds) + 100) * 100;
  else breakEvenPct = 100 / (avgOdds + 100) * 100;

  /* Streak */
  var bySortTime = settled.slice().sort(function(a,b){
    var ta = new Date(a.settledDate||a.gameTime||0).getTime();
    var tb = new Date(b.settledDate||b.gameTime||0).getTime();
    return ta - tb;
  });
  var curStreak = '', curCount = 0;
  for (var i = bySortTime.length - 1; i >= 0; i--) {
    var r = bySortTime[i].result;
    if (r === 'P') continue;
    if (!curStreak) { curStreak = r; curCount = 1; }
    else if (r === curStreak) curCount++;
    else break;
  }

  var statusColor = profit >= 0 ? 'var(--green)' : 'var(--red)';
  var statusWord = profit >= 0 ? 'PROFITABLE' : 'UNPROFITABLE';
  var streakColor = curStreak === 'W' ? 'var(--green)' : 'var(--red)';

  var h = '<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:20px;display:grid;grid-template-columns:repeat(6,1fr);gap:16px;align-items:center">';
  h += '<div style="text-align:center"><div style="font-size:.65rem;color:var(--text3);text-transform:uppercase;letter-spacing:.8px;font-weight:600;margin-bottom:4px">Status</div><div style="font-size:1.1rem;font-weight:800;color:'+statusColor+'">'+statusWord+'</div></div>';
  h += '<div style="text-align:center"><div style="font-size:.65rem;color:var(--text3);text-transform:uppercase;letter-spacing:.8px;font-weight:600;margin-bottom:4px">Net P/L</div><div style="font-size:1.1rem;font-weight:800;color:'+statusColor+'">'+(profit>=0?'+':'-')+fmtMoney(profit)+'</div></div>';
  h += '<div style="text-align:center"><div style="font-size:.65rem;color:var(--text3);text-transform:uppercase;letter-spacing:.8px;font-weight:600;margin-bottom:4px">ROI</div><div style="font-size:1.1rem;font-weight:800;color:'+(roi>=0?'var(--green)':'var(--red)')+'">'+(roi>=0?'+':'')+roi.toFixed(1)+'%</div></div>';
  h += '<div style="text-align:center"><div style="font-size:.65rem;color:var(--text3);text-transform:uppercase;letter-spacing:.8px;font-weight:600;margin-bottom:4px">Win Rate vs Break-Even</div><div style="font-size:1.1rem;font-weight:800;color:'+(winPct>breakEvenPct?'var(--green)':'var(--red)')+'">'+winPct.toFixed(1)+'%</div><div style="font-size:.6rem;color:var(--text3)">Need '+breakEvenPct.toFixed(1)+'% at avg '+Math.round(avgOdds)+'</div></div>';
  h += '<div style="text-align:center"><div style="font-size:.65rem;color:var(--text3);text-transform:uppercase;letter-spacing:.8px;font-weight:600;margin-bottom:4px">Best Sport</div><div style="font-size:1.1rem;font-weight:800;color:var(--green)">'+(bestSport||'-')+'</div>'+(bestSport?'<div style="font-size:.6rem;color:var(--text3)">+'+bestROI.toFixed(0)+'% ROI</div>':'')+'</div>';
  h += '<div style="text-align:center"><div style="font-size:.65rem;color:var(--text3);text-transform:uppercase;letter-spacing:.8px;font-weight:600;margin-bottom:4px">Streak</div><div style="font-size:1.1rem;font-weight:800;color:'+streakColor+'">'+curCount+' '+(curStreak==='W'?'Win':'Loss')+(curCount>1?'s':'')+'</div></div>';
  h += '</div>';
  el.innerHTML = h;
}

/* ===== DEEP ANALYSIS TAB ===== */
function renderDeepAnalysis() {
  renderFilterBars();
  renderOddsRangeChart();
  renderBetTypeROIChart();
  renderDOWChart();
  renderMonthlyPLChart();
  renderCLVTrendChart();
  renderEdgeModelChart();
  renderParlayCorrelation();
  renderDeepBreakdown();
}

function renderOddsRangeChart() {
  var ctx = document.getElementById('oddsRangeChart');
  if (!ctx) return;
  var settled = store.bets.concat(store.futures).filter(function(b) { return b.settled && b.result; });
  var labels = ['\u2264-200', '-120 to -199', '-119 to +119', '+120 to +199', '+200+'];
  var sublabels = ['Heavy Fav', 'Fav', 'Near Even', 'Dog', 'Big Dog'];
  var pl = [0, 0, 0, 0, 0];
  for (var i = 0; i < settled.length; i++) {
    var b = settled[i], o = b.odds || 0, v = b.result === 'W' ? b.toWin : b.result === 'L' ? -b.stake : 0;
    var idx = o <= -200 ? 0 : o <= -120 ? 1 : o < 120 ? 2 : o < 200 ? 3 : 4;
    pl[idx] += v;
  }
  var data = pl.map(function(v) { return +v.toFixed(2); });
  var colors = data.map(function(v) { return v >= 0 ? '#00d084' : '#ff4757'; });
  /* Dynamic title */
  var titleEl = document.getElementById('oddsRangeTitle');
  if (titleEl) {
    var bestIdx = 0; for (var bi = 1; bi < data.length; bi++) { if (data[bi] > data[bestIdx]) bestIdx = bi; }
    titleEl.textContent = data[bestIdx] >= 0 ? 'Best edge at ' + sublabels[bestIdx] + ' odds (+' + fmtMoney(data[bestIdx]) + ')' : 'All odds ranges underwater';
  }
  if (charts.oddsRange) {
    charts.oddsRange.data.datasets[0].data = data;
    charts.oddsRange.data.datasets[0].backgroundColor = colors;
    charts.oddsRange.update('none');
  } else {
    var opts = JSON.parse(JSON.stringify(chartDefaults));
    opts.plugins = { legend: { display: false }, tooltip: { callbacks: { title: function(items) { return sublabels[items[0].dataIndex] + ' (' + labels[items[0].dataIndex] + ')'; } } } };
    opts.scales.x.ticks.maxRotation = 0;
    charts.oddsRange = new Chart(ctx, { type: 'bar', data: { labels: sublabels, datasets: [{ data: data, backgroundColor: colors, borderRadius: 4, barPercentage: 0.7, categoryPercentage: 0.8 }] }, options: opts });
  }
}

function renderBetTypeROIChart() {
  var ctx = document.getElementById('betTypeROIChart');
  if (!ctx) return;
  var settled = store.bets.concat(store.futures).filter(function(b) { return b.settled && b.result; });
  var typeOrder = ['spread', 'moneyline', 'total', 'parlay', 'future', 'other'];
  var typeLabels = { spread: 'Spread', moneyline: 'ML', total: 'Total', parlay: 'Parlay', future: 'Future', other: 'Other' };
  var typeMap = {};
  for (var i = 0; i < settled.length; i++) {
    var b = settled[i], tp = b.type || 'other';
    if (!typeMap[tp]) typeMap[tp] = { pl: 0, stake: 0 };
    typeMap[tp].stake += b.stake;
    if (b.result === 'W') typeMap[tp].pl += b.toWin;
    else if (b.result === 'L') typeMap[tp].pl -= b.stake;
  }
  var labels = [], data = [], colors = [];
  for (var i = 0; i < typeOrder.length; i++) {
    var tp = typeOrder[i];
    if (!typeMap[tp] || typeMap[tp].stake === 0) continue;
    var roi = (typeMap[tp].pl / typeMap[tp].stake) * 100;
    labels.push(typeLabels[tp]);
    data.push(+roi.toFixed(1));
    colors.push(roi >= 0 ? '#00d084' : '#ff4757');
  }
  /* Dynamic title */
  var titleEl = document.getElementById('betTypeROITitle');
  if (titleEl && labels.length > 0) {
    var bestTypeIdx = 0; for (var bi = 1; bi < data.length; bi++) { if (data[bi] > data[bestTypeIdx]) bestTypeIdx = bi; }
    titleEl.textContent = labels[bestTypeIdx] + ' bets lead at ' + (data[bestTypeIdx] >= 0 ? '+' : '') + data[bestTypeIdx] + '% ROI';
  }
  if (charts.betTypeROI) {
    charts.betTypeROI.data.labels = labels;
    charts.betTypeROI.data.datasets[0].data = data;
    charts.betTypeROI.data.datasets[0].backgroundColor = colors;
    charts.betTypeROI.update('none');
  } else {
    var opts = JSON.parse(JSON.stringify(chartDefaults));
    opts.plugins = { legend: { display: false } };
    opts.scales.x.ticks.maxRotation = 0;
    charts.betTypeROI = new Chart(ctx, { type: 'bar', data: { labels: labels, datasets: [{ data: data, backgroundColor: colors, borderRadius: 4, barPercentage: 0.7, categoryPercentage: 0.8 }] }, options: opts });
  }
}

function renderDOWChart() {
  var ctx = document.getElementById('dowChart');
  if (!ctx) return;
  var settled = store.bets.concat(store.futures).filter(function(b) { return b.settled && b.result && (b.gameTime || b.settledDate); });
  var days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  var pl = [0, 0, 0, 0, 0, 0, 0];
  for (var i = 0; i < settled.length; i++) {
    var b = settled[i];
    var ts = parseGameDate(b.gameTime) || (b.settledDate ? new Date(b.settledDate).getTime() : 0);
    if (!ts) continue;
    var dow = new Date(ts).getDay();
    pl[dow] += b.result === 'W' ? b.toWin : b.result === 'L' ? -b.stake : 0;
  }
  var data = pl.map(function(v) { return +v.toFixed(2); });
  var colors = data.map(function(v) { return v >= 0 ? '#00d084' : '#ff4757'; });
  /* Dynamic title */
  var titleEl = document.getElementById('dowTitle');
  if (titleEl) {
    var bestDay = 0; for (var bi = 1; bi < data.length; bi++) { if (data[bi] > data[bestDay]) bestDay = bi; }
    titleEl.textContent = days[bestDay] + ' is your best day (' + (data[bestDay] >= 0 ? '+' : '') + fmtMoney(data[bestDay]) + ')';
  }
  if (charts.dow) {
    charts.dow.data.datasets[0].data = data;
    charts.dow.data.datasets[0].backgroundColor = colors;
    charts.dow.update('none');
  } else {
    var opts = JSON.parse(JSON.stringify(chartDefaults));
    opts.plugins = { legend: { display: false } };
    opts.scales.x.ticks.maxRotation = 0;
    charts.dow = new Chart(ctx, { type: 'bar', data: { labels: days, datasets: [{ data: data, backgroundColor: colors, borderRadius: 4, barPercentage: 0.7, categoryPercentage: 0.8 }] }, options: opts });
  }
}

function renderMonthlyPLChart() {
  var ctx = document.getElementById('monthlyChart');
  if (!ctx) return;
  var settled = store.bets.concat(store.futures).filter(function(b) { return b.settled && b.result && (b.gameTime || b.settledDate); });
  var monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var monthMap = {};
  for (var i = 0; i < settled.length; i++) {
    var b = settled[i];
    var ts = parseGameDate(b.gameTime) || (b.settledDate ? new Date(b.settledDate).getTime() : 0);
    if (!ts) continue;
    var d = new Date(ts);
    var key = d.getFullYear() + '-' + String(d.getMonth()).padStart(2, '0');
    if (!monthMap[key]) monthMap[key] = { pl: 0, month: d.getMonth(), year: d.getFullYear() };
    monthMap[key].pl += b.result === 'W' ? b.toWin : b.result === 'L' ? -b.stake : 0;
  }
  var sorted = Object.keys(monthMap).sort();
  var labels = sorted.map(function(k) { return monthNames[monthMap[k].month] + ' \'' + String(monthMap[k].year).slice(2); });
  var data = sorted.map(function(k) { return +monthMap[k].pl.toFixed(2); });
  var colors = data.map(function(v) { return v >= 0 ? '#00d084' : '#ff4757'; });
  /* Dynamic title */
  var titleEl = document.getElementById('monthlyTitle');
  if (titleEl && labels.length > 0) {
    var lastMonth = labels[labels.length - 1];
    var lastVal = data[data.length - 1];
    titleEl.textContent = lastMonth + ': ' + (lastVal >= 0 ? '+' : '') + fmtMoney(lastVal);
  }
  if (charts.monthly) {
    charts.monthly.data.labels = labels;
    charts.monthly.data.datasets[0].data = data;
    charts.monthly.data.datasets[0].backgroundColor = colors;
    charts.monthly.update('none');
  } else {
    var opts = JSON.parse(JSON.stringify(chartDefaults));
    opts.plugins = { legend: { display: false } };
    opts.scales.x.ticks.maxRotation = 0;
    charts.monthly = new Chart(ctx, { type: 'bar', data: { labels: labels, datasets: [{ data: data, backgroundColor: colors, borderRadius: 4, barPercentage: 0.7, categoryPercentage: 0.8 }] }, options: opts });
  }
}

function renderDeepBreakdown() {
  var el = document.getElementById('deepBreakdownGrid');
  if (!el) return;
  var settled = getCachedFiltered().filteredSettled;

  function buildMap(keyFn, orderArr) {
    var map = {};
    for (var i = 0; i < settled.length; i++) {
      var b = settled[i], k = keyFn(b);
      if (!map[k]) map[k] = { w: 0, l: 0, p: 0, pl: 0, stake: 0 };
      map[k].stake += b.stake;
      if (b.result === 'W') { map[k].w++; map[k].pl += b.toWin; }
      else if (b.result === 'L') { map[k].l++; map[k].pl -= b.stake; }
      else { map[k].p++; }
    }
    /* Sort by ROI descending (best to worst) unless order given */
    var rows = orderArr ? orderArr.filter(function(k) { return map[k]; }) : Object.keys(map).sort(function(a, b) {
      var roiA = map[a].stake > 0 ? map[a].pl / map[a].stake : 0;
      var roiB = map[b].stake > 0 ? map[b].pl / map[b].stake : 0;
      return roiB - roiA;
    });
    return { map: map, rows: rows };
  }

  function mkTable(rows, map, nameFn) {
    var h = '<table class="breakdown-table"><thead><tr>';
    h += '<th>Name</th><th>Bets</th><th>W-L</th><th>Win%</th><th>P/L</th><th>ROI</th>';
    h += '</tr></thead><tbody>';
    for (var i = 0; i < rows.length; i++) {
      var k = rows[i], d = map[k];
      var total = d.w + d.l + d.p;
      var winPct = d.w + d.l > 0 ? ((d.w / (d.w + d.l)) * 100).toFixed(1) : '-';
      var roi = d.stake > 0 ? ((d.pl / d.stake) * 100).toFixed(1) : '-';
      var plCls = d.pl >= 0 ? 'pos' : 'neg';
      var lowSample = total < 10;
      h += '<tr' + (lowSample ? ' style="opacity:0.65"' : '') + '>';
      h += '<td class="col-name">' + escHtml(nameFn ? nameFn(k) : k) + (lowSample ? ' <span style="color:var(--amber);font-size:.65rem" title="Fewer than 10 bets">*</span>' : '') + '</td>';
      h += '<td>' + total + '</td>';
      h += '<td>' + d.w + '-' + d.l + '</td>';
      h += '<td class="' + (winPct !== '-' && parseFloat(winPct) >= 50 ? 'pos' : 'neg') + '">' + (winPct !== '-' ? winPct + '%' : '-') + '</td>';
      h += '<td class="' + plCls + '">' + (d.pl >= 0 ? '+' : '') + fmtMoney(d.pl) + '</td>';
      h += '<td class="' + plCls + '">' + (roi !== '-' ? (parseFloat(roi) >= 0 ? '+' : '') + roi + '%' : '-') + '</td>';
      h += '</tr>';
    }
    h += '</tbody></table>';
    if (rows.some(function(k){ return (map[k].w + map[k].l + map[k].p) < 10; })) {
      h += '<div style="font-size:.65rem;color:var(--amber);margin-top:4px">* Low sample size (fewer than 10 bets)</div>';
    }
    return h;
  }

  var sportD = buildMap(function(b) { return b.sport || 'Other'; }, null);
  var typeD = buildMap(function(b) { return b.type || 'other'; }, ['spread', 'moneyline', 'total', 'parlay', 'future', 'other']);
  var typeNames = { spread: 'Spread', moneyline: 'Moneyline', total: 'Total/OU', parlay: 'Parlay', future: 'Future', other: 'Other' };

  el.innerHTML =
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">' +
    '<div class="breakdown-section"><h3>By Sport</h3>' + mkTable(sportD.rows, sportD.map, null) + '</div>' +
    '<div class="breakdown-section"><h3>By Bet Type</h3>' + mkTable(typeD.rows, typeD.map, function(k) { return typeNames[k] || k; }) + '</div>' +
    '</div>';
}

/* ===== CLV (CLOSING LINE VALUE) ===== */
function oddsToImplied(odds) {
  /* Convert American odds to implied probability (0-1) */
  if (!odds || odds === 0) return 0.5;
  if (odds < 0) return Math.abs(odds) / (Math.abs(odds) + 100);
  return 100 / (odds + 100);
}

function calcCLV(bet) {
  /* Calculate CLV%. Positive = you beat the closing line (sharp).
     Returns null if no closing line available. */
  if (bet.closingOdds === undefined || bet.closingOdds === null || bet.closingOdds === 0) return null;
  var placedImpl = oddsToImplied(bet.odds);
  var closingImpl = oddsToImplied(bet.closingOdds);
  if (closingImpl === 0) return null;
  /* CLV% = how much less implied probability you paid vs closing */
  return ((closingImpl - placedImpl) / closingImpl) * 100;
}

function clvClass(clv) {
  if (clv === null || clv === undefined) return 'neutral';
  if (clv >= 2) return 'good';
  if (clv <= -2) return 'bad';
  return 'neutral';
}

function clvLabel(clv) {
  if (clv === null || clv === undefined) return '';
  var sign = clv >= 0 ? '+' : '';
  return sign + clv.toFixed(1) + '% CLV';
}

/* Simulate closing lines for historical bets using odds history data.
   For bets without an explicit closingOdds, look up the last recorded
   odds snapshot before game time as a proxy. */
function enrichClosingLines() {
  var allBets = store.bets.concat(store.futures);
  for (var i = 0; i < allBets.length; i++) {
    var b = allBets[i];
    if (b.closingOdds !== undefined && b.closingOdds !== null) continue;
    if (!b.settled || !b.result) continue;
    if (b.type === 'parlay' || b.type === 'future') continue;

    /* Try to find odds history for this bet's team */
    var pick = (b.pick || '').toLowerCase();
    var teamWords = pick.replace(/[+-][\d.]+.*$/, '').replace(/\(.*$/, '').trim().split(/\s+/).filter(function(w) {
      return w.length > 2 && !/^(ml|ats|over|under|1h|2h|the)$/i.test(w);
    });
    if (teamWords.length === 0) continue;

    /* Search odds history for a matching team */
    var histKeys = Object.keys(cachedOddsHistory);
    var bestMatch = null;
    for (var j = 0; j < histKeys.length; j++) {
      var hk = histKeys[j];
      var matchCount = 0;
      for (var w = 0; w < teamWords.length; w++) {
        if (hk.indexOf(teamWords[w]) !== -1) matchCount++;
      }
      if (matchCount >= Math.min(2, teamWords.length) && (!bestMatch || hk.length < bestMatch.length)) {
        bestMatch = hk;
      }
    }

    if (bestMatch && cachedOddsHistory[bestMatch]) {
      var entries = cachedOddsHistory[bestMatch];
      var gameTs = parseGameDate(b.gameTime) || (b.settledDate ? new Date(b.settledDate).getTime() : 0);
      if (gameTs > 0) {
        /* Use the last entry before game time, or the closest one */
        var closest = null;
        for (var e = 0; e < entries.length; e++) {
          var entryTs = new Date(entries[e].ts).getTime();
          if (entryTs <= gameTs) closest = entries[e];
        }
        if (closest) {
          b.closingOdds = closest.odds;
        }
      }
    }
  }
}

function renderCLVTrendChart() {
  var ctx = document.getElementById('clvTrendChart');
  if (!ctx) return;
  /* filteredSettledBets already has chart-filter applied and excludes futures */
  var settled = getCachedFiltered().filteredSettledBets.filter(function(b) {
    return b.result !== 'P' && b.closingOdds !== undefined && b.closingOdds !== null;
  });
  settled.sort(function(a, b) {
    return (parseGameDate(a.gameTime) || 0) - (parseGameDate(b.gameTime) || 0);
  });

  if (settled.length < 3) {
    ctx.parentElement.querySelector('.chart-title').innerHTML = 'CLV Trend <span style="font-size:.65rem;color:var(--text3);font-weight:400;text-transform:none">(needs closing line data — dashboard must be open ~30 min before game start to capture lines)</span>';
    return;
  }
  /* CLV from daily odds snapshots is approximate — note this for the user */
  var clvNote = settled.length < 20 ? ' <span style="font-size:.6rem;color:var(--amber);font-weight:400;text-transform:none">(small sample — ' + settled.length + ' bets with closing data)</span>' : '';
  ctx.parentElement.querySelector('.chart-title').innerHTML = 'CLV Trend' + clvNote;

  var labels = [], data = [], cumCLV = 0;
  for (var i = 0; i < settled.length; i++) {
    var clv = calcCLV(settled[i]);
    if (clv === null) continue;
    cumCLV += clv;
    var avgCLV = cumCLV / (labels.length + 1);
    labels.push('#' + (labels.length + 1));
    data.push(+avgCLV.toFixed(2));
  }

  var borderColor = data.length > 0 && data[data.length - 1] >= 0 ? '#00d084' : '#ff4757';
  if (charts.clvTrend) {
    charts.clvTrend.data.labels = labels;
    charts.clvTrend.data.datasets[0].data = data;
    charts.clvTrend.data.datasets[0].borderColor = borderColor;
    charts.clvTrend.data.datasets[0].backgroundColor = borderColor + '22';
    charts.clvTrend.update('none');
  } else {
    var opts = JSON.parse(JSON.stringify(chartDefaults));
    opts.plugins = { legend: { display: false } };
    charts.clvTrend = new Chart(ctx, {
      type: 'line',
      data: { labels: labels, datasets: [{ data: data, borderColor: borderColor, backgroundColor: borderColor + '22', fill: true, tension: .3, pointRadius: 2 }] },
      options: opts
    });
  }
}

/* ===== PERSONAL EDGE MODEL ===== */
function renderEdgeModelChart() {
  var ctx = document.getElementById('edgeModelChart');
  if (!ctx) return;
  /* filteredSettled already has chart-filter + settled + result; exclude pushes */
  var settled = getCachedFiltered().filteredSettled.filter(function(b) { return b.result !== 'P'; });

  var buckets = [
    { label: 'Heavy Fav', range: 'odds <= -200', min: -9999, max: -200 },
    { label: 'Fav -150s', range: '-199 to -150', min: -199, max: -150 },
    { label: 'Fav -110s', range: '-149 to -105', min: -149, max: -105 },
    { label: 'Pick Em', range: '-104 to +104', min: -104, max: 104 },
    { label: 'Dog +110s', range: '+105 to +149', min: 105, max: 149 },
    { label: 'Dog +150s', range: '+150 to +199', min: 150, max: 199 },
    { label: 'Dog +200s', range: '+200 to +299', min: 200, max: 299 },
    { label: 'Long Shot', range: '+300+', min: 300, max: 9999 }
  ];

  var labels = [], yourRate = [], impliedRate = [];
  for (var bi = 0; bi < buckets.length; bi++) {
    var bk = buckets[bi];
    var wins = 0, total = 0;
    for (var i = 0; i < settled.length; i++) {
      var o = settled[i].odds || 0;
      if (o >= bk.min && o <= bk.max) {
        total++;
        if (settled[i].result === 'W') wins++;
      }
    }
    if (total < 3) continue; /* Skip buckets with too few bets */
    var yourWR = (wins / total) * 100;
    /* Midpoint implied probability for this bucket */
    var midOdds = (bk.min + bk.max) / 2;
    if (bk.min === -9999) midOdds = -300;
    if (bk.max === 9999) midOdds = 400;
    var implPct = oddsToImplied(midOdds) * 100;
    labels.push(bk.label);
    yourRate.push(+yourWR.toFixed(1));
    impliedRate.push(+implPct.toFixed(1));
  }

  if (labels.length < 2) return;

  if (charts.edgeModel) {
    charts.edgeModel.data.labels = labels;
    charts.edgeModel.data.datasets[0].data = yourRate;
    charts.edgeModel.data.datasets[1].data = impliedRate;
    charts.edgeModel.update('none');
  } else {
    var opts = JSON.parse(JSON.stringify(chartDefaults));
    opts.plugins = { legend: { display: true, labels: { color: '#8899a6', font: { size: 10 } } } };
    charts.edgeModel = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          { label: 'Your Win Rate', data: yourRate, backgroundColor: '#3b82f6', borderRadius: 4, barPercentage: 0.4, categoryPercentage: 0.8 },
          { label: 'Break-Even Rate', data: impliedRate, backgroundColor: 'rgba(136,153,166,.3)', borderRadius: 4, barPercentage: 0.4, categoryPercentage: 0.8 }
        ]
      },
      options: opts
    });
  }
}

/* ===== PARLAY CORRELATION DETECTOR ===== */
function parseParlayLegs(bet) {
  /* Extract individual legs from a parlay's pick string */
  if (!bet.pick) return [];
  var pick = bet.pick;
  /* Common parlay separators: " + ", " & ", " / ", comma */
  var legs = pick.split(/\s*[+&\/]\s*|\s*,\s*/).map(function(l) { return l.trim(); }).filter(function(l) { return l.length > 2; });
  if (legs.length <= 1) {
    /* Try splitting on " ML", " -", " +" patterns */
    legs = pick.split(/\s+(?=\w+\s+(?:ML|[+-]\d))/i).filter(function(l) { return l.trim().length > 2; });
  }
  return legs;
}


