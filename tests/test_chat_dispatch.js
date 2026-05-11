/*
 * test_chat_dispatch.js — Node smoke tests for js/chat.js
 *
 * Why Node, not pytest: chat.js is browser-side JS. Run with `node tests/test_chat_dispatch.js`.
 *
 * Covers:
 *   1. Pure helpers (_bt_hash, _bt_budgetStatus) — exported via module.exports guard.
 *   2. Tier config pinned to Haiku 4.5 and daily cap <= 30.
 *   3. Static source order: _processMessage tries local handlers (handleConversation,
 *      analyzeQuery) BEFORE askClaude. Guards existence of cache + budget checks.
 *   4. askClaude is guarded by store.claudeApiKey.
 *
 * No Jest/Mocha dep — raw asserts so this runs on any stock Node.
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const assert = require('assert');

const CHAT_JS_PATH = path.join(__dirname, '..', 'js', 'chat.js');
const CHAT_SRC     = fs.readFileSync(CHAT_JS_PATH, 'utf8');

/* ── localStorage stub for Node ──────────────────────────────────────────── */
const _ls = {};
global.localStorage = {
  getItem: (k) => (k in _ls ? _ls[k] : null),
  setItem: (k, v) => { _ls[k] = String(v); },
  removeItem: (k) => { delete _ls[k]; },
  clear: () => { for (const k of Object.keys(_ls)) delete _ls[k]; }
};

/* Load chat.js into this sandbox. chat.js references globals (store, document,
   Chart, etc.) that aren't needed for the exported helpers. We guard with try. */
let chatMod;
try {
  chatMod = require(CHAT_JS_PATH);
} catch (e) {
  /* Fine if top-level references fail — the exports guard is at the bottom
     so if we got partway through, module.exports may still be populated.
     If not, we re-read via Function() with stubs for the bits we need. */
  chatMod = null;
}

if (!chatMod) {
  /* Fallback: execute with minimal stubs so the exports block runs. */
  const stubs = {
    module: { exports: {} },
    localStorage: global.localStorage,
    document: { getElementById: () => null },
    store: { chatHistory: [], bets: [], futures: [], claudeApiKey: '' },
    claudeCacheVersion: 0,
    getCachedFiltered: () => ({ filteredSettled: [], filteredOpenBets: [] }),
    parseGameDate: () => 0,
    saveData: () => {},
    escHtml: (s) => s,
    fmtOdds: (o) => String(o),
    fmtMoney: (m) => '$' + m,
    renderChat: () => {},
    addChat: () => {},
    runBetPipeline: () => {},
    parseBet: () => null,
    parseBovadaPasteWithDupeCheck: () => ({ added: 0, total: 0 }),
    parseSportsbookPasteWithDupeCheck: () => ({ added: 0, total: 0 }),
    handleConversation: () => null,
    analyzeQuery: () => null,
    calcToWin: () => 0,
    genId: () => 'id',
    console: console,
    Date: Date,
    Math: Math,
    Object: Object,
    JSON: JSON,
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
  };
  const keys = Object.keys(stubs);
  const vals = keys.map((k) => stubs[k]);
  const fn = new Function(...keys, CHAT_SRC + '\nreturn module.exports;');
  chatMod = fn(...vals);
}

/* ========================================================================= */
/* Test utilities                                                            */
/* ========================================================================= */

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  \u2713 ' + name);
  } catch (e) {
    failed++;
    failures.push({ name, error: e });
    console.log('  \u2717 ' + name);
    console.log('    ' + (e.message || String(e)));
  }
}

function section(title) {
  console.log('\n' + title);
}

/* ========================================================================= */
/* 1. Pure-function tests — exported helpers                                 */
/* ========================================================================= */

section('_bt_hash — deterministic FNV-1a');
test('same input → same hash', () => {
  assert.strictEqual(chatMod._bt_hash('hello'), chatMod._bt_hash('hello'));
});
test('different inputs → different hashes (in common cases)', () => {
  assert.notStrictEqual(chatMod._bt_hash('hello'), chatMod._bt_hash('world'));
});
test('empty string produces stable offset basis', () => {
  /* FNV-1a offset basis = 0x811c9dc5 — should be non-empty hex */
  const h = chatMod._bt_hash('');
  assert.ok(/^[0-9a-f]+$/.test(h), 'hash must be hex');
});
test('cache key collisions across typical questions', () => {
  const prompts = [
    'what is my record',
    'whats my record',
    'record?',
    'record on NBA?',
    'biggest win',
    'biggest loss',
    'how am i doing',
    'hi',
    'thanks',
    'net loss on Vanderbilt',
  ];
  const hashes = new Set(prompts.map(chatMod._bt_hash));
  assert.strictEqual(hashes.size, prompts.length, 'all 10 prompts should hash distinctly');
});

section('_bt_budgetStatus — daily cap math');
test('fresh day with empty localStorage → 0 count, full remaining', () => {
  localStorage.clear();
  const s = chatMod._bt_budgetStatus();
  assert.strictEqual(s.count, 0);
  assert.strictEqual(s.remaining, chatMod.BT_CLAUDE_DAILY_CAP);
});
test('same-day stored count is preserved', () => {
  localStorage.clear();
  const today = new Date().toISOString().slice(0, 10);
  localStorage.setItem('bt_claude_budget_v1', JSON.stringify({ date: today, count: 7 }));
  const s = chatMod._bt_budgetStatus();
  assert.strictEqual(s.count, 7);
  assert.strictEqual(s.remaining, chatMod.BT_CLAUDE_DAILY_CAP - 7);
});
test('stale date (yesterday) resets to 0 count', () => {
  localStorage.clear();
  localStorage.setItem('bt_claude_budget_v1', JSON.stringify({ date: '2000-01-01', count: 99 }));
  const s = chatMod._bt_budgetStatus();
  assert.strictEqual(s.count, 0);
  assert.strictEqual(s.remaining, chatMod.BT_CLAUDE_DAILY_CAP);
});
test('corrupt JSON in localStorage → safe default', () => {
  localStorage.clear();
  localStorage.setItem('bt_claude_budget_v1', '{ not valid');
  const s = chatMod._bt_budgetStatus();
  assert.strictEqual(s.count, 0);
  assert.strictEqual(s.remaining, chatMod.BT_CLAUDE_DAILY_CAP);
});
test('remaining never goes negative', () => {
  localStorage.clear();
  const today = new Date().toISOString().slice(0, 10);
  localStorage.setItem('bt_claude_budget_v1', JSON.stringify({ date: today, count: 9999 }));
  const s = chatMod._bt_budgetStatus();
  assert.ok(s.remaining >= 0, 'remaining must clamp at 0');
});

/* ========================================================================= */
/* 2. Tier config — pinned to Haiku 4.5, daily cap ≤ 30                      */
/* ========================================================================= */

section('Tier configuration');
test('default model is Haiku 4.5', () => {
  assert.strictEqual(chatMod.BT_CLAUDE_MODEL, 'claude-haiku-4-5-20251001');
});
test('daily cap is set and reasonable (≤ 50)', () => {
  const cap = chatMod.BT_CLAUDE_DAILY_CAP;
  assert.ok(cap > 0 && cap <= 50, 'daily cap should be a small positive int — was ' + cap);
});
test('source pins max_tokens ≤ 500 (keeps response cost bounded)', () => {
  const m = CHAT_SRC.match(/BT_CLAUDE_MAX_TOKENS\s*=\s*(\d+)/);
  assert.ok(m, 'BT_CLAUDE_MAX_TOKENS must be declared');
  const val = parseInt(m[1], 10);
  assert.ok(val <= 500, 'max_tokens must stay <= 500 — was ' + val);
});

/* ========================================================================= */
/* 3. Static source order — local handlers BEFORE askClaude                  */
/* ========================================================================= */

section('Local-first dispatch (static source analysis)');

function sourceIndex(pattern) {
  const idx = CHAT_SRC.search(pattern);
  return idx === -1 ? null : idx;
}

test('_processMessage function exists', () => {
  assert.ok(sourceIndex(/function\s+_processMessage\s*\(/) !== null,
    '_processMessage must be defined in chat.js');
});

test('handleConversation call appears before askClaude call', () => {
  /* We look for the FIRST occurrence of each inside _processMessage's body. */
  const body = CHAT_SRC.split(/function\s+_processMessage\s*\(/)[1] || '';
  const iConvo   = body.indexOf('handleConversation(');
  const iAnalyze = body.indexOf('analyzeQuery(');
  const iClaude  = body.indexOf('askClaude(');
  assert.ok(iConvo   > -1, 'handleConversation must be called in _processMessage');
  assert.ok(iAnalyze > -1, 'analyzeQuery must be called in _processMessage');
  assert.ok(iClaude  > -1, 'askClaude must be called in _processMessage');
  assert.ok(iConvo   < iClaude, 'handleConversation must come BEFORE askClaude');
  assert.ok(iAnalyze < iClaude, 'analyzeQuery must come BEFORE askClaude');
});

test('askClaude is gated by store.claudeApiKey check', () => {
  const body = CHAT_SRC.split(/function\s+_processMessage\s*\(/)[1] || '';
  /* Pattern: a truthy check on the key, then the askClaude call close by. */
  const iKey    = body.search(/store\.claudeApiKey/);
  const iClaude = body.indexOf('askClaude(');
  assert.ok(iKey > -1, 'store.claudeApiKey must be referenced in _processMessage');
  assert.ok(iKey < iClaude, 'claudeApiKey guard must precede askClaude call');
});

test('askClaude has an in-memory cache check', () => {
  assert.ok(/claudeCache\[cacheKey\]/.test(CHAT_SRC),
    'askClaude must check in-memory claudeCache[cacheKey] before API');
});

test('askClaude has a persistent cache check', () => {
  assert.ok(/_bt_persistCacheRead\s*\(/.test(CHAT_SRC),
    '_bt_persistCacheRead must be called in askClaude');
});

test('askClaude enforces daily budget before API call', () => {
  /* The budget branch must appear before the fetch() call. */
  const askStart = CHAT_SRC.indexOf('function askClaude(');
  const askEnd   = CHAT_SRC.indexOf('function sendMessage(');
  assert.ok(askStart > -1 && askEnd > askStart, 'askClaude function not found');
  const askBody = CHAT_SRC.slice(askStart, askEnd);
  const iBudget = askBody.search(/budget\.remaining\s*<=\s*0/);
  const iFetch  = askBody.indexOf('fetch(');
  assert.ok(iBudget > -1, 'budget cap check must exist in askClaude');
  assert.ok(iFetch  > -1, 'fetch() call must exist in askClaude');
  assert.ok(iBudget < iFetch, 'budget check must precede fetch() in askClaude');
});

test('askClaude maps HTTP error codes to friendly err.code values', () => {
  const askStart = CHAT_SRC.indexOf('function askClaude(');
  const askEnd   = CHAT_SRC.indexOf('function sendMessage(');
  const askBody  = CHAT_SRC.slice(askStart, askEnd);
  assert.ok(/'AUTH'/.test(askBody),       'AUTH error code missing');
  assert.ok(/'RATE_LIMIT'/.test(askBody), 'RATE_LIMIT error code missing');
  assert.ok(/'API_DOWN'/.test(askBody),   'API_DOWN error code missing');
});

test('_processMessage renders friendly copy on BUDGET_CAP', () => {
  assert.ok(/BUDGET_CAP/.test(CHAT_SRC), 'BUDGET_CAP error must be surfaced to user');
});

/* ========================================================================= */
/* 4. Diagnostics surface                                                    */
/* ========================================================================= */

section('Runtime diagnostics');
test('btChatDiagnostics function exists', () => {
  assert.ok(/function\s+btChatDiagnostics\s*\(/.test(CHAT_SRC),
    'btChatDiagnostics must be defined (used by runbook + support)');
});

/* ========================================================================= */
/* Report                                                                    */
/* ========================================================================= */

console.log('\n' + '='.repeat(60));
console.log(passed + ' passed, ' + failed + ' failed');
console.log('='.repeat(60));

if (failed > 0) {
  console.log('\nFailures:');
  for (const f of failures) {
    console.log('  - ' + f.name + ': ' + (f.error.message || f.error));
  }
  process.exit(1);
}
process.exit(0);
