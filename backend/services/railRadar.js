/**
 * railRadar.js — Thin axios wrapper around the RailRadar API.
 *
 * BASE URL : https://api.railradar.in/v1  (from TECH_STACK.md)
 * AUTH     : x-api-key header loaded from process.env.RAILRADAR_API_KEY
 *
 * IMPORTANT (RULES.md §3): The API key is ONLY read here, in the backend.
 * It is never returned in any API response and never reaches the extension.
 *
 * Endpoints used:
 *   GET /v1/trains/{number}
 *     → Full route/timetable — ordered list of stations from origin to terminus.
 *
 *   GET /v1/trains/{number}/seats
 *     ?source=CODE&destination=CODE&journeyDate=YYYY-MM-DD
 *     &classCode=CODE&quotaCode=GN
 *     → Seat availability status between two specific stations.
 */

const axios = require('axios');

const BASE_URL = 'https://api.railradar.in/v1';

/**
 * Returns a pre-configured axios instance that attaches the API key header
 * to every request.  We build it lazily so that dotenv has time to load
 * before the module is first used.
 *
 * @returns {import('axios').AxiosInstance}
 */
function createApiClient() {
  const apiKey = process.env.RAILRADAR_API_KEY;

  if (!apiKey) {
    // Fail loudly at startup rather than silently sending unauthenticated requests
    throw new Error(
      'RAILRADAR_API_KEY is not set. Copy .env.example to .env and add your key.'
    );
  }

  return axios.create({
    baseURL: BASE_URL,
    timeout: 10_000, // 10 s — generous enough for slow upstream; fail fast beyond this
    headers: {
      // RailRadar requires Bearer token auth: https://api.railradar.in docs
      // Format: "Authorization: Bearer rr_live_YOUR_KEY"
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch the full route/timetable for a train.
 *
 * RailRadar returns an ordered array of station objects from the train's
 * origin to its terminus.  Each object is expected to have at minimum:
 *   { stationCode, stationName, distanceFromOrigin, stationIndex / serialNumber }
 *
 * @param {string} trainNumber - e.g. "12952"
 * @returns {Promise<Object>} Raw response data from RailRadar
 * @throws {Error} On HTTP error or network failure (caller handles error codes)
 */
async function getTrainRoute(trainNumber, haltsOnly = true) {
  const client = createApiClient();

  try {
    const response = await client.get(`/trains/${trainNumber}`, {
      params: { haltsOnly },
    });
    console.log(
      `[RailRadar] Raw getTrainRoute(${trainNumber}) response:\n`,
      JSON.stringify(response.data, null, 2)
    );
    return response.data;
  } catch (error) {
    // Re-throw with a tagged message so the route handler can classify it
    throw enrichAxiosError(error, `getTrainRoute(${trainNumber})`);
  }
}

/**
 * Fetch seat availability between two stations for a specific class and date.
 *
 * The `quotaCode` defaults to "GN" (General quota) as per SCHEMA.md §1.
 *
 * @param {string} trainNumber
 * @param {string} source        - Station code (boarding point for this check)
 * @param {string} destination   - Final destination station code
 * @param {string} journeyDate   - YYYY-MM-DD
 * @param {string} classCode     - e.g. "3A", "SL", "1A"
 * @param {string} [quotaCode="GN"]
 * @returns {Promise<Object>} Raw response data from RailRadar
 * @throws {Error} On HTTP error or network failure
 */
async function getSeatsAvailability(
  trainNumber,
  source,
  destination,
  journeyDate,
  classCode,
  quotaCode = 'GN'
) {
  const client = createApiClient();

  try {
    const response = await client.get(`/trains/${trainNumber}/seats`, {
      params: { source, destination, journeyDate, classCode, quotaCode },
    });
    console.log(
      `[RailRadar] Raw getSeatsAvailability(${trainNumber}, ${source}→${destination}) response:\n`,
      JSON.stringify(response.data, null, 2)
    );
    return response.data;
  } catch (error) {
    console.error(
      `[RailRadar Error] getSeatsAvailability(${trainNumber}, ${source}→${destination}):`,
      error.response?.data || error.message
    );
    throw enrichAxiosError(
      error,
      `getSeatsAvailability(${trainNumber}, ${source}→${destination})`
    );
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Attach useful context to axios errors before re-throwing.
 * Preserves the original HTTP status so callers can map it to our error codes.
 *
 * @param {import('axios').AxiosError} error
 * @param {string} context - Human-readable label for the failing call
 * @returns {Error}
 */
function enrichAxiosError(error, context) {
  if (error.response) {
    // HTTP error (4xx / 5xx)
    const enriched = new Error(
      `RailRadar API error [${error.response.status}] during ${context}: ` +
        (error.response.data?.message || error.message)
    );
    enriched.httpStatus = error.response.status;
    enriched.upstreamData = error.response.data;
    return enriched;
  }

  if (error.request) {
    // Request sent but no response received (timeout, DNS failure, etc.)
    const enriched = new Error(
      `No response from RailRadar during ${context}: ${error.message}`
    );
    enriched.httpStatus = 503;
    return enriched;
  }

  // Something went wrong building the request itself
  return error;
}

module.exports = { getTrainRoute, getSeatsAvailability };
