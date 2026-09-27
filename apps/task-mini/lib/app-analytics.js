'use strict';
const { store } = require('../../../packages/core/server/store');
const { createAnalyticsEngine } = require('../../../packages/core/server/analytics-core');

const EVENTS = Object.freeze(['install', 'task_created', 'task_completed']);
const engine = createAnalyticsEngine({store, events:EVENTS});

module.exports = {
  EVENTS,
  recordAnalytics: engine.recordAnalytics,
  removeAnalyticsDevice: engine.removeAnalyticsDevice,
  analyticsStats: engine.analyticsStats
};
