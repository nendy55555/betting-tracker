/* Chat analysis engine, bet parsing, sportsbook paste parsing */
/* Extracted from betting-tracker.html — do not edit the original */


/* ===== CHATBOT ANALYSIS ENGINE ===== */
function analyzeQuery(query) {
  var q = query.toLowerCase().trim();
  var all = store.bets.concat(store.futures);

  /* Is this a question / analysis request? */
  var isQuestion = /\?$/.test(q) || /^(what|how|show|tell|give|whats|what's|which|where|who|do i|am i|have i|my |net |total |record |roi |profit |loss |best |worst |biggest |avg |average |most |least |top |rank|today|yesterday|this week|last week|streak|hot|cold|unit|breakdown|compare|list )/.test(q);
  if (!isQuestion) return null;

  /* Extract team/keyword filter */
  var filterTeam = null;
  var teamMatch = q.match(/(?:from|on|for|with|against|betting|bet on|bets on)\s+(.+?)(?:\s*\?|$|\s+(?:bets|games|overall|total|net|record))/i);
  if (teamMatch) filterTeam = teamMatch[1].trim();
  if (!filterTeam) {
    /* Try to find a known team name in the query */
    var allTeams = NBA_TEAMS.concat(NFL_TEAMS).concat(SOCCER_TEAMS);
    for (var i = 0; i < allTeams.length; i++) {
      if (q.indexOf(allTeams[i]) !== -1) { filterTeam = allTeams[i]; break; }
    }
    /* Also check for college teams that are commonly referenced */
    var colleges = ['vanderbilt','duke','kentucky','gonzaga','alabama','auburn','tennessee','michigan','houston','purdue','uconn','kansas','baylor','creighton','marquette','iowa','florida','texas','arizona','arkansas','nebraska','virginia','louisville','michigan state'];
    for (var i = 0; i < colleges.length; i++) {
      if (q.indexOf(colleges[i]) !== -1) { filterTeam = colleges[i]; break; }
    }
  }

  /* Extract sport filter */
  var filterSport = null;
  if (/\bnba\b/.test(q)) filterSport = 'NBA';
  else if (/\bnfl\b/.test(q)) filterSport = 'NFL';
  else if (/\bncaa\b|\bcollege\b|\bcbb\b|\bmarch madness\b/.test(q)) filterSport = 'NCAAMB';
  else if (/\bsoccer\b|\bmls\b|\bfootball\b/.test(q)) filterSport = 'Soccer';

  /* Filter bets */
  var filtered = all;
  if (filterTeam) {
    filtered = all.filter(function(b) {
      var searchStr = ((b.matchup || '') + ' ' + (b.pick || '')).toLowerCase();
      return searchStr.indexOf(filterTeam) !== -1;
    });
  }
  if (filterSport) {
    filtered = filtered.filter(function(b) { return b.sport === filterSport; });
  }

  var settled = filtered.filter(function(b) { return b.settled && b.result; });
  var open = filtered.filter(function(b) { return !b.settled; });

  /* Calculate stats */
  var wins = 0, losses = 0, pushes = 0, totalStaked = 0, totalReturned = 0;
  for (var i = 0; i < settled.length; i++) {
    var b = settled[i];
    totalStaked += b.stake || 0;
    if (b.result === 'W') { wins++; totalReturned += b.stake + (b.toWin || 0); }
    else if (b.result === 'L') { losses++; }
    else if (b.result === 'P') { pushes++; totalReturned += b.stake; }
  }
  var netPL = totalReturned - totalStaked;
  var roi = totalStaked > 0 ? ((netPL / totalStaked) * 100) : 0;

  /* Helper: extract team name from pick/matchup for grouping */
  function extractTeamFromPick(pick) {
    if (!pick) return 'Unknown';
    var p = pick.replace(/\([^)]*\)/g, '').trim();
    p = p.replace(/\s+[+-]?\d+[½¼¾]?\s*$/,'');
    p = p.replace(/\s+(ML|Over|Under)\b.*$/i,'');
    p = p.replace(/\s+[+-]\d{3,}$/,'');
    p = p.trim();
    /* For parlays, take first leg team */
    if (p.indexOf('+') > 0) p = p.split('+')[0].trim();
    return p || 'Unknown';
  }

  /* Helper: aggregate P/L by a grouping key */
  function aggregateByKey(bets, keyFn) {
    var groups = {};
    for (var i = 0; i < bets.length; i++) {
      var b = bets[i];
      if (!b.settled || !b.result) continue;
      var key = keyFn(b);
      if (!groups[key]) groups[key] = { wins: 0, losses: 0, pushes: 0, staked: 0, returned: 0, bets: 0 };
      var g = groups[key];
      g.bets++;
      g.staked += b.stake || 0;
      if (b.result === 'W') { g.wins++; g.returned += b.stake + (b.toWin || 0); }
      else if (b.result === 'L') { g.losses++; }
      else if (b.result === 'P') { g.pushes++; g.returned += b.stake; }
    }
    var arr = [];
    for (var k in groups) {
      if (!groups.hasOwnProperty(k)) continue;
      var g = groups[k];
      g.name = k;
      g.pl = g.returned - g.staked;
      g.roi = g.staked > 0 ? (g.pl / g.staked * 100) : 0;
      arr.push(g);
    }
    return arr;
  }

  /* Helper: format a ranked list */
  function formatRankedList(arr, sortKey, limit, title) {
    arr.sort(function(a, b) { return b[sortKey] - a[sortKey]; });
    var top = arr.slice(0, limit || 8);
    var html = '<strong>' + title + '</strong><br>';
    for (var i = 0; i < top.length; i++) {
      var g = top[i];
      var plColor = g.pl >= 0 ? 'var(--green)' : 'var(--red)';
      var plSign = g.pl >= 0 ? '+' : '-';
      html += '<span style="color:var(--text2)">' + (i + 1) + '.</span> <strong>' + escHtml(g.name) + '</strong> — ';
      html += '<span style="color:' + plColor + '">' + plSign + fmtMoney(g.pl) + '</span>';
      html += ' <span style="color:var(--text3);font-size:.75rem">(' + g.wins + '-' + g.losses + ', ' + g.bets + ' bets, ' + (g.roi >= 0 ? '+' : '') + g.roi.toFixed(0) + '% ROI)</span><br>';
    }
    return html;
  }

  /* Determine what type of answer to give */
  var label = filterTeam ? ('<strong>' + escHtml(filterTeam.charAt(0).toUpperCase() + filterTeam.slice(1)) + '</strong>') : (filterSport ? '<strong>' + filterSport + '</strong>' : '<strong>all bets</strong>');

  if (filtered.length === 0) {
    return 'No bets found matching ' + label + '. Try a different team or sport name.';
  }

  /* ===== TEAM PROFITABILITY RANKING ===== */
  if (/(?:most|least|top|best|worst)\s*(?:profitable|profiting|money|earning)\s*(?:team|pick|bet)|(?:profitable|profiting)\s*(?:team|pick)|team.+(?:profit|rank|leader)|which\s+teams?\s+(?:am i|are|do)|breakdown\s+by\s+team|team\s+breakdown|rank.+team|leaderboard|top\s+(?:pick|team|bet)/i.test(q)) {
    var teamGroups = aggregateByKey(settled, function(b) { return extractTeamFromPick(b.pick); });
    if (/worst|least|losing|bleeding/i.test(q)) {
      return formatRankedList(teamGroups, 'pl', 10, 'Least Profitable Teams (by P/L)');
    }
    return formatRankedList(teamGroups, 'pl', 10, 'Most Profitable Teams (by P/L)');
  }

  /* ===== SPORT PROFITABILITY RANKING ===== */
  if (/(?:most|least|top|best|worst)\s*(?:profitable|profiting)\s*(?:sport|league)|(?:sport|league)\s+(?:breakdown|ranking|profit|comparison)|breakdown\s+by\s+sport|which\s+sport|compare\s+sports/i.test(q)) {
    var sportGroups = aggregateByKey(settled, function(b) { return b.sport || 'Other'; });
    return formatRankedList(sportGroups, 'pl', 10, 'Profitability by Sport');
  }

  /* ===== BET TYPE BREAKDOWN ===== */
  if (/(?:spread|moneyline|parlay|total|over.under).+(?:record|profit|how|doing)|breakdown\s+by\s+(?:type|bet\s*type)|bet\s+type\s+(?:breakdown|comparison|ranking)/i.test(q)) {
    var typeGroups = aggregateByKey(settled, function(b) {
      var t = (b.type || 'other').toLowerCase();
      if (t === 'moneyline') return 'Moneyline';
      if (t === 'spread') return 'Spread';
      if (t === 'total') return 'Total (O/U)';
      if (t === 'parlay') return 'Parlay';
      return 'Other';
    });
    return formatRankedList(typeGroups, 'pl', 10, 'Profitability by Bet Type');
  }

  /* ===== STREAK / HOT / COLD ===== */
  if (/streak|hot|cold|run\b|lately|recent form|last \d+|trending/i.test(q)) {
    var recent = settled.slice().sort(function(a, b) {
      return (parseGameDate(b.gameTime) || parseGameDate(b.settledDate)) - (parseGameDate(a.gameTime) || parseGameDate(a.settledDate));
    });
    /* Current streak */
    var streakType = recent.length > 0 ? recent[0].result : null;
    var streakCount = 0;
    for (var si = 0; si < recent.length; si++) {
      if (recent[si].result === streakType) streakCount++;
      else break;
    }
    /* Last 10 */
    var last10 = recent.slice(0, 10);
    var l10w = 0, l10l = 0, l10staked = 0, l10returned = 0;
    var l10str = '';
    for (var li = 0; li < last10.length; li++) {
      var lb = last10[li];
      l10staked += lb.stake || 0;
      if (lb.result === 'W') { l10w++; l10returned += lb.stake + (lb.toWin || 0); l10str += '<span style="color:var(--green)">W</span>'; }
      else if (lb.result === 'L') { l10l++; l10str += '<span style="color:var(--red)">L</span>'; }
      else { l10str += '<span style="color:var(--amber)">P</span>'; l10returned += lb.stake; }
      if (li < last10.length - 1) l10str += ' ';
    }
    var l10pl = l10returned - l10staked;
    var streakEmoji = streakType === 'W' ? '&#128293;' : (streakType === 'L' ? '&#129398;' : '&#128528;');
    var html = '<strong>Recent Form:</strong><br>';
    html += streakEmoji + ' Current streak: <strong>' + streakCount + (streakType === 'W' ? ' wins' : streakType === 'L' ? ' losses' : ' pushes') + '</strong><br>';
    html += 'Last 10: ' + l10str + ' (' + l10w + '-' + l10l + ')<br>';
    html += 'Last 10 P/L: <span style="color:' + (l10pl >= 0 ? 'var(--green)' : 'var(--red)') + '">' + (l10pl >= 0 ? '+' : '-') + fmtMoney(l10pl) + '</span>';
    return html;
  }

  /* ===== TODAY / YESTERDAY / THIS WEEK ===== */
  var timeFilter = null;
  var timeLabel = '';
  var now = new Date();
  if (/\btoday\b/.test(q)) {
    timeFilter = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    timeLabel = 'Today';
  } else if (/\byesterday\b/.test(q)) {
    timeFilter = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    timeLabel = 'Yesterday';
  } else if (/\bthis week\b/.test(q)) {
    var dayOfWeek = now.getDay();
    timeFilter = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);
    timeLabel = 'This Week';
  } else if (/\blast week\b/.test(q)) {
    var dayOfWeek = now.getDay();
    timeFilter = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek - 7);
    var endOfLastWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);
    timeLabel = 'Last Week';
  }
  if (timeFilter) {
    var timeBets = settled.filter(function(b) {
      var d = new Date(parseGameDate(b.gameTime) || parseGameDate(b.settledDate) || 0);
      if (timeLabel === 'Yesterday') {
        return d >= timeFilter && d < new Date(timeFilter.getTime() + 86400000);
      }
      if (timeLabel === 'Last Week') {
        return d >= timeFilter && d < endOfLastWeek;
      }
      return d >= timeFilter;
    });
    if (timeBets.length === 0) return 'No settled bets found for <strong>' + timeLabel + '</strong>.';
    var tw = 0, tl = 0, ts = 0, tr = 0;
    for (var ti = 0; ti < timeBets.length; ti++) {
      ts += timeBets[ti].stake || 0;
      if (timeBets[ti].result === 'W') { tw++; tr += timeBets[ti].stake + (timeBets[ti].toWin || 0); }
      else if (timeBets[ti].result === 'L') { tl++; }
      else { tr += timeBets[ti].stake; }
    }
    var tpl = tr - ts;
    return '<strong>' + timeLabel + ':</strong><br>' +
      'Record: <strong>' + tw + '-' + tl + '</strong><br>' +
      'P/L: <span style="color:' + (tpl >= 0 ? 'var(--green)' : 'var(--red)') + '">' + (tpl >= 0 ? '+' : '-') + fmtMoney(tpl) + '</span><br>' +
      'Wagered: ' + fmtMoney(ts) + ' across ' + timeBets.length + ' bets';
  }

  /* ===== UNITS / UNIT SIZE ===== */
  if (/unit|sizing|stake size|how much.+bet|wager size/i.test(q)) {
    var stakes = {};
    for (var ui = 0; ui < settled.length; ui++) {
      var sk = '$' + (settled[ui].stake || 0).toFixed(0);
      stakes[sk] = (stakes[sk] || 0) + 1;
    }
    var stakeArr = [];
    for (var k in stakes) stakeArr.push({ size: k, count: stakes[k] });
    stakeArr.sort(function(a, b) { return b.count - a.count; });
    var html = '<strong>Stake Breakdown:</strong><br>';
    for (var si = 0; si < Math.min(stakeArr.length, 8); si++) {
      html += stakeArr[si].size + ' — ' + stakeArr[si].count + ' bets<br>';
    }
    return html;
  }

  /* Net loss/profit question */
  if (/net|profit|loss|p\/l|pnl|money|earned|lost|made|up|down/.test(q)) {
    var plColor = netPL >= 0 ? 'var(--green)' : 'var(--red)';
    var plSign = netPL >= 0 ? '+' : '-';
    return '<strong>P/L for ' + label + ':</strong><br>' +
      '<span style="font-size:1.2rem;font-weight:800;color:' + plColor + '">' + plSign + fmtMoney(netPL) + '</span><br>' +
      'Record: ' + wins + '-' + losses + (pushes > 0 ? '-' + pushes : '') + '<br>' +
      'Total wagered: ' + fmtMoney(totalStaked) + '<br>' +
      'ROI: ' + (roi >= 0 ? '+' : '') + roi.toFixed(1) + '%';
  }

  /* Record question */
  if (/record|win rate|winning|how am i|how.?m i doing|results/.test(q)) {
    var decisioned = wins + losses;
    var winPct = decisioned > 0 ? ((wins / decisioned) * 100) : 0;
    return '<strong>Record for ' + label + ':</strong><br>' +
      '<span style="font-size:1.1rem;font-weight:700">' + wins + '-' + losses + (pushes > 0 ? '-' + pushes : '') + '</span> (' + winPct.toFixed(1) + '% win rate)<br>' +
      'Net P/L: ' + (netPL >= 0 ? '+' : '-') + fmtMoney(netPL) + '<br>' +
      'Open bets: ' + open.length;
  }

  /* ROI question */
  if (/roi|return/.test(q)) {
    return '<strong>ROI for ' + label + ':</strong> ' + (roi >= 0 ? '+' : '') + roi.toFixed(1) + '%<br>' +
      'Total wagered: ' + fmtMoney(totalStaked) + '<br>Net P/L: ' + (netPL >= 0 ? '+' : '-') + fmtMoney(netPL);
  }

  /* Best/worst bet */
  if (/biggest win|top win|best win|largest win/.test(q)) {
    var bestWin = null, bestAmt = 0;
    for (var i = 0; i < settled.length; i++) {
      if (settled[i].result === 'W' && settled[i].toWin > bestAmt) { bestAmt = settled[i].toWin; bestWin = settled[i]; }
    }
    if (bestWin) {
      return '<strong>Biggest win for ' + label + ':</strong><br>' + escHtml(bestWin.pick) + ' — won <span style="color:var(--green)">+' + fmtMoney(bestWin.toWin) + '</span> on ' + fmtMoney(bestWin.stake) + ' stake (' + fmtOdds(bestWin.odds) + ')';
    }
    return 'No wins found for ' + label + ' yet.';
  }

  if (/biggest loss|worst loss|largest loss/.test(q)) {
    var worstLoss = null, worstAmt = 0;
    for (var i = 0; i < settled.length; i++) {
      if (settled[i].result === 'L' && settled[i].stake > worstAmt) { worstAmt = settled[i].stake; worstLoss = settled[i]; }
    }
    if (worstLoss) {
      return '<strong>Biggest loss for ' + label + ':</strong><br>' + escHtml(worstLoss.pick) + ' — lost <span style="color:var(--red)">-' + fmtMoney(worstLoss.stake) + '</span> (' + fmtOdds(worstLoss.odds) + ')';
    }
    return 'No losses found for ' + label + ' yet.';
  }

  /* "best" or "worst" without "win/loss" — show team rankings */
  if (/\bbest\b/.test(q)) {
    var teamGroups = aggregateByKey(settled, function(b) { return extractTeamFromPick(b.pick); });
    return formatRankedList(teamGroups, 'pl', 10, 'Most Profitable Teams (by P/L)');
  }
  if (/\bworst\b/.test(q)) {
    var teamGroups = aggregateByKey(settled, function(b) { return extractTeamFromPick(b.pick); });
    teamGroups.sort(function(a, b) { return a.pl - b.pl; }); /* ascending = worst first */
    var html = '<strong>Least Profitable Teams (by P/L):</strong><br>';
    var top = teamGroups.slice(0, 10);
    for (var i = 0; i < top.length; i++) {
      var g = top[i];
      var plColor = g.pl >= 0 ? 'var(--green)' : 'var(--red)';
      var plSign = g.pl >= 0 ? '+' : '-';
      html += '<span style="color:var(--text2)">' + (i + 1) + '.</span> <strong>' + escHtml(g.name) + '</strong> — ';
      html += '<span style="color:' + plColor + '">' + plSign + fmtMoney(g.pl) + '</span>';
      html += ' <span style="color:var(--text3);font-size:.75rem">(' + g.wins + '-' + g.losses + ', ' + g.bets + ' bets)</span><br>';
    }
    return html;
  }

  /* Average stake */
  if (/average|avg|typical/.test(q)) {
    var totalBetStake = 0;
    for (var i = 0; i < filtered.length; i++) totalBetStake += filtered[i].stake || 0;
    var avgStake = filtered.length > 0 ? totalBetStake / filtered.length : 0;
    return '<strong>Averages for ' + label + ':</strong><br>Avg stake: ' + fmtMoney(avgStake) + '<br>Total bets: ' + filtered.length + '<br>Settled: ' + settled.length + ' | Open: ' + open.length;
  }

  /* How many bets */
  if (/how many|total bets|count/.test(q)) {
    return '<strong>Bet count for ' + label + ':</strong><br>Total: ' + filtered.length + '<br>Settled: ' + settled.length + ' (' + wins + 'W / ' + losses + 'L' + (pushes > 0 ? ' / ' + pushes + 'P' : '') + ')<br>Open: ' + open.length;
  }

  /* Show open bets */
  if (/open|pending|active|current/.test(q)) {
    if (open.length === 0) return 'No open bets for ' + label + '.';
    var list = '';
    for (var i = 0; i < open.length; i++) {
      list += '&#8226; ' + escHtml(open[i].pick) + ' ' + fmtOdds(open[i].odds) + ' (' + fmtMoney(open[i].stake) + ')<br>';
    }
    return '<strong>Open bets for ' + label + ' (' + open.length + '):</strong><br>' + list;
  }

  /* Default: summary */
  var plColor = netPL >= 0 ? 'var(--green)' : 'var(--red)';
  return '<strong>Summary for ' + label + ':</strong><br>' +
    'Record: ' + wins + '-' + losses + (pushes > 0 ? '-' + pushes : '') + '<br>' +
    'Net P/L: <span style="color:' + plColor + '">' + (netPL >= 0 ? '+' : '-') + fmtMoney(netPL) + '</span><br>' +
    'ROI: ' + (roi >= 0 ? '+' : '') + roi.toFixed(1) + '%<br>' +
    'Total wagered: ' + fmtMoney(totalStaked) + '<br>' +
    'Total bets: ' + filtered.length + ' (Open: ' + open.length + ')';
}

/* ===== CONVERSATIONAL CHATBOT ===== */
function handleConversation(text) {
  var t = text.toLowerCase().trim();
  /* Greetings */
  if (/^(hi|hey|hello|yo|sup|what'?s up|howdy|hola|good (morning|afternoon|evening)|gm)\s*[!.?]*$/i.test(t)) {
    var greetings = [
      'Hey! Ready to track some bets? Drop a bet or ask me anything about your record.',
      'What\'s up! Got a bet to log or want to check your stats?',
      'Hey there! Paste a bet, ask about your record, or just chat.',
      'Yo! What are we betting on today?'
    ];
    return greetings[Math.floor(Math.random() * greetings.length)];
  }
  /* Thanks */
  if (/^(thanks|thank you|thx|ty|appreciate it|cheers)\s*[!.]*$/i.test(t)) {
    return 'You got it! Let me know if you need anything else.';
  }
  /* How are you / what can you do */
  if (/^(how are you|how'?s it going|what can you do|help|what do you do)\s*[?!.]*$/i.test(t)) {
    var all = store.bets.concat(store.futures);
    var settled = all.filter(function(b){return b.settled;});
    var open = all.filter(function(b){return !b.settled;});
    return 'I\'m your betting assistant! Here\'s what I can do:<br><br>' +
      '&#8226; <strong>Log bets</strong> — type or paste from Bovada/BetOnline<br>' +
      '&#8226; <strong>Track your record</strong> — ask "how am I doing?"<br>' +
      '&#8226; <strong>Analyze by team/sport</strong> — "net loss from Duke?"<br>' +
      '&#8226; <strong>Find your best/worst bets</strong> — "biggest win?"<br><br>' +
      'Right now you have <strong>' + all.length + '</strong> total bets (' + open.length + ' open, ' + settled.length + ' settled).';
  }
  /* Quick status */
  if (/^(status|summary|overview|dashboard)\s*[?!.]*$/i.test(t)) {
    var all = store.bets.concat(store.futures);
    var settled = all.filter(function(b){return b.settled && b.result;});
    var w = 0, l = 0, p = 0, staked = 0, ret = 0;
    for (var i = 0; i < settled.length; i++) {
      staked += settled[i].stake;
      if (settled[i].result === 'W') { w++; ret += settled[i].stake + settled[i].toWin; }
      else if (settled[i].result === 'L') { l++; }
      else { p++; ret += settled[i].stake; }
    }
    var pl = ret - staked;
    var roi = staked > 0 ? (pl / staked * 100) : 0;
    return '<strong>Quick status:</strong><br>' +
      'Record: <strong>' + w + '-' + l + (p > 0 ? '-' + p : '') + '</strong><br>' +
      'P/L: <span style="color:' + (pl >= 0 ? 'var(--green)' : 'var(--red)') + '"><strong>' + (pl >= 0 ? '+' : '-') + fmtMoney(pl) + '</strong></span><br>' +
      'ROI: ' + (roi >= 0 ? '+' : '') + roi.toFixed(1) + '%<br>' +
      'Total wagered: ' + fmtMoney(staked);
  }
  /* Good game / nice */
  if (/^(nice|lets go|let'?s go|boom|lfg|money|cash|ez|easy|dub)\s*[!.]*$/i.test(t)) {
    var responses = ['Let\'s ride!', 'Money moves!', 'That\'s what we like to see!', 'Stack it up!'];
    return responses[Math.floor(Math.random() * responses.length)];
  }
  /* Sad / bad beat */
  if (/^(damn|ugh|bad beat|brutal|pain|rip|smh|tough|unlucky)\s*[!.]*$/i.test(t)) {
    var responses = ['Tough one. Next bet hits though.', 'Variance is rough sometimes. On to the next.', 'Bad beats happen. Long game.', 'Shake it off, we\'ll get it back.'];
    return responses[Math.floor(Math.random() * responses.length)];
  }
  return null;
}

/* ===== BET PARSER ===== */
function parseBet(input) {
  try {
    var t = input.trim();
    if (!t) return null;
    /* Parlay */
    if (/parlay/i.test(t)) {
      var oddsM = t.match(/([+-]\d{3,4})/);
      var stakeM = t.match(/\$(\d+(?:\.\d+)?)/);
      if (oddsM && stakeM) {
        var odds = parseInt(oddsM[1], 10);
        var stake = parseFloat(stakeM[1]);
        return { type:'parlay', pick:'Parlay', matchup:'Parlay', odds:odds, stake:stake, toWin:calcToWin(stake,odds), sport:'Other' };
      }
      if (stakeM) return { _missingOdds:true, type:'parlay', pick:'Parlay', matchup:'Parlay', stake:parseFloat(stakeM[1]), sport:'Other' };
      return null;
    }
    /* Future */
    if (/\b(future|futures|to win|championship|mvp|roy|dpoy|award)\b/i.test(t)) {
      var oddsM = t.match(/([+-]\d{3,4})/);
      var stakeM = t.match(/\$(\d+(?:\.\d+)?)/);
      if (oddsM && stakeM) {
        var odds = parseInt(oddsM[1], 10);
        var stake = parseFloat(stakeM[1]);
        var pickText = t.replace(/([+-]\d{3,4})/, '').replace(/\$\d+(?:\.\d+)?/, '').replace(/\b(future|futures)\b/gi, '').trim();
        return { type:'future', pick:pickText||'Futures Bet', matchup:'Futures', odds:odds, stake:stake, toWin:calcToWin(stake,odds), sport:detectSport(t) };
      }
      if (stakeM) {
        var pickText = t.replace(/\$\d+(?:\.\d+)?/, '').replace(/\b(future|futures)\b/gi, '').trim();
        return { _missingOdds:true, type:'future', pick:pickText||'Futures Bet', matchup:'Futures', stake:parseFloat(stakeM[1]), sport:detectSport(t) };
      }
    }
    var m;
    m = t.match(/^\$(\d+(?:\.\d+)?)\s+(?:on\s+)?(.+?)\s+([+-]\d+\.?\d*)\s*\(([+-]\d{3,4})\)\s*$/i);
    if (m) return { type:'spread', pick:m[2].trim()+' '+m[3], matchup:m[2].trim(), odds:parseInt(m[4],10), stake:parseFloat(m[1]), toWin:calcToWin(parseFloat(m[1]),parseInt(m[4],10)), sport:detectSport(m[2]) };
    m = t.match(/^\$(\d+(?:\.\d+)?)\s+(?:on\s+)?(.+?)\s+([+-]\d+\.?\d*)\s*$/i);
    if (m) return { _missingOdds:true, type:'spread', pick:m[2].trim()+' '+m[3], matchup:m[2].trim(), stake:parseFloat(m[1]), sport:detectSport(m[2]) };
    m = t.match(/^\$(\d+(?:\.\d+)?)\s+(?:on\s+)?(.+?)\s+ml\s*\(([+-]\d{3,4})\)\s*$/i);
    if (m) return { type:'moneyline', pick:m[2].trim()+' ML', matchup:m[2].trim(), odds:parseInt(m[3],10), stake:parseFloat(m[1]), toWin:calcToWin(parseFloat(m[1]),parseInt(m[3],10)), sport:detectSport(m[2]) };
    m = t.match(/^\$(\d+(?:\.\d+)?)\s+(?:on\s+)?(.+?)\s+ml\s*$/i);
    if (m) return { _missingOdds:true, type:'moneyline', pick:m[2].trim()+' ML', matchup:m[2].trim(), stake:parseFloat(m[1]), sport:detectSport(m[2]) };
    m = t.match(/^(.+?)\s+ml\s*\(([+-]\d{3,4})\)\s*\$(\d+(?:\.\d+)?)/i);
    if (m) return { type:'moneyline', pick:m[1].trim()+' ML', matchup:m[1].trim(), odds:parseInt(m[2],10), stake:parseFloat(m[3]), toWin:calcToWin(parseFloat(m[3]),parseInt(m[2],10)), sport:detectSport(m[1]) };
    m = t.match(/^(.+?)\s+ml\s*\$(\d+(?:\.\d+)?)/i);
    if (m) return { _missingOdds:true, type:'moneyline', pick:m[1].trim()+' ML', matchup:m[1].trim(), stake:parseFloat(m[2]), sport:detectSport(m[1]) };
    m = t.match(/^(.+?)\s+(o|u|over|under)\s*(\d+\.?\d*)\s*\(([+-]\d{3,4})\)\s*\$(\d+(?:\.\d+)?)/i);
    if (m) { var dir = m[2].toLowerCase().charAt(0)==='o'?'Over':'Under'; return { type:'total', pick:dir+' '+m[3], matchup:m[1].trim(), odds:parseInt(m[4],10), stake:parseFloat(m[5]), toWin:calcToWin(parseFloat(m[5]),parseInt(m[4],10)), sport:detectSport(m[1]) }; }
    m = t.match(/^(.+?)\s+(o|u|over|under)\s*(\d+\.?\d*)\s*\$(\d+(?:\.\d+)?)/i);
    if (m) { var dir = m[2].toLowerCase().charAt(0)==='o'?'Over':'Under'; return { _missingOdds:true, type:'total', pick:dir+' '+m[3], matchup:m[1].trim(), stake:parseFloat(m[4]), sport:detectSport(m[1]) }; }
    m = t.match(/^(.+?)\s+([+-]\d+\.?\d*)\s*\(([+-]\d{3,4})\)\s*\$(\d+(?:\.\d+)?)/);
    if (m) return { type:'spread', pick:m[1].trim()+' '+m[2], matchup:m[1].trim(), odds:parseInt(m[3],10), stake:parseFloat(m[4]), toWin:calcToWin(parseFloat(m[4]),parseInt(m[3],10)), sport:detectSport(m[1]) };
    m = t.match(/^(.+?)\s+([+-]\d+\.?\d*)\s+\$(\d+(?:\.\d+)?)$/);
    if (m) return { _missingOdds:true, type:'spread', pick:m[1].trim()+' '+m[2], matchup:m[1].trim(), stake:parseFloat(m[3]), sport:detectSport(m[1]) };
    return null;
  } catch (e) { console.error('Parse error:', e); return null; }
}

/* ═══════════════════════════════════════════════════════════════════════
   MULTI-BET PARSER — handles a free-text list of bets pasted into chat.
   Built 2026-05-10 to fix the case where Claude summarised a list of bets
   but never imported them into Open Bets.

   Triggers on text with 2+ "(+/-odds)" patterns. Splits the message into
   bet candidates, runs parseBet() on each segment, falls back to a looser
   "pick + odds" extractor when parseBet can't lock the format. If a single
   "Total Risked: $X" appears with no per-bet stake, distributes the total
   equally across bets.

   Returns: { bets: [...], unparsed: [...], totalStake } or null if <2 valid.
   ═══════════════════════════════════════════════════════════════════════ */
function parseMultipleBets(text) {
  if (!text || typeof text !== 'string') return null;
  var t = text.trim();

  /* Need at least 2 odds patterns to be a multi-bet */
  var oddsMatches = t.match(/[+\-]\d{3,4}/g) || [];
  if (oddsMatches.length < 2) return null;

  /* Pull a "Total Risked: $X" or "Total: $X" line if present */
  var totalStake = null;
  var totalMatch = t.match(/total(?:\s+risk(?:ed)?)?:?\s*\$([\d,]+(?:\.\d+)?)/i);
  if (totalMatch) totalStake = parseFloat(totalMatch[1].replace(/,/g, ''));

  /* Split on newlines first; for each line that contains 2+ odds patterns,
     further split on commas. Discard headers (lines without odds). */
  var segments = [];
  var lines = t.split(/\n+/);
  for (var li = 0; li < lines.length; li++) {
    var line = lines[li].trim();
    if (!line) continue;
    /* Strip leading bullets/emojis and "Label (N):" prefixes */
    var cleaned = line
      .replace(/^[\-\*•·●◦▪\s]+/, '')
      .replace(/^[\w\s&'/]{1,40}\(\d+\):\s*/, '');
    var lineOdds = cleaned.match(/[+\-]\d{3,4}/g) || [];
    if (lineOdds.length === 0) continue; /* header/note */
    if (lineOdds.length === 1) { segments.push(cleaned); continue; }
    /* Multiple odds on one line → split on commas not inside parens */
    var parts = cleaned.split(/,(?![^()]*\))/);
    for (var pi = 0; pi < parts.length; pi++) {
      var part = parts[pi].trim();
      if (/[+\-]\d{3,4}/.test(part)) segments.push(part);
    }
  }

  if (segments.length < 2) return null;

  /* If a total $ is given but no per-bet stakes, distribute equally */
  var perBetStake = null;
  if (totalStake !== null) {
    perBetStake = Math.round((totalStake / segments.length) * 100) / 100;
  }

  var bets = [];
  var unparsed = [];
  for (var si = 0; si < segments.length; si++) {
    var seg = segments[si];
    var p = parseBet(seg);
    if (!p) {
      /* Loose fallback: pull odds + everything else as pick */
      var oM = seg.match(/[+\-]\d{3,4}/);
      if (!oM) { unparsed.push(seg); continue; }
      var odds = parseInt(oM[0], 10);
      var pickRaw = seg.replace(/\([+\-]\d{3,4}\)/, '').replace(oM[0], '').trim();
      pickRaw = pickRaw.replace(/\s+/g, ' ').replace(/[,;:]+$/, '').trim();
      var lower = pickRaw.toLowerCase();
      var type = 'spread';
      if (/(future|futures|to win|champion|championship|champions|mvp|roy|dpoy|award|winner|division|conference|outright)/.test(lower)) type = 'future';
      else if (/parlay/.test(lower)) type = 'parlay';
      else if (/\bml\b|moneyline/.test(lower)) type = 'moneyline';
      else if (/\bover\b|\bunder\b|\bo\s?\d|\bu\s?\d|total/.test(lower)) type = 'total';
      var stake = perBetStake !== null ? perBetStake : 0;
      var sM = seg.match(/\$([\d,]+(?:\.\d+)?)/);
      if (sM) stake = parseFloat(sM[1].replace(/,/g, ''));
      p = {
        type: type,
        pick: pickRaw || ('Bet ' + (si + 1)),
        matchup: pickRaw || 'Multi-bet entry',
        odds: odds,
        stake: stake,
        toWin: calcToWin(stake, odds),
        sport: detectSport(pickRaw),
      };
    } else {
      /* parseBet got it but stake might be missing — fill from distributed total */
      if ((!p.stake || p.stake === 0) && perBetStake !== null) {
        p.stake = perBetStake;
        p.toWin = calcToWin(perBetStake, p.odds);
        delete p._missingOdds;
      }
    }
    bets.push(p);
  }

  if (bets.length < 2) return null;
  return { bets: bets, unparsed: unparsed, totalStake: totalStake };
}

/* ===== SPORTSBOOK PASTE PARSER (locks25 / BetOnline format) ===== */
function parseSportsbookPaste(text) {
  var bets = [];
  try {
    var blocks = text.split(/(?=(?:STRAIGHT BET|LIVE BETTING BET|PARLAY)\s)/gi);
    for (var bi = 0; bi < blocks.length; bi++) {
      var block = blocks[bi];
      if (block.trim().length < 40) continue;
      var isFuture = /future|to win|championship|mvp|outright/i.test(block);
      var isParlay = /^PARLAY/i.test(block.trim());
      /* Strip bracket tags (dates, networks) before odds extraction so [Mar-22-2026] doesn't get parsed as -2026 */
      var blockNoBrackets = block.replace(/\[[^\]]*\]/g, ' ');
      var oddsMatch = blockNoBrackets.match(/([+-]\d{3,5})/);
      if (!oddsMatch) continue;
      var odds = parseInt(oddsMatch[1], 10);
      var moneyMatch = block.match(/\$([0-9,]+(?:\.\d+)?)\s*\/\s*\$([0-9,]+(?:\.\d+)?)/);
      if (!moneyMatch) continue;
      var stake = parseFloat(moneyMatch[1].replace(/,/g, ''));
      var toWin = parseFloat(moneyMatch[2].replace(/,/g, ''));
      var result = null, settled = false;
      if (/\bWon\b/i.test(block)) { result = 'W'; settled = true; }
      else if (/\bLost\b/i.test(block)) { result = 'L'; settled = true; }
      else if (/\bPush\b/i.test(block)) { result = 'P'; settled = true; }
      var sport = 'Other';
      if (/\bNBA\b/i.test(block)) sport = 'NBA';
      else if (/\bNFL\b|Football/i.test(block)) sport = 'NFL';
      else if (/\bCBB\b|NCAAMB|College Basketball|NCAA.*Men/i.test(block)) sport = 'NCAAMB';
      else if (/NCAAWB|NCAA.*Women/i.test(block)) sport = 'NCAAWB';
      else if (/Soccer|UEFA|ENGLAND|EPL|MLS/i.test(block)) sport = 'Soccer';
      else if (/Basketball/i.test(block)) {
        /* Locks25 uses [BASKETBALL] for both NBA and college games.
           College signals (seed numbers, mascots, school names) take priority over
           NBA team names — e.g. "Houston Rockets" in a CBB block should be Cougars, not Rockets. */
        var _hasCollegeCBB = /\(#\d+\)|Men's College|Men's Coll|NCAAMB|College Basketball|Cougars|Jayhawks|Hawkeyes|Boilermakers|Spartans|Wildcats|Bulldogs|Volunteers|Longhorns|Razorbacks|Tar Heels|Blue Devils|Cornhuskers|Commodores|Mountaineers|Hoosiers|Gators|Aggies/i.test(block);
        var _hasNBATeam = /Cavaliers|Lakers|Spurs|Celtics|Warriors|Nets|Knicks|Bucks|76ers|Sixers|Suns|Heat|Bulls|Mavs|Mavericks|Nuggets|Clippers|Hawks|Grizzlies|Cavs|Wolves|Timberwolves|Pelicans|Raptors|Pacers|Kings|Magic|Wizards|Hornets|Blazers|Trail Blazers|Pistons|Rockets|Thunder|Jazz/i.test(block);
        if (_hasNBATeam && !_hasCollegeCBB) sport = 'NBA';
        else sport = 'NCAAMB';
      }
      /* Extract team/pick from the block */
      var pick = '';
      var matchup = '';
      /* Strip bracket tags from each line before pick strategies */
      var blines = block.split('\n').map(function(l) { return l.replace(/\[[^\]]*\]/g, '').trim(); });

      /* Strategy 1: Find "Team vs Team" line or "Team @ Team" line */
      for (var li = 0; li < blines.length; li++) {
        var ln = blines[li].trim();
        var vsm = ln.match(/(.+?)\s+(?:vs\.?|@)\s+(.+)/i);
        if (vsm && !/STRAIGHT|LIVE BETTING|PARLAY|Won|Lost|Push|\$/i.test(ln)) {
          /* Clean league prefix like "Basketball - Men's College:" */
          var t1 = vsm[1].replace(/^.*?:\s*/, '').trim();
          var t2 = vsm[2].replace(/\s*-\s*(?:Point Spread|Moneyline|Total|Spread|3-Way).*$/i, '').trim();
          /* BetOnline LIVE BETTING BET puts the bet type on the matchup line:
             "Vanderbilt Commodores vs. Nebraska Cornhuskers Live Straight (+158)"
             Strip "Live Straight / Live Game / Straight" plus any trailing odds. */
          t2 = t2.replace(/\s+(?:Live Straight|Live Game|Live|Straight)\s*(?:\([+-]?\d+\))?.*$/i, '').trim();
          t2 = t2.replace(/\s*\([+-]?\d+\)\s*$/, '').trim();
          /* Skip placeholder opponents (BetOnline uses "opponent" for TBD matchups).
             Check with startsWith so "opponent ML +165" etc. also get caught. */
          var t2lc = t2.toLowerCase().replace(/\s+/g, '');
          if (/^(?:opponent|tbd|tba|tobeannounced|tobedetermined)/.test(t2lc)) {
            matchup = t1;
          } else {
            matchup = t1 + ' vs ' + t2;
          }
          break;
        }
      }

      /* Strategy 2: Find pick line (has odds in parens or spread/ML/total) */
      for (var li = 0; li < blines.length; li++) {
        var ln = blines[li].trim();
        if (!ln || /^(?:STRAIGHT|LIVE BETTING|PARLAY|Won|Lost|Push)\b/i.test(ln)) continue;
        if (/\$/.test(ln) || /^\d{1,2}-\d{1,2}/.test(ln)) continue;
        /* Line with odds like (-110) or (+150) and a team/pick name */
        if (/\([+-]\d{3,5}\)/.test(ln) && /[A-Za-z]{2,}/.test(ln)) {
          pick = ln;
          break;
        }
        /* Line with spread like "Team +3.5" or "Over 145.5" */
        if (/[A-Za-z]+.*[+-]\d+\.?\d*\s*\([+-]\d{3}/.test(ln)) {
          pick = ln;
          break;
        }
        if (/(?:Over|Under)\s+\d+\.?\d*/i.test(ln) && ln.length > 8) {
          pick = ln;
          break;
        }
      }

      /* Strategy 3: Legacy patterns */
      if (!pick) {
        var teamMatch = block.match(/\[\d+\]\s+([A-Z][A-Z\s'.&-]+?)\s+([+-]\d+[½¼¾]?)/i);
        if (teamMatch) {
          pick = teamMatch[1].trim() + ' ' + teamMatch[2];
          if (!matchup) matchup = teamMatch[1].trim();
        }
      }
      if (!pick) {
        var rbMatch = block.match(/:\s*(?:Basketball\s+)?(.+?)\s+vs\s+(.+?)\s*-\s*(?:Point Spread|Moneyline|Total)[:\s]+(.+?)\s+([+-]\d+\.?\d*)\s+/i);
        if (rbMatch) {
          if (!matchup) matchup = rbMatch[1].trim() + ' vs ' + rbMatch[2].trim();
          pick = rbMatch[3].trim() + ' ' + rbMatch[4];
        }
      }

      /* Strategy 4: If we have matchup but no pick, derive pick from matchup context */
      if (!pick && matchup) {
        pick = matchup;
      }

      /* Strategy 5: Ultra-fallback — grab first meaningful line */
      if (!pick) {
        for (var li = 0; li < blines.length; li++) {
          var ln = blines[li].trim();
          if (ln.length > 5 && /[A-Za-z]{3,}/.test(ln) && !/^(?:STRAIGHT|LIVE BETTING|PARLAY|Won|Lost|Push)\b/i.test(ln) && !/^\$/.test(ln) && !/^\d{1,2}-\d{1,2}/.test(ln)) {
            pick = ln;
            break;
          }
        }
      }

      if (!pick) pick = 'Bet ' + fmtOdds(odds);
      if (!matchup) matchup = pick;

      /* Cleanup */
      pick = pick.replace(/\(Score:\s*[\d]+-[\d]+[^)]*\)/gi, '').trim();
      pick = pick.replace(/\(Score:\s*[\d]+-[\d]+.*$/gi, '').trim();
      matchup = matchup.replace(/\(Score:\s*[\d]+-[\d]+[^)]*\)/gi, '').trim();
      /* Strip "Live Straight/Live Game" bet-type suffixes left over from BetOnline LIVE BETTING BET format */
      matchup = matchup.replace(/\s+(?:Live Straight|Live Game|Live|Straight)\s*(?:\([+-]?\d+\))?.*$/i, '').trim();
      matchup = matchup.replace(/\s*\([+-]?\d+\)\s*$/, '').trim();
      if (isParlay) { pick = 'Parlay'; matchup = 'Parlay'; }
      if (pick.length > 80) pick = pick.substring(0, 80) + '...';
      /* Extract game time */
      var gtMatch = block.match(/(\d{1,2}-\d{1,2}-\d{4}\s+\d{1,2}:\d{2}\s*[AP]M)/i);
      var gameTime = gtMatch ? gtMatch[1].replace(/-/g, '/') : null;
      var bet = { id:genId(), sport:sport, matchup:matchup, pick:pick, odds:odds, stake:stake, toWin:toWin, settled:settled, result:result, settledDate:settled?new Date().toISOString():null, gameTime:gameTime, addedDate:new Date().toISOString(), type:isParlay?'parlay':'other' };
      bets.push(bet);
    }
  } catch (e) { console.error('Sportsbook parse error:', e); }
  return bets;
}

function parseSportsbookPasteWithDupeCheck(text) {
  var parsed = parseSportsbookPaste(text);
  var added = 0, openCount = 0, settledCount = 0, futureCount = 0;
  for (var i = 0; i < parsed.length; i++) {
    var b = parsed[i];
    if (isDuplicateBet(b)) continue;
    var isFuture = b.type === 'future';
    if (isFuture) { store.futures.push(b); futureCount++; }
    else { store.bets.push(b); if (b.settled) settledCount++; else openCount++; }
    added++;
  }
  return { total: parsed.length, added: added, openCount: openCount, settledCount: settledCount, futureCount: futureCount };
}

/* ===== BOVADA PASTE PARSER (open + settled, singles + parlays) ===== */
function parseBovadaPaste(text) {
  var bets = [];
  try {
    var t = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    /* Primary split: date/time immediately followed by Ref. (standard Bovada format) */
    var blocks = t.split(/(?=\d{1,2}\/\d{1,2}\/\d{2,4}\s+\d{1,2}:\d{2}\s*[AP]M\s*[\n\s]+Ref\.)/i);
    /* Fallback: if only one block, Bovada format may have extra lines between date and Ref. —
       split on any line that starts with a date/time pattern */
    if (blocks.length <= 1) {
      blocks = t.split(/(?=(?:^|\n)\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}\s*[AP]M\b)/i);
    }
    for (var bi = 0; bi < blocks.length; bi++) {
      var block = blocks[bi].trim();
      if (block.length < 30) continue;
      if (!/Ref\.\d+/.test(block)) continue;
      var riskMatch = block.match(/RISK\s+\$\s*([0-9,]+(?:\.\d+)?)/i);
      if (!riskMatch) continue;
      var stake = parseFloat(riskMatch[1].replace(/,/g, ''));
      var oddsMatch = block.match(/ODDS\s+([+-]\d{3,5})/i);
      if (!oddsMatch) continue;
      var odds = parseInt(oddsMatch[1], 10);
      var toWin = 0;
      var twm = block.match(/TO\s+WIN\s+\$\s*([0-9,]+(?:\.\d+)?)/i);
      if (twm) { toWin = parseFloat(twm[1].replace(/,/g, '')); }
      else {
        var wm = block.match(/WINNINGS\s+\+?\s*\$\s*([0-9,]+(?:\.\d+)?)/i);
        if (wm) { var winAmt = parseFloat(wm[1].replace(/,/g, '')); toWin = winAmt > stake ? winAmt - stake : calcToWin(stake, odds); }
        else { toWin = calcToWin(stake, odds); }
      }
      var result = null, settled = false;
      /* Bovada uses WIN/LOSS on their own line; some formats use WON/LOST */
      if (/\n(?:WIN|WON)\s*(?:\n|$)/i.test(block)) { result = 'W'; settled = true; }
      else if (/\n(?:LOSS|LOST)\s*(?:\n|$)/i.test(block)) { result = 'L'; settled = true; }
      else if (/\nPUSH\s*(?:\n|$)/i.test(block)) { result = 'P'; settled = true; }
      else if (/\nVOID\s*(?:\n|$)/i.test(block)) { result = 'P'; settled = true; } /* VOID treated as push */
      else if (/CASHED\s+OUT/i.test(block)) {
        result = 'W'; settled = true;
        var coMatch = block.match(/CASHED\s+OUT\s+\+?\s*\$\s*([0-9,]+(?:\.\d+)?)/i);
        if (coMatch) toWin = parseFloat(coMatch[1].replace(/,/g, ''));
      }
      var parlayMatch = block.match(/(\d+)\s+Team\s+Parlay/i);
      var isParlay = !!parlayMatch;
      var matchups = [];
      var mre = /(?:\(\d+\)\s+)?([A-Z][A-Za-z\s.'&-]+?)(?:\s*\(#?\d+\))?\s+@\s+(?:\(\d+\)\s+)?([A-Z][A-Za-z\s.'&-]+?)(?:\s*\(#?\d+\))?[\s\n]/g;
      var mm;
      while ((mm = mre.exec(block)) !== null) { matchups.push(mm[1].trim() + ' vs ' + mm[2].trim()); }
      var vsm = block.match(/\*\s+([A-Z][A-Za-z\s.'&-]+?)\s+vs\s+([A-Za-z\s.'&-]+?)[\s\n]/i);
      if (vsm && matchups.length === 0) matchups.push(vsm[1].trim() + ' vs ' + vsm[2].trim());
      /* Bovada "Sport Team A vs. Team B - Bet Type: Selection" format (no @ sign) */
      if (matchups.length === 0) {
        var vsBovRe = /^(?:(?:Basketball|Football|Baseball|Hockey|Soccer|Tennis|Boxing|MMA|Golf|Cricket|College)\s+)?([A-Z][A-Za-z\s.'&-]+?)\s+vs\.?\s+([A-Z][A-Za-z\s.'&-]+?)\s+-\s+(?:Money Line|Moneyline|Point Spread|Total(?:\s+Points)?|3-Way Moneyline|Spread)/i;
        var blLines = block.split('\n');
        for (var vbi = 0; vbi < blLines.length; vbi++) {
          var vbm = blLines[vbi].trim().match(vsBovRe);
          if (vbm) { matchups.push(vbm[1].trim() + ' vs ' + vbm[2].trim()); break; }
        }
      }
      var matchup = matchups.length > 0 ? matchups[0] : '';
      var pickLines = [];
      var lines = block.split('\n');
      for (var li = 0; li < lines.length; li++) {
        var line = lines[li].trim();
        if (/\([+-]\d{3,5}\)/.test(line) && /Moneyline|Money Line|Point Spread|Total|Champion|Spread|Over|Under|Exact|Buzzer|Winner|MVP|3-Way/i.test(line)) { pickLines.push(line); }
        else if (/\([+-]\d{3,5}\)\s*\((Game|Live Game|Live Regulation|First|Second)\s/i.test(line)) { pickLines.push(line); }
        else if (/\([+-]\d{3,5}\)/.test(line) && line.length > 5 && !/^Ref\.|^RISK|^ODDS|^TO WIN|^WINNINGS|^WIN$|^LOSS$|^PUSH$|^\d+\s*Team/i.test(line)) { pickLines.push(line); }
      }
      /* Fallback: find lines with team names + spread/ML indicators */
      if (pickLines.length === 0) {
        for (var li = 0; li < lines.length; li++) {
          var line = lines[li].trim();
          if (/[A-Z][a-z]+.*[+-]\d+\.?\d*\s*\(?[+-]?\d{3}/.test(line) && !/^Ref\.|^RISK|^ODDS|^TO WIN|^WINNINGS/i.test(line)) { pickLines.push(line); }
          else if (/(?:Over|Under)\s+\d+\.?\d*/i.test(line) && line.length > 8) { pickLines.push(line); }
        }
      }
      /* Ultra-fallback: any line with a team name and a number */
      if (pickLines.length === 0) {
        for (var li = 0; li < lines.length; li++) {
          var line = lines[li].trim();
          if (line.length > 5 && /[A-Z][a-z]/.test(line) && /[+-]\d/.test(line) && !/^Ref\.|^\d{1,2}\/|^RISK|^ODDS|^TO WIN|^WINNINGS|^\d+\s*Team|^WIN$|^LOSS$|^PUSH$/i.test(line) && !/^CASHED|^PENDING/i.test(line)) { pickLines.push(line); break; }
        }
      }
      var pickLine = '', betType = 'other';
      if (isParlay && pickLines.length > 1) {
        var picks = [];
        for (var pi = 0; pi < pickLines.length; pi++) {
          var p = pickLines[pi].replace(/^\*\s*/, '').replace(/\s*\((?:Game|Live Game|Live Regulation Time|First|Second)\)\s*/gi, ' ').replace(/\s*(?:Moneyline|Money Line|Point Spread|Total|3-Way Moneyline|Spread|Total Points)\s*$/i, '').trim();
          /* Extract selection from Bovada "Sport Team vs Team - Bet Type: Selection (+odds)" */
          var legSel = p.match(/\s+-\s+(?:Money Line|Moneyline|Point Spread|Total(?:\s+Points)?|3-Way Moneyline|Spread)[:\s]+(.+?)(?:\s*\([+-]?\d{3,5}\))?\s*$/i);
          if (legSel) {
            p = legSel[1].replace(/^(?:Basketball|Football|Baseball|Hockey|Soccer|Tennis|Boxing|MMA|Golf|Cricket|College)\s+/i, '').trim();
          }
          /* Strip trailing odds in parens */
          p = p.replace(/\s*\([+-]?\d{3,5}\)\s*$/, '').trim();
          if (p) picks.push(p);
        }
        pickLine = picks.join(' + ');
        betType = 'parlay';
      } else if (pickLines.length > 0) { pickLine = pickLines[0]; }
      pickLine = pickLine.replace(/^\*\s*/, '').trim();
      if (betType !== 'parlay') {
        if (/Moneyline|Money Line|3-Way Moneyline/i.test(pickLine)) betType = 'moneyline';
        else if (/Point Spread|Spread/i.test(pickLine)) betType = 'spread';
        else if (/Total|Over|Under/i.test(pickLine)) betType = 'total';
        else if (/Champion|Championship|Final 4|Buzzer|MVP|Award|Winner|Specials/i.test(pickLine) || /Championship|Specials|NCAA Tournament/i.test(block)) betType = 'future';
      }
      var pick = pickLine;
      pick = pick.replace(/\s*\((?:Game|Live Game|Live Regulation Time|First|Second)\)\s*/gi, ' ');
      pick = pick.replace(/\s*(?:Moneyline|Money Line|Point Spread|Total|3-Way Moneyline|Spread|Total Points)\s*$/i, '').trim();
      /* For Bovada "Sport Team A vs. Team B - Bet Type: Selection (+odds)" format,
         extract just the selected pick after the colon (e.g. "Duke Blue Devils" or "Connecticut -2") */
      if (!isParlay && pick.length > 40) {
        var selMatch = pick.match(/\s+-\s+(?:Money Line|Moneyline|Point Spread|Total(?:\s+Points)?|3-Way Moneyline|Spread)[:\s]+(.+?)(?:\s*\([+-]?\d{3,5}\))?\s*$/i);
        if (selMatch) {
          pick = selMatch[1].replace(/^(?:Basketball|Football|Baseball|Hockey|Soccer|Tennis|Boxing|MMA|Golf|Cricket|College)\s+/i, '').trim();
        }
      }
      /* Final fallback: use matchup or team from @ line */
      if (!pick) {
        if (isParlay && parlayMatch) { pick = parlayMatch[1] + '-Leg Parlay'; }
        else if (matchup) { pick = matchup; }
        else {
          /* Try to grab any team name from block */
          var teamFb = block.match(/(?:^|\n)\s*(?:\(\d+\)\s+)?([A-Z][A-Za-z\s.'&-]{2,25}?)(?:\s*\(#?\d+\))?\s+@\s/m);
          if (teamFb) pick = teamFb[1].trim();
          else pick = 'Bet ' + fmtOdds(odds);
        }
      }
      /* Truncate single-bet picks but preserve parlay legs (they get cleaned at display time) */
      if (!isParlay && pick.length > 100) pick = pick.substring(0, 100) + '...';
      var sport = 'Other';
      /* CBB check runs first — seed numbers like (#2) or school names like Houston
         are unambiguous college signals that beat NBA team name matches (e.g. Rockets). */
      if (/\(#\d+\)|NCAA|Iowa|Florida|Texas Tech|Alabama|Duke|Michigan|Houston|Arkansas|Gonzaga|Purdue|UConn|Connecticut|Kentucky|Kansas|Baylor|Villanova|Creighton|Marquette|Tennessee|Auburn|Nebraska|Vanderbilt|Virginia|St\. John|Saint Louis|Michigan State|Louisville|High Point|Miami Ohio|Long Island|Arizona|Utah State|Missouri|Iowa State|UCLA|San Diego State|Dayton|Saint Mary|Men's College|NCAAMB|College Basketball/i.test(block)) sport = 'NCAAMB';
      else if (/Cavaliers|Lakers|Spurs|Celtics|Warriors|Nets|Knicks|Bucks|76ers|Suns|Heat|Bulls|Mavs|Nuggets|Clippers|Hawks|Grizzlies|Cavs|Wolves|Pelicans|Raptors|Pacers|Kings|Magic|Wizards|Hornets|Blazers|Pistons|Rockets|Thunder|Jazz/i.test(block)) sport = 'NBA';
      else if (/Championship 2025|Championship 2026/i.test(block)) sport = 'NBA';
      else if (/NFL|Football/i.test(block)) sport = 'NFL';
      else if (/Soccer|MLS|UEFA|EPL|La Liga|Bundesliga|Serie A|Ligue 1|Everton|Chelsea|Liverpool|Manchester|Arsenal|Tottenham|Barcelona|Real Madrid|Bayern|Atletico|Atl.tico|West Ham|Regulation Time|Goal Spread|3-Way Moneyline/i.test(block)) sport = 'Soccer';
      else if (/Basketball/i.test(block)) {
        /* Sportsbooks sometimes label college basketball as just "Basketball".
           Check for NBA team names before assuming NBA. */
        if (/Cavaliers|Lakers|Spurs|Celtics|Warriors|Nets|Knicks|Bucks|76ers|Sixers|Suns|Heat|Bulls|Mavs|Mavericks|Nuggets|Clippers|Hawks|Grizzlies|Cavs|Wolves|Timberwolves|Pelicans|Raptors|Pacers|Kings|Magic|Wizards|Hornets|Blazers|Trail Blazers|Pistons|Rockets|Thunder|Jazz/i.test(block)) sport = 'NBA';
        else sport = 'NCAAMB';
      }
      var isFuture = betType === 'future' || /Championship \d{4}/i.test(block) || /NCAA Tournament Specials/i.test(block) || /Champion\b/i.test(pickLine);
      /* Bovada format: first date = settlement/transaction time, second date = game start time.
         Collect all date matches and use the second one so sorting is based on game time. */
      var gameTime = null;
      var allBovadaDates = [];
      var bdRe = /(\d{1,2}\/\d{1,2}\/\d{2,4}\s+\d{1,2}:\d{2}\s*[AP]M)/gi;
      var bdm;
      while ((bdm = bdRe.exec(block)) !== null) { allBovadaDates.push(bdm[1]); }
      if (allBovadaDates.length >= 2) gameTime = allBovadaDates[1];
      else if (allBovadaDates.length === 1) gameTime = allBovadaDates[0];
      var bet = { id:genId(), sport:sport, matchup:isParlay?(parlayMatch[1]+'-Leg Parlay'):(matchup||pick), pick:pick, odds:odds, stake:stake, toWin:toWin>0?toWin:calcToWin(stake,odds), settled:settled, result:result, settledDate:settled?new Date().toISOString():null, gameTime:gameTime, addedDate:new Date().toISOString(), type:isParlay?'parlay':betType };
      if (isFuture && !isParlay) { store.futures.push(bet); } else { store.bets.push(bet); }
      bets.push(bet);
    }
  } catch (e) { console.error('Bovada parse error:', e); }
  return bets;
}

function parseBovadaPasteWithDupeCheck(text) {
  /* Temporarily collect bets without adding to store */
  var origBets = store.bets.slice();
  var origFutures = store.futures.slice();
  var parsed = parseBovadaPaste(text);
  /* parseBovadaPaste already pushed to store — now dedupe */
  var newBets = store.bets.slice(origBets.length);
  var newFutures = store.futures.slice(origFutures.length);
  store.bets = origBets;
  store.futures = origFutures;
  var added = 0, openCount = 0, settledCount = 0, futureCount = 0;
  for (var i = 0; i < newBets.length; i++) {
    if (!isDuplicateBet(newBets[i])) {
      store.bets.push(newBets[i]);
      added++;
      if (newBets[i].settled) settledCount++;
      else openCount++;
    }
  }
  for (var i = 0; i < newFutures.length; i++) {
    if (!isDuplicateBet(newFutures[i])) {
      store.futures.push(newFutures[i]);
      added++;
      futureCount++;
    }
  }
  return { total: parsed.length, added: added, openCount: openCount, settledCount: settledCount, futureCount: futureCount };
}

/* ===== CHAT ===== */

