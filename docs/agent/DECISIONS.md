# Product and design decisions

> Read this before making any choice that affects architecture, libraries, or product behaviour.
> Full history: `decisions/adr-log.md`

---

## Active constraints

| Area | Decision | Why | Since |
|---|---|---|---|
| Data store | Excel (openpyxl) — not a database | Thomas views and edits the file directly in Excel | Project start |
| Server | Python Flask, local only — no hosting | Personal tool, no remote access needed | Project start |
| Frontend | Single-file vanilla HTML/JS — no framework | No build step; open directly in browser | Project start |
| Charting | Chart.js from CDN — no npm | Keeps the single-file approach | Project start |
| Scraping | Selenium (headless Chrome) — not API | Sportsbooks don't offer APIs; scraping is the only option | Project start |
| Futures odds | Bovada public API → ESPN fallback | Free, no auth needed; Bovada is primary since it's more reliable | Added ~early 2026 |
| Bet history | Append-only — never delete rows | Thomas explicitly requires full history preservation | Project rule |
| Credentials | `.env` file loaded via `python-dotenv`, gitignored | Migrated from hardcoded in Q1 2026 | Hardening pass 2026-04-20 |
| Chat widget Claude model | Haiku 4.5 (`claude-haiku-4-5-20251001`) | Cheapest tier passing eval on observed prompts; one-line swap in `BT_CLAUDE_MODEL` | 2026-04-20 (ADR-006) |
| Chat widget dispatch order | Local analyzer first, Claude only as fallback | ~85% of messages are greetings/stats/team-filters that handleConversation / analyzeQuery cover offline | 2026-04-20 (ADR-006) |
| Chat daily spend cap | 30 Claude calls/day hard cap | Prevents runaway cost if cache misses spike | 2026-04-20 (ADR-006) |
| Python deps | Pinned in `requirements.txt`; dev deps in `requirements-dev.txt` | Reproducible installs; isolates breaking upgrades | 2026-04-20 |
| Scrapers | Shared `scraper_common.py` (preflight, retry, structured errors, --dry-run) | Cuts cryptic Selenium failures; exit codes let server.py react | 2026-04-20 (ADR-007) |
| Odds API | Hard daily budget cap (default 1000 credits) + persistent state in `odds_api_state.json` | Caps blast radius of runaway loops on the paid plan | 2026-04-20 (ADR-007) |

---

## Product rules

- Thomas describes bets in plain language; Claude handles all data entry — no manual spreadsheet work
- Never assume a bet result — only mark Won/Lost/Push when Thomas confirms it
- Always confirm parsed bet details before writing to the file
- After any data change, show the updated P&L and record in chat
- The Excel file is the single source of truth — the dashboard is read-only from a data perspective

---

## UX conventions (dashboard)

| Element | Convention |
|---|---|
| Bet cards | Compact summary row; expand on click for full detail |
| Stats | Win/Loss, P&L (dollar), ROI (%) always visible in top bar |
| Sport tags | Colour-coded: NBA=orange, NFL=blue, NCAAMB=purple, Soccer=green |
| Results | W=green, L=red, P=amber |
| Pending bets | Separate panel from settled history |
| Refresh | Buttons per-source (Locks25, Bovada) — not a global refresh |

---

## Open questions

- **Credential management:** Should scraper credentials move to a `.env` file? Currently hardcoded — low risk for a personal tool but worth addressing if the repo ever becomes shared.
- **Closing lines / CLV:** The `closing_lines.json` file and `/api/closing-lines` endpoint exist but it's unclear how actively this feature is used.

---

## How to make a new decision

1. State the problem and options
2. Choose one and write down why
3. Add a row to the table above
4. Add a full ADR to `decisions/adr-log.md`
5. If it overrides a prior decision, note that in both places
