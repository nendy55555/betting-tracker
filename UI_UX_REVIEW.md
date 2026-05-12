# BetTracker Pro — UI/UX Deep Review

**Three senior product designers walked through the app cold (2026-05-11). Sports/gaming, data dashboards, mobile-first.**

Findings reflect the codebase as it stands today — including the multi-user landing screen, futures isolation, hero stat cards, collapsible filter bar, and globally-applied tabular-nums. Prior review's top items (0.55rem fonts, `#556677` text, 19 unique font sizes) are resolved.

---

## 1. First Impressions (30-second audit)

**Designer A (Sports/Gaming):** The six-card stat bar reads well at first glance, but the gradient hero treatment on Record and Profit/Loss is too subtle. From across the room, all six cards still look identical. The two metrics that matter most should be unmistakably louder.

**Designer B (Data Dashboards):** The three-column home grid is asking the chatbot to share equal real estate with Open Bets and Settled Bets. The chat is the visual anchor of the center column, but it's a tool, not a metric. The 2×2 chart grid below it is now 220px tall and readable, but the charts are below the fold on a 13" laptop.

**Designer C (Mobile-First):** Sport tag text at `--fs-xs` (9.75px) is now legible, but NBA's `#ff9800` on `rgba(255,152,0,.15)` over `--surface2 #192736` clears 4.5:1 only barely. NCAAW's pink `#f48fb1` clears AA at this size. NCAAM's purple `#bb86fc` does too. The amber game-time row at `--fs-xs` (9.75px / `#ffb833`) is the weakest contrast pair in the app.

**Vote: Promote the hero stat cards more aggressively.** Designer A wins this round. The information hierarchy is still flat where it should peak.

**Specific fix:** Bump `.stat-card.hero .value` from `--fs-2xl` (1.75rem) to `2rem`, and add a `+2px` border-left in `--green`/`--red` keyed to the value sign. Make Record and P/L visually inseparable from the other four.

---

## 2. Visual Hierarchy

### Home tab
Stat bar uses `1.3fr 1fr 1fr 1.3fr 1fr 1fr` for the six cards. Record (col 1) and P/L (col 4) get the wider treatment + hero gradient. That's correct in intent but execution is muted. Hero gradient is `linear-gradient(135deg, var(--surface2) 0%, rgba(26,45,60,.9) 100%)` — almost imperceptible against neighbor cards. Add a 2px top-border accent in the same green that already runs across the hero variant, but bump opacity from `rgba(0,208,132,.2)` border-color to a full `var(--green)` top stripe.

Three-column home grid (`1fr 1fr 1fr`) treats Open Bets, Center, and Settled Bets as equal. They aren't. Open Bets is the action surface (what's still live); Settled is reference (what already happened); Center is a tool drawer. Suggested allocation: `1.1fr 1fr 1.1fr` — give the bet panels slightly more room.

### Settled bets
The collapsed "Team multiple" rows added 2026-05-10 are the best new pattern in the app. Group header on `--surface2` with `result-badge` color tied to net result reads at a glance. Issue: when a group has both wins and losses, you render two rows stacked, but the visual separation between them is just `margin-bottom: 8px`. Add a 1px hairline divider in `--border` or shift the second row's `--surface2` shade by 4% so the "split" reads as one entity rather than two unrelated rows.

### Futures
`.future-card .pick { padding-right: 90px }` was bumped from 70px in the last pass — good. But on a 280px-min column with a multi-line pick name ("UCLA Bruins to Win NCAA Tournament"), the third line still wraps under the live-odds badge. Either truncate pick names at 38 chars with ellipsis tooltip, or move the badge to a footer row when pick text overflows two lines.

### Analytics & Deep Analysis
Cleanest hierarchy in the app. Highlights cards (Best Win / Best Streak / Biggest Loss / Best Sport) are the gold-standard component — copy that pattern to other cards. Section labels at `--fs-xs` uppercase + 1px letter-spacing + `--text3` color do the right job.

### Fixes
Promote hero stat values to 2rem with a `--green`/`--red` top border. Re-balance home grid to `1.1fr 1fr 1.1fr`. Add hairline divider between split W/L rows inside a game group. Cap futures pick text at 38 chars or move the badge below.

---

## 3. Color & Contrast

### Current palette (`:root` in `css/styles.css:2-11`)
```
--bg #0d1720   --surface #152028   --surface2 #192736   --border #1e3045
--green #00d084   --red #ff4455   --amber #ffb833   --blue #5b8ef7
--text #eaeff4   --text2 #8fa3b4   --text3 #7a8f9e
```

### Contrast audit (WCAG AA: 4.5:1 normal, 3:1 large/18pt+)

| Element | Color → bg | Ratio | Pass? |
|---|---|---|---|
| `--text` on `--surface` | `#eaeff4` on `#152028` | 12.8:1 | ✓ |
| `--text2` on `--surface` | `#8fa3b4` on `#152028` | 5.6:1 | ✓ |
| `--text3` on `--surface` | `#7a8f9e` on `#152028` | 4.5:1 | ✓ (was failing) |
| `--green` on `--bg` | `#00d084` on `#0d1720` | 7.8:1 | ✓ |
| `--red` on `--bg` | `#ff4455` on `#0d1720` | 5.1:1 | ✓ |
| `--amber` on `--bg` | `#ffb833` on `#0d1720` | 9.6:1 | ✓ |
| NBA tag `#ff9800` on `rgba(255,152,0,.15)` over `--surface2` | composite ~`#3a2614` | **3.7:1** | **FAIL (small text)** |
| NCAAMB tag `#bb86fc` on its tint over `--surface2` | composite ~`#322942` | 4.6:1 | ✓ (just) |
| Amber game-time `#ffb833` 9.75px over `--surface2` | `#192736` | 8.6:1 | ✓ contrast / **fail size** (below 12px) |
| Chevron `--text3` on `--surface2` | `#7a8f9e` on `#192736` | 4.1:1 | **FAIL (small text)** |

### Sport tag colors are inconsistent
NBA, NFL, NCAAMB, NCAAWB, soccer, MLS, "other" all use hardcoded hex. They should live in `:root` as `--sport-nba`, `--sport-nfl`, etc. so contrast and brand consistency are owned in one place. Right now changing the NBA orange requires hunting through `css/styles.css:67-72`.

### Tighter palette proposal
Keep the current eight-color system; just migrate sport accents to vars:
```css
--sport-nba:    #ff9c33;   /* bumped from #ff9800 — hits 4.5:1 */
--sport-nfl:    #5b9eff;   /* bumped from #3b82f6 — was already AA */
--sport-ncaamb: #c9a0fc;   /* bumped from #bb86fc */
--sport-ncaawb: #f7a8c2;   /* bumped from #f48fb1 */
--sport-soccer: var(--green);
--sport-other:  var(--text2);
```
Every sport color must clear 4.5:1 on its own 15%-tint background because tags are below 12px.

### Fixes
Migrate sport tag colors into `:root`. Bump NBA `#ff9800` → `#ff9c33`. Bump chevron `--text3` to `--text2` at all sizes ≤ 14px. Audit `.game-time-row` font-size: either bump from `--fs-xs` (9.75px) to `--fs-sm` (11.25px) or recolor to `--text` since 9.75px amber is the contrast/size edge case.

---

## 4. Typography

### Current type scale (10 sizes, defined as vars)
```
--fs-xs    0.65rem   9.75px
--fs-sm    0.75rem   11.25px
--fs-base  0.85rem   12.75px
--fs-md    1rem      15px
--fs-lg    1.25rem   18.75px
--fs-xl    1.5rem    22.5px
--fs-2xl   1.75rem   26.25px
```
Plus three orphans: `1.2rem` on tab `h2` (inline style), `0.72rem` on stale-futures banner, `0.7rem` on `.bl-edit-btn`. Kill all three.

### Tabular-nums
Applied globally on `body` (`css/styles.css:13`) and explicitly on `.betlog-table td.bl-num` (line 515). Numeric alignment is solid. No fix needed.

### Floor check
`--fs-xs` at 9.75px is the smallest size in use. Floor should be 11px for any text the user reads at distance (table data, sport tags, chevrons). Sport tags and the amber game-time row are below the floor.

### Problems
The `0.7rem` on `.bl-edit-btn` and `0.72rem` on the stale-futures banner break the scale. Inline `1.2rem` on tab `h2`s should be `--fs-lg` (1.25rem). Three orphan sizes for no semantic reason.

Weight usage is consistent: `800` for hero values, `700` for labels and matchup lines, `600` for body. Good.

### Fixes
Replace `0.72rem`, `0.7rem`, `1.2rem` with their nearest var (`--fs-sm`, `--fs-sm`, `--fs-lg`). Bump sport tags and game-time row from `--fs-xs` to `--fs-sm`. Drop the orphan `font-size:.7rem` from `.bl-edit-btn`.

---

## 5. Spacing & Breathing Room

### 8pt grid audit
Mostly on grid. Stat card padding `16px`, home grid gap `20px`, panel padding `13px 16px`, chart grid gap `12px`, dash-stats gap `12px`, header padding `10px 24px`. Drift: `.bet-card-summary` padding `10px 12px` (off-grid 10), `.bet-card-details .actions` gap `6px`, `.refresh-btn` padding `4px 10px`. Not catastrophic but worth tightening.

### Cramped spots
- `.panel-body` padding `12px` against bet-card `margin-bottom: 8px` — bet cards feel like they touch the right scroll edge. Bump panel-body padding to `12px 14px`.
- `.bet-card-summary` `gap: 6px 8px` — when sport tag + matchup + bet row all wrap, the vertical rhythm is uneven (6px row gap vs 8px column gap). Standardize to `8px 8px`.
- `.chat-messages` gap `12px` is good. No change.
- `.center-col gap: 16px` between chatbot and charts is correct.
- Highlights `padding: 18px 16px` — the 18px vertical reads luxurious. Keep.

### Roomy spots that earned it
Stat cards `padding: 16px`. Highlights `padding: 18px 16px`. Modal `24px`. All correct.

### Fixes
Bet card summary padding `10px 12px` → `8px 12px` (align to 4px base). Panel-body `12px` → `12px 14px` for right-side breathing. Standardize all card gaps to `8px`.

---

## 6. Component Consistency

### Buttons — six near-identical filter button classes
1. `.nav-btn` — tab nav (7px 16px, 6px radius, `--fs-base`)
2. `.tp-btn` — time-period filter (5px 13px, 6px radius, `--fs-sm`)
3. `.filter-btn` — settled W/L/P filter (4px 10px, 5px radius, `--fs-sm`)
4. `.sport-pill` — sport filter (7px 16px, 20px radius, `--fs-sm`)
5. `.fbtn` — chart filter (same dimensions as `.filter-btn`)
6. `.bl-filter-btn` — bet log filter (5px 13px, 6px radius, `--fs-sm`)

`.tp-btn`, `.fbtn`, `.filter-btn`, `.bl-filter-btn` are doing the same job — toggle a single filter state, small, transparent until active, green tint on `.active`. Unify into one `.pill-btn` with optional size modifier (`.pill-btn--xs` for the W/L/P micro-buttons). 60+ lines of CSS go away.

### Cards
`.bet-card`, `.future-card`, `.highlight-card`, `.stat-card` share `background: var(--surface[2])`, `border: 1px solid var(--border)`, `border-radius: var(--radius)` (or 8px), shadow. Pull common into `.card` and let variants override.

Notable: `.bet-card` uses `border-radius: 8px`, the rest use `var(--radius)` (10px). Pick one.

### Result badges (W/L/P)
`.result-badge.W/L/P` and `.btn-win/.btn-loss/.btn-push` use the same color tints (`rgba(0,208,132,.2)` etc.). The badge is a passive state indicator, the btn is an action — that's fine — but the visual treatment is so similar that on a touch screen you tap the wrong one. Add `box-shadow: inset 0 0 0 1px rgba(0,208,132,.4)` to action buttons so they read as pressable.

### Tables
`.betlog-table`, `.corr-table`, `.edge-table`, `.breakdown-table` — at least three of these are visually identical. One `.data-table` plus modifier classes for column count.

### Fixes
Merge `.tp-btn` / `.fbtn` / `.filter-btn` / `.bl-filter-btn` into `.pill-btn`. Add `.card` base class for `.bet-card` / `.future-card` / `.highlight-card` / `.stat-card`. Normalize bet-card `border-radius` to `var(--radius)`. Add inset border to action buttons for distinct affordance vs. badges.

---

## 7. Mobile Experience (390px viewport)

### Breakpoints in place
1100px → home grid stacks. 768px → header column, dash-stats 2-col, button min-heights 36–44px. 600px → charts single-col, futures single-col, panel max-height 300px. 480px → dash-stats 1-col, nav-btn padding bumps.

### What works
At 768px, `.btn-win/.btn-loss/.btn-push` get `min-height: 44px` — passes the iOS HIG tap target. Sport pills get `min-height: 36px`. Bet card content reflows cleanly.

### What's broken at 390px
- **Stale-futures banner** at `0.72rem` already too small on desktop; at mobile this is unreadable.
- **`.bet-card-summary .bet-row`** has `gap: 8px` between pick, odds, stake. On a long parlay name + odds + stake, the row overflows horizontally before wrapping. The `flex: 1; min-width: 0` on `.pick-short` should prevent this, but the `text-overflow: ellipsis` cuts pick names aggressively. Test a "Player A +200 / Player B -150 / Game Total Over 8.5" parlay leg.
- **Chatbot height** 300px on `<600px` viewport — that's 30% of an iPhone 14 screen given to a chat input. Drop to 220px on mobile or hide the chatbot behind a floating action button at this breakpoint.
- **Deep Analysis tables** stack via `grid-template-columns: 1fr` at 600px. But the table cells inside don't shrink their text — long sport names like "NCAAMB" push columns wider than the viewport and trigger horizontal scroll.
- **`.bl-num` table columns** use tabular-nums, which is fixed-width — wider on mobile than proportional digits. A 7-digit dollar value (`$10,000.00`) needs 80px minimum. On a 390px viewport with 5 columns, the math doesn't work. Make the betlog responsive: hide stake column at <500px, show on tap-expand.
- **Modal** width `max-width: 400px` is fine, but `padding: 24px` plus 90vh height = the body content's bottom edge can sit under the iOS home indicator. Add `padding-bottom: env(safe-area-inset-bottom, 24px)`.

### Tap target audit (44×44 minimum)
- Filter buttons at 768px: 36×~80px ✓ width / fail height. Bump to 44px min-height.
- Refresh button `4px 10px`: ~22px tall. **Fail.** Should be 36px+ on mobile.
- Chevron expand: parent row is the tap target (good), but the visual chevron is only ~12px tall. Add 8px padding around the glyph.
- Modal close X: not measured but typically below floor. Verify.

### Fixes
Bump refresh-btn min-height to 36px on `<768px`. Drop mobile chatbot to 220px or move behind FAB. Hide non-essential betlog columns at `<500px`. Add safe-area-inset-bottom padding to modal. Increase chevron tap padding.

---

## 8. Empty States & Edge Cases

### What's handled (good)
- Open Bets empty: "No open bets yet. Paste a bet slip or type a bet like: Kansas +3.5 (-110) $50" — gives the exact next action with an example.
- Settled Bets empty: "No settled bets yet. Paste a Bovada or BetOnline slip to get started!" — action + source hint.
- Highlights empty: "Settle some bets to see your highlights." — action linked.
- Stale Futures clean: "No stale futures — every open future is still within its event window. ✓" — affirmative confirmation, good for a no-news-is-good-news state.

### What's missing
- **Loading state** during ESPN enrichment on initial load. Bets pop in, then shuffle. Add skeleton bet-cards (4–6 rows of grey blocks at the right heights) until the first `/api/bets` resolves.
- **Server-down state.** When `python server.py` isn't running, all panels show zeros silently. Add a global banner above the dash-stats: "Cannot reach local server — start it with `python server.py`". Trigger on fetch failure to `/api/bets`.
- **Settled futures visual differentiation.** A future that resolved (Vanderbilt eliminated) currently shows in the same grid as live ones with a tiny result badge. Mute opacity to `0.55` and move to a "Settled Futures" subsection at the bottom of the tab.
- **Zero P/L is green.** `+$0.00` renders in `--green` because the conditional is `profit >= 0`. Should be `--text2` neutral when exactly zero — green only on positive.
- **Charts with <3 data points.** Chart.js renders axes with no line. Overlay "Not enough data yet — settle 3+ bets in this sport" centered on the canvas.
- **API rate limit / Claude API down.** Chatbot just shows red error text. Add a retry button on the failed user message.
- **Network offline.** No detection. Add `window.addEventListener('offline', ...)` showing a yellow header banner.

### Fixes
Add skeleton state. Add server-down banner. Mute settled futures. Make zero P/L neutral. Overlay empty-chart message. Add chat error retry. Wire offline detection.

---

## 9. Delight & Polish

### Proposals
**A (Designer A):** Settle-bet pulse. When a bet auto-settles from ESPN scores, the bet card border pulses `border-width: 1px → 3px → 1px` in `--green` or `--red` over 600ms. The user opens the dashboard and watches three pending Sunday bets settle in real time. Each one announces itself.

**B (Designer B):** Count-up on first render of stat values. P/L card animates from `+$0.00` to actual over 500ms with `ease-out-expo`. Already-implemented `tabular-nums` means digits don't jitter. Adds life without compromising data integrity.

**C (Designer C):** Tab transitions are already in place (`css/styles.css:35-36`: `.tab-content { opacity: 0; transition: opacity .15s ease }`). Currently disabled by `display: none` toggling, which kills the fade. Switch to `visibility: hidden; opacity: 0; transition: opacity .15s, visibility 0s .15s` and the existing CSS starts working. Free polish — 4 lines of CSS.

### Vote
**B wins.** Count-up on P/L and Record values when the page loads. It's the single thing the user looks at first; making it animate signals "this is the headline." Implementation is a 20-line vanilla JS function, no library. Designer C's tab fade is so cheap to fix it should ship in the same PR.

### Build it
```javascript
function countUp(el, target, duration = 500) {
  const start = performance.now();
  const isMoney = el.textContent.includes('$');
  const from = 0;
  function tick(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 4);
    const v = from + (target - from) * eased;
    el.textContent = isMoney ? `$${v.toFixed(2)}` : Math.round(v);
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
```
Call in `renderDashStats()` for `.stat-card.hero .value`.

---

## 10. Final Vote — Highest-Impact Remaining Fix

**Designer A:** Promote hero stat cards (top stripe + 2rem value). The single most visible change.

**Designer B:** Server-down banner + skeleton loaders. The app fails silently right now — users see zeros and don't know why.

**Designer C:** Fix the sport-tag contrast failure for NBA. Smallest text in the app, on the most common sport, failing AA.

### Winner: **Server-down banner + skeleton loaders (Designer B)**

The app's worst state isn't ugly typography — it's silent failure. When the local Flask server isn't running, every panel shows zero with no explanation. New users (and the multi-user landing now invites them) will hit this and assume the app is broken. One yellow banner saying "Local server unreachable — run `python server.py`" plus four skeleton bet-card divs while the first `/api/bets` resolves moves the app from "looks broken" to "loading."

---

## Implementation Priority

| # | Fix | Effort | Impact | File(s) |
|---|---|---|---|---|
| 1 | Server-down banner + skeleton loaders | M | High | `betting-tracker.html`, `js/sync.js` |
| 2 | Promote hero stat cards (2rem value, green top stripe) | XS | High | `css/styles.css:43-44` |
| 3 | Migrate sport tag colors to `:root`, fix NBA contrast | S | Med | `css/styles.css:67-72` |
| 4 | Bump sport tags + game-time row to `--fs-sm` | XS | Med | `css/styles.css:65-66` |
| 5 | Count-up on hero stat values + enable tab fade | S | Med | `js/dashboard.js`, `css/styles.css:35-36` |
| 6 | Unify filter buttons into `.pill-btn` | M | Med (debt) | `css/styles.css` ~40 lines |
| 7 | Mute settled futures (opacity .55, subsection) | S | Med | `js/futures-render.js`, `css/styles.css` |
| 8 | Refresh-btn mobile min-height 36px | XS | Med | `css/styles.css` `@media (max-width:768px)` |
| 9 | Mobile chatbot height 300px → 220px or FAB | M | Med | `css/styles.css` `@media (max-width:600px)` |
| 10 | Add `.card` base class, normalize bet-card radius | M | Low (debt) | `css/styles.css` |
| 11 | Kill orphan font-sizes (`0.7rem`, `0.72rem`, inline `1.2rem`) | XS | Low | grep + replace |
| 12 | Zero P/L → neutral color | XS | Low | `js/dashboard.js:44` |

**Ship 1, 2, 4 in one pass.** Combined ~90 min of work, hits the three things a user notices first.
