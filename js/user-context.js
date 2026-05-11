/* user-context.js
   ─────────────────────────────────────────────────────────────
   Multi-user support shim. Include in every HTML file that calls /api/*.

   - Reads the active user from sessionStorage (set by the landing screen
     in index.html) OR from the iframe's own ?user= URL param if running
     inside an iframe.
   - Patches window.fetch so any call to a relative or absolute /api/*
     URL gets ?user=ACTIVE_USER appended if it isn't already present.
   - Exposes window.BT_USER for any code that wants to read it directly.

   Drop-in, no init call required.
*/
(function () {
  'use strict';

  var ALLOWED = ['Thomas', 'Andrew', 'Rudger', 'Tyler', 'baby'];
  var DEFAULT_USER = 'Thomas';

  function resolveUser() {
    // 1. URL query param wins (parent passes ?user=X when loading iframes)
    try {
      var urlUser = new URLSearchParams(window.location.search).get('user');
      if (urlUser && ALLOWED.indexOf(urlUser) >= 0) return urlUser;
    } catch (e) {}
    // 2. sessionStorage (set by landing screen in parent)
    try {
      var ss = sessionStorage.getItem('bt_active_user');
      if (ss && ALLOWED.indexOf(ss) >= 0) return ss;
    } catch (e) {}
    // 3. localStorage backup (survives a tab close on the same machine)
    try {
      var ls = localStorage.getItem('bt_active_user');
      if (ls && ALLOWED.indexOf(ls) >= 0) return ls;
    } catch (e) {}
    return DEFAULT_USER;
  }

  window.BT_USER = resolveUser();
  window.BT_ALLOWED_USERS = ALLOWED.slice();

  // Patch fetch to (a) strip the hardcoded localhost:5001 so calls follow
  // whatever origin served the page (handy when 5001 is taken by AirPlay
  // Receiver on macOS and the server lands on 5002/5003/...), and
  // (b) auto-append ?user= on every /api/* call missing it.
  var origFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    try {
      var url = (typeof input === 'string') ? input : (input && input.url) || '';
      // Rewrite hardcoded localhost:5001 to a same-origin relative path
      var localhostRe = /^https?:\/\/localhost:5001(\/api\/.*)$/;
      var m = url.match(localhostRe);
      if (m) url = m[1];

      if (/\/api\//.test(url) && !/[?&]user=/.test(url)) {
        var sep = url.indexOf('?') >= 0 ? '&' : '?';
        url = url + sep + 'user=' + encodeURIComponent(window.BT_USER);
      }

      if (url !== ((typeof input === 'string') ? input : (input && input.url))) {
        if (typeof input === 'string') {
          input = url;
        } else {
          input = new Request(url, input);
        }
      }
    } catch (e) {
      // Don't block the request if URL parsing fails
    }
    return origFetch(input, init);
  };

  // Allow parent / other code to update the active user mid-session
  window.BT_setUser = function (user) {
    if (ALLOWED.indexOf(user) < 0) return false;
    window.BT_USER = user;
    try { sessionStorage.setItem('bt_active_user', user); } catch (e) {}
    try { localStorage.setItem('bt_active_user', user); } catch (e) {}
    return true;
  };
})();
