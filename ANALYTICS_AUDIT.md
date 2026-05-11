# BetTracker Pro Analytics Audit

Three data scientists reviewed the tracker cold. Here's what we found and fixed.

---

## 1. Math Audit

**Ground truth computed from raw Excel data (108 settled bets):**

| Metric | Excel Raw | Dashboard | Match? |
|--------|-----------|-----------|--------|
| Record | 56-52 | 56-52 | YES |
| Win Rate | 51.9% | 51.9% | YES |
| Total Wagered | $6,088.12 | $6,088.12 | YES |
| Net P/L | $1,560.67 | $1,560.67 | YES |
| ROI | 25.6% | 25.6% | YES |

Win rate correctly excludes pushes from the denominator. P/L formula correctly uses `toWin` for wins and `-stake` for losses. ROI denominator uses total staked across all graded bets. No mismatches found between the `win_loss` column and the `toWin/-stake` calculation.

**No duplicate transaction IDs found.**

---

## 2. Parlay Logic

| Check | Status |
|-------|--------|
| Parlay counted as 1 bet (not per-leg) | PASS — 14 parlay entries in Bet History, each as one row |
| Parlay W/L counted correctly | PASS — 3W, 11L matches manual count |
| Parlay ROI tracked separately | WAS MISSING — now added to dashboard stat cards |
| Parlay vs straight win rate shown separately | WAS MISSING — now added |
| Push handling for parlays | NOT TESTED — no parlay pushes in data |

**Parlay-specific numbers (ground truth):**
- Parlay Record: 3-11 (21.4% win rate)
- Parlay ROI: +6.5% ($47.54 net on $733.12 wagered)
- Straight Record: 53-41 (56.4% win rate)
- Straight ROI: +28.3% ($1,513.13 net on $5,355.00 wagered)

These numbers now display in the dashboard stat cards.

---

## 3. ROI Visualization — Fixed

| Issue | Status |
|-------|--------|
| Y-axis didn't show negative territory clearly | FIXED — added dashed zero reference line |
| No reference line at 0% | FIXED |
| Cumulative ROI over time (not per-bet) | Already correct |
| Sample size warning below 20 bets | FIXED — title shows warning when < 20 |
| Confidence band proposal | NOTED — would need a bootstrap simulation, recommend as future add |
| ROI line color was always green | FIXED — now red when ROI is negative |

---

## 4. Sport & League Breakdowns — Fixed

| Issue | Status |
|-------|--------|
| Sample size missing alongside win rate | FIXED — record shown in labels (e.g., "NCAAMB (40-39)") |
| Sports < 10 bets flagged | FIXED — asterisk and low-opacity styling in breakdown tables |
| ROI sorted alphabetically | FIXED — now sorted by ROI descending in breakdown, by P/L in charts |
| Chart used pie/doughnut | FIXED — replaced with horizontal bar chart |
| No profitable vs unprofitable distinction | FIXED — green for positive, red for negative bars |

**Sport breakdown (ground truth, sorted by ROI):**
- NBA Live: 1-0, +$43.48, +87.0% ROI *
- Soccer: 3-1, +$129.70, +70.1% ROI *
- CBB: 40-39, +$1,171.33, +25.3% ROI
- CBB Live: 12-12, +$216.16, +17.7% ROI

(* = low sample size)

---

## 5. Bet Type Performance

Bet type ROI chart already existed on Deep Analysis tab. The breakdown table already tracks each type independently.

**Changes made:**
- Dynamic chart title now shows which bet type leads (e.g., "Spread bets lead at +32% ROI")
- Parlays tracked as separate category in all views
- Low sample size flagging added to breakdown tables

---

## 6. Win/Loss Record Integrity

| Check | Status |
|-------|--------|
| Pushes excluded from win rate denominator | PASS |
| Void bets excluded | PASS — infer_type handles this |
| Record matches manual count | PASS — 56W + 52L = 108 graded |
| No phantom bets from localStorage | PASS — autoSyncIfInflated() handles cleanup |

---

## 7. Missing Insights — Votes & Implementation

| Insight | Scientist A (Sharp Metrics) | Scientist B (Viz) | Scientist C (Modeling) | Votes | Status |
|---------|----|----|----|----|--------|
| **Break-Even Win Rate** | TOP 1 | TOP 2 | TOP 1 | 3 | BUILT — shows in summary card |
| **Streak Tracker** | TOP 2 | TOP 1 | — | 2 | BUILT — shows in summary card + highlights |
| CLV (Closing Line Value) | — | — | TOP 2 | 1 | Already exists (Deep Analysis) |
| Hot/Cold Sport Detector | — | — | — | 0 | Deferred |
| Bet Sizing Consistency | — | — | — | 0 | Deferred (scatter exists in Bet Size chart) |
| Day/Time Performance | — | — | — | 0 | Already exists (DOW chart) |

**Break-Even Win Rate** — implemented in the summary dashboard card. Given average odds of your bets, it calculates the win rate you need to break even. Your 51.9% actual vs the break-even threshold tells you if you have a real edge or are running hot.

**Streak Tracker** — current streak shown in summary card. Best/worst all-time streaks already on Highlights tab.

---

## 8. Chart Audit — All Charts Updated

| Fix | Applied To |
|-----|-----------|
| Titles state the conclusion, not data label | ALL 12 charts — dynamic titles update with data |
| Green = profitable, red = not (consistent) | ALL bar charts now use green/red |
| Zero reference lines | ROI, Bankroll, Cum P/L, Sport charts |
| 3-second readability | Sport chart changed from unreadable doughnut to horizontal bars |
| Sample size flags | Win rate labels show record; breakdown tables flag < 10 bets |

---

## 9. Data Trust Signals

| Signal | Status |
|--------|--------|
| Last updated timestamp | ADDED — shows on Open Bets stat card |
| Settled vs pending labels | ADDED — stat card says "Record (settled only)" |
| Straight vs parlay split | ADDED — sub-text on Record, ROI, and P/L cards |
| Low sample size notation | ADDED — on win rate card (< 20 bets) and breakdown tables (< 10 bets) |
| Bankroll reconciliation | IN PLACE — autoSyncIfInflated() reconciles localStorage against Excel |

---

## 10. The One Dashboard Card — BUILT

Six metrics that answer "am I profitable, where, and what to do differently" in 5 seconds:

1. **Status** — PROFITABLE or UNPROFITABLE (one word, green or red)
2. **Net P/L** — your actual dollar profit/loss
3. **ROI** — your return on investment percentage
4. **Win Rate vs Break-Even** — your actual win rate vs what you need at your average odds
5. **Best Sport** — which sport delivers the best ROI
6. **Current Streak** — where your momentum sits

This card renders at the top of the Analytics tab.

---

## Full Change Summary

1. Dashboard stat cards now show straight vs parlay split, timestamps, and "settled only" labels
2. ROI chart has zero reference line, dynamic title, sample size warning, color-coded line
3. Bankroll chart has zero reference line and dynamic title
4. Sport chart replaced from doughnut to horizontal bar, sorted by P/L, green/red coded
5. Win rate by sport chart sorted by win rate, shows records, 50% break-even line, low sample flags
6. All 12 charts have dynamic conclusion-oriented titles
7. Deep breakdown tables sort by ROI (not P/L), flag low sample sizes
8. Summary dashboard card with 6 key metrics built on Analytics tab
9. Home filter bar collapsed behind toggle button
10. Tab transitions have 150ms opacity fade
