# RailScout

A standalone web application that helps travelers find a nearby station with a **confirmed** ticket, when their actual boarding station only shows a waitlisted (WL) seat.

## The Problem
On IRCTC, a train can show as waitlisted from your boarding station — but seats may actually be confirmed-available from a station a few stops earlier on the same route. Checking this manually means re-searching availability one station at a time. RailScout automates that scan across candidate stations preceding your boarding point.

## How It Works
1. Enter your train number, boarding station, destination, date, and class in the web app (or click a quick demo preset).
2. The backend fetches the train's full route and checks availability from every station between the origin and your boarding point.
3. Results are ranked nearest-to-farthest, showing which stations offer confirmed berths, seat counts, and status badges.
4. If the exact date has limited availability, confirmed alternatives on nearby dates are surfaced.
5. Click through to IRCTC to book manually — RailScout never automates or interacts with IRCTC's site directly.

## Why It's Built This Way
- **No IRCTC automation**: all data comes from a third-party rail-data API (RailRadar), not from scraping or automating IRCTC's own website. Booking always happens manually, by the user, on IRCTC directly.
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

That's it! The full RailScout web app will load, allowing you to run searches, test demo presets, inspect candidate stations, and launch manual IRCTC booking searches.

You can also test the API directly:
```bash
# Health check
curl http://localhost:3000/health
# → { "status": "ok", "service": "railscout-backend" }

# Real availability scan
curl "http://localhost:3000/api/find-confirmed?trainNumber=12952&boardingStation=KOTA&destination=NDLS&date=2026-09-05&classCode=3A"
```

---

## Repository Layout

```
RailScout/
├── backend/
│   ├── server.js               ← Express entry point & static file server
│   ├── routes/
│   │   └── findConfirmed.js    ← Station-scanning algorithm + /api/find-confirmed
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
