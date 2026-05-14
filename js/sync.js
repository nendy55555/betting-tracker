/* Bet log, tab switching, settings, Excel sync, init */
/* Extracted from betting-tracker.html — do not edit the original */

function setBetLogFilter(f) {
  betLogState.filter = f;
  document.querySelectorAll('.bl-filter-btn').forEach(function(b) {
    b.classList.toggle('active', b.dataset.result === f);
  });
  renderBetLog();
}

function setBetLogSort(col) {
  if (betLogState.sort === col) {
    betLogState.dir = betLogState.dir === 'desc' ? 'asc' : 'desc';
  } else {
    betLogState.sort = col;
    betLogState.dir = 'desc';
  }
  renderBetLog();
}

function renderBetLog() {
  var tbody = document.getElementById('betlogBody');
  var countEl = document.getElementById('betlogCount');
  if (!tbody) return;

  var q = (document.getElementById('betlogSearch') ? document.getElementById('betlogSearch').value : '').toLowerCase().trim();
  var allBets = store.bets || [];

  /* Filter by result bucket */
  var rows = allBets.filter(function(b) {
    var f = betLogState.filter;
    if (f === 'all') return true;
    if (f === 'open') return !b.settled || !b.result;
    return b.result === f;
  });

  /* Filter by search query */
  if (q) {
    rows = rows.filter(function(b) {
      return ((b.matchup || '') + ' ' + (b.pick || '') + ' ' + (b.sport || '') + ' ' + (b.type || '')).toLowerCase().indexOf(q) !== -1;
    });
  }

  /* Sort */
  var s = betLogState.sort;
  var dir = betLogState.dir === 'asc' ? 1 : -1;
  rows = rows.slice().sort(function(a, b) {
    var av, bv;
    if (s === 'date') {
      av = getBetSortTime(a); bv = getBetSortTime(b);
    } else if (s === 'odds') {
      av = Math.abs(a.odds || 0); bv = Math.abs(b.odds || 0);
    } else if (s === 'stake') {
      av = a.stake || 0; bv = b.stake || 0;
    } else if (s === 'pl') {
      av = betLogPL(a); bv = betLogPL(b);
    } else {
      av = getBetSortTime(a); bv = getBetSortTime(b);
    }
    if (av === bv) return 0;
    return av < bv ? dir : -dir;
  });

  /* Update sort icons */
  ['date','odds','stake','pl'].forEach(function(col) {
    var el = document.getElementById('blsi-' + col);
    if (!el) return;
    if (col !== betLogState.sort) { el.textContent = ''; return; }
    el.textContent = betLogState.dir === 'desc' ? '↓' : '↑';
  });

  /* Update count */
  if (countEl) countEl.textContent = rows.length + ' bet' + (rows.length === 1 ? '' : 's');

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="11" class="bl-empty">📭 No bets match this filter. <button onclick="setBetLogFilter(\'all\')" style="margin-left:8px;background:none;border:1px solid var(--border);color:var(--blue);border-radius:4px;padding:2px 8px;cursor:pointer;font-family:inherit;font-size:var(--fs-sm)">Clear filter</button></td></tr>';
    return;
  }

  var html = '';
  for (var i = 0; i < rows.length; i++) {
    var b = rows[i];
    var isOpen = !b.settled || !b.result;
    var pl = betLogPL(b);
    var plClass = isOpen ? 'bl-pl-zero' : (pl > 0 ? 'bl-pl-pos' : pl < 0 ? 'bl-pl-neg' : 'bl-pl-zero');
    var plStr = isOpen ? '—' : (pl >= 0 ? '+$' + pl.toFixed(2) : '-$' + Math.abs(pl).toFixed(2));
    var resultKey = isOpen ? 'open' : (b.result || '');
    var resultLabel = isOpen ? 'Pending' : (b.result === 'W' ? 'Won' : b.result === 'L' ? 'Lost' : b.result === 'P' ? 'Push' : b.result);
    var sc = sportClass(b.sport);
    var isParlay = b.type === 'parlay' || /parlay/i.test(b.matchup || '');
    var typeLabel = isParlay ? 'Parlay' : 'Straight';
    var dateStr = betLogDateStr(b);

    html += '<tr>';
    html += '<td class="bl-muted" style="white-space:nowrap">' + escHtml(dateStr) + '</td>';
    html += '<td><span class="sport-tag ' + sc + '">' + escHtml(b.sport || 'Other') + '</span></td>';
    html += '<td class="bl-muted" style="font-size:.72rem;white-space:nowrap">' + typeLabel + '</td>';
    var cleanMatchup = shortenMatchupDisplay(b.matchup) || b.matchup || '—';
    var cleanPick    = buildPickDisplay(b) || '—';
    html += '<td class="bl-matchup bl-muted" title="' + escHtml(b.matchup || '') + '">' + escHtml(cleanMatchup) + '</td>';
    html += '<td class="bl-pick" title="' + escHtml(b.pick || '') + '">' + escHtml(cleanPick) + '</td>';
    html += '<td class="bl-num bl-muted">' + fmtOdds(b.odds) + '</td>';
    html += '<td class="bl-num">' + fmtMoney(b.stake || 0) + '</td>';
    html += '<td class="bl-num bl-muted">' + fmtMoney(b.toWin || 0) + '</td>';
    html += '<td class="bl-num ' + plClass + '">' + plStr + '</td>';
    html += '<td><span class="bl-result-badge ' + resultKey + '">' + resultLabel + '</span></td>';
    html += '<td><button class="bl-edit-btn" onclick="editBet(\'' + b.id + '\')" title="Manually edit this bet">Edit</button></td>';
    html += '</tr>';
  }
  tbody.innerHTML = html;
}

function betLogPL(b) {
  if (!b.settled || !b.result) return 0;
  if (b.result === 'W') return b.toWin || 0;
  if (b.result === 'L') return -(b.stake || 0);
  return 0; /* Push */
}

function betLogDateStr(b) {
  var t = getBetSortTime(b);
  if (!t) return '—';
  var d = new Date(t);
  var mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()];
  return mo + ' ' + d.getDate() + ', ' + d.getFullYear();
}

/* ===== TAB / NAV ===== */
function switchTab(tab) {
  store.currentTab = tab;
  var tabs = document.querySelectorAll('.tab-content');
  for (var i = 0; i < tabs.length; i++) tabs[i].classList.remove('active');
  document.getElementById(tab + '-tab').classList.add('active');
  var btns = document.querySelectorAll('.nav-btn');
  for (var i = 0; i < btns.length; i++) btns[i].classList.toggle('active', btns[i].dataset.tab === tab);
  /* Render only the active tab */
  if (tab === 'home') { renderDashStats(); renderOpenBets(); renderSettledBets(); renderHomeCharts(); renderChat(); updateHomeFilterToggle(); }
  else if (tab === 'analytics') { renderHighlights(); renderAnalyticsCharts(); renderDeepAnalysis(); }
  else if (tab === 'deepanalysis') { switchTab('analytics'); return; }
  else if (tab === 'highlights') { switchTab('analytics'); return; }
  else if (tab === 'futures') { renderFutures(); fetchFuturesOdds(); }
  else if (tab === 'upcoming') initUpcomingTab();
  else if (tab === 'betlog') renderBetLog();
}

/* ===== SETTINGS ===== */
function toggleSettings() {
  var modal = document.getElementById('settingsModal');
  modal.classList.toggle('show');
  if (modal.classList.contains('show')) {
    document.getElementById('defaultStake').value = store.defaultStake;
    document.getElementById('oddsApiKey').value = store.oddsApiKey || '';
    document.getElementById('claudeApiKey').value = store.claudeApiKey || '';
  }
}

function saveSettings() {
  store.defaultStake = parseInt(document.getElementById('defaultStake').value, 10) || 50;
  store.claudeApiKey = (document.getElementById('claudeApiKey').value || '').trim();
  store.oddsApiKey   = (document.getElementById('oddsApiKey').value   || '').trim();
  saveData();
  toggleSettings();
  fetchFuturesOdds();
}

function clearAllData() {
  if (confirm('This will delete ALL your bets and data. Are you sure?')) {
    store.bets = [];
    store.futures = [];
    store.chatHistory = [];
    store.pendingConfirmation = null;
    store.awaitingOdds = null;
    saveData();
    renderAll();
    addChat('system', 'All data has been cleared.');
    toggleSettings();
  }
}

/* ===== SERVER→TRACKER BET MAPPER (shared by syncFromExcel + autoSyncIfInflated) ===== */
function mapServerBet(b) {
  var teamBetOn = b.teamBetOn || extractTeamFromMatchup(b.matchup || '');
  var opponent  = b.opponent  || extractOpponentFromMatchup(b.matchup || '');
  var mapped = {
    id:          b.id || b.txId || ('xl_' + Math.random().toString(36).slice(2)),
    txId:        b.txId || b.id || '',
    sport:       b.sport || 'Other',
    type:        b.type  || 'straight',
    matchup:     b.matchup || '',
    line:        b.line    || '',
    pick:        b.pick   || b.matchup || '',
    teamBetOn:   teamBetOn,
    opponent:    opponent,
    odds:        b.odds   || 0,
    stake:       b.stake  || 0,
    toWin:       b.toWin  || 0,
    settled:     !!b.settled,
    result:      b.result || '',
    settledDate: b.settledDate || b.addedDate || '',
    addedDate:   b.addedDate   || b.settledDate || '',
    gameTime:    b.gameTime    || '',
    source:      b.source      || 'Locks25',
    notes:       b.notes       || '',
    excelRow:    b.excelRow    || null,
    excelSheet:  b.excelSheet  || null,
  };
  /* If espnMatchup is already present (carried via b), try to derive opponent */
  if (b.espnMatchup && !opponent) {
    mapped.espnMatchup = b.espnMatchup;
    deriveOpponentFromEspnMatchup(mapped);
  }
  return mapped;
}

/* ===== SYNC FROM EXCEL (via local server) ===== */
function syncFromExcel() {
  var btn = document.getElementById('syncExcelBtn');
  if (btn) { btn.textContent = '⟳ Syncing...'; btn.disabled = true; }

  Promise.all([
    fetch('http://localhost:5001/api/bets').then(function(r) { return r.json(); }),
    fetch('http://localhost:5001/api/open-bets').then(function(r) { return r.json(); })
  ]).then(function(results) {
    var settledData = results[0];
    var openData    = results[1];

    if (!settledData.ok && !openData.ok) {
      /* Remove stale sync-error messages so they don't accumulate in the chat log */
      store.chatHistory = (store.chatHistory || []).filter(function(m) {
        return !(m.type === 'system' && typeof m.html === 'string' &&
                 /Sync failed|Could not reach local server/i.test(m.html));
      });
      addChat('system', '⚠️ Could not reach local server. Make sure server.py is running (python server.py).');
      if (btn) { btn.textContent = '⟳ Sync from Excel'; btn.disabled = false; }
      return;
    }

    var settledMapped = (settledData.bets || []).map(mapServerBet);
    var openMapped    = (openData.bets    || []).map(mapServerBet);

    /* Partition: futures → store.futures, everything else → store.bets */
    var settled        = settledMapped.filter(function(b) { return !isFutureBet(b); });
    var settledFutures = settledMapped.filter(function(b) { return  isFutureBet(b); });
    var open           = openMapped.filter(function(b)    { return !isFutureBet(b); });
    var openFutures    = openMapped.filter(function(b)    { return  isFutureBet(b); });
    settledFutures.forEach(function(b) { b.type = 'future'; });
    openFutures.forEach(function(b)    { b.type = 'future'; });

    var allBets    = settled.concat(open);
    var allFutures = openFutures.concat(settledFutures);

    /* Dedup by txId — keep first occurrence */
    var seen = {};
    allBets = allBets.filter(function(b) {
      if (!b.txId) return true;
      if (seen[b.txId]) return false;
      seen[b.txId] = true;
      return true;
    });
    var seenF = {};
    allFutures = allFutures.filter(function(b) {
      if (!b.txId) return true;
      if (seenF[b.txId]) return false;
      seenF[b.txId] = true;
      return true;
    });

    var prevCount    = store.bets.length;
    var prevFutCount = store.futures.length;
    /* Merge: preserve ESPN-enriched fields from existing localStorage bets so a sync
       doesn't wipe espnMatchup/espnScore/scheduledStart/expectedEndTime that were
       already fetched. Index by txId, then carry fields onto each incoming server bet. */
    var existingByTxId = {};
    store.bets.forEach(function(b)    { if (b.txId) existingByTxId[b.txId] = b; });
    store.futures.forEach(function(b) { if (b.txId) existingByTxId[b.txId] = b; });
    var enrichFn = function(b) {
      var ex = existingByTxId[b.txId];
      if (ex) {
        if (ex.espnMatchup)              b.espnMatchup              = ex.espnMatchup;
        if (ex.espnScore)                b.espnScore                = ex.espnScore;
        if (ex.scheduledStart)           b.scheduledStart           = ex.scheduledStart;
        if (ex.expectedEndTime)          b.expectedEndTime          = ex.expectedEndTime;
        /* Preserve team-analysis fields enriched on the client */
        if (ex.teamBetOn)                b.teamBetOn                = ex.teamBetOn;
        if (ex.opponent)                 b.opponent                 = ex.opponent;
        if (ex.opponentLookupAttempted)  b.opponentLookupAttempted  = ex.opponentLookupAttempted;
      }
      /* If we now have espnMatchup but still no opponent, derive it */
      if (b.espnMatchup && b.teamBetOn && !b.opponent) {
        deriveOpponentFromEspnMatchup(b);
      }
      return b;
    };
    allBets    = allBets.map(enrichFn);
    allFutures = allFutures.map(enrichFn);
    store.bets    = allBets;
    store.futures = allFutures;
    /* Re-enrich any open bets that still lack espnMatchup after the merge
       (e.g. new open bets that weren't in localStorage yet). */
    var toReEnrich = allBets.filter(function(b) {
      return !b.settled && !b.espnMatchup && b.type !== 'parlay' && !isGenericPick(b.pick);
    });
    runBetPipeline(toReEnrich);
    /* Background: fill opponent for settled single-team bets via ESPN lookup */
    setTimeout(enrichHistoricalOpponents, 2000);

    var msg = 'Synced from Excel: ' + allBets.length + ' bets + ' + allFutures.length + ' futures'
      + ' (was ' + prevCount + ' bets, ' + prevFutCount + ' futures).';
    addChat('system', msg);
    toggleSettings();
    if (btn) { btn.textContent = '⟳ Sync from Excel'; btn.disabled = false; }

  }).catch(function(err) {
    /* Remove stale sync-error messages so failures don't pile up in the chat log */
    store.chatHistory = (store.chatHistory || []).filter(function(m) {
      return !(m.type === 'system' && typeof m.html === 'string' &&
               /Sync failed|Could not reach local server/i.test(m.html));
    });
    addChat('system', '⚠️ Sync failed — is server.py running? Error: ' + err.message);
    if (btn) { btn.textContent = '⟳ Sync from Excel'; btn.disabled = false; }
  });
}

/* ===== PEER BETS (who else bet on the same game) ===== */
function fetchPeerBets() {
  fetch('/api/peer-bets')
    .then(function(r) { return r.ok ? r.json() : null; })
    .then(function(data) {
      if (data && data.ok && data.peers) {
        cachedPeerBets = data.peers;
        /* Re-render open bets so the new peer data shows up */
        if (store.currentTab === 'home') renderOpenBets();
      }
    })
    .catch(function() { /* server not running — silently skip */ });
}

/* ===== SHARP ACTION (Action Network bet % + spreads) ===== */
function fetchSharpAction(sport) {
  sport = (sport || 'nfl').toLowerCase();
  var now = Date.now();
  var entry = cachedSharpAction[sport];
  if (entry && (now - entry.fetchedAt) < SHARP_ACTION_TTL_MS) return; /* still fresh */

  fetch('/api/sharp-action?sport=' + encodeURIComponent(sport))
    .then(function(r) { return r.ok ? r.json() : null; })
    .then(function(data) {
      if (data && data.games) {
        cachedSharpAction[sport] = { games: data.games, fetchedAt: Date.now() };
        if (store.currentTab === 'home') renderOpenBets();
      }
    })
    .catch(function() { /* server not running — silently skip */ });
}

/* ===== RENDER ALL ===== */
function renderAll() {
  renderFilterBars();
  renderDashStats();
  /* Only render active tab content — saves 50%+ DOM operations */
  var tab = store.currentTab || 'home';
  if (tab === 'home') {
    renderOpenBets();
    renderSettledBets();
    renderHomeCharts();
    renderChat();
    updateHomeFilterToggle();
  } else if (tab === 'futures') {
    renderFutures();
  } else if (tab === 'analytics') {
    renderHighlights();
    renderAnalyticsCharts();
    renderDeepAnalysis();
  } else if (tab === 'upcoming') {
    renderUpcomingGames();
  } else if (tab === 'betlog') {
    renderBetLog();
  }
  /* Always render chat if on home (already handled above) */
  if (tab !== 'home') {
    /* Chat and home filter still need rendering if user has pending confirmations */
    renderChat();
  }
}

/* ===== TEXTAREA AUTO-RESIZE ===== */
function setupTextarea() {
  var ta = document.getElementById('chatInput');
  if (!ta) return;
  ta.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 120) + 'px';
  });
  ta.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  /* Auto-detect Bovada paste on paste event */
  ta.addEventListener('paste', function(e) {
    setTimeout(function() {
      var val = ta.value || '';
      /* Auto-send Bovada pastes */
      if (/Ref\.\d{5,}/.test(val) && (/RISK/i.test(val) || /ODDS/i.test(val) || /WINNINGS/i.test(val))) {
        sendMessage();
      }
      /* Auto-send locks25/BetOnline pastes */
      else if (val.indexOf('STRAIGHT BET') !== -1 || val.indexOf('LIVE BETTING BET') !== -1 || /^PARLAY\s/im.test(val)) {
        sendMessage();
      }
    }, 500);
  });
}

/* ===== ONE-TIME MIGRATION: move stray future-shaped bets out of store.bets ===== */
function migrateFuturesOutOfBets() {
  if (!Array.isArray(store.bets) || !store.bets.length) return;
  var futs = [];
  var rest = [];
  for (var i = 0; i < store.bets.length; i++) {
    var b = store.bets[i];
    if (isFutureBet(b)) {
      b.type = 'future';
      futs.push(b);
    } else {
      rest.push(b);
    }
  }
  if (futs.length === 0) return;
  /* Dedup against store.futures by txId */
  var existing = {};
  (store.futures || []).forEach(function(f) { if (f.txId) existing[f.txId] = true; });
  var added = 0;
  for (var j = 0; j < futs.length; j++) {
    if (futs[j].txId && existing[futs[j].txId]) continue;
    store.futures.push(futs[j]);
    added++;
  }
  store.bets = rest;
  if (added > 0) {
    saveData();
    invalidateStats();
    console.log('Futures migration: moved ' + added + ' bets into store.futures');
  }
}

/* ===== SERVER REACHABILITY ===== */
/* Pings /api/bets and toggles the global banner. Called on init + on Retry button. */
function pingServer(showRetryFeedback) {
  var banner = document.getElementById('serverDownBanner');
  var retryBtn = banner ? banner.querySelector('.server-down-retry') : null;
  if (showRetryFeedback && retryBtn) {
    retryBtn.disabled = true;
    retryBtn.textContent = 'Checking…';
  }
  return fetch('http://localhost:5001/api/bets', { method: 'GET' })
    .then(function(r) {
      if (!r.ok) throw new Error('bad status ' + r.status);
      if (banner) banner.style.display = 'none';
      return true;
    })
    .catch(function() {
      if (banner) banner.style.display = 'flex';
      return false;
    })
    .finally(function() {
      if (retryBtn) {
        retryBtn.disabled = false;
        retryBtn.textContent = 'Retry';
      }
    });
}
window.pingServer = pingServer;

/* Quietly re-ping every 20s while the banner is showing — auto-clears the moment server comes back */
setInterval(function() {
  var banner = document.getElementById('serverDownBanner');
  if (banner && banner.style.display !== 'none') pingServer();
}, 20000);

/* ===== SKELETON LOADERS ===== */
function skeletonBetCard() {
  return '<div class="skeleton-card">' +
    '<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">' +
      '<span class="skeleton-line tag"></span>' +
      '<span class="skeleton-line short" style="height:10px;width:80px;margin-bottom:0"></span>' +
    '</div>' +
    '<div class="skeleton-line full"></div>' +
    '<div class="skeleton-line mid"></div>' +
  '</div>';
}
function showSkeletonsIfEmpty() {
  /* Only paint skeletons when localStorage has no data — repeat visitors see real data instantly */
  if (store.bets.length > 0 || store.futures.length > 0) return;
  var openEl    = document.getElementById('openBetsList');
  var settledEl = document.getElementById('settledBetsList');
  var skel = skeletonBetCard() + skeletonBetCard() + skeletonBetCard() + skeletonBetCard();
  if (openEl)    openEl.innerHTML    = skel;
  if (settledEl) settledEl.innerHTML = skel;
}

/* ===== INIT ===== */
function init() {
  try {
    loadData();
    migrateFuturesOutOfBets();
    pingServer();
    renderAll();
    /* Skeleton has to run AFTER renderAll, since renderAll paints the empty-state.
       We only overwrite when localStorage was empty — sync will fill in real data shortly. */
    showSkeletonsIfEmpty();
    setupTextarea();
    /* Fetch ESPN game times for proper sorting, re-render settled when done */
    fetchEspnGameTimes(function() {
      renderSettledBets();
    });
    if (store.chatHistory.length === 0) {
      var welcomeMsg = 'Welcome to BetTracker Pro! I can do two things:<br><br><strong>1. Track bets:</strong><br><code>Lakers -3.5 (-110) $50</code><br><code>Celtics ML (+150) $25</code><br>Or paste from <strong>Bovada</strong> / <strong>BetOnline</strong><br><br><strong>2. Answer questions:</strong><br><code>What\'s my record on NBA?</code><br><code>Net loss from Vanderbilt?</code><br><code>Biggest win?</code><br><code>How am I doing overall?</code>';
      if (!store.claudeApiKey) {
        welcomeMsg += '<br><br><span style="font-size:.75rem;color:var(--amber)">Add a Claude API key in Settings to unlock AI-powered analysis.</span>';
      } else {
        welcomeMsg += '<br><br><span style="font-size:.75rem;color:var(--green)">Claude AI is connected — ask me anything!</span>';
      }
      addChat('system', welcomeMsg);
    } else {
      renderChat();
    }
    /* Only fetch live scores if there are open bets — saves 5 HTTP requests/min when idle */
    var hasOpenBets = store.bets.some(function(b) { return !b.settled; });
    if (hasOpenBets) {
      fetchLiveScores();
      /* Peer bets + sharp action — fire after a short delay so the main render settles first */
      setTimeout(function() {
        fetchPeerBets();
        /* Fetch sharp action for any sport represented in open bets */
        var openSports = {};
        store.bets.filter(function(b) { return !b.settled; }).forEach(function(b) {
          if (b.sport) openSports[(b.sport || '').toLowerCase()] = true;
        });
        Object.keys(openSports).forEach(function(sp) { fetchSharpAction(sp); });
      }, 1500);
    }
    /* Smart polling with exponential backoff: only fetch when open bets exist.
       Stops rescheduling once all bets are settled — restarts when a new open bet is added. */
    function pollLiveScores() {
      if (store.bets.some(function(b) { return !b.settled; })) {
        fetchLiveScores(function(success) {
          if (success !== false) { espnBackoff = 1; }
          else { espnBackoff = Math.min(espnBackoff * 2, 16); }
          setTimeout(pollLiveScores, 60000 * espnBackoff);
        });
      }
      /* No open bets → stop the loop. startLivePolling() restarts it when a bet is added. */
    }
    function startLivePolling() {
      if (store.bets.some(function(b) { return !b.settled; })) {
        setTimeout(pollLiveScores, 60000);
      }
    }
    startLivePolling();
    /* Enrich open bets only — settled bets already have their result and settled date,
       so sequential ESPN enrichment on startup would just burn API calls for display
       polish on bets that are done. Open bets need real game-start times for sort order. */
    var unenriched = store.bets.filter(function(b) { return !b.settled && !b.espnMatchup && b.type !== 'parlay'; });
    if (unenriched.length > 0) {
      enrichNewBets(unenriched, function(count) {
        if (count > 0) { saveData(); renderAll(); }
      });
    }
    /* Only fetch futures odds if user has open futures — saves Bovada API calls when idle */
    var hasOpenFutures = store.futures.some(function(b) { return !b.settled; });
    if (hasOpenFutures) fetchFuturesOdds();
    /* Load closing lines from server, then enrich from odds history */
    setTimeout(function() {
      fetchClosingLines(function() {
        enrichClosingLines();
        detectSteamMoves();
        renderAll();
      });
      /* Capture closing lines for bets starting within 30 min */
      if (hasOpenBets) capturePreGameClosingLines();
    }, 3000);
    /* Poll for steam moves every 15 minutes — only when futures exist */
    setInterval(function() {
      if (store.futures.some(function(b) { return !b.settled; })) {
        fetchFuturesOdds();
        setTimeout(function() {
          detectSteamMoves();
        }, 5000);
      }
    }, 15 * 60 * 1000);
    /* Auto-sync from Excel on load if server is running and localStorage looks inflated.
       "Inflated" = localStorage has 30%+ more settled bets than the server reports.
       This silently fixes phantom/duplicate bets without any user action required. */
    autoSyncIfInflated();
  } catch (e) {
    console.error('Init error:', e);
    var errBanner = document.createElement('div');
    errBanner.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#ff4757;color:#fff;padding:12px 24px;z-index:9999;font-family:Inter,sans-serif;text-align:center;font-size:.85rem';
    errBanner.innerHTML = 'Some features failed to load: ' + e.message + ' <button onclick="this.parentNode.remove()" style="margin-left:16px;background:rgba(255,255,255,.2);border:none;color:#fff;padding:4px 12px;border-radius:4px;cursor:pointer">Dismiss</button>';
    document.body.appendChild(errBanner);
  }
}

function autoSyncIfInflated() {
  fetch('http://localhost:5001/api/bets')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (!data.ok || !data.bets) return;
      var serverCount  = data.bets.length;
      var localSettled = store.bets.filter(function(b) { return b.settled; }).length;
      /* Only auto-sync when localStorage has 20+ more settled bets than the server */
      if (localSettled - serverCount < 20) return;
      /* Silent sync — same logic as syncFromExcel() but no modal/confirm */
      fetch('http://localhost:5001/api/open-bets')
        .then(function(r2) { return r2.json(); })
        .then(function(openData) {
          var settledMapped = data.bets.map(mapServerBet);
          var openMapped    = (openData.bets || []).map(mapServerBet);

          /* Partition futures into store.futures */
          var settled        = settledMapped.filter(function(b) { return !isFutureBet(b); });
          var settledFutures = settledMapped.filter(function(b) { return  isFutureBet(b); });
          var open           = openMapped.filter(function(b)    { return !isFutureBet(b); });
          var openFutures    = openMapped.filter(function(b)    { return  isFutureBet(b); });
          settledFutures.forEach(function(b) { b.type = 'future'; });
          openFutures.forEach(function(b)    { b.type = 'future'; });

          var allBets    = settled.concat(open);
          var allFutures = openFutures.concat(settledFutures);

          var seen = {};
          allBets = allBets.filter(function(b) { if (!b.txId) return true; if (seen[b.txId]) return false; seen[b.txId] = true; return true; });
          var seenF = {};
          allFutures = allFutures.filter(function(b) { if (!b.txId) return true; if (seenF[b.txId]) return false; seenF[b.txId] = true; return true; });

          /* Merge: preserve ESPN-enriched fields from existing localStorage bets/futures */
          var existingByTxId2 = {};
          store.bets.forEach(function(b)    { if (b.txId) existingByTxId2[b.txId] = b; });
          store.futures.forEach(function(b) { if (b.txId) existingByTxId2[b.txId] = b; });
          var enrich2 = function(b) {
            var ex = existingByTxId2[b.txId];
            if (ex) {
              if (ex.espnMatchup)     b.espnMatchup     = ex.espnMatchup;
              if (ex.espnScore)       b.espnScore       = ex.espnScore;
              if (ex.scheduledStart)  b.scheduledStart  = ex.scheduledStart;
              if (ex.expectedEndTime) b.expectedEndTime = ex.expectedEndTime;
            }
            return b;
          };
          allBets    = allBets.map(enrich2);
          allFutures = allFutures.map(enrich2);
          store.bets    = allBets;
          store.futures = allFutures;
          /* Re-enrich open bets still missing espnMatchup after the merge */
          var toReEnrich2 = allBets.filter(function(b) {
            return !b.settled && !b.espnMatchup && b.type !== 'parlay' && !isGenericPick(b.pick);
          });
          runBetPipeline(toReEnrich2);
          addChat('system', '🔄 Auto-synced from Excel: ' + allBets.length + ' bets + ' + allFutures.length + ' futures (removed ' + (localSettled - settled.length) + ' stale entries). Your stats are now accurate.');
        }).catch(function() {});
    })
    .catch(function() { /* server not running — no-op */ });
}

init();

