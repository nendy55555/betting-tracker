# Post-Max Playbook

> **What this is:** how to keep using this tracker efficiently once you're off Claude Max and paying per token.
> **What it is not:** an operational runbook — see `RUNBOOK.md` for that.
> **Audience:** Thomas, ~10 days from losing Max.
> **Last updated:** 2026-04-20

---

## TL;DR

1. **Most tasks need zero Claude calls.** Scrapers, odds, dashboard, server, CLV — all work fully offline.
2. **Chat widget defaults to Haiku 4.5** (~$0.80/1M in, ~$4/1M out) and caps at 30 calls/day.
3. **The budget you can actually spend matters:** at 30 Haiku calls/day × 400 output tokens × 30 days ≈ **$1.50/month worst case**.
4. **If you need real help:** use the "when to spend a call" rubric in §3 and the canonical prompts in §4.

---

## 1. What runs without Claude

| Component | Claude needed? | Notes |
|---|---|---|
| Flask server (`server.py`) | No | Pure Python + openpyxl |
| Dashboard (`betting-tracker.html`) | No | Chat widget has a local-analyzer fallback |
| Scrapers (`refresh_locks25.py`, `refresh_bovada.py`) | No | Selenium, deterministic exit codes |
| Odds refresh (`refresh_game_odds.py`) | No | The Odds API, not Anthropic |
| CLV calc (`clv_calculator.py`) | No | Pure math |
| Futures / odds snapshots | No | Bovada public API + ESPN fallback |
| Tests (`tests/`) | No | pytest + Node |

**Everything except the chat widget is Claude-free at runtime.**

---

## 2. What the chat widget still uses Claude for

After the 2026-04-20 hardening pass, these cases hit the API:

| Trigger | Goes to Claude? | Why |
|---|---|---|
| `hi`, `thanks`, pleasantries | **No** — `handleConversation()` handles locally | Free |
| `record on NBA?`, `biggest win`, `net loss on Vanderbilt` | **No** — `analyzeQuery()` handles locally | Free |
| Bet paste (Bovada slip, Locks25 format) | **No** — parser handles locally | Free |
| "Explain why I'm losing on parlays" (open-ended) | **Yes** — Claude | 1 call |
| "What's wrong with my Celtics strategy?" | **Yes** — Claude | 1 call |

Everything that hits Claude is **deduped by cache**:
- L1 (session memory) — instant, free on re-ask within a session.
- L2 (localStorage, 50-entry LRU) — survives reloads. Same question = 0 new calls.
- Daily cap: 30 calls. Hit that and the widget falls back to local analyzer for the rest of the day.

Check current state in DevTools console: `btChatDiagnostics()`.

---

## 3. When to spend a Claude call — decision rubric

**Spend a call when:**
- The question requires reasoning across >5 bets AND the local analyzer returned nothing useful.
- You're stuck debugging and all other paths in `RUNBOOK.md` §6 and `docs/agent/DEBUG.md` have been tried.
- You need a narrative summary for a recap (e.g. "how was my March?").

**Don't spend a call for:**
- Any question the local analyzer can answer (records, totals, ROI, streaks, team/sport filters).
- Simple lookups ("what's my P/L?") — use the dashboard KPI cards.
- Yes/no questions with an obvious answer.
- Anything you've asked before — check the cache first.

**Cost math at Haiku 4.5 (default):**
- Input: ~800 tokens (system prompt + bet context) × $0.80/1M ≈ **$0.0006 / call**.
- Output: up to 400 tokens × $4/1M ≈ **$0.0016 / call**.
- **~$0.002 per uncached call.** At 30 calls/day × 30 days = $1.80/month worst case.

**Cost at Sonnet 4 (fallback tier):**
- ~5× Haiku → ~$9/month worst case. Only swap if Haiku quality actually degrades for your questions.

---

## 4. Canonical prompts — cached, efficient

The system prompt and bet-context summary are already compact (~160 + ~400 chars). To maximize cache reuse, **ask the same question the same way**. The cache key is `hash(prompt) + hash(context)` — any wording change = new API call.

Good reusable questions (all cached forever once asked):
- `weekly recap`
- `why am I losing on parlays`
- `which sport is my edge`
- `biggest leak in my strategy`
- `am I chasing losses`
- `is my CLV trend real`

Bad (wastes cache):
- `weekly recap please` vs `weekly recap` vs `give me a weekly recap` — three separate cache entries.

---

## 5. Tier-swap playbook

**Default:** Haiku 4.5. Leave it here unless output quality clearly degrades on your real questions.

**Upgrade path:**
1. Run a test prompt 3×. If answers are useful → stay on Haiku.
2. If answers miss the point → swap to Sonnet 4 (`js/chat.js` line 12). Hard-reload dashboard.
3. Re-test. If Sonnet still misses → Opus 4.1 (15× cost) is rarely worth it for bet analysis.

**Downgrade signal:** monthly spend creeping above $5. Step down one tier and tighten `BT_CLAUDE_DAILY_CAP` from 30 → 15.

**Where the knob lives:** `js/chat.js` line 12 (`BT_CLAUDE_MODEL`) and line 14 (`BT_CLAUDE_DAILY_CAP`).

---

## 6. If you hit the daily cap

The chat will say: `Daily cap of 30 AI responses hit — resets at midnight.`

Options:
- **Wait.** Local analyzer still answers most questions.
- **Raise it** for one day: edit `BT_CLAUDE_DAILY_CAP` in `js/chat.js`, hard-reload. Put it back afterwards.
- **Clear today's counter** (emergencies): DevTools console → `localStorage.removeItem('bt_claude_budget_v1')`. Reload. (You're now spending uncapped — don't forget to restore.)

---

## 7. Monthly budget discipline

At the start of each month:
1. Open DevTools → Application → localStorage → find `bt_claude_cache_v1`. Count entries (should cap at 50).
2. Clear the budget counter if needed: `localStorage.removeItem('bt_claude_budget_v1')`.
3. Review `docs/agent/CHANGELOG.md` for anything that shipped you forgot to document.

**Cost-tracking shortcut:** Anthropic Console → Usage tab. At Haiku 4.5 with 30 calls/day you'll see well under $2/mo.

---

## 8. If Anthropic raises prices

Defense in depth, in order:
1. Lower `BT_CLAUDE_DAILY_CAP` (30 → 15 → 5).
2. Lower `BT_CLAUDE_MAX_TOKENS` (400 → 250). Halves output cost.
3. Compact `buildBetContext()` further — drop the top-8 teams section if you don't use it.
4. Worst case: remove the Claude path entirely. The local analyzer covers ~80% of real questions. Delete `askClaude` call in `_processMessage` and the widget still works.

The architecture assumes Claude is **optional**. The dashboard must remain fully functional with zero Claude calls — that's the core hardening promise. Don't let a feature creep back in that violates it.

---

## 9. When Claude is gone for good (contingency)

If you fully drop the API key:
- Chat widget still works — local handlers run unchanged.
- Bet parsing still works — entirely local.
- Bovada paste import still works — entirely local.
- You lose: open-ended Q&A ("why am I losing on parlays").
- You keep: everything else.

No code change required. Just clear the key in dashboard Settings.

---

## 10. What to do with this file

Re-read it the day you lose Max. Then again 30 days later when you see your first Anthropic bill. Then whenever something changes — scraper breaks, new sportsbook, price hike. Update the cost math in §3 if Anthropic pricing moves.

The rule: **you should be able to run this tracker for <$2/month on Haiku.** If you're paying more, something in §3 or §5 is out of tune.
