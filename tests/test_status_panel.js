/*
 * test_status_panel.js — Node tests for js/status-panel.js.
 *
 * Covers:
 *   - Endpoint map points to the expected server routes.
 *   - Color map covers every exit-code slug that server.py can return.
 *   - _btEsc escapes HTML properly (prevents XSS via the label field).
 *   - Static source asserts: uses fetch, guards against double-clicks.
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const assert = require('assert');

const PANEL_PATH = path.join(__dirname, '..', 'js', 'status-panel.js');
const PANEL_SRC  = fs.readFileSync(PANEL_PATH, 'utf8');
const SERVER_PATH = path.join(__dirname, '..', 'server.py');
const SERVER_SRC  = fs.readFileSync(SERVER_PATH, 'utf8');

/* Load panel module directly — its exports guard makes it Node-safe. */
global.document  = { getElementById: () => null, createElement: () => ({ style:{}, appendChild:()=>{} }) };
global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
global.fetch     = () => Promise.resolve({ json: () => Promise.resolve({}) });
global.toggleSettings = function() {};  /* panel wraps this */
global.window    = global;               /* panel assigns window.toggleSettings = ... */

const mod = require(PANEL_PATH);

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  \u2713 ' + name); }
  catch (e) { failed++; console.log('  \u2717 ' + name + '\n    ' + (e.message || e)); }
}

console.log('\nstatus-panel.js contract');

test('endpoint map points at real server routes', () => {
  const e = mod.BT_STATUS_ENDPOINTS;
  assert.strictEqual(e.budget,  '/api/budget');
  assert.strictEqual(e.locks25, '/api/refresh/locks25');
  assert.strictEqual(e.bovada,  '/api/refresh/bovada');
  assert.strictEqual(e.clv,     '/api/clv/refresh');
});

test('every panel endpoint exists as a route in server.py', () => {
  for (const route of Object.values(mod.BT_STATUS_ENDPOINTS)) {
    const pat = new RegExp("@app\\.route\\(['\"]" + route.replace(/\//g, '\\/') + "['\"]");
    assert.ok(pat.test(SERVER_SRC), 'server.py missing route: ' + route);
  }
});

test('color map covers every exit-code slug from server.py', () => {
  /* Grep the SCRAPER_EXIT_LABELS block for slugs */
  const match = SERVER_SRC.match(/SCRAPER_EXIT_LABELS\s*=\s*\{([\s\S]*?)\}/);
  assert.ok(match, 'SCRAPER_EXIT_LABELS not found in server.py');
  const slugs = [...match[1].matchAll(/"([a-z]+)"\s*,/g)].map(m => m[1]);
  /* Dedupe — each slug appears twice (key slug + label sentence) */
  const unique = [...new Set(slugs)].filter(s => s.length < 15);
  for (const slug of unique) {
    assert.ok(mod.BT_STATUS_COLORS[slug], 'missing color for slug: ' + slug);
  }
});

test('color map includes degraded states (offline, pending, unknown)', () => {
  assert.ok(mod.BT_STATUS_COLORS.offline, 'offline must have a color (server down)');
  assert.ok(mod.BT_STATUS_COLORS.pending, 'pending must have a color (in-flight)');
  assert.ok(mod.BT_STATUS_COLORS.unknown, 'unknown must have a color (fallback)');
});

test('_btEsc escapes HTML entities', () => {
  assert.strictEqual(mod._btEsc('<script>'), '&lt;script&gt;');
  assert.strictEqual(mod._btEsc('a & b'),    'a &amp; b');
  assert.strictEqual(mod._btEsc(null),       '');
  assert.strictEqual(mod._btEsc(undefined),  '');
});

test('panel uses fetch (no jQuery / XHR)', () => {
  assert.ok(/\bfetch\s*\(/.test(PANEL_SRC), 'panel must use fetch()');
  assert.ok(!/XMLHttpRequest/.test(PANEL_SRC), 'panel should not use XHR');
});

test('scraper trigger guards against double-clicks', () => {
  assert.ok(/_btStatusInFlight/.test(PANEL_SRC),
    'panel must track in-flight requests to prevent duplicate triggers');
});

test('CLV trigger always refreshes budget after — credits may have burned', () => {
  /* Look inside btTriggerClv: btRefreshBudget must be called on success path */
  const clvFn = PANEL_SRC.match(/function\s+btTriggerClv\s*\([\s\S]*?^}/m);
  assert.ok(clvFn, 'btTriggerClv must be defined');
  assert.ok(/btRefreshBudget/.test(clvFn[0]),
    'btTriggerClv must refresh budget — CLV refresh consumes credits');
});

test('panel has module.exports guard (Node-safe)', () => {
  assert.ok(/typeof\s+module\s*!==\s*['"]undefined['"]/.test(PANEL_SRC),
    'panel must guard module.exports for Node');
});

console.log('\n' + '='.repeat(60));
console.log(passed + ' passed, ' + failed + ' failed');
console.log('='.repeat(60));
process.exit(failed > 0 ? 1 : 0);
