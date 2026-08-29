/**
 * cache.js — Simple in-memory TTL cache.
 *
 * Cache key format:
 *   `${trainNumber}_${boardingStation}_${destination}_${date}_${classCode}_${quotaCode}`
 *
 * TTL: 5 minutes (300,000 ms).
 */

const TTL_MS = 5 * 60 * 1000; // 5 minutes in milliseconds

// Internal store: key → { timestamp: number, data: any }
const store = new Map();

/**
 * Build the canonical cache key from all query parameters that define the search.
 *
 * @param {string} trainNumber
 * @param {string} boardingStation
 * @param {string} destination
 * @param {string} date
 * @param {string} classCode
 * @param {string} quotaCode
 * @returns {string}
 */
function buildKey(trainNumber, boardingStation, destination, date, classCode, quotaCode) {
  return `${trainNumber}_${boardingStation}_${destination}_${date}_${classCode}_${quotaCode}`;
}

/**
 * Check whether a stored entry has exceeded the TTL.
 *
 * @param {{ timestamp: number }} entry
 * @returns {boolean}
 */
function isExpired(entry) {
  return Date.now() - entry.timestamp > TTL_MS;
}

/**
 * Retrieve a cached value by key.
 * Returns null if the key is missing or the entry has expired (and prunes it).
 *
 * @param {string} key
 * @returns {any|null}
 */
function get(key) {
  const entry = store.get(key);
  if (!entry) return null;

  if (isExpired(entry)) {
    store.delete(key); // prune stale entry
    return null;
  }

  return entry.data;
}

/**
 * Store a value under the given key with the current timestamp.
 *
 * @param {string} key
 * @param {any}    data
 */
function set(key, data) {
  store.set(key, { timestamp: Date.now(), data });
}

/**
 * Clear all cache entries.
 */
function clear() {
  store.clear();
}

module.exports = { buildKey, get, set, clear };
