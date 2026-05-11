/* Chat UI, Claude AI integration, message processing */
/* Extracted from betting-tracker.html — do not edit the original */
/* Hardened 2026-04-20: local-first dispatch, Haiku default, persistent cache, daily cap. */

/* ==========================================================================
   CLAUDE TIER CONFIG — swap the model here if quality degrades.
   Docs: docs/agent/RUNBOOK.md → "Swapping Claude tiers"
   Haiku 4.5  (default, cheapest)      : 'claude-haiku-4-5-20251001'
   Sonnet 4   (fallback, ~5x cost)     : 'claude-sonnet-4-20250514'
   Opus 4.1   (last resort, ~15x cost) : 'claude-opus-4-1-20250805'
   ========================================================================== */
var BT_CLAUDE_MODEL        = 'claude-haiku-4-5-20251001';
var BT_CLAUDE_MAX_TOKENS   = 400;          /* response cap — do not raise without reason */
var BT_CLAUDE_DAILY_CAP    = 30;           /* hard safety cap on calls per day. Exceeded → local fallback. */
var BT_CLAUDE_CACHE_KEY    = 'bt_claude_cache_v1';
var BT_CLAUDE_BUDGET_KEY   = 'bt_claude_budget_v1';
var BT_CLAUDE_CACHE_MAX    = 50;           /* LRU entries kept in localStorage */

function addChat(type, html) {
  store.chatHistory.push({ type: type, html: html, time: Date.now() });
  renderChat();
  saveData();
}

function renderChat() {
  var el = document.getElementById('chatMessages');
  if (!el) return;
  var out = '';
  for (var i = 0; i < store.chatHistory.length; i++) {
    var msg = store.chatHistory[i];
    out += '<div class="chat-msg ' + msg.type + '">' + msg.html + '</div>';
  }
  if (store.pendingConfirmation) {
    var b = store.pendingConfirmation;
    out += '<div class="confirm-card">';
    out += '<div class="title">Confirm Bet</div>';
    out += '<div class="detail"><strong>' + escHtml(b.pick) + '</strong></div>';
    out += '<div class="detail">Sport: ' + escHtml(b.sport || 'Other') + '</div>';
    out += '<div class="detail">Odds: ' + fmtOdds(b.odds) + ' | Stake: ' + fmtMoney(b.stake) + ' | To Win: ' + fmtMoney(b.toWin) + '</div>';
    if (b.type === 'future') out += '<div class="detail" style="color:var(--amber)">This will be added as a Futures bet</div>';
    out += '<div class="btns"><button class="confirm-yes" onclick="confirmBet()">Confirm</button><button class="confirm-no" onclick="cancelBet()">Cancel</button></div>';
    out += '</div>';
  }
  if (store.pendingBatchConfirmation) {
    var batch = store.pendingBatchConfirmation;
    var bets = batch.bets || [];
    var totalStake = 0, futCount = 0;
    for (var bi = 0; bi < bets.length; bi++) {
      totalStake += bets[bi].stake || 0;
      if (bets[bi].type === 'future') futCount++;
    }
    out += '<div class="confirm-card">';
    out += '<div class="title">Confirm ' + bets.length + ' Bets</div>';
    if (batch.totalStake) out += '<div class="detail" style="color:var(--text3);font-size:.75rem">Total risked from message: ' + fmtMoney(batch.totalStake) + ' (distributed equally if no per-bet stake found)</div>';
    out += '<div class="detail" style="margin-top:6px"><strong>Summary:</strong> ' + bets.length + ' bets · ' + fmtMoney(totalStake) + ' total stake · ' + futCount + ' future' + (futCount === 1 ? '' : 's') + '</div>';
    for (var bi2 = 0; bi2 < bets.length; bi2++) {
      var bb = bets[bi2];
      out += '<div class="detail" style="padding:4px 0;border-top:1px solid var(--border);font-size:.78rem">';
      out += '<strong>' + (bi2 + 1) + '.</strong> ' + escHtml(bb.pick || '?');
      out += ' <span style="color:var(--text3)">·</span> ' + fmtOdds(bb.odds);
      out += ' <span style="color:var(--text3)">·</span> ' + fmtMoney(bb.stake);
      out += ' <span style="color:var(--text3)">·</span> ' + escHtml(bb.sport || 'Other');
      if (bb.type === 'future') out += ' <span style="color:var(--amber)">[future]</span>';
      out += '</div>';
    }
    if (batch.unparsed && batch.unparsed.length > 0) {
      out += '<div class="detail" style="color:var(--amber);font-size:.7rem;margin-top:4px">' + batch.unparsed.length + ' line(s) couldn\'t be parsed — review chat history.</div>';
    }
    out += '<div class="btns"><button class="confirm-yes" onclick="confirmBatch()">Add all ' + bets.length + '</button><button class="confirm-no" onclick="cancelBatch()">Cancel</button></div>';
    out += '</div>';
  }
  el.innerHTML = out;
  el.scrollTop = el.scrollHeight;
}

/* ===== CLAUDE AI CHATBOT ===== */
/* Session cache — fast path. */
var claudeCache = {};
/* claudeCacheVersion is declared in store.js */
/* Separate context cache keyed by version — rebuilt only when bets change, not per question */
var _ctxCache = { version: -1, text: '' };

/* FNV-1a 32-bit hash — deterministic, fast, no deps. Used for cache keys. */
function _bt_hash(str) {
  var h = 0x811c9dc5;
  for (var i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16);
}

/* Persistent cache: localStorage-backed, LRU-capped. Survives reloads. */
function _bt_persistCacheRead(key) {
  try {
    var raw = localStorage.getItem(BT_CLAUDE_CACHE_KEY);
    if (!raw) return null;
    var obj = JSON.parse(raw);
    if (!obj || !obj[key]) return null;
    /* touch timestamp for LRU */
    obj[key].t = Date.now();
    localStorage.setItem(BT_CLAUDE_CACHE_KEY, JSON.stringify(obj));
    return obj[key].v;
  } catch (e) { return null; }
}
function _bt_persistCacheWrite(key, value) {
  try {
    var raw = localStorage.getItem(BT_CLAUDE_CACHE_KEY);
    var obj = raw ? JSON.parse(raw) : {};
    obj[key] = { v: value, t: Date.now() };
    /* LRU eviction */
    var keys = Object.keys(obj);
    if (keys.length > BT_CLAUDE_CACHE_MAX) {
      keys.sort(function(a, b) { return obj[a].t - obj[b].t; });
      var toDrop = keys.slice(0, keys.length - BT_CLAUDE_CACHE_MAX);
      for (var i = 0; i < toDrop.length; i++) delete obj[toDrop[i]];
    }
    localStorage.setItem(BT_CLAUDE_CACHE_KEY, JSON.stringify(obj));
  } catch (e) { /* quota or serialization issue — silently skip */ }
}

/* Daily budget: tracked as { date: 'YYYY-MM-DD', count: N } in localStorage. */
function _bt_budgetStatus() {
  var today = new Date().toISOString().slice(0, 10);
  try {
    var raw = localStorage.getItem(BT_CLAUDE_BUDGET_KEY);
    var b = raw ? JSON.parse(raw) : null;
    if (!b || b.date !== today) return { date: today, count: 0, remaining: BT_CLAUDE_DAILY_CAP };
    return { date: today, count: b.count, remaining: Math.max(0, BT_CLAUDE_DAILY_CAP - b.count) };
  } catch (e) { return { date: today, count: 0, remaining: BT_CLAUDE_DAILY_CAP }; }
}
function _bt_budgetIncrement() {
  var s = _bt_budgetStatus();
  s.count += 1;
  try { localStorage.setItem(BT_CLAUDE_BUDGET_KEY, JSON.stringify({ date: s.date, count: s.count })); } catch (e) {}
}

function buildBetContext() {
  /* Return cached context if nothing has changed since last build */
  if (_ctxCache.version === claudeCacheVersion) return _ctxCache.text;

  /* Use already-computed filtered data — avoids re-scanning store */
  var settled = getCachedFiltered().filteredSettled;
  var open    = getCachedFiltered().filteredOpenBets;

  /* Overall stats */
  var w = 0, l = 0, p = 0, staked = 0, returned = 0;
  for (var i = 0; i < settled.length; i++) {
    staked += settled[i].stake || 0;
    if (settled[i].result === 'W') { w++; returned += settled[i].stake + (settled[i].toWin || 0); }
    else if (settled[i].result === 'L') { l++; }
    else { p++; returned += settled[i].stake; }
  }
  var pl  = returned - staked;
  var roi = staked > 0 ? (pl / staked * 100) : 0;

  /* Sport summary — one compact line per sport */
  var sportMap = {};
  for (var i = 0; i < settled.length; i++) {
    var s = settled[i].sport || 'Other';
    if (!sportMap[s]) sportMap[s] = { w: 0, l: 0, pl: 0 };
    if (settled[i].result === 'W') { sportMap[s].w++; sportMap[s].pl += settled[i].toWin || 0; }
    else if (settled[i].result === 'L') { sportMap[s].l++; sportMap[s].pl -= settled[i].stake || 0; }
  }
  var sportParts = [];
  for (var sp in sportMap) {
    var sm = sportMap[sp];
    sportParts.push(sp + ' ' + sm.w + '-' + sm.l + ' ' + (sm.pl >= 0 ? '+' : '') + '$' + sm.pl.toFixed(0));
  }

  /* Top 8 teams by bet volume — compact */
  var teamMap = {};
  for (var i = 0; i < settled.length; i++) {
    var pick = settled[i].pick || '';
    var team = pick.replace(/\([^)]*\)/g, '').replace(/\s+[+-]?\d[\d½¼¾]*\s*$/, '').replace(/\s+(ML|Over|Under)\b.*/i, '').trim().split(' ').slice(0, 2).join(' ');
    if (!team || team.length > 25) team = 'Other';
    if (!teamMap[team]) teamMap[team] = { w: 0, l: 0, pl: 0, n: 0 };
    teamMap[team].n++;
    if (settled[i].result === 'W') { teamMap[team].w++; teamMap[team].pl += settled[i].toWin || 0; }
    else if (settled[i].result === 'L') { teamMap[team].l++; teamMap[team].pl -= settled[i].stake || 0; }
  }
  var teamArr = [];
  for (var t in teamMap) { teamMap[t].name = t; teamArr.push(teamMap[t]); }
  teamArr.sort(function(a, b) { return b.n - a.n; });
  var teamParts = [];
  for (var i = 0; i < Math.min(teamArr.length, 8); i++) {
    var t = teamArr[i];
    teamParts.push(t.name + ' ' + t.w + '-' + t.l + ' ' + (t.pl >= 0 ? '+' : '') + '$' + t.pl.toFixed(0));
  }

  /* Streak from most-recent bets */
  var recent = settled.slice().sort(function(a, b) {
    return (parseGameDate(b.gameTime) || parseGameDate(b.settledDate) || 0)
         - (parseGameDate(a.gameTime) || parseGameDate(a.settledDate) || 0);
  }).slice(0, 5);
  var streakResult = recent.length > 0 ? recent[0].result : '';
  var streakN = 0;
  for (var i = 0; i < recent.length; i++) { if (recent[i].result === streakResult) streakN++; else break; }

  /* Recent 5 — compact: result pick sport stake P/L date */
  var recentParts = [];
  for (var i = 0; i < recent.length; i++) {
    var r = recent[i];
    var rpl = r.result === 'W' ? '+$' + (r.toWin || 0).toFixed(0)
            : r.result === 'L' ? '-$' + (r.stake || 0).toFixed(0) : 'Push';
    var dt = r.gameTime ? r.gameTime.replace(/\s+\d+:\d+.*/, '') : (r.settledDate ? r.settledDate.slice(5, 10) : '');
    recentParts.push(r.result + ' ' + (r.pick || '?') + ' | ' + (r.sport || '?') + ' $' + (r.stake || 0).toFixed(0) + ' ' + rpl + (dt ? ' ' + dt : ''));
  }

  /* Open bets — compact */
  var openParts = [];
  for (var i = 0; i < open.length; i++) {
    var o = open[i];
    openParts.push((o.pick || '?') + ' $' + (o.stake || 0).toFixed(0) + (o.gameTime ? ' ' + o.gameTime.replace(/\s+\d+:\d+.*/, '') : ''));
  }

  var ctx = new Date().toLocaleDateString() + ' | ' + w + '-' + l + (p ? '-' + p : '') + ' | P/L ' + (pl >= 0 ? '+' : '') + '$' + pl.toFixed(2) + ' | ROI ' + roi.toFixed(1) + '% | Staked $' + staked.toFixed(0) + '\n';
  if (streakN > 1) ctx += 'Streak: ' + streakN + (streakResult === 'W' ? 'W' : streakResult === 'L' ? 'L' : 'P') + '\n';
  ctx += 'Open ' + open.length + ' | Settled ' + settled.length + ' | Futures ' + store.futures.length + '\n';
  ctx += 'Sport: ' + sportParts.join(' | ') + '\n';
  ctx += 'Teams: ' + teamParts.join(' | ') + '\n';
  ctx += 'Recent: ' + recentParts.join(' / ') + '\n';
  if (openParts.length) ctx += 'Pending: ' + openParts.join(' / ') + '\n';

  _ctxCache.version = claudeCacheVersion;
  _ctxCache.text    = ctx;
  return ctx;
}

function askClaude(userMessage, callback) {
  var betContext  = buildBetContext();
  var ctxHash     = _bt_hash(betContext);
  var promptHash  = _bt_hash(userMessage.toLowerCase().trim());
  var cacheKey    = promptHash + '.' + ctxHash;

  /* L1 — in-memory */
  if (claudeCache[cacheKey]) {
    callback(null, claudeCache[cacheKey], { source: 'mem-cache' });
    return;
  }
  /* L2 — persistent */
  var persisted = _bt_persistCacheRead(cacheKey);
  if (persisted) {
    claudeCache[cacheKey] = persisted;
    callback(null, persisted, { source: 'disk-cache' });
    return;
  }

  /* Budget check — refuse to spend if daily cap is hit. */
  var budget = _bt_budgetStatus();
  if (budget.remaining <= 0) {
    var err = new Error('Daily chat cap reached (' + BT_CLAUDE_DAILY_CAP + '/day). Local analysis only until midnight local time.');
    err.code = 'BUDGET_CAP';
    callback(err, null, { source: 'budget-cap' });
    return;
  }

  /* Compact system prompt — ~160 chars vs the old ~450. Same instructions, less token burn. */
  var systemPrompt = 'Betting analyst in a chat widget. Use the data below. Be concise (<150 words), data-driven, HTML only (<strong>,<br>,<span style="color:var(--green/--red)">). No markdown.\n\n' + betContext;

  var body = JSON.stringify({
    model: BT_CLAUDE_MODEL,
    max_tokens: BT_CLAUDE_MAX_TOKENS,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }]
  });

  fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': store.claudeApiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: body
  })
  .then(function(resp) {
    if (!resp.ok) {
      var status = resp.status;
      return resp.json().then(function(err) {
        var msg = (err.error && err.error.message) ? err.error.message : 'API error ' + status;
        var e = new Error(msg);
        e.status = status;
        if (status === 401 || status === 403) e.code = 'AUTH';
        else if (status === 429) e.code = 'RATE_LIMIT';
        else if (status >= 500) e.code = 'API_DOWN';
        else e.code = 'API_ERROR';
        throw e;
      }, function() {
        var e = new Error('API error ' + status);
        e.status = status;
        e.code = status >= 500 ? 'API_DOWN' : 'API_ERROR';
        throw e;
      });
    }
    return resp.json();
  })
  .then(function(data) {
    var text = '';
    if (data.content && data.content.length > 0) {
      text = data.content[0].text || '';
    }
    _bt_budgetIncrement();
    claudeCache[cacheKey] = text;
    _bt_persistCacheWrite(cacheKey, text);
    callback(null, text, { source: 'api', model: BT_CLAUDE_MODEL });
  })
  .catch(function(err) {
    callback(err, null, { source: 'api-error' });
  });
}

function sendMessage() {
  var textarea = document.getElementById('chatInput');
  if (!textarea) return;
  var text = textarea.value.trim();
  if (!text) return;
  textarea.value = '';
  textarea.style.height = 'auto';
  addChat('user', escHtml(text));

  try { _processMessage(text); } catch(e) {
    console.error('Chat error:', e);
    addChat('error', 'Something went wrong processing that. Try again or rephrase.');
  }
}

function _processMessage(text) {
  /* Normalize whitespace: replace non-breaking spaces, zero-width chars, and normalize line endings */
  text = text.replace(/[\u00A0\u2000-\u200F\u2028\u2029\uFEFF]/g, ' ');
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  /* Defensive guard: handleChatSubmit trims + early-returns on empty, but if any
   * future caller (keyboard shortcut, paste handler, test) invokes _processMessage
   * directly with whitespace, we must not burn a Claude credit on it. */
  if (!text || !text.trim()) return;
  /* Awaiting odds */
  if (store.awaitingOdds) {
    var oddsMatch = text.match(/^[+-]?\d{3,4}$/);
    if (oddsMatch) {
      var odds = parseInt(text, 10);
      if (Math.abs(odds) < 100) { addChat('error', 'Odds must be at least +100 or -100. Try again.'); return; }
      var bet = store.awaitingOdds;
      bet.odds = odds;
      bet.toWin = calcToWin(bet.stake, odds);
      delete bet._missingOdds;
      store.awaitingOdds = null;
      store.pendingConfirmation = bet;
      renderChat();
      return;
    } else { addChat('error', 'Please enter valid American odds (e.g. <code>-110</code> or <code>+150</code>)'); return; }
  }

  /* Bovada paste — detect by Ref number + RISK or ODDS */
  if (/Ref\.\d{5,}/.test(text) && (/RISK/i.test(text) || /ODDS/i.test(text) || /WINNINGS/i.test(text))) {
    var preCount = store.bets.length + store.futures.length;
    var imported = parseBovadaPasteWithDupeCheck(text);
    var postCount = store.bets.length + store.futures.length;
    var actualAdded = postCount - preCount;
    var dupes = imported.total - imported.added;
    if (imported.total > 0) {
      var msg = '';
      if (actualAdded > 0) {
        msg = 'Imported <strong>' + actualAdded + '</strong> new bet(s) from Bovada!';
        var parts = [];
        if (imported.openCount > 0) parts.push(imported.openCount + ' open');
        if (imported.settledCount > 0) parts.push(imported.settledCount + ' settled');
        if (imported.futureCount > 0) parts.push(imported.futureCount + ' futures');
        if (parts.length > 0) msg += ' (' + parts.join(', ') + ')';
      }
      if (dupes > 0) {
        msg += (actualAdded > 0 ? '<br>' : '') + '<span style="color:var(--text2)">' + dupes + ' duplicate(s) skipped (already in your tracker)</span>';
      }
      if (actualAdded === 0 && dupes > 0) {
        msg = 'All ' + imported.total + ' bet(s) were already in your tracker. No duplicates added.';
      }
      msg += '<br><span style="color:var(--text3);font-size:.75rem">Parsed ' + imported.total + ' total from paste</span>';
      addChat(actualAdded > 0 ? 'success' : 'system', msg);
      var newBovadaBets = actualAdded > 0 ? store.bets.slice(-actualAdded) : [];
      runBetPipeline(newBovadaBets); /* sort + ESPN enrichment + save + render */
      return;
    }
  }

  /* Sportsbook paste (locks25 / BetOnline format) */
  if (text.indexOf('STRAIGHT BET') !== -1 || text.indexOf('LIVE BETTING BET') !== -1 || /^PARLAY\s/im.test(text)) {
    var imported = parseSportsbookPasteWithDupeCheck(text);
    if (imported.total > 0) {
      var dupes = imported.total - imported.added;
      var msg = '';
      if (imported.added > 0) {
        msg = 'Imported <strong>' + imported.added + '</strong> new bet(s)!';
        var parts = [];
        if (imported.openCount > 0) parts.push(imported.openCount + ' open');
        if (imported.settledCount > 0) parts.push(imported.settledCount + ' settled');
        if (imported.futureCount > 0) parts.push(imported.futureCount + ' futures');
        if (parts.length > 0) msg += ' (' + parts.join(', ') + ')';
      }
      if (dupes > 0) {
        msg += (imported.added > 0 ? '<br>' : '') + '<span style="color:var(--text2)">' + dupes + ' duplicate(s) skipped</span>';
      }
      if (imported.added === 0 && dupes > 0) {
        msg = 'All ' + imported.total + ' bet(s) were already in your tracker. No duplicates added.';
      }
      msg += '<br><span style="color:var(--text3);font-size:.75rem">Parsed ' + imported.total + ' total from paste</span>';
      addChat(imported.added > 0 ? 'success' : 'system', msg);
      var newLocksBets = imported.added > 0 ? store.bets.slice(-imported.added) : [];
      runBetPipeline(newLocksBets); /* sort + ESPN enrichment + save + render */
      return;
    }
  }

  /* Try to parse as a bet first */
  var parsed = parseBet(text);

  /* If it's clearly a bet entry (has odds, stake, team), handle locally */
  if (parsed) {
    /* fall through to bet confirmation below */
  } else {
    /* MULTI-BET DETECTOR — catches "list of futures / mixed bets" messages
       that Claude used to summarise but never import. Per project memory:
       "For multiple bets in one message, confirm the full batch at once,
       get one 'good', then write all of them together." */
    var multi = parseMultipleBets(text);
    if (multi && multi.bets && multi.bets.length >= 2) {
      store.pendingBatchConfirmation = multi;
      renderChat();
      return;
    }
    /* ===== LOCAL-FIRST DISPATCH ===== */
    /* Hardened 2026-04-20: always try local handlers before hitting Claude.
       Previous flow sent every non-bet message straight to Claude when the user had a key,
       which burned tokens on "hi", "thanks", "what's my record" — all of which handleConversation /
       analyzeQuery answer offline for free. See docs/agent/AUDIT.md "Claude call-site classification". */
    var convoResponse = handleConversation(text);
    if (convoResponse) { addChat('system', convoResponse); return; }
    var analysisResult = analyzeQuery(text);
    if (analysisResult) { addChat('analysis', analysisResult); return; }

    /* ===== CLAUDE FALLBACK (only if local can't answer and user has a key) ===== */
    if (store.claudeApiKey) {
      addChat('system', '<span class="thinking-indicator" style="color:var(--text3)">Thinking...</span>');
      askClaude(text, function(err, response, meta) {
        /* Remove thinking indicator */
        if (store.chatHistory.length > 0 && store.chatHistory[store.chatHistory.length - 1].html.indexOf('thinking-indicator') !== -1) {
          store.chatHistory.pop();
        }
        if (err) {
          console.error('Claude API error:', err);
          /* Map error codes to friendly user messages */
          var friendly;
          if (err.code === 'BUDGET_CAP') {
            friendly = 'Daily cap of ' + BT_CLAUDE_DAILY_CAP + ' AI responses hit — resets at midnight. Ask me anything my local analyzer can cover (records, P/L, team/sport filters).';
          } else if (err.code === 'AUTH') {
            friendly = 'Claude API key is invalid or expired. Update it in Settings, or continue without AI.';
          } else if (err.code === 'RATE_LIMIT') {
            friendly = 'Anthropic rate limit hit. Give it a minute, then try again.';
          } else if (err.code === 'API_DOWN') {
            friendly = 'Anthropic API looks down right now. Try again shortly.';
          } else {
            friendly = 'Claude API error: ' + escHtml(err.message);
          }
          addChat('system', friendly + '<br><span style="font-size:.75rem;color:var(--text3)">Local analyzer couldn\'t match your question either — try rephrasing (e.g. "record on NBA?", "biggest win?").</span>');
        } else {
          addChat('analysis', response);
        }
      });
      return;
    }

    /* ===== FALLBACK HELP MESSAGE (no key, no local match) ===== */
    addChat('system', 'Hmm, I\'m not sure what to do with that. Here\'s what I can help with:<br><br><strong>Add a bet:</strong><br><code>Lakers -3.5 (-110) $50</code><br><code>Celtics ML (+150) $25</code><br><code>$50 on Warriors -5.5</code><br><br><strong>Ask me anything:</strong><br><code>What\'s my record on NBA?</code><br><code>Net loss from Vanderbilt?</code><br><code>How am I doing?</code><br><code>Biggest win?</code><br><br>Or just paste your Bovada bet slip!<br><br><span style="font-size:.75rem;color:var(--text3)">Add a Claude API key in Settings for smarter AI responses.</span>');
    return;
  }

  if (!parsed) return;

  if (parsed._missingOdds) {
    delete parsed._missingOdds;
    store.awaitingOdds = parsed;
    addChat('system', 'Got it! What are the odds? (e.g. <code>-110</code> or <code>+150</code>)');
    return;
  }

  store.pendingConfirmation = parsed;
  renderChat();
}

function confirmBet() {
  if (!store.pendingConfirmation) return;
  var bet = {
    id: genId(),
    type: store.pendingConfirmation.type,
    sport: store.pendingConfirmation.sport,
    matchup: store.pendingConfirmation.matchup,
    pick: store.pendingConfirmation.pick,
    odds: store.pendingConfirmation.odds,
    stake: store.pendingConfirmation.stake,
    toWin: store.pendingConfirmation.toWin,
    settled: store.pendingConfirmation.settled || false,
    result: store.pendingConfirmation.result || null,
    settledDate: store.pendingConfirmation.settledDate || null,
    addedDate: new Date().toISOString(),
    gameTime: store.pendingConfirmation.gameTime || null
  };
  if (bet.type === 'future') { store.futures.push(bet); } else { store.bets.push(bet); }
  store.pendingConfirmation = null;
  addChat('success', 'Bet added! <strong>' + escHtml(bet.pick) + '</strong> ' + fmtOdds(bet.odds) + ' ' + fmtMoney(bet.stake));
  runBetPipeline(bet.type !== 'future' ? [bet] : []); /* sort + ESPN enrichment + save + render */
}

function cancelBet() {
  store.pendingConfirmation = null;
  addChat('system', 'Bet cancelled.');
  renderChat();
}

/* ═════════════════════════════════════════════════════════════════════
   BATCH CONFIRMATION — for multi-bet chat entries. Per project memory:
   "For multiple bets in one message, confirm the full batch at once,
   get one 'good', then write all of them together."
   ═════════════════════════════════════════════════════════════════════ */
function confirmBatch() {
  if (!store.pendingBatchConfirmation) return;
  var bets = store.pendingBatchConfirmation.bets || [];
  var added = [];
  for (var i = 0; i < bets.length; i++) {
    var p = bets[i];
    var bet = {
      id: genId(),
      type: p.type,
      sport: p.sport,
      matchup: p.matchup,
      pick: p.pick,
      odds: p.odds,
      stake: p.stake,
      toWin: p.toWin,
      settled: false,
      result: null,
      settledDate: null,
      addedDate: new Date().toISOString(),
      gameTime: null,
    };
    if (bet.type === 'future') store.futures.push(bet);
    else store.bets.push(bet);
    added.push(bet);
  }
  store.pendingBatchConfirmation = null;
  /* Summary line */
  var futCount = added.filter(function(b){return b.type==='future';}).length;
  var openCount = added.length - futCount;
  var stakeTotal = added.reduce(function(s,b){return s + (b.stake||0);}, 0);
  var summary = '<strong>' + added.length + ' bet(s) added!</strong>';
  var parts = [];
  if (openCount > 0) parts.push(openCount + ' open');
  if (futCount > 0)  parts.push(futCount + ' futures');
  if (parts.length) summary += ' (' + parts.join(', ') + ')';
  summary += '<br><span style="color:var(--text3);font-size:.75rem">Total stake: ' + fmtMoney(stakeTotal) + '</span>';
  addChat('success', summary);
  /* ESPN enrichment + save + render for non-futures */
  var openBetsAdded = added.filter(function(b){return b.type !== 'future';});
  runBetPipeline(openBetsAdded);
}

function cancelBatch() {
  store.pendingBatchConfirmation = null;
  addChat('system', 'Batch cancelled — no bets added.');
  renderChat();
}

/* ===== SETTLE BETS ===== */

/* Diagnostic — exposed for tests and the runbook. Returns a readable object. */
function btChatDiagnostics() {
  return {
    model: BT_CLAUDE_MODEL,
    dailyCap: BT_CLAUDE_DAILY_CAP,
    budget: _bt_budgetStatus(),
    memCacheSize: Object.keys(claudeCache).length,
    persistCacheSize: (function() {
      try { return Object.keys(JSON.parse(localStorage.getItem(BT_CLAUDE_CACHE_KEY) || '{}')).length; }
      catch (e) { return 0; }
    })(),
    hasKey: !!(store && store.claudeApiKey)
  };
}

/* Expose internals for the Node test harness (tests/test_chat_dispatch.js).
   Guarded so the browser runtime is unaffected. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    _bt_hash: _bt_hash,
    _bt_budgetStatus: _bt_budgetStatus,
    BT_CLAUDE_MODEL: BT_CLAUDE_MODEL,
    BT_CLAUDE_DAILY_CAP: BT_CLAUDE_DAILY_CAP
  };
}
