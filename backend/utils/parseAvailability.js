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
 * @property {string}       availabilityStatus - e.g. "AVAILABLE-0004", "RLWL8/WL2"
 * @property {boolean}      isConfirmed        - Directly from entry.isAvailable
 * @property {string}       availabilityType   - Directly from entry.statusCode ("AVAILABLE", "WAITLIST", "RAC", etc.)
 * @property {number|null}  availableSeats     - Number of available seats when confirmed, else null
 * @property {number|null}  waitlistNumber     - Current waitlist position number, else null
 * @property {string|null}  waitlistType       - Waitlist quota type (e.g. "RLWL", "GNWL"), else null
 */

/**
 * Parse seat availability from RailRadar's calendar array for a given journey date.
 *
 * @param {Object} availabilityResponse - Raw response from RailRadar /seats endpoint
 * @param {string} journeyDate          - YYYY-MM-DD target date
 * @returns {ParsedAvailability}
 */
function parseAvailability(availabilityResponse, journeyDate) {
  const calendar = availabilityResponse?.data?.calendar;

  if (!Array.isArray(calendar) || calendar.length === 0) {
    return {
      availabilityStatus: 'No forecast data — try a date within the next ~14 days',
      isConfirmed: false,
      availabilityType: 'UNKNOWN',
      availableSeats: null,
      waitlistNumber: null,
      waitlistType: null,
    };
  }

  const entry = calendar.find((item) => item.date === journeyDate);

  if (!entry) {
    return {
      availabilityStatus: 'No forecast data — try a date within the next ~14 days',
      isConfirmed: false,
      availabilityType: 'UNKNOWN',
      availableSeats: null,
      waitlistNumber: null,
      waitlistType: null,
    };
  }

  const isConfirmed = Boolean(entry.isAvailable);
  const rawStatus = entry.status || 'UNKNOWN';
  const availabilityType = entry.statusCode || (isConfirmed ? 'AVAILABLE' : (rawStatus.includes('RAC') ? 'RAC' : 'WAITLIST'));

  // availableSeats: number or null (null when not confirmed)
  let availableSeats = null;
  if (isConfirmed) {
    if (typeof entry.availableSeats === 'number') {
      availableSeats = entry.availableSeats;
    } else if (rawStatus) {
      const match = rawStatus.match(/AVAILABLE[^\d]*(\d+)/i);
      if (match) {
        availableSeats = parseInt(match[1], 10);
      }
    }
  }

  // waitlistNumber: number or null
  let waitlistNumber = null;
  if (typeof entry.waitlistNumber === 'number') {
    waitlistNumber = entry.waitlistNumber;
  } else if (!isConfirmed && rawStatus) {
    // Current waitlist status after slash (e.g. "RLWL21/WL8" -> 8, "GNWL43/WL10" -> 10)
    const slashMatch = rawStatus.match(/\/(?:[A-Za-z]*WL)?(\d+)/i) || rawStatus.match(/\/(\d+)/);
    if (slashMatch) {
      waitlistNumber = parseInt(slashMatch[1], 10);
    } else {
      const wlMatch = rawStatus.match(/(?:^|[^A-Z])WL[^\d]*(\d+)/i) || rawStatus.match(/(\d+)/);
      if (wlMatch) {
        waitlistNumber = parseInt(wlMatch[1], 10);
      }
    }
  }

  // waitlistType: string or null (e.g. "RLWL", "GNWL")
  let waitlistType = null;
  if (entry.waitlistType) {
    waitlistType = String(entry.waitlistType).toUpperCase();
  } else if (!isConfirmed && rawStatus) {
    const typeMatch = rawStatus.match(/^([A-Z]+)WL/i) || rawStatus.match(/^([A-Z]+)/i);
    if (typeMatch && typeMatch[0] !== 'AVAILABLE' && typeMatch[0] !== 'RAC') {
      waitlistType = typeMatch[0].toUpperCase();
    }
  }

  return {
    availabilityStatus: rawStatus,
    isConfirmed,
    availabilityType,
    availableSeats,
    waitlistNumber,
    waitlistType,
  };
}

module.exports = { parseAvailability };
