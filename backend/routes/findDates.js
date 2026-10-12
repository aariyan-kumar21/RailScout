/**
 * findDates.js — Route handler for GET /api/find-dates (Date-First Availability)
 *
 * ─── PURPOSE ─────────────────────────────────────────────────────────────────
 * Traditional train search looks at a single date and reports "Waitlisted".
 * RailScout flips this to DATE-FIRST:
 *   1. Queries RailRadar ONCE to get the ~14-day availability calendar for the route.
 *   2. If the user's requested date has no confirmed seat, finds and highlights
 *      the NEAREST confirmed date (closest earlier or later, with weekday & day offset).
 *   3. If no date at the boarding station has confirmed seats in the entire window,
 *      automatically triggers a fallback scan of earlier stations (max 5 candidate
 *      stations) and surfaces the top 3 confirmed options.
 *   4. Caches the full calendar keyed by route + class + quota (NOT by date) for
 *      5 minutes so all dates for that route are served without repeat API calls.
 *
 * ─── SCHEMA ─────────────────────────────────────────────────────────────────
 * Defined in SCHEMA.md §1.
 */

'use strict';

const express = require('express');
const { getTrainRoute, getSeatsAvailability } = require('../services/railRadar');
const cache = require('../services/cache');

const router = express.Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns short English weekday name ("Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat")
 * computed using UTC to avoid local timezone shifts.
 *
 * @param {string} dateStr - "YYYY-MM-DD"
 * @returns {string}
 */
function getWeekday(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const dateObj = new Date(Date.UTC(year, month - 1, day));
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return weekdays[dateObj.getUTCDay()];
}

/**
 * Calculates the signed integer difference in days between two YYYY-MM-DD date strings:
 * (targetDateStr - baseDateStr).
 *
 * e.g. ("2026-10-18", "2026-10-16") -> +2 (2 days later)
 * e.g. ("2026-10-14", "2026-10-16") -> -2 (2 days earlier)
 *
 * @param {string} targetDateStr
 * @param {string} baseDateStr
 * @returns {number}
 */
function daysDiff(targetDateStr, baseDateStr) {
  const [y1, m1, d1] = targetDateStr.split('-').map(Number);
  const [y2, m2, d2] = baseDateStr.split('-').map(Number);
  const utc1 = Date.UTC(y1, m1 - 1, d1);
  const utc2 = Date.UTC(y2, m2 - 1, d2);
  const MS_PER_DAY = 1000 * 60 * 60 * 24;
  return Math.round((utc1 - utc2) / MS_PER_DAY);
}

/**
 * Returns today's date formatted as "YYYY-MM-DD" in Indian Standard Time (IST, UTC+5:30).
 *
 * @returns {string}
 */
function getTodayIstString() {
  const now = new Date();
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const istDate = new Date(now.getTime() + istOffsetMs);
  return istDate.toISOString().split('T')[0];
}

/**
 * Normalizes a single entry from RailRadar's calendar array into our standardized shape.
 *
 * RULES.md & user spec:
 * - Only isAvailable === true (and not RAC) is treated as isConfirmed: true.
 * - RAC is listed with its status but is never treated as confirmed or returned as nearest.
 *
 * @param {Object} rawEntry
 * @returns {Object}
 */
function normalizeCalendarEntry(rawEntry) {
  const date = rawEntry.date || rawEntry.rawDate || '';
  const weekday = date ? getWeekday(date) : '';
  const rawStatus = rawEntry.status || 'UNKNOWN';

  const isRac =
    (rawStatus && rawStatus.toUpperCase().startsWith('RAC')) ||
    rawEntry.statusCode === 'RAC';

  // Strict confirmation rule: only isAvailable === true AND not RAC
  const isConfirmed = Boolean(rawEntry.isAvailable) && !isRac;

  const statusCode =
    rawEntry.statusCode ||
    (isConfirmed ? 'AVAILABLE' : isRac ? 'RAC' : 'WAITLIST');

  // availableSeats: number or null
  let availableSeats = null;
  if (isConfirmed) {
    if (typeof rawEntry.availableSeats === 'number') {
      availableSeats = rawEntry.availableSeats;
    } else if (rawStatus) {
      const match = rawStatus.match(/AVAILABLE[^\d]*(\d+)/i);
      if (match) {
        availableSeats = parseInt(match[1], 10);
      }
    }
  }

  // waitlistNumber: number or null
  let waitlistNumber = null;
  if (typeof rawEntry.waitlistNumber === 'number') {
    waitlistNumber = rawEntry.waitlistNumber;
  } else if (!isConfirmed && rawStatus) {
    const slashMatch =
      rawStatus.match(/\/(?:[A-Za-z]*WL)?(\d+)/i) || rawStatus.match(/\/(\d+)/);
    if (slashMatch) {
      waitlistNumber = parseInt(slashMatch[1], 10);
    } else {
      const wlMatch =
        rawStatus.match(/(?:^|[^A-Z])WL[^\d]*(\d+)/i) || rawStatus.match(/(\d+)/);
      if (wlMatch) {
        waitlistNumber = parseInt(wlMatch[1], 10);
      }
    }
  }

  // waitlistType: string or null (e.g. "RLWL", "GNWL")
  let waitlistType = null;
  if (rawEntry.waitlistType) {
    waitlistType = String(rawEntry.waitlistType).toUpperCase();
  } else if (!isConfirmed && rawStatus) {
    const typeMatch =
      rawStatus.match(/^([A-Z]+)WL/i) || rawStatus.match(/^([A-Z]+)/i);
    if (typeMatch && typeMatch[0] !== 'AVAILABLE' && typeMatch[0] !== 'RAC') {
      waitlistType = typeMatch[0].toUpperCase();
    }
  }

  return {
    date,
    weekday,
    status: rawStatus,
    statusCode,
    isConfirmed,
    availableSeats,
    waitlistNumber,
    waitlistType,
  };
}

/**
 * Map upstream (RailRadar API) errors to SCHEMA.md error responses.
 *
 * @param {import('express').Response} res
 * @param {Error} error
 * @param {string} trainNumber
 */
function handleUpstreamError(res, error, trainNumber) {
  const status = error.httpStatus || 500;

  if (status >= 400 && status < 500 && status !== 429) {
    return res.status(404).json({
      success: false,
      error: {
        code: 'TRAIN_NOT_FOUND',
        message: `Train ${trainNumber} not found. Please check the train number and try again.`,
      },
    });
  }

  if (status === 429) {
    return res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: "We've hit today's data limit for this demo. Please try again later.",
      },
    });
  }

  return res.status(502).json({
    success: false,
    error: {
      code: 'UPSTREAM_API_ERROR',
      message:
        "Couldn't fetch live data right now — RailRadar's service may be temporarily unavailable. Please try again in a moment.",
    },
  });
}

// ---------------------------------------------------------------------------
// GET /api/find-dates
// ---------------------------------------------------------------------------

router.get('/', async (req, res) => {
  // ── Step 1: Validate required query parameters ───────────────────────────
  const {
    trainNumber,
    boardingStation,
    destination,
    date,
    classCode,
    quotaCode = 'GN',
  } = req.query;

  if (!trainNumber) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_PARAMS', message: 'Please enter a train number' },
    });
  }
  if (!boardingStation) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_PARAMS', message: 'Please enter a boarding station' },
    });
  }
  if (!destination) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_PARAMS', message: 'Please enter a destination' },
    });
  }
  if (!date) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_PARAMS', message: 'Please select a journey date' },
    });
  }
  if (!classCode) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_PARAMS', message: 'Please select a class' },
    });
  }

  if (isNaN(Date.parse(date))) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_DATE', message: 'Please enter a valid date' },
    });
  }

  const validClasses = ['1A', '2A', '3A', 'SL', 'CC', '2S'];
  if (!validClasses.includes(classCode.toUpperCase())) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_CLASS', message: 'Please select a valid class' },
    });
  }

  if (boardingStation.toUpperCase() === destination.toUpperCase()) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'SAME_STATIONS',
        message: "Boarding station and destination can't be the same",
      },
    });
  }

  const normBoarding    = boardingStation.toUpperCase().trim();
  const normDestination = destination.toUpperCase().trim();
  const normTrainNumber = trainNumber.trim();
  const normClassCode   = classCode.toUpperCase().trim();
  const normQuotaCode   = quotaCode.toUpperCase().trim();

  const trainNumberRegex = /^\d{4,5}$/;
  if (!trainNumberRegex.test(normTrainNumber)) {
    return res.status(404).json({
      success: false,
      error: {
        code: 'TRAIN_NOT_FOUND',
        message: 'Please enter a valid train number',
      },
    });
  }

  // ── Step 2: Fetch train route to validate stations & direction ────────────
  let routeData;
  try {
    routeData = await getTrainRoute(normTrainNumber);
  } catch (error) {
    return handleUpstreamError(res, error, normTrainNumber);
  }

  const rawStations =
    routeData?.data?.route ||
    routeData?.route ||
    routeData?.data?.stations ||
    (Array.isArray(routeData) ? routeData : null);

  if (!rawStations || rawStations.length === 0) {
    return res.status(404).json({
      success: false,
      error: {
        code: 'TRAIN_NOT_FOUND',
        message: `Train ${normTrainNumber} not found. Please check the train number and try again.`,
      },
    });
  }

  const stations = rawStations.map((stop) => ({
    stationCode: (
      stop.station?.code ||
      stop.stationCode ||
      stop.code ||
      stop.station_code ||
      ''
    ).toUpperCase(),
    stationName:
      stop.station?.name ||
      stop.stationName ||
      stop.name ||
      stop.station_name ||
      'Unknown',
    distanceFromOrigin: stop.distance ?? stop.distanceFromOrigin ?? 0,
  }));

  const trainName =
    routeData?.data?.train?.name ||
    routeData?.data?.trainName ||
    routeData?.trainName ||
    routeData?.name ||
    `Train ${normTrainNumber}`;

  const boardingIndex = stations.findIndex(
    (station) => station.stationCode === normBoarding
  );
  if (boardingIndex === -1) {
    return res.status(422).json({
      success: false,
      error: {
        code: 'STATION_NOT_ON_ROUTE',
        message: `${normBoarding} is not a station on this train's route`,
      },
    });
  }

  const destinationIndex = stations.findIndex(
    (station) => station.stationCode === normDestination
  );
  if (destinationIndex === -1) {
    return res.status(422).json({
      success: false,
      error: {
        code: 'STATION_NOT_ON_ROUTE',
        message: `${normDestination} is not a station on this train's route`,
      },
    });
  }

  if (destinationIndex <= boardingIndex) {
    const actualOrigin = stations[0].stationCode;
    const actualDestination = stations[stations.length - 1].stationCode;
    return res.status(422).json({
      success: false,
      error: {
        code: 'WRONG_DIRECTION',
        message: `This train travels from ${actualOrigin} to ${actualDestination} — please check your boarding and destination stations are in the right order`,
      },
    });
  }

  // ── Step 3: Check in-memory calendar cache ────────────────────────────────
  // Keyed by train + boarding + destination + class + quota (NOT by date)
  const calendarCacheKey = cache.buildCalendarKey(
    normTrainNumber,
    normBoarding,
    normDestination,
    normClassCode,
    normQuotaCode
  );

  let normalizedCalendar = null;
  const cachedCalendarData = cache.get(calendarCacheKey);

  if (
    cachedCalendarData &&
    Array.isArray(cachedCalendarData.calendar) &&
    cachedCalendarData.calendar.some((entry) => entry.date === date)
  ) {
    console.log(`[cache hit] Calendar for ${calendarCacheKey}`);
    normalizedCalendar = cachedCalendarData.calendar;
  } else {
    // ── Step 4: Call RailRadar seats endpoint ONCE ─────────────────────────
    console.log(
      `[upstream call] Fetching calendar for ${normTrainNumber} (${normBoarding} → ${normDestination})`
    );
    let availabilityResponse;
    try {
      availabilityResponse = await getSeatsAvailability(
        normTrainNumber,
        normBoarding,
        normDestination,
        date,
        normClassCode,
        normQuotaCode
      );
    } catch (seatsError) {
      return handleUpstreamError(res, seatsError, normTrainNumber);
    }

    const rawCalendar = availabilityResponse?.data?.calendar;
    if (!Array.isArray(rawCalendar) || rawCalendar.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'DATE_OUT_OF_RANGE',
          message: 'Availability is only visible for roughly the next 14 days.',
        },
      });
    }

    normalizedCalendar = rawCalendar.map(normalizeCalendarEntry);

    // Cache the full normalized calendar for 5 minutes
    cache.set(calendarCacheKey, {
      trainName,
      calendar: normalizedCalendar,
    });
    console.log(
      `[cache set] Calendar cached (${normalizedCalendar.length} dates) under ${calendarCacheKey}`
    );
  }

  // ── Step 5: Locate requested date in the calendar ─────────────────────────
  const requested = normalizedCalendar.find((entry) => entry.date === date);

  if (!requested) {
    // If the requested date is outside the calendar window, return clear error
    return res.status(400).json({
      success: false,
      error: {
        code: 'DATE_OUT_OF_RANGE',
        message: 'Availability is only visible for roughly the next 14 days.',
      },
    });
  }

  // ── Step 6: Compute nearest confirmed dates ──────────────────────────────
  let nearest = null;
  let nearestBefore = null;
  let nearestAfter = null;
  let noConfirmedInWindow = false;
  let earlierStationOptions = null;

  if (requested.isConfirmed) {
    // Confirmed on user's exact date!
    noConfirmedInWindow = false;
  } else {
    // Collect all confirmed dates in the calendar window
    const confirmedDates = normalizedCalendar.filter((entry) => entry.isConfirmed);

    if (confirmedDates.length === 0) {
      // No date in the ~14-day window is confirmed at this boarding station
      noConfirmedInWindow = true;
    } else {
      noConfirmedInWindow = false;
      const todayStr = getTodayIstString();

      // "nearestBefore": closest earlier confirmed date that is not in the past
      const earlierConfirmed = confirmedDates
        .filter((entry) => entry.date < date && entry.date >= todayStr)
        .sort((a, b) => b.date.localeCompare(a.date)); // descending: closest earlier date first

      if (earlierConfirmed.length > 0) {
        const closestEarlier = earlierConfirmed[0];
        const offsetDays = daysDiff(closestEarlier.date, date); // negative integer
        nearestBefore = {
          ...closestEarlier,
          daysFromRequested: offsetDays,
        };
      }

      // "nearestAfter": closest later confirmed date
      const laterConfirmed = confirmedDates
        .filter((entry) => entry.date > date)
        .sort((a, b) => a.date.localeCompare(b.date)); // ascending: closest later date first

      if (laterConfirmed.length > 0) {
        const closestLater = laterConfirmed[0];
        const offsetDays = daysDiff(closestLater.date, date); // positive integer
        nearestAfter = {
          ...closestLater,
          daysFromRequested: offsetDays,
        };
      }

      // "nearest": whichever is closer in days to requested date (tie goes to earlier date)
      if (nearestBefore && nearestAfter) {
        const distBefore = Math.abs(nearestBefore.daysFromRequested);
        const distAfter  = Math.abs(nearestAfter.daysFromRequested);
        nearest = (distBefore <= distAfter) ? nearestBefore : nearestAfter;
      } else if (nearestBefore) {
        nearest = nearestBefore;
      } else if (nearestAfter) {
        nearest = nearestAfter;
      } else {
        nearest = null;
      }
    }
  }

  // ── Step 7: Fallback scan (differentiator) ────────────────────────────────
  // If no confirmed seats in the entire calendar window for the boarding station,
  // scan earlier candidate stations on the route (at most 5 candidate stations)
  // to find up to 3 earlier station confirmed options.
  if (noConfirmedInWindow) {
    console.log(
      `[fallback] noConfirmedInWindow triggered for ${normBoarding} — scanning earlier stations`
    );

    // Candidates = stations strictly before boarding station
    const candidateStations = stations.slice(0, boardingIndex);
    // Reverse so nearest-to-boarding station comes first, capped at 5 to protect API quota
    const candidatesNearestFirst = [...candidateStations].reverse().slice(0, 5);

    const foundStationOptions = [];

    for (const candidate of candidatesNearestFirst) {
      const candidateCacheKey = cache.buildCalendarKey(
        normTrainNumber,
        candidate.stationCode,
        normDestination,
        normClassCode,
        normQuotaCode
      );

      let candidateCalendar = null;
      const cachedCandidate = cache.get(candidateCacheKey);

      if (cachedCandidate && Array.isArray(cachedCandidate.calendar)) {
        candidateCalendar = cachedCandidate.calendar;
      } else {
        try {
          const candidateResp = await getSeatsAvailability(
            normTrainNumber,
            candidate.stationCode,
            normDestination,
            date,
            normClassCode,
            normQuotaCode
          );

          if (Array.isArray(candidateResp?.data?.calendar)) {
            candidateCalendar = candidateResp.data.calendar.map(
              normalizeCalendarEntry
            );
            cache.set(candidateCacheKey, {
              trainName,
              calendar: candidateCalendar,
            });
          }
        } catch (candError) {
          console.warn(
            `[fallback warn] Could not fetch calendar for candidate ${candidate.stationCode}: ${candError.message}`
          );
          continue;
        }
      }

      if (!candidateCalendar) continue;

      // Find all confirmed dates for this candidate station
      const candConfirmed = candidateCalendar.filter((entry) => entry.isConfirmed);
      if (candConfirmed.length > 0) {
        // Pick the confirmed date closest to the requested date
        const sortedByProximity = [...candConfirmed].sort(
          (a, b) =>
            Math.abs(daysDiff(a.date, date)) - Math.abs(daysDiff(b.date, date))
        );
        const bestDateEntry = sortedByProximity[0];

        foundStationOptions.push({
          stationCode: candidate.stationCode,
          stationName: candidate.stationName,
          date: bestDateEntry.date,
          availableSeats: bestDateEntry.availableSeats,
          distanceFromRequestedDays: Math.abs(daysDiff(bestDateEntry.date, date)),
        });
      }
    }

    // Sort options: nearest-to-requested-date first, and pick top 3
    foundStationOptions.sort(
      (a, b) => a.distanceFromRequestedDays - b.distanceFromRequestedDays
    );

    earlierStationOptions = foundStationOptions.slice(0, 3).map((opt) => ({
      stationCode: opt.stationCode,
      stationName: opt.stationName,
      date: opt.date,
      availableSeats: opt.availableSeats,
    }));
  }

  // ── Step 8: Return structured response ───────────────────────────────────
  return res.json({
    success: true,
    trainNumber: normTrainNumber,
    trainName,
    boardingStation: normBoarding,
    destination: normDestination,
    date,
    classCode: normClassCode,
    requested,
    nearest,
    nearestBefore,
    nearestAfter,
    noConfirmedInWindow,
    earlierStationOptions,
    calendar: normalizedCalendar,
  });
});

module.exports = router;
