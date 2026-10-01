'use strict';
const { store } = require('../../../packages/core/server/store');
const { createAnalyticsEngine } = require('../../../packages/core/server/analytics-core');

const EVENTS = Object.freeze([
  'install',
  'onboarding_done',
  'lesson_completed',
  'day_completed',
  'paywall_shown.course',
  'paywall_shown.today',
  'paywall_shown.talk',
  'paywall_shown.other',
  'talk_started',
  'purchase_started.course',
  'purchase_started.plus',
  'purchase_started.other',
  'purchase_completed.course',
  'purchase_completed.plus',
  'purchase_completed.other'
]);
const engine = createAnalyticsEngine({store, events:EVENTS});

module.exports = {
  EVENTS,
  recordAnalytics: engine.recordAnalytics,
  removeAnalyticsDevice: engine.removeAnalyticsDevice,
  analyticsStats: engine.analyticsStats
};
