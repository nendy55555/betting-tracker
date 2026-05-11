/* Bet management: confirm, settle, delete, card interactions */
/* Extracted from betting-tracker.html — do not edit the original */

function resettleBet(id, result) {
  var all = store.bets.concat(store.futures);
  for (var i = 0; i < all.length; i++) {
    if (all[i].id === id) { all[i].result = result; break; }
  }
  invalidateStats();
  runBetPipeline([]); /* sort + save + render */
}

function settleBet(id, result) {
  var target = null;
  for (var i = 0; i < store.bets.length; i++) {
    if (store.bets[i].id === id) {
      store.bets[i].settled = true;
      store.bets[i].result = result;
      store.bets[i].settledDate = new Date().toISOString();
      target = store.bets[i];
      break;
    }
  }
  invalidateStats();
  runBetPipeline(target ? [target] : []); /* sort + ESPN enrichment if needed + save + render */
}

function settleFuture(id, result) {
  for (var i = 0; i < store.futures.length; i++) {
    if (store.futures[i].id === id) {
      store.futures[i].settled = true;
      store.futures[i].result = result;
      store.futures[i].settledDate = new Date().toISOString();
      break;
    }
  }
  invalidateStats();
  runBetPipeline([]); /* sort + save + render */
}

function deleteBet(id) {
  store.bets = store.bets.filter(function(b) { return b.id !== id; });
  store.futures = store.futures.filter(function(b) { return b.id !== id; });
  invalidateStats();
  saveData(); renderAll();
}

/* ═════════════════════════════════════════════════════════════════════
   EDIT BET — opens a modal pre-filled with the bet's current values.
   Saves to Excel via POST /api/bets/update so manual fixes survive sync.
   ═════════════════════════════════════════════════════════════════════ */

window.__editBetState = { id: null, sheet: null, txId: null };

function _findBetById(id) {
  for (var i = 0; i < store.bets.length; i++) if (store.bets[i].id === id) return store.bets[i];
  for (var j = 0; j < (store.futures || []).length; j++) if (store.futures[j].id === id) return store.futures[j];
  return null;
}

function _val(elId, v) {
  var el = document.getElementById(elId);
  if (el) el.value = (v === null || v === undefined) ? '' : v;
}
function _read(elId) {
  var el = document.getElementById(elId);
  return el ? (el.value || '').trim() : '';
}

function editBet(id) {
  var b = _findBetById(id);
  if (!b) { alert('Bet not found in local store.'); return; }

  var isOpen = !b.settled || !b.result;
  var sheet  = isOpen ? 'open' : 'history';
  window.__editBetState = { id: id, sheet: sheet, txId: b.txId || '', rowKey: b.excelRow || null, betSnapshot: b };

  /* Sheet tag + conditional fields */
  var tag = document.getElementById('editBetSheetTag');
  if (tag) tag.textContent = isOpen ? 'OPEN BETS sheet' : 'BET HISTORY sheet';
  document.getElementById('ebGameTimeWrap').style.display    = isOpen ? '' : 'none';
  document.getElementById('ebSettledDateWrap').style.display = isOpen ? 'none' : '';
  document.getElementById('ebWinLossWrap').style.display     = isOpen ? 'none' : '';
  document.getElementById('ebSourceWrap').style.display      = isOpen ? 'none' : '';

  /* Pre-fill */
  _val('ebSport',    b.sport || '');
  _val('ebBetType',  b.type || '');
  _val('ebTeams',    b.matchup || '');
  /* Pull line out of the pick if line isn't a separate field locally */
  var line = b.line || '';
  if (!line && b.pick) {
    /* pick format: "Teams  Line  (+Odds)" — line is the middle chunk */
    var parts = b.pick.split(/\s{2,}/);
    if (parts.length >= 2) {
      var mid = parts[1] || '';
      if (mid && !/^\([+-]?\d/.test(mid)) line = mid;
    }
  }
  _val('ebLine', line);
  _val('ebOdds',  b.odds ? (b.odds > 0 ? '+' + b.odds : String(b.odds)) : '');
  _val('ebStake', b.stake || '');
  _val('ebToWin', b.toWin || '');
  _val('ebGameTime',    b.gameTime || '');
  _val('ebSettledDate', b.settledDate || '');
  _val('ebStatus', isOpen ? 'Open' : (b.result === 'W' ? 'Won' : b.result === 'L' ? 'Lost' : b.result === 'P' ? 'Push' : ''));
  _val('ebWinLoss', (b.winLoss !== undefined && b.winLoss !== null) ? b.winLoss : (b.result === 'W' ? (b.toWin || 0) : b.result === 'L' ? -(b.stake || 0) : 0));
  _val('ebNotes', b.notes || '');
  _val('ebSource', b.source || '');

  document.getElementById('ebError').style.display = 'none';
  document.getElementById('ebMeta').textContent =
    'txId: ' + (b.txId || '(none — matched by row)') + '   ·   id: ' + b.id;

  document.getElementById('editBetModal').classList.add('show');
}

function closeEditBet() {
  document.getElementById('editBetModal').classList.remove('show');
  window.__editBetState = { id: null, sheet: null, txId: null };
}

function _showEbError(msg) {
  var el = document.getElementById('ebError');
  if (!el) { alert(msg); return; }
  el.textContent = msg;
  el.style.display = 'block';
}

function saveEditBet() {
  var st = window.__editBetState;
  if (!st || !st.id) { _showEbError('No bet loaded.'); return; }

  var fields = {
    sport:   _read('ebSport'),
    betType: _read('ebBetType'),
    teams:   _read('ebTeams'),
    line:    _read('ebLine'),
    odds:    _read('ebOdds'),
    stake:   _read('ebStake'),
    toWin:   _read('ebToWin'),
    status:  _read('ebStatus'),
    notes:   _read('ebNotes'),
  };
  if (st.sheet === 'open') {
    fields.gameTime = _read('ebGameTime');
  } else {
    fields.settledDate = _read('ebSettledDate');
    fields.winLoss     = _read('ebWinLoss');
    var src = _read('ebSource');
    if (src) fields.source = src;
  }

  /* Strip empty strings so we don't blow away cells unintentionally —
     EXCEPT for fields the user explicitly cleared (we treat empty as "no change"). */
  Object.keys(fields).forEach(function(k) {
    if (fields[k] === '' || fields[k] === null) delete fields[k];
  });
  if (!Object.keys(fields).length) { _showEbError('No fields to update.'); return; }

  var btn = document.getElementById('ebSaveBtn');
  if (btn) { btn.textContent = 'Saving…'; btn.disabled = true; }

  var user = (window.userContext && window.userContext.user) || 'Thomas';
  var body = {
    user:   user,
    sheet:  st.sheet,
    txId:   st.txId || '',
    rowKey: st.rowKey || null,
    fields: fields,
  };

  fetch('http://localhost:5001/api/bets/update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  .then(function(r) { return r.json().then(function(j) { return { status: r.status, json: j }; }); })
  .then(function(res) {
    if (btn) { btn.textContent = 'Save'; btn.disabled = false; }
    var j = res.json || {};
    if (!j.ok) {
      var msg = j.error || ('Server returned ' + res.status);
      if (j.code === 'XLSX_LOCKED')   msg = 'Excel file is open — close it and try again.';
      if (j.code === 'ROW_NOT_FOUND') msg = 'Could not find this bet in Excel (txId or row mismatch).';
      _showEbError(msg);
      return;
    }
    /* Patch the bet in localStorage so the dashboard reflects the edit immediately */
    var refreshed = j.bet;
    if (refreshed) {
      var arr = store.bets;
      for (var i = 0; i < arr.length; i++) {
        if (arr[i].id === st.id || (arr[i].txId && arr[i].txId === refreshed.txId)) {
          /* Preserve ESPN-enriched fields */
          var ex = arr[i];
          ['espnMatchup','espnScore','scheduledStart','expectedEndTime'].forEach(function(k){
            if (ex[k] && !refreshed[k]) refreshed[k] = ex[k];
          });
          arr[i] = refreshed;
          break;
        }
      }
    } else {
      /* No txId match on server — fall back to local field merge so UI still updates */
      var local = _findBetById(st.id);
      if (local) {
        if (fields.sport)   local.sport   = fields.sport;
        if (fields.teams)   local.matchup = fields.teams;
        if (fields.betType) local.type    = fields.betType;
        if (fields.odds)    local.odds    = parseInt(String(fields.odds).replace(/[^\d-]/g,''), 10) || local.odds;
        if (fields.stake)   local.stake   = parseFloat(fields.stake) || local.stake;
        if (fields.toWin)   local.toWin   = parseFloat(fields.toWin) || local.toWin;
        if (fields.notes !== undefined) local.notes = fields.notes;
      }
    }
    saveData();
    invalidateStats();
    renderAll();
    closeEditBet();
    addChat('system', '✏️ Bet updated: ' + Object.keys(fields).length + ' field(s) changed.');
  })
  .catch(function(err) {
    if (btn) { btn.textContent = 'Save'; btn.disabled = false; }
    _showEbError('Could not reach server — is server.py running? ' + err.message);
  });
}

/* ===== TOGGLE BET CARD ===== */
function toggleCard(id) {
  var card = document.getElementById('card-' + id);
  if (card) card.classList.toggle('expanded');
}
function openBetSlip(txId) {
  /* bet-detail.html archived 2026-05-10 — click is now inert.
     If detail view is wanted again, render inline in betting-tracker.html. */
}

/* ===== TOGGLE RESULT-SPLIT ROW =====
   Used by multi-bet game groups that collapse into "[Team] multiple" rows
   (one per result: W/L/P). Click toggles the inner bet-card list. */
function toggleResultRow(rowId) {
  var more  = document.getElementById(rowId + '_more');
  var arrow = document.getElementById(rowId + '_arrow');
  if (!more || !arrow) return;
  var isOpen = arrow.getAttribute('data-open') === '1';
  if (isOpen) {
    more.style.display = 'none';
    arrow.setAttribute('data-open', '0');
    arrow.innerHTML = '&#9654;';
  } else {
    more.style.display = 'block';
    arrow.setAttribute('data-open', '1');
    arrow.innerHTML = '&#9660;';
  }
}

/* ===== TOGGLE GROUP EXTRA BETS ===== */
function toggleGroupExpand(grpId, extraCount) {
  var more   = document.getElementById(grpId + '_more');
  var toggle = document.getElementById(grpId + '_toggle');
  var arrow  = document.getElementById(grpId + '_arrow');
  var label  = document.getElementById(grpId + '_label');
  if (!more || !toggle) return;
  var isOpen = toggle.getAttribute('data-open') === '1';
  if (isOpen) {
    more.style.display = 'none';
    toggle.setAttribute('data-open', '0');
    if (arrow) arrow.innerHTML = '&#9654;';
    if (label) label.textContent = extraCount + ' more bet' + (extraCount > 1 ? 's' : '');
  } else {
    more.style.display = 'block';
    toggle.setAttribute('data-open', '1');
    if (arrow) arrow.innerHTML = '&#9660;';
    if (label) label.textContent = 'Show less';
  }
}

/* ===== RENDER: DASHBOARD ===== */

