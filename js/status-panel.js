/* status-panel.js — Data Status widget in Settings modal.
 *
 * Surfaces:
 *   - /api/budget            → Odds API daily credit usage
 *   - /api/refresh/locks25   → scrape + status badge
 *   - /api/refresh/bovada    → scrape + status badge
 *   - /api/clv/refresh       → CLV snapshot + status badge
 *
 * All calls go through the local Flask server on the same origin. If the
 * server is unreachable, the widget degrades silently (shows "server offline").
 *
 * Added 2026-04-20 — post-hardening follow-up #1 & #2.
 */

var BT_STATUS_API = '';  /* same-origin — empty string = use current host */
var BT_STATUS_ENDPOINTS = {
  budget:  '/api/budget',
  locks25: '/api/refresh/locks25',
  bovada:  '/api/refresh/bovada',
  clv:     '/api/clv/refresh',
};

/* Color mapping for status slugs — matches exit codes from scraper_common.py */
var BT_STATUS_COLORS = {
  success:  'var(--green)',
  auth:     'var(--red)',
  scrape:   'var(--amber)',
  browser:  'var(--red)',
  excel:    'var(--amber)',
  budget:   'var(--amber)',
  missing:  'var(--text3)',
  unknown:  'var(--text3)',
  offline:  'var(--text3)',
  pending:  'var(--text3)',
};

var _btStatusInFlight = {};  /* label → true while a request is pending */

/* ─── Budget display ─────────────────────────────────────────────────────── */

function btRefreshBudget() {
  var el = document.getElementById('budgetDisplay');
  if (!el) return;
  el.textContent = 'checking…';
  fetch(BT_STATUS_API + BT_STATUS_ENDPOINTS.budget)
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (!data || !data.ok) {
        el.innerHTML = '<span style="color:var(--text3)">unavailable</span>';
        return;
      }
      var used  = data.today.credits_used;
      var cap   = data.daily_cap;
      var pct   = data.pct_used;
      var color = pct >= 90 ? 'var(--red)'
                : pct >= 50 ? 'var(--amber)'
                : 'var(--green)';
      el.innerHTML = '<strong style="color:' + color + '">' + used + '</strong>' +
                     '<span style="color:var(--text3)"> / ' + cap + ' credits today (' + pct + '%)</span>';
    })
    .catch(function() {
      el.innerHTML = '<span style="color:var(--text3)">server offline</span>';
    });
}

/* ─── Status badge rendering ─────────────────────────────────────────────── */

function _btRenderBadge(label, status) {
  var container = document.getElementById('statusBadges');
  if (!container) return;

  var slug  = (status && status.slug) || 'unknown';
  var text  = (status && status.label) || 'Unknown';
  var color = BT_STATUS_COLORS[slug] || 'var(--text3)';

  /* Remove any existing badge for this label — we always show the latest */
  var existing = document.getElementById('statusBadge-' + label);
  if (existing) existing.parentNode.removeChild(existing);

  var row = document.createElement('div');
  row.id = 'statusBadge-' + label;
  row.style.display = 'flex';
  row.style.justifyContent = 'space-between';
  row.style.alignItems = 'center';
  row.style.padding = '4px 8px';
  row.style.background = 'rgba(255,255,255,.03)';
  row.style.borderRadius = '4px';
  row.style.borderLeft = '3px solid ' + color;

  var when = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  row.innerHTML =
    '<span><strong>' + label + '</strong> <span style="color:' + color + '">' + _btEsc(text) + '</span></span>' +
    '<span style="color:var(--text3);font-size:.7rem">' + when + '</span>';

  container.appendChild(row);
}

function _btEsc(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ─── Scraper triggers ───────────────────────────────────────────────────── */

function btTriggerScraper(which) {
  if (_btStatusInFlight[which]) return;
  _btStatusInFlight[which] = true;
  _btRenderBadge(which, { slug: 'pending', label: 'Running…' });

  fetch(BT_STATUS_API + BT_STATUS_ENDPOINTS[which], { method: 'POST' })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      _btStatusInFlight[which] = false;
      var status = (data && data.status) || { slug: 'unknown', label: 'No status returned' };
      _btRenderBadge(which, status);
      /* Refresh the dashboard if scrape succeeded */
      if (status.ok) {
        try {
          if (typeof syncFromExcel === 'function') syncFromExcel();
          else if (typeof renderAll === 'function') renderAll();
        } catch (e) { /* non-fatal */ }
      }
      /* Also refresh budget — scrape may have updated Odds API usage */
      btRefreshBudget();
    })
    .catch(function(err) {
      _btStatusInFlight[which] = false;
      _btRenderBadge(which, {
        slug: 'offline',
        label: 'Server offline — is python3 server.py running?'
      });
    });
}

function btTriggerClv() {
  if (_btStatusInFlight.clv) return;
  _btStatusInFlight.clv = true;
  _btRenderBadge('clv', { slug: 'pending', label: 'Fetching odds…' });

  fetch(BT_STATUS_API + BT_STATUS_ENDPOINTS.clv, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      _btStatusInFlight.clv = false;
      var status = (data && data.status) || { slug: 'unknown', label: 'No status returned' };
      _btRenderBadge('clv', status);
      btRefreshBudget();  /* CLV burns credits — always refresh budget after */
    })
    .catch(function() {
      _btStatusInFlight.clv = false;
      _btRenderBadge('clv', { slug: 'offline', label: 'Server offline' });
    });
}

/* ─── Auto-load budget when Settings modal opens ─────────────────────────── */

/* Wrap toggleSettings so we refresh budget every time the modal is opened,
   without breaking the original function. */
(function() {
  if (typeof toggleSettings !== 'function') return;
  var _original = toggleSettings;
  window.toggleSettings = function() {
    var r = _original.apply(this, arguments);
    /* Delay slightly — modal needs to be visible before fetching */
    setTimeout(btRefreshBudget, 50);
    return r;
  };
})();

/* ─── Diagnostic export for the Node test harness ────────────────────────── */

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    BT_STATUS_ENDPOINTS: BT_STATUS_ENDPOINTS,
    BT_STATUS_COLORS: BT_STATUS_COLORS,
    _btEsc: _btEsc,
  };
}
