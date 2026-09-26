'use strict';
/* Product analytics taxonomy. Add the product's funnel events here. */
const { store } = require('../../server/store');
const { createAnalyticsEngine } = require('../../server/analytics-core');

const EVENTS = Object.freeze(['install', 'onboarding_complete', 'account_created', 'premium_opened', 'purchase_started']);
const engine = createAnalyticsEngine({store, events:EVENTS});

module.exports = {
  EVENTS,
  recordAnalytics: engine.recordAnalytics,
  removeAnalyticsDevice: engine.removeAnalyticsDevice,
  analyticsStats: engine.analyticsStats
};
