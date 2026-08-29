/**
 * server.js — RailScout Express entry point
 *
 * Responsibility: bootstrap dotenv, wire up middleware and routes, start
 * the HTTP listener.  All business logic lives in /routes and /services.
 *
 * RULES.md §3: The RAILRADAR_API_KEY is loaded here from .env and is
 * NEVER sent in any response to the client.
 */

'use strict';

// Load environment variables from .env before any other module reads them
require('dotenv').config();

const express = require('express');
const cors    = require('cors');

const findConfirmedRouter = require('./routes/findConfirmed');

const app  = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

/**
 * CORS — required so the Chrome extension popup (a different origin) can
 * call this backend via fetch().  In production you would lock this down to
 * the extension's chrome-extension:// origin; for local dev we allow all.
 */
app.use(cors());

// Parse JSON request bodies (not strictly needed for query-param-only routes,
// but good practice for future POST endpoints)
app.use(express.json());

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// Health check — useful for confirming the server is alive without triggering
// any RailRadar API calls or cache operations.
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'railscout-backend' });
});

// Primary endpoint — station availability scanner
app.use('/api/find-confirmed', findConfirmedRouter);

// 404 catch-all for any route not explicitly handled above
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Endpoint not found. Available: GET /api/find-confirmed',
    },
  });
});

// ---------------------------------------------------------------------------
// Global error handler
// ---------------------------------------------------------------------------
// Express calls this when next(error) is used or an async route throws.
// Keeps unhandled errors from leaking stack traces to the client.
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[unhandled error]', err);
  res.status(500).json({
    success: false,
    error: {
      code: 'UPSTREAM_API_ERROR',
      message: 'An unexpected server error occurred.',
    },
  });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

app.listen(PORT, () => {
  console.log(`RailScout backend running on http://localhost:${PORT}`);
  console.log(`  Health check : GET http://localhost:${PORT}/health`);
  console.log(`  Main endpoint: GET http://localhost:${PORT}/api/find-confirmed`);
});
