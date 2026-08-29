/**
 * parseAvailability.js — Extracts and normalises seat availability for a specific
 * journey date from RailRadar's /seats endpoint response.
 *
 * Real RailRadar response structure:
 * {
 *   "success": true,
 *   "data": {
 *     "calendar": [
 *       {
 *         "date": "2026-09-05",
 *         "status": "RLWL8/WL2",
 *         "statusCode": "WAITLIST",
 *         "isAvailable": false,
 *         "waitlistNumber": 2,
 *         "waitlistType": "RLWL"
 *       },
 *       {
 *         "date": "2026-09-08",
 *         "status": "AVAILABLE-0004",
 *         "statusCode": "AVAILABLE",
 *         "isAvailable": true,
 *         "availableSeats": 4
 *       }
 *     ]
 *   },
 *   "meta": { ... }
 * }
 */

/**
 * @typedef {Object} ParsedAvailability
 * @property {string}  availabilityStatus - e.g. "AVAILABLE-0004", "RLWL8/WL2"
 * @property {boolean} isConfirmed        - Directly from entry.isAvailable
 * @property {string}  availabilityType   - Directly from entry.statusCode ("AVAILABLE", "WAITLIST", "RAC", etc.)
 */

/**
 * Parse seat availability from RailRadar's calendar array for a given journey date.
 *
 * @param {Object} availabilityResponse - Raw response from RailRadar /seats endpoint
 * @param {string} journeyDate          - YYYY-MM-DD target date
 * @returns {ParsedAvailability}
 * @throws {Error} If calendar is missing or target date is outside forecast range
 */
function parseAvailability(availabilityResponse, journeyDate) {
  const calendar = availabilityResponse?.data?.calendar;

  if (!Array.isArray(calendar) || calendar.length === 0) {
    const error = new Error('No calendar data available in RailRadar response');
    error.code = 'NO_CALENDAR_DATA';
    throw error;
  }

  const entry = calendar.find((item) => item.date === journeyDate);

  if (!entry) {
    const error = new Error(
      `Journey date ${journeyDate} is outside RailRadar's available forecast range`
    );
    error.code = 'DATE_OUT_OF_RANGE';
    throw error;
  }

  return {
    availabilityStatus: entry.status || 'UNKNOWN',
    isConfirmed: Boolean(entry.isAvailable),
    availabilityType: entry.statusCode || (entry.isAvailable ? 'AVAILABLE' : 'WAITLIST'),
  };
}

module.exports = { parseAvailability };
