/* futures-engine-ui.js
   ─────────────────────────────────────────────────────────────
   Surfaces /api/stale-futures in two places:
     1. Home tab — compact alert banner above the dash-stats row
     2. Futures tab — full "Needs Review" panel with one-click W/L/P settle

   Auto-fetches on app load. Manual ↻ refresh button on both surfaces.
   Settlement POSTs to /api/settle-bet which moves the row from
   "Open Bets" → "Bet History" inside the active user's xlsx.
*/
(function () {
  'use strict';

  var STATE = {
    futures: [],
    loading: false,
    lastFetched: 0,
    error: null,
  };

  // ── styles ────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('btFuturesEngineStyles')) return;
    var css =
      '.bt-stale-banner{display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:8px;' +
      'background:linear-gradient(90deg,rgba(255,184,51,0.12),rgba(255,184,51,0.04));' +
      'border:1px solid rgba(255,184,51,0.35);margin-bottom:14px;cursor:pointer;transition:all .15s;font-size:0.85rem}' +
      '.bt-stale-banner:hover{background:linear-gradient(90deg,rgba(255,184,51,0.18),rgba(255,184,51,0.06));border-color:rgba(255,184,51,0.55)}' +
      '.bt-stale-banner-icon{font-size:1.15rem;line-height:1}' +
      '.bt-stale-banner-text{flex:1;color:var(--text)}' +
      '.bt-stale-banner-text strong{color:#ffb833;font-weight:700;letter-spacing:.01em}' +
      '.bt-stale-banner-action{font-size:0.72rem;color:#ffb833;text-transform:uppercase;letter-spacing:.08em;font-weight:600}' +
      '.bt-stale-banner-refresh{background:none;border:none;cursor:pointer;color:var(--text3);font-size:0.85rem;padding:4px 8px;border-radius:6px;transition:all .12s}' +
      '.bt-stale-banner-refresh:hover{background:rgba(255,255,255,0.05);color:var(--text)}' +

      '.bt-fut-panel{margin-bottom:18px;background:var(--surface);border:1px solid var(--border);border-radius:10px;overflow:hidden}' +
      '.bt-fut-panel-header{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:rgba(255,184,51,0.08);border-bottom:1px solid var(--border)}' +
      '.bt-fut-panel-title{font-weight:700;font-size:0.95rem;color:var(--text);display:flex;align-items:center;gap:8px}' +
      '.bt-fut-count-pill{font-size:0.7rem;background:#ffb833;color:#0d1720;padding:2px 8px;border-radius:10px;font-weight:700;letter-spacing:.04em}' +
      '.bt-fut-panel-actions{display:flex;gap:6px;align-items:center}' +
      '.bt-fut-refresh-btn{background:rgba(255,255,255,0.03);border:1px solid var(--border);color:var(--text2);padding:5px 11px;border-radius:6px;cursor:pointer;font-size:0.75rem;font-family:inherit;transition:all .12s}' +
      '.bt-fut-refresh-btn:hover{background:rgba(255,255,255,0.06);color:var(--text);border-color:rgba(255,255,255,0.12)}' +
      '.bt-fut-refresh-btn:disabled{opacity:0.5;cursor:wait}' +

      '.bt-fut-row{display:grid;grid-template-columns:1fr 130px 100px 320px;gap:14px;padding:12px 14px;align-items:center;border-bottom:1px solid rgba(255,255,255,0.04)}' +
      '.bt-fut-row:last-child{border-bottom:none}' +
      '.bt-fut-row:hover{background:rgba(255,255,255,0.02)}' +
      '.bt-fut-info{min-width:0}' +
      '.bt-fut-matchup{font-weight:600;font-size:0.92rem;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.bt-fut-meta{font-size:0.72rem;color:var(--text3);margin-top:3px;display:flex;gap:10px}' +
      '.bt-fut-meta span{display:inline-flex;align-items:center;gap:3px}' +
      '.bt-fut-days{font-size:0.7rem;color:var(--amber);font-weight:600;letter-spacing:.02em}' +
      '.bt-fut-stake{font-family:monospace;font-size:0.85rem;color:var(--text2);text-align:right}' +
      '.bt-fut-towin{font-family:monospace;font-size:0.85rem;color:var(--green);text-align:right}' +
      '.bt-fut-actions{display:flex;gap:6px;flex-wrap:wrap}' +
      '.bt-fut-actions input{flex:1;min-width:0;padding:5px 8px;font-size:0.75rem;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:5px;font-family:inherit;outline:none}' +
      '.bt-fut-actions input:focus{border-color:var(--green)}' +
      '.bt-fut-btn{padding:5px 11px;font-size:0.74rem;font-weight:700;border:none;border-radius:5px;cursor:pointer;letter-spacing:.04em;font-family:inherit;transition:all .12s}' +
      '.bt-fut-btn-w{background:rgba(0,208,132,0.18);color:#00d084;border:1px solid rgba(0,208,132,0.3)}' +
      '.bt-fut-btn-w:hover{background:rgba(0,208,132,0.28)}' +
      '.bt-fut-btn-l{background:rgba(255,68,85,0.16);color:#ff4455;border:1px solid rgba(255,68,85,0.3)}' +
      '.bt-fut-btn-l:hover{background:rgba(255,68,85,0.26)}' +
      '.bt-fut-btn-p{background:rgba(255,184,51,0.16);color:#ffb833;border:1px solid rgba(255,184,51,0.3)}' +
      '.bt-fut-btn-p:hover{background:rgba(255,184,51,0.26)}' +
      '.bt-fut-btn[disabled]{opacity:0.4;cursor:wait}' +

      '.bt-fut-toast{position:fixed;bottom:24px;right:24px;padding:12px 18px;border-radius:8px;font-size:0.85rem;font-weight:500;z-index:9999;box-shadow:0 8px 30px rgba(0,0,0,0.4);transition:all .25s;transform:translateY(20px);opacity:0}' +
      '.bt-fut-toast.show{transform:translateY(0);opacity:1}' +
      '.bt-fut-toast.ok{background:#152028;border:1px solid rgba(0,208,132,0.4);color:#00d084}' +
      '.bt-fut-toast.err{background:#152028;border:1px solid rgba(255,68,85,0.4);color:#ff4455}' +

      '.bt-fut-empty{padding:24px;text-align:center;color:var(--text3);font-size:0.85rem}' +
      '@media (max-width:900px){.bt-fut-row{grid-template-columns:1fr;gap:8px}.bt-fut-stake,.bt-fut-towin{text-align:left}}';
    var style = document.createElement('style');
    style.id = 'btFuturesEngineStyles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ── toast ─────────────────────────────────────────────────────
  function toast(msg, kind) {
    var t = document.createElement('div');
    t.className = 'bt-fut-toast ' + (kind === 'err' ? 'err' : 'ok');
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('show'); });
    setTimeout(function () {
      t.classList.remove('show');
      setTimeout(function () { t.remove(); }, 300);
    }, 3200);
  }

  // ── publish stale-future map so other modules (renderFutures) can decorate cards
  function publishStaleIds() {
    var map = {};
    STATE.futures.forEach(function (f) {
      // Keyed by both txId and id so dashboard.js can match either lookup
      if (f.txId) map[String(f.txId)] = f;
      if (f.id) map[String(f.id)] = f;
    });
    window.__btStaleFutures = map;
  }

  // ── fetch ─────────────────────────────────────────────────────
  function fetchStaleFutures() {
    if (STATE.loading) return Promise.resolve(STATE.futures);
    STATE.loading = true;
    STATE.error = null;
    setRefreshButtonState(true);

    return fetch('/api/stale-futures')
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        if (!data.ok) throw new Error(data.error || 'request failed');
        STATE.futures = data.futures || [];
        STATE.lastFetched = Date.now();
        publishStaleIds();
        renderBanner();
        renderPanel();
        if (typeof window.renderFutures === 'function') {
          try { window.renderFutures(); } catch (e) { /* ignore */ }
        }
        return STATE.futures;
      })
      .catch(function (e) {
        STATE.error = e.message || String(e);
        STATE.futures = [];
        publishStaleIds();
        renderBanner();
        renderPanel();
      })
      .then(function () {
        STATE.loading = false;
        setRefreshButtonState(false);
      });
  }

  function setRefreshButtonState(loading) {
    document.querySelectorAll('.bt-fut-refresh-btn, .bt-stale-banner-refresh').forEach(function (b) {
      b.disabled = loading;
      if (loading) b.textContent = '↻ Checking…';
      else b.textContent = '↻ Refresh';
    });
  }

  // ── banner (Home tab) ─────────────────────────────────────────
  function renderBanner() {
    var home = document.getElementById('home-tab');
    if (!home) return;
    var existing = document.getElementById('btStaleBanner');
    if (existing) existing.remove();

    if (!STATE.futures.length) return; // nothing to show

    var n = STATE.futures.length;
    var banner = document.createElement('div');
    banner.id = 'btStaleBanner';
    banner.className = 'bt-stale-banner';
    banner.innerHTML =
      '<span class="bt-stale-banner-icon">⚠️</span>' +
      '<span class="bt-stale-banner-text"><strong>' + n + ' future' + (n === 1 ? '' : 's') + '</strong> ' +
        (n === 1 ? 'needs' : 'need') + ' review — event ended but bet still open.</span>' +
      '<span class="bt-stale-banner-action">Review →</span>' +
      '<button class="bt-stale-banner-refresh" onclick="event.stopPropagation();window.BT_refreshStaleFutures()">↻ Refresh</button>';
    banner.addEventListener('click', function () {
      if (typeof window.switchTab === 'function') window.switchTab('futures');
      setTimeout(function () {
        var p = document.getElementById('btFutPanel');
        if (p && p.scrollIntoView) p.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);
    });

    // Insert above the .dash-stats row
    var stats = home.querySelector('.dash-stats');
    if (stats) {
      stats.parentNode.insertBefore(banner, stats);
    } else {
      home.insertBefore(banner, home.firstChild);
    }
  }

  // ── panel (Futures tab) ───────────────────────────────────────
  function renderPanel() {
    var fut = document.getElementById('futures-tab');
    if (!fut) return;
    var existing = document.getElementById('btFutPanel');
    if (existing) existing.remove();

    var panel = document.createElement('div');
    panel.id = 'btFutPanel';
    panel.className = 'bt-fut-panel';

    var headerHtml =
      '<div class="bt-fut-panel-header">' +
        '<div class="bt-fut-panel-title">' +
          '<span>📋 Needs Review</span>' +
          (STATE.futures.length ? '<span class="bt-fut-count-pill">' + STATE.futures.length + '</span>' : '') +
        '</div>' +
        '<div class="bt-fut-panel-actions">' +
          (STATE.lastFetched ? '<span style="font-size:0.7rem;color:var(--text3)">' + relTime(STATE.lastFetched) + '</span>' : '') +
          '<button class="bt-fut-refresh-btn" onclick="window.BT_refreshStaleFutures()">↻ Refresh</button>' +
        '</div>' +
      '</div>';

    var body;
    if (STATE.error) {
      body = '<div class="bt-fut-empty" style="color:var(--red)">Could not load: ' + escapeHtml(STATE.error) + '</div>';
    } else if (!STATE.futures.length) {
      body = '<div class="bt-fut-empty">No stale futures — every open future is still within its event window. ✓</div>';
    } else {
      body = '';
      STATE.futures.forEach(function (f) {
        body += renderRow(f);
      });
    }

    panel.innerHTML = headerHtml + body;

    // Insert at top of futures tab (above the header line)
    fut.insertBefore(panel, fut.firstChild);
  }

  function renderRow(f) {
    var matchup = escapeHtml(f.matchup || '');
    var stake = (window.fmtMoney || function (n) { return '$' + Number(n || 0).toFixed(2); });
    var oddsFmt = (window.fmtOdds || function (n) { return n >= 0 ? '+' + n : '' + n; });
    var sport = escapeHtml(f.sport || '');
    var champ = escapeHtml(f.championshipName || '');
    var endDate = f.eventEndDate || '';
    var daysPast = f.daysPast || 0;

    return '' +
      '<div class="bt-fut-row" id="btFutRow_' + escapeHtml(f.id) + '">' +
        '<div class="bt-fut-info">' +
          '<div class="bt-fut-matchup">' + matchup + '</div>' +
          '<div class="bt-fut-meta">' +
            '<span>' + sport + '</span>' +
            '<span>' + champ + '</span>' +
            '<span>Odds ' + oddsFmt(f.odds) + '</span>' +
            '<span class="bt-fut-days">Ended ' + endDate + ' · ' + daysPast + 'd ago</span>' +
          '</div>' +
        '</div>' +
        '<div class="bt-fut-stake">Risk ' + stake(f.stake) + '</div>' +
        '<div class="bt-fut-towin">To win ' + stake(f.toWin) + '</div>' +
        '<div class="bt-fut-actions">' +
          '<input type="text" placeholder="Winner (optional)" id="btFutWin_' + escapeHtml(f.id) + '" />' +
          '<button class="bt-fut-btn bt-fut-btn-w" onclick="window.BT_settleFuture(\'' + escapeJs(f.id) + '\',\'W\')">Won</button>' +
          '<button class="bt-fut-btn bt-fut-btn-l" onclick="window.BT_settleFuture(\'' + escapeJs(f.id) + '\',\'L\')">Lost</button>' +
          '<button class="bt-fut-btn bt-fut-btn-p" onclick="window.BT_settleFuture(\'' + escapeJs(f.id) + '\',\'P\')">Push</button>' +
        '</div>' +
      '</div>';
  }

  // ── settle action ─────────────────────────────────────────────
  window.BT_settleFuture = function (betId, result) {
    var winningTeam = '';
    var input = document.getElementById('btFutWin_' + betId);
    if (input) winningTeam = (input.value || '').trim();

    // Optimistic UI: disable buttons in this row
    var row = document.getElementById('btFutRow_' + betId);
    if (row) row.querySelectorAll('.bt-fut-btn').forEach(function (b) { b.disabled = true; });

    fetch('/api/settle-bet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ betId: betId, result: result, winningTeam: winningTeam || null }),
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (resp) {
        if (!resp.ok || !resp.data.ok) {
          throw new Error((resp.data && resp.data.error) || 'settle failed');
        }
        var winLoss = resp.data.win_loss || 0;
        var sign = winLoss >= 0 ? '+' : '−';
        var fmt = window.fmtMoney || function (n) { return '$' + Number(n || 0).toFixed(2); };
        toast('Settled: ' + result + ' · ' + sign + fmt(Math.abs(winLoss)), 'ok');
        // Refresh local state + the underlying bet store
        if (typeof window.syncFromExcel === 'function') {
          window.syncFromExcel();
        } else if (typeof window.location !== 'undefined') {
          // Fallback — refetch stale list at least
          fetchStaleFutures();
        }
        // Drop the settled row from the local state immediately
        STATE.futures = STATE.futures.filter(function (x) { return x.id !== betId; });
        publishStaleIds(); // keep window.__btStaleFutures in sync so card re-renders are clean
        renderBanner();
        renderPanel();
      })
      .catch(function (e) {
        toast('Settle failed: ' + (e.message || e), 'err');
        if (row) row.querySelectorAll('.bt-fut-btn').forEach(function (b) { b.disabled = false; });
      });
  };

  window.BT_refreshStaleFutures = function () {
    fetchStaleFutures();
  };

  // ── helpers ───────────────────────────────────────────────────
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function escapeJs(s) {
    return String(s == null ? '' : s).replace(/['\\]/g, '\\$&');
  }
  function relTime(ts) {
    var diff = Math.round((Date.now() - ts) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.round(diff / 60) + 'm ago';
    if (diff < 86400) return Math.round(diff / 3600) + 'h ago';
    return Math.round(diff / 86400) + 'd ago';
  }

  // ── boot ──────────────────────────────────────────────────────
  function boot() {
    injectStyles();
    // Run once on load. The server cache + xlsx mtime means subsequent fetches
    // are cheap, so we can also re-check periodically.
    fetchStaleFutures();
    // Recheck every 10 min — picks up newly-stale events as days pass without a reload
    setInterval(fetchStaleFutures, 10 * 60 * 1000);
    // Re-check when a tab gains focus (covers leaving the laptop overnight)
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && Date.now() - STATE.lastFetched > 60000) {
        fetchStaleFutures();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    // Run after a tiny delay so other modules have set up their globals
    setTimeout(boot, 200);
  }
})();
