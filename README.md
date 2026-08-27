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

