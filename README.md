# RailScout

A date-first train availability finder that scans Indian Railways ticket availability across a 14-day calendar window. When your requested date is waitlisted, RailScout immediately finds and highlights the **nearest confirmed date** (with weekday and days offset), and falls back to scanning earlier stations along the route if no dates are confirmed.

## The Problem
Single-date train queries often lead to disappointment when your chosen date is waitlisted. In reality, confirmed seats are frequently available on an adjacent day (e.g. 1–2 days earlier or later) or from an earlier station along the train route. Manually checking this on IRCTC requires searching each date and station individually. RailScout automates this in a single click.

## How It Works
1. **Date-First Scan**: Enter your train number, boarding station, destination, date, and class.
2. **14-Day Calendar**: The backend queries RailRadar's availability endpoint once to fetch the full ~14-day calendar window.
3. **Nearest Confirmed Date**: If the requested date has no confirmed seat, RailScout automatically computes the closest confirmed dates before and after, highlighting the nearest available date (e.g. *"Mon, 16 Oct (2 days later) — 8 seats"*).
4. **Earlier Station Fallback**: If no date in the 14-day window has confirmed seats at your boarding station, RailScout automatically scans up to 5 earlier stations along the train route and surfaces the top 3 confirmed options.
5. **Direct IRCTC Redirect**: Click through to IRCTC to book manually in a new tab — RailScout never automates or interacts with IRCTC directly.

## Why It's Built This Way
- **No IRCTC automation**: all data comes from a third-party rail-data API (RailRadar), not from scraping or automating IRCTC's own website. Booking always happens manually, by the user, on IRCTC directly.
- **Single Upstream Call & Aggressive Caching**: the 14-day calendar is fetched in one request and cached for 5 minutes by route/class (not date), protecting the 1,000 req/month free tier.
- **API key stays server-side**: the frontend never talks to RailRadar directly — the backend proxy securely holds the key in `.env`.
- **Zero install friction**: built as a standalone web application rather than a browser extension, making it immediately runnable and easy to demo in any browser.

## Stack
See [TECH_STACK.md](./TECH_STACK.md).

## Project Docs
- [PRD.md](./PRD.md) — problem, scope, user flow, MVP feature set
- [SCHEMA.md](./SCHEMA.md) — API request/response shapes
- [TECH_STACK.md](./TECH_STACK.md) — stack and reasoning
- [RULES.md](./RULES.md) — hard constraints and coding conventions

---

## Setup & Running

### Prerequisites
- Node.js ≥ 18
- A [RailRadar API](https://api.railradar.in) key (free tier: 1,000 req/month)

### Running the Application

Running the backend dev server serves **both** the API and the frontend website together on `localhost:3000`:

```bash
# 1. Move into the backend folder
cd backend

# 2. Install dependencies
npm install

# 3. Create your .env file from the template (if not already done)
copy .env.example .env      # Windows
# cp .env.example .env      # macOS/Linux

# 4. Add your RailRadar API key to .env
#    RAILRADAR_API_KEY=<your_key_here>

# 5. Start the server (auto-restarts on file changes)
npm run dev
```

### Viewing the Website

Open your browser and navigate to:
```text
http://localhost:3000
```

### Testing the API Directly

```bash
# Health check
curl http://localhost:3000/health
# → { "status": "ok", "service": "railscout-backend" }

# Date-first calendar scan (primary)
curl "http://localhost:3000/api/find-dates?trainNumber=12952&boardingStation=KOTA&destination=MMCT&date=2026-10-16&classCode=3A"

# Earlier station route scan
curl "http://localhost:3000/api/find-confirmed?trainNumber=12952&boardingStation=KOTA&destination=MMCT&date=2026-10-15&classCode=3A"
```

---

## Repository Layout

```
RailScout/
├── backend/
│   ├── server.js               ← Express entry point & static file server
│   ├── routes/
│   │   ├── findDates.js        ← Date-first calendar endpoint (/api/find-dates)
│   │   └── findConfirmed.js    ← Station-scanning algorithm (/api/find-confirmed)
│   ├── services/
│   │   ├── railRadar.js        ← Axios wrapper for RailRadar API
│   │   └── cache.js            ← In-memory 5-min TTL cache
│   ├── utils/
│   │   └── parseAvailability.js ← Extracts availability from RailRadar calendar
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── index.html              ← Responsive web application markup & hero
│   ├── style.css               ← High-aesthetic modern railway theme stylesheet
│   └── app.js                  ← API fetch handler, state, filters & UI renderer
├── PRD.md
├── SCHEMA.md
├── TECH_STACK.md
└── RULES.md
```
