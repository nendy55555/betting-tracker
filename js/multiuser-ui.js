/* multiuser-ui.js
   ─────────────────────────────────────────────────────────────
   Layer added 2026-05-10. Provides:
     1. Landing screen — pre-app user picker (Thomas default + 4 others)
     2. Top-right account switcher in the header
     3. Bet-type + sport filters above Open Bets and Settled Bets panes
     4. Team logos prepended to bet cards (via js/team-logos.js)
     5. Team leaderboard widget injected into Deep Analysis tab

   Loads AFTER all the existing render functions so it can wrap them.
   Designed to be additive — never overwrites the existing rendering.
*/
(function () {
  'use strict';

  var ALLOWED = ['Thomas', 'Andrew', 'Rudger', 'Tyler', 'baby'];
  var ACTIVE  = window.BT_USER || 'Thomas';

  // ────────────────────────────────────────────────────────────
  // 1. LANDING SCREEN — shown if no user picked this session
  // ────────────────────────────────────────────────────────────
  function shouldShowLanding() {
    try {
      // URL param overrides (lets us deep-link a specific user)
      var u = new URLSearchParams(window.location.search).get('user');
      if (u && ALLOWED.indexOf(u) >= 0) return false;
      var picked = sessionStorage.getItem('bt_landing_dismissed');
      return picked !== '1';
    } catch (e) { return true; }
  }

  function renderLanding() {
    if (!shouldShowLanding()) return;

    var overlay = document.createElement('div');
    overlay.id = 'btLandingOverlay';
    overlay.style.cssText = [
      'position:fixed','top:0','left:0','right:0','bottom:0',
      'background:radial-gradient(ellipse at top, #152028 0%, #0d1720 60%, #07101a 100%)',
      'z-index:99999','display:flex','flex-direction:column',
      'align-items:center','justify-content:center','padding:24px',
      'font-family:Outfit,system-ui,sans-serif','color:#eaeff4'
    ].join(';');

    overlay.innerHTML =
      '<div style="text-align:center;max-width:480px;width:100%">' +
        '<div style="font-size:2.4rem;font-weight:800;letter-spacing:-1px;margin-bottom:8px">' +
          '<span style="color:#00d084">Bet</span>Tracker' +
          '<span style="color:#5b8ef7"> Pro</span>' +
        '</div>' +
        '<div style="color:#8fa3b4;font-size:0.95rem;margin-bottom:32px">Who\'s tracking bets today?</div>' +
        '<div style="background:#152028;border:1px solid #1e3045;border-radius:14px;padding:24px;box-shadow:0 10px 40px rgba(0,0,0,0.4)">' +
          '<label style="display:block;text-align:left;font-size:0.75rem;color:#7a8f9e;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px">Select user</label>' +
          '<select id="btLandingPicker" style="' +
            'width:100%;padding:14px 16px;font-size:1.05rem;font-family:inherit;' +
            'background:#0d1720;color:#eaeff4;border:1px solid #1e3045;border-radius:9px;' +
            'cursor:pointer;outline:none;margin-bottom:18px;appearance:none;' +
            'background-image:url(\'data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 16 16%22 fill=%22%238fa3b4%22><path d=%22M4 6l4 4 4-4z%22/></svg>\');' +
            'background-repeat:no-repeat;background-position:right 14px center;background-size:14px;padding-right:38px' +
          '">' +
            ALLOWED.map(function (u) {
              return '<option value="' + u + '"' + (u === 'Thomas' ? ' selected' : '') + '>' + u + '</option>';
            }).join('') +
          '</select>' +
          '<button id="btLandingGo" style="' +
            'width:100%;padding:14px 16px;font-size:1.05rem;font-weight:700;font-family:inherit;' +
            'background:#00d084;color:#0d1720;border:none;border-radius:9px;cursor:pointer;' +
            'letter-spacing:0.03em;transition:all 0.15s' +
          '">Go &nbsp;→</button>' +
          '<div style="margin-top:14px;color:#7a8f9e;font-size:0.72rem;text-align:left;line-height:1.45">' +
            'Each user has their own bet history. You can switch later from the top-right.' +
          '</div>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);

    var picker = overlay.querySelector('#btLandingPicker');
    var goBtn  = overlay.querySelector('#btLandingGo');

    function commitUser() {
      var u = picker.value;
      if (ALLOWED.indexOf(u) < 0) u = 'Thomas';
      window.BT_setUser && window.BT_setUser(u);
      ACTIVE = u;
      try { sessionStorage.setItem('bt_landing_dismissed', '1'); } catch (e) {}
      overlay.style.opacity = '0';
      overlay.style.transition = 'opacity 0.25s';
      setTimeout(function () {
        overlay.remove();
        syncSwitcherLabel();
        reloadAllData();
      }, 260);
    }

    goBtn.addEventListener('click', commitUser);
    picker.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') commitUser();
    });
    setTimeout(function () { picker.focus(); }, 50);
  }

  // ────────────────────────────────────────────────────────────
  // 2. ACCOUNT SWITCHER — sits in header right side
  // ────────────────────────────────────────────────────────────
  function injectSwitcher() {
    var tools = document.querySelector('.header .header-tools');
    if (!tools) return;
    if (document.getElementById('btAccountSwitcher')) return;

    var wrap = document.createElement('div');
    wrap.id = 'btAccountSwitcher';
    wrap.style.cssText = 'position:relative;display:flex;align-items:center;gap:6px;margin-right:8px';
    wrap.innerHTML =
      '<span style="font-size:0.72rem;color:#7a8f9e;letter-spacing:0.08em;text-transform:uppercase">User</span>' +
      '<select id="btUserSwitcher" style="' +
        'padding:6px 28px 6px 10px;font-size:0.85rem;font-weight:600;font-family:inherit;' +
        'background:#152028;color:#eaeff4;border:1px solid #1e3045;border-radius:7px;cursor:pointer;' +
        'outline:none;appearance:none;' +
        'background-image:url(\'data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2210%22 height=%2210%22 viewBox=%220 0 16 16%22 fill=%22%238fa3b4%22><path d=%22M4 6l4 4 4-4z%22/></svg>\');' +
        'background-repeat:no-repeat;background-position:right 10px center;background-size:10px' +
      '">' +
        ALLOWED.map(function (u) {
          return '<option value="' + u + '"' + (u === ACTIVE ? ' selected' : '') + '>' + u + '</option>';
        }).join('') +
      '</select>';

    // Put it before the existing buttons so it's the first thing on the right
    tools.insertBefore(wrap, tools.firstChild);

    var sel = wrap.querySelector('#btUserSwitcher');
    sel.addEventListener('change', function () {
      var u = sel.value;
      if (ALLOWED.indexOf(u) < 0) return;
      window.BT_setUser && window.BT_setUser(u);
      ACTIVE = u;
      reloadAllData();
    });
  }

  function syncSwitcherLabel() {
    var sel = document.getElementById('btUserSwitcher');
    if (sel) sel.value = ACTIVE;
  }

  // ────────────────────────────────────────────────────────────
  // 3. FILTER BARS — bet-type + sport for Open Bets & Settled Bets
  // ────────────────────────────────────────────────────────────
  var STATE = {
    open: { type: 'all', sport: 'all' },
    settled: { type: 'all', sport: 'all' }
  };

  var TYPE_OPTIONS = [
    { value: 'all',     label: 'All Types' },
    { value: 'straight',label: 'Straight'  },
    { value: 'prop',    label: 'Props'     },
    { value: 'parlay',  label: 'Parlays'   },
    { value: 'future',  label: 'Futures'   }
  ];

  var SPORT_OPTIONS = [
    { value: 'all',    label: 'All Sports' },
    { value: 'NFL',    label: 'NFL'        },
    { value: 'NBA',    label: 'NBA'        },
    { value: 'NCAAB',  label: 'NCAAB'      },  // matches NCAAMB + NCAAWB + CBB
    { value: 'NCAAF',  label: 'NCAAF'      },
    { value: 'MLB',    label: 'Baseball'   },
    { value: 'NHL',    label: 'Hockey'     },
    { value: 'Soccer', label: 'Soccer'     }
  ];

  function buildSelect(id, options, onChange, currentValue) {
    var html =
      '<select id="' + id + '" class="bt-filter-select">' +
        options.map(function (o) {
          return '<option value="' + o.value + '"' + (o.value === currentValue ? ' selected' : '') + '>' + o.label + '</option>';
        }).join('') +
      '</select>';
    return html;
  }

  function injectFilterStyles() {
    if (document.getElementById('btMultiuserStyles')) return;
    var css =
      '.bt-filter-row{display:flex;gap:6px;padding:8px 12px 4px;background:rgba(0,0,0,.15);' +
      'border-bottom:1px solid var(--border);font-size:0.78rem;align-items:center;flex-wrap:wrap}' +
      '.bt-filter-select{' +
        'padding:5px 24px 5px 9px;font-size:0.76rem;font-weight:500;font-family:inherit;' +
        'background:#0d1720;color:#eaeff4;border:1px solid #1e3045;border-radius:6px;' +
        'cursor:pointer;outline:none;appearance:none;' +
        'background-image:url(\'data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2210%22 height=%2210%22 viewBox=%220 0 16 16%22 fill=%22%238fa3b4%22><path d=%22M4 6l4 4 4-4z%22/></svg>\');' +
        'background-repeat:no-repeat;background-position:right 8px center;background-size:9px' +
      '}' +
      '.bt-filter-select:focus{border-color:var(--green)}' +
      '.bt-filter-tag{font-size:0.66rem;color:var(--text3);text-transform:uppercase;letter-spacing:0.06em;margin-right:2px}' +
      '.bt-team-logo{width:18px;height:18px;border-radius:3px;background:#0d1720;object-fit:contain;vertical-align:middle;margin-right:6px;flex-shrink:0}' +
      '.bt-team-logo.missing{display:inline-flex;align-items:center;justify-content:center;font-size:0.55rem;font-weight:700;color:#5b8ef7;background:rgba(91,142,247,.12);border:1px solid rgba(91,142,247,.25)}' +
      '.bt-card-hidden{display:none !important}' +
      '.bt-leaderboard{display:grid;grid-template-columns:1fr;gap:4px;margin-top:8px}' +
      '.bt-lb-row{display:grid;grid-template-columns:32px 1fr 70px 70px 80px;gap:10px;padding:8px 10px;border-radius:6px;background:rgba(255,255,255,.02);align-items:center;font-size:0.82rem}' +
      '.bt-lb-row:hover{background:rgba(255,255,255,.04)}' +
      '.bt-lb-team{font-weight:600;color:var(--text)}' +
      '.bt-lb-record{font-family:monospace;font-size:0.78rem;color:var(--text2)}' +
      '.bt-lb-roi{font-weight:700;font-family:monospace;text-align:right}' +
      '.bt-lb-roi.pos{color:var(--green)}' +
      '.bt-lb-roi.neg{color:var(--red)}' +
      '.bt-lb-pl{font-family:monospace;text-align:right;font-size:0.8rem}';
    var style = document.createElement('style');
    style.id = 'btMultiuserStyles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function injectFilterBars() {
    // ── Open Bets filter bar ──
    var openPanel = document.querySelector('#openBetsList');
    if (openPanel && !document.getElementById('btOpenFilters')) {
      var openBar = document.createElement('div');
      openBar.id = 'btOpenFilters';
      openBar.className = 'bt-filter-row';
      openBar.innerHTML =
        '<span class="bt-filter-tag">Filter:</span>' +
        buildSelect('btOpenType',  TYPE_OPTIONS,  null, STATE.open.type) +
        buildSelect('btOpenSport', SPORT_OPTIONS, null, STATE.open.sport);
      openPanel.parentNode.insertBefore(openBar, openPanel);

      document.getElementById('btOpenType').addEventListener('change', function (e) {
        STATE.open.type = e.target.value;
        applyOpenFilters();
      });
      document.getElementById('btOpenSport').addEventListener('change', function (e) {
        STATE.open.sport = e.target.value;
        applyOpenFilters();
      });
    }

    // ── Settled Bets filter bar (additional row above the existing W/L/P row) ──
    var settledPanel = document.querySelector('#settledBetsList');
    if (settledPanel && !document.getElementById('btSettledFilters')) {
      var settledBar = document.createElement('div');
      settledBar.id = 'btSettledFilters';
      settledBar.className = 'bt-filter-row';
      settledBar.innerHTML =
        '<span class="bt-filter-tag">Filter:</span>' +
        buildSelect('btSettledType',  TYPE_OPTIONS,  null, STATE.settled.type) +
        buildSelect('btSettledSport', SPORT_OPTIONS, null, STATE.settled.sport);
      var filterRow = document.getElementById('filterRow');
      if (filterRow) filterRow.parentNode.insertBefore(settledBar, filterRow);
      else settledPanel.parentNode.insertBefore(settledBar, settledPanel);

      document.getElementById('btSettledType').addEventListener('change', function (e) {
        STATE.settled.type = e.target.value;
        applySettledFilters();
      });
      document.getElementById('btSettledSport').addEventListener('change', function (e) {
        STATE.settled.sport = e.target.value;
        applySettledFilters();
      });
    }
  }

  // ────────────────────────────────────────────────────────────
  // Filter application — matches bet metadata to selected filter
  // ────────────────────────────────────────────────────────────
  function matchesType(bet, filter) {
    if (filter === 'all') return true;
    var t = (bet.type || '').toLowerCase();
    if (filter === 'straight') return t === 'straight' || t === 'moneyline' || t === 'spread' || t === 'total';
    if (filter === 'parlay')   return t === 'parlay';
    if (filter === 'future')   return t === 'future';
    if (filter === 'prop')     return t === 'prop';
    return true;
  }

  function matchesSport(bet, filter) {
    if (filter === 'all') return true;
    var s = (bet.sport || '').toUpperCase();
    if (filter === 'NCAAB') return s === 'NCAAMB' || s === 'NCAAWB' || s === 'CBB' || s === 'CBB LIVE';
    if (filter === 'NCAAF') return s === 'NCAAF' || s === 'CFB' || s === 'NCAA FOOTBALL';
    if (filter === 'NBA')   return s === 'NBA' || s === 'NBA LIVE';
    if (filter === 'NFL')   return s === 'NFL' || s === 'NFL LIVE';
    if (filter === 'MLB')   return s === 'MLB' || s === 'MLB LIVE' || s === 'BASEBALL';
    if (filter === 'NHL')   return s === 'NHL' || s === 'NHL LIVE' || s === 'HOCKEY';
    if (filter === 'Soccer') return s === 'SOCCER' || s === 'FOOTBALL';
    return s === filter.toUpperCase();
  }

  function findBetById(id) {
    if (!window.store) return null;
    var pools = [store.bets || [], store.futures || []];
    for (var i = 0; i < pools.length; i++) {
      for (var j = 0; j < pools[i].length; j++) {
        if (pools[i][j].id === id) return pools[i][j];
      }
    }
    return null;
  }

  function applyOpenFilters() {
    var cards = document.querySelectorAll('#openBetsList .bet-card');
    var hidden = 0;
    cards.forEach(function (card) {
      var id = card.id ? card.id.replace(/^card-/, '') : '';
      var bet = findBetById(id);
      if (!bet) return;
      var show = matchesType(bet, STATE.open.type) && matchesSport(bet, STATE.open.sport);
      card.classList.toggle('bt-card-hidden', !show);
      if (!show) hidden++;
    });
    // Update visible count
    var countEl = document.getElementById('openCount');
    if (countEl && cards.length) countEl.textContent = (cards.length - hidden);
  }

  function applySettledFilters() {
    var cards = document.querySelectorAll('#settledBetsList .bet-card, #settledBetsList .game-group');
    cards.forEach(function (card) {
      // Try direct id, then look for nested bet ids
      var id = card.id ? card.id.replace(/^card-/, '').replace(/^grp-/, '') : '';
      var bet = findBetById(id);
      // For game-groups, check if ANY child bet matches; if not, hide
      if (!bet) {
        // group container — sample first card-id descendant
        var firstCard = card.querySelector('.bet-card');
        if (firstCard) {
          var subId = firstCard.id ? firstCard.id.replace(/^card-/, '') : '';
          bet = findBetById(subId);
        }
      }
      if (!bet) return;
      var show = matchesType(bet, STATE.settled.type) && matchesSport(bet, STATE.settled.sport);
      card.classList.toggle('bt-card-hidden', !show);
    });
  }

  // ────────────────────────────────────────────────────────────
  // 4. TEAM LOGOS — small image prepended to each bet card's matchup line
  // ────────────────────────────────────────────────────────────
  function logoElement(teamName, sport) {
    var url = window.BT_teamLogo ? window.BT_teamLogo(teamName, sport) : null;
    if (url) {
      // Use onerror to fall back to initials if the CDN doesn't have this team
      var initials = window.BT_teamInitials ? window.BT_teamInitials(teamName) : '?';
      return '<img class="bt-team-logo" src="' + url + '" alt="" ' +
             'onerror="this.outerHTML=\'<span class=&quot;bt-team-logo missing&quot;>' + initials + '</span>\'">';
    }
    var initials = window.BT_teamInitials ? window.BT_teamInitials(teamName) : '?';
    return '<span class="bt-team-logo missing">' + initials + '</span>';
  }

  function injectLogosIntoCards(scopeSelector) {
    var cards = document.querySelectorAll(scopeSelector + ' .bet-card');
    cards.forEach(function (card) {
      if (card.querySelector('.bt-team-logo')) return; // already injected
      var id = card.id ? card.id.replace(/^card-/, '') : '';
      var bet = findBetById(id);
      if (!bet) return;
      // Skip parlays (multiple teams) and futures
      if (bet.type === 'parlay' || bet.type === 'future') return;

      // Try to extract the team name from matchup ("Team A vs Team B") or pick
      var matchup = bet.espnMatchup || bet.matchup || '';
      var firstTeam = matchup.split(/\s+vs\.?\s+/i)[0].trim();
      if (!firstTeam) return;

      var matchupLine = card.querySelector('.matchup-line');
      if (matchupLine && matchupLine.innerHTML.indexOf('bt-team-logo') < 0) {
        matchupLine.innerHTML = logoElement(firstTeam, bet.sport) + matchupLine.innerHTML;
      }
    });
  }

  // ────────────────────────────────────────────────────────────
  // 5. HOOK INTO EXISTING RENDER FUNCTIONS
  // ────────────────────────────────────────────────────────────
  function hookRenderFunctions() {
    if (window.renderOpenBets && !window.renderOpenBets.__btWrapped) {
      var origOpen = window.renderOpenBets;
      window.renderOpenBets = function () {
        var r = origOpen.apply(this, arguments);
        injectLogosIntoCards('#openBetsList');
        applyOpenFilters();
        return r;
      };
      window.renderOpenBets.__btWrapped = true;
    }
    if (window.renderSettledBets && !window.renderSettledBets.__btWrapped) {
      var origSettled = window.renderSettledBets;
      window.renderSettledBets = function () {
        var r = origSettled.apply(this, arguments);
        injectLogosIntoCards('#settledBetsList');
        applySettledFilters();
        renderTeamLeaderboard(); // refresh leaderboard whenever bets change
        return r;
      };
      window.renderSettledBets = window.renderSettledBets; // identity
      window.renderSettledBets.__btWrapped = true;
    }
  }

  // ────────────────────────────────────────────────────────────
  // 6. TEAM LEADERBOARD — injected into Deep Analysis tab
  // ────────────────────────────────────────────────────────────
  function ensureLeaderboardContainer() {
    // Prefer Analytics (visible in current nav). Fall back to Deep Analysis if
    // Analytics isn't around (e.g. older tab layout).
    var host = document.getElementById('analytics-tab') ||
               document.getElementById('deepanalysis-tab');
    if (!host) return null;
    var existing = document.getElementById('btTeamLeaderboard');
    if (existing) return existing;
    var card = document.createElement('div');
    card.className = 'panel';
    card.style.cssText = 'margin-top:18px;max-height:none;overflow:visible';
    card.innerHTML =
      '<div class="panel-header">' +
        '<span>Team Leaderboard</span>' +
        '<div class="header-actions" style="display:flex;gap:6px;align-items:center">' +
          '<span class="bt-filter-tag">Sport</span>' +
          buildSelect('btLbSport', SPORT_OPTIONS, null, 'all') +
          '<span class="bt-filter-tag">Sort</span>' +
          '<select id="btLbSort" class="bt-filter-select">' +
            '<option value="roi" selected>ROI</option>' +
            '<option value="pl">P/L</option>' +
            '<option value="count">Bet count</option>' +
          '</select>' +
        '</div>' +
      '</div>' +
      '<div class="panel-body" style="padding:12px"><div id="btTeamLeaderboard" class="bt-leaderboard"></div></div>';
    host.appendChild(card);
    document.getElementById('btLbSport').addEventListener('change', renderTeamLeaderboard);
    document.getElementById('btLbSort').addEventListener('change', renderTeamLeaderboard);
    return document.getElementById('btTeamLeaderboard');
  }

  function extractTeamsFromBet(bet) {
    // For straight bets, the "pick" often contains the team the user took.
    // We take the FIRST team mentioned in matchup ("X vs Y" → X).
    // Skip parlays and futures.
    var t = (bet.type || '').toLowerCase();
    if (t === 'parlay' || t === 'future') return null;
    var m = bet.espnMatchup || bet.matchup || '';
    var parts = m.split(/\s+vs\.?\s+/i);
    if (parts.length < 2) return null;
    return parts[0].trim();
  }

  function renderTeamLeaderboard() {
    var container = ensureLeaderboardContainer();
    if (!container) return;
    if (!window.store || !store.bets) return;

    var sportFilter = (document.getElementById('btLbSport') || {}).value || 'all';
    var sortBy      = (document.getElementById('btLbSort')  || {}).value || 'roi';

    var byTeam = {};
    store.bets.forEach(function (b) {
      if (!b.settled) return;
      if (!matchesSport(b, sportFilter)) return;
      var team = extractTeamsFromBet(b);
      if (!team) return;
      var key = team.toLowerCase();
      if (!byTeam[key]) {
        byTeam[key] = {
          team: team, sport: b.sport, wins: 0, losses: 0, pushes: 0,
          staked: 0, pl: 0, count: 0
        };
      }
      var s = byTeam[key];
      s.count += 1;
      s.staked += Number(b.stake || 0);
      s.pl += b.result === 'W' ? Number(b.toWin || 0)
             : b.result === 'L' ? -Number(b.stake || 0)
             : 0;
      if (b.result === 'W') s.wins++;
      else if (b.result === 'L') s.losses++;
      else if (b.result === 'P') s.pushes++;
    });

    var rows = Object.values(byTeam).map(function (s) {
      s.roi = s.staked > 0 ? (s.pl / s.staked) * 100 : 0;
      return s;
    }).filter(function (s) { return s.count >= 2; }); // hide single-bet teams to reduce noise

    rows.sort(function (a, b) {
      if (sortBy === 'pl')    return b.pl - a.pl;
      if (sortBy === 'count') return b.count - a.count;
      return b.roi - a.roi; // default
    });

    if (!rows.length) {
      container.innerHTML = '<div style="color:var(--text3);font-size:0.85rem;padding:18px;text-align:center">No team data yet (need 2+ settled bets per team)</div>';
      return;
    }

    var html = '';
    rows.slice(0, 30).forEach(function (s, idx) {
      var logoHtml = logoElement(s.team, s.sport);
      var record = s.wins + '-' + s.losses + (s.pushes ? '-' + s.pushes : '');
      var roiCls = s.roi >= 0 ? 'pos' : 'neg';
      var plCls  = s.pl  >= 0 ? 'pos' : 'neg';
      var fmt = window.fmtMoney || function (n) { return '$' + Number(n || 0).toFixed(2); };
      html +=
        '<div class="bt-lb-row">' +
          '<div>' + logoHtml + '</div>' +
          '<div class="bt-lb-team">' + s.team + '<div style="font-size:0.65rem;color:var(--text3);font-weight:400;margin-top:1px">' + s.sport + ' · ' + s.count + ' bets</div></div>' +
          '<div class="bt-lb-record">' + record + '</div>' +
          '<div class="bt-lb-pl ' + plCls + '" style="color:var(--' + (s.pl >= 0 ? 'green' : 'red') + ')">' + (s.pl >= 0 ? '+' : '-') + fmt(Math.abs(s.pl)) + '</div>' +
          '<div class="bt-lb-roi ' + roiCls + '">' + (s.roi >= 0 ? '+' : '') + s.roi.toFixed(1) + '%</div>' +
        '</div>';
    });
    container.innerHTML = html;
  }

  // ────────────────────────────────────────────────────────────
  // 7. RELOAD DATA WHEN USER SWITCHES
  // ────────────────────────────────────────────────────────────
  function reloadAllData() {
    // The cleanest path is a full page reload — keeps store + caches consistent.
    // The user-context shim already wrote sessionStorage, so the new load
    // will pick up the right ?user= for every fetch.
    setTimeout(function () { window.location.reload(); }, 60);
  }

  // ────────────────────────────────────────────────────────────
  // BOOT
  // ────────────────────────────────────────────────────────────
  function boot() {
    injectFilterStyles();
    renderLanding();
    injectSwitcher();
    injectFilterBars();
    hookRenderFunctions();
    // Initial leaderboard render if Deep Analysis is the loaded tab
    setTimeout(renderTeamLeaderboard, 800);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
