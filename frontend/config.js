/**
 * config.js — Centralized API Configuration for RailScout Frontend
 *
 * Directs frontend requests to the deployed production backend on Render:
 * https://railscout-backend.onrender.com
 *
 * Automatically detects local vs production hosting:
 * - Deployed environments (Render, Vercel, Netlify, GitHub Pages, etc.) use the production backend.
 * - Localhost developers can either talk to the local backend on port 5000/3000
 *   or override the endpoint anytime via `window.RAIL_SCOUT_BACKEND_URL`.
 */

'use strict';

(function (window) {
  // Production deployed backend URL
  const PRODUCTION_BACKEND_URL = 'https://railscout-backend.onrender.com';

  // Local development backend URL
  const LOCAL_BACKEND_URL = 'http://localhost:5000';

  /**
   * Determine the appropriate backend base URL:
   * 1. Explicit runtime override: window.RAIL_SCOUT_BACKEND_URL
   * 2. If the frontend is actively being served by a local backend instance on port 3000 or 5000
   * 3. Default for all deployed environments and static preview hosts: PRODUCTION_BACKEND_URL
   */
  const isLocalBackendHost =
    Boolean(window.location) &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') &&
    (window.location.port === '3000' || window.location.port === '5000');

  const BASE_URL =
    window.RAIL_SCOUT_BACKEND_URL ||
    (isLocalBackendHost ? `${window.location.origin}` : PRODUCTION_BACKEND_URL);

  window.API_CONFIG = {
    BASE_URL: BASE_URL,
    PRODUCTION_BACKEND_URL: PRODUCTION_BACKEND_URL,
    LOCAL_BACKEND_URL: LOCAL_BACKEND_URL,
    ENDPOINTS: {
      HEALTH: `${BASE_URL}/health`,
      FIND_DATES: `${BASE_URL}/api/find-dates`,
      FIND_CONFIRMED: `${BASE_URL}/api/find-confirmed`,
    },
    IRCTC_URL: 'https://www.irctc.co.in',
  };
})(window);

