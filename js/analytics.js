/* Analytics: parlay correlation, steam alerts, tilt score, highlights */
/* Extracted from betting-tracker.html — do not edit the original */

function categorizeLeg(leg) {
  /* Categorize a parlay leg into a generic type */
  var l = leg.toLowerCase();
  if (/\bml\b|moneyline/i.test(l)) return 'ML';
  if (/over\s|under\s|o\d|u\d|total/i.test(l)) return 'O/U';
  if (/[+-]\d+\.?\d*\s*\(/i.test(l) || /\bspread\b|\bats\b/i.test(l)) return 'Spread';
  if (/[+-]\d+\.?\d*/.test(l)) return 'Spread';
  return 'ML'; /* Default to ML */
}

function renderParlayCorrelation() {
  var el = document.getElementById('parlayCorrelationSection');
  if (!el) return;

  var parlays = store.bets.filter(function(b) {
    return b.settled && b.result && (b.type === 'parlay' || /parlay/i.test(b.matchup || ''));
  });

  if (parlays.length < 3) {
    el.innerHTML = '';
    return;
  }

  /* Track leg combinations */
  var comboCounts = {}; /* "type1+type2" => {total, wins} */
  var soloPerformance = {}; /* track individual straight bet performance by type */

  /* Solo performance from straight bets */
  var straights = store.bets.filter(function(b) { return b.settled && b.result && b.type !== 'parlay'; });
  for (var i = 0; i < straights.length; i++) {
    var cat = categorizeLeg(straights[i].pick || '');
    if (!soloPerformance[cat]) soloPerformance[cat] = { total: 0, wins: 0 };
    soloPerformance[cat].total++;
    if (straights[i].result === 'W') soloPerformance[cat].wins++;
  }

  /* Analyze parlay combos */
  var parlayLegTypes = {}; /* "type" => {total legs in parlays, winning parlay legs} */
  for (var i = 0; i < parlays.length; i++) {
    var legs = parseParlayLegs(parlays[i]);
    if (legs.length < 2) continue;
    var types = legs.map(categorizeLeg);

    /* Track leg type frequency in parlays */
    for (var t = 0; t < types.length; t++) {
      if (!parlayLegTypes[types[t]]) parlayLegTypes[types[t]] = { total: 0, inWins: 0 };
      parlayLegTypes[types[t]].total++;
      if (parlays[i].result === 'W') parlayLegTypes[types[t]].inWins++;
    }

    /* Track pairwise combos */
    var uniqueTypes = [];
    var seen = {};
    for (var t = 0; t < types.length; t++) {
      if (!seen[types[t]]) { uniqueTypes.push(types[t]); seen[types[t]] = true; }
    }
    uniqueTypes.sort();
    var comboKey = uniqueTypes.join(' + ');
    if (!comboCounts[comboKey]) comboCounts[comboKey] = { total: 0, wins: 0, legs: uniqueTypes.length };
    comboCounts[comboKey].total++;
    if (parlays[i].result === 'W') comboCounts[comboKey].wins++;
  }

  /* Build table */
  var comboKeys = Object.keys(comboCounts).sort(function(a, b) { return comboCounts[b].total - comboCounts[a].total; });
  if (comboKeys.length === 0) { el.innerHTML = ''; return; }

  var html = '<div class="analytics-card" style="grid-column:span 2">';
  html += '<div class="chart-title">Parlay Leg Correlation Analysis';
  if (parlays.length < 30) {
    html += ' <span style="font-size:.6rem;color:var(--amber);font-weight:400;text-transform:none">(' + parlays.length + ' parlays — too few for reliable signals, treat as directional only)</span>';
  }
  html += '</div>';
  html += '<table class="corr-table"><thead><tr>';
  html += '<th>Combo</th><th>Parlays</th><th>Hit Rate</th><th>Solo Avg</th><th>Signal</th>';
  html += '</tr></thead><tbody>';

  for (var i = 0; i < comboKeys.length; i++) {
    var ck = comboKeys[i];
    var c = comboCounts[ck];
    var hitRate = c.total > 0 ? (c.wins / c.total * 100) : 0;

    /* Calculate expected combo rate from solo rates */
    var types = ck.split(' + ');
    var expectedCombo = 1;
    for (var t = 0; t < types.length; t++) {
      var sp = soloPerformance[types[t]];
      var soloRate = sp && sp.total > 0 ? sp.wins / sp.total : 0.5;
      expectedCombo *= soloRate;
    }
    var expectedPct = expectedCombo * 100;

    var diff = hitRate - expectedPct;
    var flagClass = diff <= -5 ? 'underperform' : diff >= 5 ? 'outperform' : '';
    var flagText = diff <= -5 ? 'UNDERPERFORM' : diff >= 5 ? 'OUTPERFORM' : 'EXPECTED';

    html += '<tr>';
    html += '<td><strong>' + escHtml(ck) + '</strong></td>';
    html += '<td>' + c.total + ' (' + c.wins + 'W)</td>';
    html += '<td>' + hitRate.toFixed(1) + '%</td>';
    html += '<td>' + expectedPct.toFixed(1) + '%</td>';
    html += '<td><span class="corr-flag ' + flagClass + '">' + flagText + ' (' + (diff >= 0 ? '+' : '') + diff.toFixed(1) + '%)</span></td>';
    html += '</tr>';
  }

  /* Add leg-type breakdown */
  html += '</tbody></table>';

  var legKeys = Object.keys(parlayLegTypes);
  if (legKeys.length > 0) {
    html += '<div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--border)">';
    html += '<div style="font-size:.7rem;text-transform:uppercase;letter-spacing:.5px;color:var(--text3);font-weight:700;margin-bottom:8px">Leg Type Usage in Parlays</div>';
    html += '<div style="display:flex;gap:16px;flex-wrap:wrap">';
    for (var i = 0; i < legKeys.length; i++) {
      var lk = legKeys[i];
      var lt = parlayLegTypes[lk];
      var winPct = lt.total > 0 ? (lt.inWins / lt.total * 100).toFixed(0) : 0;
      html += '<div style="font-size:.8rem;color:var(--text)">';
      html += '<strong>' + escHtml(lk) + '</strong>: ' + lt.total + ' legs, in ' + winPct + '% winning parlays';
      html += '</div>';
    }
    html += '</div></div>';
  }

  html += '</div>';
  el.innerHTML = html;
}

/* ===== ODDS MOVEMENT ALERTS ===== */
/* Note: These alerts track day-over-day line movement from daily snapshots.
   They do NOT detect real-time steam moves or sharp action, which require
   minute-by-minute odds feeds. Treat these as market adjustments, not signals. */
var steamAlerts = [];
var steamAlertsVisible = false;

function toggleSteamAlerts() {
  steamAlertsVisible = !steamAlertsVisible;
  var el = document.getElementById('steamAlertsList');
  if (el) el.style.display = steamAlertsVisible ? 'block' : 'none';
  var btn = document.getElementById('steamAlertToggle');
  if (btn) btn.classList.toggle('active', steamAlertsVisible);
}

function detectSteamMoves() {
  /* Scan odds history for 30+ cent moves between daily snapshots */
  steamAlerts = [];
  var keys = Object.keys(cachedOddsHistory);
  var now = Date.now();
  var recentCutoff = now - (24 * 60 * 60 * 1000); /* Last 24 hours */

  for (var i = 0; i < keys.length; i++) {
    var team = keys[i];
    var entries = cachedOddsHistory[team];
    if (!entries || entries.length < 2) continue;

    /* Only look at recent entries */
    var recent = entries.filter(function(e) { return new Date(e.ts).getTime() > recentCutoff; });
    if (recent.length < 2) continue;

    /* Check consecutive entries for rapid moves */
    for (var j = 1; j < recent.length; j++) {
      var prev = recent[j - 1];
      var curr = recent[j];
      var timeDiff = (new Date(curr.ts).getTime() - new Date(prev.ts).getTime()) / (60 * 1000); /* minutes */
      var oddsDiff = curr.odds - prev.odds;

      /* Detect significant moves */
      var isSteam = false;
      var moveDesc = '';

      if (Math.abs(oddsDiff) >= 30) {
        isSteam = true;
        var dir = oddsDiff > 0 ? 'lengthened' : 'shortened';
        moveDesc = fmtOdds(prev.odds) + ' \u2192 ' + fmtOdds(curr.odds) + ' (' + dir + ' ' + Math.abs(oddsDiff) + ' cents)';
      }

      if (isSteam) {
        steamAlerts.push({
          team: team,
          move: moveDesc,
          timeAgo: timeDiff,
          ts: curr.ts,
          direction: oddsDiff > 0 ? 'lengthened' : 'shortened'
        });
      }
    }
  }

  /* Sort by recency */
  steamAlerts.sort(function(a, b) { return new Date(b.ts).getTime() - new Date(a.ts).getTime(); });

  /* Update badge */
  var badge = document.getElementById('steamBadge');
  if (badge) {
    if (steamAlerts.length > 0) {
      badge.textContent = steamAlerts.length;
      badge.style.display = 'inline';
    } else {
      badge.style.display = 'none';
    }
  }

  renderSteamAlerts();
}

function renderSteamAlerts() {
  var el = document.getElementById('steamAlertsList');
  if (!el) return;

  if (steamAlerts.length === 0) {
    el.innerHTML = '<div style="padding:12px;font-size:.8rem;color:var(--text3);text-align:center">No significant odds movement in the last 24 hours. Alerts trigger on 30+ cent changes between daily snapshots.</div>';
    return;
  }

  var html = '';
  var shown = Math.min(steamAlerts.length, 10);
  for (var i = 0; i < shown; i++) {
    var a = steamAlerts[i];
    var icon = a.direction === 'shortened' ? '\u26A1' : '\u2193';
    var timeStr = a.timeAgo < 60 ? Math.round(a.timeAgo) + 'm ago' :
                  a.timeAgo < 1440 ? Math.round(a.timeAgo / 60) + 'h ago' :
                  Math.round(a.timeAgo / 1440) + 'd ago';
    html += '<div class="steam-alert">';
    html += '<span class="steam-icon">' + icon + '</span>';
    html += '<span class="steam-text"><strong>' + escHtml(a.team) + '</strong> ' + escHtml(a.move) + '</span>';
    html += '<span class="steam-meta">' + timeStr + '</span>';
    html += '</div>';
  }
  if (steamAlerts.length > 10) {
    html += '<div style="font-size:.7rem;color:var(--text3);text-align:center;padding:6px">+ ' + (steamAlerts.length - 10) + ' more alerts</div>';
  }
  el.innerHTML = html;
}

/* ===== TILT DETECTOR ===== */
function calcTiltScore() {
  /* Analyze betting behavior patterns after losses.
     Returns: { score: 0-100, avgTimeBetweenAfterLoss, avgTimeBetweenBaseline,
                stakeSizeAfterLoss, stakeSizeBaseline, winRateAfterLoss, winRateBaseline,
                recentTilt: bool, recentDetail: string } */
  var sorted = store.bets.filter(function(b) { return b.settled && b.result; });
  sorted.sort(function(a, b) {
    var ta = parseGameDate(a.gameTime) || (a.settledDate ? new Date(a.settledDate).getTime() : 0);
    var tb = parseGameDate(b.gameTime) || (b.settledDate ? new Date(b.settledDate).getTime() : 0);
    return ta - tb;
  });

  if (sorted.length < 10) return null;

  var result = {
    score: 0,
    avgTimeAfterLoss: 0,
    avgTimeBaseline: 0,
    stakeAfterLoss: 0,
    stakeBaseline: 0,
    winRateAfterLoss: 0,
    winRateBaseline: 0,
    recentTilt: false,
    recentDetail: ''
  };

  /* Compute time gaps between consecutive bets */
  var gapsAfterLoss = [], gapsBaseline = [];
  var stakesAfterLoss = [], stakesBaseline = [];
  var winsAfterLoss = 0, totalAfterLoss = 0;
  var winsBaseline = 0, totalBaseline = 0;

  for (var i = 1; i < sorted.length; i++) {
    var prev = sorted[i - 1];
    var curr = sorted[i];
    var prevTs = parseGameDate(prev.gameTime) || (prev.settledDate ? new Date(prev.settledDate).getTime() : 0);
    var currTs = parseGameDate(curr.gameTime) || (curr.settledDate ? new Date(curr.settledDate).getTime() : 0);
    if (!prevTs || !currTs) continue;

    var gapMins = (currTs - prevTs) / 60000;
    if (gapMins < 0 || gapMins > 10080) continue; /* Skip gaps > 1 week */

    if (prev.result === 'L') {
      gapsAfterLoss.push(gapMins);
      stakesAfterLoss.push(curr.stake);
      totalAfterLoss++;
      if (curr.result === 'W') winsAfterLoss++;
    } else {
      gapsBaseline.push(gapMins);
      stakesBaseline.push(curr.stake);
      totalBaseline++;
      if (curr.result === 'W') winsBaseline++;
    }
  }

  function avg(arr) { return arr.length > 0 ? arr.reduce(function(a, b) { return a + b; }, 0) / arr.length : 0; }

  result.avgTimeAfterLoss = avg(gapsAfterLoss);
  result.avgTimeBaseline = avg(gapsBaseline);
  result.stakeAfterLoss = avg(stakesAfterLoss);
  result.stakeBaseline = avg(stakesBaseline);
  result.winRateAfterLoss = totalAfterLoss > 0 ? (winsAfterLoss / totalAfterLoss * 100) : 0;
  result.winRateBaseline = totalBaseline > 0 ? (winsBaseline / totalBaseline * 100) : 0;

  /* Score components (each 0-33, total 0-100):
     1. Time compression: faster betting after losses
     2. Stake inflation: bigger bets after losses
     3. Win rate drop: worse decisions after losses */
  var timeScore = 0;
  if (result.avgTimeBaseline > 0 && result.avgTimeAfterLoss > 0) {
    var timeRatio = result.avgTimeAfterLoss / result.avgTimeBaseline;
    if (timeRatio < 0.5) timeScore = 33;
    else if (timeRatio < 0.7) timeScore = 25;
    else if (timeRatio < 0.85) timeScore = 15;
    else timeScore = 5;
  }

  var stakeScore = 0;
  if (result.stakeBaseline > 0) {
    var stakeRatio = result.stakeAfterLoss / result.stakeBaseline;
    if (stakeRatio > 1.5) stakeScore = 33;
    else if (stakeRatio > 1.25) stakeScore = 25;
    else if (stakeRatio > 1.1) stakeScore = 15;
    else stakeScore = 5;
  }

  var wrScore = 0;
  if (totalAfterLoss >= 5 && totalBaseline >= 5) {
    var wrDiff = result.winRateBaseline - result.winRateAfterLoss;
    if (wrDiff > 15) wrScore = 34;
    else if (wrDiff > 10) wrScore = 25;
    else if (wrDiff > 5) wrScore = 15;
    else wrScore = 5;
  }

  result.score = timeScore + stakeScore + wrScore;

  /* Check recent tilt: last 3 hours of activity */
  var recentCutoff = Date.now() - (3 * 60 * 60 * 1000);
  var recentBets = sorted.filter(function(b) {
    var ts = parseGameDate(b.gameTime) || (b.settledDate ? new Date(b.settledDate).getTime() : 0);
    return ts > recentCutoff;
  });
  var recentLosses = recentBets.filter(function(b) { return b.result === 'L'; }).length;
  if (recentBets.length >= 4 && recentLosses >= 3) {
    result.recentTilt = true;
    result.recentDetail = recentBets.length + ' bets in 3 hours after going ' +
      (recentBets.length - recentLosses) + '-' + recentLosses + '. Post-loss win rate: ' +
      result.winRateAfterLoss.toFixed(0) + '% vs baseline ' + result.winRateBaseline.toFixed(0) + '%.';
  }

  return result;
}

/* ===== HIGHLIGHTS TAB ===== */
function renderHighlights() {
  var el = document.getElementById('highlightsContent');
  if (!el) return;
  var settled = store.bets.concat(store.futures).filter(function(b) { return b.settled && b.result; });
  if (settled.length === 0) {
    el.innerHTML = '<div class="empty-state">No settled bets yet. Settle some bets to see your highlights.</div>';
    return;
  }

  /* Sort by game time for streak calc */
  var bySortTime = settled.slice().sort(function(a, b) {
    var ta = parseGameDate(a.gameTime) || (a.settledDate ? new Date(a.settledDate).getTime() : 0);
    var tb = parseGameDate(b.gameTime) || (b.settledDate ? new Date(b.settledDate).getTime() : 0);
    return ta - tb;
  });

  /* Best win / worst loss — skip weekly aggregates so the hero cards reflect
     a real single bet, not a season-week bundle. */
  var bestWin = null, worstLoss = null;
  for (var i = 0; i < settled.length; i++) {
    var b = settled[i];
    if (b.type === 'weekly') continue;
    if (b.result === 'W' && (!bestWin || b.toWin > bestWin.toWin)) bestWin = b;
    if (b.result === 'L' && (!worstLoss || b.stake > worstLoss.stake)) worstLoss = b;
  }

  /* Streaks */
  var bestStreak = 0, worstStreak = 0, curW = 0, curL = 0;
  var finalResult = '', finalStreak = 0;
  for (var i = 0; i < bySortTime.length; i++) {
    var r = bySortTime[i].result;
    if (r === 'P') continue;
    if (r === 'W') { curW++; curL = 0; } else { curL++; curW = 0; }
    if (curW > bestStreak) bestStreak = curW;
    if (curL > worstStreak) worstStreak = curL;
  }
  /* Current streak from most recent bets */
  for (var i = bySortTime.length - 1; i >= 0; i--) {
    var r = bySortTime[i].result;
    if (r === 'P') continue;
    if (!finalResult) { finalResult = r; finalStreak = 1; }
    else if (r === finalResult) finalStreak++;
    else break;
  }

  /* Best sport by ROI */
  var sportStats = {};
  for (var i = 0; i < settled.length; i++) {
    var b = settled[i], sp = b.sport || 'Other';
    if (!sportStats[sp]) sportStats[sp] = { pl: 0, stake: 0 };
    sportStats[sp].stake += b.stake;
    if (b.result === 'W') sportStats[sp].pl += b.toWin;
    else if (b.result === 'L') sportStats[sp].pl -= b.stake;
  }
  var bestSport = null, bestSportROI = -Infinity;
  var spKeys = Object.keys(sportStats);
  for (var i = 0; i < spKeys.length; i++) {
    var sp = spKeys[i], sd = sportStats[sp];
    if (sd.stake > 0) { var roi = sd.pl / sd.stake * 100; if (roi > bestSportROI) { bestSportROI = roi; bestSport = sp; } }
  }

  /* Hero cards */
  var html = '<div class="highlights-hero">';

  html += '<div class="highlight-card"><div class="h-icon">\uD83C\uDFC6</div><div class="h-label">Best Win</div>';
  if (bestWin) {
    html += '<div class="h-value" style="color:var(--green)">+' + fmtMoney(bestWin.toWin) + '</div>';
    html += '<div class="h-sub" title="' + escHtml(displayPickForCard(bestWin)) + '">' + escHtml(displayPickForCard(bestWin)) + '</div>';
  } else { html += '<div class="h-value" style="color:var(--text3)">-</div><div class="h-sub">No wins yet</div>'; }
  html += '</div>';

  html += '<div class="highlight-card"><div class="h-icon">\uD83D\uDD25</div><div class="h-label">Best Streak</div>';
  html += '<div class="h-value" style="color:var(--green)">' + bestStreak + ' W' + (bestStreak !== 1 ? 's' : '') + '</div>';
  html += '<div class="h-sub">In a row (all-time)</div></div>';

  html += '<div class="highlight-card"><div class="h-icon">\uD83D\uDCA3</div><div class="h-label">Biggest Loss</div>';
  if (worstLoss) {
    html += '<div class="h-value" style="color:var(--red)">-' + fmtMoney(worstLoss.stake) + '</div>';
    html += '<div class="h-sub" title="' + escHtml(displayPickForCard(worstLoss)) + '">' + escHtml(displayPickForCard(worstLoss)) + '</div>';
  } else { html += '<div class="h-value" style="color:var(--text3)">-</div><div class="h-sub">No losses yet</div>'; }
  html += '</div>';

  html += '<div class="highlight-card"><div class="h-icon">\uD83C\uDFAF</div><div class="h-label">Best Sport</div>';
  if (bestSport) {
    html += '<div class="h-value" style="color:var(--blue)">' + escHtml(bestSport) + '</div>';
    html += '<div class="h-sub">' + (bestSportROI >= 0 ? '+' : '') + bestSportROI.toFixed(1) + '% ROI</div>';
  } else { html += '<div class="h-value" style="color:var(--text3)">-</div><div class="h-sub">No data</div>'; }
  html += '</div></div>';

  /* Current streak banner */
  if (finalStreak > 0 && finalResult) {
    var sc = finalResult === 'W' ? 'var(--green)' : 'var(--red)';
    var sl = finalResult === 'W' ? 'win' : 'loss';
    html += '<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:12px 20px;margin-bottom:16px;display:flex;align-items:center;gap:12px">';
    html += '<span style="font-size:.75rem;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.5px">Current Streak</span>';
    html += '<span style="font-size:1.1rem;font-weight:800;color:' + sc + '">' + finalStreak + ' ' + sl + (finalStreak > 1 ? 's' : '') + ' in a row</span>';
    html += '</div>';
  }

  /* Recent form — last 20 bets, newest first */
  var last20 = bySortTime.slice(-20).reverse();
  html += '<div class="recent-form-section"><h3>Recent Form (Last ' + last20.length + ')</h3><div class="recent-form-strip">';
  for (var i = 0; i < last20.length; i++) {
    var b = last20[i];
    var pick = displayPickForCard(b).replace(/\s+[+\-]\d[\d.]*\s*\(.*$/, '').replace(/\s+[+\-]\d[\d.]*$/, '').trim();
    if (pick.length > 11) pick = pick.substring(0, 11) + '\u2026';
    var plStr = b.result === 'W' ? '+' + fmtMoney(b.toWin) : b.result === 'L' ? '-' + fmtMoney(b.stake) : 'Push';
    var plColor = b.result === 'W' ? 'var(--green)' : b.result === 'L' ? 'var(--red)' : 'var(--amber)';
    html += '<div class="form-tile"><div class="f-badge ' + b.result + '">' + b.result + '</div>';
    html += '<div class="f-meta" title="' + escHtml(displayPickForCard(b)) + '">' + escHtml(pick) + '</div>';
    html += '<div class="f-meta" style="color:' + plColor + '">' + plStr + '</div></div>';
  }
  html += '</div></div>';

  /* Top 5 wins + biggest 5 losses — exclude legacy weekly aggregates so
     individual bets surface instead of "Week N Summary" bundles. */
  var nonWeekly = settled.filter(function(b) { return b.type !== 'weekly'; });
  var topWins = nonWeekly.filter(function(b) { return b.result === 'W'; }).sort(function(a, b) { return b.toWin - a.toWin; }).slice(0, 5);
  var topLosses = nonWeekly.filter(function(b) { return b.result === 'L'; }).sort(function(a, b) { return b.stake - a.stake; }).slice(0, 5);

  function topRow(b, rank, isWin) {
    var pl = isWin ? '+' + fmtMoney(b.toWin) : '-' + fmtMoney(b.stake);
    var plColor = isWin ? 'var(--green)' : 'var(--red)';
    var name = displayPickForCard(b).replace(/\s+[+\-]\d[\d.]*\s*\(.*$/, '').replace(/\s+[+\-]\d[\d.]*$/, '').trim();
    var meta = escHtml((b.sport || '') + ' \u00b7 ' + fmtOdds(b.odds));
    return '<div class="top-bet-row"><span class="rank">' + rank + '</span>' +
      '<div class="pick-col"><div class="pick-name">' + escHtml(name) + '</div><div class="pick-meta">' + meta + '</div></div>' +
      '<span class="pnl" style="color:' + plColor + '">' + pl + '</span></div>';
  }

  html += '<div class="top-bets-grid">';
  html += '<div class="top-bets-section"><h3>\uD83C\uDFC6 Top Wins</h3>';
  if (topWins.length === 0) html += '<div style="color:var(--text3);font-size:.8rem;padding:8px 0">No wins yet</div>';
  for (var i = 0; i < topWins.length; i++) html += topRow(topWins[i], i + 1, true);
  html += '</div>';

  html += '<div class="top-bets-section"><h3>\uD83D\uDE28 Biggest Losses</h3>';
  if (topLosses.length === 0) html += '<div style="color:var(--text3);font-size:.8rem;padding:8px 0">No losses yet</div>';
  for (var i = 0; i < topLosses.length; i++) html += topRow(topLosses[i], i + 1, false);
  html += '</div>';
  html += '</div>';

  /* ===== CLV SUMMARY ===== */
  var clvBets = settled.filter(function(b) { return calcCLV(b) !== null; });
  if (clvBets.length >= 3) {
    var totalClv = 0, posClv = 0, negClv = 0;
    for (var ci = 0; ci < clvBets.length; ci++) {
      var cv = calcCLV(clvBets[ci]);
      totalClv += cv;
      if (cv >= 2) posClv++;
      if (cv <= -2) negClv++;
    }
    var avgClv = totalClv / clvBets.length;
    var clvColor = avgClv >= 0 ? 'var(--green)' : 'var(--red)';

    html += '<div class="tilt-card" style="margin-bottom:16px">';
    html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">';
    html += '<span style="font-size:.75rem;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.5px">Closing Line Value</span>';
    html += '<span style="font-size:1.1rem;font-weight:800;color:' + clvColor + '">' + (avgClv >= 0 ? '+' : '') + avgClv.toFixed(1) + '% avg CLV</span>';
    html += '</div>';
    html += '<div class="tilt-stats">';
    html += '<div class="tilt-stat"><div class="ts-val" style="color:var(--text)">' + clvBets.length + '</div><div class="ts-label">Bets w/ CLV</div></div>';
    html += '<div class="tilt-stat"><div class="ts-val" style="color:var(--green)">' + posClv + '</div><div class="ts-label">Beat Line (2%+)</div></div>';
    html += '<div class="tilt-stat"><div class="ts-val" style="color:var(--red)">' + negClv + '</div><div class="ts-label">Behind Line</div></div>';
    html += '</div></div>';
  }

  /* ===== TILT DETECTOR ===== */
  var tilt = calcTiltScore();
  if (tilt) {
    var tiltColor = tilt.score <= 30 ? 'tilt-score-low' : tilt.score <= 60 ? 'tilt-score-med' : 'tilt-score-high';
    var tiltLabel = tilt.score <= 30 ? 'Cool & Collected' : tilt.score <= 60 ? 'Mild Tilt' : 'On Tilt';
    var tiltTextColor = tilt.score <= 30 ? 'var(--green)' : tilt.score <= 60 ? 'var(--amber)' : 'var(--red)';

    html += '<div class="tilt-card">';
    html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">';
    html += '<span style="font-size:.75rem;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.5px">Tilt Detector</span>';
    html += '<span style="font-size:.9rem;font-weight:800;color:' + tiltTextColor + '">' + tiltLabel + ' (' + tilt.score + '/100)</span>';
    html += '</div>';
    html += '<div class="tilt-meter"><div class="tilt-meter-fill ' + tiltColor + '" style="width:' + tilt.score + '%"></div></div>';

    if (tilt.recentTilt) {
      html += '<div style="background:rgba(255,71,87,.1);border:1px solid rgba(255,71,87,.2);border-radius:6px;padding:8px 12px;margin-top:8px;font-size:.78rem;color:var(--red)">';
      html += tilt.recentDetail;
      html += '</div>';
    }

    html += '<div class="tilt-stats">';
    html += '<div class="tilt-stat">';
    var timeAfterStr = tilt.avgTimeAfterLoss < 60 ? tilt.avgTimeAfterLoss.toFixed(0) + 'm' : (tilt.avgTimeAfterLoss / 60).toFixed(1) + 'h';
    var timeBaseStr = tilt.avgTimeBaseline < 60 ? tilt.avgTimeBaseline.toFixed(0) + 'm' : (tilt.avgTimeBaseline / 60).toFixed(1) + 'h';
    html += '<div class="ts-val" style="color:' + (tilt.avgTimeAfterLoss < tilt.avgTimeBaseline * 0.8 ? 'var(--red)' : 'var(--text)') + '">' + timeAfterStr + '</div>';
    html += '<div class="ts-label">Avg Gap After Loss (vs ' + timeBaseStr + ')</div></div>';

    html += '<div class="tilt-stat">';
    html += '<div class="ts-val" style="color:' + (tilt.stakeAfterLoss > tilt.stakeBaseline * 1.15 ? 'var(--red)' : 'var(--text)') + '">$' + tilt.stakeAfterLoss.toFixed(0) + '</div>';
    html += '<div class="ts-label">Avg Stake After Loss (vs $' + tilt.stakeBaseline.toFixed(0) + ')</div></div>';

    html += '<div class="tilt-stat">';
    html += '<div class="ts-val" style="color:' + (tilt.winRateAfterLoss < tilt.winRateBaseline - 5 ? 'var(--red)' : 'var(--text)') + '">' + tilt.winRateAfterLoss.toFixed(1) + '%</div>';
    html += '<div class="ts-label">Win Rate After Loss (vs ' + tilt.winRateBaseline.toFixed(1) + '%)</div></div>';
    html += '</div></div>';
  }

  el.innerHTML = html;
}

/* ===== TEAM ANALYSIS ===== */

function renderTeamAnalysis() {
  var el = document.getElementById('teamAnalysisSection');
  if (!el) return;

  var settled = store.bets.filter(function(b) {
    return b.settled && b.result && b.type !== 'parlay' && !isFutureBet(b);
  });

  if (settled.length === 0) { el.innerHTML = ''; return; }

  /* Aggregate stats per team */
  var teams = {}; /* teamName => { forW, forL, forP, forPL, againstW, againstL, againstP, againstPL } */

  function ensureTeam(name) {
    if (!name) return null;
    var key = name.trim();
    if (!key) return null;
    if (!teams[key]) teams[key] = { forW:0, forL:0, forP:0, forPL:0, againstW:0, againstL:0, againstP:0, againstPL:0 };
    return key;
  }

  for (var i = 0; i < settled.length; i++) {
    var b = settled[i];
    var pl = (parseFloat(b.toWin) || 0) - (parseFloat(b.stake) || 0);
    if (b.result === 'W') pl = parseFloat(b.toWin) || 0;
    else if (b.result === 'L') pl = -(parseFloat(b.stake) || 0);
    else pl = 0; /* Push */

    var forKey = ensureTeam(b.teamBetOn);
    if (forKey) {
      if (b.result === 'W') { teams[forKey].forW++; teams[forKey].forPL += pl; }
      else if (b.result === 'L') { teams[forKey].forL++; teams[forKey].forPL += pl; }
      else { teams[forKey].forP++; }
    }

    var againstKey = ensureTeam(b.opponent);
    if (againstKey) {
      if (b.result === 'W') { teams[againstKey].againstW++; teams[againstKey].againstPL += pl; }
      else if (b.result === 'L') { teams[againstKey].againstL++; teams[againstKey].againstPL += pl; }
      else { teams[againstKey].againstP++; }
    }
  }

  var rows = Object.keys(teams).map(function(name) {
    var t = teams[name];
    var forTotal = t.forW + t.forL + t.forP;
    var againstTotal = t.againstW + t.againstL + t.againstP;
    var total = forTotal + againstTotal;
    var forWinPct = forTotal > 0 ? (t.forW / forTotal * 100) : null;
    var againstWinPct = againstTotal > 0 ? (t.againstW / againstTotal * 100) : null;
    return { name: name, forW: t.forW, forL: t.forL, forP: t.forP, forTotal: forTotal,
             forPL: t.forPL, forWinPct: forWinPct,
             againstW: t.againstW, againstL: t.againstL, againstP: t.againstP,
             againstTotal: againstTotal, againstPL: t.againstPL, againstWinPct: againstWinPct,
             total: total };
  });

  /* Sort by total bets desc */
  rows.sort(function(a, b) { return b.total - a.total; });

  /* Only show teams with at least 1 bet */
  rows = rows.filter(function(r) { return r.total > 0; });
  if (rows.length === 0) { el.innerHTML = ''; return; }

  function fmtRecord(w, l, p) {
    return p > 0 ? (w + '-' + l + '-' + p) : (w + '-' + l);
  }
  function fmtPL(v) {
    var s = (v >= 0 ? '+' : '') + '$' + Math.abs(v).toFixed(0);
    return '<span style="color:' + (v > 0 ? 'var(--green)' : v < 0 ? 'var(--red)' : 'var(--text3)') + '">' + s + '</span>';
  }
  function fmtPct(v) {
    if (v === null) return '<span style="color:var(--text3)">—</span>';
    return '<span style="color:' + (v >= 55 ? 'var(--green)' : v < 45 ? 'var(--red)' : 'var(--text3)') + '">' + v.toFixed(0) + '%</span>';
  }

  var html = '<div class="analytics-card" style="overflow-x:auto">';
  html += '<div class="chart-title" style="margin-bottom:12px">Team Performance Analysis</div>';
  html += '<table style="width:100%;border-collapse:collapse;font-size:.78rem">';
  html += '<thead><tr style="border-bottom:1px solid var(--border)">';
  html += '<th style="text-align:left;padding:6px 8px;color:var(--text3);font-weight:600">Team</th>';
  html += '<th style="text-align:center;padding:6px 8px;color:var(--text3);font-weight:600" colspan="3">Bet FOR</th>';
  html += '<th style="text-align:center;padding:6px 8px;color:var(--text3);font-weight:600" colspan="3">Bet AGAINST</th>';
  html += '</tr>';
  html += '<tr style="border-bottom:1px solid var(--border)">';
  html += '<th style="padding:4px 8px"></th>';
  html += '<th style="text-align:center;padding:4px 8px;color:var(--text3);font-size:.72rem">Record</th>';
  html += '<th style="text-align:center;padding:4px 8px;color:var(--text3);font-size:.72rem">Win%</th>';
  html += '<th style="text-align:center;padding:4px 8px;color:var(--text3);font-size:.72rem">P&amp;L</th>';
  html += '<th style="text-align:center;padding:4px 8px;color:var(--text3);font-size:.72rem">Record</th>';
  html += '<th style="text-align:center;padding:4px 8px;color:var(--text3);font-size:.72rem">Win%</th>';
  html += '<th style="text-align:center;padding:4px 8px;color:var(--text3);font-size:.72rem">P&amp;L</th>';
  html += '</tr></thead><tbody>';

  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var rowBg = i % 2 === 0 ? '' : 'background:rgba(255,255,255,.03)';
    html += '<tr style="border-bottom:1px solid rgba(255,255,255,.04);' + rowBg + '">';
    html += '<td style="padding:7px 8px;font-weight:600;white-space:nowrap">' + r.name + '</td>';
    if (r.forTotal > 0) {
      html += '<td style="text-align:center;padding:7px 8px">' + fmtRecord(r.forW, r.forL, r.forP) + '</td>';
      html += '<td style="text-align:center;padding:7px 8px">' + fmtPct(r.forWinPct) + '</td>';
      html += '<td style="text-align:center;padding:7px 8px">' + fmtPL(r.forPL) + '</td>';
    } else {
      html += '<td colspan="3" style="text-align:center;padding:7px 8px;color:var(--text3)">—</td>';
    }
    if (r.againstTotal > 0) {
      html += '<td style="text-align:center;padding:7px 8px">' + fmtRecord(r.againstW, r.againstL, r.againstP) + '</td>';
      html += '<td style="text-align:center;padding:7px 8px">' + fmtPct(r.againstWinPct) + '</td>';
      html += '<td style="text-align:center;padding:7px 8px">' + fmtPL(r.againstPL) + '</td>';
    } else {
      html += '<td colspan="3" style="text-align:center;padding:7px 8px;color:var(--text3)">—</td>';
    }
    html += '</tr>';
  }

  html += '</tbody></table></div>';
  el.innerHTML = html;
}

/* ===== LIVE SCORES ===== */

