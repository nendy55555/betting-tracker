/*
 * test_chat_dispatch_jsdom.js — jsdom integration test for _processMessage.
 *
 * test_chat_dispatch.js is a static-source smoke test — it greps chat.js and
 * verifies the shape of the code. This file is the runtime complement: it
 * loads chat.js + parsers.js + utils.js + store.js + data.js into a real DOM,
 * mocks the external surface (fetch, runBetPipeline), wraps the three dispatch
 * targets (handleConversation, analyzeQuery, askClaude) with call-order spies,
 * and feeds fixture prompts through _processMessage.
 *
 * What this catches that static tests can't:
 *   - Actual control-flow divergence (e.g. "did askClaude REALLY not fire?")
 *   - Regressions where a new paste branch is added above the local-first block
 *     but the user's "hi" still somehow reaches Claude
 *   - Silent throws inside handleConversation / analyzeQuery that would be
 *     swallowed by try/catch in handleChatSubmit and force a fallback
 *
 * Requires: `npm install` inside tests/ first (installs jsdom 24).
 */

'use strict';

const fs    = require('fs');
const path  = require('path');
const vm    = require('vm');
const assert = require('assert');
const { JSDOM } = require('jsdom');

const JS_DIR = path.join(__dirname, '..', 'js');

/* Load order matches betting-tracker.html: store → utils → parsers → data → chat.
 * dashboard.js provides runBetPipeline — we stub it to avoid loading the full render stack. */
const SRC = {
  store:   fs.readFileSync(path.join(JS_DIR, 'store.js'),   'utf8'),
  utils:   fs.readFileSync(path.join(JS_DIR, 'utils.js'),   'utf8'),
  parsers: fs.readFileSync(path.join(JS_DIR, 'parsers.js'), 'utf8'),
  data:    fs.readFileSync(path.join(JS_DIR, 'data.js'),    'utf8'),
  chat:    fs.readFileSync(path.join(JS_DIR, 'chat.js'),    'utf8'),
};

/* Build a fresh jsdom + populated globals for each test. Keeps tests isolated — one
 * test poisoning store.awaitingOdds won't leak into the next. */
function mkSandbox(opts) {
  opts = opts || {};
  const dom = new JSDOM(
    '<!DOCTYPE html><html><body>' +
    '<div id="chatMessages"></div>' +
    '<textarea id="chatInput"></textarea>' +
    '<div id="budgetDisplay"></div>' +
    '<div id="statusBadges"></div>' +
    '</body></html>',
    { url: 'http://localhost/', runScripts: 'dangerously' }
  );
  const win = dom.window;

  /* Install fetch spy on the window. Anthropic-shaped success response by default.
   * Tests can override win.fetch before invoking _processMessage. */
  const fetchCalls = [];
  win.fetch = function(url, opts) {
    fetchCalls.push({ url: url, opts: opts });
    return Promise.resolve({
      ok: true,
      status: 200,
      json: function() {
        return Promise.resolve({ content: [{ text: 'Claude stub reply' }] });
      }
    });
  };
  /* Expose so tests can inspect */
  win.__fetchCalls = fetchCalls;

  /* jsdom ships console — chat.js uses console.error. Pipe to stderr. */
  win.console = console;

  /* Run each source file in the window's context. */
  const ctx = dom.getInternalVMContext();
  vm.runInContext(SRC.store,   ctx, { filename: 'store.js'   });
  vm.runInContext(SRC.utils,   ctx, { filename: 'utils.js'   });
  vm.runInContext(SRC.parsers, ctx, { filename: 'parsers.js' });
  vm.runInContext(SRC.data,    ctx, { filename: 'data.js'    });
  vm.runInContext(SRC.chat,    ctx, { filename: 'chat.js'    });

  /* Stub runBetPipeline (lives in dashboard.js, which we don't load — pulls in
   * Chart.js and the entire render stack). Record calls so paste tests can assert. */
  const pipelineCalls = [];
  win.runBetPipeline = function(bets) { pipelineCalls.push(bets || []); };
  win.__pipelineCalls = pipelineCalls;

  /* Stub renderChart, renderAll — some code paths call these on successful paste. */
  win.renderAll = function() {};

  /* Seed store overrides */
  if (opts.claudeApiKey) win.store.claudeApiKey = opts.claudeApiKey;
  if (opts.bets)         win.store.bets = opts.bets;

  /* ===== DISPATCH SPIES =====
   * Wrap each target and record (function_name, call_order_index). We do this
   * AFTER chat.js loads so _processMessage captures the references before we wrap —
   * but functions are looked up dynamically at call time in the window, so wrapping
   * works. Verified: _processMessage calls `handleConversation(text)` as a free
   * reference, which resolves via the window (vm context) scope. */
  const dispatchOrder = [];
  const spyTargets = [
    'handleConversation', 'analyzeQuery', 'askClaude',
    'parseBovadaPasteWithDupeCheck', 'parseSportsbookPasteWithDupeCheck',
  ];
  spyTargets.forEach(function(name) {
    const original = win[name];
    if (typeof original !== 'function') return;
    win[name] = function() {
      dispatchOrder.push(name);
      return original.apply(this, arguments);
    };
  });
  win.__dispatchOrder = dispatchOrder;

  return { dom: dom, win: win };
}

/* ===== Tiny test harness ===== */
let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  \u2713 ' + name); }
  catch (e) { failed++; console.log('  \u2717 ' + name + '\n    ' + (e.stack || e.message || e)); }
}
async function atest(name, fn) {
  try { await fn(); passed++; console.log('  \u2713 ' + name); }
  catch (e) { failed++; console.log('  \u2717 ' + name + '\n    ' + (e.stack || e.message || e)); }
}

/* Wait for in-flight fetch promises to resolve. chat.js doesn't expose a "done"
 * signal — fetch resolves synchronously in our stub, but .then() callbacks run
 * on the microtask queue. One tick is enough for sync stubs. */
function tick() { return new Promise(function(r) { setImmediate(r); }); }

(async function run() {
console.log('\n_processMessage dispatch (jsdom integration)');

test('greeting ("hi") dispatches to handleConversation, never askClaude', () => {
  const { win } = mkSandbox({ claudeApiKey: 'sk-test-key' });
  win._processMessage('hi');
  assert.deepStrictEqual(win.__dispatchOrder, ['handleConversation'],
    'expected [handleConversation], got ' + JSON.stringify(win.__dispatchOrder));
  assert.strictEqual(win.__fetchCalls.length, 0, 'fetch must not fire for greetings');
});

test('"thanks" handled locally, no Claude call', () => {
  const { win } = mkSandbox({ claudeApiKey: 'sk-test-key' });
  win._processMessage('thanks');
  assert.deepStrictEqual(win.__dispatchOrder, ['handleConversation']);
  assert.strictEqual(win.__fetchCalls.length, 0);
});

test('stats query ("what\'s my record") falls through to analyzeQuery', () => {
  const { win } = mkSandbox({ claudeApiKey: 'sk-test-key' });
  win._processMessage("what's my record");
  /* handleConversation runs first and returns null → analyzeQuery runs.
   * askClaude must NOT fire because analyzeQuery should answer record queries. */
  assert.ok(win.__dispatchOrder.indexOf('handleConversation') === 0,
    'handleConversation must run first');
  assert.ok(win.__dispatchOrder.indexOf('analyzeQuery') > 0,
    'analyzeQuery must run after handleConversation returns null');
  assert.strictEqual(win.__dispatchOrder.indexOf('askClaude'), -1,
    'askClaude must not fire for record queries — analyzeQuery handles them');
  assert.strictEqual(win.__fetchCalls.length, 0, 'no network call for record queries');
});

test('dispatch order is ALWAYS handleConversation → analyzeQuery → askClaude', () => {
  /* Prompt that slips past both local handlers:
   *   - handleConversation matches greetings / thanks / status keywords — "explain" hits none.
   *   - analyzeQuery requires the text to start with a question word (what/how/tell/...) or
   *     end with "?". "explain transformers" hits neither → returns null → falls through. */
  const { win } = mkSandbox({ claudeApiKey: 'sk-test-key' });
  win._processMessage('explain transformers');
  assert.deepStrictEqual(win.__dispatchOrder,
    ['handleConversation', 'analyzeQuery', 'askClaude'],
    'dispatch order must be strict: conversation → analysis → Claude. Got: ' +
    JSON.stringify(win.__dispatchOrder));
});

test('no API key → askClaude never fires even when local handlers return null', () => {
  const { win } = mkSandbox(/* no claudeApiKey */);
  win._processMessage('explain transformers');
  assert.ok(win.__dispatchOrder.indexOf('handleConversation') >= 0);
  assert.ok(win.__dispatchOrder.indexOf('analyzeQuery') >= 0);
  assert.strictEqual(win.__dispatchOrder.indexOf('askClaude'), -1,
    'askClaude must be gated on claudeApiKey — no key, no call');
  assert.strictEqual(win.__fetchCalls.length, 0, 'must not hit network without API key');
});

test('bet entry skips all local-first handlers', () => {
  const { win } = mkSandbox({ claudeApiKey: 'sk-test-key' });
  /* "Lakers ML $50 -110" is bet-shaped — parseBet returns a parsed object.
   * Even if odds extraction is imperfect, the branch in _processMessage is taken
   * and local dispatchers are bypassed. End state is either pendingConfirmation
   * set OR awaitingOdds set (when odds weren't captured). */
  win._processMessage('Lakers ML $50 -110');
  assert.strictEqual(win.__dispatchOrder.indexOf('handleConversation'), -1,
    'bet entry must not hit handleConversation');
  assert.strictEqual(win.__dispatchOrder.indexOf('analyzeQuery'), -1,
    'bet entry must not hit analyzeQuery');
  assert.strictEqual(win.__dispatchOrder.indexOf('askClaude'), -1,
    'bet entry must not hit Claude — this is the whole point of parseBet running first');
  assert.ok(win.store.pendingConfirmation || win.store.awaitingOdds,
    'bet parse must land in either pendingConfirmation or awaitingOdds');
});

test('whitespace input does not crash and does not hit network', () => {
  const { win } = mkSandbox({ claudeApiKey: 'sk-test-key' });
  /* _processMessage doesn't guard whitespace (handleChatSubmit does that before
   * calling _processMessage). The contract for _processMessage itself is:
   * never crash, never hit the network silently. */
  assert.doesNotThrow(function() { win._processMessage('   '); });
  assert.strictEqual(win.__fetchCalls.length, 0,
    'whitespace must never produce a Claude fetch');
});

test('awaitingOdds short-circuits all dispatch', () => {
  const { win } = mkSandbox({ claudeApiKey: 'sk-test-key' });
  /* Simulate a bet waiting for odds */
  win.store.awaitingOdds = {
    pick: 'Lakers', stake: 50, sport: 'NBA', type: 'bet'
  };
  win._processMessage('-110');
  /* Must not hit any of the three dispatchers */
  assert.strictEqual(win.__dispatchOrder.length, 0,
    'odds reply must short-circuit at top of _processMessage');
  /* awaitingOdds must be cleared, pendingConfirmation set */
  assert.strictEqual(win.store.awaitingOdds, null);
  assert.ok(win.store.pendingConfirmation);
  assert.strictEqual(win.store.pendingConfirmation.odds, -110);
});

await atest('claude fallback calls fetch with model header pinned to Haiku', async () => {
  const { win } = mkSandbox({ claudeApiKey: 'sk-test-key' });
  win._processMessage('explain transformers');
  await tick(); await tick();
  assert.strictEqual(win.__fetchCalls.length, 1, 'exactly one Anthropic call');
  const body = JSON.parse(win.__fetchCalls[0].opts.body);
  assert.ok(/haiku/i.test(body.model),
    'model must be Haiku tier (got ' + body.model + '). See BT_CLAUDE_MODEL in chat.js');
  assert.strictEqual(body.max_tokens, 400, 'max_tokens locked at 400');
});

await atest('repeated identical prompts hit cache, not fetch, on second call', async () => {
  const { win } = mkSandbox({ claudeApiKey: 'sk-test-key' });
  win._processMessage('explain a concept xyz');
  await tick(); await tick();
  assert.strictEqual(win.__fetchCalls.length, 1);
  /* Second send of same prompt — should hit in-memory session cache */
  win._processMessage('explain a concept xyz');
  await tick(); await tick();
  assert.strictEqual(win.__fetchCalls.length, 1,
    'identical prompt must be served from cache — found ' + win.__fetchCalls.length + ' calls');
});

test('bovada paste detection routes to parseBovadaPasteWithDupeCheck', () => {
  const { win } = mkSandbox({ claudeApiKey: 'sk-test-key' });
  /* Minimal shape that matches the Bovada-detection regex:
   *   /Ref\.\d{5,}/ AND (RISK|ODDS|WINNINGS)
   * We spy on parseBovadaPasteWithDupeCheck to verify it's invoked — whether
   * the parser succeeds at extracting bets is a separate concern covered by
   * pytest bet-parser tests. */
  const paste = 'Ref.123456\nRISK: $50.00\nODDS: -110\nLakers -4.5';
  win._processMessage(paste);
  assert.ok(win.__dispatchOrder.indexOf('parseBovadaPasteWithDupeCheck') >= 0,
    'Bovada-shaped paste must invoke parseBovadaPasteWithDupeCheck. Got: ' +
    JSON.stringify(win.__dispatchOrder));
});

test('multiline Claude prompt does not crash on newlines or NBSP', () => {
  const { win } = mkSandbox({ claudeApiKey: 'sk-test-key' });
  /* Unicode whitespace — normalize in _processMessage must handle without throwing */
  const weirdInput = 'hi\r\nthere\u00A0friend\u200B';
  assert.doesNotThrow(function() { win._processMessage(weirdInput); });
});

test('budget cap exceeded → askClaude returns error, no fetch', () => {
  const { win } = mkSandbox({ claudeApiKey: 'sk-test-key' });
  /* Force the budget tracker over cap */
  const today = new Date().toISOString().split('T')[0];
  win.localStorage.setItem('bt_claude_budget_v1',
    JSON.stringify({ date: today, count: 999 }));
  win._processMessage('any prompt that would hit Claude here');
  /* Dispatch reaches askClaude, but the daily-cap guard inside askClaude blocks fetch */
  assert.ok(win.__dispatchOrder.indexOf('askClaude') >= 0,
    'askClaude should be called — the cap check lives inside it');
  assert.strictEqual(win.__fetchCalls.length, 0,
    'cap check must block network before fetch fires');
});

console.log('\n' + '='.repeat(60));
console.log(passed + ' passed, ' + failed + ' failed');
console.log('='.repeat(60));
process.exit(failed > 0 ? 1 : 0);
})();
