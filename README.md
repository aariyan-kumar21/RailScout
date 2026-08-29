# RailScout

A browser extension that helps travelers find a nearby station with a **confirmed** ticket, when their actual boarding station only shows a waitlisted (WL) seat.

## The Problem
On IRCTC, a train can show as waitlisted from your boarding station — but seats may actually be confirmed-available from a station a few stops earlier on the same route. Checking this manually means re-searching availability one station at a time. This tool automates that scan.

## How It Works
1. Enter your train number, boarding station, destination, date, and class in the extension popup
2. The backend fetches the train's full route and checks availability from every station between the origin and your boarding point
3. Results are ranked nearest-to-farthest, showing which stations have a confirmed seat
4. Click through to IRCTC to book manually — this tool never books or automates anything on IRCTC's site

## Why It's Built This Way
- **No IRCTC automation**: all data comes from a third-party rail-data API (RailRadar), not from scraping or automating IRCTC's own website. Booking always happens manually, by the user, on IRCTC directly.
- **API key stays server-side**: the extension never talks to RailRadar directly — a small backend proxy holds the key.

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

### Backend

```bash
# 1. Move into the backend folder
cd backend

# 2. Install dependencies
npm install

# 3. Create your .env file from the template
copy .env.example .env      # Windows
# cp .env.example .env      # macOS/Linux

# 4. Add your RailRadar API key to .env
#    RAILRADAR_API_KEY=<your_key_here>

# 5. Start the dev server (auto-restarts on file changes — Node 18+ built-in)
npm run dev
```

The server starts at **http://localhost:3000**.

```bash
# Confirm it's alive
curl http://localhost:3000/health
# → { "status": "ok", "service": "railscout-backend" }

# Run a real availability scan
curl "http://localhost:3000/api/find-confirmed?trainNumber=12952&boardingStation=KOTA&destination=NDLS&date=2026-09-05&classCode=3A"

# Test validation (missing params)
curl "http://localhost:3000/api/find-confirmed?trainNumber=12952"
# → { "success": false, "error": { "code": "INVALID_PARAMS", ... } }
```

### Extension (Chrome)

1. Open Google Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** (toggle switch in the top right corner)
3. Click **Load unpacked** (top left button)
4. Select the `extension/` folder inside this repository:
   ```text
   c:\Users\Aariy\RailScout\extension
   ```
5. Click the RailScout icon in the Chrome toolbar to open the popup.

---

## Repository Layout

```
RailScout/
├── backend/
│   ├── server.js               ← Express entry point
│   ├── routes/
│   │   └── findConfirmed.js    ← Station-scanning algorithm + /api/find-confirmed
│   ├── services/
│   │   ├── railRadar.js        ← Axios wrapper for RailRadar API
│   │   └── cache.js            ← In-memory 5-min TTL cache
│   ├── utils/
│   │   └── parseAvailability.js ← Extracts availability from RailRadar calendar
│   ├── .env.example
│   └── package.json
├── extension/
│   ├── manifest.json           ← Manifest V3 extension configuration
│   ├── popup.html              ← Extension popup markup and form
│   ├── popup.css               ← Extension popup styles and status badges
│   ├── popup.js                ← API fetch handler and UI renderer
│   └── icons/                  ← Extension icons
├── PRD.md
├── SCHEMA.md
├── TECH_STACK.md
└── RULES.md
```
