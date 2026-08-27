# Tech Stack — RailScout

## Backend
- **Node.js + Express** — simple REST endpoint, minimal boilerplate, easy to explain in an interview
- **axios** — HTTP calls to RailRadar API
- **dotenv** — load `RAILRADAR_API_KEY` from `.env` (never committed, never sent to client)
- **In-memory cache** (plain JS object or a tiny lib like `node-cache`) — no database needed for v1
- Deployment target (later): Render, Railway, or a Cloudflare Worker if we rewrite lightweight

## Data Source
- **RailRadar API** (`https://api.railradar.in/v1`)
  - `GET /v1/trains/{number}` — route/timetable
  - `GET /v1/trains/{number}/seats` — per-station-pair availability
  - Free tier: 1,000 requests/month
  - Fallback option if needed: RapidAPI "IRCTC" (irctc1, by JERC)

## Extension
- **Manifest V3** Chrome extension
- **Vanilla JS + HTML/CSS** for the popup (v1) — keep it simple; React only if the UI grows complex enough to justify it
- `fetch()` from the popup script to call the backend's `/api/find-confirmed` endpoint
- No content-script / page injection in v1 (that's a stretch goal)

## Version Control
- Git + GitHub, `.gitignore` covering `node_modules/`, `.env`
- Conventional commits (`feat:`, `fix:`, `docs:`) for a clean, readable history

## Explicitly Not Using
- No database (nothing needs to persist between requests)
- No auth/login system
- No IRCTC scraping, no Puppeteer/Playwright automation against IRCTC's own site
- No frontend framework unless the popup UI outgrows vanilla JS
