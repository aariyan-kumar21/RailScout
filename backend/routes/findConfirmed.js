/**
 * findConfirmed.js — Route handler for GET /api/find-confirmed
 *
 * This is the heart of RailScout.
 *
 * ─── PROBLEM ────────────────────────────────────────────────────────────────
 * A train may show WAITLISTED from a traveller's boarding station, but seats
 * could be AVAILABLE from an earlier station on the same route (because quota
 * is allocated per boarding point).  There is no UI on IRCTC that surfaces
 * this automatically.
 *
 * ─── SOLUTION ───────────────────────────────────────────────────────────────
 * Given (trainNumber, boardingStation, destination, date, classCode):
 *   1. Fetch the train's full ordered route (origin → terminus).
 *   2. Identify the boarding station's position in that route.
 *   3. Build a candidate list: every station between the train's origin and
 *      the boarding station (inclusive), ordered nearest-to-boarding first.
 *   4. For each candidate, call the seats API with (candidate → destination).
 *   5. Return the ranked results so the user can board from the nearest
 *      station that offers a confirmed seat.
 *
 * ─── SCHEMA ─────────────────────────────────────────────────────────────────
 * Request / response shapes are defined in SCHEMA.md §1.  Do not change field
 * names without updating SCHEMA.md first (RULES.md §7).
 */

const express = require('express');
const { getTrainRoute, getSeatsAvailability } = require('../services/railRadar');
const { parseAvailability } = require('../utils/parseAvailability');
const cache = require('../services/cache');

const router = express.Router();

// ---------------------------------------------------------------------------
// GET /api/find-confirmed
// ---------------------------------------------------------------------------

router.get('/', async (req, res) => {
  // ── Step 1: Validate required query parameters ───────────────────────────
  // All five params are mandatory (quotaCode defaults to "GN").
  const {
    trainNumber,
    boardingStation,
    destination,
    date,
    classCode,
    quotaCode = 'GN',
  } = req.query;

  if (!trainNumber) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_PARAMS', message: 'Please enter a train number' } });
  }
  if (!boardingStation) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_PARAMS', message: 'Please enter a boarding station' } });
  }
  if (!destination) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_PARAMS', message: 'Please enter a destination' } });
  }
  if (!date) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_PARAMS', message: 'Please select a journey date' } });
  }
  if (!classCode) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_PARAMS', message: 'Please select a class' } });
  }

  if (isNaN(Date.parse(date))) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_DATE', message: 'Please enter a valid date' } });
  }

  const validClasses = ['1A', '2A', '3A', 'SL', 'CC', '2S'];
  if (!validClasses.includes(classCode.toUpperCase())) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_CLASS', message: 'Please select a valid class' } });
  }

  if (boardingStation.toUpperCase() === destination.toUpperCase()) {
    return res.status(400).json({ success: false, error: { code: 'SAME_STATIONS', message: "Boarding station and destination can't be the same" } });
  }

  // Normalise to upper-case so "kota" and "KOTA" both work
  const normBoarding     = boardingStation.toUpperCase();
  const normDestination  = destination.toUpperCase();
  const normTrainNumber  = trainNumber.trim();
  const normClassCode    = classCode.toUpperCase();
  const normQuotaCode    = quotaCode.toUpperCase();

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

  // ── Step 2: Check the in-memory cache ────────────────────────────────────
  const cacheKey = cache.buildKey(
    normTrainNumber,
    normBoarding,
    normDestination,
    date,
    normClassCode,
    normQuotaCode
  );
  const cached = cache.get(cacheKey);

  if (cached) {
    console.log(`[cache hit] ${cacheKey}`);
    return res.json({
      success: true,
      trainNumber: normTrainNumber,
      trainName: cached.trainName,
      boardingStation: normBoarding,
      destination: normDestination,
      date,
      classCode: normClassCode,
      results: cached.results,
    });
  }

  // ── Step 3: Fetch the train's full route from RailRadar ──────────────────
  // The route endpoint returns an ordered array of stations: origin → terminus.
  // We need this to know which stations come *before* the boarding station.
  let routeData;
  try {
    routeData = await getTrainRoute(normTrainNumber);
  } catch (error) {
    return handleUpstreamError(res, error, normTrainNumber);
  }

  // Documented RailRadar response format:
  // - routeData.data.route: Array<{ sequence, station: { code, name }, arrival, departure, distance, isHalt }>
  // - routeData.data.train: { number, name, type, source, destination, distance, totalHalts }
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

  // Build a clean, predictable station list using the documented schema
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

  // ── Step 4: Locate the boarding station in the route ─────────────────────
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

  // ── Step 5: Locate the destination station in the route ──────────────────
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

  // ── Step 6: Build the candidate list ─────────────────────────────────────
  // Candidates = all stations from the train's ORIGIN up to and including the
  // BOARDING station.  These are the stations where the user could board
  // instead, potentially getting a confirmed seat because the quota was not
  // yet exhausted at that earlier boarding point.
  //
  // stations[0 .. boardingIndex] (inclusive slice)
  const candidateStations = stations.slice(0, boardingIndex + 1);

  // ── Step 7: Reverse so nearest-to-boarding station comes first ────────────
  // Travellers want the option closest to their actual boarding city first,
  // because that minimises the extra travel required.
  const candidatesNearestFirst = [...candidateStations].reverse();

  // ── Step 8: For each candidate, call the seats API ───────────────────────
  // We fire these sequentially (not in parallel) to be polite to the
  // RailRadar free tier (1,000 req/month).  If the list is short this is fine;
  // if we later need speed we can add a concurrency limit (e.g. p-limit).
  console.log(
    `[scan] Train ${normTrainNumber} | ${candidatesNearestFirst.length} candidate station(s) to check`
  );

  const allResults = [];

  for (const candidate of candidatesNearestFirst) {
    const stopsBeforeBoarding = boardingIndex - stations.findIndex(
      (s) => s.stationCode === candidate.stationCode
    );

    let availabilityData;
    try {
      availabilityData = await getSeatsAvailability(
        normTrainNumber,
        candidate.stationCode,
        normDestination,
        date,
        normClassCode,
        normQuotaCode
      );
    } catch (error) {
      // Log the per-station error but continue scanning other candidates.
      // We mark this station as UNKNOWN rather than failing the whole request.
      console.error(
        `[warn] Could not fetch availability for ${candidate.stationCode}: ${error.message}`
      );
      allResults.push({
        stationCode:        candidate.stationCode,
        stationName:        candidate.stationName,
        distanceFromOrigin: candidate.distanceFromOrigin,
        stopsBeforeBoarding,
        availabilityStatus: 'UNKNOWN',
        isConfirmed:        false,
        availabilityType:   'UNKNOWN',
        availableSeats:     null,
        waitlistNumber:     null,
        waitlistType:       null,
      });
      continue;
    }

    // ── Step 9: Parse the availability entry for the requested date ────────
    try {
      const parsed = parseAvailability(availabilityData, date);
      allResults.push({
        stationCode:        candidate.stationCode,
        stationName:        candidate.stationName,
        distanceFromOrigin: candidate.distanceFromOrigin,
        stopsBeforeBoarding,
        ...parsed, // availabilityStatus, isConfirmed, availabilityType, availableSeats, waitlistNumber, waitlistType
      });
    } catch (parseError) {
      console.error(
        `[warn] Could not parse availability for ${candidate.stationCode}: ${parseError.message}`
      );
      allResults.push({
        stationCode:        candidate.stationCode,
        stationName:        candidate.stationName,
        distanceFromOrigin: candidate.distanceFromOrigin,
        stopsBeforeBoarding,
        availabilityStatus: 'UNKNOWN',
        isConfirmed:        false,
        availabilityType:   'UNKNOWN',
        availableSeats:     null,
        waitlistNumber:     null,
        waitlistType:       null,
      });
    }
  }

  // ── Step 9b: Top-level check for dates outside forecast window ───────────
  const allOutsideForecast = allResults.length > 0 && allResults.every(
    (r) => r.availabilityStatus === 'No forecast data — try a date within the next ~14 days'
  );

  if (allOutsideForecast) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'DATE_OUT_OF_RANGE',
        message: 'Live availability is only available for dates within the next ~14 days',
      },
    });
  }

  // ── Step 10: Cache the full scan results, then respond ───────────────────
  cache.set(cacheKey, { trainName, results: allResults });

  console.log(`[cache set] ${cacheKey} (${allResults.length} station(s))`);

  return res.json({
    success: true,
    trainNumber: normTrainNumber,
    trainName,
    boardingStation: normBoarding,
    destination: normDestination,
    date,
    classCode: normClassCode,
    results: allResults,
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Map upstream (RailRadar API) errors to our SCHEMA.md error codes and
 * send an appropriate HTTP response.
 *
 * @param {import('express').Response} res
 * @param {Error} error        - Enriched error from railRadar.js
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
      message: "Couldn't fetch live data right now — RailRadar's service may be temporarily unavailable. Please try again in a moment.",
    },
  });
}

module.exports = router;
