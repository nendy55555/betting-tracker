# QA and testing

> There is no automated test suite. All testing is manual.

---

## Manual smoke test — run after any server.py change

```bash
# 1. Start server
python server.py

# 2. Health check
curl http://localhost:5001/api/status

# 3. Settled bets load
curl http://localhost:5001/api/bets | python -m json.tool | head -30

# 4. Open bets load
curl http://localhost:5001/api/open-bets | python -m json.tool | head -30

# 5. Open betting-tracker.html in browser
#    - Dashboard stats render (not all zero)
#    - Open bets panel shows pending bets
#    - History panel shows settled bets
#    - P&L numbers match expectations
```

---

## Manual smoke test — run after any HTML/JS change

1. Open `betting-tracker.html` in browser with DevTools open
2. Console: no JS errors on load
3. Network: `/api/bets`, `/api/open-bets` both return 200
4. Stats panel: Win/Loss record, P&L, ROI all display
5. Open Bets panel: cards expand/collapse on click
6. History panel: sorted most-recent first
7. Futures tab: odds load (may be slow — external API call)

---

## Verifying a new bet was written correctly

After writing a bet to Excel:
1. `curl http://localhost:5001/api/bets` (settled) or `/api/open-bets` (pending)
2. Find the bet by `txId` or matchup
3. Verify: `sport`, `type`, `odds`, `stake`, `toWin`, `result` all correct
4. Verify: `winLoss` is positive for wins, negative for losses, zero for pending
5. Open `betting-tracker.html` — confirm it appears in the right panel

---

## Verifying a scraper run

After running a scraper:
1. Check terminal for row-count output (`settled: N, open: N`)
2. `GET /api/bets` — confirm new bets appear
3. Open `Betting_Tracker.xlsx` directly — confirm new rows in the correct sheet
4. No existing rows should be deleted or overwritten (only appended / status-updated)

---

## Bet field validation checklist

When adding a bet manually, verify these fields are not blank or wrong:

| Field | Expected | Common mistake |
|---|---|---|
| `tx_id` | Unique ticket/transaction ID | Missing = row skipped by server |
| `sport` | Normalised name (NBA, NFL, NCAAMB) | Raw strings like `cbb` still work but aren't ideal |
| `odds` | American format integer (-110, +150) | Year value like -2026 = parser bug |
| `risk` | Dollar amount wagered | Should be positive |
| `to_win` | Potential profit (not including stake) | Should be positive |
| `win_loss` | Actual P&L: positive for wins, negative for losses | Wrong sign flips P&L |
| `status` | `Won`, `Lost`, or `Push` (case-sensitive) | Anything else → result field empty in dashboard |

---

## Known manual test cases

See `reference/test-cases.md` for specific scenarios and expected outputs.

---

## What to check before any code change

- If touching `server.py`: run the full smoke test above after the change
- If touching `betting-tracker.html`: open in browser and check Console + Network
- If touching a scraper: run it manually and verify Excel output before triggering via dashboard
- If changing the Excel schema: update `reference/data-models.md` before writing the code
