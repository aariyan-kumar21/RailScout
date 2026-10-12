# PRD — RailScout

## Problem Statement
On IRCTC, a train can show as waitlisted (WL) from a traveler's boarding station, even though seats are confirmed-available from a station a few stops earlier on the same route (closer to the train's origin). There is no existing tool that scans and surfaces this automatically — travelers currently have to manually re-search availability one station at a time.

## Goal
Build a standalone website that, given a train + boarding station + destination + date + class, checks availability from every station between the train's origin and the user's boarding station, and returns a ranked list of stations with confirmed availability — nearest to the boarding station first.

## Non-Goals (explicitly out of scope)
- No ticket booking or checkout automation of any kind
- No interaction with IRCTC's live website/session (all data comes from a third-party API)
- No user accounts, login, or payment handling
- No PNR prediction / ML — status is read directly from the data source, not forecasted
- No multi-train / split-journey routing (single train only, v1)
- No Chrome extension installation friction — standalone web interface for easy demoing

## Target User
A single developer (the project owner) demoing this as a portfolio piece, plus testers trying it via their browser.

## User Flow
1. User visits the RailScout website (http://localhost:3000)
2. Enters: train number, boarding station code, destination station code, journey date, class (or clicks a demo preset)
3. Clicks "Scan Route for Confirmed Seats"
4. Frontend calls the backend API, which scans candidate stations and returns ranked results
5. UI displays an overview, top recommendation, and ranked station cards: station name, distance from origin, stops before boarding, status badge (confirmed / RAC / waitlisted), and any confirmed alternatives
6. User clicks "Search on IRCTC" next to their chosen station, which opens irctc.co.in in a new tab for manual booking

## MVP Feature Set
- [x] Backend endpoint: scan stations before boarding point, return ranked availability
- [x] In-memory caching (5 min TTL) to reduce redundant API calls
- [x] Standalone website form (train number, boarding, destination, date, class)
- [x] Results list UI with status badges and confirmed alternatives
- [x] "Search on IRCTC" link (manual redirect only, no automation)

## Stretch Goals (post-MVP, not for v1)
- Map/line view route visualization with interactive stop markers
- Multi-class comparison in one scan

## Success Criteria
- Given a real train number, the tool correctly lists intermediate stations and their live availability status
- Nearest confirmed station is clearly highlighted
- Zero interaction with IRCTC's actual booking flow — verified by design, not just by testing
- Clean enough code/README to walk through in a technical interview

## Constraints
- RailRadar free tier: 1,000 requests/month — cache aggressively, avoid unnecessary scans
- API key must never be exposed client-side (backend proxy holds it)
