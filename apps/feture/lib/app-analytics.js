'use strict';
const { store } = require('../../../packages/core/server/store');
const { createAnalyticsEngine } = require('../../../packages/core/server/analytics-core');

// FetUre does not collect anonymous per-device install/retention history.
// O03 product activity is server-derived with no device or account keys.
const EVENTS = Object.freeze([]);
const engine = createAnalyticsEngine({store, events:EVENTS});

module.exports = {
  EVENTS,
  recordAnalytics: engine.recordAnalytics,
  removeAnalyticsDevice: engine.removeAnalyticsDevice,
  analyticsStats: engine.analyticsStats
};
