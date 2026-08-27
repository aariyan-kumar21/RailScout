# PRD — RailScout

## Problem Statement
On IRCTC, a train can show as waitlisted (WL) from a traveler's boarding station, even though seats are confirmed-available from a station a few stops earlier on the same route (closer to the train's origin). There is no existing tool that scans and surfaces this automatically — travelers currently have to manually re-search availability one station at a time.

## Goal
Build a browser extension that, given a train + boarding station + destination + date + class, checks availability from every station between the train's origin and the user's boarding station, and returns a ranked list of stations with confirmed availability — nearest to the boarding station first.

## Non-Goals (explicitly out of scope)
- No ticket booking or checkout automation of any kind
- No interaction with IRCTC's live website/session (all data comes from a third-party API)
- No user accounts, login, or payment handling
- No PNR prediction / ML — status is read directly from the data source, not forecasted
- No multi-train / split-journey routing (single train only, v1)
- No public distribution (Chrome Web Store) — install-from-source only, for portfolio/demo use

## Target User
A single developer (the project owner) demoing this as a portfolio piece, plus a handful of testers trying it manually.

## User Flow
1. User opens the extension popup
2. Enters: train number, boarding station code, destination station code, journey date, class
3. Clicks "Find Confirmed Station"
4. Extension calls the backend, which scans candidate stations and returns ranked results
5. UI displays a list: station name, distance from boarding station, status badge (confirmed / RAC / waitlisted)
6. User clicks "Search on IRCTC" next to their chosen station, which opens irctc.co.in in a new tab for manual booking

## MVP Feature Set
- [ ] Backend endpoint: scan stations before boarding point, return ranked availability
- [ ] In-memory caching (5 min TTL) to reduce redundant API calls
- [ ] Extension popup form (train number, boarding, destination, date, class)
- [ ] Results list UI with status badges
- [ ] "Search on IRCTC" link (manual redirect only, no automation)

## Stretch Goals (post-MVP, not for v1)
- Content-script overlay directly on IRCTC's search results page (auto-detect train/date/stations)
- Route visualization (map/line view of the train's stations, color-coded)
- Multi-class comparison in one scan

## Success Criteria
- Given a real train number, the tool correctly lists intermediate stations and their live availability status
- Nearest confirmed station is clearly highlighted
- Zero interaction with IRCTC's actual booking flow — verified by design, not just by testing
- Clean enough code/README to walk through in a technical interview

## Constraints
- RailRadar free tier: 1,000 requests/month — cache aggressively, avoid unnecessary scans
- API key must never be exposed client-side (backend proxy holds it)
