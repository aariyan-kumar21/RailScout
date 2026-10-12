# PRD — RailScout

## Problem Statement
Finding confirmed train tickets on Indian Railways is notoriously difficult. While travelers often check a single specific date, availability often exists on an adjacent day (e.g. 1 or 2 days earlier or later) or from an earlier station along the train route. Existing tools either check a single date in isolation or require tedious manual re-searching across multiple dates and stops.

## Goal
Build a date-first train availability finder:
1. Scan every date in RailRadar's ~14-day availability calendar for the selected route.
2. If the user's requested date has no confirmed seat, instantly compute and surface the **nearest available date** (closest earlier or later confirmed date, indicating exact weekday and day offsets).
3. Display an interactive 14-day availability calendar grid/strip color-coded by status.
4. **Fallback Differentiator**: If no date in the entire 14-day window has a confirmed seat at the requested boarding station, automatically scan earlier stations along the route (candidate stations before boarding point) and surface confirmed options.

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
1. User visits the RailScout website (`http://localhost:3000`)
2. Enters: train number, boarding station code, destination station code, journey date, class (or clicks a demo preset)
3. Clicks "Find Available Dates" (or "Scan Route")
4. Frontend calls `GET /api/find-dates`.
5. UI displays:
   - Headline result card for requested date (confirmed seats, or unconfirmed notice).
   - If unconfirmed: prominent nearest available date card(s) (e.g., "Mon, 16 Oct (2 days later) — 8 seats", comparing nearestBefore and nearestAfter).
   - 14-day calendar strip/grid color-coded by status (green = confirmed, yellow = RAC, red = waitlist, grey = no data) with requested date highlighted.
   - If no confirmed seats in the entire window: "Try boarding earlier" cards showing confirmed seats from earlier stations.
6. User clicks "Search on IRCTC" to open IRCTC in a new tab for manual booking.

## MVP Feature Set
- [x] Date-First backend endpoint (`/api/find-dates`): fetch 14-day calendar in a single upstream call, compute nearest confirmed dates, and handle earlier-station fallback.
- [x] Route station availability scanner (`/api/find-confirmed`): scans intermediate stops before boarding station.
- [x] In-memory caching (5 min TTL) keyed by route and class (not date) to serve all dates from one cached call.
- [x] Headline recommendation card highlighting nearest confirmed date with weekday and day offset.
- [x] 14-day calendar visual strip/grid with interactive status inspection.
- [x] Fallback "Try boarding earlier" recommendations when boarding station has zero confirmed dates.
- [x] "Search on IRCTC" link (manual redirect only, no automation).

## Stretch Goals (post-MVP, not for v1)
- Map/line view route visualization with interactive stop markers
- Multi-class comparison in one scan

## Success Criteria
- Given a real train number, the tool displays the 14-day calendar and surfaces the closest confirmed alternative date.
- Nearest confirmed date is clearly highlighted with readable weekday and relative days.
- Zero interaction with IRCTC's actual booking flow — verified by design, not just by testing.
- Clean enough code/README to walk through in a technical interview.

## Constraints
- RailRadar free tier: 1,000 requests/month — cache aggressively, avoid unnecessary scans.
- API key must never be exposed client-side (backend proxy holds it).
